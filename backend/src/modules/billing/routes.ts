import type { Express } from "express";
import { Prisma, type InvoiceStatus, type PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "../../lib/audit";
import type { AuthUser } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { calculateInvoice, deriveInvoiceState, fromMinor, moneyString, toMinor } from "../../lib/money";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const methods = ["CASH", "CARD", "UPI", "BANK_TRANSFER"] as const;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID", "REFUNDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const createBody = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  discount: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
  taxRatePercent: z.number().min(0).max(28).default(0),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(255),
        quantity: z.number().int().positive().max(1000),
        unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
      }),
    )
    .min(1)
    .max(30),
});

const paymentBody = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.enum(methods),
  reference: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "Payment reference can contain only letters, numbers, and hyphens"),
});

function scope(user: AuthUser): Prisma.InvoiceWhereInput {
  if (user.role === "PATIENT") {
    return { patient: { userId: user.id } };
  }
  return {};
}

function present(invoice: {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  balance: Prisma.Decimal;
  createdAt: Date;
  patient: { id: string; patientCode: string; firstName: string; lastName: string };
  lines?: Array<{ id: string; description: string; quantity: number; unitPrice: Prisma.Decimal; amount: Prisma.Decimal }>;
  payments?: Array<{ id: string; amount: Prisma.Decimal; method: PaymentMethod; reference: string; paidAt: Date }>;
  refunds?: Array<{ id: string; amount: Prisma.Decimal; reason: string; createdAt: Date }>;
}) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    subtotal: moneyString(invoice.subtotal),
    discount: moneyString(invoice.discount),
    tax: moneyString(invoice.tax),
    total: moneyString(invoice.total),
    balance: moneyString(invoice.balance),
    createdAt: invoice.createdAt.toISOString(),
    patientId: invoice.patient.id,
    patientCode: invoice.patient.patientCode,
    patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
    lines: invoice.lines?.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: moneyString(line.unitPrice),
      amount: moneyString(line.amount),
    })),
    payments: invoice.payments?.map((payment) => ({
      id: payment.id,
      amount: moneyString(payment.amount),
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt.toISOString(),
    })),
    refunds: invoice.refunds?.map((refund) => ({
      id: refund.id,
      amount: moneyString(refund.amount),
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
    })),
  };
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.invoice.findMany({ select: { invoiceNumber: true } });
  const current = rows.reduce((max, row) => {
    const value = Number(row.invoiceNumber.replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 1000);
  return `INV-${current + 1}`;
}

export function registerBillingRoutes(app: Express): void {
  app.get(
    "/api/invoices",
    authenticate,
    requirePermission("billing:read"),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      const paging = pageParams(query);
      const where: Prisma.InvoiceWhereInput = {
        ...scope(requireUser(req)),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { invoiceNumber: { contains: query.q } },
                { patient: { firstName: { contains: query.q } } },
                { patient: { lastName: { contains: query.q } } },
                { patient: { patientCode: { contains: query.q } } },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          include: { patient: true },
          orderBy: { createdAt: "desc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({ data: rows.map(present), page: paging.page, pageSize: paging.pageSize, total });
    }),
  );

  app.post(
    "/api/invoices",
    authenticate,
    requirePermission("billing:write"),
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body);
      const actor = requireUser(req);
      let priced;
      try {
        priced = calculateInvoice({
          lines: body.lines,
          discount: body.discount,
          taxRatePercent: body.taxRatePercent,
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Invalid invoice");
      }
      const subtotalMinor = toMinor(priced.subtotal);
      const discountMinor = toMinor(priced.discount);
      if (actor.role !== "ADMIN" && discountMinor > Math.floor(subtotalMinor * 0.1)) {
        throw new HttpError(403, "Discounts above 10 percent require an administrator");
      }
      const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
      if (!patient) {
        throw new HttpError(404, "Patient not found");
      }
      if (body.appointmentId) {
        const appointment = await prisma.appointment.findUnique({ where: { id: body.appointmentId } });
        if (!appointment || appointment.patientId !== patient.id) {
          throw new HttpError(400, "Appointment does not belong to this patient");
        }
      }
      const invoice = await prisma.$transaction(async (tx) => {
        return tx.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(tx),
            patientId: patient.id,
            appointmentId: body.appointmentId,
            status: "ISSUED",
            currency: "INR",
            subtotal: priced.subtotal,
            discount: priced.discount,
            tax: priced.tax,
            total: priced.total,
            balance: priced.balance,
            lines: { create: priced.lines },
          },
          include: { patient: true, lines: true, payments: true, refunds: true },
        });
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "INVOICE_CREATED",
        entityType: "Invoice",
        entityId: invoice.id,
        ipAddress: req.ip,
      });
      res.status(201).json(present(invoice));
    }),
  );

  app.get(
    "/api/invoices/:id",
    authenticate,
    requirePermission("billing:read"),
    asyncHandler(async (req, res) => {
      const invoice = await prisma.invoice.findFirst({
        where: { id: req.params.id, ...scope(requireUser(req)) },
        include: { patient: true, lines: true, payments: true, refunds: true },
      });
      if (!invoice) {
        throw new HttpError(404, "Invoice not found");
      }
      res.json(present(invoice));
    }),
  );

  app.post(
    "/api/invoices/:id/payments",
    authenticate,
    requirePermission("billing:write"),
    asyncHandler(async (req, res) => {
      const body = paymentBody.parse(req.body);
      const actor = requireUser(req);
      const amountMinor = toMinor(body.amount);
      if (amountMinor <= 0) {
        throw new HttpError(400, "Payment amount must be greater than zero");
      }
      const payment = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM Invoice WHERE id = ${req.params.id} FOR UPDATE`);
        const existingRef = await tx.payment.findUnique({ where: { reference: body.reference } });
        if (existingRef) {
          if (
            existingRef.invoiceId === req.params.id &&
            toMinor(existingRef.amount) === amountMinor &&
            existingRef.method === body.method
          ) {
            return existingRef;
          }
          throw new HttpError(409, "That payment reference has already been used");
        }
        const invoice = await tx.invoice.findUnique({
          where: { id: req.params.id },
          include: { payments: true, refunds: true },
        });
        if (!invoice) {
          throw new HttpError(404, "Invoice not found");
        }
        if (invoice.status === "VOID" || invoice.status === "REFUNDED") {
          throw new HttpError(400, "This invoice cannot accept a payment");
        }
        const paid = invoice.payments.reduce((sum, item) => sum + toMinor(item.amount), 0);
        const refunded = invoice.refunds.reduce((sum, item) => sum + toMinor(item.amount), 0);
        const state = deriveInvoiceState({
          totalMinor: toMinor(invoice.total),
          paidMinor: paid,
          refundedMinor: refunded,
          voided: false,
        });
        if (amountMinor > state.balanceMinor) {
          throw new HttpError(400, "Payment exceeds the outstanding balance");
        }
        const created = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: fromMinor(amountMinor),
            method: body.method,
            reference: body.reference,
          },
        });
        const next = deriveInvoiceState({
          totalMinor: toMinor(invoice.total),
          paidMinor: paid + amountMinor,
          refundedMinor: refunded,
          voided: false,
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { balance: fromMinor(next.balanceMinor), status: next.status },
        });
        return created;
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "PAYMENT_RECORDED",
        entityType: "Payment",
        entityId: payment.id,
        ipAddress: req.ip,
      });
      res.status(201).json({
        id: payment.id,
        amount: moneyString(payment.amount),
        method: payment.method,
        reference: payment.reference,
      });
    }),
  );

  app.post(
    "/api/invoices/:id/refunds",
    authenticate,
    requirePermission("billing:write"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          reason: z.string().trim().min(3).max(255),
          paymentId: z.string().min(1).optional(),
        })
        .parse(req.body);
      const actor = requireUser(req);
      if (actor.role !== "ADMIN") {
        throw new HttpError(403, "Only an administrator can issue a refund");
      }
      const amountMinor = toMinor(body.amount);
      if (amountMinor <= 0) {
        throw new HttpError(400, "Refund amount must be greater than zero");
      }
      const refund = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM Invoice WHERE id = ${req.params.id} FOR UPDATE`);
        const invoice = await tx.invoice.findUnique({
          where: { id: req.params.id },
          include: { payments: true, refunds: true },
        });
        if (!invoice) {
          throw new HttpError(404, "Invoice not found");
        }
        const paid = invoice.payments.reduce((sum, item) => sum + toMinor(item.amount), 0);
        const refunded = invoice.refunds.reduce((sum, item) => sum + toMinor(item.amount), 0);
        if (amountMinor > paid - refunded) {
          throw new HttpError(400, "Refund exceeds the net amount paid");
        }
        const created = await tx.refund.create({
          data: {
            invoiceId: invoice.id,
            paymentId: body.paymentId,
            amount: fromMinor(amountMinor),
            reason: body.reason,
          },
        });
        const next = deriveInvoiceState({
          totalMinor: toMinor(invoice.total),
          paidMinor: paid,
          refundedMinor: refunded + amountMinor,
          voided: false,
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { balance: fromMinor(next.balanceMinor), status: next.status },
        });
        return created;
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "REFUND_ISSUED",
        entityType: "Refund",
        entityId: refund.id,
        ipAddress: req.ip,
      });
      res.status(201).json({ id: refund.id, amount: moneyString(refund.amount) });
    }),
  );

  app.post(
    "/api/invoices/:id/void",
    authenticate,
    requirePermission("billing:write"),
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      if (actor.role !== "ADMIN") {
        throw new HttpError(403, "Only an administrator can void an invoice");
      }
      const invoice = await prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findUnique({
          where: { id: req.params.id },
          include: { payments: true },
        });
        if (!existing) {
          throw new HttpError(404, "Invoice not found");
        }
        if (existing.payments.length > 0) {
          throw new HttpError(400, "Refund payments before voiding this invoice");
        }
        return tx.invoice.update({
          where: { id: existing.id },
          data: { status: "VOID", balance: 0 },
          include: { patient: true, lines: true, payments: true, refunds: true },
        });
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "INVOICE_VOIDED",
        entityType: "Invoice",
        entityId: invoice.id,
        ipAddress: req.ip,
      });
      res.json(present(invoice));
    }),
  );
}
