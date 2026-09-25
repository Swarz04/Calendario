import { NextRequest, NextResponse } from "next/server.js";
import {
  adminCookieName,
  adminIsConfigured,
  adminSessionMaxAge,
  createAdminToken,
  requestOriginAllowed,
  verifyAdminToken,
} from "./admin-auth.ts";
import { googleEnabled } from "./google-calendar.ts";

const attempts = new Map<string, { count: number; resetAt: number }>();
const loginWindow = 15 * 60_000;
const maxAttempts = 5;

export function runtimeReady() {
  return googleEnabled && adminIsConfigured();
}

export function requestIp(request: NextRequest) {
  return request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export function loginAllowed(ip: string, now = Date.now()) {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 0, resetAt: now + loginWindow });
    return true;
  }
  return current.count < maxAttempts;
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + loginWindow });
  else current.count += 1;
}

export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}

export function expectedOrigin(request: NextRequest) {
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return `${protocol}://${host}`;
}

export function mutationOriginIsValid(request: NextRequest) {
  return requestOriginAllowed(request.headers.get("origin"), expectedOrigin(request));
}

export function adminIsAuthenticated(request: NextRequest) {
  return verifyAdminToken(
    request.cookies.get(adminCookieName)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
}

export function adminGuard(request: NextRequest, mutation = false) {
  if (!runtimeReady()) return NextResponse.json({ error: "Pannello admin non configurato" }, { status: 503 });
  if (mutation && !mutationOriginIsValid(request)) {
    return NextResponse.json({ error: "Origine richiesta non valida" }, { status: 403 });
  }
  if (!adminIsAuthenticated(request)) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  return null;
}

export function setAdminCookie(response: NextResponse) {
  response.cookies.set({
    name: adminCookieName,
    value: createAdminToken(process.env.ADMIN_SESSION_SECRET!),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionMaxAge,
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set({
    name: adminCookieName,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
