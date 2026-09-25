import assert from "node:assert/strict";
import test from "node:test";

import { eventProperties, toPublicCalendarEvent } from "./calendar-events.ts";
import {
  createBooking,
  createManagedEvent,
  deleteManagedEvent,
  listAdminEvents,
  listCalendarEvents,
  listPendingRequests,
  resolveBookingRequest,
  updateManagedEvent,
} from "./google-calendar.ts";

const range = ["2030-01-01T00:00:00.000Z", "2031-01-01T00:00:00.000Z"];

test("ciclo create/update/delete degli eventi gestiti nello stub", async () => {
  const created = await createManagedEvent({ title: "Corso iniziale", kind: "lesson", date: "2030-02-04", startTime: "09:00", endTime: "10:00", visibility: "public", recurrence: "weekly", repeatUntil: "2030-02-18" });
  assert.equal(created.kind, "lesson");
  assert.deepEqual(created.recurrence, ["RRULE:FREQ=WEEKLY;COUNT=3"]);
  const [createdResource] = (await listCalendarEvents(...range)).filter((event) => event.id === created.id);
  assert.equal(createdResource.visibility, "public");
  const updated = await updateManagedEvent(created.id, { title: "Corso aggiornato", kind: "lesson", date: "2030-02-04", startTime: "10:00", endTime: "11:00", visibility: "private", recurrence: "none", repeatUntil: "" });
  assert.equal(updated.title, "Corso aggiornato");
  assert.equal(updated.visibility, "private");
  const [updatedResource] = (await listCalendarEvents(...range)).filter((event) => event.id === created.id);
  assert.equal(updatedResource.visibility, "private");
  await deleteManagedEvent(created.id);
  assert.equal((await listAdminEvents(...range)).some((event) => event.id === created.id), false);
});

test("richiesta pending viene redatta, accettata o rifiutata", async () => {
  const firstStart = "2030-03-04T09:00:00.000Z";
  await createBooking({ name: "Persona Privata", email: "persona@example.com", reason: "Motivo riservato", start: firstStart, end: "2030-03-04T10:00:00.000Z" });
  const [pending] = (await listPendingRequests(...range)).filter((event) => event.start === firstStart);
  assert.ok(pending);
  assert.equal(pending.requestStatus, "pending");
  assert.equal(toPublicCalendarEvent({
    summary: pending.title,
    description: pending.description,
    start: { dateTime: pending.start },
    end: { dateTime: pending.end },
    extendedProperties: { private: {
      [eventProperties.kind]: "request",
      [eventProperties.requestName]: pending.requestName,
      [eventProperties.requestEmail]: pending.requestEmail,
    } },
  })?.title, "Occupato");
  await resolveBookingRequest(pending.id, "accept");
  assert.equal((await listPendingRequests(...range)).some((event) => event.id === pending.id), false);

  const secondStart = "2030-03-05T09:00:00.000Z";
  await createBooking({ name: "Altra Persona", email: "altra@example.com", reason: "Altro motivo", start: secondStart, end: "2030-03-05T10:00:00.000Z" });
  const [toReject] = (await listPendingRequests(...range)).filter((event) => event.start === secondStart);
  await resolveBookingRequest(toReject.id, "reject");
  assert.equal((await listPendingRequests(...range)).some((event) => event.id === toReject.id), false);
});
