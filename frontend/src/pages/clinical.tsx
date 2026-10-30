import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Page } from "../api";
import { can, useAuth } from "../auth";
import { Alert, Empty, Field, PageTitle, Pager, PrimaryButton, SecondaryButton, Table, controlClass, formatWhen } from "../ui";

type RecordRow = {
  id: string;
  createdAt: string;
  patientCode: string;
  patientName: string;
  doctorName: string;
  diagnoses: string[];
};

type RecordDetail = {
  id: string;
  createdAt: string;
  notes: string;
  examinationNotes: string | null;
  treatmentNotes: string | null;
  patientName: string;
  patientCode: string;
  doctorName: string;
  diagnoses: Array<{ code: string; description: string }>;
  vitals: Array<{ systolic: number | null; diastolic: number | null; heartRate: number | null; temperature: string | null }>;
};

export function RecordsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<RecordRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Page<RecordRow>>(`/api/medical-records?page=${page}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load records"));
  }, [page]);

  return (
    <section>
      <PageTitle
        title="Medical records"
        action={user?.doctorId && can(user, "records:write") ? <Link className="rounded-md bg-teal-800 px-4 py-2 text-sm text-white" to="/records/new">New encounter</Link> : null}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No encounters yet.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["When", "Patient", "Clinician", "Diagnoses", ""]}
          rows={result.data.map((item) => [
            formatWhen(item.createdAt),
            `${item.patientName} (${item.patientCode})`,
            item.doctorName,
            item.diagnoses.join(", ") || "—",
            <Link key={item.id} className="text-teal-800 underline" to={`/records/${item.id}`}>Open</Link>,
          ])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

export function RecordFormPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Array<{ id: string; label: string }>>([]);
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const [examinationNotes, setExaminationNotes] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void api<Page<{ id: string; patientCode: string; firstName: string; lastName: string }>>("/api/patients?pageSize=100")
      .then((body) => setPatients(body.data.map((item) => ({ id: item.id, label: `${item.patientCode} ${item.firstName} ${item.lastName}` }))))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load patients"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const saved = await api<{ id: string }>("/api/medical-records", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          notes,
          examinationNotes: examinationNotes || undefined,
          treatmentNotes: treatmentNotes || undefined,
          diagnoses: code && description ? [{ code, description }] : undefined,
          vitals: systolic || diastolic || heartRate || temperature
            ? {
                systolic: systolic ? Number(systolic) : undefined,
                diastolic: diastolic ? Number(diastolic) : undefined,
                heartRate: heartRate ? Number(heartRate) : undefined,
                temperature: temperature ? Number(temperature) : undefined,
              }
            : undefined,
        }),
      });
      navigate(`/records/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save encounter");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title="New encounter" />
      <p className="mb-3 text-sm text-stone-600">Record only what the clinician observed. The system does not invent a diagnosis.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Patient">
          <select className={controlClass} value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
            <option value="">Select a patient</option>
            {patients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Consultation notes"><textarea className={controlClass} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} required /></Field>
        <Field label="Examination notes"><textarea className={controlClass} rows={3} value={examinationNotes} onChange={(event) => setExaminationNotes(event.target.value)} /></Field>
        <Field label="Treatment notes"><textarea className={controlClass} rows={3} value={treatmentNotes} onChange={(event) => setTreatmentNotes(event.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Diagnosis code"><input className={controlClass} value={code} onChange={(event) => setCode(event.target.value)} /></Field>
          <Field label="Diagnosis description"><input className={controlClass} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Field label="Systolic"><input className={controlClass} value={systolic} onChange={(event) => setSystolic(event.target.value)} /></Field>
          <Field label="Diastolic"><input className={controlClass} value={diastolic} onChange={(event) => setDiastolic(event.target.value)} /></Field>
          <Field label="Heart rate"><input className={controlClass} value={heartRate} onChange={(event) => setHeartRate(event.target.value)} /></Field>
          <Field label="Temperature"><input className={controlClass} value={temperature} onChange={(event) => setTemperature(event.target.value)} /></Field>
        </div>
        <PrimaryButton disabled={pending}>{pending ? "Saving…" : "Save encounter"}</PrimaryButton>
      </form>
    </section>
  );
}

export function RecordDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api<RecordDetail>(`/api/medical-records/${id}`)
      .then(setItem)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load record"));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!item) return <p className="text-sm text-stone-600">Loading record…</p>;
  return (
    <section className="space-y-3">
      <PageTitle title={`${item.patientName} (${item.patientCode})`} />
      <p className="text-sm text-stone-600">{formatWhen(item.createdAt)} · {item.doctorName}</p>
      <article className="rounded-md border border-stone-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Consultation</h2>
        <p className="mt-1 whitespace-pre-wrap">{item.notes}</p>
        {item.examinationNotes ? <><h2 className="mt-4 font-semibold">Examination</h2><p className="mt-1 whitespace-pre-wrap">{item.examinationNotes}</p></> : null}
        {item.treatmentNotes ? <><h2 className="mt-4 font-semibold">Treatment notes</h2><p className="mt-1 whitespace-pre-wrap">{item.treatmentNotes}</p></> : null}
      </article>
      <h2 className="font-semibold">Diagnoses entered by the clinician</h2>
      {item.diagnoses.length === 0 ? <Empty>No diagnosis was entered.</Empty> : (
        <ul className="text-sm">{item.diagnoses.map((diagnosis) => <li key={diagnosis.code}>{diagnosis.code} — {diagnosis.description}</li>)}</ul>
      )}
      {item.vitals.length > 0 ? (
        <p className="text-sm">
          Vitals: {item.vitals[0].systolic ?? "—"}/{item.vitals[0].diastolic ?? "—"} mmHg, pulse {item.vitals[0].heartRate ?? "—"}, temp {item.vitals[0].temperature ?? "—"}
        </p>
      ) : null}
    </section>
  );
}

type Medication = {
  id: string;
  name: string;
  strength: string;
  form: string;
  onHand: number;
  expired: number;
  lowStock: boolean;
  batches: Array<{ id: string; batchNumber: string; quantity: number; expiryDate: string; location: string }>;
};

type Prescription = {
  id: string;
  status: string;
  createdAt: string;
  patientName: string;
  patientCode: string;
  doctorName: string;
  items: Array<{ medication: string; dosage: string; frequency: string; duration: string; quantity: number; instructions: string }>;
};

export function PrescriptionsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<Prescription> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load(nextPage = page) {
    void api<Page<Prescription>>(`/api/prescriptions?page=${nextPage}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load prescriptions"));
  }

  useEffect(() => {
    load(page);
  }, [page]);

  async function dispense(id: string) {
    setError(null);
    try {
      await api(`/api/prescriptions/${id}/dispense`, { method: "POST" });
      setMessage("Prescription dispensed and stock updated.");
      load(page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dispense failed");
    }
  }

  return (
    <section>
      <PageTitle
        title="Prescriptions"
        action={user?.doctorId && can(user, "prescriptions:write") ? <Link className="rounded-md bg-teal-800 px-4 py-2 text-sm text-white" to="/prescriptions/new">New prescription</Link> : null}
      />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No prescriptions yet.</Empty> : null}
      <div className="space-y-3">
        {result?.data.map((item) => (
          <article key={item.id} className="rounded-md border border-stone-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{item.patientName} ({item.patientCode}) · {item.status}</p>
              <p className="text-stone-500">{formatWhen(item.createdAt)} · {item.doctorName}</p>
            </div>
            <ul className="mt-2 list-disc pl-5">
              {item.items.map((line) => (
                <li key={`${item.id}-${line.medication}`}>{line.medication}: {line.dosage}, {line.frequency}, {line.duration}, qty {line.quantity}. {line.instructions}</li>
              ))}
            </ul>
            {item.status === "ISSUED" && can(user, "pharmacy:write") ? (
              <div className="mt-3"><SecondaryButton onClick={() => void dispense(item.id)}>Dispense</SecondaryButton></div>
            ) : null}
          </article>
        ))}
      </div>
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

export function PrescriptionFormPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Array<{ id: string; label: string }>>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [patientId, setPatientId] = useState("");
  const [medicationId, setMedicationId] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<Page<{ id: string; patientCode: string; firstName: string; lastName: string }>>("/api/patients?pageSize=100"),
      api<{ data: Medication[] }>("/api/medications"),
    ]).then(([patientPage, medicationPage]) => {
      setPatients(patientPage.data.map((item) => ({ id: item.id, label: `${item.patientCode} ${item.firstName} ${item.lastName}` })));
      setMedications(medicationPage.data);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load form data"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const saved = await api<{ id: string }>("/api/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          items: [{ medicationId, dosage, frequency, duration, quantity: Number(quantity), instructions }],
        }),
      });
      navigate("/prescriptions");
      void saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue prescription");
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title="Issue prescription" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Patient">
          <select className={controlClass} value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
            <option value="">Select a patient</option>
            {patients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Medication">
          <select className={controlClass} value={medicationId} onChange={(event) => setMedicationId(event.target.value)} required>
            <option value="">Select medication</option>
            {medications.map((item) => <option key={item.id} value={item.id}>{item.name} {item.strength} {item.form}</option>)}
          </select>
        </Field>
        <Field label="Dosage"><input className={controlClass} value={dosage} onChange={(event) => setDosage(event.target.value)} required /></Field>
        <Field label="Frequency"><input className={controlClass} value={frequency} onChange={(event) => setFrequency(event.target.value)} required /></Field>
        <Field label="Duration"><input className={controlClass} value={duration} onChange={(event) => setDuration(event.target.value)} required /></Field>
        <Field label="Quantity"><input className={controlClass} type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></Field>
        <Field label="Instructions"><input className={controlClass} value={instructions} onChange={(event) => setInstructions(event.target.value)} required /></Field>
        <PrimaryButton>Issue prescription</PrimaryButton>
      </form>
    </section>
  );
}

export function PharmacyPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Medication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [form, setForm] = useState("tablet");
  const [medicationId, setMedicationId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("Main pharmacy");

  function load() {
    void api<{ data: Medication[] }>("/api/medications")
      .then((body) => setItems(body.data))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load pharmacy"));
  }

  useEffect(() => {
    load();
  }, []);

  async function addMedication(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/medications", { method: "POST", body: JSON.stringify({ name, strength, form }) });
      setMessage("Medication added.");
      setName("");
      setStrength("");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add medication");
    }
  }

  async function addBatch(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/inventory/batches", {
        method: "POST",
        body: JSON.stringify({ medicationId, batchNumber, quantity: Number(quantity), expiryDate, location }),
      });
      setMessage("Stock received.");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not receive stock");
    }
  }

  return (
    <section>
      <PageTitle title="Pharmacy" />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {items.length === 0 ? <Empty>No medications in the catalog.</Empty> : (
        <Table
          headers={["Medication", "On hand", "Expired", "Stock"]}
          rows={items.map((item) => [
            `${item.name} ${item.strength} ${item.form}`,
            String(item.onHand),
            String(item.expired),
            item.lowStock ? "Low" : "OK",
          ])}
        />
      )}
      {can(user, "pharmacy:write") ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <form className="space-y-3 rounded-md border border-stone-200 bg-white p-4" onSubmit={(event) => void addMedication(event)}>
            <h2 className="font-semibold">Add medication</h2>
            <Field label="Name"><input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
            <Field label="Strength"><input className={controlClass} value={strength} onChange={(event) => setStrength(event.target.value)} required /></Field>
            <Field label="Form"><input className={controlClass} value={form} onChange={(event) => setForm(event.target.value)} required /></Field>
            <PrimaryButton>Add to catalog</PrimaryButton>
          </form>
          <form className="space-y-3 rounded-md border border-stone-200 bg-white p-4" onSubmit={(event) => void addBatch(event)}>
            <h2 className="font-semibold">Receive stock</h2>
            <Field label="Medication">
              <select className={controlClass} value={medicationId} onChange={(event) => setMedicationId(event.target.value)} required>
                <option value="">Select</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name} {item.strength}</option>)}
              </select>
            </Field>
            <Field label="Batch"><input className={controlClass} value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} required /></Field>
            <Field label="Quantity"><input className={controlClass} type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></Field>
            <Field label="Expiry"><input className={controlClass} type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} required /></Field>
            <Field label="Location"><input className={controlClass} value={location} onChange={(event) => setLocation(event.target.value)} required /></Field>
            <PrimaryButton>Receive batch</PrimaryButton>
          </form>
        </div>
      ) : null}
    </section>
  );
}
