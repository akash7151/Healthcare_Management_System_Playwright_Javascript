/**
 * Stable demo sign-in accounts. Business records (patients, visits) are not listed here.
 * Each execution builds those in test-data/factory.js.
 */
const password = process.env.E2E_PASSWORD || "DemoPass123!";

const users = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || "asha.menon@example.test",
    password,
    firstName: process.env.E2E_ADMIN_FIRST_NAME || "Asha",
    lastName: process.env.E2E_ADMIN_LAST_NAME || "Menon",
    role: "Administrator",
  },
  receptionist: {
    email: process.env.E2E_RECEPTIONIST_EMAIL || "lata.kulkarni@example.test",
    password,
    firstName: "Lata",
    lastName: "Kulkarni",
    role: "Receptionist",
  },
  billing: {
    email: process.env.E2E_BILLING_EMAIL || "vikram.desai@example.test",
    password,
    firstName: "Vikram",
    lastName: "Desai",
    role: "Billing staff",
  },
  patient: {
    email: process.env.E2E_PATIENT_EMAIL || "ravi.nair@example.test",
    password,
    firstName: "Ravi",
    lastName: "Nair",
    role: "Patient",
  },
};

module.exports = { users, password };
