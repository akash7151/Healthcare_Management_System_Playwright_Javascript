import { env } from "../config/env";

function privateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  return /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

const allowedOrigins = new Set([env.FRONTEND_ORIGIN, ...env.FRONTEND_ORIGINS]);

/** Local demo machines on the same network may open the clinic by its LAN address. */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  if (origin === "*" || origin.includes("*")) {
    return false;
  }
  if (allowedOrigins.has(origin)) {
    return true;
  }
  if (env.NODE_ENV === "production") {
    return false;
  }
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && privateHost(url.hostname);
  } catch {
    return false;
  }
}
