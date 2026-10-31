import os from "os";
import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

function networkUrls(port: number): string[] {
  const urls: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  for (const url of networkUrls(env.PORT)) {
    console.log(`API reachable from another system at ${url}`);
  }
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}. Closing the HTTP server.`);
  const timer = setTimeout(() => {
    console.error("Shutdown timed out.");
    process.exit(1);
  }, 10_000);
  timer.unref();
  server.close(() => {
    void prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        process.exit(0);
      });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
