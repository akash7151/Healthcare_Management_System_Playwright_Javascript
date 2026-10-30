const { test, expect, signInAs, users } = require("../fixtures/test.fixture");
const { authPath, signedOut } = require("../utils/auth-path");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("positive sign-in", () => {
  test.use({ storageState: signedOut });

  test("administrator signs in and signs out", async ({ loginPage, dashboardPage }) => {
    await signInAs(loginPage, dashboardPage, users.admin);
    await dashboardPage.expectSignedInAs(users.admin);
    await expect(dashboardPage.page.getByRole("heading", { name: "Module status" })).toBeVisible();
    await dashboardPage.logout();
  });
});

test.describe("positive patients", () => {
  test.use({ storageState: authPath("receptionist") });

  test("registers, edits, and finds a new patient", async ({ page, patientsPage, factory }) => {
    const patient = factory.newPatient();
    await patientsPage.openList();
    await patientsPage.startRegistration();
    await patientsPage.fill(patient);
    await patientsPage.save();
    await patientsPage.expectProfile(patient.fullName);
    await patientsPage.editCity(patient.firstName, "Panaji");
    await patientsPage.expectProfile(patient.fullName);
    await expect(page.getByText("Panaji")).toBeVisible();
    await patientsPage.search(patient.phone);
  });
});

test.describe("positive doctors", () => {
  test.use({ storageState: authPath("admin") });

  test("adds a doctor and opens the saved profile", async ({ doctorsPage, factory }) => {
    const doctor = factory.newDoctor();
    await doctorsPage.create(doctor);
    await doctorsPage.find(doctor.licenseNumber, doctor.fullName);
  });
});

test.describe("positive appointments", () => {
  test.use({ storageState: authPath("receptionist") });

  test("books an open slot", async ({ appointmentsPage, factory }) => {
    const visit = factory.newVisit();
    await appointmentsPage.book({
      patientName: "Ravi Nair",
      doctorName: "Meera Iyer",
      date: visit.date,
      reason: visit.reason,
    });
  });
});

test.describe("positive pharmacy", () => {
  test.use({ storageState: authPath("admin") });

  test("adds a medication and receives a batch", async ({ pharmacyPage, factory }) => {
    await pharmacyPage.addAndReceive(factory.newMedication());
  });
});

test.describe("positive users", () => {
  test.use({ storageState: authPath("admin") });

  test("creates a staff account and restores it after deactivation", async ({ usersPage, factory }) => {
    await usersPage.createAndToggle(factory.newStaff());
  });
});

test.describe("positive billing", () => {
  test.use({ storageState: authPath("billing") });

  test("creates an invoice and records full payment", async ({ billingPage, factory }) => {
    const invoice = factory.newInvoice();
    await billingPage.createAndPay("Ravi Nair", invoice);
    await billingPage.findPatient("Nair");
  });
});

test.describe("positive reports", () => {
  test.use({ storageState: authPath("admin") });

  test("opens clinic reports and downloads the patient export", async ({ reportsPage, dashboardPage }) => {
    await reportsPage.open();
    await reportsPage.downloadPatients("Ravi");
    await dashboardPage.open();
  });
});
