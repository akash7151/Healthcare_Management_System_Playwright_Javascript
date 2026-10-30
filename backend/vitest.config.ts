import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: "mysql://root:admin@localhost:3306/healthcare_db_test",
      PORT: "4001",
      FRONTEND_ORIGIN: "http://localhost:5173",
      NODE_ENV: "test",
      CLINIC_TIMEZONE: "Asia/Kolkata",
    },
    globalSetup: "./tests/globalSetup.ts",
  },
});
