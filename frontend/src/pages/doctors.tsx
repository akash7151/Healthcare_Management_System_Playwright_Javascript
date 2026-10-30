import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Page } from "../api";
import { can, useAuth } from "../auth";
import { Alert, Empty, Field, PageTitle, Pager, PrimaryButton, SearchForm, Table, controlClass, formatWhen } from "../ui";

type Schedule = { weekday: number; startTime: string; endTime: string; slotMinutes: number };
type Doctor = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  licenseNumber: string;
  specialty: string;
  department: string;
  qualification: string | null;
  active: boolean;
  schedules: Schedule[];
  appointments?: Array<{ id: string; startsAt: string; status: string; reason: string; patientName: string; patientCode: string }>;
};

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DoctorsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("");
  const [result, setResult] = useState<Page<Doctor> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (q) params.set("q", q);
    if (active) params.set("active", active);
    void api<Page<Doctor>>(`/api/doctors?${params}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load doctors"));
  }, [q, page, active]);

  return (
    <section>
      <PageTitle
        title="Doctors"
        action={
          can(user, "doctors:write") ? (
            <Link className="rounded-md bg-teal-800 px-4 py-2 text-sm text-white" to="/doctors/new">
              Add doctor
            </Link>
          ) : null
        }
      />
      <div className="mb-3 flex gap-2">
        <SearchForm placeholder="Search name, specialty, or license" onSearch={(value) => { setPage(1); setQ(value); }} />
        <select className="h-10 rounded-md border border-stone-300 px-2 text-sm" value={active} onChange={(event) => { setPage(1); setActive(event.target.value); }}>
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No doctors match.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["Name", "Specialty", "License", "Status", ""]}
          rows={result.data.map((doctor) => [
            `${doctor.firstName} ${doctor.lastName}`,
            doctor.specialty,
            doctor.licenseNumber,
            doctor.active ? "Active" : "Inactive",
            <Link key={doctor.id} className="text-teal-800 underline" to={`/doctors/${doctor.id}`}>Open</Link>,
          ])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

export function DoctorFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    licenseNumber: "",
    specialty: "",
    department: "",
    qualification: "",
    active: true,
    weekday: 1,
    startTime: "09:00",
    endTime: "13:00",
    slotMinutes: 30,
  });

  useEffect(() => {
    if (!id) return;
    void api<Doctor>(`/api/doctors/${id}`).then((doctor) => {
      const window = doctor.schedules[0];
      setForm((current) => ({
        ...current,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        licenseNumber: doctor.licenseNumber,
        specialty: doctor.specialty,
        department: doctor.department,
        qualification: doctor.qualification ?? "",
        active: doctor.active,
        weekday: window?.weekday ?? 1,
        startTime: window?.startTime ?? "09:00",
        endTime: window?.endTime ?? "13:00",
        slotMinutes: window?.slotMinutes ?? 30,
      }));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load doctor"));
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const schedules = [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: form.startTime,
      endTime: form.endTime,
      slotMinutes: Number(form.slotMinutes),
    }));
    const payload = id
      ? {
          firstName: form.firstName,
          lastName: form.lastName,
          licenseNumber: form.licenseNumber,
          specialty: form.specialty,
          department: form.department,
          qualification: form.qualification,
          active: form.active,
          schedules,
        }
      : {
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          licenseNumber: form.licenseNumber,
          specialty: form.specialty,
          department: form.department,
          qualification: form.qualification,
          active: form.active,
          schedules,
        };
    try {
      const saved = await api<Doctor>(id ? `/api/doctors/${id}` : "/api/doctors", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      navigate(`/doctors/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save doctor");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title={id ? "Edit doctor" : "Add doctor"} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field label="First name"><input className={controlClass} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></Field>
        <Field label="Last name"><input className={controlClass} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></Field>
        {!id ? <Field label="Email"><input className={controlClass} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field> : null}
        {!id ? <Field label="Password"><input className={controlClass} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Field> : null}
        <Field label="License"><input className={controlClass} value={form.licenseNumber} onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })} required /></Field>
        <Field label="Specialty"><input className={controlClass} value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} required /></Field>
        <Field label="Department"><input className={controlClass} value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} required /></Field>
        <Field label="Qualification"><input className={controlClass} value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} /></Field>
        <p className="text-sm text-stone-600 sm:col-span-2">Working hours are saved for Monday through Friday.</p>
        <Field label="Slot minutes"><input className={controlClass} type="number" min={5} max={240} value={form.slotMinutes} onChange={(event) => setForm({ ...form, slotMinutes: Number(event.target.value) })} /></Field>
        <Field label="Start"><input className={controlClass} type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></Field>
        <Field label="End"><input className={controlClass} type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Active
        </label>
        <div className="sm:col-span-2"><PrimaryButton disabled={pending}>{pending ? "Saving…" : "Save doctor"}</PrimaryButton></div>
      </form>
    </section>
  );
}

export function DoctorDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api<Doctor>(`/api/doctors/${id}`).then(setDoctor).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load doctor"));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!doctor) return <p className="text-sm text-stone-600">Loading doctor…</p>;
  return (
    <section>
      <PageTitle
        title={`${doctor.firstName} ${doctor.lastName}`}
        action={can(user, "doctors:write") ? <Link className="rounded-md border border-stone-300 px-4 py-2 text-sm" to={`/doctors/${doctor.id}/edit`}>Edit</Link> : null}
      />
      <p className="mb-4 text-sm text-stone-600">
        {doctor.specialty} · {doctor.department} · {doctor.licenseNumber} · {doctor.active ? "Active" : "Inactive"}
        {doctor.qualification ? ` · ${doctor.qualification}` : ""}
      </p>
      <h2 className="mb-2 font-semibold">Working hours</h2>
      <ul className="mb-6 text-sm">
        {doctor.schedules.map((window) => (
          <li key={`${window.weekday}-${window.startTime}`}>{days[window.weekday]} {window.startTime}–{window.endTime}, {window.slotMinutes} min</li>
        ))}
      </ul>
      <h2 className="mb-2 font-semibold">Recent appointments</h2>
      {!doctor.appointments || doctor.appointments.length === 0 ? <Empty>No appointments yet.</Empty> : (
        <Table
          headers={["When", "Patient", "Status", "Reason"]}
          rows={doctor.appointments.map((item) => [formatWhen(item.startsAt), `${item.patientName} (${item.patientCode})`, item.status, item.reason])}
        />
      )}
    </section>
  );
}
