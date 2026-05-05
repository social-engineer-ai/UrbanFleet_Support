// Question definitions for the end-of-final feedback survey. Server and
// client both reference this so the form, the validator, and the export
// stay in sync.

export type QuestionType =
  | "single"
  | "single_with_other"
  | "multi"
  | "multi_capped"
  | "open"
  | "single_with_text_option";

export interface QuestionOption {
  value: string;
  label: string;
  // If set, selecting this option reveals a free-text input that maps to
  // `${q.id}_other` (or `${q.id}_text` for single_with_text_option).
  hasFreeText?: boolean;
}

export interface Question {
  id: string;
  number: number;
  section: string;
  prompt: string;
  type: QuestionType;
  required?: boolean;
  options?: QuestionOption[];
  // For multi_capped: pick at most this many.
  maxPicks?: number;
}

export const SURVEY_QUESTIONS: Question[] = [
  // SECTION A
  {
    id: "q1",
    number: 1,
    section: "Practice & Learning Value",
    prompt:
      "How useful was StakeholderSim for practicing what it feels like to gather requirements from real stakeholders?",
    type: "single",
    required: true,
    options: [
      { value: "very_useful", label: "Very useful — felt close to a real consulting conversation" },
      { value: "useful", label: "Useful — better than reading a written spec" },
      { value: "mixed", label: "Mixed — useful in parts, frustrating in others" },
      { value: "not_very", label: "Not very useful — a written spec would have worked better" },
      { value: "not_at_all", label: "Not at all useful" },
    ],
  },
  {
    id: "q2",
    number: 2,
    section: "Practice & Learning Value",
    prompt: "Which of the following did you actually learn or practice through StakeholderSim?",
    type: "multi",
    options: [
      { value: "translate", label: "Translating business language into technical requirements" },
      { value: "clarify", label: "Asking clarifying questions instead of assuming" },
      { value: "map_concerns", label: "Mapping stakeholder concerns to architecture choices" },
      { value: "conflicts", label: "Recognizing when requirements conflict between stakeholders" },
      { value: "defend", label: "Defending a design decision when challenged" },
      { value: "pushback", label: "Knowing when to push back vs. when to comply" },
      { value: "none", label: "None of the above" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },
  {
    id: "q3",
    number: 3,
    section: "Practice & Learning Value",
    prompt: "Compared to a traditional written project spec, StakeholderSim was:",
    type: "single",
    required: true,
    options: [
      { value: "much_better", label: "Much better for my learning" },
      { value: "better", label: "Better" },
      { value: "same", label: "About the same" },
      { value: "worse", label: "Worse" },
      { value: "much_worse", label: "Much worse" },
    ],
  },
  {
    id: "q4",
    number: 4,
    section: "Practice & Learning Value",
    prompt:
      "In one sentence, what's the most important thing you learned from StakeholderSim that you don't think you'd have learned from a written project document? (optional)",
    type: "open",
  },

  // SECTION B
  {
    id: "q5",
    number: 5,
    section: "Individual Accountability",
    prompt:
      "Knowing that your individual conversations would be evaluated (separately from your team's infrastructure work) affected how you engaged with the project:",
    type: "single_with_other",
    required: true,
    options: [
      { value: "significantly", label: "Significantly — I engaged more deeply than I would have otherwise" },
      { value: "somewhat", label: "Somewhat — I put in more effort on my own conversations" },
      { value: "a_little", label: "A little" },
      { value: "not_really", label: "Not really — I would have engaged the same way regardless" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },
  {
    id: "q6",
    number: 6,
    section: "Individual Accountability",
    prompt:
      "In a typical group project (without individual-conversation evaluation), how would your engagement have compared?",
    type: "single_with_other",
    required: true,
    options: [
      { value: "much_less", label: "I would have engaged much less — StakeholderSim pulled me in" },
      { value: "somewhat_less", label: "Somewhat less" },
      { value: "same", label: "About the same" },
      { value: "somewhat_more", label: "Somewhat more" },
      { value: "much_more", label: "I would have engaged much more — StakeholderSim got in the way" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },
  {
    id: "q7",
    number: 7,
    section: "Individual Accountability",
    prompt:
      "Thinking about your team as a whole, did StakeholderSim change who engaged with stakeholders compared to a typical group project?",
    type: "single_with_other",
    required: true,
    options: [
      { value: "yes_normally_coast", label: "Yes — teammates who would normally coast had to participate" },
      { value: "somewhat_even", label: "Somewhat — engagement was a bit more even than usual" },
      { value: "no_change", label: "No real change — same people did the work as in any group project" },
      { value: "less_even", label: "Engagement was actually less even than usual" },
      { value: "alone", label: "Hard to say / I worked mostly alone" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },

  // SECTION C
  {
    id: "q8",
    number: 8,
    section: "Tone & Persona Quality",
    prompt: "How realistic did the four stakeholders (Elena, Marcus, Priya, James) feel?",
    type: "single",
    required: true,
    options: [
      { value: "very", label: "Very realistic — felt like distinct people with their own agendas" },
      { value: "mostly", label: "Mostly realistic" },
      { value: "somewhat", label: "Somewhat realistic" },
      { value: "not_very", label: "Not very realistic — felt scripted" },
      { value: "not_at_all", label: "Not at all realistic" },
    ],
  },
  {
    id: "q9",
    number: 9,
    section: "Tone & Persona Quality",
    prompt: "Which stakeholder felt the most realistic / useful?",
    type: "single",
    required: true,
    options: [
      { value: "elena", label: "Elena Vasquez (VP Operations)" },
      { value: "marcus", label: "Marcus Chen (CFO)" },
      { value: "priya", label: "Priya Sharma (CTO)" },
      { value: "james", label: "James Whitfield (Compliance)" },
      { value: "all_same", label: "They all felt about the same" },
      { value: "none", label: "None felt particularly realistic" },
    ],
  },
  {
    id: "q10",
    number: 10,
    section: "Tone & Persona Quality",
    prompt:
      "The Mentor's tone (giving hints, asking you to reflect, \"forgiving\" hints when you showed understanding) felt:",
    type: "single_with_other",
    required: true,
    options: [
      { value: "helpful", label: "Helpful and well-paced" },
      { value: "too_socratic", label: "Helpful but sometimes too slow / too Socratic" },
      { value: "mixed", label: "Mixed — sometimes great, sometimes patronizing" },
      { value: "frustrating", label: "Frustrating — I wanted more direct answers" },
      { value: "didnt_engage", label: "I didn't engage much with the Mentor" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },

  // SECTION D
  {
    id: "q11",
    number: 11,
    section: "Interface & User Experience",
    prompt: "Which aspects of the interface need the most improvement? (pick up to 3)",
    type: "multi_capped",
    maxPicks: 3,
    options: [
      { value: "scrolling", label: "Conversation history / scrolling back to previous exchanges" },
      { value: "who_to_talk_to", label: "Knowing which stakeholder to talk to when" },
      { value: "tracking", label: "Tracking what I've already learned vs. what's still unknown" },
      { value: "speed", label: "Speed / response time" },
      { value: "mobile", label: "Mobile or small-screen usability" },
      { value: "client_vs_mentor", label: "Distinguishing Client conversations from Mentor conversations" },
      { value: "export", label: "Exporting or saving conversations for reference" },
      { value: "complete", label: "Knowing when a conversation was \"complete\"" },
      { value: "design", label: "Visual design / readability" },
      { value: "nothing", label: "Nothing — interface was fine" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },
  {
    id: "q12",
    number: 12,
    section: "Interface & User Experience",
    prompt: "Did you ever feel lost or stuck in a way that better UI (not better content) would have fixed?",
    type: "single_with_text_option",
    required: true,
    options: [
      { value: "yes", label: "Yes — please describe briefly:", hasFreeText: true },
      { value: "sometimes", label: "Sometimes" },
      { value: "no", label: "No" },
    ],
  },

  // SECTION E
  {
    id: "q13",
    number: 13,
    section: "Expanding to the Full Term",
    prompt: "Should StakeholderSim be used more broadly in the course?",
    type: "single_with_other",
    required: true,
    options: [
      { value: "most", label: "Yes — use it for most major assignments" },
      { value: "one_or_two_more", label: "Yes — use it for one or two more projects, but not everything" },
      { value: "as_is", label: "Keep it as-is (one project)" },
      { value: "less", label: "Use it less — once was enough to make the point" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },
  {
    id: "q14",
    number: 14,
    section: "Expanding to the Full Term",
    prompt:
      "If StakeholderSim were used for additional projects, what would make it MORE valuable the second or third time?",
    type: "multi",
    options: [
      { value: "different_personalities", label: "Different stakeholder personalities (harder, more conflict)" },
      { value: "higher_stakes", label: "Higher-stakes business scenarios" },
      { value: "tighter_time", label: "Tighter time pressure / deadlines from the Client" },
      { value: "more_technical", label: "More technical depth in Mentor conversations" },
      { value: "cross_team", label: "Cross-team stakeholder conversations (talking to peers' clients)" },
      { value: "warmup", label: "A \"warm-up\" practice round before the graded project" },
      { value: "repetitive", label: "It would get repetitive — better to keep it to one project" },
      { value: "other", label: "Other:", hasFreeText: true },
    ],
  },

  // SECTION F
  {
    id: "q15",
    number: 15,
    section: "Open Feedback",
    prompt: "What's ONE thing you'd change about StakeholderSim? (optional)",
    type: "open",
  },
  {
    id: "q16",
    number: 16,
    section: "Open Feedback",
    prompt: "What's ONE thing StakeholderSim did better than you expected? (optional)",
    type: "open",
  },
  {
    id: "q17",
    number: 17,
    section: "Open Feedback",
    prompt: "May we quote you (anonymously or by name) in materials shared with other faculty?",
    type: "single_with_text_option",
    required: true,
    options: [
      { value: "anonymous", label: "Yes, anonymously" },
      { value: "by_name", label: "Yes, by name:", hasFreeText: true },
      { value: "no", label: "No" },
    ],
  },
];

export type SurveyResponses = Record<string, string | string[] | boolean>;

// Server-side validation: ensure required questions are answered and
// shape is sensible. Returns null on success or an error message.
export function validateSurveyResponses(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Invalid payload";
  const r = input as Record<string, unknown>;
  for (const q of SURVEY_QUESTIONS) {
    if (!q.required) continue;
    const v = r[q.id];
    if (v === undefined || v === null || v === "") {
      return `Question ${q.number} requires an answer`;
    }
    if (q.type === "multi" || q.type === "multi_capped") {
      if (!Array.isArray(v)) return `Question ${q.number} must be a list`;
      if (q.maxPicks && v.length > q.maxPicks) {
        return `Question ${q.number} accepts at most ${q.maxPicks} picks`;
      }
    } else if (typeof v !== "string") {
      return `Question ${q.number} must be a string`;
    }
  }
  return null;
}
