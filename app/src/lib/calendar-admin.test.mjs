import assert from "node:assert/strict";
import test from "node:test";

import { eventProperties, toPublicCalendarEvent } from "./calendar-events.ts";
import {
  BookingConflictError,
  busyRanges,
  createBooking,
  createManagedEvent,
  deleteManagedEvent,
  listAdminEvents,
  listCalendarEvents,
  listBookingRequests,
  migrateLegacyBookingRequests,
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

test("le richieste restano separate dagli eventi, si accettano idempotentemente e si rifiutano senza creare eventi", async () => {
  const firstStart = "2030-03-04T09:00:00.000Z";
  const eventsBefore = await listCalendarEvents(...range);
  const createdRequest = await createBooking({ name: "Persona Privata", email: "persona@example.com", topic: "Supporto tecnico", message: "Motivo riservato", start: firstStart, end: "2030-03-04T10:00:00.000Z" });
  assert.equal(createdRequest.status, "pending");
  assert.ok(createdRequest.id);
  const eventsAfterRequest = await listCalendarEvents(...range);
  assert.deepEqual(eventsAfterRequest.map((event) => event.id), eventsBefore.map((event) => event.id));
  const requestLists = await listBookingRequests();
  const [pending] = requestLists.pending.filter((event) => event.start === firstStart);
  assert.ok(pending);
  assert.equal(pending.requestStatus, "pending");
  assert.equal(pending.requestTopic, "Supporto tecnico");
  assert.equal(pending.requestMessage, "Motivo riservato");
  assert.equal(overlapsForTest(firstStart, "2030-03-04T10:00:00.000Z", await busyRanges(firstStart, "2030-03-04T10:00:00.000Z")), false);
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
  const accepted = await resolveBookingRequest(pending.id, "accept", "public");
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.event.title, "Incontro");
  assert.equal(accepted.event.visibility, "public");
  const [acceptedResource] = (await listCalendarEvents(...range)).filter((event) => event.id === accepted.event.id);
  assert.equal(acceptedResource.summary, "Incontro");
  assert.equal(acceptedResource.visibility, "public");
  assert.equal(acceptedResource.attendees?.[0]?.email, "persona@example.com");
  const publicAccepted = toPublicCalendarEvent(acceptedResource);
  assert.equal(publicAccepted?.title, "Incontro");
  for (const privateValue of ["persona@example.com", "Persona Privata", "Motivo riservato"]) {
    assert.equal(JSON.stringify(publicAccepted).includes(privateValue), false);
  }
  const retried = await resolveBookingRequest(pending.id, "accept", "public");
  assert.equal(retried.alreadyResolved, true);
  assert.equal(retried.event.id, accepted.event.id);
  assert.equal((await listCalendarEvents(...range)).filter((event) => event.id === accepted.event.id).length, 1);
  const acceptedState = await listBookingRequests();
  assert.equal(acceptedState.pending.some((event) => event.id === pending.id), false);
  assert.equal(acceptedState.history.find((event) => event.id === pending.id)?.requestStatus, "accepted");

  const secondStart = "2030-03-05T09:00:00.000Z";
  await createBooking({ name: "Altra Persona", email: "altra@example.com", topic: "Sito web", message: "Altro motivo", start: secondStart, end: "2030-03-05T10:00:00.000Z" });
  const [toReject] = (await listBookingRequests()).pending.filter((event) => event.start === secondStart);
  const beforeReject = await listCalendarEvents(...range);
  await resolveBookingRequest(toReject.id, "reject");
  assert.equal((await listBookingRequests()).pending.some((event) => event.id === toReject.id), false);
  assert.equal((await listBookingRequests()).history.find((event) => event.id === toReject.id)?.requestStatus, "rejected");
  assert.deepEqual((await listCalendarEvents(...range)).map((event) => event.id), beforeReject.map((event) => event.id));
  await assert.rejects(resolveBookingRequest(toReject.id, "reject"), /Richiesta non disponibile/);
});

function overlapsForTest(start, end, busy) {
  return busy.some((range) => Date.parse(start) < Date.parse(range.end) && Date.parse(end) > Date.parse(range.start));
}

test("l’accettazione fallisce se lo slot è stato occupato dopo la richiesta", async () => {
  const start = "2030-03-08T08:00:00.000Z";
  const end = "2030-03-08T09:00:00.000Z";
  const request = await createBooking({ name: "Richiedente", email: "r@example.com", topic: "Altro", message: "", start, end });
  const [pending] = (await listBookingRequests()).pending.filter((event) => event.id === request.id);
  const event = await createManagedEvent({ title: "Impegno esistente", kind: "meeting", date: "2030-03-08", startTime: "09:00", endTime: "10:00", visibility: "private", recurrence: "none", repeatUntil: "" });
  await assert.rejects(resolveBookingRequest(pending.id, "accept", "private"), BookingConflictError);
  assert.equal((await listBookingRequests()).pending.some((item) => item.id === pending.id), true);
  await deleteManagedEvent(event.id);
  await resolveBookingRequest(pending.id, "reject");
});

test("la migrazione legacy è idempotente e conserva il record in caso di retry", async () => {
  const legacyId = "legacy-pending-request";
  const state = globalThis.__calendarStubEvents;
  state.set(legacyId, {
    id: legacyId,
    summary: "Richiesta di colloquio",
    description: "Messaggio legacy",
    start: { dateTime: "2030-03-11T09:00:00.000Z" },
    end: { dateTime: "2030-03-11T10:00:00.000Z" },
    extendedProperties: { private: {
      [eventProperties.kind]: "request",
      [eventProperties.requestStatus]: "pending",
      [eventProperties.requestName]: "Persona legacy",
      [eventProperties.requestEmail]: "legacy@example.com",
      [eventProperties.requestTopic]: "Altro",
    } },
  });
  assert.deepEqual(await migrateLegacyBookingRequests(), { migrated: 1 });
  assert.deepEqual(await migrateLegacyBookingRequests(), { migrated: 0 });
  assert.equal(state.has(legacyId), false);
  const [migrated] = (await listBookingRequests()).pending.filter((item) => item.requestSourceEventId === legacyId);
  assert.ok(migrated);
});
