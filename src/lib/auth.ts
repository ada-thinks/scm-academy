import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role, SessionUser } from "./types";
import { prisma } from "./prisma";

const COOKIE = "scm_session";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");
}

export async function signSession(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
}

export async function readSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      name: String(payload.name),
      username: String(payload.username),
      role: payload.role as Role,
      xp: Number(payload.xp || 0),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function requireUser() {
  const session = await readSession();
  if (!session) return null;
  const fresh = await prisma.user.findUnique({ where: { id: session.id } });
  if (!fresh) return null;
  return {
    id: fresh.id,
    name: fresh.name,
    username: fresh.username,
    role: fresh.role as Role,
    xp: fresh.xp,
  } satisfies SessionUser;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") return null;
  return user;
}
