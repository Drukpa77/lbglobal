import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { SubmitButton } from "@/components/submit-button";

type SearchParams = Promise<{ error?: string; reset?: string }>;

export default async function LoginPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const errorMessage =
    searchParams.error === "CredentialsSignin"
      ? "Invalid email or password."
      : undefined;
  const successMessage =
    searchParams.reset === "success" ? "Password has been reset. You can now sign in." : undefined;

  return (
    <main className="portal-theme min-h-screen bg-[radial-gradient(circle_at_10%_10%,rgba(244,63,94,0.12),transparent_35%),radial-gradient(circle_at_90%_20%,rgba(59,130,246,0.14),transparent_35%),#f8fafc]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-3xl border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl md:grid-cols-2 md:p-8">
          <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6 text-white md:p-8">
            <div className="mb-5 flex items-center gap-3">
              <Image
                src="/loogo.png"
                alt="L&B Global logo"
                width={44}
                height={44}
                className="h-11 w-11 rounded-xl border border-white/20 bg-white/90 p-1 object-contain"
                priority
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-blue-100">Overseas Education & Visa</p>
                <p className="text-lg font-semibold">L&B Global</p>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-3 text-sm leading-6 text-blue-100">
              Sign in to manage inquiries, student pipelines, communication, documents, and reporting in one place.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-blue-50">
              <li className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">Role-based dashboards for Admin, Sub Admin, and Internal Staff</li>
              <li className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">Structured follow-up workflow from inquiry to visa stage</li>
              <li className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">Centralized communication and reporting tools</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Team Login</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Sign in to dashboard</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use your official staff credentials.
              </p>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            ) : null}
            {successMessage ? (
              <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {successMessage}
              </p>
            ) : null}

            <form action={loginAction} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  placeholder="name@example.com"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  placeholder="Your password"
                />
              </label>

              <SubmitButton
                loadingText="Signing in..."
                className="w-full rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-70"
              >
                Sign in
              </SubmitButton>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="font-medium text-blue-700 hover:underline">
                Forgot password?
              </Link>
              <p className="text-slate-600">
                Back to{" "}
                <Link href="/" className="font-medium text-slate-900 underline">
                  home
                </Link>
              </p>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">Seed users</p>
              <p className="mt-1">Admin: admin@lbglobal.test / AdminPass123!</p>
              <p>Sub Admin: agent@lbglobal.test / AgentPass123!</p>
              <p>Internal Staff: staff@lbglobal.test / StaffPass123!</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

async function loginAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch {
    redirect("/login?error=CredentialsSignin");
  }
}
