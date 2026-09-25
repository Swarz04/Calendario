import { bookingConfig, isCalendarDate, localDateTimeToUtc } from "./booking.ts";

export const eventProperties = Object.freeze({
  source: "swarzSource",
  kind: "swarzKind",
  visibility: "swarzVisibility",
  requestStatus: "swarzRequestStatus",
  requestName: "swarzRequestName",
  requestEmail: "swarzRequestEmail",
});

export type EventKind = "lesson" | "meeting" | "event" | "busy";

export type CalendarEventLike = {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  description?: string | null;
  visibility?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
  recurrence?: string[] | null;
  attendees?: Array<{ email?: string | null; displayName?: string | null }> | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
};

export type PublicCalendarEvent = {
  date: string;
  start: string;
  end: string;
  timeLabel: string;
  title: string;
  kind: EventKind;
  allDay: boolean;
};

export type ManagedEventInput = {
  title: string;
  kind: "lesson" | "meeting";
  date: string;
  startTime: string;
  endTime: string;
  visibility: "public" | "private";
  recurrence: "none" | "weekly";
  repeatUntil: string;
};

function privateProperties(event: CalendarEventLike) {
  return event.extendedProperties?.private ?? {};
}

function cleanTitle(value: string | null | undefined) {
  const title = value?.replace(/\s+/g, " ").trim().slice(0, 120);
  return title || "Impegno";
}

function eventDate(value: string, allDay: boolean, timeZone: string) {
  if (allDay) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function eventTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function toPublicCalendarEvent(
  event: CalendarEventLike,
  timeZone = bookingConfig.timeZone,
): PublicCalendarEvent | null {
  if (event.status === "cancelled") return null;
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start || !end) return null;

  const properties = privateProperties(event);
  const request = properties[eventProperties.kind] === "request";
  const redacted = request || event.visibility !== "public";
  const managedKind = properties[eventProperties.kind];
  const kind: EventKind = redacted
    ? "busy"
    : managedKind === "lesson" || managedKind === "meeting"
      ? managedKind
      : "event";
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  return {
    date: eventDate(start, allDay, timeZone),
    start,
    end,
    timeLabel: allDay ? "Tutto il giorno" : `${eventTime(start, timeZone)}–${eventTime(end, timeZone)}`,
    title: redacted ? "Occupato" : cleanTitle(event.summary),
    kind,
    allDay,
  };
}

export function toAdminEvent(event: CalendarEventLike) {
  const properties = privateProperties(event);
  const start = event.start?.dateTime || event.start?.date || "";
  const end = event.end?.dateTime || event.end?.date || "";
  return {
    id: event.id || "",
    title: cleanTitle(event.summary),
    description: event.description || "",
    start,
    end,
    kind: properties[eventProperties.kind] || "event",
    visibility: properties[eventProperties.visibility] || (event.visibility === "private" ? "private" : "public"),
    requestStatus: properties[eventProperties.requestStatus] || "",
    requestName: properties[eventProperties.requestName] || "",
    requestEmail: properties[eventProperties.requestEmail] || "",
    recurrence: event.recurrence || [],
  };
}

function isTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseManagedEventInput(value: unknown): ManagedEventInput {
  if (!value || typeof value !== "object") throw new Error("Dati evento non validi");
  const data = value as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.replace(/\s+/g, " ").trim() : "";
  const kind = data.kind;
  const date = typeof data.date === "string" ? data.date : "";
  const startTime = typeof data.startTime === "string" ? data.startTime : "";
  const endTime = typeof data.endTime === "string" ? data.endTime : "";
  const visibility = data.visibility;
  const recurrence = data.recurrence;
  const repeatUntil = typeof data.repeatUntil === "string" ? data.repeatUntil : "";

  if (title.length < 2 || title.length > 120) throw new Error("Titolo non valido");
  if (kind !== "lesson" && kind !== "meeting") throw new Error("Categoria non valida");
  if (!isCalendarDate(date) || !isTime(startTime) || !isTime(endTime) || endTime <= startTime) {
    throw new Error("Data o orario non validi");
  }
  if (visibility !== "public" && visibility !== "private") throw new Error("Visibilità non valida");
  if (recurrence !== "none" && recurrence !== "weekly") throw new Error("Ricorrenza non valida");
  if (recurrence === "weekly") {
    if (!isCalendarDate(repeatUntil) || repeatUntil < date) throw new Error("Fine ricorrenza non valida");
    const days = (Date.parse(`${repeatUntil}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000;
    if (days > 366) throw new Error("La ricorrenza non può superare un anno");
  }

  return { title, kind, date, startTime, endTime, visibility, recurrence, repeatUntil };
}

export function weeklyRecurrence(input: ManagedEventInput) {
  if (input.recurrence !== "weekly") return [];
  const days = Math.floor(
    (Date.parse(`${input.repeatUntil}T12:00:00Z`) - Date.parse(`${input.date}T12:00:00Z`)) / 86_400_000,
  );
  const count = Math.floor(days / 7) + 1;
  return [`RRULE:FREQ=WEEKLY;COUNT=${count}`];
}

export function managedEventTimes(input: ManagedEventInput, timeZone = bookingConfig.timeZone) {
  const start = localDateTimeToUtc(input.date, input.startTime, timeZone);
  const end = localDateTimeToUtc(input.date, input.endTime, timeZone);
  if (end <= start) throw new Error("Intervallo non valido");
  return { start: start.toISOString(), end: end.toISOString() };
}
