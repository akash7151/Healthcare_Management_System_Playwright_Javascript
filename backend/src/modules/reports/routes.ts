import { existsSync, readFileSync } from "fs";
import path from "path";
import type { Express } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { moneyString, toMinor, fromMinor } from "../../lib/money";
import { prisma } from "../../lib/prisma";
import { zonedParts } from "../../lib/schedule";
import { asyncHandler } from "../../lib/http";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function bounds(from: string | undefined, to: string | undefined): { gte?: Date; lte?: Date } {
  const offset = "+05:30";
  return {
    gte: from ? new Date(`${from}T00:00:00${offset}`) : undefined,
    lte: to ? new Date(`${to}T23:59:59.999${offset}`) : undefined,
  };
}

function todayRange(): { gte: Date; lte: Date } {
  const today = zonedParts(new Date(), env.CLINIC_TIMEZONE).date;
  const range = bounds(today, today);
  return { gte: range.gte as Date, lte: range.lte as Date };
}

const BASE_MODULES = [
  { id: "foundation", name: "Foundation", status: "Verified" },
  { id: "authentication", name: "Authentication", status: "Implemented" },
  { id: "patients", name: "Patients", status: "Implemented" },
  { id: "doctors", name: "Doctors", status: "Implemented" },
  { id: "appointments", name: "Appointments", status: "Implemented" },
  { id: "records", name: "Medical records", status: "Implemented" },
  { id: "pharmacy", name: "Prescriptions and pharmacy", status: "Implemented" },
  { id: "billing", name: "Billing", status: "Implemented" },
  { id: "reports", name: "Reports and audit", status: "Implemented" },
  { id: "qa", name: "QA automation", status: "Implemented" },
] as const;

function moduleStatuses() {
  const file = path.join(process.cwd(), "verification-results.json");
  let verified: Record<string, string> = {};
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { modules?: Record<string, string> };
      verified = parsed.modules ?? {};
    } catch {
      verified = {};
    }
  }
  return BASE_MODULES.map((item) => ({
    ...item,
    status: verified[item.id] === "Verified" ? "Verified" : item.status,
  }));
}

