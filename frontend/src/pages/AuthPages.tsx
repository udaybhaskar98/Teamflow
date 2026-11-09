import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FormError, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";

function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
      <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-lg font-black shadow-lg shadow-brand-900/40">
            TF
          </div>
          <h1 className="text-3xl font-bold tracking-tight">TeamFlow</h1>
          <p className="mt-1 text-sm text-slate-400">Projects, people, and progress in one place.</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
            {footer}
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-slate-500">
          Secure workspace for teams that ship together.
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={from} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to your workspace."
      footer={
        <>
          New to TeamFlow?{" "}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
          />
        </div>
        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4 text-white" /> : <Icon name="arrow" className="h-4 w-4" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, register, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create your account");
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start organizing your team's work in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="register-name">
            Full name
          </label>
          <input
            id="register-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Alex Morgan"
          />
        </div>
        <div>
          <label className="label" htmlFor="register-email">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ characters"
            />
          </div>
          <div>
            <label className="label" htmlFor="register-confirm">
              Confirm password
            </label>
            <input
              id="register-confirm"
              type="password"
              required
              autoComplete="new-password"
              className="input"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Repeat password"
            />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4 text-white" /> : <Icon name="plus" className="h-4 w-4" />}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
