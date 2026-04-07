"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatInterface } from "@/components/ChatInterface";
import { Sidebar } from "@/components/Sidebar";

interface Conversation {
  id: string;
  agentType: string;
  persona: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      loadConversations();
    }
  }, [session]);

  async function loadConversations() {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }

  async function startConversation(agentType: string, persona?: string) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentType, persona }),
    });

    if (res.ok) {
      const data = await res.json();
      setActiveConversation(data.conversationId);
      loadConversations();
    }
  }

  async function endConversation(conversationId: string) {
    await fetch(`/api/conversations/${conversationId}/end`, {
      method: "POST",
    });
    setActiveConversation(null);
    loadConversations();
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
      <Sidebar
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={setActiveConversation}
        onStartConversation={startConversation}
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
            onStartConversation={startConversation}
          />
        )}
      </main>
    </div>
  );
}

function WelcomeScreen({
  userName,
  course,
  onStartConversation,
}: {
  userName: string;
  course: string | null;
  onStartConversation: (agentType: string, persona?: string) => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome, {userName}
        </h1>
        <p className="text-gray-600 mb-8">
          BADM {course} &mdash; UrbanFleet Project
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Client Section */}
          <div className="bg-white rounded-xl shadow-md p-6 text-left">
            <h2 className="text-lg font-semibold text-blue-900 mb-1">
              Meet with Client
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Understand business requirements from UrbanFleet&apos;s leadership team
            </p>
            <div className="space-y-2">
              {[
                { id: "elena", name: "Elena Vasquez", title: "VP of Operations" },
                { id: "marcus", name: "Marcus Chen", title: "CFO" },
                { id: "priya", name: "Priya Sharma", title: "CTO" },
                { id: "james", name: "James Whitfield", title: "Compliance Director" },
              ].map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => onStartConversation("client", persona.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{persona.name}</div>
                  <div className="text-xs text-gray-500">{persona.title}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mentor Section */}
          <div className="bg-white rounded-xl shadow-md p-6 text-left">
            <h2 className="text-lg font-semibold text-emerald-900 mb-1">
              Consult Mentor
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Get technical guidance from your AWS solutions architect
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
                <strong>Tip:</strong> Start with the Client to understand
                business requirements before consulting the Mentor on
                architecture.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
