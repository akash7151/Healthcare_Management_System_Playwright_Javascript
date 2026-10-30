import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const password = "DemoPass123!";

async function resetDatabase(): Promise<void> {
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.diagnosis.deleteMany();
  await prisma.vitalSign.deleteMany();
  await prisma.encounter.deleteMany();
  await prisma.allergy.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.doctorSchedule.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
}

async function grant(roleName: string, codes: string[]): Promise<string> {
  const role = await prisma.role.create({
    data: { name: roleName, description: roleName },
  });
  for (const code of codes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  return role.id;
}

describe("clinic API", () => {
  let app: Express.Application;

  beforeAll(async () => {
    const loaded = await import("../src/app");
    app = loaded.app;
    await resetDatabase();
    const passwordHash = await hashPassword(password);
    const adminRole = await grant("ADMIN", [
      "patients:read",
      "patients:write",
      "doctors:read",
      "doctors:write",
      "appointments:read",
      "appointments:write",
      "records:read",
      "records:write",
      "prescriptions:read",
      "prescriptions:write",
      "pharmacy:read",
      "pharmacy:write",
      "billing:read",
      "billing:write",
      "reports:read",
      "users:manage",
      "audit:read",
    ]);
    const receptionistRole = await grant("RECEPTIONIST", [
      "patients:read",
      "patients:write",
      "doctors:read",
      "appointments:read",
      "appointments:write",
    ]);
    const patientRole = await grant("PATIENT", ["patients:read", "appointments:read", "billing:read"]);
    const doctorRole = await grant("DOCTOR", ["records:read", "records:write", "patients:read", "appointments:read"]);
    await prisma.user.create({
      data: {
        email: "admin@example.test",
        passwordHash,
        firstName: "Ada",
        lastName: "Admin",
        roleId: adminRole,
      },
    });
    await prisma.user.create({
      data: {
        email: "desk@example.test",
        passwordHash,
        firstName: "Rita",
        lastName: "Desk",
        roleId: receptionistRole,
      },
    });
    await prisma.user.create({
      data: {
        email: "locked@example.test",
        passwordHash,
        firstName: "Locked",
        lastName: "User",
        status: "DISABLED",
        roleId: patientRole,
      },
    });
    const portal = await prisma.user.create({
      data: {
        email: "patient@example.test",
        passwordHash,
        firstName: "Pat",
        lastName: "Portal",
        roleId: patientRole,
      },
    });
    await prisma.patient.create({
      data: {
        patientCode: "P-10001",
        userId: portal.id,
        firstName: "Pat",
        lastName: "Portal",
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        sex: "female",
        phone: "9000000001",
      },
    });
    const clinician = await prisma.user.create({
      data: {
        email: "doctor@example.test",
        passwordHash,
        firstName: "Dee",
        lastName: "Clinician",
        roleId: doctorRole,
        doctor: {
          create: {
            licenseNumber: "TEST-100",
            specialty: "General Medicine",
            department: "Outpatient",
            schedules: { create: { weekday: 1, startTime: "09:00", endTime: "13:00", slotMinutes: 30 } },
          },
        },
      },
    });
    void clinician;
  });

  it("rejects invalid credentials and disabled accounts", async () => {
    const invalid = await request(app).post("/api/auth/login").send({ email: "admin@example.test", password: "wrong-password" });
    expect(invalid.status).toBe(401);
    const disabled = await request(app).post("/api/auth/login").send({ email: "locked@example.test", password });
    expect(disabled.status).toBe(403);
  });

  it("signs in and blocks a patient from user administration", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email: "patient@example.test", password });
    expect(login.status).toBe(200);
    const users = await agent.get("/api/users");
    expect(users.status).toBe(403);
    const records = await agent.get("/api/medical-records");
    expect(records.status).toBe(403);
    await agent.post("/api/auth/logout");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("registers, searches, and updates a patient", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "desk@example.test", password });
    const created = await agent.post("/api/patients").send({
      firstName: "Test",
      lastName: "Person",
      dateOfBirth: "2001-04-04",
      sex: "male",
      phone: "9000000099",
      city: "Pune",
    });
    expect(created.status).toBe(201);
    expect(created.body.patientCode).toMatch(/^P-/);
    const missing = await agent.post("/api/patients").send({ firstName: "Test" });
    expect(missing.status).toBe(400);
    const found = await agent.get("/api/patients").query({ q: "9000000099" });
    expect(found.body.total).toBe(1);
    const updated = await agent.patch(`/api/patients/${created.body.id}`).send({
      firstName: "Test",
      lastName: "Person",
      dateOfBirth: "2001-04-04",
      sex: "male",
      phone: "9000000099",
      city: "Nashik",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.city).toBe("Nashik");
    const clinical = await agent.post("/api/medical-records").send({
      patientId: created.body.id,
      notes: "Reception should not write this note.",
    });
    expect(clinical.status).toBe(403);
  });

  it("prevents overlapping bookings and invalid status changes", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "admin@example.test", password });
    const doctor = await prisma.doctor.findFirst({ where: { licenseNumber: "TEST-100" } });
    const patient = await prisma.patient.findUnique({ where: { patientCode: "P-10001" } });
    expect(doctor && patient).toBeTruthy();
    const first = await agent.post("/api/appointments").send({
      patientId: patient?.id,
      doctorId: doctor?.id,
      startsAt: "2026-11-02T03:30:00.000Z",
      endsAt: "2026-11-02T04:00:00.000Z",
      reason: "First fictional visit",
    });
    expect(first.status).toBe(201);
    const clash = await agent.post("/api/appointments").send({
      patientId: patient?.id,
      doctorId: doctor?.id,
      startsAt: "2026-11-02T03:45:00.000Z",
      endsAt: "2026-11-02T04:15:00.000Z",
      reason: "Overlapping fictional visit",
    });
    expect(clash.status).toBe(409);
    const badStatus = await agent.patch(`/api/appointments/${first.body.id}`).send({ status: "COMPLETED" });
    expect(badStatus.status).toBe(400);
    const moved = await agent.patch(`/api/appointments/${first.body.id}`).send({
      startsAt: "2026-11-02T04:30:00.000Z",
      endsAt: "2026-11-02T05:00:00.000Z",
    });
    expect(moved.status).toBe(200);
    const cancelled = await agent.patch(`/api/appointments/${first.body.id}`).send({ status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
  });

  it("calculates invoices, accepts a partial payment, and rejects a duplicate reference", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "admin@example.test", password });
    const patient = await prisma.patient.findUnique({ where: { patientCode: "P-10001" } });
    const invoice = await agent.post("/api/invoices").send({
      patientId: patient?.id,
      discount: "50.00",
      taxRatePercent: 0,
      lines: [
        { description: "Consultation", quantity: 1, unitPrice: "500.00" },
        { description: "Registration", quantity: 1, unitPrice: "100.00" },
      ],
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.total).toBe("550.00");
    expect(invoice.body.balance).toBe("550.00");
    const partial = await agent.post(`/api/invoices/${invoice.body.id}/payments`).send({
      amount: "200.00",
      method: "UPI",
      reference: "PAY-TEST-200",
    });
    expect(partial.status).toBe(201);
    const duplicate = await agent.post(`/api/invoices/${invoice.body.id}/payments`).send({
      amount: "200.00",
      method: "UPI",
      reference: "PAY-TEST-200",
    });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.id).toBe(partial.body.id);
    const changed = await agent.post(`/api/invoices/${invoice.body.id}/payments`).send({
      amount: "10.00",
      method: "CASH",
      reference: "PAY-TEST-200",
    });
    expect(changed.status).toBe(409);
    const stored = await prisma.invoice.findUnique({ where: { id: invoice.body.id } });
    expect(stored?.balance.toFixed(2)).toBe("350.00");
    expect(stored?.status).toBe("PARTIALLY_PAID");
    const dashboard = await agent.get("/api/reports/dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.patients).toBeGreaterThan(0);
  });

  it("lets a clinician write a record and hides it from the receptionist", async () => {
    const doctor = request.agent(app);
    await doctor.post("/api/auth/login").send({ email: "doctor@example.test", password });
    const patient = await prisma.patient.findUnique({ where: { patientCode: "P-10001" } });
    const created = await doctor.post("/api/medical-records").send({
      patientId: patient?.id,
      notes: "Fictional note recorded by the assigned clinician.",
      diagnoses: [{ code: "R51", description: "Headache" }],
    });
    expect(created.status).toBe(201);
    const read = await doctor.get(`/api/medical-records/${created.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.notes).toContain("Fictional note");
    const desk = request.agent(app);
    await desk.post("/api/auth/login").send({ email: "desk@example.test", password });
    const hidden = await desk.get(`/api/medical-records/${created.body.id}`);
    expect(hidden.status).toBe(403);
  });
});
