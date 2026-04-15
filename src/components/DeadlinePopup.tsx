"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DeadlineInfo {
  label: string;
  due: string;
  dueLabel?: string;
  description: string;
}

// Shown once per device until dismissed. Uses localStorage so it doesn't
// annoy returning students on every visit but does surface again if they
// clear storage or use a different browser.
const STORAGE_KEY = "stakeholdersim.deadlinePopup.seen";

export function DeadlinePopup({ deadlines }: { deadlines?: Record<string, DeadlineInfo> }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!deadlines) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // localStorage unavailable (SSR or blocked) — just skip.
    }
  }, [deadlines]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  if (!open || !deadlines) return null;

  const items = Object.values(deadlines);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome to StakeholderSim</h2>
        <p className="text-sm text-gray-500 mb-5">
          Here are the project deadlines you need to know about:
        </p>

        <div className="space-y-3 mb-6">
          {items.map((d) => (
            <div key={d.label} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-20 text-xs font-semibold text-blue-700 bg-blue-50 rounded px-2 py-1 text-center">
                {d.dueLabel || formatShort(d.due)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{d.label}</div>
                <div className="text-xs text-gray-500">{d.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
          <strong>New to the platform?</strong> Read the{" "}
          <Link href="/how-it-works" className="underline font-medium">
            How It Works guide
          </Link>{" "}
          to understand the workflow, meeting types, and grading before your first meeting.
        </div>

        <div className="flex gap-2">
          <button
            onClick={dismiss}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Got it
          </button>
          <Link
            href="/how-it-works"
            onClick={dismiss}
            className="flex-1 text-center bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Read guide
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
