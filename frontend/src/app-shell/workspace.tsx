"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  GitMerge,
  Users,
  ShieldCheck,
  ListChecks,
  ClipboardList,
  LogOut,
  KeyRound,
} from "lucide-react";
import { api, send, ApiError } from "../shared/api/client";
import type { Profile } from "../shared/api/types";
import { Button } from "../shared/ui/button";
import { Input } from "../shared/ui/input";
import { PipelineScreen } from "../features/pipeline/pipeline.screen";
import { QualityScreen } from "../features/quality/quality.screen";
import { IssuesScreen } from "../features/issues/issues.screen";
import { TenantsScreen } from "../features/tenants/tenants.screen";
import { GovernanceScreen } from "../features/governance/governance.screen";
import { AccountScreen } from "../features/account/account.screen";
import { RecoveryForm } from "../features/account/recovery-form";
export function Workspace({ section }: { section: string }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function session() {
    setLoading(true);
    setError("");
    try {
      setProfile(await api<Profile>("/auth/me"));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError(
          e instanceof Error ? e.message : "Could not load your session.",
        );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void session();
  }, []);
  async function logout() {
    try {
      await send("/auth/logout");
      setProfile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed.");
    }
  }
  if (loading)
    return (
      <main id="main" className="login-shell">
        <p aria-busy="true">Checking your session…</p>
      </main>
    );
  if (!profile)
    return (
      <Login
        onLogin={(value) => {
          setProfile(value);
          setNotice("");
        }}
        sessionError={error}
        retry={session}
        notice={notice}
      />
    );
  const tabs = [
    {
      key: "pipeline",
      label: "Pipeline",
      icon: GitMerge,
      permission: "quality:read",
    },
    {
      key: "tenants",
      label: "Tenants & units",
      icon: Users,
      permission: "tenants:read",
    },
    {
      key: "quality",
      label: "Data quality",
      icon: ListChecks,
      permission: "quality:read",
    },
    {
      key: "issues",
      label: "Issue queue",
      icon: ClipboardList,
      permission: "quality:manage",
    },
    {
      key: "governance",
      label: "Governance",
      icon: ShieldCheck,
      permission: "tenants:read",
    },
    {
      key: "account",
      label: "Account security",
      icon: KeyRound,
      permission: "tenants:read",
    },
  ].filter((t) => profile.permissions.includes(t.permission));
  const current = tabs.some((t) => t.key === section) ? section : "tenants";
  return (
    <div className="workspace">
      <header className="app-header">
        <a href="/pipeline" className="brand">
          <Building2 size={22} />
          <span>
            Condo desk<small>Fictional property · EDM demonstration</small>
          </span>
        </a>
        <div className="account">
          <span>
            {profile.name}
            <small>{profile.role}</small>
          </span>
          <Button variant="ghost" onClick={logout}>
            <LogOut size={16} />
            <span>Sign out</span>
          </Button>
        </div>
      </header>
      <nav className="main-nav" aria-label="Workspace">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/${t.key}`}
            aria-current={current === t.key ? "page" : undefined}
          >
            <t.icon size={16} />
            {t.label}
          </a>
        ))}
      </nav>
      <main id="main" className="main-content">
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {current === "pipeline" && (
          <PipelineScreen
            canRun={profile.permissions.includes("pipeline:run")}
          />
        )}{" "}
        {current === "tenants" && <TenantsScreen />}
        {current === "quality" && <QualityScreen />}
        {current === "issues" && <IssuesScreen />}
        {current === "governance" && <GovernanceScreen profile={profile} />}
        {current === "account" && (
          <AccountScreen
            onSignedOut={(message) => {
              setNotice(message);
              setProfile(null);
              setError("");
            }}
          />
        )}
      </main>
      <footer className="app-footer">
        Fictional demonstration data. Values reflect recorded source evidence.
      </footer>
    </div>
  );
}
function Login({
  onLogin,
  sessionError,
  retry,
  notice,
}: {
  onLogin: (profile: Profile) => void;
  sessionError: string;
  retry: () => void;
  notice: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recover, setRecover] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      onLogin(
        await send<Profile>("/auth/login", {
          email: form.get("email"),
          password: form.get("password"),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <Building2 size={28} />
          <span>Condo desk</span>
        </div>
        <h1>{recover ? "Recover account access" : "Property staff sign in"}</h1>
        <p className="context">
          {recover
            ? "Use a code from your Property manager."
            : "Review unified records and resolve source data issues."}
        </p>
        {sessionError && (
          <div role="alert" className="notice">
            <p>{sessionError}</p>
            <Button variant="outline" onClick={retry}>
              Retry connection
            </Button>
          </div>
        )}
        {notice && !recover && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {recover ? (
          <RecoveryForm onBack={() => setRecover(false)} />
        ) : (
          <>
            <form onSubmit={submit}>
              <label htmlFor="email">Email address</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                disabled={busy}
                required
                maxLength={200}
              />
              <label htmlFor="password">Password</label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={busy}
                required
                maxLength={128}
              />
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setRecover(true);
                setError("");
              }}
            >
              Forgot password?
            </Button>
          </>
        )}
        <p className="login-note">
          Fictional condominium demonstration. Use your assigned test account.
        </p>
      </section>
    </main>
  );
}
