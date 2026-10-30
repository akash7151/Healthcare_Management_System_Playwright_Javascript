import type { Express } from "express";
import { Prisma, type AppointmentStatus } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { recordAudit } from "../../lib/audit";
import type { AuthUser } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import {
  BLOCKING_APPOINTMENT_STATUSES,
  assertStatusTransition,
  canReschedule,
  fitsSchedule,
} from "../../lib/schedule";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const statuses = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  doctorId: z.string().min(1).optional(),
  patientId: z.string().min(1).optional(),
  status: z.enum(statuses).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createBody = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().min(3).max(255),
});

const patchBody = z.object({
  doctorId: z.string().min(1).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(255).optional(),
  status: z.enum(statuses).optional(),
});

function scope(user: AuthUser): Prisma.AppointmentWhereInput {
  if (user.role === "PATIENT") {
    return { patient: { userId: user.id } };
  }
  return {};
}

function present(item: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  reason: string;
  patient: { id: string; patientCode: string; firstName: string; lastName: string };
  doctor: { id: string; specialty: string; user: { firstName: string; lastName: string } };
}) {
  return {
    id: item.id,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    status: item.status,
    reason: item.reason,
    patientId: item.patient.id,
    patientCode: item.patient.patientCode,
    patientName: `${item.patient.firstName} ${item.patient.lastName}`,
    doctorId: item.doctor.id,
    doctorName: `${item.doctor.user.firstName} ${item.doctor.user.lastName}`,
    specialty: item.doctor.specialty,
  };
}

const include = {
  patient: true,
  doctor: { include: { user: true, schedules: true } },
} as const;

