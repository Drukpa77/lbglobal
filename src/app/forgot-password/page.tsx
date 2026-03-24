import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SubmitButton } from "@/components/submit-button";

type SearchParams = Promise<{ done?: string }>;

export default async function ForgotPasswordPage(props: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const isDone = searchParams.done === "1";

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
          <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        {isDone ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            If an account exists with that email, we&apos;ve sent a reset link. Check your inbox.
          </div>
        ) : (
          <form action={requestResetAction} className="space-y-4">
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
            <SubmitButton
              loadingText="Sending..."
              className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
            >
              Send reset link
            </SubmitButton>
          </form>
        )}

        <p className="text-sm text-slate-600">
          <Link href="/login" className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

async function requestResetAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password");

  const user = await import("@/lib/prisma").then(({ prisma }) =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    }),
  );

  // Don't reveal whether the email exists
  if (!user || user.role === "USER") {
    redirect("/forgot-password?done=1");
  }

  const crypto = await import("node:crypto");
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  const { prisma } = await import("@/lib/prisma");
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

  await import("@/lib/email-outbox").then(({ queueDevEmail }) =>
    queueDevEmail({
      createdById: user.id,
      toEmail: email,
      subject: "Reset your password – L&B Global",
      htmlBody: `
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
      `,
    }),
  );

  if (process.env.NODE_ENV === "development") {
    redirect(`/reset-password?token=${token}&email=${encodeURIComponent(email)}`);
  }

  redirect("/forgot-password?done=1");
}
