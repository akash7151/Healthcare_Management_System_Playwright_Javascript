import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  NODE_ENV: z.string().default("development"),
  CLINIC_TIMEZONE: z.string().default("Asia/Kolkata"),
  LOGIN_ATTEMPT_LIMIT: z.coerce.number().int().positive().default(20),
});

export const env = envSchema.parse(process.env);
