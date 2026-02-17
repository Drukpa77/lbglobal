export const roleDashboardPath = {
  USER: "/dashboard/student",
  SUB_ADMIN: "/dashboard/sub-admin",
  ADMIN: "/dashboard/admin",
} as const;

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
