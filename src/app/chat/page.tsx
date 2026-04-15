"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChatInterface } from "@/components/ChatInterface";
import { Sidebar } from "@/components/Sidebar";
import { DeadlinePopup } from "@/components/DeadlinePopup";

interface Conversation {
  id: string;
  agentType: string;
  persona: string | null;
  meetingType?: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
}

interface PersonaCoverage {
  requirements: number;
  solution: number;
  features: number;
  practice: number;
}

interface CoverageResponse {
  coverage: Record<string, PersonaCoverage>;
  totals: { requirements_done: number; solution_done: number; features_done: number };
  deadlines: Record<string, { label: string; due: string; description: string }>;
}

type MeetingType = "requirements" | "solution" | "features" | "practice";

const PERSONAS = [
  { id: "elena", name: "Elena Vasquez", title: "VP of Operations", color: "blue" },
  { id: "marcus", name: "Marcus Chen", title: "CFO", color: "emerald" },
  { id: "priya", name: "Priya Sharma", title: "CTO", color: "violet" },
  { id: "james", name: "James Whitfield", title: "Compliance Director", color: "amber" },
] as const;

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [coverageData, setCoverageData] = useState<CoverageResponse | null>(null);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      loadConversations();
      loadCoverage();
    }
  }, [session]);

  async function loadConversations() {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }

  async function loadCoverage() {
    const res = await fetch("/api/student/coverage");
    if (res.ok) {
      const data = await res.json();
      setCoverageData(data);
    }
  }

  async function startConversation(agentType: string, persona?: string, meetingType?: MeetingType) {
    setStartError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentType, persona, meetingType }),
    });

    if (res.ok) {
      const data = await res.json();
      setActiveConversation(data.conversationId);
      loadConversations();
      loadCoverage();
    } else {
      const data = await res.json().catch(() => ({ error: "Failed to start conversation" }));
      setStartError(data.error || "Failed to start conversation");
    }
  }

  async function endConversation(conversationId: string) {
    await fetch(`/api/conversations/${conversationId}/end`, {
      method: "POST",
    });
    setActiveConversation(null);
    loadConversations();
    loadCoverage();
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!session?.user) return null;

  const user = session.user as { name: string; role: string; course: string | null };
  const isAdmin = user.role === "instructor" || user.role === "ta";

  return (
    <div className="h-screen flex">
      <DeadlinePopup deadlines={coverageData?.deadlines} />

      <Sidebar
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={setActiveConversation}
        onStartConversation={(agentType, persona) => startConversation(agentType, persona)}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isOpen={sidebarOpen}
        userName={user.name}
        isAdmin={isAdmin}
      />

      <main className="flex-1 flex flex-col">
        {activeConversation ? (
          <ChatInterface
            conversationId={activeConversation}
            onEnd={() => endConversation(activeConversation)}
          />
        ) : (
          <WelcomeScreen
            userName={user.name}
            course={user.course}
            coverageData={coverageData}
            startError={startError}
            onStartConversation={startConversation}
            onDismissError={() => setStartError(null)}
          />
        )}
      </main>
    </div>
  );
}

