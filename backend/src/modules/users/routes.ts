import type { Express } from "express";
import type { Prisma, UserStatus } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "../../lib/audit";
import { hashPassword, passwordIssues } from "../../lib/auth";
import { HttpError, asyncHandler, pageParams } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission, requireUser } from "../../middleware/authenticate";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.string().trim().max(50).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "LOCKED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const createBody = z.object({
  email: z.string().trim().email().max(191),
  password: z.string().min(10).max(72),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT", "BILLING_STAFF"]),
  status: z.enum(["ACTIVE", "DISABLED", "LOCKED"]).default("ACTIVE"),
});

const patchBody = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT", "BILLING_STAFF"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "LOCKED"]).optional(),
  password: z.string().min(10).max(72).optional(),
});

function present(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: { name: string };
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    role: user.role.name,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function registerUserRoutes(app: Express): void {
  app.get(
    "/api/users",
    authenticate,
    requirePermission("users:manage"),
    asyncHandler(async (req, res) => {
      const query = listQuery.parse(req.query);
      const paging = pageParams(query);
      const where: Prisma.UserWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.role ? { role: { name: query.role } } : {}),
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q } },
                { firstName: { contains: query.q } },
                { lastName: { contains: query.q } },
              ],
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: { role: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          skip: paging.skip,
          take: paging.take,
        }),
      ]);
      res.json({ data: rows.map(present), page: paging.page, pageSize: paging.pageSize, total });
    }),
  );

  app.post(
    "/api/users",
    authenticate,
    requirePermission("users:manage"),
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body);
      const issue = passwordIssues(body.password);
      if (issue) {
        throw new HttpError(400, issue);
      }
      if (body.role === "DOCTOR" || body.role === "PATIENT") {
        throw new HttpError(
          400,
          "Create doctors from the doctor directory and patients from patient registration",
        );
      }
      const role = await prisma.role.findUnique({ where: { name: body.role } });
      if (!role) {
        throw new HttpError(400, "Role is not configured");
      }
      const user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          passwordHash: await hashPassword(body.password),
          firstName: body.firstName,
          lastName: body.lastName,
          status: body.status,
          roleId: role.id,
        },
        include: { role: true },
      });
      await recordAudit({
        actorUserId: requireUser(req).id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        ipAddress: req.ip,
      });
      res.status(201).json(present(user));
    }),
  );

  app.patch(
    "/api/users/:id",
    authenticate,
    requirePermission("users:manage"),
    asyncHandler(async (req, res) => {
      const body = patchBody.parse(req.body);
      const actor = requireUser(req);
      const existing = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true },
      });
      if (!existing) {
        throw new HttpError(404, "User not found");
      }
      if (existing.id === actor.id && body.status && body.status !== "ACTIVE") {
        throw new HttpError(400, "You cannot disable your own account");
      }
      if (body.password) {
        const issue = passwordIssues(body.password);
        if (issue) {
          throw new HttpError(400, issue);
        }
      }
      let roleId = existing.roleId;
      if (body.role && body.role !== existing.role.name) {
        if (body.role === "DOCTOR" || existing.role.name === "DOCTOR") {
          throw new HttpError(400, "Change doctor access from the doctor directory");
        }
        const role = await prisma.role.findUnique({ where: { name: body.role } });
        if (!role) {
          throw new HttpError(400, "Role is not configured");
        }
        roleId = role.id;
      }
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          status: body.status,
          roleId,
          passwordHash: body.password ? await hashPassword(body.password) : undefined,
          failedAttempts: body.status === "ACTIVE" ? 0 : undefined,
        },
        include: { role: true },
      });
      if (body.status && body.status !== "ACTIVE") {
        await prisma.session.deleteMany({ where: { userId: user.id } });
      }
      await recordAudit({
        actorUserId: actor.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: user.id,
        ipAddress: req.ip,
      });
      res.json(present(user));
    }),
  );
}
