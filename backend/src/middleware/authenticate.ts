import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { SESSION_COOKIE, hashToken, readCookie, type AuthUser } from "../lib/auth";

const userInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  doctor: { select: { id: true } },
  patient: { select: { id: true } },
} as const;

export function toAuthUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: AuthUser["status"];
  role: { name: string; permissions: Array<{ permission: { code: string } }> };
  doctor: { id: string } | null;
  patient: { id: string } | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    role: user.role.name,
    permissions: user.role.permissions.map((grant) => grant.permission.code),
    doctorId: user.doctor?.id ?? null,
    patientId: user.patient?.id ?? null,
  };
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) {
    throw new HttpError(401, "Authentication required");
  }
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: userInclude } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    throw new HttpError(401, "Session expired");
  }
  if (session.user.status !== "ACTIVE") {
    throw new HttpError(403, "Account is not active");
  }
  req.user = toAuthUser(session.user);
  next();
});

export function requirePermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    const missing = codes.some((code) => !user.permissions.includes(code));
    if (missing) {
      next(new HttpError(403, "You do not have permission for this action"));
      return;
    }
    next();
  };
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }
  return req.user;
}
