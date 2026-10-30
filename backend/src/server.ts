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

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
