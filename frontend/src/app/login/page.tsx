"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogIn } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { subscribeToPushNotifications } from '@/utils/pushHelper'; // Adjust the path based on where you saved it

export default function LoginPage() {
  const router = useRouter();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await api.post<{ access_token: string }>("/auth/login", {
        email: email.trim(),
        password,
      });

      setAccessToken(response.data.access_token);
      subscribeToPushNotifications(response.data.access_token);
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
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-ink">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Access the inventory operations dashboard.
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-700">
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
          <LogIn className="h-4 w-4" />
          {isSubmitting ? "Processing..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}