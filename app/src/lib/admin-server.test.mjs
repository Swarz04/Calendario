import assert from "node:assert/strict";
import test from "node:test";

process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
process.env.GOOGLE_CALENDAR_ID = "test-calendar-id";
process.env.ADMIN_PASSWORD_HASH = "scrypt$00$" + "00".repeat(64);
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-with-at-least-32-characters";

const [{ adminGuard, mutationOriginIsValid }, { NextRequest }] = await Promise.all([
  import("./admin-server.ts"),
  import("next/server.js"),
]);

test("l’endpoint admin rifiuta una richiesta senza sessione valida", () => {
  const request = new NextRequest("https://calendario.example/api/admin/requests");
  const response = adminGuard(request);
  assert.ok(response);
  assert.equal(response.status, 401);
});

test("le mutazioni admin rifiutano Origin esterni", () => {
  const request = new NextRequest("https://calendario.example/api/admin/requests", {
    method: "POST",
    headers: { origin: "https://attacker.example", host: "calendario.example", "x-forwarded-proto": "https" },
  });
  assert.equal(mutationOriginIsValid(request), false);
});
