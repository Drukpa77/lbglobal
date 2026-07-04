"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  FileX2,
  FolderKanban,
  Home,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMobile,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type Tab = { id: string; label: string; count?: number };

type SidebarProfile = {
  name: string | null | undefined;
  email: string;
  roleLabel: string;
};

export function DashboardTabBar({
  tabs,
  activeTab,
  profile,
}: {
  tabs: Tab[];
  activeTab: string;
  profile: SidebarProfile;
}) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <div className="dashboard-sidebar-root">
        <div className="dashboard-mobile-nav lg:hidden">
          <SidebarTrigger label="Open dashboard navigation" mobile>
            <Menu aria-hidden="true" />
            <span>Sections</span>
          </SidebarTrigger>
          <p className="truncate text-sm font-medium text-slate-700">
            {tabs.find((tab) => tab.id === activeTab)?.label ?? "Dashboard"}
          </p>
        </div>

        <Sidebar>
          <DashboardSidebarContent tabs={tabs} activeTab={activeTab} pathname={pathname} profile={profile} />
        </Sidebar>

        <SidebarMobile>
          <DashboardSidebarContent tabs={tabs} activeTab={activeTab} pathname={pathname} profile={profile} mobile />
        </SidebarMobile>
      </div>
    </SidebarProvider>
  );
}

function DashboardSidebarContent({
  tabs,
  activeTab,
  pathname,
  profile,
  mobile = false,
}: {
  tabs: Tab[];
  activeTab: string;
  pathname: string;
  profile: SidebarProfile;
  mobile?: boolean;
}) {
  const { setMobileOpen } = useSidebar();

  return (
    <>
      <SidebarHeader>
        <SidebarProfileBlock profile={profile} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {tabs.map(({ id, label, count }) => {
            const isActive = activeTab === id;
            const Icon = iconForTab(id, label);

            return (
              <SidebarMenuItem key={id}>
                <Link
                  href={`${pathname}?tab=${id}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={count !== undefined ? `${label}, ${count}` : label}
                  className={`dashboard-sidebar-link ${isActive ? "is-active" : ""}`}
                  onClick={() => mobile && setMobileOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span className="dashboard-sidebar-label">{label}</span>
                  {count !== undefined && (
                    <span className="dashboard-sidebar-count" aria-hidden="true">
                      {count}
                    </span>
                  )}
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <Link
          href="/dashboard"
          className="dashboard-sidebar-link"
          onClick={() => mobile && setMobileOpen(false)}
        >
          <Home aria-hidden="true" />
          <span className="dashboard-sidebar-label">My Dashboard</span>
        </Link>
        {mobile && (
          <button
            type="button"
            className="dashboard-sidebar-close"
            onClick={() => setMobileOpen(false)}
          >
            Close
          </button>
        )}
      </SidebarFooter>
    </>
  );
}

function SidebarProfileBlock({ profile }: { profile: SidebarProfile }) {
  const displayName = profile.name?.trim() || profile.email;
  const initials = getInitials(displayName);

  return (
    <div className="dashboard-sidebar-profile">
      <div className="dashboard-sidebar-avatar" aria-hidden="true">
        {initials}
      </div>
      <div className="dashboard-sidebar-profile-text">
        <p>{displayName}</p>
        <span>{profile.email}</span>
        <strong>{profile.roleLabel}</strong>
      </div>
    </div>
  );
}

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function iconForTab(id: string, label: string) {
  const normalized = `${id} ${label}`.toLowerCase();
  if (normalized.includes("overview")) return LayoutDashboard;
  if (normalized.includes("analytics")) return BarChart3;
  if (normalized.includes("visa")) return ShieldCheck;
  if (normalized.includes("task") || normalized.includes("docs")) return ClipboardList;
  if (normalized.includes("team") || normalized.includes("staff")) return Users;
  if (normalized.includes("contribution")) return Trophy;
  if (normalized.includes("deleted")) return FileX2;
  if (normalized.includes("client") || normalized.includes("case") || normalized.includes("queue")) return FolderKanban;
  return BriefcaseBusiness;
}
