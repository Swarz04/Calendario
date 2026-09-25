import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";

import {
  adminIsConfigured,
  createAdminToken,
  requestOriginAllowed,
  verifyAdminPassword,
  verifyAdminToken,
} from "./admin-auth.ts";
import { requestIp } from "./admin-server.ts";

const secret = "test-only-admin-session-secret-32-characters";

test("sessione admin valida, scaduta e manipolata", () => {
  const now = Date.parse("2026-09-14T10:00:00Z");
  const token = createAdminToken(secret, now);
  assert.equal(verifyAdminToken(token, secret, now + 1_000), true);
  assert.equal(verifyAdminToken(token, secret, now + 8 * 60 * 60_000 + 1), false);
  assert.equal(verifyAdminToken(`${token}x`, secret, now + 1_000), false);
  assert.equal(verifyAdminToken(token, "different-test-session-secret-32-characters", now + 1_000), false);
});

test("password scrypt accetta il valore corretto e rifiuta gli altri", async () => {
  const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const hash = scryptSync("password-di-test", salt, 64).toString("hex");
  const encoded = `scrypt$${salt.toString("hex")}$${hash}`;
  assert.equal(await verifyAdminPassword("password-di-test", encoded), true);
  assert.equal(await verifyAdminPassword("password-errata", encoded), false);
  assert.equal(await verifyAdminPassword("password-di-test", "formato-non-valido"), false);
});

test("configurazione e controllo Origin sono fail-closed", () => {
  assert.equal(adminIsConfigured({ ADMIN_PASSWORD_HASH: "hash", ADMIN_SESSION_SECRET: secret }), true);
  assert.equal(adminIsConfigured({ ADMIN_PASSWORD_HASH: "hash", ADMIN_SESSION_SECRET: "short" }), false);
  assert.equal(requestOriginAllowed("https://calendario.swarz.it", "https://calendario.swarz.it/admin"), true);
  assert.equal(requestOriginAllowed("https://attacker.example", "https://calendario.swarz.it"), false);
  assert.equal(requestOriginAllowed(null, "https://calendario.swarz.it"), false);
});

test("il rate limit admin preferisce X-Real-IP normalizzato da Nginx", () => {
  const request = { headers: new Headers({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "99.99.99.99" }) };
  assert.equal(requestIp(request), "10.0.0.1");
});

test("il rate limit admin mantiene il fallback senza X-Real-IP", () => {
  const request = { headers: new Headers({ "x-forwarded-for": "99.99.99.99, 10.0.0.1" }) };
  assert.equal(requestIp(request), "99.99.99.99");
});
