/**
 * Jalali (Solar Hijri) calendar + Asia/Tehran helpers — Production Phase 7.
 * Conversion based on standard Jalali algorithms (Birashk / jalaali-js style).
 */

export const TEHRAN_TZ = 'Asia/Tehran';

/** Jalali month names (fa) */
export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export const JALALI_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;

/** JS getDay() → Jalali weekday index (شنبه = 0) */
export function jalaliWeekdayIndex(jsDay: number): number {
  // JS: 0=Sunday … 6=Saturday → Jalali: 0=Saturday … 6=Friday
  return (jsDay + 1) % 7;
}

export function div(a: number, b: number): number {
  return ~~(a / b);
}

export function mod(a: number, b: number): number {
  return a - ~~(a / b) * b;
}

/** Gregorian → Jalali */
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm =
    days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** Jalali → Gregorian */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const sal_a = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];
  jy += 1595;
  const days =
    -355668 +
    365 * jy +
    div(jy, 33) * 8 +
    div(mod(jy, 33) + 3, 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  let d = mod(days, 146097);
  if (d > 36524) {
    d -= 1;
    gy += 100 * div(d, 36524);
    d = mod(d, 36524);
    if (d >= 365) d += 1;
  }
  gy += 4 * div(d, 1461);
  d = mod(d, 1461);
  if (d > 365) {
    gy += div(d - 1, 365);
    d = mod(d - 1, 365);
  }
  let gd = d + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal_b = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > sal_b[gm]) {
    gd -= sal_b[gm];
    gm += 1;
  }
  return [gy, gm, gd];
}

/** Format: شنبه ۲۸ شهریور ۱۴۰۵ */
export function formatJalaliDate(isoDate: string, useFaDigits = true): string {
  const d = new Date(isoDate + 'T12:00:00');
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const wd = JALALI_WEEKDAYS[jalaliWeekdayIndex(d.getDay())];
  const month = JALALI_MONTHS[jm - 1];
  const year = useFaDigits ? toFaDigits(jy) : String(jy);
  const day = useFaDigits ? toFaDigits(jd) : String(jd);
  return `${wd} ${day} ${month} ${year}`;
}

export function toFaDigits(n: number | string): string {
  const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/\d/g, (d) => FA[Number(d)]);
}

/** Minutes label 09:30 → ۹:۳۰ */
export function formatFaTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${toFaDigits(h)}:${toFaDigits(String(m).padStart(2, '0'))}`;
}

/**
 * Timezone: format ISO date parts in Asia/Tehran.
 * Uses Intl when available; falls back to UTC+3:30 (Iran has no DST since 2022).
 */
export function tehranDateParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayJs: number;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TEHRAN_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const wdMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')) % 24,
      minute: Number(get('minute')),
      weekdayJs: wdMap[get('weekday')] ?? date.getUTCDay(),
    };
  } catch {
    // UTC+3:30 fallback
    const t = new Date(date.getTime() + 3.5 * 3600 * 1000);
    return {
      year: t.getUTCFullYear(),
      month: t.getUTCMonth() + 1,
      day: t.getUTCDate(),
      hour: t.getUTCHours(),
      minute: t.getUTCMinutes(),
      weekdayJs: t.getUTCDay(),
    };
  }
}

export function tehranIsoDate(date: Date = new Date()): string {
  const p = tehranDateParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function nextTehranDays(n: number, from = new Date()): string[] {
  const out: string[] = [];
  const base = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86400000);
    out.push(tehranIsoDate(new Date(d.getTime() + 3.5 * 3600 * 1000)));
  }
  return out;
}

export interface SlotSpec {
  startMinute: number;
  endMinute: number;
}

export interface ScheduleRuleJalali {
  /** Jalali weekday 0=شنبه … 6=جمعه */
  jalaliWeekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
  /** Break windows minutes from midnight */
  breaks?: Array<{ start: number; end: number }>;
  /** Sanitation/rest buffer after each booking */
  bufferMinutes?: number;
}

export type BookedInterval = { startMinute: number; endMinute: number };

function overlaps(a: SlotSpec, b: BookedInterval | { start: number; end: number }): boolean {
  const bs = 'startMinute' in b ? b.startMinute : b.start;
  const be = 'endMinute' in b ? b.endMinute : b.end;
  return a.startMinute < be && a.endMinute > bs;
}

/**
 * Expand a Jalali weekday schedule into bookable slots,
 * excluding breaks and already-booked ranges (+ buffer).
 */
export function expandJalaliDaySlots(opts: {
  isoDate: string;
  rules: ScheduleRuleJalali[];
  booked?: BookedInterval[];
}): Array<SlotSpec & { jalaliLabel: string; faTime: string; available: boolean }> {
  const d = new Date(opts.isoDate + 'T12:00:00');
  const jwd = jalaliWeekdayIndex(d.getDay());
  const rule = opts.rules.find((r) => r.jalaliWeekday === jwd);
  if (!rule) return [];
  const buffer = rule.bufferMinutes ?? 0;
  const booked = opts.booked ?? [];
  const out: Array<SlotSpec & { jalaliLabel: string; faTime: string; available: boolean }> = [];
  const label = formatJalaliDate(opts.isoDate);

  for (let t = rule.startMinute; t + rule.slotMinutes <= rule.endMinute; t += rule.slotMinutes) {
    const end = t + rule.slotMinutes;
    const slot = { startMinute: t, endMinute: end };
    if ((rule.breaks ?? []).some((b) => overlaps(slot, b))) continue;
    const busy = booked.some((b) => {
      const bEnd = b.endMinute + buffer;
      return slot.startMinute < bEnd && slot.endMinute > b.startMinute;
    });
    out.push({
      ...slot,
      jalaliLabel: label,
      faTime: formatFaTime(t),
      available: !busy,
    });
  }
  return out;
}

/**
 * Overlap check used by booking transaction (memory engine).
 * Two bookings conflict if intervals (including buffer) intersect.
 */
export function slotsConflict(
  a: BookedInterval,
  b: BookedInterval,
  bufferMinutes = 0,
): boolean {
  return a.startMinute < b.endMinute + bufferMinutes && a.endMinute > b.startMinute;
}

export const PRODUCTION_JALALI_PHASE = 7;
