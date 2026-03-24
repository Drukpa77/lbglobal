import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

import { auth } from "@/auth";
import { getDashboardPath } from "@/lib/roles";

export default auth((req: NextAuthRequest) => {
  const isLoggedIn = Boolean(req.auth?.user);
  const pathname = req.nextUrl.pathname;
  const role = req.auth?.user?.role;

  if (pathname.startsWith("/dashboard") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname === "/login" && isLoggedIn && role !== "USER") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  if (pathname.startsWith("/dashboard") && role === "USER") {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname.startsWith("/dashboard/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
  }

  if (pathname.startsWith("/dashboard/sub-admin")) {
    if (role !== "ADMIN" && role !== "SUB_ADMIN") {
      return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  if (pathname.startsWith("/dashboard/students")) {
    if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
      return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  if (pathname.startsWith("/dashboard/posts")) {
    if (role !== "ADMIN" && role !== "SUB_ADMIN") {
      return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  if (pathname.startsWith("/dashboard/internal-staff")) {
    if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
      return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  if (pathname.startsWith("/dashboard/communication")) {
    if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
      return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
    }
  }

  const isStudentSelfDashboard =
    pathname === "/dashboard/student" || pathname.startsWith("/dashboard/student/");

  if (isStudentSelfDashboard) {
    return NextResponse.redirect(new URL(getDashboardPath(role), req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
