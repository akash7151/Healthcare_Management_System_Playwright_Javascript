import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Page } from "../api";
import { can, useAuth } from "../auth";
import { Alert, Empty, Field, Modal, PageTitle, Pager, PrimaryButton, SecondaryButton, Table, controlClass, formatWhen } from "../ui";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  reason: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
};

type Option = { id: string; label: string };
type Slot = { startsAt: string; endsAt: string; available: boolean };

const NEXT: Record<string, string[]> = {
  SCHEDULED: ["CONFIRMED", "CHECKED_IN", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function AppointmentsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [result, setResult] = useState<Page<Appointment> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (status) params.set("status", status);
    if (from) params.set("from", new Date(`${from}T00:00:00+05:30`).toISOString());
    void api<Page<Appointment>>(`/api/appointments?${params}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load appointments"));
  }, [page, status, from]);

  return (
    <section>
      <PageTitle
        title="Appointments"
        action={can(user, "appointments:write") ? <Link className="rounded-md bg-teal-800 px-4 py-2 text-sm text-white" to="/appointments/new">Book appointment</Link> : null}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="rounded-md border border-stone-300 px-2 py-2 text-sm" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          {Object.keys(NEXT).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
        <input className="rounded-md border border-stone-300 px-2 py-2 text-sm" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No appointments for this filter.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["When", "Patient", "Doctor", "Status", ""]}
          rows={result.data.map((item) => [
            formatWhen(item.startsAt),
            `${item.patientName} (${item.patientCode})`,
            item.doctorName,
            item.status.replaceAll("_", " "),
            <Link key={item.id} className="text-teal-800 underline" to={`/appointments/${item.id}`}>Open</Link>,
          ])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

export function AppointmentFormPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Option[]>([]);
  const [doctors, setDoctors] = useState<Option[]>([]);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<Page<{ id: string; patientCode: string; firstName: string; lastName: string }>>("/api/patients?pageSize=100"),
      api<Page<{ id: string; firstName: string; lastName: string; specialty: string }>>("/api/doctors?active=true&pageSize=100"),
    ]).then(([patientPage, doctorPage]) => {
      setPatients(patientPage.data.map((item) => ({ id: item.id, label: `${item.patientCode} ${item.firstName} ${item.lastName}` })));
      setDoctors(doctorPage.data.map((item) => ({ id: item.id, label: `${item.firstName} ${item.lastName} · ${item.specialty}` })));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load booking lists"));
  }, []);

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots([]);
      return;
    }
    void api<{ slots: Slot[] }>(`/api/doctors/${doctorId}/availability?date=${date}`)
      .then((body) => setSlots(body.slots))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load slots"));
  }, [doctorId, date]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = slots.find((item) => item.startsAt === slot);
    if (!chosen) {
      setError("Choose an open slot");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const saved = await api<Appointment>("/api/appointments", {
        method: "POST",
        body: JSON.stringify({ patientId, doctorId, startsAt: chosen.startsAt, endsAt: chosen.endsAt, reason }),
      });
      navigate(`/appointments/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Booking failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title="Book appointment" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Patient">
          <select className={controlClass} value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
            <option value="">Select a patient</option>
            {patients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Doctor">
          <select className={controlClass} value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
            <option value="">Select a doctor</option>
            {doctors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Open slots</legend>
          {slots.length === 0 ? <p className="text-sm text-stone-600">Choose a doctor and date to see working hours.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {slots.map((item) => (
                <label key={item.startsAt} className={`rounded-md border px-3 py-2 text-sm ${item.available ? "border-stone-300" : "border-stone-200 text-stone-400"}`}>
                  <input className="mr-2" type="radio" name="slot" disabled={!item.available} checked={slot === item.startsAt} onChange={() => setSlot(item.startsAt)} />
                  {formatWhen(item.startsAt)} {item.available ? "" : "(booked)"}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <Field label="Reason">
          <input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} />
        </Field>
        <PrimaryButton disabled={pending}>{pending ? "Booking…" : "Book appointment"}</PrimaryButton>
      </form>
    </section>
  );
}

export function AppointmentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function reload() {
    if (!id) return;
    setItem(await api<Appointment>(`/api/appointments/${id}`));
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load appointment"));
  }, [id]);

  async function update(status: string) {
    if (!id) return;
    setError(null);
    try {
      const saved = await api<Appointment>(`/api/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setItem(saved);
      setMessage(`Status is now ${saved.status.replaceAll("_", " ")}.`);
      setConfirmCancel(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    }
  }

  if (error && !item) return <Alert tone="error">{error}</Alert>;
  if (!item) return <p className="text-sm text-stone-600">Loading appointment…</p>;
  const actions = can(user, "appointments:write") ? NEXT[item.status] ?? [] : [];

  return (
    <section>
      <PageTitle title="Appointment" />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="rounded-md border border-stone-200 bg-white p-4 text-sm">
        <p>{formatWhen(item.startsAt)} – {formatWhen(item.endsAt)}</p>
        <p className="mt-1">{item.patientName} ({item.patientCode})</p>
        <p>{item.doctorName} · {item.specialty}</p>
        <p className="mt-1">Status: {item.status.replaceAll("_", " ")}</p>
        <p className="mt-1">Reason: {item.reason}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.filter((status) => status !== "CANCELLED").map((status) => (
          <SecondaryButton key={status} onClick={() => void update(status)}>{status.replaceAll("_", " ")}</SecondaryButton>
        ))}
        {actions.includes("CANCELLED") ? <SecondaryButton onClick={() => setConfirmCancel(true)}>Cancel appointment</SecondaryButton> : null}
        {item.status === "SCHEDULED" || item.status === "CONFIRMED" ? (
          can(user, "appointments:write") ? <Link className="rounded-md border border-stone-300 px-4 py-2 text-sm" to={`/appointments/${item.id}/reschedule`}>Reschedule</Link> : null
        ) : null}
      </div>
      {confirmCancel ? (
        <Modal title="Cancel this appointment?" onClose={() => setConfirmCancel(false)}>
          <p>The slot will be released. This stays in the appointment history.</p>
          <div className="mt-3">
            <PrimaryButton type="button" onClick={() => void update("CANCELLED")}>Confirm cancellation</PrimaryButton>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

export function ReschedulePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Appointment | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api<Appointment>(`/api/appointments/${id}`).then(setItem).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load appointment"));
  }, [id]);

  useEffect(() => {
    if (!item || !date) return;
    void api<{ slots: Slot[] }>(`/api/doctors/${item.doctorId}/availability?date=${date}`).then((body) => setSlots(body.slots));
  }, [item, date]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = slots.find((entry) => entry.startsAt === slot);
    if (!id || !chosen) return;
    try {
      await api(`/api/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startsAt: chosen.startsAt, endsAt: chosen.endsAt }),
      });
      navigate(`/appointments/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reschedule");
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title="Reschedule" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="New date"><input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
        <div className="grid gap-2">
          {slots.map((entry) => (
            <label key={entry.startsAt} className="text-sm">
              <input className="mr-2" type="radio" name="slot" disabled={!entry.available} onChange={() => setSlot(entry.startsAt)} />
              {formatWhen(entry.startsAt)} {entry.available ? "" : "(booked)"}
            </label>
          ))}
        </div>
        <PrimaryButton>Save new time</PrimaryButton>
      </form>
    </section>
  );
}
