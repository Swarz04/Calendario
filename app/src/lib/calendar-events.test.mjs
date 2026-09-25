import assert from "node:assert/strict";
import test from "node:test";

import {
  eventProperties,
  managedEventTimes,
  parseManagedEventInput,
  toPublicCalendarEvent,
  weeklyRecurrence,
} from "./calendar-events.ts";
import { addDays, calendarRange } from "./date-range.ts";

const timedEvent = {
  id: "google-private-id",
  summary: "Lezione TypeScript",
  visibility: "public",
  description: "Descrizione non pubblica con link https://meet.google.com/secret",
  location: "Indirizzo privato",
  attendees: [{ email: "persona@example.com", displayName: "Persona privata" }],
  start: { dateTime: "2026-09-21T08:00:00.000Z" },
  end: { dateTime: "2026-09-21T09:00:00.000Z" },
  extendedProperties: { private: { [eventProperties.kind]: "lesson", [eventProperties.visibility]: "public" } },
};

test("pubblica soltanto titolo, categoria e orario autorizzati", () => {
  const result = toPublicCalendarEvent(timedEvent);
  assert.deepEqual(result, {
    date: "2026-09-21",
    start: "2026-09-21T08:00:00.000Z",
    end: "2026-09-21T09:00:00.000Z",
    timeLabel: "10:00–11:00",
    title: "Lezione TypeScript",
    kind: "lesson",
    allDay: false,
  });
  const serialized = JSON.stringify(result);
  for (const secret of ["google-private-id", "persona@example.com", "Persona privata", "meet.google.com", "Indirizzo privato"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("redige richieste, eventi private, confidential e senza visibility", () => {
  const request = structuredClone(timedEvent);
  request.summary = "Colloquio con Mario Rossi";
  request.extendedProperties.private[eventProperties.kind] = "request";
  request.extendedProperties.private[eventProperties.requestName] = "Mario Rossi";
  request.extendedProperties.private[eventProperties.requestEmail] = "mario@example.com";
  assert.deepEqual(toPublicCalendarEvent(request), {
    date: "2026-09-21",
    start: request.start.dateTime,
    end: request.end.dateTime,
    timeLabel: "10:00–11:00",
    title: "Occupato",
    kind: "busy",
    allDay: false,
  });
  for (const visibility of ["private", "confidential", undefined]) {
    const result = toPublicCalendarEvent({ ...timedEvent, visibility });
    assert.equal(result?.title, "Occupato");
    assert.equal(result?.kind, "busy");
    const serialized = JSON.stringify(result);
    for (const privateValue of ["Lezione TypeScript", "persona@example.com", "meet.google.com", "Indirizzo privato"]) {
      assert.equal(serialized.includes(privateValue), false);
    }
  }
});

test("ignora eventi cancellati e gestisce eventi giornalieri", () => {
  assert.equal(toPublicCalendarEvent({ ...timedEvent, status: "cancelled" }), null);
  const allDay = toPublicCalendarEvent({ summary: "Workshop", start: { date: "2026-09-21" }, end: { date: "2026-09-22" } });
  assert.equal(allDay?.date, "2026-09-21");
  assert.equal(allDay?.timeLabel, "Tutto il giorno");
});

test("valida eventi e crea ricorrenze settimanali limitate", () => {
  const input = parseManagedEventInput({
    title: " Corso   React ", kind: "lesson", date: "2026-09-21", startTime: "09:30", endTime: "11:00",
    visibility: "public", recurrence: "weekly", repeatUntil: "2026-10-19",
  });
  assert.equal(input.title, "Corso React");
  assert.deepEqual(weeklyRecurrence(input), ["RRULE:FREQ=WEEKLY;COUNT=5"]);
  assert.deepEqual(managedEventTimes(input), { start: "2026-09-21T07:30:00.000Z", end: "2026-09-21T09:00:00.000Z" });
  assert.throws(() => parseManagedEventInput({ ...input, endTime: "09:00" }), /orario/);
  assert.throws(() => parseManagedEventInput({ ...input, repeatUntil: "2028-01-01" }), /un anno/);
});

test("limita gli intervalli pubblici a 31 giorni e rispetta DST", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.deepEqual(calendarRange("2026-03-01", "2026-03-30"), {
    from: "2026-03-01",
    to: "2026-03-30",
    timeMin: "2026-02-28T23:00:00.000Z",
    timeMax: "2026-03-30T22:00:00.000Z",
  });
  assert.throws(() => calendarRange("2026-03-01", "2026-04-01"), /ampio/);
});
