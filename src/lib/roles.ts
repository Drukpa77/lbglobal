export const roleDashboardPath = {
  USER: "/dashboard/student",
  INTERNAL_STAFF: "/dashboard/internal-staff",
  SUB_ADMIN: "/dashboard/sub-admin",
  ADMIN: "/dashboard/admin",
} as const;

export const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  SUB_ADMIN: "Agent",
  INTERNAL_STAFF: "Case Manager",
  USER: "Applicant",
};

export type AppRole = keyof typeof roleDashboardPath;

export function getDashboardPath(role?: string | null) {
  if (!role) {
    return roleDashboardPath.USER;
  }

  if (role in roleDashboardPath) {
    return roleDashboardPath[role as AppRole];
  }

  return roleDashboardPath.USER;
}

export function getRoleLabel(role?: string | null) {
  if (!role) return "User";
  return roleLabel[role] ?? role;
}
