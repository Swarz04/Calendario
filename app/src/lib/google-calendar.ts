import { google } from "googleapis";

const state = globalThis as typeof globalThis & { __calendarStubBookings?: Set<string> };
const stubBookings = state.__calendarStubBookings ??= new Set<string>();

const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CALENDAR_ID"] as const;
export const googleEnabled = required.every((key) => Boolean(process.env[key]));

function client() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

export async function busyRanges(timeMin: string, timeMax: string) {
  if (!googleEnabled) {
    return [...stubBookings].map((start) => ({ start, end: new Date(Date.parse(start) + 60 * 60_000).toISOString() }));
  }

  const response = await client().freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: process.env.BOOKING_TIMEZONE || "Europe/Rome",
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
    },
  });
  return response.data.calendars?.[process.env.GOOGLE_CALENDAR_ID!]?.busy ?? [];
}

export async function createBooking(input: { name: string; email: string; reason: string; start: string; end: string }) {
  if (!googleEnabled) {
    stubBookings.add(input.start);
    return { id: `stub-${Date.now()}`, htmlLink: null, mode: "stub" as const };
  }

  const response = await client().events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    sendUpdates: "all",
    requestBody: {
      summary: `Incontro con ${input.name}`,
      description: input.reason,
      start: { dateTime: input.start, timeZone: process.env.BOOKING_TIMEZONE || "Europe/Rome" },
      end: { dateTime: input.end, timeZone: process.env.BOOKING_TIMEZONE || "Europe/Rome" },
      attendees: [{ email: input.email, displayName: input.name }],
    },
  });
  return { id: response.data.id, htmlLink: response.data.htmlLink, mode: "google" as const };
}
