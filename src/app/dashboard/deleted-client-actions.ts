"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  permanentDeleteClient,
  revalidateDeletedClientPaths,
  restoreDeletedClient,
} from "@/lib/deleted-clients";

function dashboardPathForRole(role: string, tab = "deleted-clients") {
  if (role === "ADMIN") return `/dashboard/admin?tab=${tab}`;
  if (role === "SUB_ADMIN") return `/dashboard/sub-admin?tab=${tab}`;
  if (role === "INTERNAL_STAFF") return `/dashboard/internal-staff?tab=${tab}`;
  return "/dashboard";
}

async function assertAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session;
}

async function assertTeamMember() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }
  return session;
}

export async function restoreDeletedClientAction(formData: FormData) {
  const session = await assertTeamMember();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const returnPath = String(
    formData.get("returnPath") ?? dashboardPathForRole(session.user.role),
  );
  if (!studentId) redirect(returnPath);

  await restoreDeletedClient(studentId, session.user.id);

  for (const path of revalidateDeletedClientPaths(studentId)) {
    revalidatePath(path);
  }
  const separator = returnPath.includes("?") ? "&" : "?";
  redirect(`${returnPath}${separator}restored=1`);
}

export async function permanentDeleteDeletedClientAction(formData: FormData) {
  await assertAdmin();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const returnPath = String(formData.get("returnPath") ?? dashboardPathForRole("ADMIN"));
  if (!studentId) redirect(returnPath);

  await permanentDeleteClient(studentId);

  for (const path of revalidateDeletedClientPaths()) {
    revalidatePath(path);
  }
  redirect(returnPath);
}
