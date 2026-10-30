import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "DemoPass123!";
const BLOCKING_STATUSES = new Set([
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

async function main() {
  const roles = await prisma.role.count();
  const permissions = await prisma.permission.count();
  assert(roles === 5, `Expected 5 roles, found ${roles}`);
  assert(permissions === 17, `Expected 17 permissions, found ${permissions}`);

  const adminGrants = await prisma.rolePermission.count({
    where: { role: { name: "ADMIN" } },
  });
  assert(adminGrants === permissions, "Admin is missing a permission grant");

  const patient = await prisma.patient.findUnique({ where: { patientCode: "P-10001" } });
  assert(patient, "Seed patient P-10001 is missing");

  const user = await prisma.user.findUnique({ where: { email: "asha.menon@example.test" } });
  assert(user, "Seed admin user is missing");
  assert(user.passwordHash !== DEMO_PASSWORD, "Password was stored in plaintext");
  assert(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash), "Password hash does not verify");

  const appointments = await prisma.appointment.findMany({
    where: { status: { in: ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] } },
    orderBy: { startsAt: "asc" },
  });
  const byDoctor = new Map<string, typeof appointments>();
  for (const appointment of appointments) {
    assert(BLOCKING_STATUSES.has(appointment.status), "Unexpected appointment status");
    const group = byDoctor.get(appointment.doctorId) ?? [];
    for (const other of group) {
      assert(
        !overlaps(other.startsAt, other.endsAt, appointment.startsAt, appointment.endsAt),
        "Confirmed or scheduled appointments overlap",
      );
    }
    group.push(appointment);
    byDoctor.set(appointment.doctorId, group);
  }

  const schedules = await prisma.doctorSchedule.findMany();
  const scheduleGroups = new Map<string, typeof schedules>();
  for (const schedule of schedules) {
    assert(schedule.weekday >= 0 && schedule.weekday <= 6, "Weekday is out of range");
    assert(minutes(schedule.startTime) < minutes(schedule.endTime), "Schedule window is empty");
    const key = `${schedule.doctorId}:${schedule.weekday}`;
    const group = scheduleGroups.get(key) ?? [];
    for (const other of group) {
      const overlapsWindow =
        minutes(other.startTime) < minutes(schedule.endTime) &&
        minutes(schedule.startTime) < minutes(other.endTime);
      assert(!overlapsWindow, "Doctor schedule windows overlap");
    }
    group.push(schedule);
    scheduleGroups.set(key, group);
  }

  const batches = await prisma.inventoryBatch.findMany();
  assert(batches.length >= 2, "Inventory seed is missing");
  for (const batch of batches) {
    assert(batch.quantity >= 0, "Inventory quantity is negative");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: "INV-SEED-1001" },
    include: { lines: true, payments: true, refunds: true },
  });
  assert(invoice, "Seed invoice is missing");
  const lineSum = invoice.lines.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0));
  const paid = invoice.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  const refunded = invoice.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Prisma.Decimal(0));
  assert(lineSum.equals(invoice.subtotal), "Invoice line amounts do not match subtotal");
  const expectedTotal = invoice.subtotal.minus(invoice.discount).plus(invoice.tax);
  assert(expectedTotal.equals(invoice.total), "Invoice total is inconsistent");
  const expectedBalance = invoice.total.minus(paid).plus(refunded);
  assert(expectedBalance.equals(invoice.balance), "Invoice balance is inconsistent");
  assert(invoice.balance.greaterThan(0) && paid.greaterThan(0), "Partial payment example is incomplete");

  const audit = await prisma.auditLog.findFirst({
    where: { action: "SEED_BASELINE", entityId: "healthcare_db" },
  });
  assert(audit, "Baseline audit event is missing");

  console.log("Database checks passed.");
  console.log(
    JSON.stringify({
      roles,
      permissions,
      activeAppointments: appointments.length,
      inventoryBatches: batches.length,
      invoice: invoice.invoiceNumber,
      balance: invoice.balance.toFixed(2),
    }),
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "check_failed";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
