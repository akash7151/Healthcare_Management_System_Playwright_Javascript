const { test, expect } = require("../fixtures/test.fixture");
const { selectByText } = require("../utils/form");
const { authPath, signedOut } = require("../utils/auth-path");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

function primaryLinks(page, name) {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name });
}

test.describe("negative sign-in", () => {
  test.use({ storageState: signedOut });

  test("rejects an unknown email", async ({ loginPage, factory }) => {
    const login = factory.newUnknownLogin();
    await loginPage.signIn(login.email, login.password);
    await loginPage.expectError("Invalid email or password");
  });
});

test.describe("negative patients", () => {
  test.use({ storageState: authPath("receptionist") });

  test("rejects a phone number that is too short", async ({ page, patientsPage, factory }) => {
    const patient = factory.newPatient();
    await patientsPage.openList();
    await patientsPage.startRegistration();
    await patientsPage.fill({ ...patient, phone: "123" });
    await patientsPage.save();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Register patient" })).toBeVisible();
  });
});

test.describe("negative appointments", () => {
  test.use({ storageState: authPath("receptionist") });

  test("marks a taken slot as booked", async ({ appointmentsPage, factory }) => {
    const visit = factory.newVisit();
    await appointmentsPage.book({
      patientName: "Nina Dsouza",
      doctorName: "Meera Iyer",
      date: visit.date,
      reason: visit.reason,
    });
    await appointmentsPage.expectSlotAlreadyBooked({
      patientName: "Omar Sheikh",
      doctorName: "Meera Iyer",
      date: visit.date,
    });
  });
});

test.describe("negative patient access", () => {
  test.use({ storageState: authPath("patient") });

  test("hides administration from a patient account", async ({ page }) => {
    await expect(primaryLinks(page, "Users")).toHaveCount(0);
    await expect(primaryLinks(page, "Pharmacy")).toHaveCount(0);
    await expect(primaryLinks(page, "Doctors")).toHaveCount(0);
    await page.goto("/users");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
    await page.goto("/pharmacy");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
  });
});

test.describe("negative staff access", () => {
  test.use({ storageState: authPath("receptionist") });

  test("keeps a receptionist out of user administration", async ({ page }) => {
    await expect(primaryLinks(page, "Users")).toHaveCount(0);
    await page.goto("/users");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
    await page.goto("/records/new");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
  });
});

test.describe("negative prescriptions", () => {
  test.use({ storageState: authPath("admin") });

  test("blocks an administrator who is not a clinician from issuing a prescription", async ({ page }) => {
    await page.goto("/prescriptions/new");
    await expect(page.getByRole("heading", { name: "Issue prescription" })).toBeVisible();
    await selectByText(page.getByLabel("Patient"), "Ravi Nair");
    await selectByText(page.getByLabel("Medication"), "Paracetamol");
    await page.getByLabel("Dosage").fill("1 tablet");
    await page.getByLabel("Frequency").fill("once daily");
    await page.getByLabel("Duration").fill("2 days");
    await page.getByLabel("Quantity").fill("1");
    await page.getByLabel("Instructions").fill("Do not issue this from an administrator account");
    await page.getByRole("button", { name: "Issue prescription" }).click();
    await expect(page.getByRole("alert")).toContainText("Only an authorized clinician can issue a prescription");
  });
});
