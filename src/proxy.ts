import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/", "/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("scm_session")?.value;
  let authed = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret"));
      authed = true;
    } catch {
      authed = false;
    }
  }

  const isPublic = PUBLIC.includes(pathname);
  if (!authed && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (authed && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
