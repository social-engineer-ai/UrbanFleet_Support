"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STAKEHOLDERS = [
  { id: "elena", name: "Elena Vasquez", title: "VP of Operations" },
  { id: "marcus", name: "Marcus Chen", title: "CFO" },
  { id: "priya", name: "Priya Sharma", title: "CTO" },
  { id: "james", name: "James Whitfield", title: "Compliance Director" },
] as const;

type StakeholderId = (typeof STAKEHOLDERS)[number]["id"];

interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  stakeholder?: StakeholderId;
  timestamp: string;
}

interface Coverage {
  C1: boolean;
  C2: boolean;
  C3: boolean;
  C4: boolean;
}

interface SessionState {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  activeStakeholder: StakeholderId;
  elapsedSec: number;
  remainingSec: number;
  hardCutoffSec: number;
  coverage: Record<StakeholderId, Coverage>;
  messages: SessionMessage[];
}

const PASTE_WARN_LEN = 40;

interface Banner {
  id: string;
  kind: "yellow" | "red" | "red_locked";
  text: string;
}

export function FinalSessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<SessionState | null>(null);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [streamingStakeholder, setStreamingStakeholder] = useState<StakeholderId | null>(null);
  const [sending, setSending] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [endConfirmArmed, setEndConfirmArmed] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [hardCutoffShown, setHardCutoffShown] = useState(false);
  const [warnings, setWarnings] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blurredAtRef = useRef<number | null>(null);

  // Initial load + polling for elapsed/remaining time the server is the
  // ultimate authority on. We re-pull every 30s for drift correction; the
  // local timer in between updates every second from the last server value.
  useEffect(() => {
    void loadState();
    const drift = setInterval(() => void loadState(), 30000);
    return () => clearInterval(drift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Refocus the textarea after a send completes. The textarea is
  // `disabled={sending}`, so the inline focus() call right after
  // setSending(false) fires before the re-render and is dropped by the
  // browser. A useEffect on `sending` runs after the re-render and
  // reliably puts the cursor back where the student expects it.
  useEffect(() => {
    if (!sending) {
      textareaRef.current?.focus();
    }
  }, [sending]);

  // Local 1Hz tick to advance the timer between server pulls.
  useEffect(() => {
    if (!state || state.endedAt) return;
    const tick = setInterval(() => {
      setState((s) => {
        if (!s || s.endedAt) return s;
        const next = { ...s, elapsedSec: s.elapsedSec + 1, remainingSec: Math.max(0, s.remainingSec - 1) };
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [state?.endedAt]);

  // Time-warning surfacing — purely client-side from the local timer.
  useEffect(() => {
    if (!state || state.endedAt) return;
    const elapsed = state.elapsedSec;
    const cutoff = state.hardCutoffSec;
    const tenLeft = cutoff - 10 * 60; // 60:00
    const fiveLeft = cutoff - 5 * 60; // 65:00
    const thirtySecLeft = cutoff - 30; // 69:30

    if (elapsed >= tenLeft && !warnings.has("ten_left")) {
      addBanner(
        "ten_left",
        "yellow",
        "You are at the 60-minute mark. You have 10 minutes left. If there is a stakeholder you have not addressed, the next few minutes are your chance.",
        true
      );
      setWarnings((w) => new Set(w).add("ten_left"));
    }
    if (elapsed >= fiveLeft && !warnings.has("five_left")) {
      addBanner(
        "five_left",
        "red",
        "5 minutes remaining. Wrap up your current point and make sure all four stakeholders have something on the record.",
        true
      );
      setWarnings((w) => new Set(w).add("five_left"));
    }
    if (elapsed >= thirtySecLeft && !warnings.has("thirty_sec")) {
      addBanner(
        "thirty_sec",
        "red_locked",
        "30 seconds. The session ends automatically at 70:00 and the transcript locks.",
        false
      );
      setWarnings((w) => new Set(w).add("thirty_sec"));
    }
    if (elapsed >= cutoff && !hardCutoffShown) {
      setHardCutoffShown(true);
      // Fire-and-forget the end call with hard_cutoff reason.
      void endSession("hard_cutoff");
    }
  }, [state?.elapsedSec, state?.hardCutoffSec, state?.endedAt, warnings, hardCutoffShown]);

  // Paste handler on the input textarea.
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text") || "";
    void postEvent({ type: "paste", length: pasted.length });
    if (pasted.length > PASTE_WARN_LEN) {
      addBanner(
        `paste-${Date.now()}`,
        "yellow",
        `You pasted ${pasted.length} characters. Pasted content is logged for instructor review. If you intended to type your answer, please type it out.`,
        true,
        8000
      );
    }
  }

  // Window-level focus / visibility tracking.
  useEffect(() => {
    function onBlur() {
      if (blurredAtRef.current === null) {
        blurredAtRef.current = Date.now();
        void postEvent({ type: "focus_blur" });
      }
    }
    function onFocus() {
      if (blurredAtRef.current !== null) {
        const hidden = Date.now() - blurredAtRef.current;
        blurredAtRef.current = null;
        void postEvent({ type: "focus_return", hiddenMs: hidden });
        addBanner(
          `focus-${Date.now()}`,
          "yellow",
          `Welcome back. You were away from this tab for ${formatDuration(hidden)}. The event is logged for instructor review.`,
          true,
          8000
        );
      }
    }
    function onVisibility() {
      if (document.hidden) onBlur();
      else onFocus();
    }
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Auto-scroll on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages.length, streamingText]);

  async function loadState() {
    const res = await fetch(`/api/final/session/${sessionId}/messages`);
    if (res.ok) {
      const data = (await res.json()) as SessionState;
      setState(data);
      if (data.endedAt) {
        // If the server says we ended, jump to the complete page.
        router.replace(`/final/complete/${sessionId}`);
      }
    }
  }

  function addBanner(
    id: string,
    kind: Banner["kind"],
    text: string,
    dismissable: boolean,
    autoDismissMs?: number
  ) {
    setBanners((b) => [...b, { id, kind, text }]);
    if (dismissable && autoDismissMs) {
      setTimeout(() => {
        setBanners((b) => b.filter((x) => x.id !== id));
      }, autoDismissMs);
    }
  }

  function dismissBanner(id: string) {
    setBanners((b) => b.filter((x) => x.id !== id));
    void postEvent({ type: "warning_dismissed", warning: id });
  }

  async function postEvent(payload: Record<string, unknown>) {
    try {
      await fetch(`/api/final/session/${sessionId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      /* best-effort */
    }
  }

  const sendMessage = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!input.trim() || sending || !state || state.endedAt) return;

      const text = input.trim();
      setInput("");
      setSending(true);
      setStreamingText("");
      setStreamingStakeholder(null);

      // Optimistic user message
      setState((s) =>
        s
          ? {
              ...s,
              messages: [
                ...s.messages,
                {
                  id: `temp-${Date.now()}`,
                  role: "user",
                  content: text,
                  timestamp: new Date().toISOString(),
                },
              ],
            }
          : s
      );

      try {
        const res = await fetch(`/api/final/session/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.error === "time_up") {
            void endSession("hard_cutoff");
            return;
          }
          setStreamingText(`Error: ${err.error || "request failed"}`);
          setSending(false);
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let metaStakeholder: StakeholderId | null = null;
        let coverageInfo: { stakeholder: StakeholderId; covered: string[] } | null = null;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6));
                if (data.meta) {
                  metaStakeholder = data.meta.stakeholder as StakeholderId;
                  setStreamingStakeholder(metaStakeholder);
                  if (data.meta.coverageCovered?.length) {
                    coverageInfo = {
                      stakeholder: data.meta.coverageStakeholder,
                      covered: data.meta.coverageCovered,
                    };
                  }
                }
                if (data.text) {
                  fullText += data.text;
                  setStreamingText(fullText);
                }
                if (data.error) {
                  fullText += `\n\n[Error: ${data.error}]`;
                  setStreamingText(fullText);
                }
                if (data.done) {
                  // server side has the authoritative remaining
                }
              } catch {
                /* partial chunk */
              }
            }
          }
        }

        // Commit to state
        setState((s) => {
          if (!s) return s;
          const updatedCoverage = { ...s.coverage };
          if (coverageInfo) {
            const sh = coverageInfo.stakeholder;
            updatedCoverage[sh] = { ...updatedCoverage[sh] };
            for (const p of coverageInfo.covered) {
              if (p === "C1" || p === "C2" || p === "C3" || p === "C4") {
                updatedCoverage[sh][p] = true;
              }
            }
          }
          return {
            ...s,
            activeStakeholder: metaStakeholder ?? s.activeStakeholder,
            coverage: updatedCoverage,
            messages: [
              ...s.messages,
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: fullText,
                stakeholder: metaStakeholder ?? undefined,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        });
        setStreamingText("");
        setStreamingStakeholder(null);
      } catch (err) {
        console.error("Send error:", err);
        setStreamingText("Failed to send. Please try again.");
      }
      setSending(false);
      textareaRef.current?.focus();
    },
    [input, sending, state, sessionId]
  );

  async function endSession(reason: "student" | "hard_cutoff") {
    if (endingSession || !state || state.endedAt) return;
    setEndingSession(true);
    try {
      await fetch(`/api/final/session/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    } catch {
      /* swallow — we redirect regardless so the student isn't trapped */
    }
    router.push(`/final/complete/${sessionId}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // Hard cutoff modal
  if (hardCutoffShown) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md bg-white border rounded-2xl p-8 shadow-sm text-center">
          <h2 className="text-lg font-semibold text-gray-900">Time is up.</h2>
          <p className="mt-3 text-sm text-gray-700">
            The session has ended. Your transcript is locked and your
            conversation is being graded. You can return to the dashboard.
          </p>
          {endingSession && (
            <p className="mt-3 text-xs text-gray-500">Saving and grading…</p>
          )}
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Loading session…
      </div>
    );
  }

  const active = STAKEHOLDERS.find((s) => s.id === state.activeStakeholder)!;
  const remainingMin = Math.floor(state.remainingSec / 60);
  const remainingSec = state.remainingSec % 60;
  const elapsedSec = state.elapsedSec;
  const cutoff = state.hardCutoffSec;
  const timerColor =
    elapsedSec >= cutoff - 5 * 60
      ? "text-red-600 bg-red-50"
      : elapsedSec >= cutoff - 10 * 60
        ? "text-amber-700 bg-amber-50"
        : "text-gray-700 bg-gray-100";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner stack */}
      <div className="sticky top-0 z-40 space-y-1 px-3 pt-3">
        {banners.map((b) => (
          <div
            key={b.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-2 text-sm ${
              b.kind === "yellow"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : b.kind === "red"
                  ? "bg-red-50 border-red-200 text-red-900"
                  : "bg-red-100 border-red-300 text-red-900 font-medium"
            }`}
          >
            <span className="flex-1">{b.text}</span>
            {b.kind !== "red_locked" && (
              <button
                onClick={() => dismissBanner(b.id)}
                className="text-xs uppercase tracking-wide hover:underline"
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-3 pt-3 pb-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Main chat */}
        <div className="bg-white border rounded-2xl shadow-sm flex flex-col h-[calc(100vh-90px)]">
          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                {active.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{active.name}</p>
                <p className="text-xs text-gray-500">{active.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded ${timerColor}`}
                title="Elapsed time / total"
              >
                {formatMMSS(elapsedSec)} / {formatMMSS(cutoff)}{" "}
                <span className="text-[10px] opacity-70">
                  ({remainingMin}:{remainingSec.toString().padStart(2, "0")} left)
                </span>
              </span>
              <button
                onClick={() => setShowEndDialog(true)}
                className="text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
              >
                End Session
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {state.messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[78%] rounded-2xl px-4 py-3 bg-white border border-gray-200">
                  {streamingStakeholder && (
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                      {STAKEHOLDERS.find((s) => s.id === streamingStakeholder)?.name}
                    </p>
                  )}
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingText}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            {sending && !streamingText && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="border-t px-5 py-3 shrink-0">
            <div className="flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Type your response… (Enter to send, Shift+Enter for new line)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="bg-blue-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar: coverage tracker */}
        <aside className="bg-white border rounded-2xl shadow-sm p-5 h-fit">
          <h2 className="text-sm font-semibold text-gray-900">Topics covered</h2>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            These light up as you cover ground with each stakeholder.
          </p>
          <div className="space-y-3">
            {STAKEHOLDERS.map((s) => {
              const cov = state.coverage[s.id];
              const isActive = s.id === state.activeStakeholder;
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border px-3 py-2 ${
                    isActive ? "border-blue-300 bg-blue-50/40" : "border-gray-200"
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-900">{s.name}</p>
                  <p className="text-[11px] text-gray-500 mb-1.5">{s.title}</p>
                  <div className="flex gap-1.5 text-[10px]">
                    {(["C1", "C2", "C3", "C4"] as const).map((p) => (
                      <CoverageDot key={p} label={p} covered={cov[p]} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[11px] text-gray-500 leading-relaxed">
            <span className="font-semibold">C1</span> business problem ·{" "}
            <span className="font-semibold">C2</span> data ·{" "}
            <span className="font-semibold">C3</span> infrastructure ·{" "}
            <span className="font-semibold">C4</span> solution
          </p>
        </aside>
      </div>

      {/* End Session confirmation dialog */}
      {showEndDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-semibold text-gray-900">End your final?</h3>
            <p className="mt-2 text-sm text-gray-700">
              Once you end this session you cannot reopen it. Your transcript
              will be locked and your conversation will be graded. Make sure
              you have addressed all four stakeholders.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowEndDialog(false);
                  setEndConfirmArmed(false);
                }}
                autoFocus
                className="px-4 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Keep going
              </button>
              <DoubleClickEndButton
                armed={endConfirmArmed}
                onArm={() => setEndConfirmArmed(true)}
                onConfirm={() => endSession("student")}
                disabled={endingSession}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: SessionMessage }) {
  const isUser = m.role === "user";
  const sh = m.stakeholder
    ? STAKEHOLDERS.find((s) => s.id === m.stakeholder)
    : null;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-white border border-gray-200 text-gray-800"
        }`}
      >
        {!isUser && sh && (
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
            {sh.name}
          </p>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
        ) : (
          <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function CoverageDot({ label, covered }: { label: string; covered: boolean }) {
  return (
    <span
      className={`flex-1 text-center rounded py-0.5 ${
        covered
          ? "bg-emerald-100 text-emerald-800 font-semibold"
          : "bg-gray-100 text-gray-400"
      }`}
      title={covered ? "Covered" : "Not yet covered"}
    >
      {covered ? "✓" : ""}
      {label}
    </span>
  );
}

// Two-step end button: first click arms, second confirms.
// PRD: "second click 1.5 sec apart to prevent fat-finger".
function DoubleClickEndButton({
  armed,
  onArm,
  onConfirm,
  disabled,
}: {
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const armedAt = useRef<number | null>(null);

  // Stamp the arm time when the parent's `armed` flag flips from false to true.
  useEffect(() => {
    if (armed && armedAt.current === null) {
      armedAt.current = Date.now();
    } else if (!armed) {
      armedAt.current = null;
    }
  }, [armed]);

  function handleClick() {
    if (!armed) {
      onArm();
      armedAt.current = Date.now();
      return;
    }
    if (armedAt.current && Date.now() - armedAt.current < 1500) {
      return;
    }
    onConfirm();
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 ${
        armed ? "bg-red-700 hover:bg-red-800" : "bg-red-600 hover:bg-red-700"
      }`}
    >
      {armed ? "Click again to confirm" : "Yes, end now"}
    </button>
  );
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `about ${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const m = Math.round(seconds / 60);
  return `about ${m} minute${m === 1 ? "" : "s"}`;
}