function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? "";
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export function registerReportRoutes(app: Express): void {
  app.get(
    "/api/reports/dashboard",
    authenticate,
    asyncHandler(async (req, res) => {
      const query = rangeQuery.parse(req.query);
      const actor = requireUser(req);
      const span = bounds(query.from, query.to);
      const today = todayRange();
      const patientWhere = actor.role === "PATIENT" ? { userId: actor.id } : {};
      const appointmentWhere = actor.role === "PATIENT" ? { patient: { userId: actor.id } } : {};
      const doctorWhere = actor.role === "DOCTOR" && actor.doctorId ? { doctorId: actor.doctorId } : {};
      const invoiceWhere = actor.role === "PATIENT" ? { patient: { userId: actor.id } } : {};
      const canMoney = actor.permissions.includes("billing:read") || actor.permissions.includes("reports:read");
      const canPatients = actor.permissions.includes("patients:read");

      const [
        patients,
        registrations,
        activeDoctors,
        todayAppointments,
        upcomingAppointments,
        completedAppointments,
        cancelledAppointments,
        invoices,
      ] = await Promise.all([
        canPatients ? prisma.patient.count({ where: patientWhere }) : Promise.resolve(0),
        canPatients
          ? prisma.patient.count({
              where: {
                ...patientWhere,
                createdAt: { gte: span.gte, lte: span.lte },
              },
            })
          : Promise.resolve(0),
        prisma.doctor.count({ where: { active: true, user: { status: "ACTIVE" } } }),
        prisma.appointment.count({
          where: { ...appointmentWhere, ...doctorWhere, startsAt: { gte: today.gte, lte: today.lte } },
        }),
        prisma.appointment.count({
          where: {
            ...appointmentWhere,
            ...doctorWhere,
            startsAt: { gt: new Date() },
            status: { in: ["SCHEDULED", "CONFIRMED"] },
          },
        }),
        prisma.appointment.count({
          where: {
            ...appointmentWhere,
            ...doctorWhere,
            status: "COMPLETED",
            startsAt: { gte: span.gte, lte: span.lte },
          },
        }),
        prisma.appointment.count({
          where: {
            ...appointmentWhere,
            ...doctorWhere,
            status: "CANCELLED",
            startsAt: { gte: span.gte, lte: span.lte },
          },
        }),
        canMoney
          ? prisma.invoice.findMany({
              where: { ...invoiceWhere, status: { not: "VOID" }, createdAt: { gte: span.gte, lte: span.lte } },
              select: { status: true, total: true, balance: true },
            })
          : Promise.resolve([]),
      ]);

      const paidMinor = invoices.reduce((sum, invoice) => sum + toMinor(invoice.total) - toMinor(invoice.balance), 0);
      const outstandingMinor = invoices
        .filter((invoice) => invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID" || invoice.status === "DRAFT")
        .reduce((sum, invoice) => sum + toMinor(invoice.balance), 0);
      const pendingInvoices = invoices.filter(
        (invoice) => invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID" || invoice.status === "DRAFT",
      ).length;

      const activity = await prisma.auditLog.findMany({
        where: actor.permissions.includes("audit:read") ? {} : { actorUserId: actor.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { actor: { select: { firstName: true, lastName: true } } },
      });

      res.json({
        patients,
        registrations,
        activeDoctors: actor.role === "PATIENT" ? null : activeDoctors,
        todayAppointments,
        upcomingAppointments,
        completedAppointments,
        cancelledAppointments,
        pendingInvoices: canMoney ? pendingInvoices : null,
        paidAmount: canMoney ? moneyString(fromMinor(paidMinor)) : null,
        outstandingAmount: canMoney ? moneyString(fromMinor(outstandingMinor)) : null,
        recentActivity: activity.map((item) => ({
          id: item.id,
          action: item.action,
          entityType: item.entityType,
          entityId: item.entityId,
          outcome: item.outcome,
          createdAt: item.createdAt.toISOString(),
          actorName: item.actor ? `${item.actor.firstName} ${item.actor.lastName}` : "System",
        })),
        modules: moduleStatuses(),
      });
    }),
  );

  app.get(
    "/api/reports/appointments",
    authenticate,
    requirePermission("reports:read"),
    asyncHandler(async (req, res) => {
      const query = rangeQuery.parse(req.query);
      const span = bounds(query.from, query.to);
      const rows = await prisma.appointment.groupBy({
        by: ["status"],
        where: { startsAt: { gte: span.gte, lte: span.lte } },
        _count: { _all: true },
      });
      res.json({ data: rows.map((row) => ({ status: row.status, count: row._count._all })) });
    }),
  );

  app.get(
    "/api/reports/billing",
    authenticate,
    requirePermission("reports:read"),
    asyncHandler(async (req, res) => {
      const query = rangeQuery.parse(req.query);
      const span = bounds(query.from, query.to);
      const invoices = await prisma.invoice.findMany({
        where: { createdAt: { gte: span.gte, lte: span.lte }, status: { not: "VOID" } },
        select: { total: true, balance: true, status: true },
      });
      const totalMinor = invoices.reduce((sum, invoice) => sum + toMinor(invoice.total), 0);
      const outstandingMinor = invoices.reduce((sum, invoice) => sum + toMinor(invoice.balance), 0);
      res.json({
        invoices: invoices.length,
        billed: moneyString(fromMinor(totalMinor)),
        outstanding: moneyString(fromMinor(outstandingMinor)),
        collected: moneyString(fromMinor(totalMinor - outstandingMinor)),
      });
    }),
  );

  app.get(
    "/api/reports/pharmacy",
    authenticate,
    requirePermission("reports:read"),
    asyncHandler(async (_req, res) => {
      const medications = await prisma.medication.findMany({ include: { batches: true }, orderBy: { name: "asc" } });
      const today = new Date().toISOString().slice(0, 10);
      res.json({
        data: medications.map((item) => {
          const onHand = item.batches.reduce((sum, batch) => sum + batch.quantity, 0);
          const expired = item.batches
            .filter((batch) => batch.expiryDate.toISOString().slice(0, 10) < today)
            .reduce((sum, batch) => sum + batch.quantity, 0);
          return {
            name: item.name,
            strength: item.strength,
            form: item.form,
            onHand,
            expired,
            lowStock: onHand - expired < 20,
          };
        }),
      });
    }),
  );

  app.get(
    "/api/reports/export/:kind",
    authenticate,
    requirePermission("reports:read"),
    asyncHandler(async (req, res) => {
      const kind = z.enum(["appointments", "patients", "billing", "pharmacy"]).parse(req.params.kind);
      const query = rangeQuery.parse(req.query);
      const span = bounds(query.from, query.to);
      let body = "";
      if (kind === "patients") {
        const rows = await prisma.patient.findMany({
          where: { createdAt: { gte: span.gte, lte: span.lte } },
          orderBy: { patientCode: "asc" },
        });
        body = csv([
          ["patientCode", "firstName", "lastName", "phone", "city"],
          ...rows.map((row) => [row.patientCode, row.firstName, row.lastName, row.phone, row.city ?? ""]),
        ]);
      } else if (kind === "appointments") {
        const rows = await prisma.appointment.findMany({
          where: { startsAt: { gte: span.gte, lte: span.lte } },
          include: { patient: true, doctor: { include: { user: true } } },
          orderBy: { startsAt: "asc" },
        });
        body = csv([
          ["startsAt", "status", "patientCode", "doctor", "reason"],
          ...rows.map((row) => [
            row.startsAt.toISOString(),
            row.status,
            row.patient.patientCode,
            `${row.doctor.user.firstName} ${row.doctor.user.lastName}`,
            row.reason,
          ]),
        ]);
      } else if (kind === "billing") {
        const rows = await prisma.invoice.findMany({
          where: { createdAt: { gte: span.gte, lte: span.lte } },
          include: { patient: true },
          orderBy: { invoiceNumber: "asc" },
        });
        body = csv([
          ["invoiceNumber", "patientCode", "status", "total", "balance"],
          ...rows.map((row) => [
            row.invoiceNumber,
            row.patient.patientCode,
            row.status,
            moneyString(row.total),
            moneyString(row.balance),
          ]),
        ]);
      } else {
        const rows = await prisma.medication.findMany({ include: { batches: true }, orderBy: { name: "asc" } });
        body = csv([
          ["name", "strength", "form", "onHand"],
          ...rows.map((row) => [
            row.name,
            row.strength,
            row.form,
            String(row.batches.reduce((sum, batch) => sum + batch.quantity, 0)),
          ]),
        ]);
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${kind}.csv"`);
      res.send(body);
    }),
  );

  app.get(
    "/api/audit-logs",
    authenticate,
    requirePermission("audit:read"),
    asyncHandler(async (req, res) => {
      const query = z
        .object({
          q: z.string().trim().max(80).optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);
      const where = query.q
        ? {
            OR: [{ action: { contains: query.q } }, { entityType: { contains: query.q } }],
          }
        : {};
      const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          include: { actor: { select: { firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      res.json({
        data: rows.map((row) => ({
          id: row.id,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          outcome: row.outcome,
          createdAt: row.createdAt.toISOString(),
          actorName: row.actor ? `${row.actor.firstName} ${row.actor.lastName}` : "System",
          actorEmail: row.actor?.email ?? null,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
      });
    }),
  );

  app.get(
    "/api/modules/status",
    authenticate,
    asyncHandler(async (_req, res) => {
      res.json({ modules: moduleStatuses() });
    }),
  );
}
