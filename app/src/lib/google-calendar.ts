import { google } from "googleapis";
import { bookingConfig, slotEnd } from "./booking.ts";
import {
  eventProperties,
  managedEventTimes,
  type CalendarEventLike,
  type ManagedEventInput,
  parseManagedEventInput,
  toAdminEvent,
  weeklyRecurrence,
} from "./calendar-events.ts";

type StubEvent = CalendarEventLike & { id: string };
const state = globalThis as typeof globalThis & {
  __calendarStubBookings?: Set<string>;
  __calendarStubEvents?: Map<string, StubEvent>;
};
const stubBookings = state.__calendarStubBookings ??= new Set<string>();
const stubEvents = state.__calendarStubEvents ??= new Map<string, StubEvent>();

const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CALENDAR_ID"] as const;
export const googleEnabled = required.every((key) => Boolean(process.env[key]));

function ensureWritableMode() {
  if (!googleEnabled && process.env.NODE_ENV === "production") {
    throw new Error("Google Calendar non configurato");
  }
}

function client() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID!;
}

function stubId() {
  return `stub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function busyRanges(timeMin: string, timeMax: string) {
  if (!googleEnabled) {
    const legacy = [...stubBookings].map((start) => ({ start, end: slotEnd(start) }));
    const events = [...stubEvents.values()].flatMap((event) => {
      const start = event.start?.dateTime;
      const end = event.end?.dateTime;
      return start && end && start < timeMax && end > timeMin ? [{ start, end }] : [];
    });
    return [...legacy, ...events];
  }

  const response = await client().freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: bookingConfig.timeZone,
      items: [{ id: calendarId() }],
    },
  });
  return response.data.calendars?.[calendarId()]?.busy ?? [];
}

export async function listCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEventLike[]> {
  if (!googleEnabled) {
    return [...stubEvents.values()].filter((event) => {
      const start = event.start?.dateTime || event.start?.date || "";
      const end = event.end?.dateTime || event.end?.date || "";
      return start < timeMax && end > timeMin;
    });
  }
  const response = await client().events.list({
    calendarId: calendarId(),
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 500,
  });
  return response.data.items ?? [];
}

export async function createBooking(input: { name: string; email: string; reason: string; start: string; end: string }) {
  ensureWritableMode();
  const privateData = {
    [eventProperties.source]: "calendario-swarz",
    [eventProperties.kind]: "request",
    [eventProperties.visibility]: "private",
    [eventProperties.requestStatus]: "pending",
    [eventProperties.requestName]: input.name,
    [eventProperties.requestEmail]: input.email,
  };

  if (!googleEnabled) {
    const id = stubId();
    stubEvents.set(id, {
      id,
      summary: "Richiesta di colloquio",
      description: input.reason,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      extendedProperties: { private: privateData },
    });
    stubBookings.add(input.start);
    return { mode: "stub" as const, status: "pending" as const };
  }

  await client().events.insert({
    calendarId: calendarId(),
    sendUpdates: "none",
    requestBody: {
      summary: "Richiesta di colloquio",
      description: input.reason,
      transparency: "opaque",
      visibility: "private",
      start: { dateTime: input.start, timeZone: bookingConfig.timeZone },
      end: { dateTime: input.end, timeZone: bookingConfig.timeZone },
      extendedProperties: { private: privateData },
    },
  });
  return { mode: "google" as const, status: "pending" as const };
}

export async function listAdminEvents(_timeMin: string, _timeMax: string) {
  if (!googleEnabled) return [...stubEvents.values()].map(toAdminEvent);
  const response = await client().events.list({
    calendarId: calendarId(),
    singleEvents: false,
    orderBy: "updated",
    maxResults: 2500,
  });
  return (response.data.items ?? []).filter((event) => event.status !== "cancelled").map(toAdminEvent);
}

export async function listPendingRequests(timeMin: string, timeMax: string) {
  const events = await listAdminEvents(timeMin, timeMax);
  return events.filter((event) => event.kind === "request" && event.requestStatus === "pending");
}

function eventResource(input: ManagedEventInput) {
  const times = managedEventTimes(input);
  return {
    summary: input.title,
    transparency: "opaque",
    visibility: input.visibility,
    start: { dateTime: times.start, timeZone: bookingConfig.timeZone },
    end: { dateTime: times.end, timeZone: bookingConfig.timeZone },
    recurrence: weeklyRecurrence(input),
    extendedProperties: {
      private: {
        [eventProperties.source]: "calendario-swarz",
        [eventProperties.kind]: input.kind,
        [eventProperties.visibility]: input.visibility,
      },
    },
  };
}

export async function createManagedEvent(value: unknown) {
  ensureWritableMode();
  const input = parseManagedEventInput(value);
  const resource = eventResource(input);
  if (!googleEnabled) {
    const id = stubId();
    stubEvents.set(id, { id, ...resource });
    return toAdminEvent(stubEvents.get(id)!);
  }
  const response = await client().events.insert({
    calendarId: calendarId(),
    sendUpdates: "none",
    requestBody: resource,
  });
  return toAdminEvent(response.data);
}

export async function updateManagedEvent(id: string, value: unknown) {
  ensureWritableMode();
  const input = parseManagedEventInput(value);
  const resource = eventResource(input);
  if (!googleEnabled) {
    const existing = stubEvents.get(id);
    if (!existing || existing.extendedProperties?.private?.[eventProperties.kind] === "request") {
      throw new Error("Evento non modificabile");
    }
    stubEvents.set(id, { id, ...resource });
    return toAdminEvent(stubEvents.get(id)!);
  }
  const existing = await client().events.get({ calendarId: calendarId(), eventId: id });
  if (existing.data.extendedProperties?.private?.[eventProperties.kind] === "request") {
    throw new Error("Evento non modificabile");
  }
  const response = await client().events.update({
    calendarId: calendarId(),
    eventId: id,
    sendUpdates: "none",
    requestBody: resource,
  });
  return toAdminEvent(response.data);
}

export async function deleteManagedEvent(id: string) {
  ensureWritableMode();
  if (!googleEnabled) {
    const existing = stubEvents.get(id);
    if (!existing || existing.extendedProperties?.private?.[eventProperties.kind] === "request") {
      throw new Error("Evento non eliminabile");
    }
    stubEvents.delete(id);
    return;
  }
  const existing = await client().events.get({ calendarId: calendarId(), eventId: id });
  if (existing.data.extendedProperties?.private?.[eventProperties.kind] === "request") {
    throw new Error("Evento non eliminabile");
  }
  await client().events.delete({ calendarId: calendarId(), eventId: id, sendUpdates: "none" });
}

export async function resolveBookingRequest(id: string, action: "accept" | "reject") {
  ensureWritableMode();
  if (!googleEnabled) {
    const event = stubEvents.get(id);
    const properties = event?.extendedProperties?.private;
    if (!event || properties?.[eventProperties.kind] !== "request" || properties[eventProperties.requestStatus] !== "pending") {
      throw new Error("Richiesta non disponibile");
    }
    if (action === "reject") {
      stubEvents.delete(id);
      if (event.start?.dateTime) stubBookings.delete(event.start.dateTime);
      return { action };
    }
    properties[eventProperties.requestStatus] = "accepted";
    event.summary = `Colloquio con ${properties[eventProperties.requestName]}`;
    return { action };
  }

  const api = client();
  const response = await api.events.get({ calendarId: calendarId(), eventId: id });
  const event = response.data;
  const properties = event.extendedProperties?.private;
  if (properties?.[eventProperties.kind] !== "request" || properties[eventProperties.requestStatus] !== "pending") {
    throw new Error("Richiesta non disponibile");
  }
  if (action === "reject") {
    await api.events.delete({ calendarId: calendarId(), eventId: id, sendUpdates: "none" });
    return { action };
  }

  const name = properties[eventProperties.requestName];
  const email = properties[eventProperties.requestEmail];
  if (!name || !email) throw new Error("Dati richiesta incompleti");
  await api.events.patch({
    calendarId: calendarId(),
    eventId: id,
    sendUpdates: "all",
    requestBody: {
      summary: `Colloquio con ${name}`,
      attendees: [{ email, displayName: name }],
      extendedProperties: {
        private: { ...properties, [eventProperties.requestStatus]: "accepted" },
      },
    },
  });
  return { action };
}
