"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STAKEHOLDERS = ["elena", "marcus", "priya", "james"] as const;
const STAKEHOLDER_NAMES: Record<string, string> = {
  elena: "Elena Vasquez",
  marcus: "Marcus Chen",
  priya: "Priya Sharma",
  james: "James Whitfield",
};
const COVERAGE_POINTS = ["C1", "C2", "C3", "C4"] as const;
const CROSS_CUTTING = ["D1", "D2", "D3"] as const;

interface DetailMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  stakeholder?: string;
  timestamp: string;
}

interface DetailEvent {
  id: string;
  type: string;
  payload: unknown;
  timestamp: string;
}

interface StakeholderScores {
  C1: number;
  C2: number;
  C3: number;
  C4: number;
  notes: { C1: string; C2: string; C3: string; C4: string };
}

interface RawScores {
  elena: StakeholderScores;
  marcus: StakeholderScores;
  priya: StakeholderScores;
  james: StakeholderScores;
  cross_cutting: {
    D1: number;
    D1_note: string;
    D2: number;
    D2_note: string;
    D3: number;
    D3_note: string;
  };
  overall_notes: string;
}

interface DetailResponse {
  sessionId: string;
  user: { id: string; name: string; email: string; course: string };
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  flagged: boolean;
  flagReasons: string[];
  pasteCharCount: number;
  typedCharCount: number;
  tabHiddenCount: number;
  tabHiddenSeconds: number;
  coverage: { stakeholder: string; point: string }[];
  messages: DetailMessage[];
  events: DetailEvent[];
  rawScores: RawScores | null;
  overrides: Record<string, number>;
  aggregate: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export function Final558DetailClient({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [regrading, setRegrading] = useState(false);
  const [regradeMessage, setRegradeMessage] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function load() {
    const res = await fetch(`/api/admin/final-558/sessions/${sessionId}`);
    if (res.ok) {
      const d = (await res.json()) as DetailResponse;
      setData(d);
      const initial: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.overrides)) {
        initial[k] = String(v);
      }
      setOverrides(initial);
    }
  }

  function setOverride(key: string, value: string) {
    setOverrides((o) => ({ ...o, [key]: value }));
  }

  function clearOverride(key: string) {
    setOverrides((o) => {
      const rest = { ...o };
      delete rest[key];
      return rest;
    });
  }

