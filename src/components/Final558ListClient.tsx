"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface SessionRow {
  sessionId: string;
  userId: string;
  studentName: string;
  email: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationSec: number | null;
  flagged: boolean;
  flagReasons: string[];
  aggregate: number | null;
  reviewedAt: string | null;
  hasScore: boolean;
}

type SortKey = "name" | "started" | "ended" | "duration" | "score";

export function Final558ListClient() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("started");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [filterUngraded, setFilterUngraded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/final-558/sessions");
    if (res.ok) {
      const data = await res.json();
      setRows(data.sessions);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function header(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button
        className={`text-left ${active ? "text-gray-900" : "text-gray-500"}`}
        onClick={() => {
          if (active) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
          } else {
            setSortKey(key);
            setSortDir("desc");
          }
        }}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
    );
  }

  const sorted = [...rows]
    .filter((r) => !filterFlagged || r.flagged)
    .filter((r) => !filterUngraded || !r.reviewedAt)
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return a.studentName.localeCompare(b.studentName) * dir;
        case "started":
          return (
            (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()) *
            dir
          );
        case "ended":
          return (
            ((a.endedAt ? new Date(a.endedAt).getTime() : 0) -
              (b.endedAt ? new Date(b.endedAt).getTime() : 0)) *
            dir
          );
        case "duration":
          return ((a.durationSec ?? 0) - (b.durationSec ?? 0)) * dir;
        case "score":
          return ((a.aggregate ?? -1) - (b.aggregate ?? -1)) * dir;
        default:
          return 0;
      }
    });

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              BADM 558 Final — Sessions
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {rows.length} session{rows.length === 1 ? "" : "s"} on file.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/final-558/settings"
              className="text-sm text-blue-600 hover:text-blue-800 px-3 py-2"
            >
              Settings
            </Link>
            <a
              href="/api/admin/final-558/export"
              className="text-sm bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-700"
            >
              Export CSV
            </a>
          </div>
        </div>

        <div className="mb-3 flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterFlagged}
              onChange={(e) => setFilterFlagged(e.target.checked)}
            />
            Flagged only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterUngraded}
              onChange={(e) => setFilterUngraded(e.target.checked)}
            />
            Not yet reviewed
          </label>
        </div>

        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No sessions match.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">{header("Student", "name")}</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">{header("Started", "started")}</th>
                  <th className="px-4 py-3">{header("Ended", "ended")}</th>
                  <th className="px-4 py-3">{header("Duration", "duration")}</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">{header("Score", "score")}</th>
                  <th className="px-4 py-3">Flag</th>
                  <th className="px-4 py-3">Reviewed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((r) => (
                  <tr key={r.sessionId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/admin/final-558/${r.sessionId}`}
                        className="hover:underline"
                      >
                        {r.studentName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(r.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.endedAt ? new Date(r.endedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.durationSec !== null ? formatMMSS(r.durationSec) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.endReason || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.aggregate !== null ? (
                        <span className="font-semibold text-gray-900">
                          {r.aggregate.toFixed(1)}
                        </span>
                      ) : r.endedAt ? (
                        <span className="text-amber-700 text-xs">ungraded</span>
                      ) : (
                        <span className="text-gray-400 text-xs">in progress</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.flagged ? (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"
                          title={r.flagReasons.join(", ")}
                        />
                      ) : (
                        <span className="text-gray-300">·</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.reviewedAt
                        ? new Date(r.reviewedAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
