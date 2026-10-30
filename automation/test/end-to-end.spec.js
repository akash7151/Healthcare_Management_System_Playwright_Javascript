const { test, expect, switchAccount, users } = require("../fixtures/test.fixture");
const { signedOut } = require("../utils/auth-path");

test.use({ storageState: signedOut });

test("clinic visit covers every module", async ({
  page,
  loginPage,
  dashboardPage,
  doctorsPage,
  pharmacyPage,
  usersPage,
  patientsPage,
  appointmentsPage,
  recordsPage,
  prescriptionsPage,
  auditPage,
  billingPage,
  reportsPage,
  factory,
}) => {
  test.setTimeout(180000);

  const doctor = factory.newDoctor();
  const medication = factory.newMedication();
  const staff = factory.newStaff();
  const patient = factory.newPatient();
  const otherPatient = factory.newPatient();
  const bookedVisit = factory.newVisit();
  const movedVisit = factory.newVisit();
  const chart = factory.newChart();
  const prescription = factory.newPrescription();
  const invoice = factory.newInvoice();

  await test.step("Authentication rejects an unknown email", async () => {
    const login = factory.newUnknownLogin();
    await loginPage.signIn(login.email, login.password);
    await loginPage.expectError("Invalid email or password");
  });

  await test.step("Dashboard opens for the administrator", async () => {
    await switchAccount(loginPage, dashboardPage, users.admin);
    await expect(page.getByRole("heading", { name: "Module status" })).toBeVisible();
  });

  await test.step("Doctors can be added and found again", async () => {
    await doctorsPage.create(doctor);
    await doctorsPage.find(doctor.licenseNumber, doctor.fullName);
  });

  await test.step("Pharmacy can catalog a medication and receive stock", async () => {
    await pharmacyPage.addAndReceive(medication);
  });

  await test.step("Users can be created, deactivated, and activated", async () => {
    await usersPage.createAndToggle(staff);
  });

  await test.step("Patients can be registered, edited, and searched", async () => {
    await switchAccount(loginPage, dashboardPage, users.receptionist);
    await patientsPage.openList();
    await patientsPage.startRegistration();
    await patientsPage.fill(patient);
    await patientsPage.save();
    await patientsPage.expectProfile(patient.fullName);
    await patientsPage.editCity(patient.firstName, "Panaji");
    await patientsPage.expectProfile(patient.fullName);
    await expect(page.getByText("Panaji")).toBeVisible();
    await patientsPage.search(patient.phone);

    await patientsPage.startRegistration();
    await patientsPage.fill(otherPatient);
    await patientsPage.save();
    await patientsPage.expectProfile(otherPatient.fullName);
  });

  let appointmentUrl = "";
  await test.step("Appointments block a taken slot and can be rescheduled", async () => {
    appointmentUrl = await appointmentsPage.book({
      patientName: patient.fullName,
      doctorName: doctor.fullName,
      date: bookedVisit.date,
      reason: bookedVisit.reason,
    });
    await appointmentsPage.expectSlotAlreadyBooked({
      patientName: otherPatient.fullName,
      doctorName: doctor.fullName,
      date: bookedVisit.date,
    });
    await appointmentsPage.open(appointmentUrl);
    await appointmentsPage.reschedule(movedVisit.date);
    await expect(page.getByText(bookedVisit.reason)).toBeVisible();
  });

  await test.step("The clinician completes the visit and writes the record", async () => {
    await switchAccount(loginPage, dashboardPage, doctor);
    await appointmentsPage.open(appointmentUrl);
    await appointmentsPage.advanceToCompleted();
    await recordsPage.create(patient.fullName, chart);
    await recordsPage.openList();
    await expect(page.getByText(patient.fullName).first()).toBeVisible();
  });

  await test.step("Prescriptions can be issued by the clinician", async () => {
    await prescriptionsPage.issue(patient.fullName, medication.name, prescription);
  });

  await test.step("Pharmacy dispenses the prescription and reduces stock", async () => {
    await switchAccount(loginPage, dashboardPage, users.admin);
    await prescriptionsPage.dispense(patient.fullName);
    await pharmacyPage.open();
    await pharmacyPage.expectOnHand(medication.name, medication.quantity - Number(prescription.quantity));
  });

  await test.step("Audit log records the visit", async () => {
    await auditPage.expectAction("PATIENT_CREATED");
    await auditPage.expectAction("USER_CREATED");
    await auditPage.expectAction("PRESCRIPTION_ISSUED");
  });

  await test.step("Billing creates an invoice and records payment", async () => {
    await switchAccount(loginPage, dashboardPage, users.billing);
    await billingPage.createAndPay(patient.fullName, invoice);
    await billingPage.findPatient(patient.lastName);
  });

  await test.step("Reports show the clinic totals and export patients", async () => {
    await switchAccount(loginPage, dashboardPage, users.admin);
    await reportsPage.open();
    await reportsPage.downloadPatients(patient.firstName);
    await dashboardPage.open();
  });

  await test.step("A patient account cannot open administration", async () => {
    await switchAccount(loginPage, dashboardPage, users.patient);
    await expect(primaryLinks(page, "Users")).toHaveCount(0);
    await expect(primaryLinks(page, "Pharmacy")).toHaveCount(0);
    await expect(primaryLinks(page, "Doctors")).toHaveCount(0);
    await page.goto("/users");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
    await page.goto("/pharmacy");
    await expect(page.getByRole("alert")).toContainText("cannot open this page");
  });
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
function primaryLinks(page, name) {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name });
}
