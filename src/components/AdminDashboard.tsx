"use client";

import { useState } from "react";
import Link from "next/link";

interface StudentData {
  id: string;
  name: string;
  email: string;
  course: string | null;
  totalConversations: number;
  clientMeetings: number;
  mentorSessions: number;
  lastActive: string | null;
  conversations: Array<{
    id: string;
    agentType: string;
    persona: string | null;
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
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-gray-500">
                          {s.email} &middot; BADM {s.course}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {s.totalConversations} convs
                        </div>
                        {s.totalConversations === 0 && (
                          <span className="text-xs text-red-500">No activity</span>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
