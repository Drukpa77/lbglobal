import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const errorMessage =
    searchParams.error === "CredentialsSignin"
      ? "Invalid email or password."
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Use one of the seeded accounts to test role-based dashboards.
        </p>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <form action={loginAction} className="space-y-4">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="name@example.com"
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Your password"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Sign in
        </button>
      </form>

      <div className="rounded-md border p-3 text-xs text-gray-700">
        <p className="font-semibold">Seed users</p>
        <p>Admin: admin@lbglobal.test / AdminPass123!</p>
        <p>Sub Admin: agent@lbglobal.test / AgentPass123!</p>
        <p>Student: student@lbglobal.test / StudentPass123!</p>
      </div>

      <p className="text-sm text-gray-600">
        Back to{" "}
        <Link href="/" className="underline">
          home
        </Link>
      </p>
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
