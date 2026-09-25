import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const sessionHours = 8;

export const adminCookieName = "calendario_admin_session";

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string, secret: string) {
  return encode(createHmac("sha256", secret).update(payload).digest());
}

export function adminIsConfigured(environment = process.env) {
  return Boolean(
    environment.ADMIN_PASSWORD_HASH
    && environment.ADMIN_SESSION_SECRET
    && environment.ADMIN_SESSION_SECRET.length >= 32,
  );
}

export function createAdminToken(secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("Secret admin non configurato");
  const payload = encode(JSON.stringify({ sub: "admin", exp: now + sessionHours * 60 * 60_000 }));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyAdminToken(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    return data.sub === "admin" && typeof data.exp === "number" && data.exp > now;
  } catch {
    return false;
  }
}

export async function verifyAdminPassword(password: string, encodedHash: string | undefined) {
  if (!encodedHash || password.length < 8 || password.length > 256) return false;
  const [algorithm, saltHex, hashHex, extra] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex || extra) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== 64) return false;
    const actual = await scrypt(password, Buffer.from(saltHex, "hex"), 64) as Buffer;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function requestOriginAllowed(origin: string | null, expectedOrigin: string) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export const adminSessionMaxAge = sessionHours * 60 * 60;
