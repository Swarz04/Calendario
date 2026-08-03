export const timeZone = process.env.BOOKING_TIMEZONE || "Europe/Rome";
export const slotMinutes = Number(process.env.BOOKING_SLOT_MINUTES || 60);
export const maxDaysAhead = Number(process.env.BOOKING_MAX_DAYS_AHEAD || 30);

const hours = [9, 10, 11, 12, 14, 15, 16, 17];

export type Slot = { start: string; end: string; label: string };

function zonedDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localToUtc(date: string, hour: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
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
  return new Date(target - (representedAsUtc - guess.getTime()));
}

export function dateBounds(now = new Date()) {
  const min = zonedDateParts(now);
  const cursor = new Date(`${min}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + maxDaysAhead);
  return { min, max: cursor.toISOString().slice(0, 10) };
}

export function slotsForDate(date: string, now = new Date()): Slot[] {
  const { min, max } = dateBounds(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < min || date > max) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return [];

  return hours.flatMap((hour) => {
    const start = localToUtc(date, hour);
    if (start <= now) return [];
    const end = new Date(start.getTime() + slotMinutes * 60_000);
    return [{ start: start.toISOString(), end: end.toISOString(), label: `${String(hour).padStart(2, "0")}:00` }];
  });
}

export function overlaps(start: string, end: string, busy: Array<{ start?: string | null; end?: string | null }>) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  return busy.some((range) => range.start && range.end && from < Date.parse(range.end) && to > Date.parse(range.start));
}
