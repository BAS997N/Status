import { ShiftRecord } from "../../types";

export const getLocalDateKey = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const formatShortDate = (value: string) =>
  new Date(value).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
  });

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

export const getWeekStart = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - day);
  return result;
};

export const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const getAssignedCount = (shift: ShiftRecord) =>
  shift.assignments.filter((item) => item.userId).length;

export const getReadCount = (shift: ShiftRecord) =>
  shift.assignments.filter(
    (item) => item.assigneeType !== "external" && item.readStatus === "read"
  ).length;

export const getReadableAssignmentCount = (shift: ShiftRecord) =>
  shift.assignments.filter((item) => item.assigneeType !== "external").length;

export const isPublishedShift = (shift: ShiftRecord) =>
  shift.status === "published" || shift.status === "scheduled";

export const getStatusLabel = (shift: ShiftRecord) => {
  if (shift.status === "draft") return "טיוטה לקראת פרסום";
  if (shift.status === "cancelled") return "מבוטלת";
  return "פורסמה";
};

export const getStatusClasses = (shift: ShiftRecord) => {
  if (shift.status === "draft") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (shift.status === "cancelled") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
};
