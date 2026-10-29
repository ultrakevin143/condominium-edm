"use client";
import { useState, type FormEvent } from "react";
import { useResource } from "../../shared/use-resource";
import { send } from "../../shared/api/client";
import { DataState } from "../../shared/data-view";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { SecretField } from "./secret-field";

export function AccountScreen({
  onSignedOut,
}: {
  onSignedOut: (message: string) => void;
}) {
  const profile = useResource<{ question: string | null; configured: boolean }>(
    "/account/security",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: "question" | "password",
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      kind === "password" &&
      data.get("newPassword") !== data.get("confirmPassword")
    ) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body =
        kind === "question"
          ? {
              currentPassword: data.get("currentPassword"),
              ...(profile.data?.configured
                ? { answer: data.get("answer") }
                : {}),
              question: data.get("question"),
              newAnswer: data.get("newAnswer"),
            }
          : {
              currentPassword: data.get("currentPassword"),
              answer: data.get("answer"),
              newPassword: data.get("newPassword"),
            };
      await send(
        kind === "question"
          ? "/account/security-question"
          : "/account/password",
        body,
        kind === "question" ? "PUT" : "POST",
      );
      onSignedOut(
        kind === "question"
          ? "Security question saved. All sessions were signed out; sign in again."
          : "Password changed. All sessions were signed out; use your new password.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The account update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Account security</h1>
          <p>Manage your own verification question and password.</p>
        </div>
      </header>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <DataState {...profile} onRetry={profile.reload}>
        {profile.data && (
          <>
            <p className="context">
              {profile.data.configured
                ? `Your question: ${profile.data.question}`
                : "No security question configured. Set one before changing your password."}{" "}
              Answers are stored as salted hashes and are never displayed. This
              question is an additional knowledge check, not MFA.
            </p>
            <form
              className="editor"
              aria-label="Security question"
              onSubmit={(event) => void submit(event, "question")}
            >
              <h2>
                {profile.data.configured
                  ? "Change security question"
                  : "Set security question"}
              </h2>
              <fieldset disabled={busy} className="security-fields">
                <SecretField
                  id="question-current-password"
                  name="currentPassword"
                  label="Current password"
                  autoComplete="current-password"
                />
                {profile.data.configured && (
                  <SecretField
                    id="question-current-answer"
                    name="answer"
                    label="Current security answer"
                  />
                )}
                <div>
                  <label htmlFor="security-question">Your question</label>
                  <Input
                    id="security-question"
                    name="question"
                    required
                    minLength={8}
                    maxLength={160}
                    placeholder="A question only you can answer"
                  />
                </div>
                <SecretField
                  id="question-new-answer"
                  name="newAnswer"
                  label="New security answer"
                  minLength={3}
                />
                <p className="context">
                  Saving signs out all your sessions and invalidates your
                  recovery codes. Avoid answers others can easily guess.
                </p>
                <Button type="submit">
                  {busy ? "Saving…" : "Save security question"}
                </Button>
              </fieldset>
            </form>
            <form
              className="editor"
              aria-label="Change password"
              onSubmit={(event) => void submit(event, "password")}
            >
              <h2>Change password</h2>
              <fieldset
                disabled={busy || !profile.data.configured}
                className="security-fields"
              >
                <SecretField
                  id="password-current"
                  name="currentPassword"
                  label="Current password"
                  autoComplete="current-password"
                />
                <SecretField
                  id="password-answer"
                  name="answer"
                  label="Security answer"
                />
                <SecretField
                  id="password-new"
                  name="newPassword"
                  label="New password"
                  minLength={15}
                  autoComplete="new-password"
                />
                <SecretField
                  id="password-confirm"
                  name="confirmPassword"
                  label="Confirm new password"
                  minLength={15}
                  autoComplete="new-password"
                />
                <p className="context">
                  Use 15–128 characters and a different password. Saving signs
                  out all sessions. Your private initial account note will no
                  longer contain this account’s current password.
                </p>
                <Button type="submit">
                  {busy ? "Saving…" : "Change password"}
                </Button>
              </fieldset>
            </form>
          </>
        )}
      </DataState>
    </>
  );
}
