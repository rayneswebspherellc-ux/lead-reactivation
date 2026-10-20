"use client";

import { useId, useState } from "react";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_connected: "Google sign-in is not switched on yet. Please use your email for now.",
  google_failed: "Google sign-in did not finish. Please try again.",
  google_email_unverified: "Your Google email is not verified. Please use your email instead.",
};

export default function SignIn({ googleError, notice }: { googleError?: string | null; notice?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(googleError ? (GOOGLE_ERRORS[googleError] ?? null) : null);
  const emailId = useId();
  const codeId = useId();

  const post = (path: string, body: unknown) =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post("/api/auth/email/start", { email }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setStep("code");
      return;
    }
    const err = ((await res?.json().catch(() => ({}))) as { error?: string })?.error;
    setError(
      err === "bad_email"
        ? "Please check your email address."
        : err === "too_many"
          ? "Too many codes asked for. Please wait a little and try again."
          : err === "email_not_connected"
            ? "Email sign-in is not switched on yet."
            : "We could not send the code. Please try again.",
    );
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post("/api/auth/email/verify", { email, code }).catch(() => null);
    if (res?.ok) {
      window.location.replace("/");
      return;
    }
    setBusy(false);
    const err = ((await res?.json().catch(() => ({}))) as { error?: string })?.error;
    setError(
      err === "expired"
        ? "That code has expired. Ask for a new one."
        : err === "locked"
          ? "Too many wrong tries. Ask for a new code."
          : "That code is not right. Please check and try again.",
    );
  };

  return (
    <section className="max-w-xl mx-auto border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
      <div className="bg-rws-box-fill rounded-2xl px-6 py-5 sm:px-10">
        <h1 className="heading-section text-rws-text">Sign In</h1>
        <p className="text-body text-rws-text-secondary/80 mt-2">Find the leads worth contacting again.</p>
      </div>
      <div className="px-2 sm:px-6 py-6 flex flex-col gap-6">
        {notice && (
          <p role="status" className="text-body text-rws-gold">
            {notice}
          </p>
        )}

        <a href="/api/auth/google/start" className="btn-outline btn-name w-full py-4">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zm-5.6-8a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
          </svg>
          Continue with Google
        </a>

        <div className="flex items-center gap-4" aria-hidden="true">
          <span className="flex-1 border-t border-rws-box-border" />
          <span className="text-label text-rws-text-secondary/50">or</span>
          <span className="flex-1 border-t border-rws-box-border" />
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <label htmlFor={emailId} className="text-label text-rws-text-secondary/70">
              Your email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-body bg-transparent border border-rws-box-border rounded-xl px-4 py-3 text-rws-text"
            />
            <button type="submit" className="btn-gold mt-2" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
            <p className="text-caption text-rws-text-secondary/60">No password needed. We send a 6-digit code.</p>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <label htmlFor={codeId} className="text-label text-rws-text-secondary/70">
              Code sent to {email}
            </label>
            <input
              id={codeId}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-body bg-transparent border border-rws-box-border rounded-xl px-4 py-3 text-rws-text tracking-[0.3em]"
            />
            <button type="submit" className="btn-gold mt-2" disabled={busy}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              className="text-caption text-rws-text-secondary/60 hover:text-rws-gold self-start"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
            >
              Use a different email or get a new code
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="text-body text-rws-gold">
            {error}
          </p>
        )}

        <p className="text-caption text-rws-text-secondary/60">
          Your chats are read on your device and never uploaded. Read our{" "}
          <a href="/privacy" className="underline hover:text-rws-gold">
            privacy policy
          </a>
          .
        </p>
      </div>
    </section>
  );
}
