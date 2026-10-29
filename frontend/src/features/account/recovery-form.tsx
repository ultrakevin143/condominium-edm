"use client";
import { useState, type FormEvent } from "react";
import { send } from "../../shared/api/client";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { SecretField } from "./secret-field";

export function RecoveryForm({ onBack }: { onBack: () => void }) {
  const [identity, setIdentity] = useState<{
    email: string;
    code: string;
  } | null>(null);
  const [question, setQuestion] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    if (identity && data.get("newPassword") !== data.get("confirmPassword")) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!identity) {
        const values = {
          email: String(data.get("email")),
          code: String(data.get("code")),
        };
        const details = await send<{ question: string | null }>(
          "/auth/recovery/details",
          values,
        );
        setIdentity(values);
        setQuestion(details.question);
        form.reset();
      } else {
        await send("/auth/recovery/reset", {
          ...identity,
          newPassword: data.get("newPassword"),
          ...(question ? { answer: data.get("answer") } : {}),
        });
        setIdentity(null);
        setQuestion(null);
        form.reset();
        setDone(true);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Recovery could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {done ? (
        <p role="status" className="notice">
          Password recovered. All sessions were signed out. Sign in with your
          new password.
        </p>
      ) : (
        <>
          <p className="context">
            Ask the Property manager to verify your identity and give you a
            single-use code. It expires after 15 minutes; it is not sent
            automatically by email.
          </p>
          <form onSubmit={submit} aria-label="Recover account">
            <fieldset disabled={busy} className="security-fields">
              {!identity ? (
                <>
                  <div>
                    <label htmlFor="recovery-email">Email address</label>
                    <Input
                      id="recovery-email"
                      name="email"
                      type="email"
                      required
                      maxLength={200}
                      autoComplete="username"
                    />
                  </div>
                  <SecretField
                    id="recovery-code"
                    name="code"
                    label="Administrator recovery code"
                    autoComplete="one-time-code"
                  />
                </>
              ) : (
                <>
                  {question && (
                    <>
                      <p className="context">Security question: {question}</p>
                      <SecretField
                        id="recovery-answer"
                        name="answer"
                        label="Security answer"
                      />
                    </>
                  )}
                  <SecretField
                    id="recovery-password"
                    name="newPassword"
                    label="New password"
                    minLength={15}
                    autoComplete="new-password"
                  />
                  <SecretField
                    id="recovery-confirm"
                    name="confirmPassword"
                    label="Confirm new password"
                    minLength={15}
                    autoComplete="new-password"
                  />
                  <p className="context">
                    Use 15–128 characters and a different password.
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Button type="submit">
                {busy
                  ? "Verifying…"
                  : identity
                    ? "Reset password"
                    : "Verify recovery code"}
              </Button>
            </fieldset>
          </form>
        </>
      )}
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
        Back to sign in
      </Button>
    </>
  );
}
