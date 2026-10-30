import type { Express } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "../../lib/audit";
import { hashPassword, passwordIssues, type AuthUser } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const patientBody = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
  sex: z.string().trim().min(1).max(20),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(191).optional().or(z.literal("")),
  addressLine: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  createPortal: z.boolean().optional(),
  password: z.string().min(10).max(72).optional(),
});

function scope(user: AuthUser): Prisma.PatientWhereInput {
  if (user.role === "PATIENT") {
    return { userId: user.id };
  }
  return {};
}

function present(patient: {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  sex: string;
  phone: string;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  userId: string | null;
  createdAt: Date;
}) {
  return {
    id: patient.id,
    patientCode: patient.patientCode,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth.toISOString().slice(0, 10),
    sex: patient.sex,
    phone: patient.phone,
    email: patient.email,
    addressLine: patient.addressLine,
    city: patient.city,
    hasPortal: Boolean(patient.userId),
    createdAt: patient.createdAt.toISOString(),
  };
}

async function nextPatientCode(tx: Prisma.TransactionClient): Promise<string> {
  const latest = await tx.patient.findFirst({
    where: { patientCode: { startsWith: "P-" } },
    orderBy: { patientCode: "desc" },
    select: { patientCode: true },
  });
  const current = latest ? Number(latest.patientCode.slice(2)) : 10000;
  return `P-${Number.isFinite(current) ? current + 1 : 10001}`;
}

export function registerPatientRoutes(app: Express): void {
  app.get(
    "/api/patients",
    authenticate,
    requirePermission("patients:read"),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      const paging = pageParams(query);
      const where: Prisma.PatientWhereInput = {
        ...scope(requireUser(req)),
        ...(query.q
          ? {
              OR: [
                { patientCode: { contains: query.q } },
                { firstName: { contains: query.q } },
                { lastName: { contains: query.q } },
                { phone: { contains: query.q } },
                { email: { contains: query.q } },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.patient.count({ where }),
        prisma.patient.findMany({
          where,
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({ data: rows.map(present), page: paging.page, pageSize: paging.pageSize, total });
    }),
  );

  app.post(
    "/api/patients",
    authenticate,
    requirePermission("patients:write"),
    asyncHandler(async (req, res) => {
      const body = patientBody.parse(req.body);
      const actor = requireUser(req);
      let createdId = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const patient = await prisma.$transaction(async (tx) => {
            const duplicate = await tx.patient.findFirst({
              where: {
                firstName: body.firstName,
                lastName: body.lastName,
                phone: body.phone,
                dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
              },
            });
            if (duplicate) {
              throw new HttpError(409, "A patient with the same name, date of birth, and phone already exists");
            }
            let userId: string | undefined;
            if (body.createPortal) {
              if (!body.email) {
                throw new HttpError(400, "A portal account needs an email address");
              }
              const issue = body.password ? passwordIssues(body.password) : "Password must be 10 to 72 characters";
              if (!body.password || issue) {
                throw new HttpError(400, issue ?? "Password must be 10 to 72 characters");
              }
              const role = await tx.role.findUnique({ where: { name: "PATIENT" } });
              if (!role) {
                throw new HttpError(500, "Patient role is not configured");
              }
              const portal = await tx.user.create({
                data: {
                  email: body.email.toLowerCase(),
                  passwordHash: await hashPassword(body.password),
                  firstName: body.firstName,
                  lastName: body.lastName,
                  roleId: role.id,
                  status: "ACTIVE",
                },
              });
              userId = portal.id;
            }
            return tx.patient.create({
              data: {
                patientCode: await nextPatientCode(tx),
                userId,
                firstName: body.firstName,
                lastName: body.lastName,
                dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
                sex: body.sex,
                phone: body.phone,
                email: body.email || null,
                addressLine: body.addressLine || null,
                city: body.city || null,
              },
            });
          });
          createdId = patient.id;
          await recordAudit({
            actorUserId: actor.id,
            action: "PATIENT_CREATED",
            entityType: "Patient",
            entityId: patient.id,
            ipAddress: req.ip,
          });
          res.status(201).json(present(patient));
          return;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) {
            continue;
          }
          throw error;
        }
      }
      if (!createdId) {
        throw new HttpError(409, "Could not assign a unique patient ID");
      }
    }),
  );

  app.get(
    "/api/patients/:id",
    authenticate,
    requirePermission("patients:read"),
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const patient = await prisma.patient.findFirst({
        where: { id: req.params.id, ...scope(actor) },
      });
      if (!patient) {
        throw new HttpError(404, "Patient not found");
      }
      const canClinical =
        actor.permissions.includes("records:read") || actor.patientId === patient.id;
      const [appointments, allergies, encounters] = await Promise.all([
        prisma.appointment.findMany({
          where: { patientId: patient.id },
          include: { doctor: { include: { user: true } } },
          orderBy: { startsAt: "desc" },
          take: 20,
        }),
        canClinical
          ? prisma.allergy.findMany({ where: { patientId: patient.id }, orderBy: { substance: "asc" } })
          : Promise.resolve([]),
        canClinical
          ? prisma.encounter.findMany({
              where: { patientId: patient.id },
              include: { doctor: { include: { user: true } }, diagnoses: true },
              orderBy: { createdAt: "desc" },
              take: 20,
            })
          : Promise.resolve([]),
      ]);
      if (canClinical) {
        await recordAudit({
          actorUserId: actor.id,
          action: "PATIENT_CLINICAL_READ",
          entityType: "Patient",
          entityId: patient.id,
          ipAddress: req.ip,
        });
      }
      res.json({
        ...present(patient),
        appointments: appointments.map((item) => ({
          id: item.id,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString(),
          status: item.status,
          reason: item.reason,
          doctorName: `${item.doctor.user.firstName} ${item.doctor.user.lastName}`,
        })),
        clinical: canClinical
          ? {
              allergies: allergies.map((item) => ({
                id: item.id,
                substance: item.substance,
                severity: item.severity,
                notes: item.notes,
              })),
              encounters: encounters.map((item) => ({
                id: item.id,
                createdAt: item.createdAt.toISOString(),
                doctorName: `${item.doctor.user.firstName} ${item.doctor.user.lastName}`,
                notes: item.notes,
                diagnoses: item.diagnoses.map((diagnosis) => diagnosis.description),
              })),
            }
          : null,
      });
    }),
  );

  app.patch(
    "/api/patients/:id",
    authenticate,
    requirePermission("patients:write"),
    asyncHandler(async (req, res) => {
      const body = patientBody.omit({ createPortal: true, password: true }).parse(req.body);
      const actor = requireUser(req);
      const existing = await prisma.patient.findFirst({
        where: { id: req.params.id, ...scope(actor) },
      });
      if (!existing) {
        throw new HttpError(404, "Patient not found");
      }
      const duplicate = await prisma.patient.findFirst({
        where: {
          id: { not: existing.id },
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
        },
      });
      if (duplicate) {
        throw new HttpError(409, "A patient with the same name, date of birth, and phone already exists");
      }
      const patient = await prisma.patient.update({
        where: { id: existing.id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
          sex: body.sex,
          phone: body.phone,
          email: body.email || null,
          addressLine: body.addressLine || null,
          city: body.city || null,
        },
      });
      await recordAudit({
        actorUserId: actor.id,
        action: "PATIENT_UPDATED",
        entityType: "Patient",
        entityId: patient.id,
        ipAddress: req.ip,
      });
      res.json(present(patient));
    }),
  );
}
