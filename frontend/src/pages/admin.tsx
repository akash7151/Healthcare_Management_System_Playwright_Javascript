import { useEffect, useState, type FormEvent } from "react";
import { api, type Page } from "../api";
import { Alert, Empty, Field, Modal, PageTitle, Pager, PrimaryButton, SecondaryButton, Table, controlClass, formatWhen } from "../ui";

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  role: string;
  lastLoginAt: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: string;
  createdAt: string;
  actorName: string;
};

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Page<UserRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("RECEPTIONIST");
  const [pendingId, setPendingId] = useState<string | null>(null);

  function load(next = page, query = q) {
    const params = new URLSearchParams({ page: String(next), pageSize: "10" });
    if (query) params.set("q", query);
    void api<Page<UserRow>>(`/api/users?${params}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load users"));
  }

  useEffect(() => {
    load(page, q);
  }, [page]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, password, firstName, lastName, role, status: "ACTIVE" }),
      });
      setMessage("User created.");
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      load(1, q);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create user");
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage(`Account marked ${status}.`);
      setPendingId(null);
      load(page, q);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update user");
    }
  }

  return (
    <section>
      <PageTitle title="Users" />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); load(1, q); }}>
        <input className={controlClass} placeholder="Search name or email" value={q} onChange={(event) => setQ(event.target.value)} />
        <PrimaryButton>Search</PrimaryButton>
      </form>
      {result && result.data.length === 0 ? <Empty>No users match.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["Name", "Email", "Role", "Status", ""]}
          rows={result.data.map((user) => [
            `${user.firstName} ${user.lastName}`,
            user.email,
            user.role,
            user.status,
            user.status === "ACTIVE" ? (
              <SecondaryButton key={user.id} onClick={() => setPendingId(user.id)}>Deactivate</SecondaryButton>
            ) : (
              <SecondaryButton key={user.id} onClick={() => void setStatus(user.id, "ACTIVE")}>Activate</SecondaryButton>
            ),
          ])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
      <form className="mt-6 grid max-w-xl gap-3 sm:grid-cols-2" onSubmit={(event) => void create(event)}>
        <h2 className="font-semibold sm:col-span-2">Create staff account</h2>
        <Field label="First name"><input className={controlClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></Field>
        <Field label="Last name"><input className={controlClass} value={lastName} onChange={(event) => setLastName(event.target.value)} required /></Field>
        <Field label="Email"><input className={controlClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        <Field label="Password"><input className={controlClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        <Field label="Role">
          <select className={controlClass} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="RECEPTIONIST">Receptionist</option>
            <option value="BILLING_STAFF">Billing staff</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>
        <div className="self-end"><PrimaryButton>Create user</PrimaryButton></div>
      </form>
      {pendingId ? (
        <Modal title="Deactivate this account?" onClose={() => setPendingId(null)}>
          <p>The user will be signed out and cannot access the clinic until an administrator activates the account.</p>
          <div className="mt-3"><PrimaryButton type="button" onClick={() => void setStatus(pendingId, "DISABLED")}>Deactivate</PrimaryButton></div>
        </Modal>
      ) : null}
    </section>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Page<AuditRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q) params.set("q", q);
    void api<Page<AuditRow>>(`/api/audit-logs?${params}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load audit log"));
  }, [page, q]);

  return (
    <section>
      <PageTitle title="Audit log" />
      <form className="mb-4 flex gap-2" onSubmit={(event) => event.preventDefault()}>
        <input className={controlClass} placeholder="Filter by action or entity" value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} />
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No audit events.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["When", "Actor", "Action", "Entity", "Outcome"]}
          rows={result.data.map((row) => [formatWhen(row.createdAt), row.actorName, row.action, row.entityType, row.outcome])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

type ReportCard = { invoices: number; billed: string; outstanding: string; collected: string };
type AppointmentSummary = { data: Array<{ status: string; count: number }> };
type PharmacySummary = { data: Array<{ name: string; strength: string; onHand: number; lowStock: boolean; expired: number }> };

export function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [billing, setBilling] = useState<ReportCard | null>(null);
  const [appointments, setAppointments] = useState<AppointmentSummary | null>(null);
  const [pharmacy, setPharmacy] = useState<PharmacySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    void Promise.all([
      api<ReportCard>(`/api/reports/billing?${query}`),
      api<AppointmentSummary>(`/api/reports/appointments?${query}`),
      api<PharmacySummary>("/api/reports/pharmacy"),
    ]).then(([billingReport, appointmentReport, pharmacyReport]) => {
      setBilling(billingReport);
      setAppointments(appointmentReport);
      setPharmacy(pharmacyReport);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load reports"));
  }, [from, to]);

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  return (
    <section>
      <PageTitle title="Reports" />
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label>From <input className="ml-2 rounded-md border border-stone-300 px-2 py-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To <input className="ml-2 rounded-md border border-stone-300 px-2 py-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {billing ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Invoices", String(billing.invoices)],
            ["Billed", `INR ${billing.billed}`],
            ["Collected", `INR ${billing.collected}`],
            ["Outstanding", `INR ${billing.outstanding}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-stone-200 bg-white p-3">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
      <h2 className="mb-2 font-semibold">Appointments</h2>
      {appointments && appointments.data.length === 0 ? <Empty>No appointments in this range.</Empty> : (
        <Table headers={["Status", "Count"]} rows={(appointments?.data ?? []).map((row) => [row.status, String(row.count)])} />
      )}
      <h2 className="mb-2 mt-6 font-semibold">Pharmacy</h2>
      <Table
        headers={["Medication", "On hand", "Expired", "Low"]}
        rows={(pharmacy?.data ?? []).map((row) => [`${row.name} ${row.strength}`, String(row.onHand), String(row.expired), row.lowStock ? "Yes" : "No"])}
      />
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {["patients", "appointments", "billing", "pharmacy"].map((kind) => (
          <a key={kind} className="text-teal-800 underline" href={`/api/reports/export/${kind}?${query.toString()}`}>
            Download {kind} CSV
          </a>
        ))}
      </div>
    </section>
  );
}
