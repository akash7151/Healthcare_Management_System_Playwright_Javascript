import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, apiUrl, type Page } from "../api";
import { can, useAuth } from "../auth";
import { Alert, Empty, Field, PageTitle, Pager, PrimaryButton, SearchForm, Table, controlClass, formatWhen } from "../ui";

type Patient = {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  phone: string;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  hasPortal: boolean;
};

type PatientDetail = Patient & {
  appointments: Array<{ id: string; startsAt: string; status: string; reason: string; doctorName: string }>;
  clinical: {
    allergies: Array<{ id: string; substance: string; severity: string; notes: string | null }>;
    encounters: Array<{ id: string; createdAt: string; doctorName: string; notes: string; diagnoses: string[] }>;
  } | null;
};

const emptyForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  sex: "female",
  phone: "",
  email: "",
  addressLine: "",
  city: "",
  createPortal: false,
  password: "",
};

export function PatientsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<Patient> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (q) params.set("q", q);
    fetch(apiUrl(`/api/patients?${params}`), { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as Page<Patient> & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load patients");
        setResult(body);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load patients");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, page]);

  return (
    <section>
      <PageTitle
        title="Patients"
        action={
          can(user, "patients:write") ? (
            <Link className="rounded-md bg-teal-800 px-4 py-2 text-sm text-white" to="/patients/new">
              Register patient
            </Link>
          ) : null
        }
      />
      <SearchForm
        placeholder="Search by ID, name, phone, or email"
        onSearch={(value) => {
          setPage(1);
          setQ(value);
        }}
      />
      {loading ? <p className="text-sm text-stone-600">Loading patients…</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No patients match this search.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["ID", "Name", "Phone", "City", ""]}
          rows={result.data.map((patient) => [
            patient.patientCode,
            `${patient.firstName} ${patient.lastName}`,
            patient.phone,
            patient.city ?? "—",
            <Link key={patient.id} className="text-teal-800 underline" to={`/patients/${patient.id}`}>
              View
            </Link>,
          ])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

export function PatientFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api<Patient>(`/api/patients/${id}`).then((patient) => {
      setForm({
        ...emptyForm,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
        phone: patient.phone,
        email: patient.email ?? "",
        addressLine: patient.addressLine ?? "",
        city: patient.city ?? "",
      });
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load patient"));
  }, [id]);

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const payload = {
      ...form,
      email: form.email || undefined,
      password: form.createPortal ? form.password : undefined,
    };
    try {
      const saved = await api<Patient>(id ? `/api/patients/${id}` : "/api/patients", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      navigate(`/patients/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save patient");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title={id ? "Edit patient" : "Register patient"} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field label="First name">
          <input className={controlClass} value={form.firstName} onChange={(event) => update("firstName", event.target.value)} required />
        </Field>
        <Field label="Last name">
          <input className={controlClass} value={form.lastName} onChange={(event) => update("lastName", event.target.value)} required />
        </Field>
        <Field label="Date of birth">
          <input className={controlClass} type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} required />
        </Field>
        <Field label="Sex">
          <select className={controlClass} value={form.sex} onChange={(event) => update("sex", event.target.value)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Phone">
          <input className={controlClass} value={form.phone} onChange={(event) => update("phone", event.target.value)} required />
        </Field>
        <Field label="Email">
          <input className={controlClass} type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
        </Field>
        <Field label="Address">
          <input className={controlClass} value={form.addressLine} onChange={(event) => update("addressLine", event.target.value)} />
        </Field>
        <Field label="City">
          <input className={controlClass} value={form.city} onChange={(event) => update("city", event.target.value)} />
        </Field>
        {!id ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.createPortal} onChange={(event) => update("createPortal", event.target.checked)} />
            Create a patient portal login
          </label>
        ) : null}
        {form.createPortal ? (
          <Field label="Portal password">
            <input className={controlClass} type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required />
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <PrimaryButton disabled={pending}>{pending ? "Saving…" : "Save patient"}</PrimaryButton>
        </div>
      </form>
    </section>
  );
}

export function PatientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api<PatientDetail>(`/api/patients/${id}`)
      .then(setPatient)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load patient"));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!patient) return <p className="text-sm text-stone-600">Loading patient…</p>;

  return (
    <section>
      <PageTitle
        title={`${patient.firstName} ${patient.lastName}`}
        action={
          can(user, "patients:write") ? (
            <Link className="rounded-md border border-stone-300 px-4 py-2 text-sm" to={`/patients/${patient.id}/edit`}>
              Edit
            </Link>
          ) : null
        }
      />
      <p className="mb-4 text-sm text-stone-600">
        {patient.patientCode} · {patient.sex} · born {patient.dateOfBirth} · {patient.phone}
        {patient.city ? ` · ${patient.city}` : ""}
      </p>
      <h2 className="mb-2 font-semibold">Appointments</h2>
      {patient.appointments.length === 0 ? <Empty>No appointments yet.</Empty> : (
        <Table
          headers={["When", "Doctor", "Status", "Reason"]}
          rows={patient.appointments.map((item) => [formatWhen(item.startsAt), item.doctorName, item.status, item.reason])}
        />
      )}
      <h2 className="mb-2 mt-6 font-semibold">Medical history</h2>
      {patient.clinical ? (
        <div className="space-y-3">
          {patient.clinical.allergies.length === 0 ? <p className="text-sm text-stone-600">No allergies recorded.</p> : (
            <ul className="text-sm">
              {patient.clinical.allergies.map((item) => (
                <li key={item.id}>{item.substance} ({item.severity})</li>
              ))}
            </ul>
          )}
          {patient.clinical.encounters.map((item) => (
            <article key={item.id} className="rounded-md border border-stone-200 bg-white p-3 text-sm">
              <p className="font-medium">{formatWhen(item.createdAt)} · {item.doctorName}</p>
              <p className="mt-1">{item.notes}</p>
              {item.diagnoses.length > 0 ? <p className="mt-1 text-stone-600">{item.diagnoses.join(", ")}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-600">Clinical notes are hidden for your role.</p>
      )}
    </section>
  );
}
