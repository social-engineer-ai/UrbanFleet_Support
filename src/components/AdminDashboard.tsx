"use client";

import { useState } from "react";
import Link from "next/link";

interface PersonaCoverage {
  requirements: number;
  solution: number;
  features: number;
  practice: number;
}

interface StudentCoverage {
  byPersona: Record<string, PersonaCoverage>;
  totals: { p1Done: number; p2Done: number; p3Done: number };
}

interface StudentData {
  id: string;
  name: string;
  email: string;
  course: string | null;
  totalConversations: number;
  clientMeetings: number;
  mentorSessions: number;
  coverage?: StudentCoverage;
  lastActive: string | null;
  conversations: Array<{
    id: string;
    agentType: string;
    persona: string | null;
    meetingType?: string;
    startedAt: string;
    endedAt: string | null;
    messageCount: number;
    summary: string | null;
  }>;
  state: Record<string, unknown> | null;
}

const PERSONA_LABELS: Record<string, string> = {
  elena: "Elena Vasquez",
  marcus: "Marcus Chen",
  priya: "Priya Sharma",
  james: "James Whitfield",
  mentor: "Dr. Raj Patel",
};

export function AdminDashboard({ students, isInstructor }: { students: StudentData[]; isInstructor: boolean }) {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<
    Array<{ role: string; content: string; timestamp: string }>
  >([]);
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [showTaManager, setShowTaManager] = useState(false);
  const [tas, setTas] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [taForm, setTaForm] = useState({ name: "", email: "", password: "" });
  const [taMessage, setTaMessage] = useState("");

  const filteredStudents =
    courseFilter === "all"
      ? students
      : students.filter((s) => s.course === courseFilter);

  const student558 = students.filter((s) => s.course === "558").length;
  const student358 = students.filter((s) => s.course === "358").length;
  const totalConvs = students.reduce((sum, s) => sum + s.totalConversations, 0);

  async function loadTas() {
    const res = await fetch("/api/admin/manage-ta");
    if (res.ok) setTas(await res.json());
  }

  async function addTa(e: React.FormEvent) {
    e.preventDefault();
    setTaMessage("");
    const res = await fetch("/api/admin/manage-ta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taForm),
    });
    const data = await res.json();
    setTaMessage(data.message || data.error);
    if (res.ok) {
      setTaForm({ name: "", email: "", password: "" });
      loadTas();
    }
  }

  async function removeTa(email: string) {
    if (!confirm(`Remove TA access for ${email}?`)) return;
    const res = await fetch("/api/admin/manage-ta", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setTaMessage(data.message || data.error);
    loadTas();
  }

  async function exportCsv() {
    window.open("/api/admin/export", "_blank");
  }

  async function downloadDump() {
    window.open("/api/admin/dump", "_blank");
  }

  async function dumpToS3() {
    if (!confirm("Upload all conversation data to S3?")) return;
    const res = await fetch("/api/admin/dump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadToS3: true }),
    });
    const data = await res.json();
    if (data.s3?.error) {
      alert("S3 upload failed: " + data.s3.error);
    } else if (data.s3) {
      alert(`Uploaded to s3://${data.s3.bucket}/${data.s3.prefix}\n${data.s3.files.length} files`);
    } else {
      alert(`Dump ready: ${data.studentCount} students, ${data.totalConversations} conversations`);
    }
  }

  async function loadConversation(convId: string) {
    setSelectedConversation(convId);
    const res = await fetch(`/api/conversations/${convId}/messages`);
    if (res.ok) {
      const msgs = await res.json();
      setConversationMessages(msgs);
    }
  }

  const activeStudent = students.find((s) => s.id === selectedStudent);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              StakeholderSim — Instructor Dashboard
            </h1>
            <p className="text-sm text-gray-500">
              {students.length} students &middot; {totalConvs} conversations
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2 text-sm">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                558: {student558}
              </span>
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                358: {student358}
              </span>
            </div>
            <button
              onClick={exportCsv}
              className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-lg hover:bg-green-200"
            >
              Export CSV
            </button>
            <button
              onClick={downloadDump}
              className="text-sm bg-cyan-100 text-cyan-800 px-3 py-1 rounded-lg hover:bg-cyan-200"
            >
              Download JSON
            </button>
            {isInstructor && (
              <button
                onClick={dumpToS3}
                className="text-sm bg-violet-100 text-violet-800 px-3 py-1 rounded-lg hover:bg-violet-200"
              >
                Dump to S3
              </button>
            )}
            {isInstructor && (
              <button
                onClick={() => { setShowTaManager(!showTaManager); if (!showTaManager) loadTas(); }}
                className="text-sm bg-amber-100 text-amber-800 px-3 py-1 rounded-lg hover:bg-amber-200"
              >
                Manage TAs
              </button>
            )}
            <Link
              href="/chat"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back to Chat
            </Link>
          </div>
        </div>
      </div>

      {/* TA Manager Panel */}
      {showTaManager && isInstructor && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="font-semibold mb-4">Manage Teaching Assistants</h3>
            {taMessage && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg mb-4 text-sm">
                {taMessage}
              </div>
            )}
            <div className="flex gap-6">
              <form onSubmit={addTa} className="flex-1">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={taForm.name}
                      onChange={(e) => setTaForm({ ...taForm, name: e.target.value })}
                      placeholder="TA Name"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={taForm.email}
                      onChange={(e) => setTaForm({ ...taForm, email: e.target.value })}
                      placeholder="ta@illinois.edu"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Password</label>
                    <input
                      type="text"
                      value={taForm.password}
                      onChange={(e) => setTaForm({ ...taForm, password: e.target.value })}
                      placeholder="Initial password"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 shrink-0"
                  >
                    Add TA
                  </button>
                </div>
              </form>
            </div>
            {tas.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <div className="text-xs text-gray-500 mb-2">Current TAs</div>
                <div className="flex flex-wrap gap-2">
                  {tas.map((ta) => (
                    <div
                      key={ta.id}
                      className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2"
                    >
                      <span className="text-sm font-medium">{ta.name}</span>
                      <span className="text-xs text-gray-500">{ta.email}</span>
                      <button
                        onClick={() => removeTa(ta.email)}
                        className="text-red-400 hover:text-red-600 text-xs ml-1"
                        title="Remove TA"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        <div className="flex gap-6">
          {/* Student List */}
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b">
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">All Students</option>
                  <option value="558">BADM 558 Only</option>
                  <option value="358">BADM 358 Only</option>
                </select>
              </div>
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                {filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStudent(s.id);
                      setSelectedConversation(null);
                    }}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                      selectedStudent === s.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{s.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {s.email} &middot; BADM {s.course}
                        </div>
                        {s.coverage && (
                          <div className="flex gap-1 mt-1.5 text-[10px]">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                s.coverage.totals.p1Done === 4
                                  ? "bg-blue-100 text-blue-700"
                                  : s.coverage.totals.p1Done > 0
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              P1 {s.coverage.totals.p1Done}/4
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                s.coverage.totals.p2Done === 4
                                  ? "bg-emerald-100 text-emerald-700"
                                  : s.coverage.totals.p2Done > 0
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              P2 {s.coverage.totals.p2Done}/4
                            </span>
                            {s.coverage.totals.p3Done > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                                P3 {s.coverage.totals.p3Done}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-gray-500">{s.totalConversations}</div>
                        {s.totalConversations === 0 && (
                          <span className="text-[10px] text-red-500">No activity</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student Detail */}
          <div className="flex-1">
            {activeStudent ? (
              <div className="space-y-4">
                {/* Student Header */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="text-lg font-semibold">{activeStudent.name}</h2>
                  <p className="text-sm text-gray-500">
                    {activeStudent.email} &middot; BADM {activeStudent.course}
                  </p>
                  <div className="flex gap-6 mt-4">
                    <Stat label="Client Meetings" value={activeStudent.clientMeetings} />
                    <Stat label="Mentor Sessions" value={activeStudent.mentorSessions} />
                    <Stat
                      label="Last Active"
                      value={
                        activeStudent.lastActive
                          ? new Date(activeStudent.lastActive).toLocaleDateString()
                          : "Never"
                      }
                    />
                  </div>

                  {/* Per-part, per-persona coverage grid */}
                  {activeStudent.coverage && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Meeting Coverage
                      </h3>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left font-medium py-1">Stakeholder</th>
                            <th className="text-center font-medium py-1 w-16">Part 1</th>
                            <th className="text-center font-medium py-1 w-16">Part 2</th>
                            <th className="text-center font-medium py-1 w-16">Part 3</th>
                            <th className="text-center font-medium py-1 w-16">Practice</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(["elena", "marcus", "priya", "james"] as const).map((p) => {
                            const c = activeStudent.coverage!.byPersona[p];
                            return (
                              <tr key={p} className="border-t border-gray-50">
                                <td className="py-1.5 text-gray-800">{PERSONA_LABELS[p]}</td>
                                <td className="py-1.5 text-center">
                                  <CoverageCell num={c.requirements} color="blue" />
                                </td>
                                <td className="py-1.5 text-center">
                                  <CoverageCell
                                    num={c.solution}
                                    color="emerald"
                                    locked={c.requirements === 0 && c.solution === 0}
                                  />
                                </td>
                                <td className="py-1.5 text-center">
                                  <CoverageCell num={c.features} color="violet" />
                                </td>
                                <td className="py-1.5 text-center">
                                  <CoverageCell num={c.practice} color="gray" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-gray-400 mt-2">
                        Expected: 4× Part 1 + 4× Part 2 = 8 core meetings. Part 3 is optional. 🔒 = locked (requires Part 1 first).
                      </p>
                    </div>
                  )}

                  {/* Requirements Progress */}
                  {activeStudent.state && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Requirements Discovered
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(
                          (activeStudent.state as Record<string, unknown>)
                            .requirements_uncovered as Record<string, { discovered: boolean }>
                        ).map(([key, val]) => (
                          <span
                            key={key}
                            className={`text-xs px-2 py-1 rounded-full ${
                              val.discovered
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {key.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversations */}
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="p-4 border-b">
                    <h3 className="font-medium">Conversations</h3>
                  </div>
                  <div className="divide-y">
                    {activeStudent.conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                          selectedConversation === conv.id ? "bg-blue-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                conv.agentType === "client"
                                  ? "bg-blue-400"
                                  : "bg-emerald-400"
                              }`}
                            />
                            <span className="text-sm font-medium">
                              {PERSONA_LABELS[conv.persona || ""] || conv.agentType}
                            </span>
                            {conv.agentType === "client" && conv.meetingType && (
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  MEETING_TYPE_ADMIN_BADGE[conv.meetingType]?.cls || "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {MEETING_TYPE_ADMIN_BADGE[conv.meetingType]?.label || conv.meetingType}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(conv.startedAt).toLocaleString()} &middot;{" "}
                            {conv.messageCount} msgs
                          </span>
                        </div>
                        {conv.summary && (
                          <p className="text-xs text-gray-500 mt-1 truncate pl-4">
                            {conv.summary}
                          </p>
                        )}
                      </button>
                    ))}
                    {activeStudent.conversations.length === 0 && (
                      <p className="px-4 py-6 text-sm text-gray-400 text-center">
                        No conversations yet
                      </p>
                    )}
                  </div>
                </div>

                {/* Conversation Transcript */}
                {selectedConversation && conversationMessages.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border">
                    <div className="p-4 border-b">
                      <h3 className="font-medium">Transcript</h3>
                    </div>
                    <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                      {conversationMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`text-sm ${
                            msg.role === "user"
                              ? "bg-blue-50 border-l-4 border-blue-400"
                              : "bg-gray-50 border-l-4 border-gray-300"
                          } p-3 rounded-r-lg`}
                        >
                          <div className="text-xs font-medium text-gray-500 mb-1">
                            {msg.role === "user" ? "Student" : "Agent"}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-400">
                Select a student to view their details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const MEETING_TYPE_ADMIN_BADGE: Record<string, { label: string; cls: string }> = {
  requirements: { label: "P1", cls: "bg-blue-100 text-blue-700" },
  solution: { label: "P2", cls: "bg-emerald-100 text-emerald-700" },
  features: { label: "P3", cls: "bg-violet-100 text-violet-700" },
  practice: { label: "Prac", cls: "bg-gray-100 text-gray-600" },
};

const COVERAGE_CELL_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  violet: "bg-violet-100 text-violet-700",
  gray: "bg-gray-100 text-gray-600",
};

function CoverageCell({ num, color, locked = false }: { num: number; color: string; locked?: boolean }) {
  if (locked) {
    return <span className="inline-block w-10 rounded bg-gray-50 text-gray-300 text-xs py-0.5">🔒</span>;
  }
  if (num === 0) {
    return <span className="inline-block w-10 rounded bg-gray-50 text-gray-300 text-xs py-0.5">—</span>;
  }
  return (
    <span className={`inline-block w-10 rounded text-xs py-0.5 font-medium ${COVERAGE_CELL_COLORS[color]}`}>
      {num}×
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
