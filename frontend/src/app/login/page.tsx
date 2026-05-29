"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogIn, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isRegistering) {
        await api.post("/auth/register", {
          email: email.trim(),
          full_name: fullName.trim(),
          password,
        });
      }

      const response = await api.post<{ access_token: string }>("/auth/login", {
        email: email.trim(),
        password,
      });

      setAccessToken(response.data.access_token);
      router.push("/");
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.detail ||
        "Authentication failed. Please check your credentials."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-md border border-line bg-white p-6 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white">
          {isRegistering ? <UserPlus className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </div>
        <h1 className="mt-5 text-xl font-semibold text-ink">
          {isRegistering ? "Create an account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isRegistering ? "Register to access the system." : "Access the inventory operations dashboard."}
        </p>

        {isRegistering && (
          <label className="mt-6 block text-sm font-medium text-slate-700">
            Full Name
            <input
              className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              type="text"
              required
            />
          </label>
        )}

        <label className={isRegistering ? "mt-4 block text-sm font-medium text-slate-700" : "mt-6 block text-sm font-medium text-slate-700"}>
          Email
          <input
            className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>

        {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <button
          className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isRegistering ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          {isSubmitting ? "Processing..." : isRegistering ? "Register" : "Sign in"}
        </button>

        <div className="mt-4 text-center text-sm text-slate-600">
          {isRegistering ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(null);
            }}
            className="font-semibold text-brand hover:underline"
          >
            {isRegistering ? "Sign in" : "Register"}
          </button>
        </div>
      </form>
    </main>
  );
}