const { test, expect, signInAs, users } = require("../fixtures/test.fixture");
const { signedOut } = require("../utils/auth-path");

test.use({ storageState: signedOut });
test.describe.configure({ mode: "serial" });

function apiRoot(baseURL) {
  const configured = process.env.API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return String(baseURL || "").replace(/\/$/, "");
}

async function readReadyJson(request, url) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request.get(url, { timeout: 20_000, failOnStatusCode: false });
    lastStatus = response.status();
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      if (response.ok() && (body.status === "ok" || body.status === "ready")) {
        return body;
      }
    } catch {
      // A free host can return an HTML splash while it wakes up.
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Service did not return JSON status. Last HTTP status: ${lastStatus}.`);
}

test.describe("staging smoke", () => {
  test("API health and readiness", async ({ request, baseURL }) => {
    test.setTimeout(180_000);
    const root = apiRoot(baseURL);
    const health = await readReadyJson(request, `${root}/api/health`);
    expect(health.status).toBe("ok");
    const ready = await readReadyJson(request, `${root}/api/ready`);
    expect(ready.status).toBe("ready");
  });

  test("rejects an invalid login", async ({ loginPage }) => {
    await loginPage.signIn("nobody@example.test", "invalid-login-attempt");
    await loginPage.expectError("Invalid email or password");
  });

  test("administrator signs in and signs out", async ({ loginPage, dashboardPage }) => {
    await signInAs(loginPage, dashboardPage, users.admin);
    await dashboardPage.expectSignedInAs(users.admin);
    await dashboardPage.logout();
  });

  test("receptionist can open patients and appointments", async ({ page, loginPage, dashboardPage, patientsPage }) => {
    await signInAs(loginPage, dashboardPage, users.receptionist);
    await patientsPage.openList();
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/users");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
    await page.goto("/billing");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
  });

  test("billing staff can open billing and not user administration", async ({ page, loginPage, dashboardPage, billingPage }) => {
    await signInAs(loginPage, dashboardPage, users.billing);
    await billingPage.openList();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/users");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
    await page.goto("/records/new");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
  });

  test("patient account cannot open administration", async ({ page, loginPage, dashboardPage }) => {
    await signInAs(loginPage, dashboardPage, users.patient);
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/users");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  });
});
