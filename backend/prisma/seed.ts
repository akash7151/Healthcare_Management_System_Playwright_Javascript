import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type AppointmentStatus } from "@prisma/client";

const prisma = new PrismaClient();

/** Fictional local demo password. Never log this value. */
const DEMO_PASSWORD = "DemoPass123!";

const PERMISSIONS: Array<[string, string]> = [
  ["patients:read", "View patient demographics"],
  ["patients:write", "Register and update patients"],
  ["doctors:read", "View doctor profiles and schedules"],
  ["doctors:write", "Maintain doctor profiles and schedules"],
  ["appointments:read", "View appointments"],
  ["appointments:write", "Book, reschedule, and cancel appointments"],
  ["records:read", "Read clinical records"],
  ["records:write", "Write clinical records"],
  ["prescriptions:read", "Read prescriptions"],
  ["prescriptions:write", "Create prescriptions"],
  ["pharmacy:read", "View pharmacy inventory"],
  ["pharmacy:write", "Adjust pharmacy inventory"],
  ["billing:read", "View invoices and payments"],
  ["billing:write", "Create invoices and record payments"],
  ["reports:read", "View operational reports"],
  ["users:manage", "Manage users and roles"],
  ["audit:read", "View audit logs"],
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map(([code]) => code),
  DOCTOR: [
    "patients:read",
    "doctors:read",
    "appointments:read",
    "appointments:write",
    "records:read",
    "records:write",
    "prescriptions:read",
    "prescriptions:write",
    "pharmacy:read",
  ],
  RECEPTIONIST: [
    "patients:read",
    "patients:write",
    "doctors:read",
    "appointments:read",
    "appointments:write",
  ],
  PATIENT: ["patients:read", "appointments:read", "prescriptions:read", "billing:read"],
  BILLING_STAFF: ["patients:read", "billing:read", "billing:write", "reports:read"],
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Full operational access",
  DOCTOR: "Clinical care for assigned patients",
  RECEPTIONIST: "Registration and scheduling",
  PATIENT: "Own portal access",
  BILLING_STAFF: "Invoices and payments",
};

