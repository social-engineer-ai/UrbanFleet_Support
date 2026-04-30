import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  checkFinalEntryPreconditions,
  hasValidFinalAuthCookie,
  formatWindowDate,
  formatTimeShort,
} from "@/lib/final558/auth";
import { FinalPasswordGate } from "@/components/FinalPasswordGate";
import Link from "next/link";

// /final — single entry point for the BADM 558 final.
//
// Order of checks:
//   1. Authenticated student? → if not, redirect to /login.
//   2. Course = 558? → if not, render E1.
//   3. Settings exist + we are inside the time window? → if not, render E2.
//   4. Already attempted? → if not, render E3.
//   5. Locked out? → if so, render E4.
//   6. Cookie already valid? → redirect to /final/pre-session.
//   7. Otherwise, render the password gate.

export default async function FinalEntryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/final");
  }

  const pre = await checkFinalEntryPreconditions(session.user.id);

  if (!pre.ok) {
    return <ErrorScreen code={pre.error!} meta={pre.errorMeta} />;
  }

  // Preconditions clear. If the cookie is already valid, jump to pre-session.
  if (await hasValidFinalAuthCookie(session.user.id)) {
    redirect("/final/pre-session");
  }

  return <FinalPasswordGate />;
}

function ErrorScreen({
  code,
  meta,
}: {
  code: string;
  meta?: {
    windowStart?: Date;
    windowEnd?: Date;
    completedAt?: Date;
    unlockAt?: Date;
  };
}) {
  let heading: string;
  let body: string;

  switch (code) {
    case "wrong_course":
      heading = "This final is for BADM 558.";
      body =
        "Your account is not registered for BADM 558. The 558 final is not available to your section.";
      break;
    case "outside_window":
      heading = "Your final is not currently available.";
      body = `The BADM 558 final opens at ${
        meta?.windowStart ? formatWindowDate(meta.windowStart) : "the scheduled time"
      } and closes at ${
        meta?.windowEnd ? formatWindowDate(meta.windowEnd) : "the scheduled end"
      }. Come back during your scheduled exam slot.`;
      break;
    case "already_attempted":
      heading = "You have already completed your final.";
      body = `Our records show you submitted the BADM 558 final on ${
        meta?.completedAt ? formatWindowDate(meta.completedAt) : "a prior date"
      }. Each student may attempt the final exactly once. If you believe this is an error, contact your instructor.`;
      break;
    case "locked":
      heading = "Too many failed attempts.";
      body = `You entered the wrong password 5 times. The final is locked for one hour and will reopen at ${
        meta?.unlockAt ? formatTimeShort(meta.unlockAt) : "approximately one hour from now"
      }. If you do not have the correct password, raise your hand and ask the proctor.`;
      break;
    case "no_settings":
      heading = "The final has not been configured yet.";
      body =
        "Your instructor has not set up the BADM 558 final on this server. Please raise your hand and let the proctor know.";
      break;
    default:
      heading = "The final is not available.";
      body =
        "Something is wrong with your access. Please raise your hand and let the proctor know.";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-xl w-full bg-white border rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">{heading}</h1>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">{body}</p>
        <div className="mt-6">
          <Link
            href="/chat"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
