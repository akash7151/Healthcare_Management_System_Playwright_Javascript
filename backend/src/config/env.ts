import "dotenv/config";
import { z } from "zod";

const flag = z
  .string()
  .optional()
  .transform((value) => value === "true" || value === "1");

const origin = z.string().url().transform((value) => new URL(value).origin);

const originList = z
  .string()
  .optional()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => new URL(item).origin),
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: origin.default("http://localhost:5173"),
  FRONTEND_ORIGINS: originList,
  NODE_ENV: z.string().default("development"),
  CLINIC_TIMEZONE: z.string().default("Asia/Kolkata"),
  LOGIN_ATTEMPT_LIMIT: z.coerce.number().int().positive().default(20),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_SECURE: flag,
});

export const env = envSchema.parse(process.env);
