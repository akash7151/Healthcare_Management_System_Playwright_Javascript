import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, ApiError, type SessionUser } from "../api";
import { useAuth } from "../auth";
import { Alert, Field, PageTitle, PrimaryButton, controlClass } from "../ui";

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("asha.menon@example.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = await api<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(body.user);
      navigate("/");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Clinic Demo</p>
      <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-stone-600">Use a fictional demo account. The seed password is DemoPass123!.</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Email">
          <input className={controlClass} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={controlClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <PrimaryButton disabled={pending}>{pending ? "Signing in…" : "Sign in"}</PrimaryButton>
      </form>
      <Link className="mt-4 text-sm text-teal-800 underline" to="/reset-password">
        Reset password
      </Link>
    </main>
  );
}

export function ResetPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestToken(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const body = await api<{ message: string; resetToken?: string }>("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(body.message);
      if (body.resetToken) {
        setToken(body.resetToken);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setMessage("Password updated. You can sign in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset failed");
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Reset password</h1>
      <p className="mt-2 text-sm text-stone-600">Local development shows the reset token on this page. Production would send it out of band.</p>
      {message ? <div className="mt-4"><Alert tone="success">{message}</Alert></div> : null}
      {error ? <div className="mt-4"><Alert tone="error">{error}</Alert></div> : null}
      <form className="mt-4 space-y-3" onSubmit={(event) => void requestToken(event)}>
        <Field label="Account email">
          <input className={controlClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <PrimaryButton>Request token</PrimaryButton>
      </form>
      <form className="mt-8 space-y-3" onSubmit={(event) => void confirm(event)}>
        <Field label="Reset token">
          <input className={controlClass} value={token} onChange={(event) => setToken(event.target.value)} required />
        </Field>
        <Field label="New password">
          <input className={controlClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <PrimaryButton>Update password</PrimaryButton>
      </form>
      <Link className="mt-6 inline-block text-sm text-teal-800 underline" to="/login">
        Back to sign in
      </Link>
    </main>
  );
}

export function PasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage("Password changed. Sign in again with the new password.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change password");
    }
  }

  return (
    <section className="max-w-md">
      <PageTitle title="Change password" />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Current password">
          <input className={controlClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        </Field>
        <Field label="New password">
          <input className={controlClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        </Field>
        <PrimaryButton>Save password</PrimaryButton>
      </form>
    </section>
  );
}
