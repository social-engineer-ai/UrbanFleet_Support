import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";
import { getStudentState, updateStudentState, StudentStateType } from "../agents/state";

const anthropic = new Anthropic();

// Individual rubric: 100 points total across 6 dimensions
// These are evaluated per-conversation and aggregated across all conversations

const CLIENT_RUBRIC = {
  stakeholder_engagement: { max: 15, description: "Did the student engage meaningfully with this stakeholder? Ask relevant questions? Show preparation?" },
  requirements_discovery: { max: 15, description: "Did the student uncover key requirements? Probe for hidden information? Ask follow-up questions when given partial answers?" },
  solution_presentation: { max: 15, description: "When presenting a solution, did the student explain in business terms the stakeholder understands? Connect features to this stakeholder's specific needs?" },
};

const MENTOR_RUBRIC = {
  question_quality: { max: 15, description: "Are questions architectural ('Should I partition by vehicle or date? What are the trade-offs?') or mechanical ('What's the boto3 syntax?')? Design thinking scores higher." },
  reflection_depth: { max: 20, description: "After receiving hints, does the student explain the concept in their own words, connect it to their specific project, and identify trade-offs or edge cases? Or do they just say 'ok got it'?" },
  growth_and_iteration: { max: 20, description: "Does the student adapt when challenged? Are they more self-sufficient than in earlier sessions? Do they need fewer Level 3 hints? Do they propose approaches before asking for validation?" },
};

interface GradeResult {
  criterion: string;
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
  const messages = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "asc" },
  });

  if (messages.length < 4) return []; // Too short to grade

  const state = await getStudentState(userId);
  const transcript = messages
    .map((m) => `${m.role === "user" ? "STUDENT" : "AGENT"}: ${m.content}`)
    .join("\n\n");

  const rubric = agentType === "client" ? CLIENT_RUBRIC : MENTOR_RUBRIC;
  const rubricDescription = Object.entries(rubric)
    .map(([key, val]) => `- ${key} (max ${val.max} points): ${val.description}`)
    .join("\n");

  const gradingPrompt = `You are a grading assistant for a graduate-level Big Data Infrastructure course. Evaluate this student's conversation against the rubric criteria below.

IMPORTANT: Be fair and evidence-based. Quote specific student statements as evidence. Grade on a curve where:
- 80-100% = excellent, demonstrates genuine mastery
- 60-80% = good, solid understanding with minor gaps
- 40-60% = developing, shows effort but significant gaps
- 20-40% = needs improvement, surface-level engagement
- 0-20% = minimal engagement or off-track

STUDENT CONTEXT:
- Name: ${state.student_name}
- Course: BADM ${state.course}
- Meeting/session number: ${agentType === "client" ? state.conversation_scores.client.total_meetings : state.conversation_scores.mentor.total_sessions}
- Requirements discovered so far: ${Object.entries(state.requirements_uncovered).filter(([, v]) => v.discovered).map(([k]) => k).join(", ") || "none"}

RUBRIC CRITERIA:
${rubricDescription}

<transcript>
${transcript}
</transcript>

For EACH criterion in the rubric, return a JSON object in this exact format:
{
  "grades": [
    {
      "criterion": "criterion_key",
      "score": <number 0 to max>,
      "evidence": ["direct quote 1 from student", "direct quote 2"],
      "reasoning": "1-2 sentence explanation of why this score"
    }
  ]
}

Grade ONLY the criteria relevant to this ${agentType} conversation. Return valid JSON only.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: gradingPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const result = JSON.parse(jsonMatch[0]);
    const rubricAny = rubric as Record<string, { max: number; description: string }>;
    const grades: GradeResult[] = (result.grades || []).map((g: { criterion: string; score: number; evidence: string[]; reasoning: string }) => ({
      criterion: g.criterion,
      score: Math.min(g.score, rubricAny[g.criterion]?.max || 0),
      maxScore: rubricAny[g.criterion]?.max || 0,
      evidence: g.evidence || [],
      reasoning: g.reasoning || "",
    }));

    return grades;
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

  // Use rolling average: blend new scores with existing (weighted toward more recent)
  const isClient = agentType === "client";
  const scoreSection = isClient
    ? state.conversation_scores.client
    : state.conversation_scores.mentor;
  const scoreSectionAny = scoreSection as Record<string, number>;

  const meetingCount = isClient
    ? state.conversation_scores.client.total_meetings
    : state.conversation_scores.mentor.total_sessions;

  for (const grade of grades) {
    const key = grade.criterion;
    if (key in scoreSectionAny && key !== "total_meetings" && key !== "total_sessions") {
      const currentScore = scoreSectionAny[key] || 0;
      const weight = Math.min(meetingCount, 5);
      const newScore = weight > 1
        ? Math.round(((currentScore * (weight - 1)) + grade.score) / weight)
        : grade.score;
      scoreSectionAny[key] = newScore;
    }
  }

  await updateStudentState(userId, state);

  // Store individual grade records for evidence tracking
  for (const grade of grades) {
    await prisma.message.create({
      data: {
        conversationId,
        role: "system",
        content: JSON.stringify({
          type: "grade",
          criterion: grade.criterion,
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

// Reflection quality classifier — standalone, more precise than inline analysis
export async function classifyReflection(
  hintText: string,
  reflectionText: string,
  studentContext: string
): Promise<{ quality: string; reasoning: string; forgiven: boolean }> {
  const prompt = `You are evaluating a student's reflection after receiving a technical hint.

HINT GIVEN: ${hintText}
STUDENT'S REFLECTION: ${reflectionText}
STUDENT'S PROJECT CONTEXT: ${studentContext}

Evaluate the reflection quality:
- DEEP: Student restates in own words, connects to their project, identifies trade-offs or edge cases not in the hint. Shows genuine understanding.
- MEDIUM: Student gets the general idea but misses nuance or doesn't connect to their specific project.
- SHALLOW: Simple acknowledgment ("ok", "got it"), restates hint verbatim, fewer than 15 words, no project context.

Return JSON: {"quality": "deep"|"medium"|"shallow", "reasoning": "brief explanation", "forgiven": true|false}
Forgiven is true for deep, conditionally true for medium (if student shows genuine effort), false for shallow.`;

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
