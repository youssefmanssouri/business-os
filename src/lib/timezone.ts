import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Timezone utilities for BusinessOS Bookings & Scheduling
 * Ensures all scheduling, conflict checks, and calendar views are
 * authoritative to the Company's configured timezone.
 */

export interface WeekDayInfo {
  date: Date;
  dateStr: string; // YYYY-MM-DD in company timezone
  dayName: string; // e.g., "Mon", "Tue"
  fullDayName: string; // e.g., "Monday"
  formattedDate: string; // e.g., "Sep 21"
  dayOfMonth: number;
}

/**
 * Returns today's date in the company timezone formatted as YYYY-MM-DD
 */
export function getTodayInTimezone(timezone: string = "America/New_York"): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

/**
 * Parses a company-local date (YYYY-MM-DD) and time (HH:mm) into a UTC Date object.
 * Rejects invalid/non-existent times caused by Daylight Saving Time (DST) "spring-forward" gaps.
 */
export function parseCompanyDateTime(
  dateStr: string,
  timeStr: string,
  timezone: string = "America/New_York"
): Date {
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();

  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(cleanTime)) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:mm.`);
  }

  const timeNormalized = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime;
  const requestedString = `${cleanDate} ${timeNormalized}`;

  const utcDate = fromZonedTime(requestedString, timezone);
  if (isNaN(utcDate.getTime())) {
    throw new Error(`Invalid date/time combination: ${cleanDate} ${cleanTime}`);
  }

  // DST Gap Detection:
  // When clocks jump forward (e.g. 02:00 -> 03:00 in America/New_York), times like 02:30 do not exist.
  // fromZonedTime will adjust or shift the time. Formatting the resulting UTC date back
  // in the target timezone must match the requested local time.
  const roundTrip = formatInTimeZone(utcDate, timezone, "yyyy-MM-dd HH:mm");
  const expectedPrefix = `${cleanDate} ${cleanTime.slice(0, 5)}`;

  if (roundTrip !== expectedPrefix) {
    throw new Error(
      `The local time ${cleanTime} does not exist on ${cleanDate} in timezone "${timezone}" due to a Daylight Saving Time transition.`
    );
  }

  return utcDate;
}

/**
 * Formats a UTC Date or ISO string in the specified timezone
 */
export function formatAppointmentTime(
  date: Date | string,
  timezone: string = "America/New_York",
  pattern: string = "HH:mm"
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, timezone, pattern);
}

/**
 * Formats an appointment interval (e.g., "10:00 – 11:00") in the company timezone
 */
export function formatAppointmentInterval(
  start: Date | string,
  end: Date | string,
  timezone: string = "America/New_York"
): string {
  const sStr = formatAppointmentTime(start, timezone, "HH:mm");
  const eStr = formatAppointmentTime(end, timezone, "HH:mm");
  return `${sStr} – ${eStr}`;
}

/**
 * Gets the company-local calendar date string (YYYY-MM-DD) for an appointment
 */
export function getAppointmentLocalDateStr(
  date: Date | string,
  timezone: string = "America/New_York"
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, timezone, "yyyy-MM-dd");
}

/**
 * Calculates the 7 week days (Monday through Sunday) for a reference date in the specified timezone
 */
export function getWeekDaysInTimezone(
  refDate: Date | string,
  timezone: string = "America/New_York"
): WeekDayInfo[] {
  const d = typeof refDate === "string" ? new Date(refDate) : refDate;
  
  // Get reference local date parts in timezone
  const refDateStr = formatInTimeZone(d, timezone, "yyyy-MM-dd");
  const [year, month, day] = refDateStr.split("-").map(Number);
  
  // Create a base UTC date anchored to noon to avoid day boundary drift during week calculations
  const noonDate = fromZonedTime(`${refDateStr} 12:00:00`, timezone);
  
  // Day of week in timezone: 0 = Sun, 1 = Mon, ..., 6 = Sat
  const dayOfWeekStr = formatInTimeZone(noonDate, timezone, "i"); // 1 (Mon) to 7 (Sun) in ISO
  const isoDay = parseInt(dayOfWeekStr, 10); // 1 = Monday, 7 = Sunday
  
  // Days to subtract to reach Monday
  const daysToMonday = isoDay - 1;
  
  const mondayUtc = new Date(noonDate.getTime() - daysToMonday * 24 * 60 * 60 * 1000);

  const days: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(mondayUtc.getTime() + i * 24 * 60 * 60 * 1000);
    const dayDateStr = formatInTimeZone(dayUtc, timezone, "yyyy-MM-dd");
    const dayName = formatInTimeZone(dayUtc, timezone, "EEE");
    const fullDayName = formatInTimeZone(dayUtc, timezone, "EEEE");
    const formattedDate = formatInTimeZone(dayUtc, timezone, "MMM d");
    const dayOfMonth = parseInt(formatInTimeZone(dayUtc, timezone, "d"), 10);

    days.push({
      date: dayUtc,
      dateStr: dayDateStr,
      dayName,
      fullDayName,
      formattedDate,
      dayOfMonth,
    });
  }

  return days;
}

/**
 * Validates and normalizes timezone string. If invalid, maps known aliases or falls back to America/New_York.
 */
export function sanitizeTimezone(tz?: string | null): string {
  if (!tz) return "America/New_York";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    if (tz === "America/San_Francisco") return "America/Los_Angeles";
    return "America/New_York";
  }
}

/**
 * Formats an invoice date deterministically in the company's timezone.
 * Defaults to MMM d, yyyy (e.g., "Sep 21, 2026").
 */
export function formatInvoiceDate(
  date: Date | string | null | undefined,
  timezone: string = "America/New_York",
  pattern: string = "MMM d, yyyy"
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const safeTz = sanitizeTimezone(timezone);
  return formatInTimeZone(d, safeTz, pattern);
}

/**
 * Parses a company calendar date (YYYY-MM-DD) anchored safely to 12:00:00 noon
 * in the company's timezone. This avoids day-boundary drift across Western/Eastern
 * timezones and during Daylight Saving Time adjustments.
 */
export function parseCompanyDate(
  dateStr: string,
  timezone: string = "America/New_York"
): Date {
  const safeTz = sanitizeTimezone(timezone);
  const cleanDate = dateStr.trim().split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid calendar date format: "${dateStr}". Expected YYYY-MM-DD.`);
    }
    return parsed;
  }
  return fromZonedTime(`${cleanDate} 12:00:00`, safeTz);
}

