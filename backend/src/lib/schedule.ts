import type { AppointmentStatus } from "@prisma/client";

export const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
];

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CHECKED_IN", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function assertStatusTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (from === to) {
    return;
  }
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`Cannot change status from ${from} to ${to}`);
  }
}

export function canReschedule(status: AppointmentStatus): boolean {
  return status === "SCHEDULED" || status === "CONFIRMED";
}

export function minutesOfDay(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error("Time must use HH:mm");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export type ScheduleWindow = {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

export function assertScheduleWindows(windows: ScheduleWindow[]): void {
  if (windows.length === 0) {
    throw new Error("Add at least one working window");
  }
  const groups = new Map<number, ScheduleWindow[]>();
  for (const window of windows) {
    if (window.weekday < 0 || window.weekday > 6) {
      throw new Error("Weekday must be between 0 and 6");
    }
    const start = minutesOfDay(window.startTime);
    const end = minutesOfDay(window.endTime);
    if (start >= end) {
      throw new Error("Schedule end time must be after the start time");
    }
    if (!Number.isInteger(window.slotMinutes) || window.slotMinutes < 5 || window.slotMinutes > 240) {
      throw new Error("Slot length must be between 5 and 240 minutes");
    }
    const group = groups.get(window.weekday) ?? [];
    for (const other of group) {
      const otherStart = minutesOfDay(other.startTime);
      const otherEnd = minutesOfDay(other.endTime);
      if (start < otherEnd && otherStart < end) {
        throw new Error("Working windows overlap");
      }
    }
    group.push(window);
    groups.set(window.weekday, group);
  }
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string): { weekday: number; date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = WEEKDAY[parts.weekday];
  let hour = Number(parts.hour);
  if (hour === 24) {
    hour = 0;
  }
  return {
    weekday,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

export function clinicOffset(timeZone: string): string {
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") {
    return "+05:30";
  }
  return "+05:30";
}

export function fitsSchedule(
  schedules: ScheduleWindow[],
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): boolean {
  const start = zonedParts(startsAt, timeZone);
  const end = zonedParts(endsAt, timeZone);
  if (start.date !== end.date || end.minutes <= start.minutes) {
    return false;
  }
  return schedules.some((window) => {
    if (window.weekday !== start.weekday) {
      return false;
    }
    return minutesOfDay(window.startTime) <= start.minutes && end.minutes <= minutesOfDay(window.endTime);
  });
}

export function buildSlots(input: {
  schedules: ScheduleWindow[];
  date: string;
  timeZone: string;
  taken: Array<{ startsAt: Date; endsAt: Date }>;
}): Array<{ startsAt: string; endsAt: string; available: boolean }> {
  const probe = new Date(`${input.date}T12:00:00${clinicOffset(input.timeZone)}`);
  const weekday = zonedParts(probe, input.timeZone).weekday;
  const slots: Array<{ startsAt: string; endsAt: string; available: boolean }> = [];
  for (const window of input.schedules.filter((item) => item.weekday === weekday)) {
    const open = minutesOfDay(window.startTime);
    const close = minutesOfDay(window.endTime);
    for (let cursor = open; cursor + window.slotMinutes <= close; cursor += window.slotMinutes) {
      const startsAt = new Date(
        `${input.date}T${formatMinutes(cursor)}:00${clinicOffset(input.timeZone)}`,
      );
      const endsAt = new Date(
        `${input.date}T${formatMinutes(cursor + window.slotMinutes)}:00${clinicOffset(input.timeZone)}`,
      );
      const available = !input.taken.some(
        (busy) => busy.startsAt < endsAt && startsAt < busy.endsAt,
      );
      slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), available });
    }
  }
  return slots;
}
