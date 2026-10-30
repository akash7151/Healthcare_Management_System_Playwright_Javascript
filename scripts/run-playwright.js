const { spawn } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2).map((arg) => {
  if (arg.startsWith("-")) return arg;
  return arg.replaceAll("\\", "/");
});

const cli = path.join(__dirname, "..", "node_modules", "@playwright", "test", "cli.js");
const env = { ...process.env };
if (args.includes("--headed")) env.HEADED = "1";

const child = spawn(process.execPath, [cli, "test", ...args], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
  env,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