function WelcomeScreen({
  userName,
  course,
  coverageData,
  startError,
  onStartConversation,
  onDismissError,
}: {
  userName: string;
  course: string | null;
  coverageData: CoverageResponse | null;
  startError: string | null;
  onStartConversation: (agentType: string, persona?: string, meetingType?: MeetingType) => void;
  onDismissError: () => void;
}) {
  const [pickedPersona, setPickedPersona] = useState<string | null>(null);

  const coverage = coverageData?.coverage;
  const totals = coverageData?.totals;
  const deadlines = coverageData?.deadlines;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Welcome, {userName}</h1>
          <p className="text-gray-600">BADM {course} &mdash; UrbanFleet Project</p>
        </div>

        {/* Overall progress banner */}
        {coverage && totals && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">Your project progress</h2>
              <Link href="/how-it-works" className="text-xs text-blue-600 hover:underline">
                How this works →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <ProgressBar
                label="Part 1 — Requirements"
                done={totals.requirements_done}
                total={4}
                deadline={deadlines?.part1.due}
                color="bg-blue-500"
              />
              <ProgressBar
                label="Part 2 — Solution"
                done={totals.solution_done}
                total={4}
                deadline={deadlines?.part2.due}
                color="bg-emerald-500"
              />
              <ProgressBar
                label="Part 3 — Features (optional)"
                done={totals.features_done}
                total={4}
                color="bg-violet-500"
              />
            </div>
          </div>
        )}

        {startError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-4 text-sm flex items-start justify-between">
            <span>{startError}</span>
            <button onClick={onDismissError} className="ml-3 text-amber-600 hover:text-amber-800">
              ✕
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Client Section */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-1">Meet with Client</h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose a stakeholder, then pick what you&apos;re here for.
            </p>
            <div className="space-y-2">
              {PERSONAS.map((p) => {
                const cov = coverage?.[p.id];
                return (
                  <button
                    key={p.id}
                    onClick={() => setPickedPersona(p.id)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.title}</div>
                      </div>
                      {cov && (
                        <div className="text-[10px] text-right text-gray-500 leading-tight">
                          <div className={cov.requirements > 0 ? "text-blue-600" : ""}>
                            P1: {cov.requirements > 0 ? `✓ ${cov.requirements}x` : "—"}
                          </div>
                          <div className={cov.solution > 0 ? "text-emerald-600" : ""}>
                            P2: {cov.solution > 0 ? `✓ ${cov.solution}x` : "—"}
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mentor Section */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-emerald-900 mb-1">Consult Mentor</h2>
            <p className="text-sm text-gray-500 mb-4">
              Get technical guidance from your AWS solutions architect.
            </p>
            <button
              onClick={() => onStartConversation("mentor")}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
            >
              <div className="font-medium text-gray-900">Dr. Raj Patel</div>
              <div className="text-xs text-gray-500">
                Senior Cloud Architect &mdash; Socratic guidance, hints &amp; reflection
              </div>
            </button>

            <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-800">
                <strong>Tip:</strong> Complete Part 1 with all four stakeholders before you start
                building. Come back to the Mentor whenever you hit a decision point.
              </p>
            </div>
          </div>
        </div>
      </div>

      {pickedPersona && coverage && (
        <MeetingTypeModal
          persona={pickedPersona}
          coverage={coverage[pickedPersona]}
          onPick={(mt) => {
            setPickedPersona(null);
            onStartConversation("client", pickedPersona, mt);
          }}
          onClose={() => setPickedPersona(null)}
        />
      )}
    </div>
  );
}

function ProgressBar({
  label,
  done,
  total,
  deadline,
  color,
}: {
  label: string;
  done: number;
  total: number;
  deadline?: string;
  color: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">
          {done}/{total}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {deadline && (
        <div className="text-[10px] text-gray-400 mt-1">Due {formatDate(deadline)}</div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PERSONA_NAMES: Record<string, string> = {
  elena: "Elena Vasquez",
  marcus: "Marcus Chen",
  priya: "Priya Sharma",
  james: "James Whitfield",
};

function MeetingTypeModal({
  persona,
  coverage,
  onPick,
  onClose,
}: {
  persona: string;
  coverage: PersonaCoverage;
  onPick: (mt: MeetingType) => void;
  onClose: () => void;
}) {
  const personaName = PERSONA_NAMES[persona] || persona;
  const part2Locked = coverage.requirements === 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Meeting with {personaName}
            </h2>
            <p className="text-sm text-gray-500">What are you here for today?</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-2">
          <MeetingTypeButton
            title="Part 1 — Gather Requirements"
            subtitle="Understand the business pain and what this stakeholder needs"
            count={coverage.requirements}
            accent="blue"
            onClick={() => onPick("requirements")}
          />
          <MeetingTypeButton
            title="Part 2 — Present Your Solution"
            subtitle="Show what you've built and defend your trade-offs"
            count={coverage.solution}
            accent="emerald"
            locked={part2Locked}
            lockedReason="Complete a Part 1 (Requirements) meeting with this stakeholder first. You need to understand what they need before you can present a solution."
            onClick={() => onPick("solution")}
          />
          <MeetingTypeButton
            title="Part 3 — Propose a Feature (optional)"
            subtitle="Pitch an enhancement beyond the baseline scope"
            count={coverage.features}
            accent="violet"
            onClick={() => onPick("features")}
          />
          <MeetingTypeButton
            title="Practice (not graded)"
            subtitle="Try things out without stakes — get feedback"
            count={coverage.practice}
            accent="gray"
            onClick={() => onPick("practice")}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 text-center">
          <Link href="/how-it-works" className="text-blue-600 hover:underline">
            Not sure which to pick? See the full workflow guide →
          </Link>
        </div>
      </div>
    </div>
  );
}

const ACCENT_CLASSES: Record<string, { border: string; hoverBorder: string; hoverBg: string; badge: string }> = {
  blue: {
    border: "border-gray-200",
    hoverBorder: "hover:border-blue-400",
    hoverBg: "hover:bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
  },
  emerald: {
    border: "border-gray-200",
    hoverBorder: "hover:border-emerald-400",
    hoverBg: "hover:bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
  },
  violet: {
    border: "border-gray-200",
    hoverBorder: "hover:border-violet-400",
    hoverBg: "hover:bg-violet-50",
    badge: "bg-violet-100 text-violet-700",
  },
  gray: {
    border: "border-gray-200",
    hoverBorder: "hover:border-gray-400",
    hoverBg: "hover:bg-gray-50",
    badge: "bg-gray-100 text-gray-700",
  },
};

function MeetingTypeButton({
  title,
  subtitle,
  count,
  accent,
  locked = false,
  lockedReason,
  onClick,
}: {
  title: string;
  subtitle: string;
  count: number;
  accent: "blue" | "emerald" | "violet" | "gray";
  locked?: boolean;
  lockedReason?: string;
  onClick: () => void;
}) {
  const [showLocked, setShowLocked] = useState(false);
  const cls = ACCENT_CLASSES[accent];

  if (locked) {
    return (
      <div>
        <button
          onClick={() => setShowLocked(!showLocked)}
          className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-500 flex items-center gap-2">
                <span>🔒</span> {title}
              </div>
              <div className="text-xs text-gray-400">{subtitle}</div>
            </div>
          </div>
        </button>
        {showLocked && lockedReason && (
          <div className="mt-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            {lockedReason}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg border ${cls.border} ${cls.hoverBorder} ${cls.hoverBg} transition-colors`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-gray-900">{title}</div>
          <div className="text-xs text-gray-500">{subtitle}</div>
        </div>
        {count > 0 && (
          <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${cls.badge}`}>
            ✓ {count}x done
          </span>
        )}
      </div>
    </button>
  );
}
