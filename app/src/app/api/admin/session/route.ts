import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-auth";
import {
  adminIsAuthenticated,
  clearAdminCookie,
  clearLoginFailures,
  loginAllowed,
  mutationOriginIsValid,
  recordLoginFailure,
  requestIp,
  runtimeReady,
  setAdminCookie,
} from "@/lib/admin-server";

export async function GET(request: NextRequest) {
  return NextResponse.json({ configured: runtimeReady(), authenticated: runtimeReady() && adminIsAuthenticated(request) });
}

export async function POST(request: NextRequest) {
  if (!runtimeReady()) return NextResponse.json({ error: "Pannello admin non configurato" }, { status: 503 });
  if (!mutationOriginIsValid(request)) return NextResponse.json({ error: "Origine richiesta non valida" }, { status: 403 });
  const ip = requestIp(request);
  if (!loginAllowed(ip)) return NextResponse.json({ error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const username = typeof data.username === "string" ? data.username : "";
  const password = typeof data.password === "string" ? data.password : "";
  const valid = username === "admin" && await verifyAdminPassword(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) {
    recordLoginFailure(ip);
    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }
  clearLoginFailures(ip);
  const response = NextResponse.json({ ok: true });
  setAdminCookie(response);
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!mutationOriginIsValid(request)) return NextResponse.json({ error: "Origine richiesta non valida" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  return response;
}
