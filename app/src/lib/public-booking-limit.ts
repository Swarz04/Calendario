const WINDOW_MS = 15 * 60_000;
const MAX_REQUESTS = 5;
const requests = new Map<string, { count: number; resetAt: number }>();

export function allowPublicBooking(ip: string, now = Date.now()) {
  for (const [key, entry] of requests) if (entry.resetAt <= now) requests.delete(key);
  const current = requests.get(ip);
  if (!current || current.resetAt <= now) {
    requests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}
