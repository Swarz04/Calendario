import assert from "node:assert/strict";
import test from "node:test";

import { bookingConfig, dateBounds, isCalendarDate, localDateTimeToUtc, overlaps, slotEnd, slotsForDate } from "./booking.ts";

const config = (overrides = {}) => ({
  ...bookingConfig,
  timeZone: "Europe/Rome",
  maxDaysAhead: 365,
  minNoticeHours: 0,
  ...overrides,
});

test("Europe/Rome applica correttamente CET e CEST", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const cases = [
    ["2026-03-27", "2026-03-27T08:00:00.000Z"],
    ["2026-03-30", "2026-03-30T07:00:00.000Z"],
    ["2026-10-23", "2026-10-23T07:00:00.000Z"],
    ["2026-10-26", "2026-10-26T08:00:00.000Z"],
  ];
  for (const [date, expected] of cases) assert.equal(slotsForDate(date, now, config())[0].start, expected);
});

test("rifiuta date inesistenti e giorni non prenotabili", () => {
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.deepEqual(slotsForDate("2026-02-30", new Date("2026-01-01T00:00:00Z"), config()), []);
  assert.deepEqual(slotsForDate("2026-01-17", new Date("2026-01-01T00:00:00Z"), config()), []);
  assert.deepEqual(slotsForDate("2026-01-18", new Date("2026-01-01T00:00:00Z"), config()), []);
});

test("rispetta i limiti minimo e massimo", () => {
  const now = new Date("2026-01-15T06:00:00.000Z");
  const bounded = config({ maxDaysAhead: 2 });
  assert.deepEqual(dateBounds(now, bounded), { min: "2026-01-15", max: "2026-01-17" });
  assert.deepEqual(slotsForDate("2026-01-14", now, bounded), []);
  assert.notEqual(slotsForDate("2026-01-16", now, bounded).length, 0);
  assert.deepEqual(slotsForDate("2026-01-18", now, bounded), []);
});

test("applica BOOKING_MIN_NOTICE_HOURS", () => {
  const now = new Date("2026-01-15T07:00:00.000Z");
  const slots = slotsForDate("2026-01-15", now, config({ minNoticeHours: 2 }));
  assert.equal(slots[0].label, "11:00");
  assert.equal(slots[0].start, "2026-01-15T10:00:00.000Z");
});

test("legge durata e preavviso dalle variabili BOOKING", async () => {
  const previousMinutes = process.env.BOOKING_SLOT_MINUTES;
  const previousNotice = process.env.BOOKING_MIN_NOTICE_HOURS;
  process.env.BOOKING_SLOT_MINUTES = "45";
  process.env.BOOKING_MIN_NOTICE_HOURS = "2";
  try {
    const configured = await import(`./booking.ts?env-${Date.now()}`);
    assert.equal(configured.bookingConfig.slotMinutes, 45);
    assert.equal(configured.bookingConfig.minNoticeHours, 2);
    assert.equal(configured.slotEnd("2026-01-15T09:00:00.000Z"), "2026-01-15T09:45:00.000Z");
  } finally {
    if (previousMinutes === undefined) delete process.env.BOOKING_SLOT_MINUTES;
    else process.env.BOOKING_SLOT_MINUTES = previousMinutes;
    if (previousNotice === undefined) delete process.env.BOOKING_MIN_NOTICE_HOURS;
    else process.env.BOOKING_MIN_NOTICE_HOURS = previousNotice;
  }
});

test("usa la durata configurata per inizio, fine e stub", () => {
  const now = new Date("2026-01-15T06:00:00.000Z");
  const [slot] = slotsForDate("2026-01-15", now, config({ slotMinutes: 45 }));
  assert.equal(Date.parse(slot.end) - Date.parse(slot.start), 45 * 60_000);
  assert.equal(slotEnd(slot.start, 45), slot.end);
});

test("rileva collisioni lasciando liberi i bordi", () => {
  const slot = { start: "2026-01-15T09:00:00.000Z", end: "2026-01-15T10:00:00.000Z" };
  assert.equal(overlaps(slot.start, slot.end, [{ start: "2026-01-15T08:00:00.000Z", end: slot.start }]), false);
  assert.equal(overlaps(slot.start, slot.end, [{ start: slot.end, end: "2026-01-15T11:00:00.000Z" }]), false);
  assert.equal(overlaps(slot.start, slot.end, [{ start: "2026-01-15T08:59:59.999Z", end: "2026-01-15T09:00:00.001Z" }]), true);
  assert.equal(overlaps(slot.start, slot.end, [{ start: "2026-01-15T09:59:59.999Z", end: "2026-01-15T10:00:00.001Z" }]), true);
});

test("converte orari amministrativi preservando Europe/Rome e i passaggi DST", () => {
  assert.equal(localDateTimeToUtc("2026-03-27", "09:30", "Europe/Rome").toISOString(), "2026-03-27T08:30:00.000Z");
  assert.equal(localDateTimeToUtc("2026-03-30", "09:30", "Europe/Rome").toISOString(), "2026-03-30T07:30:00.000Z");
  assert.equal(localDateTimeToUtc("2026-10-23", "09:30", "Europe/Rome").toISOString(), "2026-10-23T07:30:00.000Z");
  assert.equal(localDateTimeToUtc("2026-10-26", "09:30", "Europe/Rome").toISOString(), "2026-10-26T08:30:00.000Z");
  assert.throws(() => localDateTimeToUtc("2026-03-29", "02:30", "Europe/Rome"), /non valida/);
});
