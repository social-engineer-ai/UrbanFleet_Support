"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface ProgressData {
  name: string;
  course: string;
  requirements: {
    items: Array<{ key: string; label: string; discovered: boolean; persona: string | null }>;
    discovered: number;
    total: number;
  };
  reflections: {
    total: number;
    deep: number;
    medium: number;
    shallow: number;
    forgiven: number;
  };
  phases: Array<{ key: string; label: string; status: string }>;
  decisionsCount: number;
  conversations: {
    clientMeetings: number;
    mentorSessions: number;
    personasMet: string[];
    totalMeetings: number;
    totalSessions: number;
  };
  indicators: {
    requirementsProgress: string;
    reflectionQuality: string;
    engagement: string;
    stakeholderCoverage: string;
  };
}

const PERSONA_LABELS: Record<string, string> = {
  elena: "Elena Vasquez",
  marcus: "Marcus Chen",
  priya: "Priya Sharma",
  james: "James Whitfield",
};

const INDICATOR_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  strong: { bg: "bg-green-100", text: "text-green-800", label: "Strong" },
  complete: { bg: "bg-green-100", text: "text-green-800", label: "Complete" },
  good: { bg: "bg-blue-100", text: "text-blue-800", label: "Good" },
  developing: { bg: "bg-amber-100", text: "text-amber-800", label: "Developing" },
  early: { bg: "bg-gray-100", text: "text-gray-600", label: "Getting Started" },
  not_started: { bg: "bg-gray-100", text: "text-gray-400", label: "Not Started" },
  no_data: { bg: "bg-gray-100", text: "text-gray-400", label: "No Data Yet" },
};

const PHASE_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-500", label: "Not Started" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
};

export default function ProgressPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/student/progress")
        .then((res) => res.json())
        .then((data) => { setProgress(data); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [session]);

  if (loading || !progress) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading progress...</div>
      </div>
    );
  }

  const r = progress.reflections;
  const reflectionPct = r.total > 0 ? Math.round((r.deep / r.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Progress</h1>
            <p className="text-sm text-gray-500">{progress.name} &middot; BADM {progress.course}</p>
          </div>
          <Link href="/chat" className="text-sm text-blue-600 hover:underline">
            Back to Chat
          </Link>
        </div>

        {/* Indicator Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Requirements", value: progress.indicators.requirementsProgress },
            { label: "Reflections", value: progress.indicators.reflectionQuality },
            { label: "Engagement", value: progress.indicators.engagement },
            { label: "Stakeholders", value: progress.indicators.stakeholderCoverage },
          ].map((ind) => {
            const style = INDICATOR_COLORS[ind.value] || INDICATOR_COLORS.early;
            return (
              <div key={ind.label} className="bg-white rounded-xl border p-4 text-center">
                <div className="text-xs text-gray-500 mb-2">{ind.label}</div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Requirements Discovered */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Requirements Discovered</h2>
            <p className="text-xs text-gray-500 mb-4">{progress.requirements.discovered} of {progress.requirements.total} uncovered</p>
            <div className="space-y-2">
              {progress.requirements.items.map((req) => (
                <div key={req.key} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    req.discovered ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                  }`}>
                    {req.discovered ? "\u2713" : ""}
                  </span>
                  <span className={`text-sm capitalize ${req.discovered ? "text-gray-800" : "text-gray-400"}`}>
                    {req.label}
                  </span>
                  {req.persona && (
                    <span className="text-xs text-gray-400 ml-auto">
                      via {PERSONA_LABELS[req.persona] || req.persona}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Build Progress */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Build Progress</h2>
            <p className="text-xs text-gray-500 mb-4">{progress.decisionsCount} architecture decisions documented</p>
            <div className="space-y-3">
              {progress.phases.map((phase) => {
                const style = PHASE_STATUS[phase.status] || PHASE_STATUS.not_started;
                return (
                  <div key={phase.key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-800 capitalize">{phase.label}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {progress.decisionsCount < 6 && (
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-800">
                  You need at least 6 architecture decisions for the Decision Log. You have {progress.decisionsCount} so far.
                </p>
              </div>
            )}
          </div>

          {/* Reflections */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Reflection Quality</h2>
            <p className="text-xs text-gray-500 mb-4">
              {r.total} reflections &middot; {r.forgiven} forgiven (no penalty)
            </p>

            {r.total === 0 ? (
              <p className="text-sm text-gray-400">No reflections yet. These happen during Mentor sessions when you receive hints.</p>
            ) : (
              <>
                <div className="flex gap-1 h-4 rounded-full overflow-hidden mb-3">
                  {r.deep > 0 && (
                    <div className="bg-green-500" style={{ width: `${(r.deep / r.total) * 100}%` }} title={`Deep: ${r.deep}`} />
                  )}
                  {r.medium > 0 && (
                    <div className="bg-blue-400" style={{ width: `${(r.medium / r.total) * 100}%` }} title={`Medium: ${r.medium}`} />
                  )}
                  {r.shallow > 0 && (
                    <div className="bg-gray-300" style={{ width: `${(r.shallow / r.total) * 100}%` }} title={`Shallow: ${r.shallow}`} />
                  )}
                </div>
                <div className="flex gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Deep: {r.deep}</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Medium: {r.medium}</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Shallow: {r.shallow}</span>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {reflectionPct >= 50
                    ? "Great reflection depth! Deep reflections show genuine understanding."
                    : reflectionPct >= 25
                    ? "Good progress. Try to articulate concepts in your own words and connect to your specific project."
                    : "Tip: After a hint, explain how you'd apply it to YOUR pipeline specifically. Mention trade-offs or edge cases to demonstrate deeper thinking."}
                </p>
              </>
            )}
          </div>

          {/* Engagement */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Engagement</h2>
            <p className="text-xs text-gray-500 mb-4">Your conversation activity</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-700">{progress.conversations.clientMeetings}</div>
                <div className="text-xs text-gray-500">Client Meetings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-700">{progress.conversations.mentorSessions}</div>
                <div className="text-xs text-gray-500">Mentor Sessions</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-2">Stakeholders met</div>
              <div className="flex flex-wrap gap-1.5">
                {["elena", "marcus", "priya", "james"].map((p) => (
                  <span
                    key={p}
                    className={`text-xs px-2 py-1 rounded-full ${
                      progress.conversations.personasMet.includes(p)
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {PERSONA_LABELS[p]}
                  </span>
                ))}
              </div>
            </div>

            {progress.conversations.personasMet.length < 4 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-800">
                  Talk to all 4 stakeholders to get the full picture. Each has unique requirements you'll need for the final presentation.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
