import type { Express } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "../../lib/audit";
import type { AuthUser } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const LOW_STOCK = 20;

const medicationBody = z.object({
  name: z.string().trim().min(1).max(150),
  strength: z.string().trim().min(1).max(50),
  form: z.string().trim().min(1).max(50),
});

const batchBody = z.object({
  medicationId: z.string().min(1),
  batchNumber: z.string().trim().min(1).max(50),
  quantity: z.number().int().positive().max(100000),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().trim().min(1).max(100),
});

const prescriptionBody = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        medicationId: z.string().min(1),
        dosage: z.string().trim().min(1).max(100),
        frequency: z.string().trim().min(1).max(100),
        duration: z.string().trim().min(1).max(100),
        quantity: z.number().int().positive().max(1000),
        instructions: z.string().trim().min(1).max(255),
      }),
    )
    .min(1)
    .max(12),
});

function prescriptionScope(user: AuthUser): Prisma.PrescriptionWhereInput {
  if (user.role === "PATIENT") {
    return { patient: { userId: user.id } };
  }
  return {};
}

export function registerPharmacyRoutes(app: Express): void {
  app.get(
    "/api/medications",
    authenticate,
    requirePermission("pharmacy:read"),
    asyncHandler(async (_req, res) => {
      const medications = await prisma.medication.findMany({
        include: { batches: true },
        orderBy: { name: "asc" },
      });
      const today = new Date().toISOString().slice(0, 10);
      res.json({
        data: medications.map((item) => {
          const onHand = item.batches.reduce((sum, batch) => sum + batch.quantity, 0);
          const expired = item.batches
            .filter((batch) => batch.expiryDate.toISOString().slice(0, 10) < today)
            .reduce((sum, batch) => sum + batch.quantity, 0);
          return {
            id: item.id,
            name: item.name,
            strength: item.strength,
            form: item.form,
            onHand,
            expired,
            lowStock: onHand - expired < LOW_STOCK,
            batches: item.batches.map((batch) => ({
              id: batch.id,
              batchNumber: batch.batchNumber,
              quantity: batch.quantity,
              expiryDate: batch.expiryDate.toISOString().slice(0, 10),
              location: batch.location,
            })),
          };
        }),
      });
    }),
  );

  app.post(
    "/api/medications",
    authenticate,
    requirePermission("pharmacy:write"),
    asyncHandler(async (req, res) => {
      const body = medicationBody.parse(req.body);
      const medication = await prisma.medication.create({ data: body });
      await recordAudit({
        actorUserId: requireUser(req).id,
        action: "MEDICATION_CREATED",
        entityType: "Medication",
        entityId: medication.id,
        ipAddress: req.ip,
      });
      res.status(201).json(medication);
    }),
  );

  app.post(
    "/api/inventory/batches",
    authenticate,
    requirePermission("pharmacy:write"),
    asyncHandler(async (req, res) => {
      const body = batchBody.parse(req.body);
      const expiry = new Date(`${body.expiryDate}T00:00:00.000Z`);
      if (expiry.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        throw new HttpError(400, "Expiry date is already past");
      }
      const actor = requireUser(req);
      const batch = await prisma.$transaction(async (tx) => {
        const existing = await tx.inventoryBatch.findUnique({
          where: {
            medicationId_batchNumber: {
              medicationId: body.medicationId,
              batchNumber: body.batchNumber,
            },
          },
        });
        const saved = existing
          ? await tx.inventoryBatch.update({
              where: { id: existing.id },
              data: { quantity: { increment: body.quantity }, expiryDate: expiry, location: body.location },
            })
          : await tx.inventoryBatch.create({
              data: {
                medicationId: body.medicationId,
                batchNumber: body.batchNumber,
                quantity: body.quantity,
                expiryDate: expiry,
                location: body.location,
              },
            });
        await tx.inventoryMovement.create({
          data: {
            batchId: saved.id,
            delta: body.quantity,
            reason: "STOCK_RECEIPT",
            actorUserId: actor.id,
          },
        });
        return saved;
      });
      res.status(201).json({
        id: batch.id,
        quantity: batch.quantity,
        batchNumber: batch.batchNumber,
      });
    }),
  );

  app.get(
    "/api/prescriptions",
    authenticate,
    requirePermission("prescriptions:read"),
    asyncHandler(async (req, res) => {
      const query = z
        .object({
          q: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(10),
        })
        .parse(req.query);
      const paging = pageParams(query);
      const where: Prisma.PrescriptionWhereInput = {
        ...prescriptionScope(requireUser(req)),
        ...(query.q
          ? {
              OR: [
                { patient: { firstName: { contains: query.q } } },
                { patient: { lastName: { contains: query.q } } },
                { patient: { patientCode: { contains: query.q } } },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.prescription.count({ where }),
        prisma.prescription.findMany({
          where,
          include: {
            patient: true,
            doctor: { include: { user: true } },
            items: { include: { medication: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({
        data: rows.map((item) => ({
          id: item.id,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          patientId: item.patientId,
          patientCode: item.patient.patientCode,
          patientName: `${item.patient.firstName} ${item.patient.lastName}`,
          doctorName: `${item.doctor.user.firstName} ${item.doctor.user.lastName}`,
          items: item.items.map((line) => ({
            id: line.id,
            medication: `${line.medication.name} ${line.medication.strength}`,
            dosage: line.dosage,
            frequency: line.frequency,
            duration: line.duration,
            quantity: line.quantity,
            instructions: line.instructions,
          })),
        })),
        page: paging.page,
        pageSize: paging.pageSize,
        total,
      });
    }),
  );

  app.post(
    "/api/prescriptions",
    authenticate,
    requirePermission("prescriptions:write"),
    asyncHandler(async (req, res) => {
      const body = prescriptionBody.parse(req.body);
      const actor = requireUser(req);
      if (!actor.doctorId) {
        throw new HttpError(403, "Only an authorized clinician can issue a prescription");
      }
      const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
      if (!patient) {
        throw new HttpError(404, "Patient not found");
      }
      if (body.encounterId) {
        const encounter = await prisma.encounter.findUnique({ where: { id: body.encounterId } });
        if (!encounter || encounter.patientId !== patient.id) {
          throw new HttpError(400, "Encounter does not belong to this patient");
        }
        if (encounter.doctorId !== actor.doctorId && actor.role !== "ADMIN") {
          throw new HttpError(403, "You can only prescribe from your own encounter");
        }
      }
      const prescription = await prisma.prescription.create({
        data: {
          patientId: patient.id,
          doctorId: actor.doctorId,
          encounterId: body.encounterId,
          status: "ISSUED",
          items: { create: body.items },
        },
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "PRESCRIPTION_ISSUED",
        entityType: "Prescription",
        entityId: prescription.id,
        ipAddress: req.ip,
      });
      res.status(201).json({ id: prescription.id, status: prescription.status });
    }),
  );

  app.post(
    "/api/prescriptions/:id/dispense",
    authenticate,
    requirePermission("pharmacy:write"),
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const dispensed = await prisma.$transaction(async (tx) => {
        const prescription = await tx.prescription.findUnique({
          where: { id: req.params.id },
          include: { items: true },
        });
        if (!prescription) {
          throw new HttpError(404, "Prescription not found");
        }
        if (prescription.status === "DISPENSED") {
          throw new HttpError(409, "Prescription is already dispensed");
        }
        if (prescription.status !== "ISSUED") {
          throw new HttpError(400, "Only issued prescriptions can be dispensed");
        }
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        for (const item of prescription.items) {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM Medication WHERE id = ${item.medicationId} FOR UPDATE`);
          const batches = await tx.inventoryBatch.findMany({
            where: { medicationId: item.medicationId, quantity: { gt: 0 }, expiryDate: { gte: today } },
            orderBy: { expiryDate: "asc" },
          });
          let remaining = item.quantity;
          for (const batch of batches) {
            if (remaining === 0) {
              break;
            }
            const take = Math.min(batch.quantity, remaining);
            const updated = await tx.inventoryBatch.updateMany({
              where: { id: batch.id, quantity: { gte: take } },
              data: { quantity: { decrement: take } },
            });
            if (updated.count !== 1) {
              throw new HttpError(409, "Stock changed during dispensing. Try again.");
            }
            await tx.inventoryMovement.create({
              data: {
                batchId: batch.id,
                delta: -take,
                reason: "DISPENSE",
                actorUserId: actor.id,
                reference: prescription.id,
              },
            });
            remaining -= take;
          }
          if (remaining > 0) {
            throw new HttpError(409, "Not enough unexpired stock to dispense this prescription");
          }
        }
        return tx.prescription.update({
          where: { id: prescription.id },
          data: { status: "DISPENSED" },
        });
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "PRESCRIPTION_DISPENSED",
        entityType: "Prescription",
        entityId: dispensed.id,
        ipAddress: req.ip,
      });
      res.json({ id: dispensed.id, status: dispensed.status });
    }),
  );
}
