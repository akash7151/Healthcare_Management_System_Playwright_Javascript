const { test: base, expect } = require("@playwright/test");
const { createFactory } = require("../test-data/factory");
const { users } = require("../test-data/users.data");
const { LoginPage } = require("../pages/login.page");
const { DashboardPage } = require("../pages/dashboard.page");
const { PatientsPage } = require("../pages/patients.page");
const { DoctorsPage } = require("../pages/doctors.page");
const { AppointmentsPage } = require("../pages/appointments.page");
const { RecordsPage } = require("../pages/records.page");
const { PrescriptionsPage } = require("../pages/prescriptions.page");
const { PharmacyPage } = require("../pages/pharmacy.page");
const { BillingPage } = require("../pages/billing.page");
const { UsersPage } = require("../pages/users.page");
const { AuditPage } = require("../pages/audit.page");
const { ReportsPage } = require("../pages/reports.page");

const test = base.extend({
  factory: async ({}, use, testInfo) => {
    await use(
      createFactory({
        workerIndex: testInfo.workerIndex,
        title: testInfo.title,
      }),
    );
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  patientsPage: async ({ page }, use) => {
    await use(new PatientsPage(page));
  },
  appointmentsPage: async ({ page }, use) => {
    await use(new AppointmentsPage(page));
  },
  doctorsPage: async ({ page }, use) => {
    await use(new DoctorsPage(page));
  },
  recordsPage: async ({ page }, use) => {
    await use(new RecordsPage(page));
  },
  prescriptionsPage: async ({ page }, use) => {
    await use(new PrescriptionsPage(page));
  },
  pharmacyPage: async ({ page }, use) => {
    await use(new PharmacyPage(page));
  },
  billingPage: async ({ page }, use) => {
    await use(new BillingPage(page));
  },
  usersPage: async ({ page }, use) => {
    await use(new UsersPage(page));
  },
  auditPage: async ({ page }, use) => {
    await use(new AuditPage(page));
  },
  reportsPage: async ({ page }, use) => {
    await use(new ReportsPage(page));
  },
});

/**
 * @param {import("../pages/login.page").LoginPage} loginPage
 * @param {import("../pages/dashboard.page").DashboardPage} dashboardPage
 * @param {{ email: string, password: string }} user
 */
async function signInAs(loginPage, dashboardPage, user) {
  await loginPage.signIn(user.email, user.password);
  await dashboardPage.expectLoaded();
}

/**
 * @param {import("../pages/login.page").LoginPage} loginPage
 * @param {import("../pages/dashboard.page").DashboardPage} dashboardPage
 * @param {{ email: string, password: string, firstName: string, lastName: string, role: string }} user
 */
async function switchAccount(loginPage, dashboardPage, user) {
  const logout = dashboardPage.page.getByRole("button", { name: "Log out" });
  if (await logout.isVisible()) {
    await dashboardPage.logout();
  }
  await signInAs(loginPage, dashboardPage, user);
  await dashboardPage.expectSignedInAs(user);
}

module.exports = { test, expect, signInAs, switchAccount, users };
