"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";

interface TeamOption {
  id: string;
  name: string;
  memberCount: number;
}

export default function RegisterPage() {
  const [step, setStep] = useState<"details" | "otp">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [course, setCourse] = useState("558");
  const [teamName, setTeamName] = useState("");
  const [existingTeams, setExistingTeams] = useState<TeamOption[]>([]);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadTeams(course);
  }, [course]);

  async function loadTeams(c: string) {
    const res = await fetch(`/api/teams?course=${c}`);
    if (res.ok) {
      const teams = await res.json();
      setExistingTeams(teams);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, course, teamName: teamName.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      setMessage("A 6-digit verification code has been sent to your email.");
      setStep("otp");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        setLoading(false);
        return;
      }

      router.push("/login?verified=true");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  async function handleResendOtp() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setMessage("A new verification code has been sent.");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to resend code");
      }
    } catch {
      setError("Failed to resend code");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">StakeholderSim</h1>
          <p className="text-blue-200 mt-2">Create Your Account</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl p-8">
          {step === "details" ? (
            <>
              <h2 className="text-xl font-semibold mb-6">Register</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    UIUC Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="netid@illinois.edu"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    minLength={6}
                    placeholder="At least 6 characters"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course
                  </label>
                  <select
                    value={course}
                    onChange={(e) => { setCourse(e.target.value); setTeamName(""); setShowNewTeam(false); }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="558">BADM 558 (Graduate)</option>
                    <option value="358">BADM 358 (Undergraduate)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team Name
                  </label>
                  {!showNewTeam ? (
                    <div className="space-y-2">
                      <select
                        value={teamName}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setShowNewTeam(true);
                            setTeamName("");
                          } else {
                            setTeamName(e.target.value);
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select your team...</option>
                        {existingTeams.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name} ({t.memberCount} member{t.memberCount !== 1 ? "s" : ""})
                          </option>
                        ))}
                        <option value="__new__">+ Create new team</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value.toLowerCase())}
                        placeholder="enter team name in all lowercase"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => { setShowNewTeam(false); setTeamName(""); }}
                        className="text-xs text-gray-500 hover:text-blue-600"
                      >
                        Back to existing teams
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Use the exact team name from Canvas, all lowercase
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Sending verification code..." : "Continue"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Verify Your Email</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter the 6-digit code sent to <strong>{email}</strong>
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              {message && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {message}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest font-mono"
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Verifying..." : "Verify & Create Account"}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
                <button
                  onClick={() => {
                    setStep("details");
                    setError("");
                    setMessage("");
                    setOtp("");
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
