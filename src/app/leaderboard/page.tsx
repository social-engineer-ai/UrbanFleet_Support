"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  members: Array<{ name: string; email: string }>;
  baselineScore: number;
  enhancedScore: number;
  innovationScore: number;
  qualityMultiplier: number;
  finalScore: number;
  bonus: number;
  auditedAt: string | null;
}

interface Scenario {
  id: string;
  tier: string;
  points: number;
  description: string;
}

export default function LeaderboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [course, setCourse] = useState("558");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      const userCourse = (session.user as { course?: string }).course;
      if (userCourse) setCourse(userCourse);
      loadLeaderboard(userCourse || "558");
    }
  }, [session]);

  async function loadLeaderboard(c: string) {
    setLoading(true);
    const res = await fetch(`/api/admin/leaderboard?course=${c}`);
    if (res.ok) {
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
      setScenarios(data.scenarios || []);
    }
    setLoading(false);
  }

  const baselineScenarios = scenarios.filter((s) => s.tier === "baseline");
  const enhancedScenarios = scenarios.filter((s) => s.tier === "enhanced");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
            <p className="text-sm text-gray-500">
              BADM {course} &mdash; UrbanFleet Business Value Ranking
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={course}
              onChange={(e) => { setCourse(e.target.value); loadLeaderboard(e.target.value); }}
              className="px-3 py-1.5 border rounded-lg text-sm"
            >
              <option value="558">BADM 558</option>
              <option value="358">BADM 358</option>
            </select>
            <Link href="/chat" className="text-sm text-blue-600 hover:underline">
              Back to Chat
            </Link>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-white rounded-xl shadow-sm border mb-8">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Team Rankings</h2>
            <p className="text-xs text-gray-500">Top 3 earn bonus points: 1st +15, 2nd +10, 3rd +5</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No teams have been audited yet. The leaderboard will be populated after final submissions.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3 w-12">Rank</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3 text-right">Baseline</th>
                  <th className="px-4 py-3 text-right">Enhanced</th>
                  <th className="px-4 py-3 text-right">Innovation</th>
                  <th className="px-4 py-3 text-right">Quality</th>
                  <th className="px-4 py-3 text-right">Final</th>
                  <th className="px-4 py-3 text-right">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.teamId}
                    className={`border-b hover:bg-gray-50 ${
                      entry.rank <= 3 ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                        entry.rank === 1 ? "bg-yellow-400 text-yellow-900" :
                        entry.rank === 2 ? "bg-gray-300 text-gray-700" :
                        entry.rank === 3 ? "bg-amber-600 text-white" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{entry.teamName}</div>
                      <div className="text-xs text-gray-400">
                        {entry.members.map((m) => m.name).join(", ")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{entry.baselineScore}/40</td>
                    <td className="px-4 py-3 text-right text-sm">{entry.enhancedScore}/105</td>
                    <td className="px-4 py-3 text-right text-sm">{entry.innovationScore}/45</td>
                    <td className="px-4 py-3 text-right text-sm">{entry.qualityMultiplier}x</td>
                    <td className="px-4 py-3 text-right font-bold text-sm">{entry.finalScore}</td>
                    <td className="px-4 py-3 text-right">
                      {entry.bonus > 0 ? (
                        <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">
                          +{entry.bonus}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Scenario Catalog */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="font-semibold mb-1">Tier 1: Baseline Scenarios</h3>
            <p className="text-xs text-gray-500 mb-4">Every team should handle these (5 pts each)</p>
            <div className="space-y-2">
              {baselineScenarios.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-sm">
                  <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">{s.id}</span>
                  <span className="text-gray-700">{s.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="font-semibold mb-1">Tier 2: Enhanced Scenarios</h3>
            <p className="text-xs text-gray-500 mb-4">Go beyond baseline for more points (8-15 pts each)</p>
            <div className="space-y-2">
              {enhancedScenarios.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-sm">
                  <span className="text-xs font-mono bg-blue-50 px-1.5 py-0.5 rounded text-blue-600 shrink-0">{s.id}</span>
                  <span className="text-gray-700">{s.description}</span>
                  <span className="text-xs text-gray-400 shrink-0">{s.points}pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold mb-1">Tier 3: Innovation</h3>
          <p className="text-sm text-gray-600">
            Propose and build capabilities not on the list above. Up to 3 innovations, 15 points each.
            Scored for: business value (does it help Elena/Marcus/Priya/James?), technical quality, and data realism.
            If you use synthetic data, you must validate it with the Client first.
          </p>
        </div>
      </div>
    </div>
  );
}
