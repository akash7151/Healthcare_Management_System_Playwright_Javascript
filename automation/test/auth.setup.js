const fs = require("fs");
const { test: setup, expect } = require("@playwright/test");
const { users } = require("../test-data/users.data");
const { authDir, authPath } = require("../utils/auth-path");

const accounts = [
  ["admin", users.admin],
  ["receptionist", users.receptionist],
  ["billing", users.billing],
  ["patient", users.patient],
];

setup.beforeAll(() => {
  fs.mkdirSync(authDir, { recursive: true });
});

for (const [role, user] of accounts) {
  setup(`sign in ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.context().storageState({ path: authPath(role) });
  });
}
