"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SURVEY_QUESTIONS, type Question } from "@/lib/final558/survey";

interface AnswerState {
  [key: string]: string | string[];
}

export function FinalSurveyForm() {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<null | { at: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if already submitted on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/final/survey")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.submitted) {
          setSubmitted({ at: data.submittedAt });
        }
      })
      .catch(() => {
        /* fall through to form */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setSingle(qId: string, value: string) {
    setAnswers((a) => ({ ...a, [qId]: value }));
  }

  function setMulti(qId: string, value: string, checked: boolean, max?: number) {
    setAnswers((a) => {
      const current = Array.isArray(a[qId]) ? (a[qId] as string[]) : [];
      let next: string[];
      if (checked) {
        if (max && current.length >= max && !current.includes(value)) {
          return a; // ignore — over the cap
        }
        next = current.includes(value) ? current : [...current, value];
      } else {
        next = current.filter((v) => v !== value);
      }
      return { ...a, [qId]: next };
    });
  }

  function setText(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Client-side check for required fields. Server re-validates.
    for (const q of SURVEY_QUESTIONS) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0)
      ) {
        setError(`Question ${q.number} requires an answer.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/final/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted({ at: new Date().toISOString() });
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-8 text-sm text-gray-500">Loading survey…</div>
    );
  }

  if (submitted) {
    return (
      <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-green-900">
          Thanks for the feedback.
        </h2>
        <p className="mt-2 text-sm text-green-800">
          Your responses help us improve the tool for future students.
        </p>
        <div className="mt-4">
          <Link
            href="/chat"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Group questions by section for visual clarity.
  const sections: Map<string, Question[]> = new Map();
  for (const q of SURVEY_QUESTIONS) {
    if (!sections.has(q.section)) sections.set(q.section, []);
    sections.get(q.section)!.push(q);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-8">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>Anonymous feedback (about 5 minutes).</strong> Your responses
        will be used to improve the tool and shared with other faculty
        considering similar approaches. Your grades have not yet been released
        and will not be affected by your responses.
      </div>

      {Array.from(sections.entries()).map(([sectionName, questions]) => (
        <div key={sectionName} className="border-l-4 border-blue-200 pl-4">
          <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wide">
            {sectionName}
          </h2>
          <div className="mt-4 space-y-6">
            {questions.map((q) => (
              <QuestionBlock
                key={q.id}
                q={q}
                answers={answers}
                onSetSingle={setSingle}
                onSetMulti={setMulti}
                onSetText={setText}
              />
            ))}
          </div>
        </div>
      ))}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 items-center">
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit feedback"}
        </button>
        <Link
          href="/chat"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Skip and return to dashboard
        </Link>
      </div>
    </form>
  );
}

interface QuestionBlockProps {
  q: Question;
  answers: AnswerState;
  onSetSingle: (qId: string, value: string) => void;
  onSetMulti: (qId: string, value: string, checked: boolean, max?: number) => void;
  onSetText: (key: string, value: string) => void;
}

function QuestionBlock({
  q,
  answers,
  onSetSingle,
  onSetMulti,
  onSetText,
}: QuestionBlockProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">
        {q.number}. {q.prompt}
        {q.required && <span className="text-red-600 ml-1">*</span>}
      </label>

      {(q.type === "single" ||
        q.type === "single_with_other" ||
        q.type === "single_with_text_option") && (
        <div className="mt-3 space-y-2">
          {q.options!.map((opt) => {
            const selected = answers[q.id] === opt.value;
            return (
              <div key={opt.value}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={q.id}
                    value={opt.value}
                    checked={selected}
                    onChange={() => onSetSingle(q.id, opt.value)}
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-800">{opt.label}</span>
                </label>
                {opt.hasFreeText && selected && (
                  <input
                    type="text"
                    placeholder="Type here…"
                    value={(answers[`${q.id}_text`] as string) ?? ""}
                    onChange={(e) => onSetText(`${q.id}_text`, e.target.value)}
                    className="mt-1 ml-6 w-full max-w-md border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {(q.type === "multi" || q.type === "multi_capped") && (
        <div className="mt-3 space-y-2">
          {q.options!.map((opt) => {
            const arr = Array.isArray(answers[q.id])
              ? (answers[q.id] as string[])
              : [];
            const checked = arr.includes(opt.value);
            return (
              <div key={opt.value}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      onSetMulti(q.id, opt.value, e.target.checked, q.maxPicks)
                    }
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-800">{opt.label}</span>
                </label>
                {opt.hasFreeText && checked && (
                  <input
                    type="text"
                    placeholder="Type here…"
                    value={(answers[`${q.id}_other`] as string) ?? ""}
                    onChange={(e) => onSetText(`${q.id}_other`, e.target.value)}
                    className="mt-1 ml-6 w-full max-w-md border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                )}
              </div>
            );
          })}
          {q.maxPicks && (
            <p className="text-xs text-gray-500 mt-1">
              Up to {q.maxPicks}.
            </p>
          )}
        </div>
      )}

      {q.type === "open" && (
        <textarea
          value={(answers[q.id] as string) ?? ""}
          onChange={(e) => onSetSingle(q.id, e.target.value)}
          rows={3}
          className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Optional"
        />
      )}
    </div>
  );
}
