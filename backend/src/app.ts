import cors from "cors";
import express from "express";
import helmet from "helmet";
import { prisma } from "./lib/prisma";
import { originAllowed } from "./lib/origins";
import { errorHandler } from "./middleware/errorHandler";
import { registerAppointmentRoutes } from "./modules/appointments/routes";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerBillingRoutes } from "./modules/billing/routes";
import { registerDoctorRoutes } from "./modules/doctors/routes";
import { registerPatientRoutes } from "./modules/patients/routes";
import { registerPharmacyRoutes } from "./modules/pharmacy/routes";
import { registerRecordRoutes } from "./modules/records/routes";
import { registerReportRoutes } from "./modules/reports/routes";
import { registerUserRoutes } from "./modules/users/routes";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, originAllowed(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/status", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [users, patients, doctors, appointments, invoices] = await Promise.all([
      prisma.user.count(),
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.appointment.count(),
      prisma.invoice.count(),
    ]);

    res.json({
      database: "up",
      counts: { users, patients, doctors, appointments, invoices },
    });
  } catch (error) {
    next(error);
  }
});

registerAuthRoutes(app);
registerUserRoutes(app);
registerPatientRoutes(app);
registerDoctorRoutes(app);
registerAppointmentRoutes(app);
registerRecordRoutes(app);
registerPharmacyRoutes(app);
registerBillingRoutes(app);
registerReportRoutes(app);

app.use(errorHandler);
