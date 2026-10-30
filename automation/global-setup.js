const fs = require("fs");
const path = require("path");

/**
 * Starts a new data run. Tests read this file and never reuse a previous run id.
 * @param {import("@playwright/test").FullConfig} _config
 */
async function globalSetup(_config) {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedDir = path.join(__dirname, "test-data", "generated", runId);
  fs.mkdirSync(generatedDir, { recursive: true });

  const manifest = {
    runId,
    startedAt: new Date().toISOString(),
    note: "Fictional records created for this Playwright run only.",
  };

  fs.writeFileSync(path.join(generatedDir, "run.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(__dirname, "test-data", "generated", "latest-run.json"),
    JSON.stringify(manifest, null, 2),
  );
}

module.exports = globalSetup;
