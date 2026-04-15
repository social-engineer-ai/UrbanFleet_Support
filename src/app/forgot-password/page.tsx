"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send reset code");
        setLoading(false);
        return;
      }

      setMessage("If an account exists for that email, a 6-digit reset code has been sent. Check your inbox and spam folder.");
      setStep("reset");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password");
        setLoading(false);
        return;
      }

      router.push("/login?reset=true");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">StakeholderSim</h1>
          <p className="text-blue-200 mt-2">Password Reset</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl p-8">
          {step === "email" ? (
            <>
              <h2 className="text-xl font-semibold mb-2">Forgot your password?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your UIUC email and we&apos;ll send you a 6-digit code to reset it.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleRequestCode} className="space-y-4">
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
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Sending reset code..." : "Send reset code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Enter new password</h2>
              <p className="text-sm text-gray-500 mb-6">
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below along with your new password.
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

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reset Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest font-mono"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    minLength={6}
                    placeholder="At least 6 characters"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6 || newPassword.length < 6}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Updating password..." : "Reset password"}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  onClick={handleRequestCode}
                  disabled={loading}
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
                <button
                  onClick={() => {
                    setStep("email");
                    setError("");
                    setMessage("");
                    setCode("");
                    setNewPassword("");
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Use a different email
                </button>
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-gray-600">
            Remembered it?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
