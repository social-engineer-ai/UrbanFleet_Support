import Link from "next/link";
import { DEADLINES } from "@/lib/deadlines";

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">How StakeholderSim works</h1>
            <p className="text-sm text-gray-500 mt-1">
              A quick guide to the workflow, meeting types, grading, and deadlines.
            </p>
          </div>
          <Link href="/chat" className="text-sm text-blue-600 hover:underline">
            Back to chat
          </Link>
        </div>

        <Section title="The big picture">
          <p>
            StakeholderSim is how you run the <strong>consulting engagement</strong> part of the
            UrbanFleet project. You meet with AI-powered stakeholders and mentors instead of
            getting a rigid instruction sheet — because real projects never come with one. Your
            job is to ask the right questions, build something that actually addresses what the
            business needs, and defend your decisions.
          </p>
          <p>
            Every conversation is recorded and <strong>graded individually</strong>. The platform
            is designed to reward showing up, engaging meaningfully, and growing your
            self-sufficiency over time. It&apos;s less about getting the &quot;right&quot; answer and
            more about demonstrating you can think like a consultant.
          </p>
        </Section>

        <Section title="The two roles you&apos;ll talk to">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">The Client (4 stakeholders)</h3>
              <ul className="text-sm space-y-1 text-gray-700">
                <li><strong>Elena Vasquez</strong> — VP of Operations (day-to-day fleet pain)</li>
                <li><strong>Marcus Chen</strong> — CFO (cost, budget, ROI)</li>
                <li><strong>Priya Sharma</strong> — CTO (architecture, maintainability)</li>
                <li><strong>James Whitfield</strong> — Compliance Director (audit, retention)</li>
              </ul>
              <p className="text-xs text-blue-800 mt-3">
                They speak business language only. Do not expect them to suggest technical
                solutions — their job is to describe problems. Your job is to translate those
                problems into a solution.
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h3 className="font-semibold text-emerald-900 mb-2">The Mentor (Dr. Raj Patel)</h3>
              <p className="text-sm text-gray-700 mb-2">
                A senior AWS solutions architect. Available throughout the project for technical
                guidance.
              </p>
              <p className="text-xs text-emerald-800">
                <strong>Important:</strong> The Mentor gives <em>hints, not answers</em>. After
                each hint, you&apos;ll be asked to reflect. Deep reflections (that show real
                understanding) are rewarded. Shallow &quot;ok got it&quot; responses are recorded.
                Use the Mentor often — little check-ins beat one giant marathon session.
              </p>
            </div>
          </div>
        </Section>

        <Section title="The three meeting types (for Client conversations)">
          <p className="mb-4">
            Every time you start a conversation with a stakeholder, you&apos;ll pick <em>what you&apos;re
            here for</em>. This shapes how the stakeholder responds and how the meeting is graded.
          </p>

          <MeetingTypeCard
            number="1"
            title="Part 1 — Gather Requirements"
            color="blue"
            description="Your goal: understand this stakeholder&apos;s business pain and what they need you to deliver."
            details={[
              "Ask probing questions. Don't try to propose solutions yet.",
              "At the end, the stakeholder will ask you to summarize back what you heard (a 'teach-back'). This is how they confirm you understood.",
              "You'll know you're done when the stakeholder tells you to go build something and come back.",
              "Expected: at least one Part 1 meeting with each of the 4 stakeholders.",
            ]}
          />

          <MeetingTypeCard
            number="2"
            title="Part 2 — Present Your Solution"
            color="emerald"
            description="Your goal: show them what you built and defend how it addresses their specific concerns."
            details={[
              "Come with a concrete solution to walk them through. Not just slides — be ready to describe how the system actually handles their pain points.",
              "Expect pushback. They'll challenge gaps, overclaims, and fuzzy thinking. Defend your trade-offs in business language.",
              "If you arrive empty-handed, the stakeholder will redirect you. Come back when you have something to show.",
              "This meeting is where the Solution Presentation, Handling Pushback, and Business Awareness grades are earned.",
              "Locked until you complete a Part 1 meeting with that same stakeholder.",
            ]}
          />

          <MeetingTypeCard
            number="3"
            title="Part 3 — Propose a Feature (optional)"
            color="violet"
            description="Your goal: pitch an enhancement beyond the baseline project scope."
            details={[
              "This is stretch work. If you want to innovate, propose an additional feature and walk the stakeholder through why it matters.",
              "The stakeholder will challenge whether the data supports your proposal and whether it fits the business case.",
              "Contributes to the individual innovation leaderboard — not required, but rewarded.",
            ]}
          />

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
            <h4 className="font-semibold text-gray-800 text-sm mb-1">Practice mode (ungraded)</h4>
            <p className="text-xs text-gray-600">
              Every stakeholder also offers a Practice mode. These sessions don&apos;t count toward
              your grade — use them to try things out, rehearse a solution pitch, or work on
              handling pushback before the real meeting.
            </p>
          </div>
        </Section>

        <Section title="Deadlines">
          <div className="space-y-2">
            {Object.values(DEADLINES).map((d) => (
              <div key={d.label} className="flex gap-3 items-start p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex-shrink-0 w-24 text-xs font-semibold text-blue-700 bg-blue-50 rounded px-2 py-1.5 text-center">
                  {d.dueLabel || new Date(d.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{d.label}</div>
                  <div className="text-xs text-gray-500">{d.description}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Deadlines are targets, not hard locks — the buttons keep working afterward. But use
            them as your guide: each stakeholder&apos;s grading focus matches the part that&apos;s
            currently active, so a solution meeting held before you&apos;ve built anything (or a
            requirements meeting held after you were supposed to be presenting) just won&apos;t score
            as well.
          </p>
        </Section>

        <Section title="How you&apos;re graded">
          <p className="mb-3">
            Your <strong>individual grade on this platform</strong> (100 points) comes from your
            conversations: 80 points for Client meetings and 20 points for Mentor sessions. Your
            <strong> team grade</strong> comes from the actual build in AWS and the final
            presentation. <em>(BADM 558 teams also submit an Architecture Decision Log — see below.)</em>
          </p>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 text-sm mb-2">Client conversations (80 pts)</h4>
            <p className="text-sm text-gray-700 mb-2">
              You get <strong>10 points per stakeholder per part</strong> — 4 stakeholders × 2 parts × 10 = 80 points total. Within each of those 10-point slots:
            </p>
            <ul className="text-sm text-gray-700 space-y-1 mb-3">
              <li><strong>5 points for showing up</strong> — you engaged meaningfully in the meeting (not just said hi and left)</li>
              <li><strong>5 points for quality</strong>:
                <ul className="ml-4 mt-1 space-y-0.5 text-xs text-gray-600">
                  <li>• <strong>Part 1</strong>: how well you gathered requirements — did you probe the pain, articulate concerns back in your own words, demonstrate understanding?</li>
                  <li>• <strong>Part 2</strong>: business awareness + handling pushback — did you explain in business language, defend your trade-offs, adjust honestly when challenged?</li>
                </ul>
              </li>
            </ul>
            <p className="text-xs text-gray-500">
              So a student who completes all 8 core meetings (Part 1 + Part 2 × 4 stakeholders) with reasonable engagement and quality gets close to the full 80. Missing a stakeholder costs 20 points (both parts with them).
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mt-3">
            <h4 className="font-semibold text-gray-800 text-sm mb-2">Mentor conversations (20 pts)</h4>
            <p className="text-sm text-gray-700">
              Scored on question quality, reflection depth, iteration, and independence growth
              across sessions.
            </p>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            <strong>About hints:</strong> The Mentor gives hints, not answers. After each hint
            you&apos;ll be asked to reflect. Deep reflections (restate in your own words, connect to
            your project, identify trade-offs) cost you nothing — they&apos;re evidence of learning.
            Shallow reflections are recorded. The grade measures how you think, not whether you
            needed help.
          </p>
        </Section>

        <Section title="Tips for success">
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• <strong>Start with the Client.</strong> Meet all four stakeholders before you touch AWS. Each has a unique piece of the puzzle.</li>
            <li>• <strong>Every team member should have their own conversations.</strong> Individual grades depend on your individual meetings. Don&apos;t let one person do all the requirements gathering.</li>
            <li>• <strong>Use Practice mode if you&apos;re nervous.</strong> No stakes, just feedback. Rehearse a pitch before you do it for real.</li>
            <li>• <strong>Come back to the Mentor often.</strong> A few short sessions at decision points beats one marathon at the end. The &quot;Independence growth&quot; criterion rewards showing up at multiple moments.</li>
            <li>• <strong>Propose a solution, don&apos;t ask for one.</strong> The Mentor rewards students who share their thinking first. &quot;Here&apos;s what I&apos;m considering — thoughts?&quot; beats &quot;What should I use?&quot;</li>
            <li>• <strong>(558 only) Document decisions as you go.</strong> Your Architecture Decision Log needs at least 6 decisions with reasoning and trade-offs. Don&apos;t leave it to the last day. The Mentor will help you review them.</li>
            <li>• <strong>If you&apos;re stuck or overwhelmed,</strong> say so. The Mentor adjusts when you tell it you&apos;re frustrated or nervous.</li>
          </ul>
        </Section>

        <div className="flex gap-3 mt-6">
          <Link
            href="/chat"
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 text-center transition-colors"
          >
            Back to chat
          </Link>
          <Link
            href="/progress"
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 text-center transition-colors"
          >
            See my progress
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">
        {title}
      </h2>
      <div className="text-sm text-gray-700 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

const CARD_COLORS: Record<string, { bg: string; border: string; text: string; num: string }> = {
  blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900", num: "bg-blue-600" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", num: "bg-emerald-600" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-900", num: "bg-violet-600" },
};

function MeetingTypeCard({
  number,
  title,
  color,
  description,
  details,
}: {
  number: string;
  title: string;
  color: "blue" | "emerald" | "violet";
  description: string;
  details: string[];
}) {
  const c = CARD_COLORS[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-4 mb-3`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full ${c.num} text-white font-bold flex items-center justify-center text-sm`}>
          {number}
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${c.text}`}>{title}</h3>
          <p className="text-sm text-gray-700 mt-1">{description}</p>
          <ul className="text-xs text-gray-600 mt-2 space-y-1">
            {details.map((d, i) => (
              <li key={i}>• {d}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
