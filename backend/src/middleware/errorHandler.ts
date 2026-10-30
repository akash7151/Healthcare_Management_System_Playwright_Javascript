import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { HttpError } from "../lib/http";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((issue) => issue.message).join(" ") });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "That value is already in use" });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Record not found" });
      return;
    }
  }

  const status =
    err instanceof HttpError
      ? err.status
      : typeof err === "object" && err !== null && "status" in err && typeof err.status === "number"
        ? err.status
        : 500;

  if (status === 500) {
    console.error(env.NODE_ENV === "production" ? "request_failed" : err);
  }

  const message = err instanceof Error ? err.message : "Request failed";
  res.status(status).json({
    error: status === 500 ? "Internal server error" : message,
  });
};
