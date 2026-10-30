import type { Express } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "../../lib/audit";
import { hashPassword, passwordIssues } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { assertScheduleWindows, buildSlots, type ScheduleWindow } from "../../lib/schedule";
import { env } from "../../config/env";
import { BLOCKING_APPOINTMENT_STATUSES } from "../../lib/schedule";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const windowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  slotMinutes: z.number().int().min(5).max(240),
});

const createBody = z.object({
  email: z.string().trim().email().max(191),
  password: z.string().min(10).max(72),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  licenseNumber: z.string().trim().min(3).max(50),
  specialty: z.string().trim().min(1).max(100),
  department: z.string().trim().min(1).max(100),
  qualification: z.string().trim().max(255).optional(),
  active: z.boolean().default(true),
  schedules: z.array(windowSchema).min(1),
});

const patchBody = createBody.omit({ email: true, password: true }).partial().extend({
  schedules: z.array(windowSchema).min(1).optional(),
});

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  specialty: z.string().trim().max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

function present(doctor: {
  id: string;
  licenseNumber: string;
  specialty: string;
  department: string;
  qualification: string | null;
  active: boolean;
  user: { firstName: string; lastName: string; email: string; status: string };
  schedules: ScheduleWindow[];
}) {
  return {
    id: doctor.id,
    licenseNumber: doctor.licenseNumber,
    specialty: doctor.specialty,
    department: doctor.department,
    qualification: doctor.qualification,
    active: doctor.active,
    firstName: doctor.user.firstName,
    lastName: doctor.user.lastName,
    email: doctor.user.email,
    accountStatus: doctor.user.status,
    schedules: doctor.schedules,
  };
}

const include = { user: true, schedules: true } as const;

export function registerDoctorRoutes(app: Express): void {
  app.get(
    "/api/doctors",
    authenticate,
    requirePermission("doctors:read"),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      const paging = pageParams(query);
      const where: Prisma.DoctorWhereInput = {
        ...(query.active ? { active: query.active === "true" } : {}),
        ...(query.specialty ? { specialty: { contains: query.specialty } } : {}),
        ...(query.q
          ? {
              OR: [
                { specialty: { contains: query.q } },
                { licenseNumber: { contains: query.q } },
                { department: { contains: query.q } },
                { user: { firstName: { contains: query.q } } },
                { user: { lastName: { contains: query.q } } },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.doctor.count({ where }),
        prisma.doctor.findMany({
          where,
          include,
          orderBy: { user: { lastName: "asc" } },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({ data: rows.map(present), page: paging.page, pageSize: paging.pageSize, total });
    }),
  );

  app.post(
    "/api/doctors",
    authenticate,
    requirePermission("doctors:write"),
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body);
      const issue = passwordIssues(body.password);
      if (issue) {
        throw new HttpError(400, issue);
      }
      try {
        assertScheduleWindows(body.schedules);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Invalid schedule");
      }
      const role = await prisma.role.findUnique({ where: { name: "DOCTOR" } });
      if (!role) {
        throw new HttpError(500, "Doctor role is not configured");
      }
      const doctor = await prisma.doctor.create({
        data: {
          licenseNumber: body.licenseNumber,
          specialty: body.specialty,
          department: body.department,
          qualification: body.qualification || null,
          active: body.active,
          schedules: { create: body.schedules },
          user: {
            create: {
              email: body.email.toLowerCase(),
              passwordHash: await hashPassword(body.password),
              firstName: body.firstName,
              lastName: body.lastName,
              roleId: role.id,
              status: body.active ? "ACTIVE" : "DISABLED",
            },
          },
        },
        include,
      });
      await recordAudit({
        actorUserId: requireUser(req).id,
        action: "DOCTOR_CREATED",
        entityType: "Doctor",
        entityId: doctor.id,
        ipAddress: req.ip,
      });
      res.status(201).json(present(doctor));
    }),
  );

  app.get(
    "/api/doctors/:id",
    authenticate,
    requirePermission("doctors:read"),
    asyncHandler(async (req, res) => {
      const doctor = await prisma.doctor.findUnique({
        where: { id: req.params.id },
        include,
      });
      if (!doctor) {
        throw new HttpError(404, "Doctor not found");
      }
      const appointments = await prisma.appointment.findMany({
        where: { doctorId: doctor.id },
        include: { patient: true },
        orderBy: { startsAt: "desc" },
        take: 20,
      });
      res.json({
        ...present(doctor),
        appointments: appointments.map((item) => ({
          id: item.id,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString(),
          status: item.status,
          reason: item.reason,
          patientCode: item.patient.patientCode,
          patientName: `${item.patient.firstName} ${item.patient.lastName}`,
        })),
      });
    }),
  );

  app.patch(
    "/api/doctors/:id",
    authenticate,
    requirePermission("doctors:write"),
    asyncHandler(async (req, res) => {
      const body = patchBody.parse(req.body);
      const existing = await prisma.doctor.findUnique({ where: { id: req.params.id }, include });
      if (!existing) {
        throw new HttpError(404, "Doctor not found");
      }
      if (body.schedules) {
        try {
          assertScheduleWindows(body.schedules);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Invalid schedule");
        }
      }
      const doctor = await prisma.$transaction(async (tx) => {
        if (body.schedules) {
          await tx.doctorSchedule.deleteMany({ where: { doctorId: existing.id } });
          await tx.doctorSchedule.createMany({
            data: body.schedules.map((window) => ({ ...window, doctorId: existing.id })),
          });
        }
        return tx.doctor.update({
          where: { id: existing.id },
          data: {
            licenseNumber: body.licenseNumber,
            specialty: body.specialty,
            department: body.department,
            qualification: body.qualification,
            active: body.active,
            user: {
              update: {
                firstName: body.firstName,
                lastName: body.lastName,
                status: body.active === undefined ? undefined : body.active ? "ACTIVE" : "DISABLED",
              },
            },
          },
          include,
        });
      });
      await recordAudit({
        actorUserId: requireUser(req).id,
        action: "DOCTOR_UPDATED",
        entityType: "Doctor",
        entityId: doctor.id,
        ipAddress: req.ip,
      });
      res.json(present(doctor));
    }),
  );

  app.get(
    "/api/doctors/:id/availability",
    authenticate,
    requirePermission("appointments:read"),
    asyncHandler(async (req, res) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
      const doctor = await prisma.doctor.findUnique({
        where: { id: req.params.id },
        include: { schedules: true },
      });
      if (!doctor || !doctor.active) {
        throw new HttpError(404, "Doctor not found");
      }
      const dayStart = new Date(`${date}T00:00:00${"+05:30"}`);
      const dayEnd = new Date(`${date}T23:59:59.999+05:30`);
      const taken = await prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          status: { in: BLOCKING_APPOINTMENT_STATUSES },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        select: { startsAt: true, endsAt: true },
      });
      res.json({
        date,
        slots: buildSlots({
          schedules: doctor.schedules,
          date,
          timeZone: env.CLINIC_TIMEZONE,
          taken,
        }),
      });
    }),
  );
}
