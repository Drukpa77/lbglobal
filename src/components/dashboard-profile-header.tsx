function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

type DashboardProfileHeaderProps = {
  name: string | null | undefined;
  email: string;
  roleLabel: string;
};

export function DashboardProfileHeader({ name, email, roleLabel }: DashboardProfileHeaderProps) {
  const displayName = name?.trim() || email;
  const initials = getInitials(displayName);

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-lg font-semibold text-rose-800"
        aria-hidden
      >
        {initials}
      </div>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold text-slate-900">{displayName}</h1>
        <p className="mt-0.5 truncate text-sm text-slate-600">
          {email}
          <span className="mx-2 text-slate-400">·</span>
          {roleLabel}
        </p>
      </div>
    </div>
  );
}
