/**
 * Stable demo sign-in accounts. Business records (patients, visits) are not listed here.
 * Each execution builds those in test-data/factory.js.
 */
const password = "DemoPass123!";

const users = {
  admin: {
    email: "new.admin@example.test",
    password,
    firstName: "New",
    lastName: "Admin",
    role: "Administrator",
  },
  receptionist: {
    email: "lata.kulkarni@example.test",
    password,
    firstName: "Lata",
    lastName: "Kulkarni",
    role: "Receptionist",
  },
  billing: {
    email: "vikram.desai@example.test",
    password,
    firstName: "Vikram",
    lastName: "Desai",
    role: "Billing staff",
  },
  patient: {
    email: "ravi.nair@example.test",
    password,
    firstName: "Ravi",
    lastName: "Nair",
    role: "Patient",
  },
};

module.exports = { users, password };