async function assertSlot(
  tx: Prisma.TransactionClient,
  input: { doctorId: string; patientId: string; startsAt: Date; endsAt: Date; ignoreId?: string },
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM Doctor WHERE id = ${input.doctorId} FOR UPDATE`);
  const doctor = await tx.doctor.findUnique({
    where: { id: input.doctorId },
    include: { schedules: true },
  });
  if (!doctor || !doctor.active) {
    throw new HttpError(400, "Doctor is not available");
  }
  const duration = input.endsAt.getTime() - input.startsAt.getTime();
  if (duration < 5 * 60 * 1000 || duration > 4 * 60 * 60 * 1000) {
    throw new HttpError(400, "Appointment length must be between 5 minutes and 4 hours");
  }
  if (input.startsAt.getTime() < Date.now() - 60 * 1000) {
    throw new HttpError(400, "Appointment time is in the past");
  }
  if (!fitsSchedule(doctor.schedules, input.startsAt, input.endsAt, env.CLINIC_TIMEZONE)) {
    throw new HttpError(400, "That time is outside the doctor's working hours");
  }
  const doctorConflict = await tx.appointment.findFirst({
    where: {
      doctorId: input.doctorId,
      id: input.ignoreId ? { not: input.ignoreId } : undefined,
      status: { in: BLOCKING_APPOINTMENT_STATUSES },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (doctorConflict) {
    throw new HttpError(409, "That doctor already has an appointment in this time");
  }
  const patientConflict = await tx.appointment.findFirst({
    where: {
      patientId: input.patientId,
      id: input.ignoreId ? { not: input.ignoreId } : undefined,
      status: { in: BLOCKING_APPOINTMENT_STATUSES },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (patientConflict) {
    throw new HttpError(409, "That patient already has an appointment in this time");
  }
}

export function registerAppointmentRoutes(app: Express): void {
  app.get(
    "/api/appointments",
    authenticate,
    requirePermission("appointments:read"),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      const paging = pageParams(query);
      const actor = requireUser(req);
      const where: Prisma.AppointmentWhereInput = {
        ...scope(actor),
        ...(query.doctorId ? { doctorId: query.doctorId } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              startsAt: {
                gte: query.from ? new Date(query.from) : undefined,
                lte: query.to ? new Date(query.to) : undefined,
              },
            }
          : {}),
        ...(query.q
          ? {
              OR: [
                { reason: { contains: query.q } },
                { patient: { firstName: { contains: query.q } } },
                { patient: { lastName: { contains: query.q } } },
                { patient: { patientCode: { contains: query.q } } },
              ],
            }
          : {}),
      };
      if (actor.role === "PATIENT" && query.patientId && query.patientId !== actor.patientId) {
        throw new HttpError(403, "You do not have permission for this action");
      }
      const [total, rows] = await Promise.all([
        prisma.appointment.count({ where }),
        prisma.appointment.findMany({
          where,
          include,
          orderBy: { startsAt: "asc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({ data: rows.map(present), page: paging.page, pageSize: paging.pageSize, total });
    }),
  );

  app.post(
    "/api/appointments",
    authenticate,
    requirePermission("appointments:write"),
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body);
      const actor = requireUser(req);
      const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
      if (!patient) {
        throw new HttpError(404, "Patient not found");
      }
      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      const appointment = await prisma.$transaction(async (tx) => {
        await assertSlot(tx, { doctorId: body.doctorId, patientId: body.patientId, startsAt, endsAt });
        return tx.appointment.create({
          data: {
            patientId: body.patientId,
            doctorId: body.doctorId,
            startsAt,
            endsAt,
            reason: body.reason,
            status: "SCHEDULED",
          },
          include,
        });
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "APPOINTMENT_BOOKED",
        entityType: "Appointment",
        entityId: appointment.id,
        ipAddress: req.ip,
      });
      res.status(201).json(present(appointment));
    }),
  );

  app.get(
    "/api/appointments/:id",
    authenticate,
    requirePermission("appointments:read"),
    asyncHandler(async (req, res) => {
      const item = await prisma.appointment.findFirst({
        where: { id: req.params.id, ...scope(requireUser(req)) },
        include,
      });
      if (!item) {
        throw new HttpError(404, "Appointment not found");
      }
      res.json(present(item));
    }),
  );

  app.patch(
    "/api/appointments/:id",
    authenticate,
    requirePermission("appointments:write"),
    asyncHandler(async (req, res) => {
      const body = patchBody.parse(req.body);
      const actor = requireUser(req);
      const appointment = await prisma.$transaction(async (tx) => {
        const existing = await tx.appointment.findUnique({ where: { id: req.params.id } });
        if (!existing) {
          throw new HttpError(404, "Appointment not found");
        }
        const nextStatus = body.status ?? existing.status;
        if (body.status) {
          try {
            assertStatusTransition(existing.status, body.status);
          } catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : "Invalid status");
          }
        }
        const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt;
        const endsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;
        const doctorId = body.doctorId ?? existing.doctorId;
        const timeChanged =
          startsAt.getTime() !== existing.startsAt.getTime() ||
          endsAt.getTime() !== existing.endsAt.getTime() ||
          doctorId !== existing.doctorId;
        if (timeChanged) {
          if (!canReschedule(existing.status) || (body.status && !canReschedule(body.status) && body.status !== existing.status)) {
            if (!canReschedule(existing.status)) {
              throw new HttpError(400, "Only scheduled or confirmed appointments can be rescheduled");
            }
          }
          if (!canReschedule(existing.status)) {
            throw new HttpError(400, "Only scheduled or confirmed appointments can be rescheduled");
          }
          if (BLOCKING_APPOINTMENT_STATUSES.includes(nextStatus)) {
            await assertSlot(tx, {
              doctorId,
              patientId: existing.patientId,
              startsAt,
              endsAt,
              ignoreId: existing.id,
            });
          }
        }
        return tx.appointment.update({
          where: { id: existing.id },
          data: {
            doctorId,
            startsAt,
            endsAt,
            reason: body.reason,
            status: nextStatus,
          },
          include,
        });
      });
      await recordAudit({
        actorUserId: actor.id,
        action: body.status === "CANCELLED" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_UPDATED",
        entityType: "Appointment",
        entityId: appointment.id,
        ipAddress: req.ip,
      });
      res.json(present(appointment));
    }),
  );
}
