"use client";
import { useState } from "react";
import { neonAuthClient } from "@/lib/neon-auth-client";

export default function GoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const { error } = await neonAuthClient.signIn.social({
        provider: "google",
        callbackURL: "/auth/complete",
      });
      if (error) {
        setError(error.message || "Google sign-in could not be started.");
        setBusy(false);
      }
    } catch {
      setError("Google sign-in could not be started. Please try again.");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="btn btn-primary auth-submit"
        onClick={signIn}
        disabled={busy}
      >
        <span aria-hidden="true">G</span>
        {busy ? "Opening Google…" : "Continue with Google"}
        <span aria-hidden="true">→</span>
      </button>
      {error && <div className="error">{error}</div>}
    </>
  );
}