  async function save() {
    setSaving(true);
    setSaveMessage(null);
    const numeric: Record<string, number> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "" || v === null) continue;
      const n = parseFloat(v);
      if (!Number.isNaN(n)) numeric[k] = n;
    }
    const res = await fetch(`/api/admin/final-558/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: numeric }),
    });
    if (res.ok) {
      const data = await res.json();
      setSaveMessage(`Saved. Aggregate: ${data.aggregate.toFixed(1)}`);
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setSaveMessage(err.error || "Save failed");
    }
    setSaving(false);
  }

  function reset() {
    setOverrides({});
  }

  async function regrade() {
    setRegrading(true);
    setRegradeMessage("Running AI grader… this can take 30-60 seconds.");
    try {
      const res = await fetch(
        `/api/admin/final-558/sessions/${sessionId}/regrade`,
        { method: "POST" }
      );
      if (res.ok) {
        const result = await res.json();
        setRegradeMessage(`Re-graded. Aggregate: ${result.aggregate.toFixed(1)}`);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        setRegradeMessage(err.error || "Re-grade failed");
      }
    } catch {
      setRegradeMessage("Network error during re-grade");
    }
    setRegrading(false);
  }

  // Live aggregate preview using current overrides. Falls back to 0 for any
  // cell where neither AI nor instructor has provided a value, so a
  // manual-only review (no AI grade) renders correctly as soon as
  // the instructor starts entering numbers.
  const previewAggregate = useMemo(() => {
    if (!data) return null;
    const PER_COVERAGE = 0.05;
    const PER_CROSS = 0.0667;
    const get = (key: string, fallback: number) => {
      if (overrides[key] !== undefined && overrides[key] !== "") {
        const n = parseFloat(overrides[key]);
        return Number.isNaN(n) ? fallback : n;
      }
      return fallback;
    };
    let total = 0;
    for (const sh of STAKEHOLDERS) {
      const sc = data.rawScores?.[sh];
      for (const p of COVERAGE_POINTS) {
        total += get(`${sh}.${p}`, sc?.[p] ?? 0) * PER_COVERAGE;
      }
    }
    for (const d of CROSS_CUTTING) {
      total += get(d, data.rawScores?.cross_cutting[d] ?? 0) * PER_CROSS;
    }
    // 0-50 scale to match computeAggregate in final558.ts.
    return Math.round(total * 10 * 100) / 100;
  }, [data, overrides]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  const focusGapsByMessageId = computeFocusGaps(data.events, data.messages);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/admin/final-558"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← All sessions
          </Link>
          {data.flagged && (
            <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-1 rounded">
              ⚠ Auto-flagged: {data.flagReasons.join(", ")}
            </span>
          )}
        </div>

        <header className="bg-white border rounded-2xl shadow-sm p-5 mb-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl font-semibold text-gray-900">
              {data.user.name}
            </h1>
            <span className="text-sm text-gray-500">{data.user.email}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-gray-600">
            <Stat label="Started" value={new Date(data.startedAt).toLocaleString()} />
            <Stat label="Ended" value={data.endedAt ? new Date(data.endedAt).toLocaleString() : "—"} />
            <Stat
              label="Duration"
              value={
                data.endedAt
                  ? formatMMSS(
                      Math.floor(
                        (new Date(data.endedAt).getTime() -
                          new Date(data.startedAt).getTime()) /
                          1000
                      )
                    )
                  : "—"
              }
            />
            <Stat label="End reason" value={data.endReason || "—"} />
            <Stat
              label="AI aggregate"
              value={data.aggregate !== null ? data.aggregate.toFixed(1) : "—"}
            />
          </div>
          {data.flagged && (
            <p className="mt-3 text-xs text-gray-600">
              Paste chars: {data.pasteCharCount} · Typed chars: {data.typedCharCount} · Tab-hidden events: {data.tabHiddenCount} · Tab-hidden sec: {data.tabHiddenSeconds}
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
          {/* Transcript */}
          <section className="bg-white border rounded-2xl shadow-sm">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-900">
                Transcript
              </h2>
            </div>
            <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
              {data.messages.map((m) => (
                <div key={m.id}>
                  {focusGapsByMessageId[m.id] && (
                    <FocusGap durationMs={focusGapsByMessageId[m.id]} />
                  )}
                  <TranscriptLine m={m} />
                </div>
              ))}
              {data.messages.length === 0 && (
                <p className="text-sm text-gray-500">No messages yet.</p>
              )}
            </div>
          </section>

          {/* Score sheet */}
          <aside className="bg-white border rounded-2xl shadow-sm h-fit">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Score sheet
              </h2>
              {previewAggregate !== null && (
                <span className="text-sm font-semibold text-gray-900">
                  {previewAggregate.toFixed(1)}
                </span>
              )}
            </div>
            {!data.endedAt ? (
              <p className="p-5 text-sm text-gray-500">
                Grading runs after the session ends.
              </p>
            ) : (
              <div className="p-5 space-y-5">
                {!data.rawScores && (
                  <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded">
                    No AI grade available. Use{" "}
                    <strong>Re-grade with AI</strong> to run the grader, or
                    fill in the boxes below to score this session manually.
                  </p>
                )}
                {STAKEHOLDERS.map((sh) => (
                  <div key={sh}>
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      {STAKEHOLDER_NAMES[sh]}
                    </h3>
                    <div className="space-y-1.5">
                      {COVERAGE_POINTS.map((p) => {
                        const key = `${sh}.${p}`;
                        const ai = data.rawScores?.[sh][p] ?? null;
                        const note = data.rawScores?.[sh].notes[p] ?? "";
                        return (
                          <ScoreRow
                            key={key}
                            scoreKey={key}
                            label={p}
                            ai={ai}
                            note={note}
                            override={overrides[key]}
                            onChange={(v) => setOverride(key, v)}
                            onClear={() => clearOverride(key)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Cross-cutting
                  </h3>
                  <div className="space-y-1.5">
                    {CROSS_CUTTING.map((d) => {
                      const ai = data.rawScores?.cross_cutting[d] ?? null;
                      const noteKey = `${d}_note` as
                        | "D1_note"
                        | "D2_note"
                        | "D3_note";
                      const note = data.rawScores
                        ? (data.rawScores.cross_cutting[noteKey] as string)
                        : "";
                      return (
                        <ScoreRow
                          key={d}
                          scoreKey={d}
                          label={d}
                          ai={ai}
                          note={note}
                          override={overrides[d]}
                          onChange={(v) => setOverride(d, v)}
                          onClear={() => clearOverride(d)}
                        />
                      );
                    })}
                  </div>
                </div>
                {data.rawScores?.overall_notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      Overall notes
                    </p>
                    <p className="text-xs text-gray-600">
                      {data.rawScores.overall_notes}
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-2 border-t">
                  <div className="flex gap-2">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="flex-1 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save overrides"}
                    </button>
                    <button
                      onClick={reset}
                      className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
                    >
                      Reset to AI
                    </button>
                  </div>
                  <button
                    onClick={regrade}
                    disabled={regrading || saving}
                    className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-2 rounded-lg disabled:opacity-50"
                    title="Replaces the current AI scores. Instructor overrides are preserved."
                  >
                    {regrading
                      ? "Re-grading… (~30-60s)"
                      : data.rawScores
                        ? "Re-grade with AI"
                        : "Run AI grader"}
                  </button>
                </div>
                {regradeMessage && (
                  <p className="text-xs text-gray-600">{regradeMessage}</p>
                )}
                {saveMessage && (
                  <p className="text-xs text-gray-600">{saveMessage}</p>
                )}
                {data.reviewedAt && (
                  <p className="text-xs text-gray-500">
                    Last reviewed {new Date(data.reviewedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="uppercase text-[10px] tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function ScoreRow({
  label,
  ai,
  note,
  override,
  onChange,
  onClear,
}: {
  scoreKey: string;
  label: string;
  ai: number | null;
  note: string;
  override: string | undefined;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const isOverridden = override !== undefined && override !== "";
  const aiDisplay = ai === null ? "—" : ai;
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <span className="w-7 font-semibold text-gray-700">{label}</span>
        <span
          className={`w-7 text-center px-1 py-0.5 rounded ${
            ai === null
              ? "bg-gray-100 text-gray-400"
              : isOverridden
                ? "bg-gray-100 text-gray-500 line-through"
                : "bg-blue-50 text-blue-700"
          }`}
          title={ai === null ? "No AI score" : "AI score"}
        >
          {aiDisplay}
        </span>
        <input
          type="number"
          min={0}
          max={5}
          step={0.5}
          placeholder="—"
          value={override ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={`w-14 px-1.5 py-0.5 border rounded text-center ${
            isOverridden ? "border-amber-400 bg-amber-50" : "border-gray-300"
          }`}
        />
        {isOverridden && (
          <button
            onClick={onClear}
            className="text-gray-400 hover:text-gray-700"
            title="Clear override"
          >
            ×
          </button>
        )}
      </div>
      {note && <p className="text-gray-500 mt-1 ml-9 leading-snug">{note}</p>}
    </div>
  );
}

function TranscriptLine({ m }: { m: DetailMessage }) {
  const isUser = m.role === "user";
  // Heuristic: messages that contain very large character runs without
  // newlines look paste-flavored; we don't have direct paste-attribution at
  // the message level (only at event level), so this is best-effort.
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-50 border border-blue-200 text-gray-900"
            : "bg-white border border-gray-200 text-gray-800"
        }`}
      >
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">
            {isUser ? "Student" : m.stakeholder ? STAKEHOLDER_NAMES[m.stakeholder] : "Stakeholder"}
          </span>
          <span className="text-[10px] text-gray-400">
            {new Date(m.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {isUser ? (
          <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
        ) : (
          <div className="leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusGap({ durationMs }: { durationMs: number }) {
  const sec = Math.round(durationMs / 1000);
  return (
    <div className="my-2 px-3 py-1 bg-amber-50 border border-amber-200 text-[11px] text-amber-800 rounded text-center">
      Tab away for {sec < 60 ? `${sec}s` : `${Math.round(sec / 60)}m`}
    </div>
  );
}

// Pair focus_blur events with the next focus_return event, then attribute
// the gap to the next user message (or display before the assistant turn
// if no user message follows the return).
function computeFocusGaps(
  events: DetailEvent[],
  messages: DetailMessage[]
): Record<string, number> {
  const result: Record<string, number> = {};
  let blurredAt: number | null = null;
  for (const e of events) {
    if (e.type === "focus_blur") {
      blurredAt = new Date(e.timestamp).getTime();
    } else if (e.type === "focus_return" && blurredAt !== null) {
      const returnedAt = new Date(e.timestamp).getTime();
      const duration = returnedAt - blurredAt;
      blurredAt = null;
      // Find the next message after returnedAt and attribute the gap to it.
      const next = messages.find((m) => new Date(m.timestamp).getTime() >= returnedAt);
      if (next) result[next.id] = duration;
    }
  }
  return result;
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
