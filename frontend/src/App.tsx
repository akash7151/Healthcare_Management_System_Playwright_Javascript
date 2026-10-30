import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth, RequirePermission } from "./auth";
import { Shell } from "./ui";
import { LoginPage, PasswordPage, ResetPage } from "./pages/account";
import { AuditPage, ReportsPage, UsersPage } from "./pages/admin";
import { AppointmentDetailPage, AppointmentFormPage, AppointmentsPage, ReschedulePage } from "./pages/appointments";
import { BillingPage, InvoiceDetailPage, InvoiceFormPage } from "./pages/billing";
import { PharmacyPage, PrescriptionFormPage, PrescriptionsPage, RecordDetailPage, RecordFormPage, RecordsPage } from "./pages/clinical";
import { DashboardPage } from "./pages/dashboard";
import { DoctorDetailPage, DoctorFormPage, DoctorsPage } from "./pages/doctors";
import { PatientDetailPage, PatientFormPage, PatientsPage } from "./pages/patients";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Shell />}>
              <Route index element={<DashboardPage />} />
              <Route path="account/password" element={<PasswordPage />} />
              <Route path="patients" element={<RequirePermission permission="patients:read"><PatientsPage /></RequirePermission>} />
              <Route path="patients/new" element={<RequirePermission permission="patients:write"><PatientFormPage /></RequirePermission>} />
              <Route path="patients/:id" element={<RequirePermission permission="patients:read"><PatientDetailPage /></RequirePermission>} />
              <Route path="patients/:id/edit" element={<RequirePermission permission="patients:write"><PatientFormPage /></RequirePermission>} />
              <Route path="doctors" element={<RequirePermission permission="doctors:read"><DoctorsPage /></RequirePermission>} />
              <Route path="doctors/new" element={<RequirePermission permission="doctors:write"><DoctorFormPage /></RequirePermission>} />
              <Route path="doctors/:id" element={<RequirePermission permission="doctors:read"><DoctorDetailPage /></RequirePermission>} />
              <Route path="doctors/:id/edit" element={<RequirePermission permission="doctors:write"><DoctorFormPage /></RequirePermission>} />
              <Route path="appointments" element={<RequirePermission permission="appointments:read"><AppointmentsPage /></RequirePermission>} />
              <Route path="appointments/new" element={<RequirePermission permission="appointments:write"><AppointmentFormPage /></RequirePermission>} />
              <Route path="appointments/:id" element={<RequirePermission permission="appointments:read"><AppointmentDetailPage /></RequirePermission>} />
              <Route path="appointments/:id/reschedule" element={<RequirePermission permission="appointments:write"><ReschedulePage /></RequirePermission>} />
              <Route path="records" element={<RequirePermission permission="records:read"><RecordsPage /></RequirePermission>} />
              <Route path="records/new" element={<RequirePermission permission="records:write"><RecordFormPage /></RequirePermission>} />
              <Route path="records/:id" element={<RequirePermission permission="records:read"><RecordDetailPage /></RequirePermission>} />
              <Route path="prescriptions" element={<RequirePermission permission="prescriptions:read"><PrescriptionsPage /></RequirePermission>} />
              <Route path="prescriptions/new" element={<RequirePermission permission="prescriptions:write"><PrescriptionFormPage /></RequirePermission>} />
              <Route path="pharmacy" element={<RequirePermission permission="pharmacy:read"><PharmacyPage /></RequirePermission>} />
              <Route path="billing" element={<RequirePermission permission="billing:read"><BillingPage /></RequirePermission>} />
              <Route path="billing/new" element={<RequirePermission permission="billing:write"><InvoiceFormPage /></RequirePermission>} />
              <Route path="billing/:id" element={<RequirePermission permission="billing:read"><InvoiceDetailPage /></RequirePermission>} />
              <Route path="reports" element={<RequirePermission permission="reports:read"><ReportsPage /></RequirePermission>} />
              <Route path="users" element={<RequirePermission permission="users:manage"><UsersPage /></RequirePermission>} />
              <Route path="audit" element={<RequirePermission permission="audit:read"><AuditPage /></RequirePermission>} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
