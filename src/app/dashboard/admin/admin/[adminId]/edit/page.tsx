import { hash } from "bcryptjs";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DeleteStaffButton } from "@/components/delete-staff-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = Promise<{ adminId: string }>;

export default async function EditAdminPage(props: { params: Params }) {
  const { adminId } = await props.params;
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const adminUser = await prisma.user.findFirst({
    where: { id: adminId, role: "ADMIN" },
    select: { id: true, name: true, email: true, jobTitle: true },
  });

  if (!adminUser) {
    redirect("/dashboard/admin?tab=staff");
  }

  const isCurrentUser = adminUser.id === session.user.id;

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit admin</h1>
        <Link
          href="/dashboard/admin?tab=staff"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Back
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form action={updateAdminAction} className="space-y-4">
          <input type="hidden" name="adminId" value={adminUser.id} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              name="name"
              defaultValue={adminUser.name ?? ""}
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
              defaultValue={adminUser.email}
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Job title</span>
            <input
              name="jobTitle"
              defaultValue={adminUser.jobTitle ?? ""}
              placeholder="e.g. Operations Director"
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
          {isCurrentUser
            ? "You cannot delete your own active admin account."
            : "Deleting this admin account cannot be undone."}
        </p>
        {!isCurrentUser && (
          <form action={deleteAdminAction} className="mt-4">
            <input type="hidden" name="adminId" value={adminUser.id} />
            <DeleteStaffButton label="Delete admin account" />
          </form>
        )}
      </div>
    </section>
  );
}

async function updateAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const adminId = String(formData.get("adminId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const jobTitleRaw = String(formData.get("jobTitle") ?? "").trim();
  const jobTitle = jobTitleRaw.length > 0 ? jobTitleRaw : null;
  const password = String(formData.get("password") ?? "").trim();

  if (!adminId || name.length < 2 || !email.includes("@")) {
    redirect("/dashboard/admin?tab=staff");
  }

  const adminUser = await prisma.user.findFirst({
    where: { id: adminId, role: "ADMIN" },
    select: { id: true },
  });
  if (!adminUser) redirect("/dashboard/admin?tab=staff");

  const existingWithEmail = await prisma.user.findFirst({
    where: { email, id: { not: adminId } },
    select: { id: true },
  });
  if (existingWithEmail) redirect(`/dashboard/admin/admin/${adminId}/edit`);

  const updateData: { name: string; email: string; jobTitle: string | null; password?: string } = {
    name,
    email,
    jobTitle,
  };
  if (password.length >= 8) {
    updateData.password = await hash(password, 12);
  }

  await prisma.user.update({
    where: { id: adminId },
    data: updateData,
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

async function deleteAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const adminId = String(formData.get("adminId") ?? "");
  if (!adminId || adminId === session.user.id) redirect("/dashboard/admin?tab=staff");

  const adminUser = await prisma.user.findFirst({
    where: { id: adminId, role: "ADMIN" },
    select: { id: true },
  });
  if (!adminUser) redirect("/dashboard/admin?tab=staff");

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount <= 1) redirect("/dashboard/admin?tab=staff");

  await prisma.user.delete({
    where: { id: adminId },
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

