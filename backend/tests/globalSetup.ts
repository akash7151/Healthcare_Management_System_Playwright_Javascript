import { execFileSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../.env") });

function databaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error("Set TEST_DATABASE_URL to a dedicated database whose name ends with _test.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_]+$/.test(database) || !database.endsWith("_test")) {
    throw new Error("The test database name must use letters, numbers, and underscores, and must end with _test.");
  }
  return value;
}

function mysqlBinary(): string {
  if (process.env.MYSQL_BIN && existsSync(process.env.MYSQL_BIN)) {
    return process.env.MYSQL_BIN;
  }
  const windowsClient = "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe";
  if (existsSync(windowsClient)) {
    return windowsClient;
  }
  return "mysql";
}

export default function setup(): void {
  const value = databaseUrl();
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const password = decodeURIComponent(parsed.password);
  execFileSync(
    mysqlBinary(),
    [
      "-h",
      parsed.hostname,
      "-P",
      parsed.port || "3306",
      "-u",
      decodeURIComponent(parsed.username),
      "-e",
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, MYSQL_PWD: password },
    },
  );

  const migrateEnv = { ...process.env, DATABASE_URL: value };
  delete migrateEnv.MYSQL_PWD;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, ".."),
    env: migrateEnv,
    stdio: "inherit",
    shell: true,
  });
}
