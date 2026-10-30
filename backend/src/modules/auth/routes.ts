import type { Express } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { recordAudit } from "../../lib/audit";
import {
  assertLoginRate,
  clearSessionCookie,
  hashPassword,
  hashToken,
  newToken,
  passwordIssues,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
} from "../../lib/auth";
import { HttpError, asyncHandler } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { authenticate, requireUser, toAuthUser } from "../../middleware/authenticate";

const credentials = z.object({
  email: z.string().trim().email().max(191),
  password: z.string().min(1).max(72),
});

const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  doctor: { select: { id: true } },
  patient: { select: { id: true } },
} as const;

function publicUser(user: ReturnType<typeof toAuthUser>) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    permissions: user.permissions,
    doctorId: user.doctorId,
    patientId: user.patientId,
  };
}

export function registerAuthRoutes(app: Express): void {
  app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
      assertLoginRate(req.ip ?? "unknown");
      const body = credentials.parse(req.body);
      const email = body.email.toLowerCase();
      const user = await prisma.user.findUnique({ where: { email }, include: userInclude });
      const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
      if (!user || !valid) {
        if (user) {
          const failedAttempts = user.failedAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts,
              status: failedAttempts >= 5 ? "LOCKED" : user.status,
            },
          });
          await recordAudit({
            actorUserId: user.id,
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: user.id,
            outcome: "FAILURE",
            ipAddress: req.ip,
          });
        }
        throw new HttpError(401, "Invalid email or password");
      }
      if (user.status === "DISABLED") {
        throw new HttpError(403, "Account is disabled");
      }
      if (user.status === "LOCKED") {
        throw new HttpError(403, "Account is locked");
      }
      const session = newToken();
      await prisma.$transaction([
        prisma.session.create({
          data: { userId: user.id, tokenHash: session.tokenHash, expiresAt: session.expiresAt },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lastLoginAt: new Date() },
        }),
      ]);
      setSessionCookie(res, session.token, env.NODE_ENV === "production");
      await recordAudit({
        actorUserId: user.id,
        action: "LOGIN",
        entityType: "User",
        entityId: user.id,
        ipAddress: req.ip,
      });
      const authUser = toAuthUser(user);
      res.json({ user: publicUser(authUser) });
    }),
  );

  app.post(
    "/api/auth/logout",
    asyncHandler(async (req, res) => {
      const token = req.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
        ?.slice(SESSION_COOKIE.length + 1);
      if (token) {
        await prisma.session.deleteMany({ where: { tokenHash: hashToken(decodeURIComponent(token)) } });
      }
      clearSessionCookie(res, env.NODE_ENV === "production");
      res.status(204).end();
    }),
  );

  app.get(
    "/api/auth/me",
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ user: publicUser(requireUser(req)) });
    }),
  );

  app.post(
    "/api/auth/change-password",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          currentPassword: z.string().min(1).max(72),
          newPassword: z.string().min(10).max(72),
        })
        .parse(req.body);
      const issue = passwordIssues(body.newPassword);
      if (issue) {
        throw new HttpError(400, issue);
      }
      const actor = requireUser(req);
      const user = await prisma.user.findUnique({ where: { id: actor.id } });
      if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw new HttpError(400, "Current password is incorrect");
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(body.newPassword) },
        }),
        prisma.session.deleteMany({ where: { userId: user.id } }),
      ]);
      clearSessionCookie(res, env.NODE_ENV === "production");
      await recordAudit({
        actorUserId: user.id,
        action: "PASSWORD_CHANGED",
        entityType: "User",
        entityId: user.id,
        ipAddress: req.ip,
      });
      res.status(204).end();
    }),
  );

  app.post(
    "/api/auth/password-reset/request",
    asyncHandler(async (req, res) => {
      const body = z.object({ email: z.string().trim().email().max(191) }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      let resetToken: string | undefined;
      if (user && user.status !== "DISABLED") {
        const token = newToken();
        token.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: token.tokenHash, expiresAt: token.expiresAt },
        });
        await recordAudit({
          actorUserId: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: "User",
          entityId: user.id,
          ipAddress: req.ip,
        });
        if (env.NODE_ENV !== "production") {
          resetToken = token.token;
        }
      }
      res.json({
        message: "If the account can be reset, a reset token has been issued for local development.",
        resetToken,
      });
    }),
  );

  app.post(
    "/api/auth/password-reset/confirm",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          token: z.string().min(20).max(128),
          newPassword: z.string().min(10).max(72),
        })
        .parse(req.body);
      const issue = passwordIssues(body.newPassword);
      if (issue) {
        throw new HttpError(400, issue);
      }
      const reset = await prisma.passwordReset.findUnique({
        where: { tokenHash: hashToken(body.token) },
      });
      if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
        throw new HttpError(400, "Reset token is invalid or expired");
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: reset.userId },
          data: {
            passwordHash: await hashPassword(body.newPassword),
            failedAttempts: 0,
            status: "ACTIVE",
          },
        }),
        prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
        prisma.session.deleteMany({ where: { userId: reset.userId } }),
      ]);
      await recordAudit({
        actorUserId: reset.userId,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: reset.userId,
        ipAddress: req.ip,
      });
      res.status(204).end();
    }),
  );
}
