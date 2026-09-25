import { createHash } from "node:crypto";
import { google } from "googleapis";
import { bookingConfig, overlaps } from "./booking.ts";
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
  __calendarStubEvents?: Map<string, StubEvent>;
  __calendarStubRequests?: Map<string, StubEvent>;
};
const stubEvents = state.__calendarStubEvents ??= new Map<string, StubEvent>();
const stubRequests = state.__calendarStubRequests ??= new Map<string, StubEvent>();
const requestLocks = state as typeof state & { __calendarRequestLocks?: Set<string> };
const lockedRequests = requestLocks.__calendarRequestLocks ??= new Set<string>();
const resolvedRequestRetentionMs = 90 * 24 * 60 * 60_000;

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

export async function googleCalendarAccessStatus() {
  if (!googleEnabled) return { primary: false, requests: false };
  const api = client();
  let primary = false;
  let requests = false;
  try {
    await api.calendarList.get({ calendarId: calendarId() });
    primary = true;
  } catch {
    primary = false;
  }
  try {
    await api.calendarList.get({ calendarId: requestsCalendarId() });
    requests = true;
  } catch {
    requests = false;
  }
  return { primary, requests };
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID!;
}

function requestsCalendarId() {
  const id = process.env.GOOGLE_REQUESTS_CALENDAR_ID;
  if (!id) throw new Error("Calendario richieste non configurato");
  return id;
}

