const fs = require("fs");
const path = require("path");
const { futureWeekday } = require("../utils/clinic-date");
const { hashText } = require("../utils/text");

const FIRST_NAMES = ["Aarav", "Diya", "Kabir", "Mehul", "Sana", "Tara", "Ved", "Isha"];
const CITIES = ["Pune", "Kochi", "Jaipur", "Indore", "Surat"];
const DEMO_PASSWORD = "DemoPass123!";

function readRun() {
  const file = path.join(__dirname, "generated", "latest-run.json");
  if (!fs.existsSync(file)) {
    return {
      runId: `adhoc-${Date.now().toString(36)}`,
      startedAt: new Date().toISOString(),
    };
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeRecord(runId, record) {
  const dir = path.join(__dirname, "generated", runId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.kind}-${record.token}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  return { ...record, file };
}

/**
 * Builds fictional records that are unique to this run, worker, and call.
 * @param {{ workerIndex?: number, title?: string }} context
 */
function createFactory(context = {}) {
  const workerIndex = context.workerIndex ?? 0;
  const title = context.title ?? "test";
  let sequence = 0;

  function nextIdentity() {
    sequence += 1;
    const run = readRun();
    const token = `${run.runId}-w${workerIndex}-s${sequence}-${Date.now().toString(36)}`
      .replace(/[^a-z0-9]/gi, "")
      .slice(-16)
      .toLowerCase();
    const phone = `9${String(Date.now()).slice(-7)}${workerIndex % 10}${sequence % 10}`.slice(0, 10);
    return { run, token, phone };
  }

  return {
    runId() {
      return readRun().runId;
    },

    newUnknownLogin() {
      const { run, token } = nextIdentity();
      return writeRecord(run.runId, {
        kind: "login",
        runId: run.runId,
        token,
        email: `missing.${token}@example.test`,
        password: "not-a-real-password",
        createdAt: new Date().toISOString(),
      });
    },

    newPatient(overrides = {}) {
      const { run, token, phone } = nextIdentity();
      const day = String((sequence % 27) + 1).padStart(2, "0");
      const firstName = FIRST_NAMES[sequence % FIRST_NAMES.length];
      const lastName = `A0${token.slice(0, 10)}`;
      const patient = {
        kind: "patient",
        runId: run.runId,
        token,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        dateOfBirth: `1990-06-${day}`,
        sex: sequence % 2 === 0 ? "female" : "male",
        phone,
        email: `pw.${token}@example.test`,
        addressLine: `${(sequence % 80) + 11} Demo Lane`,
        city: CITIES[sequence % CITIES.length],
        createdAt: new Date().toISOString(),
        ...overrides,
      };
      if (overrides.firstName || overrides.lastName) {
        patient.fullName = `${patient.firstName} ${patient.lastName}`;
      }
      return writeRecord(run.runId, patient);
    },

    newVisit() {
      const { run, token } = nextIdentity();
      const spread = (hashText(`${run.runId}:${title}`) % 20) + workerIndex * 4 + sequence * 6;
      return writeRecord(run.runId, {
        kind: "visit",
        runId: run.runId,
        token,
        date: futureWeekday(spread),
        reason: `Demo visit ${token}`,
        createdAt: new Date().toISOString(),
      });
    },

    newDoctor() {
      const { run, token } = nextIdentity();
      const firstName = FIRST_NAMES[sequence % FIRST_NAMES.length];
      const lastName = `A0${token.slice(0, 8)}`;
      return writeRecord(run.runId, {
        kind: "doctor",
        runId: run.runId,
        token,
        email: `dr.${token}@example.test`,
        password: DEMO_PASSWORD,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        role: "Doctor",
        licenseNumber: `LIC${token.slice(0, 12).toUpperCase()}`,
        specialty: "General medicine",
        department: "Outpatient",
        qualification: "MBBS",
        createdAt: new Date().toISOString(),
      });
    },

    newStaff() {
      const { run, token } = nextIdentity();
      const firstName = "Nila";
      const lastName = `A0${token.slice(0, 8)}`;
      return writeRecord(run.runId, {
        kind: "staff",
        runId: run.runId,
        token,
        email: `staff.${token}@example.test`,
        password: DEMO_PASSWORD,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        role: "RECEPTIONIST",
        createdAt: new Date().toISOString(),
      });
    },

    newMedication() {
      const { run, token } = nextIdentity();
      return writeRecord(run.runId, {
        kind: "medication",
        runId: run.runId,
        token,
        name: `A0med${token.slice(0, 8)}`,
        strength: "250 mg",
        form: "tablet",
        batch: `B${token.slice(0, 12).toUpperCase()}`,
        quantity: 30,
        expiry: "2028-12-31",
        location: "Main pharmacy",
        createdAt: new Date().toISOString(),
      });
    },

    newChart() {
      const { run, token } = nextIdentity();
      return writeRecord(run.runId, {
        kind: "chart",
        runId: run.runId,
        token,
        notes: `Consultation ${token} for a fictional visit.`,
        examinationNotes: `Examination ${token}. No acute finding.`,
        treatmentNotes: `Treatment plan ${token}. Rest and fluids.`,
        code: "J06",
        description: `Fictional illness ${token}`,
        systolic: "120",
        diastolic: "80",
        heartRate: "72",
        temperature: "36.8",
        createdAt: new Date().toISOString(),
      });
    },

    newPrescription() {
      const { run, token } = nextIdentity();
      return writeRecord(run.runId, {
        kind: "prescription",
        runId: run.runId,
        token,
        dosage: "1 tablet",
        frequency: "twice daily",
        duration: "3 days",
        quantity: "2",
        instructions: `Take with water ${token}`,
        createdAt: new Date().toISOString(),
      });
    },

    newInvoice() {
      const { run, token } = nextIdentity();
      return writeRecord(run.runId, {
        kind: "invoice",
        runId: run.runId,
        token,
        description: `Consultation ${token}`,
        quantity: "1",
        unitPrice: "500.00",
        discount: "0.00",
        amount: "500.00",
        createdAt: new Date().toISOString(),
      });
    },
  };
}

module.exports = { createFactory };
