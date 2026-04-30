"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SettingsResponse {
  configured: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  weights: { perCoveragePoint: number; perCrossCutting: number } | null;
  forcedEntryAt: number;
  hardCutoffAt: number;
  updatedAt?: string;
}

interface LockoutRow {
  userId: string;
  name: string;
  email: string;
  unlockAt: string;
}

// Convert ISO string to "YYYY-MM-DDTHH:MM" for datetime-local input
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Final558SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [password, setPassword] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [perCoverage, setPerCoverage] = useState(0.05);
  const [perCross, setPerCross] = useState(0.0667);
  const [forcedEntryAt, setForcedEntryAt] = useState(1320);
  const [hardCutoffAt, setHardCutoffAt] = useState(4200);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockouts, setLockouts] = useState<LockoutRow[]>([]);

  useEffect(() => {
    void load();
    void loadLockouts();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/final-558/settings");
      if (!res.ok) {
        setError("Failed to load settings");
        return;
      }
      const data = (await res.json()) as SettingsResponse;
      setSettings(data);
      setWindowStart(isoToLocalInput(data.windowStart));
      setWindowEnd(isoToLocalInput(data.windowEnd));
      if (data.weights) {
        setPerCoverage(data.weights.perCoveragePoint);
        setPerCross(data.weights.perCrossCutting);
      }
      setForcedEntryAt(data.forcedEntryAt);
      setHardCutoffAt(data.hardCutoffAt);
    } finally {
      setLoading(false);
    }
  }

  async function loadLockouts() {
    const res = await fetch("/api/admin/final-558/lockouts");
    if (res.ok) {
      const data = await res.json();
      setLockouts(data.locked || []);
    }
  }

  async function save() {
    setMessage(null);
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        weights: { perCoveragePoint: perCoverage, perCrossCutting: perCross },
        forcedEntryAt,
        hardCutoffAt,
      };
      if (password) payload.password = password;
      if (windowStart) payload.windowStart = new Date(windowStart).toISOString();
      if (windowEnd) payload.windowEnd = new Date(windowEnd).toISOString();

      const res = await fetch("/api/admin/final-558/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
      } else {
        setMessage(
          data.passwordUpdated
            ? "Saved. Cohort password updated."
            : "Saved."
        );
        setPassword("");
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function unlock(userId: string) {
    const res = await fetch("/api/admin/final-558/lockouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      await loadLockouts();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              BADM 558 Final — Settings
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {settings?.configured
                ? `Last updated ${
                    settings.updatedAt
                      ? new Date(settings.updatedAt).toLocaleString()
                      : "previously"
                  }.`
                : "Not yet configured. Set the cohort password and time window to enable the final."}
            </p>
          </div>
          <Link
            href="/admin/final-558"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View sessions →
          </Link>
        </div>

        <section className="bg-white border rounded-2xl p-6 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Cohort password
            </label>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings?.configured ? "Leave blank to keep existing" : "Required"}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Stored as a bcrypt hash. Share this with proctors only.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Window opens
              </label>
              <input
                type="datetime-local"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Window closes
              </label>
              <input
                type="datetime-local"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Forced entry threshold (sec)
              </label>
              <input
                type="number"
                value={forcedEntryAt}
                onChange={(e) => setForcedEntryAt(parseInt(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default 1320 (22 min). A stakeholder silent past this barges in.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Hard cutoff (sec)
              </label>
              <input
                type="number"
                value={hardCutoffAt}
                onChange={(e) => setHardCutoffAt(parseInt(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default 4200 (70 min). Session ends and locks at this mark.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weight per coverage point
              </label>
              <input
                type="number"
                step="0.0001"
                value={perCoverage}
                onChange={(e) => setPerCoverage(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weight per cross-cutting dim
              </label>
              <input
                type="number"
                step="0.0001"
                value={perCross}
                onChange={(e) => setPerCross(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {message && (
            <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded">
              {message}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </section>

        <section className="mt-8 bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Active lockouts
            </h2>
            <button
              onClick={loadLockouts}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Refresh
            </button>
          </div>
          {lockouts.length === 0 ? (
            <p className="text-sm text-gray-500">No students are locked out.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="py-2">Student</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Unlocks at</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lockouts.map((l) => (
                  <tr key={l.userId}>
                    <td className="py-2">{l.name}</td>
                    <td className="py-2 text-gray-600">{l.email}</td>
                    <td className="py-2 text-gray-600">
                      {new Date(l.unlockAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => unlock(l.userId)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Unlock now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
