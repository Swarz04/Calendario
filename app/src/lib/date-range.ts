import { bookingConfig, isCalendarDate, localDateTimeToUtc } from "./booking.ts";

export function addDays(date: string, days: number) {
  const cursor = new Date(`${date}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

export function todayInBookingZone(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: bookingConfig.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function calendarRange(from: string, to: string, maximumDays = 31) {
  if (!isCalendarDate(from) || !isCalendarDate(to) || to < from) throw new Error("Intervallo non valido");
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
  if (days >= maximumDays) throw new Error("Intervallo troppo ampio");
  const endDate = addDays(to, 1);
  return {
    from,
    to,
    timeMin: localDateTimeToUtc(from, "00:00", bookingConfig.timeZone).toISOString(),
    timeMax: localDateTimeToUtc(endDate, "00:00", bookingConfig.timeZone).toISOString(),
  };
}
