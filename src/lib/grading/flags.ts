import { prisma } from "../prisma";
import { getStudentState, updateStudentState } from "../agents/state";

interface Flag {
  type: string;
  message: string;
  createdAt: string;
  resolved: boolean;
}

const FLAG_TYPES = {
  DISENGAGED: "disengaged",
  ALL_SHALLOW: "all_shallow_reflections",
  REQUESTING_CODE: "requesting_direct_code",
  EXCEPTIONAL: "exceptional_quality",
  NO_CLIENT: "no_client_meetings",
  STALLED: "build_stalled",
};

export async function evaluateFlags(userId: string): Promise<Flag[]> {
  const state = await getStudentState(userId);
  const newFlags: Flag[] = [];
  const now = new Date();

  // Get last conversation timestamp
  const lastConv = await prisma.conversation.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });

  // 1. Disengaged: no conversation in 5+ days
  if (lastConv) {
    const daysSinceLastConv = (now.getTime() - lastConv.startedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastConv >= 5) {
      newFlags.push({
        type: FLAG_TYPES.DISENGAGED,
        message: `No activity for ${Math.floor(daysSinceLastConv)} days (last conversation: ${lastConv.startedAt.toLocaleDateString()})`,
        createdAt: now.toISOString(),
        resolved: false,
      });
    }
  } else {
    // Never had a conversation
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const daysSinceRegistration = (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceRegistration >= 3) {
        newFlags.push({
          type: FLAG_TYPES.DISENGAGED,
          message: `Registered ${Math.floor(daysSinceRegistration)} days ago but has never started a conversation`,
          createdAt: now.toISOString(),
          resolved: false,
        });
      }
    }
  }

  // 2. All shallow reflections: last 5+ reflections are all shallow
  const recentHints = (state.hint_log || []).slice(-5);
  if (recentHints.length >= 5 && recentHints.every((h) => h.reflection_quality === "shallow")) {
    newFlags.push({
      type: FLAG_TYPES.ALL_SHALLOW,
      message: `Last ${recentHints.length} reflections are all shallow — student may not be engaging meaningfully with hints`,
      createdAt: now.toISOString(),
      resolved: false,
    });
  }

  // 3. No client meetings but has mentor sessions
  if (
    state.conversation_scores.total_meetings === 0 &&
    state.conversation_scores.total_sessions >= 2
  ) {
    newFlags.push({
      type: FLAG_TYPES.NO_CLIENT,
      message: "Student has had ${state.conversation_scores.total_sessions} Mentor sessions but zero Client meetings — skipping requirements elicitation",
      createdAt: now.toISOString(),
      resolved: false,
    });
  }

  // 4. Build stalled: has been in_progress for a phase but no progress for 7+ days
  const buildPhases = Object.entries(state.build_progress);
  const inProgressPhases = buildPhases.filter(([, v]) => v.status === "in_progress");
  if (inProgressPhases.length > 0 && lastConv) {
    const daysSinceActivity = (now.getTime() - lastConv.startedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity >= 7) {
      newFlags.push({
        type: FLAG_TYPES.STALLED,
        message: `Build in progress (${inProgressPhases.map(([k]) => k).join(", ")}) but no activity for ${Math.floor(daysSinceActivity)} days`,
        createdAt: now.toISOString(),
        resolved: false,
      });
    }
  }

  // 5. Exceptional quality: mostly deep reflections and good engagement
  const allHints = state.hint_log || [];
  if (allHints.length >= 5) {
    const deepPct = allHints.filter((h) => h.reflection_quality === "deep").length / allHints.length;
    if (deepPct >= 0.7) {
      newFlags.push({
        type: FLAG_TYPES.EXCEPTIONAL,
        message: `${Math.round(deepPct * 100)}% deep reflections across ${allHints.length} hints — outstanding engagement`,
        createdAt: now.toISOString(),
        resolved: false,
      });
    }
  }

  // Update state with new flags (deduplicate by type)
  const existingTypes = new Set((state.flags || []).map((f: string) => {
    try { return JSON.parse(f).type; } catch { return f; }
  }));

  const flagsToAdd = newFlags.filter((f) => !existingTypes.has(f.type));
  if (flagsToAdd.length > 0) {
    state.flags = [
      ...(state.flags || []),
      ...flagsToAdd.map((f) => JSON.stringify(f)),
    ];
    await updateStudentState(userId, state);
  }

  return [
    ...(state.flags || []).map((f: string) => {
      try { return JSON.parse(f); } catch { return { type: "unknown", message: f, createdAt: "", resolved: false }; }
    }),
    ...flagsToAdd,
  ];
}

export async function resolveFlag(userId: string, flagType: string): Promise<void> {
  const state = await getStudentState(userId);
  state.flags = (state.flags || []).map((f: string) => {
    try {
      const parsed = JSON.parse(f);
      if (parsed.type === flagType) {
        parsed.resolved = true;
      }
      return JSON.stringify(parsed);
    } catch {
      return f;
    }
  });
  await updateStudentState(userId, state);
}

// Run flag evaluation for all students (called periodically or on admin page load)
export async function evaluateAllStudentFlags(): Promise<Record<string, Flag[]>> {
  const students = await prisma.user.findMany({
    where: { role: "student", emailVerified: true },
    select: { id: true },
  });

  const results: Record<string, Flag[]> = {};
  for (const student of students) {
    results[student.id] = await evaluateFlags(student.id);
  }
  return results;
}
