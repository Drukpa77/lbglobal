"use client";

import * as React from "react";

type SidebarContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const value = React.useMemo(
    () => ({ mobileOpen, setMobileOpen }),
    [mobileOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}

export function Sidebar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={[
        "dashboard-sidebar hidden lg:flex lg:shrink-0 lg:flex-col",
        className,
      ].join(" ")}
    >
      {children}
    </aside>
  );
}

export function SidebarMobile({
  children,
  title = "Dashboard navigation",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { mobileOpen, setMobileOpen } = useSidebar();

  React.useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  if (!mobileOpen) return null;

  return (
    <div className="dashboard-sidebar-mobile lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close dashboard navigation"
        className="dashboard-sidebar-scrim"
        onClick={() => setMobileOpen(false)}
      />
      <aside className="dashboard-sidebar-mobile-panel">
        {children}
      </aside>
    </div>
  );
}

export function SidebarHeader({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-sidebar-header">{children}</div>;
}

export function SidebarContent({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-sidebar-content">{children}</div>;
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-sidebar-footer">{children}</div>;
}

export function SidebarMenu({ children }: { children: React.ReactNode }) {
  return <nav className="dashboard-sidebar-menu" aria-label="Dashboard sections">{children}</nav>;
}

export function SidebarMenuItem({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-sidebar-menu-item">{children}</div>;
}

export function SidebarTrigger({
  children,
  label,
  mobile = false,
}: {
  children: React.ReactNode;
  label: string;
  mobile?: boolean;
}) {
  const { setMobileOpen } = useSidebar();

  return (
    <button
      type="button"
      aria-label={label}
      className="dashboard-sidebar-trigger"
      onClick={() => {
        if (mobile) {
          setMobileOpen(true);
        }
      }}
    >
      {children}
    </button>
  );
}
