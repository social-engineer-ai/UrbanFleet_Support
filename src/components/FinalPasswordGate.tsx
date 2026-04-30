"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FinalPasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/final/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/final/pre-session");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || data.error === "locked") {
        setLocked(true);
        setError(
          data.unlockAtShort
            ? `Too many failed attempts. The final is locked until ${data.unlockAtShort}. Please raise your hand and ask the proctor.`
            : "Too many failed attempts. The final is locked for one hour. Please raise your hand and ask the proctor."
        );
      } else if (res.status === 401) {
        setError(
          `That password is not correct. You have ${data.remaining ?? "?"} attempt${
            data.remaining === 1 ? "" : "s"
          } remaining before the final locks for one hour.`
        );
      } else if (res.status === 403) {
        // Precondition failure (course/window/already-attempted) — page will
        // re-render the right error screen on refresh.
        router.refresh();
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md w-full bg-white border rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">
          BADM 558 Final
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter the cohort password your proctor has shared.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="final-password"
              className="block text-sm font-medium text-gray-700"
            >
              Cohort password
            </label>
            <input
              id="final-password"
              type="password"
              value={password}
              autoFocus
              autoComplete="off"
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || locked}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100"
            />
          </div>

          {error && (
            <p
              className={`text-sm ${
                locked ? "text-red-700" : "text-amber-700"
              }`}
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!password || submitting || locked}
            className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
