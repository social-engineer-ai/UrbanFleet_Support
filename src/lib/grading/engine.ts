import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";
import { getStudentState, updateStudentState, StudentStateType } from "../agents/state";

const anthropic = new Anthropic();

// Meeting-type-aware rubric:
// - Part 1 (requirements): engagement + problem_understanding (student shows they understood the need)
// - Part 2 (solution):     engagement + solution_explanation  (student shows they built something that addresses it)
// - Part 3 (features):     engagement + problem_understanding (creative proposal tied to real needs)
// - Practice:              not graded at all
// - Mentor:                engagement + mentor_quality

interface GradeResult {
  criterion: string;
  persona: string;
  score: number;
  maxScore: number;
  evidence: string[];
  reasoning: string;
}

export async function gradeConversation(
  userId: string,
  conversationId: string,
  agentType: string,
  persona: string | null
): Promise<GradeResult[]> {
  // Read the conversation row so we can honor its meetingType.
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { meetingType: true },
  });
  const meetingType = conversation?.meetingType || "requirements";

  // Practice conversations are explicitly non-graded.
  if (meetingType === "practice") return [];

  const messages = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "asc" },
  });

  if (messages.length < 4) return [];

  const state = await getStudentState(userId);
  const transcript = messages
    .map((m) => `${m.role === "user" ? "STUDENT" : "AGENT"}: ${m.content}`)
    .join("\n\n");

  const personaName = persona || "mentor";
  const isMentor = agentType === "mentor";

  // Meeting-type descriptors for the grader prompt.
  const meetingTypeLabel = isMentor
    ? "Mentor session"
    : meetingType === "requirements"
      ? "Part 1 — Requirements Gathering"
      : meetingType === "solution"
        ? "Part 2 — Solution Demonstration"
        : meetingType === "features"
          ? "Part 3 — Additional Features Proposal"
          : "Client meeting";

  // Which scoring criteria apply depends on the meeting type.
  // Part 1 → problem_understanding; Part 2 → solution_explanation; Part 3 → problem_understanding (innovation lens).
  const gradeSolutionExplanation = !isMentor && meetingType === "solution";
  const gradeProblemUnderstanding = !isMentor && (meetingType === "requirements" || meetingType === "features");

  const gradingPrompt = `You are a grading assistant for a Big Data Infrastructure course. Evaluate this ${agentType} conversation with ${personaName}.

STUDENT: ${state.student_name} (BADM ${state.course})
MEETING TYPE: ${meetingTypeLabel}

<transcript>
${transcript}
</transcript>

Grade the following criteria. Return a JSON object with "grades" array:

${!isMentor ? `
1. ENGAGEMENT (max 10 pts) — Did the student engage meaningfully in this ${meetingTypeLabel} meeting?
   9-10: Multi-turn conversation, asked questions, responded to concerns, stayed through a full cycle
   6-8: Engaged but briefly, touched on concern but didn't fully explore
   3-5: Minimal — single superficial exchange
   0-2: Didn't engage or said hello and left

${gradeProblemUnderstanding ? `2. PROBLEM UNDERSTANDING (max 5 pts) — Does the student understand this stakeholder's core concern?
   Only score if engagement >= 3. Otherwise 0.
   ${meetingType === "requirements"
     ? `In a Part 1 Requirements meeting, we look for: did the student probe the pain, get specifics, and (most importantly) demonstrate understanding by being able to articulate the stakeholder's top concerns back to them? Reward the teach-back moments.`
     : `In a Part 3 Features Proposal meeting, we look for: did the student's proposal demonstrate real understanding of an unmet business need for this stakeholder?`}
   4-5: Articulates the stakeholder's core problem with specifics and nuance
   2-3: Understands generally but misses an element
   0-1: Only vague sense of the problem` : ""}

${gradeSolutionExplanation ? `2. SOLUTION EXPLANATION (max 5 pts) — Can the student explain their solution in this stakeholder's language and connect it to the stakeholder's specific pain points from Part 1?
   Only score if engagement >= 3. Otherwise 0.
   This is a Part 2 Solution Demonstration meeting — the student should be walking the stakeholder through a concrete build and explaining how it addresses the stakeholder's concerns. Reward business-language explanations, honest acknowledgment of limitations, and ability to handle pushback.
   4-5: Explains clearly in business terms, directly addresses stakeholder's specific pains, handles pushback well
   2-3: Adequate but somewhat technical or missing an element; partial pushback handling
   0-1: Raw technical terms; stakeholder would be confused; or no actual solution presented` : ""}
` : `
1. ENGAGEMENT (max 10 pts) — Did the student engage meaningfully with the Mentor?
   9-10: Multi-turn, asked questions, shared thinking, stayed through hint-reflection cycles
   6-8: Engaged but briefly
   3-5: Minimal interaction
   0-2: Didn't engage

2. MENTOR QUALITY (max 10 pts) — Quality of interaction with the Mentor
   Only score if engagement >= 3.
   Question Quality (3 pts): Architectural/trade-off questions (3) vs mechanical "how do I" (1)
   Initial Thinking (3 pts): Shares hypothesis before asking (3) vs "what should I do?" (1)
   Reflection Quality (4 pts): Restates, connects to project, identifies trade-offs (4) vs "ok got it" (1)
`}

