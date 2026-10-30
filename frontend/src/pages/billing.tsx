import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Page } from "../api";
import { can, useAuth } from "../auth";
import { Alert, Empty, Field, Modal, PageTitle, Pager, PrimaryButton, SecondaryButton, Table, controlClass, formatWhen } from "../ui";

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: string;
  balance: string;
  subtotal: string;
  discount: string;
  tax: string;
  currency: string;
  patientName: string;
  patientCode: string;
  createdAt: string;
  lines?: Array<{ id: string; description: string; quantity: number; unitPrice: string; amount: string }>;
  payments?: Array<{ id: string; amount: string; method: string; reference: string; paidAt: string }>;
  refunds?: Array<{ id: string; amount: string; reason: string; createdAt: string }>;
};

export function BillingPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Page<Invoice> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (q) params.set("q", q);
    void api<Page<Invoice>>(`/api/invoices?${params}`)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load invoices"));
  }, [page, q]);

  return (
    <section>
      <PageTitle
        title="Billing"
        action={can(user, "billing:write") ? <Link className="rounded-md bg-teal-800 px-4 py-2 text-sm text-white" to="/billing/new">Create invoice</Link> : null}
      />
      <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
        <input className={controlClass} placeholder="Search invoice or patient" value={q} onChange={(event) => setQ(event.target.value)} />
        <PrimaryButton>Search</PrimaryButton>
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result && result.data.length === 0 ? <Empty>No invoices match.</Empty> : null}
      {result && result.data.length > 0 ? (
        <Table
          headers={["Invoice", "Patient", "Status", "Total", "Balance", ""]}
          rows={result.data.map((item) => [
            item.invoiceNumber,
            `${item.patientName} (${item.patientCode})`,
            item.status,
            `${item.currency} ${item.total}`,
            `${item.currency} ${item.balance}`,
            <Link key={item.id} className="text-teal-800 underline" to={`/billing/${item.id}`}>Open</Link>,
          ])}
        />
      ) : null}
      {result ? <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </section>
  );
}

export function InvoiceFormPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Array<{ id: string; label: string }>>([]);
  const [patientId, setPatientId] = useState("");
  const [description, setDescription] = useState("General consultation");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("500.00");
  const [discount, setDiscount] = useState("0.00");
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Page<{ id: string; patientCode: string; firstName: string; lastName: string }>>("/api/patients?pageSize=100")
      .then((body) => setPatients(body.data.map((item) => ({ id: item.id, label: `${item.patientCode} ${item.firstName} ${item.lastName}` }))))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load patients"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const saved = await api<Invoice>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          discount,
          taxRatePercent: Number(taxRatePercent),
          lines: [{ description, quantity: Number(quantity), unitPrice }],
        }),
      });
      navigate(`/billing/${saved.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invoice");
    }
  }

  return (
    <section className="max-w-xl">
      <PageTitle title="Create invoice" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Patient">
          <select className={controlClass} value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
            <option value="">Select a patient</option>
            {patients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Description"><input className={controlClass} value={description} onChange={(event) => setDescription(event.target.value)} required /></Field>
        <Field label="Quantity"><input className={controlClass} type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></Field>
        <Field label="Unit price (INR)"><input className={controlClass} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></Field>
        <Field label="Discount (INR)"><input className={controlClass} value={discount} onChange={(event) => setDiscount(event.target.value)} required /></Field>
        <Field label="Tax percent"><input className={controlClass} type="number" min={0} max={28} value={taxRatePercent} onChange={(event) => setTaxRatePercent(Number(event.target.value))} /></Field>
        <PrimaryButton>Create invoice</PrimaryButton>
      </form>
    </section>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [reference] = useState(() => `PAY-${crypto.randomUUID().slice(0, 12)}`);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function reload() {
    if (!id) return;
    setInvoice(await api<Invoice>(`/api/invoices/${id}`));
  }

  useEffect(() => {
    void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load invoice"));
  }, [id]);

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/invoices/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount, method, reference }),
      });
      setMessage("Payment recorded.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment failed");
    } finally {
      setPending(false);
    }
  }

  async function voidInvoice() {
    if (!id) return;
    try {
      const saved = await api<Invoice>(`/api/invoices/${id}/void`, { method: "POST" });
      setInvoice(saved);
      setVoidOpen(false);
      setMessage("Invoice voided.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not void invoice");
    }
  }

  if (!invoice && error) return <Alert tone="error">{error}</Alert>;
  if (!invoice) return <p className="text-sm text-stone-600">Loading invoice…</p>;

  return (
    <section>
      <PageTitle title={invoice.invoiceNumber} />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p className="mb-3 text-sm text-stone-600">
        {invoice.patientName} ({invoice.patientCode}) · {invoice.status} · {formatWhen(invoice.createdAt)}
      </p>
      <Table
        headers={["Description", "Qty", "Price", "Amount"]}
        rows={(invoice.lines ?? []).map((line) => [line.description, String(line.quantity), line.unitPrice, line.amount])}
      />
      <dl className="mt-4 grid max-w-sm grid-cols-2 gap-1 text-sm">
        <dt>Subtotal</dt><dd>INR {invoice.subtotal}</dd>
        <dt>Discount</dt><dd>INR {invoice.discount}</dd>
        <dt>Tax</dt><dd>INR {invoice.tax}</dd>
        <dt>Total</dt><dd>INR {invoice.total}</dd>
        <dt>Outstanding</dt><dd>INR {invoice.balance}</dd>
      </dl>
      <h2 className="mb-2 mt-6 font-semibold">Payments</h2>
      {(invoice.payments ?? []).length === 0 ? <Empty>No payments yet.</Empty> : (
        <Table
          headers={["When", "Method", "Reference", "Amount"]}
          rows={(invoice.payments ?? []).map((payment) => [formatWhen(payment.paidAt), payment.method, payment.reference, payment.amount])}
        />
      )}
      {can(user, "billing:write") && invoice.status !== "PAID" && invoice.status !== "VOID" && invoice.status !== "REFUNDED" ? (
        <form className="mt-4 grid max-w-lg gap-3 sm:grid-cols-2" onSubmit={(event) => void pay(event)}>
          <Field label="Amount"><input className={controlClass} value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
          <Field label="Method">
            <select className={controlClass} value={method} onChange={(event) => setMethod(event.target.value)}>
              <option>UPI</option>
              <option>CASH</option>
              <option>CARD</option>
              <option>BANK_TRANSFER</option>
            </select>
          </Field>
          <p className="text-xs text-stone-500 sm:col-span-2">Reference {reference}. Card numbers are not collected.</p>
          <PrimaryButton disabled={pending}>{pending ? "Recording…" : "Record payment"}</PrimaryButton>
        </form>
      ) : null}
      {user?.role === "ADMIN" && invoice.status !== "VOID" ? (
        <div className="mt-4"><SecondaryButton onClick={() => setVoidOpen(true)}>Void invoice</SecondaryButton></div>
      ) : null}
      {voidOpen ? (
        <Modal title="Void this invoice?" onClose={() => setVoidOpen(false)}>
          <p>Only unpaid invoices can be voided. Payment history is kept.</p>
          <div className="mt-3"><PrimaryButton type="button" onClick={() => void voidInvoice()}>Confirm void</PrimaryButton></div>
        </Modal>
      ) : null}
    </section>
  );
}
