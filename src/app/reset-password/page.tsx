import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SubmitButton } from "@/components/submit-button";

type SearchParams = Promise<{ token?: string; email?: string; error?: string }>;

export default async function ResetPasswordPage(props: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const email = searchParams.email ?? "";
  const error = searchParams.error;

  if (!token || !email) {
    return (
      <main className="portal-theme">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
          <h1 className="text-2xl font-semibold text-slate-900">Invalid reset link</h1>
          <p className="text-sm text-slate-600">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="rounded-md bg-black px-4 py-2 text-center text-sm font-medium text-white"
          >
            Request new link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-theme">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <Image
              src="/loogo.png"
              alt="L&B Global logo"
              width={42}
              height={42}
              className="h-10 w-10 rounded-md object-contain"
              priority
            />
            <p className="text-sm font-semibold text-rose-600">L&B Global</p>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Set new password</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your new password below.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "expired" ? "This link has expired. Request a new one." : "Something went wrong. Please try again."}
          </p>
        ) : null}

        <form action={resetPasswordAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={email} />
          <label className="block text-sm">
            New password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="At least 8 characters"
            />
          </label>
          <SubmitButton
            loadingText="Resetting..."
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
          >
            Reset password
          </SubmitButton>
        </form>

        <p className="text-sm text-slate-600">
          <Link href="/login" className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

async function resetPasswordAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!token || !email || password.length < 8) {
    redirect("/reset-password?error=invalid");
  }

  const { prisma } = await import("@/lib/prisma");
  const { hash } = await import("bcryptjs");

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });

  if (!record || record.expires < new Date()) {
    if (record) {
      await prisma.verificationToken.delete({
        where: { identifier_token: { identifier: email, token } },
      });
    }
    redirect("/reset-password?token=&email=&error=expired");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!user || user.role === "USER") {
    redirect("/reset-password?error=invalid");
  }

  const hashed = await hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed },
  });
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token } },
  });

  redirect("/login?reset=success");
}
