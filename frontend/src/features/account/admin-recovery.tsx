"use client";
import { useState, type FormEvent } from "react";
import type { User } from "../../shared/api/types";
import { send } from "../../shared/api/client";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { date } from "../../shared/utils";
import { SecretField } from "./secret-field";

export function AdminRecovery({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [action, setAction] = useState("issue"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [issued, setIssued] = useState<{
      code: string;
      expiresAt: string;
    } | null>(null),
    [reveal, setReveal] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await send<{ code?: string; expiresAt?: string }>(
        `/account/users/${user.id}/${action === "issue" ? "recovery-code" : "security-question"}`,
        {
          adminPassword: data.get("adminPassword"),
          adminAnswer: data.get("adminAnswer"),
          verificationNote: data.get("verificationNote"),
        },
        action === "issue" ? "POST" : "DELETE",
      );
      form.reset();
      if (result.code && result.expiresAt)
        setIssued({ code: result.code, expiresAt: result.expiresAt });
      else {
        setMessage(
          "Security question cleared and sessions/codes revoked. After verification, issue a new code so this user can recover and set their own question.",
        );
        setAction("issue");
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Recovery action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor" aria-label="Administrator recovery">
      <div className="section-title">
        <h3>Recovery for {user.name}</h3>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Close recovery
        </Button>
      </div>
      <p className="context">
        Verify this person outside the app first. You must have your own
        security question configured. Never put passwords, answers or codes in
        the verification note.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {issued ? (
        <>
          <p role="status">
            Recovery code issued. Share it privately once; expires{" "}
            {date(issued.expiresAt)}. Closing this panel clears the displayed
            code.
          </p>
          <div>
            <label htmlFor="issued-code">Recovery code (shown once)</label>
            <Input
              id="issued-code"
              type={reveal ? "text" : "password"}
              value={issued.code}
              readOnly
              autoComplete="off"
            />
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={reveal}
              onChange={(event) => setReveal(event.target.checked)}
            />{" "}
            Show recovery code
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(issued.code);
                setMessage(
                  "Code copied. Share it only with the verified account holder.",
                );
              } catch {
                setError(
                  "Copy was unavailable. Reveal and select the code to copy it manually.",
                );
              }
            }}
          >
            Copy recovery code
          </Button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="security-fields">
            <div>
              <label htmlFor="recovery-action">Recovery action</label>
              <select
                id="recovery-action"
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                <option value="issue">Issue recovery code</option>
                <option value="clear">Reset security question</option>
              </select>
            </div>
            <SecretField
              id="admin-current-password"
              name="adminPassword"
              label="Your current password"
              autoComplete="current-password"
            />
            <SecretField
              id="admin-security-answer"
              name="adminAnswer"
              label="Your security answer"
            />
            <div>
              <label htmlFor="verification-note">
                Identity verification note
              </label>
              <textarea
                id="verification-note"
                name="verificationNote"
                required
                minLength={20}
                maxLength={1000}
                placeholder="Describe how you verified this person; omit secrets."
              />
            </div>
            {action === "clear" && (
              <p className="context">
                This clears the answer; it does not show it or choose a
                replacement. The account is signed out and its recovery codes
                are revoked.
              </p>
            )}
            <Button type="submit">
              {busy
                ? "Verifying…"
                : action === "issue"
                  ? "Issue recovery code"
                  : "Reset security question"}
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