Return JSON:
{
  "grades": [
    { "criterion": "engagement", "persona": "${personaName}", "score": <0-10>, "evidence": ["quote"], "reasoning": "why" }${
      isMentor
        ? `,{ "criterion": "mentor_quality", "persona": "mentor", "score": <0-10>, "evidence": ["quote"], "reasoning": "why" }`
        : gradeSolutionExplanation
          ? `,{ "criterion": "solution_explanation", "persona": "${personaName}", "score": <0-5>, "evidence": ["quote"], "reasoning": "why" }`
          : gradeProblemUnderstanding
            ? `,{ "criterion": "problem_understanding", "persona": "${personaName}", "score": <0-5>, "evidence": ["quote"], "reasoning": "why" }`
            : ""
    }
  ]
}

Return valid JSON only.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: gradingPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const result = JSON.parse(jsonMatch[0]);
    return (result.grades || []).map((g: { criterion: string; persona: string; score: number; evidence: string[]; reasoning: string }) => ({
      criterion: g.criterion,
      persona: g.persona || personaName,
      score: g.score,
      maxScore: g.criterion === "engagement" ? 10 : g.criterion === "mentor_quality" ? 10 : 5,
      evidence: g.evidence || [],
      reasoning: g.reasoning || "",
    }));
  } catch (error) {
    console.error("Grading error:", error);
    return [];
  }
}

export async function updateStudentScores(
  userId: string,
  conversationId: string,
  agentType: string,
  grades: GradeResult[]
): Promise<void> {
  const state = await getStudentState(userId);
  const scores = state.conversation_scores;

  for (const grade of grades) {
    const p = grade.persona as keyof typeof scores.engagement;

    if (grade.criterion === "engagement" && p in scores.engagement) {
      // Take the best engagement score for each persona (not average — reward showing up)
      const current = scores.engagement[p] || 0;
      scores.engagement[p] = Math.max(current, grade.score);
    }

    if (grade.criterion === "problem_understanding" && p in scores.problem_understanding) {
      const current = (scores.problem_understanding as Record<string, number>)[p] || 0;
      (scores.problem_understanding as Record<string, number>)[p] = Math.max(current, grade.score);
    }

    if (grade.criterion === "mentor_quality") {
      const current = scores.problem_understanding.mentor_quality || 0;
      scores.problem_understanding.mentor_quality = Math.max(current, grade.score);
    }

    if (grade.criterion === "solution_explanation" && p in scores.solution_explanation) {
      const current = (scores.solution_explanation as Record<string, number>)[p] || 0;
      (scores.solution_explanation as Record<string, number>)[p] = Math.max(current, grade.score);
    }
  }

  await updateStudentState(userId, state);

  // Store grade records for evidence
  for (const grade of grades) {
    await prisma.message.create({
      data: {
        conversationId,
        role: "system",
        content: JSON.stringify({
          type: "grade",
          criterion: grade.criterion,
          persona: grade.persona,
          score: grade.score,
          maxScore: grade.maxScore,
          evidence: grade.evidence,
          reasoning: grade.reasoning,
        }),
        metadata: JSON.stringify({ type: "grade" }),
      },
    });
  }
}

export async function gradeAndUpdateConversation(
  userId: string,
  conversationId: string,
  agentType: string,
  persona: string | null
): Promise<GradeResult[]> {
  const grades = await gradeConversation(userId, conversationId, agentType, persona);
  if (grades.length > 0) {
    await updateStudentScores(userId, conversationId, agentType, grades);
  }
  return grades;
}

export async function classifyReflection(
  hintText: string,
  reflectionText: string,
  studentContext: string
): Promise<{ quality: string; reasoning: string; forgiven: boolean }> {
  const prompt = `You are evaluating a student's reflection after receiving a technical hint.

HINT GIVEN: ${hintText}
STUDENT'S REFLECTION: ${reflectionText}
STUDENT'S PROJECT CONTEXT: ${studentContext}

Evaluate:
- DEEP: Restates in own words, connects to project, identifies trade-offs
- MEDIUM: Gets general idea but misses nuance
- SHALLOW: "ok" / "got it" / restates hint / fewer than 15 words

Return JSON: {"quality": "deep"|"medium"|"shallow", "reasoning": "brief", "forgiven": true|false}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Reflection classifier error:", error);
  }
  return { quality: "medium", reasoning: "Unable to classify", forgiven: false };
}
