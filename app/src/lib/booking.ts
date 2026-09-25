export type BookingConfig = {
  timeZone: string;
  slotMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
};

function integerSetting(name: string, fallback: number, minimum: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} non valido`);
  return value;
}

export const bookingConfig: BookingConfig = Object.freeze({
  timeZone: process.env.BOOKING_TIMEZONE || "Europe/Rome",
  slotMinutes: integerSetting("BOOKING_SLOT_MINUTES", 60, 1),
  minNoticeHours: integerSetting("BOOKING_MIN_NOTICE_HOURS", 0, 0),
  maxDaysAhead: integerSetting("BOOKING_MAX_DAYS_AHEAD", 30, 0),
});

new Intl.DateTimeFormat("en-US", { timeZone: bookingConfig.timeZone }).format();

const hours = [9, 10, 11, 12, 14, 15, 16, 17];

export type Slot = { start: string; end: string; label: string };

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(target);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const representedAsUtc = Date.UTC(number("year"), number("month") - 1, number("day"), number("hour"), number("minute"), number("second"));
  const result = new Date(target - (representedAsUtc - guess.getTime()));
  const verification = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(result);
  const verified = (type: string) => verification.find((part) => part.type === type)?.value;
  if (
    verified("year") !== String(year)
    || verified("month") !== String(month).padStart(2, "0")
    || verified("day") !== String(day).padStart(2, "0")
    || verified("hour") !== String(hour).padStart(2, "0")
    || verified("minute") !== String(minute).padStart(2, "0")
  ) {
    throw new Error("Data o ora locale non valida");
  }
  return result;
}

export function isCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function slotEnd(start: string | Date, minutes = bookingConfig.slotMinutes) {
  const timestamp = typeof start === "string" ? Date.parse(start) : start.getTime();
  return new Date(timestamp + minutes * 60_000).toISOString();
}

export function dateBounds(now = new Date(), config = bookingConfig) {
  const min = zonedDateParts(now, config.timeZone);
  const cursor = new Date(`${min}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + config.maxDaysAhead);
  return { min, max: cursor.toISOString().slice(0, 10) };
}

export function slotsForDate(date: string, now = new Date(), config = bookingConfig): Slot[] {
  const { min, max } = dateBounds(now, config);
  if (!isCalendarDate(date) || date < min || date > max) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return [];

  return hours.flatMap((hour) => {
    const start = localDateTimeToUtc(date, `${String(hour).padStart(2, "0")}:00`, config.timeZone);
    const earliest = now.getTime() + config.minNoticeHours * 60 * 60_000;
    if (start.getTime() <= earliest) return [];
    return [{ start: start.toISOString(), end: slotEnd(start, config.slotMinutes), label: `${String(hour).padStart(2, "0")}:00` }];
  });
}

export function overlaps(start: string, end: string, busy: Array<{ start?: string | null; end?: string | null }>) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  return busy.some((range) => range.start && range.end && from < Date.parse(range.end) && to > Date.parse(range.start));
}
