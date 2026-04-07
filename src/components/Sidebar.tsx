"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";

interface Conversation {
  id: string;
  agentType: string;
  persona: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
}

const PERSONA_LABELS: Record<string, string> = {
  elena: "Elena Vasquez",
  marcus: "Marcus Chen",
  priya: "Priya Sharma",
  james: "James Whitfield",
  mentor: "Dr. Raj Patel",
};

export function Sidebar({
  conversations,
  activeConversation,
  onSelectConversation,
  onStartConversation,
  onToggle,
  isOpen,
  userName,
  isAdmin,
}: {
  conversations: Conversation[];
  activeConversation: string | null;
  onSelectConversation: (id: string | null) => void;
  onStartConversation: (agentType: string, persona?: string) => void;
  onToggle: () => void;
  isOpen: boolean;
  userName: string;
  isAdmin: boolean;
}) {
  if (!isOpen) {
    return (
      <div className="w-12 bg-slate-900 flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="text-white hover:bg-slate-700 p-2 rounded"
          title="Open sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <button
          onClick={() => onSelectConversation(null)}
          className="hover:opacity-80"
        >
          <h1 className="text-lg font-bold">StakeholderSim</h1>
          <p className="text-xs text-slate-400">UrbanFleet</p>
        </button>
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-white p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="p-3 space-y-1">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 px-2">
          Start / Resume
        </div>
        <button
          onClick={() => onSelectConversation(null)}
          className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-800 text-blue-300 hover:text-blue-200 transition-colors"
        >
          Meet with Client
        </button>
        <button
          onClick={() => onStartConversation("mentor")}
          className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 transition-colors"
        >
          Consult Mentor
        </button>
      </div>

      {/* Conversation History */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Active conversations */}
        {conversations.filter((c) => !c.endedAt).length > 0 && (
          <>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 px-2">
              Active
            </div>
            <div className="space-y-1 mb-4">
              {conversations
                .filter((c) => !c.endedAt)
                .map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={activeConversation === conv.id}
                    onClick={() => onSelectConversation(conv.id)}
                  />
                ))}
            </div>
          </>
        )}

        {/* Past conversations */}
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 px-2">
          Past Sessions
        </div>
        {conversations.filter((c) => c.endedAt).length === 0 ? (
          <p className="text-xs text-slate-500 px-2">No past sessions</p>
        ) : (
          <div className="space-y-1">
            {conversations
              .filter((c) => c.endedAt)
              .map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={activeConversation === conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                />
              ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700">
        {isAdmin && (
          <Link
            href="/admin"
            className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-800 text-amber-300 mb-1"
          >
            Instructor Dashboard
          </Link>
        )}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-slate-400 truncate">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-slate-500 hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function ConversationItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
        isActive
          ? "bg-slate-700 text-white"
          : "hover:bg-slate-800 text-slate-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            conv.endedAt
              ? "bg-slate-500"
              : conv.agentType === "client"
              ? "bg-blue-400"
              : "bg-emerald-400"
          }`}
        />
        <span className="font-medium truncate">
          {PERSONA_LABELS[conv.persona || ""] || conv.agentType}
        </span>
        {!conv.endedAt && (
          <span className="text-[10px] text-green-400 ml-auto">live</span>
        )}
      </div>
      <div className="text-xs text-slate-500 mt-0.5 pl-4">
        {new Date(conv.startedAt).toLocaleDateString()} &middot;{" "}
        {conv.messageCount} msgs
      </div>
    </button>
  );
}
