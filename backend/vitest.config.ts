import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("Set TEST_DATABASE_URL in backend/.env to a database whose name ends with _test.");
}

let databaseName = "";
try {
  databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
} catch {
  throw new Error("TEST_DATABASE_URL is not a valid URL.");
}
if (!/^[A-Za-z0-9_]+$/.test(databaseName) || !databaseName.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must use a database name ending in _test.");
}

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      PORT: "4001",
      FRONTEND_ORIGIN: "http://localhost:5173",
      NODE_ENV: "test",
      CLINIC_TIMEZONE: "Asia/Kolkata",
      TRUST_PROXY: "0",
      COOKIE_SAMESITE: "lax",
    },
    globalSetup: "./tests/globalSetup.ts",
  },
});
