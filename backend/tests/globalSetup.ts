import { execFileSync } from "child_process";
import path from "path";

const databaseUrl = "mysql://root:admin@localhost:3306/healthcare_db_test";

export default function setup(): void {
  execFileSync(
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
    [
      "-u",
      "root",
      "-padmin",
      "-e",
      "CREATE DATABASE IF NOT EXISTS healthcare_db_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    ],
    { stdio: "inherit" },
  );
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
    shell: true,
  });
}
