import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import type { UserStatus } from "@prisma/client";
import { env } from "../config/env";

export const SESSION_COOKIE = "hms_session";
const SESSION_MS = 8 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  role: string;
  permissions: string[];
  doctorId: string | null;
  patientId: string | null;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function newToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_MS) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MS / 1000}`,
  ];
  if (secure) {
    flags.push("Secure");
  }
  res.append("Set-Cookie", flags.join("; "));
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  const flags = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    flags.push("Secure");
  }
  res.append("Set-Cookie", flags.join("; "));
}

export function passwordIssues(password: string): string | null {
  if (password.length < 10 || password.length > 72) {
    return "Password must be 10 to 72 characters";
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include a letter and a number";
  }
  return null;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function assertLoginRate(ip: string): void {
  const limit = env.NODE_ENV === "production" ? env.LOGIN_ATTEMPT_LIMIT : Math.max(env.LOGIN_ATTEMPT_LIMIT, 200);
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw Object.assign(new Error("Too many login attempts. Try again later."), { status: 429 });
  }
}