type DemoUser = {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

const USERS: DemoUser[] = [
  { email: "asha.menon@example.test", firstName: "Asha", lastName: "Menon", role: "ADMIN" },
  { email: "meera.iyer@example.test", firstName: "Meera", lastName: "Iyer", role: "DOCTOR" },
  { email: "rohan.kapoor@example.test", firstName: "Rohan", lastName: "Kapoor", role: "DOCTOR" },
  { email: "lata.kulkarni@example.test", firstName: "Lata", lastName: "Kulkarni", role: "RECEPTIONIST" },
  { email: "vikram.desai@example.test", firstName: "Vikram", lastName: "Desai", role: "BILLING_STAFF" },
  { email: "ravi.nair@example.test", firstName: "Ravi", lastName: "Nair", role: "PATIENT" },
  { email: "nina.dsouza@example.test", firstName: "Nina", lastName: "Dsouza", role: "PATIENT" },
];

function money(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.$transaction(async (tx) => {
    for (const [code, description] of PERMISSIONS) {
      await tx.permission.upsert({
        where: { code },
        update: { description },
        create: { code, description },
      });
    }

    const storedPermissions = await tx.permission.findMany();
    const permissionIds = new Map(storedPermissions.map((item) => [item.code, item.id]));

    const roles = new Map<string, string>();
    for (const [name, description] of Object.entries(ROLE_DESCRIPTIONS)) {
      const role = await tx.role.upsert({
        where: { name },
        update: { description },
        create: { name, description },
      });
      roles.set(name, role.id);
      const codes = ROLE_PERMISSIONS[name] ?? [];
      await tx.rolePermission.createMany({
        data: codes.map((code) => {
          const permissionId = permissionIds.get(code);
          if (!permissionId) {
            throw new Error(`Missing permission ${code}`);
          }
          return { roleId: role.id, permissionId };
        }),
        skipDuplicates: true,
      });
    }

    const users = new Map<string, string>();
    for (const person of USERS) {
      const roleId = roles.get(person.role);
      if (!roleId) {
        throw new Error(`Missing role ${person.role}`);
      }
      const user = await tx.user.upsert({
        where: { email: person.email },
        update: {},
        create: {
          email: person.email,
          passwordHash,
          firstName: person.firstName,
          lastName: person.lastName,
          roleId,
          status: "ACTIVE",
        },
      });
      users.set(person.email, user.id);
    }

    const meeraId = users.get("meera.iyer@example.test");
    const rohanId = users.get("rohan.kapoor@example.test");
    const raviUserId = users.get("ravi.nair@example.test");
    const ninaUserId = users.get("nina.dsouza@example.test");
    const adminId = users.get("asha.menon@example.test");
    const receptionistId = users.get("lata.kulkarni@example.test");
    if (!meeraId || !rohanId || !raviUserId || !ninaUserId || !adminId || !receptionistId) {
      throw new Error("Seed users were not created");
    }

    const meera = await tx.doctor.upsert({
      where: { licenseNumber: "MH-DEMO-1001" },
      update: {},
      create: {
        userId: meeraId,
        licenseNumber: "MH-DEMO-1001",
        specialty: "General Medicine",
        department: "Outpatient",
      },
    });
    const rohan = await tx.doctor.upsert({
      where: { licenseNumber: "MH-DEMO-1002" },
      update: {},
      create: {
        userId: rohanId,
        licenseNumber: "MH-DEMO-1002",
        specialty: "Pediatrics",
        department: "Child Health",
      },
    });

    await ensureSchedule(tx, meera.id, [1, 2, 3, 4, 5], "09:00", "13:00", 30);
    await ensureSchedule(tx, rohan.id, [1, 2, 3, 4, 5], "14:00", "17:00", 20);

    const ravi = await tx.patient.upsert({
      where: { patientCode: "P-10001" },
      update: {},
      create: {
        patientCode: "P-10001",
        userId: raviUserId,
        firstName: "Ravi",
        lastName: "Nair",
        dateOfBirth: dateOnly("1988-03-14"),
        sex: "male",
        phone: "9000000101",
        email: "ravi.nair@example.test",
        addressLine: "12 Lake View Road",
        city: "Pune",
      },
    });
    const nina = await tx.patient.upsert({
      where: { patientCode: "P-10002" },
      update: {},
      create: {
        patientCode: "P-10002",
        userId: ninaUserId,
        firstName: "Nina",
        lastName: "Dsouza",
        dateOfBirth: dateOnly("1995-11-02"),
        sex: "female",
        phone: "9000000102",
        email: "nina.dsouza@example.test",
        addressLine: "48 Hill Court",
        city: "Nagpur",
      },
    });
    await tx.patient.upsert({
      where: { patientCode: "P-10003" },
      update: {},
      create: {
        patientCode: "P-10003",
        firstName: "Omar",
        lastName: "Sheikh",
        dateOfBirth: dateOnly("1979-07-21"),
        sex: "male",
        phone: "9000000103",
        addressLine: "7 Station Road",
        city: "Nashik",
      },
    });

    const allergy = await tx.allergy.findFirst({
      where: { patientId: ravi.id, substance: "Penicillin" },
    });
    if (!allergy) {
      await tx.allergy.create({
        data: {
          patientId: ravi.id,
          substance: "Penicillin",
          severity: "moderate",
          notes: "Fictional demo allergy. Rash reported after a past course.",
        },
      });
    }

    const raviVisit = await ensureAppointment(tx, {
      patientId: ravi.id,
      doctorId: meera.id,
      startsAt: new Date("2026-11-02T09:00:00+05:30"),
      endsAt: new Date("2026-11-02T09:30:00+05:30"),
      status: "CONFIRMED",
      reason: "Demo: headache follow-up",
    });
    await ensureAppointment(tx, {
      patientId: nina.id,
      doctorId: meera.id,
      startsAt: new Date("2026-11-02T10:00:00+05:30"),
      endsAt: new Date("2026-11-02T10:30:00+05:30"),
      status: "CONFIRMED",
      reason: "Demo: wellness visit",
    });
    await ensureAppointment(tx, {
      patientId: nina.id,
      doctorId: rohan.id,
      startsAt: new Date("2026-11-03T14:00:00+05:30"),
      endsAt: new Date("2026-11-03T14:20:00+05:30"),
      status: "CANCELLED",
      reason: "Demo: cancelled pediatric slot",
    });

    const paracetamol = await tx.medication.upsert({
      where: {
        name_strength_form: {
          name: "Paracetamol",
          strength: "500 mg",
          form: "tablet",
        },
      },
      update: {},
      create: { name: "Paracetamol", strength: "500 mg", form: "tablet" },
    });
    const amoxicillin = await tx.medication.upsert({
      where: {
        name_strength_form: {
          name: "Amoxicillin",
          strength: "250 mg",
          form: "capsule",
        },
      },
      update: {},
      create: { name: "Amoxicillin", strength: "250 mg", form: "capsule" },
    });

    await tx.inventoryBatch.upsert({
      where: {
        medicationId_batchNumber: { medicationId: paracetamol.id, batchNumber: "B-SEED-01" },
      },
      update: {},
      create: {
        medicationId: paracetamol.id,
        batchNumber: "B-SEED-01",
        quantity: 120,
        expiryDate: dateOnly("2027-12-31"),
        location: "Main pharmacy",
      },
    });
    await tx.inventoryBatch.upsert({
      where: {
        medicationId_batchNumber: { medicationId: amoxicillin.id, batchNumber: "B-SEED-02" },
      },
      update: {},
      create: {
        medicationId: amoxicillin.id,
        batchNumber: "B-SEED-02",
        quantity: 40,
        expiryDate: dateOnly("2027-06-30"),
        location: "Main pharmacy",
      },
    });

    let encounter = await tx.encounter.findUnique({
      where: { appointmentId: raviVisit.id },
    });
    if (!encounter) {
      encounter = await tx.encounter.create({
        data: {
          patientId: ravi.id,
          doctorId: meera.id,
          appointmentId: raviVisit.id,
          notes:
            "Fictional demo note. Reports a mild headache for two days. No red-flag symptoms recorded.",
          vitals: {
            create: {
              systolic: 120,
              diastolic: 80,
              heartRate: 76,
              temperature: money("36.8"),
              recordedAt: new Date("2026-11-02T09:05:00+05:30"),
            },
          },
          diagnoses: {
            create: { code: "R51", description: "Headache" },
          },
        },
      });
    }

    const existingPrescription = await tx.prescription.findFirst({
      where: { encounterId: encounter.id },
    });
    if (!existingPrescription) {
      await tx.prescription.create({
        data: {
          patientId: ravi.id,
          doctorId: meera.id,
          encounterId: encounter.id,
          status: "ISSUED",
          items: {
            create: {
              medicationId: paracetamol.id,
              dosage: "500 mg",
              frequency: "Twice daily",
              duration: "5 days",
              quantity: 10,
              instructions: "Take after food",
            },
          },
        },
      });
    }

    const subtotal = money("600.00");
    const discount = money("50.00");
    const tax = money("0.00");
    const total = money("550.00");
    const paid = money("200.00");
    const balance = money("350.00");

    const invoice = await tx.invoice.upsert({
      where: { invoiceNumber: "INV-SEED-1001" },
      update: {},
      create: {
        invoiceNumber: "INV-SEED-1001",
        patientId: ravi.id,
        appointmentId: raviVisit.id,
        status: "PARTIALLY_PAID",
        currency: "INR",
        subtotal,
        discount,
        tax,
        total,
        balance,
        lines: {
          create: [
            {
              description: "General consultation",
              quantity: 1,
              unitPrice: money("500.00"),
              amount: money("500.00"),
            },
            {
              description: "Registration",
              quantity: 1,
              unitPrice: money("100.00"),
              amount: money("100.00"),
            },
          ],
        },
      },
    });

    await tx.payment.upsert({
      where: { reference: "PAY-SEED-1001" },
      update: {},
      create: {
        invoiceId: invoice.id,
        amount: paid,
        method: "UPI",
        reference: "PAY-SEED-1001",
        paidAt: new Date("2026-11-02T09:40:00+05:30"),
      },
    });

    const baseline = await tx.auditLog.findFirst({
      where: { action: "SEED_BASELINE", entityType: "Database", entityId: "healthcare_db" },
    });
    if (!baseline) {
      await tx.auditLog.create({
        data: {
          actorUserId: adminId,
          action: "SEED_BASELINE",
          entityType: "Database",
          entityId: "healthcare_db",
        },
      });
    }

    const notice = await tx.notification.findFirst({
      where: { userId: receptionistId, title: "Demo clinic calendar is ready" },
    });
    if (!notice) {
      await tx.notification.create({
        data: {
          userId: receptionistId,
          title: "Demo clinic calendar is ready",
          body: "Fictional seed data is loaded for local development.",
        },
      });
    }
  }, { timeout: 30000 });

  const [users, patients, doctors, appointments] = await Promise.all([
    prisma.user.count(),
    prisma.patient.count(),
    prisma.doctor.count(),
    prisma.appointment.count(),
  ]);
  console.log(
    `Seed complete. Users ${users}, patients ${patients}, doctors ${doctors}, appointments ${appointments}.`,
  );
}

async function ensureSchedule(
  tx: Prisma.TransactionClient,
  doctorId: string,
  weekdays: number[],
  startTime: string,
  endTime: string,
  slotMinutes: number,
) {
  for (const weekday of weekdays) {
    const existing = await tx.doctorSchedule.findFirst({
      where: { doctorId, weekday, startTime, endTime },
    });
    if (!existing) {
      await tx.doctorSchedule.create({
        data: { doctorId, weekday, startTime, endTime, slotMinutes },
      });
    }
  }
}

async function ensureAppointment(
  tx: Prisma.TransactionClient,
  input: {
    patientId: string;
    doctorId: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    reason: string;
  },
) {
  const existing = await tx.appointment.findFirst({
    where: {
      patientId: input.patientId,
      doctorId: input.doctorId,
      reason: input.reason,
    },
  });
  if (existing) {
    return existing;
  }
  return tx.appointment.create({ data: input });
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "seed_failed";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
