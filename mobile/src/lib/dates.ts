/** Local calendar date as YYYY-MM-DD (not UTC, so late-night entries land on the right day). */
export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as a local date. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function lastNDays(n: number, end: Date = new Date()): Date[] {
  return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
}

/** "Today", "Yesterday", or "Wednesday, 8 Oct". */
export function relativeDayLabel(iso: string, today: Date = new Date()): string {
  const todayIso = toISODate(today);
  if (iso === todayIso) return 'Today';
  if (iso === toISODate(addDays(today, -1))) return 'Yesterday';
  const d = parseISODate(iso);
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function shortDay(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function weekdayInitial(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: 'narrow' });
}

export function timeOfDay(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
