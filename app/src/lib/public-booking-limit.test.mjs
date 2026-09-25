import assert from "node:assert/strict";
import test from "node:test";

import { allowPublicBooking } from "./public-booking-limit.ts";

test("il rate limit richieste ammette cinque richieste per IP ogni quindici minuti", () => {
  const ip = "test-public-booking-rate-limit";
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(allowPublicBooking(ip, 1_000 + attempt), true);
  assert.equal(allowPublicBooking(ip, 2_000), false);
  assert.equal(allowPublicBooking(ip, 901_001), true);
});
