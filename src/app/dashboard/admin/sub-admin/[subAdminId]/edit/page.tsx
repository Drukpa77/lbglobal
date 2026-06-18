import { hash } from "bcryptjs";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DeleteStaffButton } from "@/components/delete-staff-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = Promise<{ subAdminId: string }>;

export default async function EditSubAdminPage(props: { params: Params }) {
  const { subAdminId } = await props.params;
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const subAdmin = await prisma.user.findFirst({
    where: { id: subAdminId, role: "SUB_ADMIN" },
    select: { id: true, name: true, email: true, jobTitle: true },
  });

  if (!subAdmin) {
    redirect("/dashboard/admin?tab=staff");
  }

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit sub-admin</h1>
        <Link
          href="/dashboard/admin?tab=staff"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Back
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form action={updateSubAdminAction} className="space-y-4">
          <input type="hidden" name="subAdminId" value={subAdmin.id} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              name="name"
              defaultValue={subAdmin.name ?? ""}
              required
              minLength={2}
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={subAdmin.email}
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Job title</span>
            <input
              name="jobTitle"
              defaultValue={subAdmin.jobTitle ?? ""}
              placeholder="e.g. Senior Admission Agent"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">New password (leave blank to keep current)</span>
            <input
              name="password"
              type="password"
              minLength={8}
              placeholder="••••••••"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
            >
              Save changes
            </button>
            <Link
              href="/dashboard/admin?tab=staff"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-red-100 bg-red-50/50 p-6">
        <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
        <p className="mt-1 text-sm text-red-700">
          Deleting this sub-admin account cannot be undone.
        </p>
        <form action={deleteSubAdminAction} className="mt-4">
          <input type="hidden" name="subAdminId" value={subAdmin.id} />
          <DeleteStaffButton label="Delete sub-admin account" />
        </form>
      </div>
    </section>
  );
}

async function updateSubAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const subAdminId = String(formData.get("subAdminId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const jobTitleRaw = String(formData.get("jobTitle") ?? "").trim();
  const jobTitle = jobTitleRaw.length > 0 ? jobTitleRaw : null;
  const password = String(formData.get("password") ?? "").trim();

  if (!subAdminId || name.length < 2 || !email.includes("@")) {
    redirect("/dashboard/admin?tab=staff");
  }

  const subAdmin = await prisma.user.findFirst({
    where: { id: subAdminId, role: "SUB_ADMIN" },
    select: { id: true },
  });
  if (!subAdmin) redirect("/dashboard/admin?tab=staff");

  const existingWithEmail = await prisma.user.findFirst({
    where: { email, id: { not: subAdminId } },
    select: { id: true },
  });
  if (existingWithEmail) redirect(`/dashboard/admin/sub-admin/${subAdminId}/edit`);

  const updateData: { name: string; email: string; jobTitle: string | null; password?: string } = {
    name,
    email,
    jobTitle,
  };

  if (password.length >= 8) {
    updateData.password = await hash(password, 12);
  }

  await prisma.user.update({
    where: { id: subAdminId },
    data: updateData,
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

async function deleteSubAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const subAdminId = String(formData.get("subAdminId") ?? "");
  if (!subAdminId) redirect("/dashboard/admin?tab=staff");

  const subAdmin = await prisma.user.findFirst({
    where: { id: subAdminId, role: "SUB_ADMIN", deletedAt: null },
    select: { id: true },
  });
  if (!subAdmin) redirect("/dashboard/admin?tab=staff");

  const now = new Date();
  // Soft-delete (deactivate) so client data survives. Release owned cases back
  // to the queue and end active delegations.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: subAdminId },
      data: { deletedAt: now, deletedById: session.user.id },
    }),
    prisma.questionnaireSubmission.updateMany({
      where: { assignedToId: subAdminId },
      data: { assignedToId: null },
    }),
    prisma.studentAssignment.updateMany({
      where: { assignedToId: subAdminId, isActive: true },
      data: { isActive: false, endedAt: now },
    }),
  ]);

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

