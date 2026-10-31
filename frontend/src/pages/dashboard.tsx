import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../api";
import { Alert, PageTitle, formatWhen } from "../ui";

type Dashboard = {
  patients: number;
  registrations: number;
  activeDoctors: number | null;
  todayAppointments: number;
  upcomingAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  pendingInvoices: number | null;
  paidAmount: string | null;
  outstandingAmount: string | null;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    outcome: string;
    createdAt: string;
    actorName: string;
  }>;
  modules: Array<{ id: string; name: string; status: string }>;
};

export function DashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(apiUrl(`/api/reports/dashboard?${params.toString()}`), { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as Dashboard & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Dashboard failed");
        }
        setData(body);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Dashboard failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to]);

  const cards = data
    ? [
        ["Registered patients", String(data.patients)],
        ["Registrations in range", String(data.registrations)],
        ["Active doctors", data.activeDoctors === null ? "Hidden" : String(data.activeDoctors)],
        ["Today's appointments", String(data.todayAppointments)],
        ["Upcoming appointments", String(data.upcomingAppointments)],
        ["Completed in range", String(data.completedAppointments)],
        ["Cancelled in range", String(data.cancelledAppointments)],
        ["Pending invoices", data.pendingInvoices === null ? "Hidden" : String(data.pendingInvoices)],
        ["Collected", data.paidAmount === null ? "Hidden" : `INR ${data.paidAmount}`],
        ["Outstanding", data.outstandingAmount === null ? "Hidden" : `INR ${data.outstandingAmount}`],
      ]
    : [];

  return (
    <section>
      <PageTitle title="Dashboard" />
      <form className="mb-4 flex flex-wrap gap-3 text-sm">
        <label>
          From
          <input className="ml-2 rounded-md border border-stone-300 px-2 py-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input className="ml-2 rounded-md border border-stone-300 px-2 py-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </form>
      {loading ? <p className="text-stone-600">Loading clinic figures…</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded-md border border-stone-200 bg-white px-3 py-3">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <h2 className="mb-2 mt-8 text-lg font-semibold">Recent activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-stone-600">No activity for this account yet.</p>
          ) : (
            <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
              {data.recentActivity.map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {item.actorName} · {item.action} · {item.entityType}
                  </span>
                  <span className="text-stone-500">
                    {item.outcome} · {formatWhen(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mb-2 mt-8 text-lg font-semibold">Module status</h2>
          <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
            {data.modules.map((item) => (
              <li key={item.id} className="flex justify-between px-3 py-2 text-sm">
                <span>{item.name}</span>
                <span className={item.status === "Verified" ? "text-teal-800" : "text-stone-600"}>{item.status}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stone-500">
            Verified means the automated checks for that module have been run successfully in this environment. Implemented means the workflow exists and is waiting on those checks.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-teal-800 underline" to="/appointments">
              Open the schedule
            </Link>
          </p>
        </>
      ) : null}
    </section>
  );
}
