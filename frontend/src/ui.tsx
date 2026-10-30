import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "./api";
import { can, useAuth } from "./auth";

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: "Administrator",
    DOCTOR: "Doctor",
    RECEPTIONIST: "Receptionist",
    PATIENT: "Patient",
    BILLING_STAFF: "Billing staff",
  };
  return labels[role] ?? role;
}

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/patients", label: "Patients", permission: "patients:read" },
  { to: "/doctors", label: "Doctors", permission: "doctors:read" },
  { to: "/appointments", label: "Appointments", permission: "appointments:read" },
  { to: "/records", label: "Records", permission: "records:read" },
  { to: "/prescriptions", label: "Prescriptions", permission: "prescriptions:read" },
  { to: "/pharmacy", label: "Pharmacy", permission: "pharmacy:read" },
  { to: "/billing", label: "Billing", permission: "billing:read" },
  { to: "/reports", label: "Reports", permission: "reports:read" },
  { to: "/users", label: "Users", permission: "users:manage" },
  { to: "/audit", label: "Audit log", permission: "audit:read" },
];

export function Shell() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  const links = NAV.filter((item) => can(user, item.permission));

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="flex min-h-screen">
        <aside
          className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-30 w-64 border-r border-stone-200 bg-white transition md:static md:translate-x-0`}
        >
          <div className="border-b border-stone-200 px-4 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Clinic Demo</p>
            <p className="mt-1 text-lg font-semibold">Healthcare Management</p>
          </div>
          <nav className="flex flex-col gap-1 p-3" aria-label="Primary">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm ${isActive ? "bg-teal-50 font-medium text-teal-900" : "text-stone-700 hover:bg-stone-100"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        {open ? (
          <button className="fixed inset-0 z-20 bg-stone-900/30 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
            <button className="rounded-md border border-stone-300 px-3 py-1 text-sm md:hidden" onClick={() => setOpen(true)}>
              Menu
            </button>
            <p className="hidden text-sm text-stone-600 md:block">Fictional clinic records. Not for real patients.</p>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <div className="text-right">
                <p className="font-medium">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-stone-500">{user ? roleLabel(user.role) : ""}</p>
              </div>
              <NavLink className="rounded-md border border-stone-300 px-3 py-1" to="/account/password">
                Password
              </NavLink>
              <button className="rounded-md bg-stone-900 px-3 py-1 text-white" onClick={() => void logout()}>
                Log out
              </button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
            <Breadcrumbs />
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return <p className="mb-4 text-sm text-stone-500">Dashboard</p>;
  }
  return (
    <p className="mb-4 text-sm text-stone-500">
      <NavLink to="/" className="hover:underline">
        Dashboard
      </NavLink>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {" / "}
          {part.replaceAll("-", " ")}
        </span>
      ))}
    </p>
  );
}

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-300 bg-red-50 text-red-900",
    success: "border-teal-300 bg-teal-50 text-teal-950",
    info: "border-stone-300 bg-white text-stone-700",
  };
  return (
    <p className={`mb-4 rounded-md border px-4 py-3 text-sm ${styles[tone]}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

export const controlClass =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700";

export function PrimaryButton({
  children,
  type = "submit",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-md bg-white p-5 shadow-none">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-stone-700">{children}</div>
        <div className="mt-4">
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <p className="text-stone-600">
        {total} record{total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <SecondaryButton onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </SecondaryButton>
        <span className="px-2 py-2">
          {page} / {pages}
        </span>
        <SecondaryButton onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
        </SecondaryButton>
      </div>
    </div>
  );
}

export function SearchForm({
  initial,
  placeholder,
  onSearch,
}: {
  initial?: string;
  placeholder: string;
  onSearch: (query: string) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(value.trim());
  }
  return (
    <form className="mb-4 flex gap-2" onSubmit={submit}>
      <input className={controlClass} value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} />
      <PrimaryButton>Search</PrimaryButton>
    </form>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-600">{children}</p>;
}

export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-stone-100 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
