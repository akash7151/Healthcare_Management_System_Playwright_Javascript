import type { Express } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "../../lib/audit";
import type { AuthUser } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const listQuery = z.object({
  patientId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const encounterBody = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  notes: z.string().trim().min(3).max(8000),
  examinationNotes: z.string().trim().max(8000).optional(),
  treatmentNotes: z.string().trim().max(8000).optional(),
  vitals: z
    .object({
      systolic: z.number().int().min(40).max(260).optional(),
      diastolic: z.number().int().min(20).max(180).optional(),
      heartRate: z.number().int().min(20).max(250).optional(),
      temperature: z.number().min(30).max(45).optional(),
    })
    .optional(),
  diagnoses: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(20),
        description: z.string().trim().min(1).max(255),
      }),
    )
    .max(10)
    .optional(),
});

const allergyBody = z.object({
  substance: z.string().trim().min(1).max(100),
  severity: z.enum(["mild", "moderate", "severe"]),
  notes: z.string().trim().max(255).optional(),
});

function scope(user: AuthUser): Prisma.EncounterWhereInput {
  if (user.role === "PATIENT") {
    return { patient: { userId: user.id } };
  }
  return {};
}

function authorDoctorId(user: AuthUser): string {
  if (user.role === "ADMIN" && user.doctorId) {
    return user.doctorId;
  }
  if (!user.doctorId) {
    throw new HttpError(403, "Only an authorized clinician can record this encounter");
  }
  return user.doctorId;
}

export function registerRecordRoutes(app: Express): void {
  app.get(
    "/api/medical-records",
    authenticate,
    requirePermission("records:read"),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      const paging = pageParams(query);
      const actor = requireUser(req);
      const where: Prisma.EncounterWhereInput = {
        ...scope(actor),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.encounter.count({ where }),
        prisma.encounter.findMany({
          where,
          include: {
            patient: true,
            doctor: { include: { user: true } },
            diagnoses: true,
            vitals: true,
          },
          orderBy: { createdAt: "desc" },
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({
        data: rows.map((item) => ({
          id: item.id,
          createdAt: item.createdAt.toISOString(),
          patientId: item.patientId,
          patientCode: item.patient.patientCode,
          patientName: `${item.patient.firstName} ${item.patient.lastName}`,
          doctorName: `${item.doctor.user.firstName} ${item.doctor.user.lastName}`,
          diagnoses: item.diagnoses.map((diagnosis) => `${diagnosis.code} ${diagnosis.description}`),
        })),
        page: paging.page,
        pageSize: paging.pageSize,
        total,
      });
    }),
  );

  app.get(
    "/api/medical-records/:id",
    authenticate,
    requirePermission("records:read"),
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const item = await prisma.encounter.findFirst({
        where: { id: req.params.id, ...scope(actor) },
        include: {
          patient: true,
          doctor: { include: { user: true } },
          diagnoses: true,
          vitals: true,
          appointment: true,
        },
      });
      if (!item) {
        throw new HttpError(404, "Medical record not found");
      }
      await recordAudit({
        actorUserId: actor.id,
        action: "ENCOUNTER_READ",
        entityType: "Encounter",
        entityId: item.id,
        ipAddress: req.ip,
      });
      res.json({
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        notes: item.notes,
        examinationNotes: item.examinationNotes,
        treatmentNotes: item.treatmentNotes,
        patientId: item.patientId,
        patientCode: item.patient.patientCode,
        patientName: `${item.patient.firstName} ${item.patient.lastName}`,
        doctorId: item.doctorId,
        doctorName: `${item.doctor.user.firstName} ${item.doctor.user.lastName}`,
        appointmentId: item.appointmentId,
        diagnoses: item.diagnoses,
        vitals: item.vitals.map((vital) => ({
          id: vital.id,
          systolic: vital.systolic,
          diastolic: vital.diastolic,
          heartRate: vital.heartRate,
          temperature: vital.temperature?.toString() ?? null,
          recordedAt: vital.recordedAt.toISOString(),
        })),
      });
    }),
  );

  app.post(
    "/api/medical-records",
    authenticate,
    requirePermission("records:write"),
    asyncHandler(async (req, res) => {
      const body = encounterBody.parse(req.body);
      const actor = requireUser(req);
      const doctorId = authorDoctorId(actor);
      const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
      if (!patient) {
        throw new HttpError(404, "Patient not found");
      }
      if (body.appointmentId) {
        const appointment = await prisma.appointment.findUnique({ where: { id: body.appointmentId } });
        if (!appointment || appointment.patientId !== patient.id) {
          throw new HttpError(400, "Appointment does not belong to this patient");
        }
        if (appointment.doctorId !== doctorId && actor.role !== "ADMIN") {
          throw new HttpError(403, "You can only document your own appointment");
        }
      }
      const encounter = await prisma.encounter.create({
        data: {
          patientId: patient.id,
          doctorId,
          appointmentId: body.appointmentId,
          notes: body.notes,
          examinationNotes: body.examinationNotes || null,
          treatmentNotes: body.treatmentNotes || null,
          vitals: body.vitals
            ? {
                create: {
                  systolic: body.vitals.systolic,
                  diastolic: body.vitals.diastolic,
                  heartRate: body.vitals.heartRate,
                  temperature: body.vitals.temperature,
                },
              }
            : undefined,
          diagnoses: body.diagnoses ? { create: body.diagnoses } : undefined,
        },
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "ENCOUNTER_CREATED",
        entityType: "Encounter",
        entityId: encounter.id,
        ipAddress: req.ip,
      });
      res.status(201).json({ id: encounter.id });
    }),
  );

  app.post(
    "/api/patients/:id/allergies",
    authenticate,
    requirePermission("records:write"),
    asyncHandler(async (req, res) => {
      const body = allergyBody.parse(req.body);
      const actor = requireUser(req);
      authorDoctorId(actor);
      const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
      if (!patient) {
        throw new HttpError(404, "Patient not found");
      }
      const existing = await prisma.allergy.findFirst({
        where: { patientId: patient.id, substance: body.substance },
      });
      if (existing) {
        throw new HttpError(409, "That allergy is already recorded");
      }
      const allergy = await prisma.allergy.create({
        data: {
          patientId: patient.id,
          substance: body.substance,
          severity: body.severity,
          notes: body.notes || null,
        },
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "ALLERGY_RECORDED",
        entityType: "Allergy",
        entityId: allergy.id,
        ipAddress: req.ip,
      });
      res.status(201).json(allergy);
    }),
  );
}
