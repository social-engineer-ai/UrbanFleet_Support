"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PreSessionClient({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/final/begin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start the session.");
        setStarting(false);
        return;
      }
      router.push(`/final/session/${data.sessionId}`);
    } catch {
      setError("Network error. Please try again.");
      setStarting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-10">
      <div className="max-w-2xl w-full bg-white border rounded-2xl p-8 shadow-sm leading-relaxed">
        <h1 className="text-xl font-semibold text-gray-900">
          {firstName}, you are about to begin your BADM 558 final.
        </h1>

        <Section title="Format">
          You will have a 70-minute conversation with four UrbanFleet
          stakeholders: Elena Vasquez (VP of Operations), Marcus Chen (CFO),
          Priya Sharma (CTO), and James Whitfield (Compliance Director). They
          will ask you to walk through the system you built this semester.
          Different stakeholder, different angle.
        </Section>

        <Section title="What you can use">
          <ul className="list-disc list-inside space-y-1">
            <li>Your handwritten one-page note (one side, 8.5×11, your handwriting).</li>
            <li>Whatever is in your head.</li>
          </ul>
        </Section>

        <Section title="What you cannot use">
          <ul className="list-disc list-inside space-y-1">
            <li>The AWS Console.</li>
            <li>Your decision log, code, or any printed material.</li>
            <li>
              A second screen, a second tab, or any other website. Tab switches
              and pasted text over 40 characters will be flagged for instructor
              review.
            </li>
          </ul>
        </Section>

        <Section title="How time works">
          <ul className="list-disc list-inside space-y-1">
            <li>The full session is 70 minutes. There is no pause.</li>
            <li>
              You will see warnings at 60 minutes (10 left), 65 minutes (5
              left), and a final warning at 70 minutes when the session ends
              automatically.
            </li>
            <li>
              You can end early using the End Session button. Once ended, you
              cannot reopen this conversation.
            </li>
          </ul>
        </Section>

        <Section title="How the conversation works">
          <ul className="list-disc list-inside space-y-1">
            <li>
              Stakeholders will take turns. The system decides who speaks based
              on what you say. You don&apos;t switch between them manually.
            </li>
            <li>
              Cover all four. The sidebar shows your progress with each
              stakeholder.
            </li>
          </ul>
        </Section>

        <p className="mt-6 text-sm text-gray-700">
          When you click Begin Session, the timer starts and Elena will open
          with her first question. Take a breath. You&apos;ve prepared for this.
        </p>

        {error && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}

        <div className="mt-8">
          <button
            onClick={begin}
            disabled={starting}
            className="w-full sm:w-60 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Begin Session"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}