function stubId() {
  return `stub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function busyRanges(timeMin: string, timeMax: string) {
  if (!googleEnabled) {
    const events = [...stubEvents.values()].flatMap((event) => {
      const start = event.start?.dateTime;
      const end = event.end?.dateTime;
      return start && end && start < timeMax && end > timeMin ? [{ start, end }] : [];
    });
    return events;
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

export type BookingRequestInput = { name: string; email: string; topic: string; message: string; start: string; end: string };

function requestPrivateProperties(input: BookingRequestInput) {
  return {
    [eventProperties.source]: "calendario-swarz",
    [eventProperties.kind]: "request",
    [eventProperties.visibility]: "private",
    [eventProperties.requestStatus]: "pending",
    [eventProperties.requestName]: input.name,
    [eventProperties.requestEmail]: input.email,
    [eventProperties.requestTopic]: input.topic,
    [eventProperties.requestMessage]: input.message,
  };
}

export async function createBooking(input: BookingRequestInput) {
  ensureWritableMode();
  const privateData = requestPrivateProperties(input);

  if (!googleEnabled) {
    const id = stubId();
    const event = {
      id,
      summary: "Richiesta di colloquio",
      description: input.message,
      transparency: "transparent",
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      created: new Date().toISOString(),
      extendedProperties: { private: privateData },
    } satisfies StubEvent;
    stubRequests.set(id, event);
    return { mode: "stub" as const, status: "pending" as const, id };
  }

  const response = await client().events.insert({
    calendarId: requestsCalendarId(),
    sendUpdates: "none",
    requestBody: {
      summary: "Richiesta di colloquio",
      description: input.message,
      transparency: "transparent",
      visibility: "private",
      start: { dateTime: input.start, timeZone: bookingConfig.timeZone },
      end: { dateTime: input.end, timeZone: bookingConfig.timeZone },
      extendedProperties: { private: privateData },
    },
  });
  return { mode: "google" as const, status: "pending" as const, id: response.data.id || "" };
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

function requestStatus(event: CalendarEventLike) {
  return event.extendedProperties?.private?.[eventProperties.requestStatus] || "";
}

function isRequest(event: CalendarEventLike) {
  return event.extendedProperties?.private?.[eventProperties.kind] === "request";
}

function resolvedBeforeRetention(event: CalendarEventLike, cutoff: number) {
  const status = requestStatus(event);
  const resolvedAt = event.extendedProperties?.private?.[eventProperties.requestResolvedAt];
  return (status === "accepted" || status === "rejected") && Boolean(resolvedAt) && Date.parse(resolvedAt!) < cutoff;
}

async function allGoogleRequests(api = client()) {
  const events: CalendarEventLike[] = [];
  let pageToken: string | undefined;
  do {
    const response = await api.events.list({
      calendarId: requestsCalendarId(),
      singleEvents: false,
      privateExtendedProperty: [`${eventProperties.kind}=request`],
      maxResults: 2500,
      pageToken,
    });
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return events;
}

export async function listBookingRequests() {
  const cutoff = Date.now() - resolvedRequestRetentionMs;
  if (!googleEnabled) {
    for (const [id, event] of stubRequests) if (resolvedBeforeRetention(event, cutoff)) stubRequests.delete(id);
    const legacyRequests = [...stubEvents.values()].filter((event) => isRequest(event) && requestStatus(event) === "pending").map(toAdminEvent);
    const requests = [...stubRequests.values()].map(toAdminEvent);
    return {
      pending: requests.filter((event) => event.requestStatus === "pending").sort((a, b) => a.start.localeCompare(b.start)),
      history: requests.filter((event) => event.requestStatus === "accepted" || event.requestStatus === "rejected").sort((a, b) => b.requestResolvedAt.localeCompare(a.requestResolvedAt)),
      legacyPending: legacyRequests,
    };
  }

  const api = client();
  const events = await allGoogleRequests(api);
  for (const event of events) {
    if (event.id && resolvedBeforeRetention(event, cutoff)) {
      await api.events.delete({ calendarId: requestsCalendarId(), eventId: event.id, sendUpdates: "none" });
    }
  }
  const retained = events.filter((event) => !resolvedBeforeRetention(event, cutoff)).map(toAdminEvent);
  const legacy = await listAdminEvents("", "");
  const legacyPending = legacy.filter((event) => event.kind === "request" && event.requestStatus === "pending");
  return {
    pending: retained.filter((event) => event.requestStatus === "pending").sort((a, b) => a.start.localeCompare(b.start)),
    history: retained.filter((event) => event.requestStatus === "accepted" || event.requestStatus === "rejected").sort((a, b) => b.requestResolvedAt.localeCompare(a.requestResolvedAt)),
    legacyPending,
  };
}

export async function migrateLegacyBookingRequests() {
  ensureWritableMode();
  if (!googleEnabled) {
    let migrated = 0;
    for (const [id, event] of [...stubEvents]) {
      if (!isRequest(event) || requestStatus(event) !== "pending") continue;
      const alreadyCopied = [...stubRequests.values()].some((candidate) => candidate.extendedProperties?.private?.[eventProperties.requestSourceEventId] === id);
      if (!alreadyCopied) {
        const newId = stubId();
        stubRequests.set(newId, {
          ...structuredClone(event),
          id: newId,
          transparency: "transparent",
          created: new Date().toISOString(),
          extendedProperties: { private: {
            ...event.extendedProperties?.private,
            [eventProperties.requestSourceEventId]: id,
          } },
        });
      }
      stubEvents.delete(id);
      migrated += 1;
    }
    return { migrated };
  }

  const api = client();
  const oldEvents: CalendarEventLike[] = [];
  let oldPageToken: string | undefined;
  do {
    const page = await api.events.list({ calendarId: calendarId(), singleEvents: false, maxResults: 2500, pageToken: oldPageToken });
    oldEvents.push(...(page.data.items ?? []));
    oldPageToken = page.data.nextPageToken || undefined;
  } while (oldPageToken);
  let migrated = 0;
  const copiedEvents = await allGoogleRequests(api);
  for (const source of oldEvents) {
    if (source.status === "cancelled" || !isRequest(source) || requestStatus(source) !== "pending" || !source.id) continue;
    const start = source.start?.dateTime;
    const end = source.end?.dateTime;
    if (!start || !end) continue;
    const copied = copiedEvents.find((event) => event.extendedProperties?.private?.[eventProperties.requestSourceEventId] === source.id);
    if (!copied) {
      const properties = source.extendedProperties?.private ?? {};
      const targetId = `migrated${createHash("sha256").update(source.id).digest("hex")}`;
      const resource = {
        id: targetId,
        summary: "Richiesta di colloquio",
        description: source.description || "",
        transparency: "transparent",
        visibility: "private",
        start: { dateTime: start, timeZone: bookingConfig.timeZone },
        end: { dateTime: end, timeZone: bookingConfig.timeZone },
        extendedProperties: { private: { ...properties, [eventProperties.requestSourceEventId]: source.id } },
      };
      try {
        const inserted = await api.events.insert({
          calendarId: requestsCalendarId(),
          sendUpdates: "none",
          requestBody: resource,
        });
        copiedEvents.push(inserted.data);
      } catch (error) {
        if (!isGoogleConflict(error)) throw error;
        const raced = await api.events.get({ calendarId: requestsCalendarId(), eventId: targetId });
        if (raced.data.extendedProperties?.private?.[eventProperties.requestSourceEventId] !== source.id) throw error;
        copiedEvents.push(raced.data);
      }
    }
    await api.events.delete({ calendarId: calendarId(), eventId: source.id, sendUpdates: "none" });
    migrated += 1;
  }
  return { migrated };
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

export class BookingConflictError extends Error {
  constructor() {
    super("Lo slot è stato occupato nel frattempo. La richiesta resta in attesa.");
    this.name = "BookingConflictError";
  }
}

function acceptedEventId(requestId: string) {
  return `booking${createHash("sha256").update(requestId).digest("hex")}`;
}

function isGoogleNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && (
    ("code" in error && error.code === 404)
    || ("response" in error && error.response && typeof error.response === "object" && "status" in error.response && error.response.status === 404)
  ));
}

function isGoogleConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && (
    ("code" in error && error.code === 409)
    || ("response" in error && error.response && typeof error.response === "object" && "status" in error.response && error.response.status === 409)
  ));
}

function appointmentResource(request: CalendarEventLike, requestId: string, visibility: "public" | "private", eventId: string) {
  const properties = request.extendedProperties?.private ?? {};
  const name = properties[eventProperties.requestName] || "";
  const email = properties[eventProperties.requestEmail] || "";
  if (!name || !email || !request.start?.dateTime || !request.end?.dateTime) throw new Error("Dati richiesta incompleti");
  return {
    id: eventId,
    summary: "Incontro",
    description: "",
    transparency: "opaque",
    visibility,
    start: { dateTime: request.start.dateTime, timeZone: bookingConfig.timeZone },
    end: { dateTime: request.end.dateTime, timeZone: bookingConfig.timeZone },
    attendees: [{ email, displayName: name }],
    extendedProperties: { private: {
      [eventProperties.source]: "calendario-swarz",
      [eventProperties.kind]: "meeting",
      [eventProperties.visibility]: visibility,
      [eventProperties.bookingRequestId]: requestId,
    } },
  };
}

function requestResolvedProperties(properties: Record<string, string>, status: "accepted" | "rejected", appointmentId = "") {
  return {
    ...properties,
    [eventProperties.requestStatus]: status,
    [eventProperties.requestResolvedAt]: new Date().toISOString(),
    ...(appointmentId ? { [eventProperties.requestAppointmentId]: appointmentId } : {}),
  };
}

export async function resolveBookingRequest(id: string, action: "accept" | "reject", visibility: "public" | "private" = "private") {
  ensureWritableMode();
  const lockKey = `request:${id}`;
  if (lockedRequests.has(lockKey)) throw new BookingConflictError();
  lockedRequests.add(lockKey);
  try {
    if (!googleEnabled) {
      const request = stubRequests.get(id);
      const properties = request?.extendedProperties?.private;
      if (!request || !properties || properties[eventProperties.kind] !== "request") throw new Error("Richiesta non disponibile");
      if (properties[eventProperties.requestStatus] === "accepted") {
        const acceptedId = properties[eventProperties.requestAppointmentId];
        const accepted = acceptedId ? stubEvents.get(acceptedId) : undefined;
        if (!accepted) throw new Error("Evento accettato non disponibile");
        return { action: "accept" as const, status: "accepted" as const, event: toAdminEvent(accepted), alreadyResolved: true };
      }
      if (properties[eventProperties.requestStatus] !== "pending") throw new Error("Richiesta non disponibile");
      if (action === "reject") {
        request.transparency = "transparent";
        request.extendedProperties = { private: requestResolvedProperties(properties, "rejected") };
        return { action, status: "rejected" as const };
      }

      const start = request.start?.dateTime;
      const end = request.end?.dateTime;
      if (!start || !end) throw new Error("Dati richiesta incompleti");
      const eventId = acceptedEventId(id);
      const existing = stubEvents.get(eventId);
      if (existing && existing.extendedProperties?.private?.[eventProperties.bookingRequestId] !== id) {
        throw new Error("Identificativo evento già in uso");
      }
      let appointment = existing;
      if (!appointment) {
        const slotLock = `slot:${start}`;
        if (lockedRequests.has(slotLock)) throw new BookingConflictError();
        lockedRequests.add(slotLock);
        try {
          if (overlaps(start, end, await busyRanges(start, end))) throw new BookingConflictError();
          appointment = {
            ...appointmentResource(request, id, visibility, eventId),
            start: { dateTime: start },
            end: { dateTime: end },
          };
          stubEvents.set(eventId, appointment);
        } finally {
          lockedRequests.delete(slotLock);
        }
      }
      request.transparency = "transparent";
      request.extendedProperties = { private: requestResolvedProperties(properties, "accepted", eventId) };
      return { action, status: "accepted" as const, event: toAdminEvent(appointment) };
    }

    const api = client();
    const requestCalendar = requestsCalendarId();
    const requestResponse = await api.events.get({ calendarId: requestCalendar, eventId: id });
    const request = requestResponse.data;
    const properties = request.extendedProperties?.private;
    if (!properties || properties[eventProperties.kind] !== "request") throw new Error("Richiesta non disponibile");
    const status = properties[eventProperties.requestStatus];
    const appointmentId = acceptedEventId(id);
    if (status === "accepted") {
      const storedAppointmentId = properties[eventProperties.requestAppointmentId] || appointmentId;
      const acceptedResponse = await api.events.get({ calendarId: calendarId(), eventId: storedAppointmentId });
      if (acceptedResponse.data.extendedProperties?.private?.[eventProperties.bookingRequestId] !== id) {
        throw new Error("Evento accettato non corrisponde alla richiesta");
      }
      return { action: "accept" as const, status: "accepted" as const, event: toAdminEvent(acceptedResponse.data), alreadyResolved: true };
    }
    if (status !== "pending") throw new Error("Richiesta non disponibile");
    if (action === "reject") {
      const rejected = requestResolvedProperties(properties, "rejected");
      await api.events.patch({
        calendarId: requestCalendar,
        eventId: id,
        sendUpdates: "none",
        requestBody: { transparency: "transparent", extendedProperties: { private: rejected } },
      });
      return { action, status: "rejected" as const };
    }

    const start = request.start?.dateTime;
    const end = request.end?.dateTime;
    if (!start || !end) throw new Error("Dati richiesta incompleti");

    let appointment: CalendarEventLike | undefined;
    try {
      const existing = await api.events.get({ calendarId: calendarId(), eventId: appointmentId });
      appointment = existing.data;
    } catch (error) {
      if (!isGoogleNotFound(error)) throw error;
    }
    if (appointment && appointment.extendedProperties?.private?.[eventProperties.bookingRequestId] !== id) {
      throw new Error("Identificativo evento già in uso");
    }
    if (!appointment) {
      const slotLock = `slot:${start}`;
      if (lockedRequests.has(slotLock)) throw new BookingConflictError();
      lockedRequests.add(slotLock);
      try {
        if (overlaps(start, end, await busyRanges(start, end))) throw new BookingConflictError();
        const resource = appointmentResource(request, id, visibility, appointmentId);
        try {
          const created = await api.events.insert({ calendarId: calendarId(), sendUpdates: "all", requestBody: resource });
          appointment = created.data;
        } catch (error) {
          if (!isGoogleConflict(error)) throw error;
          const raced = await api.events.get({ calendarId: calendarId(), eventId: appointmentId });
          if (raced.data.extendedProperties?.private?.[eventProperties.bookingRequestId] !== id) throw error;
          appointment = raced.data;
        }
      } finally {
        lockedRequests.delete(slotLock);
      }
    }

    const accepted = requestResolvedProperties(properties, "accepted", appointmentId);
    await api.events.patch({
      calendarId: requestCalendar,
      eventId: id,
      sendUpdates: "none",
      requestBody: { transparency: "transparent", extendedProperties: { private: accepted } },
    });
    return { action, status: "accepted" as const, event: toAdminEvent(appointment!) };
  } finally {
    lockedRequests.delete(lockKey);
  }
}