/**
 * Centrally derives the effective operational status of an invoice.
 *
 * State Rules:
 * 1. PAID: Always returns "PAID" (permanently sealed).
 * 2. DRAFT: Always returns "DRAFT" (unissued draft).
 * 3. OVERDUE: An issued invoice whose dueDate calendar day (end-of-day in company timezone)
 *    has elapsed without payment.
 * 4. PENDING: An issued invoice whose dueDate has not elapsed.
 */
export function getEffectiveInvoiceStatus(
  invoice: { status: string; dueDate: Date | string; paidAt?: Date | string | null },
  timezone: string = "America/New_York",
  now: Date = new Date()
): "DRAFT" | "PENDING" | "OVERDUE" | "PAID" {
  if (invoice.status === "PAID" || !!invoice.paidAt) {
    return "PAID";
  }
  if (invoice.status === "DRAFT") {
    return "DRAFT";
  }

  const due = typeof invoice.dueDate === "string" ? new Date(invoice.dueDate) : invoice.dueDate;
  if (!due || isNaN(due.getTime())) {
    return "PENDING";
  }

  const safeTz = sanitizeTimezone(timezone);
  const dueDayStr = formatInTimeZone(due, safeTz, "yyyy-MM-dd");
  const dueEndOfDay = fromZonedTime(`${dueDayStr} 23:59:59.999`, safeTz);

  if (now.getTime() > dueEndOfDay.getTime()) {
    return "OVERDUE";
  }

  return "PENDING";
}

