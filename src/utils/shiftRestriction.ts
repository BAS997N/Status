import { AttendanceReport, UserProfile } from "../types";

export interface DisciplinaryRestrictionStatus {
  active: boolean;
  startDate: string;
  expectedEndDate: string;
  requiredDays: number;
  completedDays: number;
  remainingDays: number;
  skippedCutOrderDays: number;
  cappedByLineEnd: boolean;
}

const getReportDate = (report: AttendanceReport) => {
  if (report.reportDate) return report.reportDate;
  if (typeof report.timestamp === "string") return report.timestamp.slice(0, 10);
  const timestamp = report.timestamp as any;
  if (timestamp && typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString().slice(0, 10);
  }
  return "";
};

const getReportTime = (report: AttendanceReport) => {
  const value = report.updatedAt || report.timestamp;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const timestamp = value as any;
  return timestamp && typeof timestamp.toDate === "function"
    ? timestamp.toDate().getTime()
    : 0;
};

const addOneDay = (date: Date) => {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getDisciplinaryRestrictionStatus = (
  user: UserProfile,
  reports: AttendanceReport[],
  targetDate: string
): DisciplinaryRestrictionStatus => {
  const restriction = user.disciplinaryRestriction;
  const requiredDays = Math.max(1, Number(restriction?.requiredDays) || 21);
  const emptyStatus: DisciplinaryRestrictionStatus = {
    active: false,
    startDate: restriction?.startDate || "",
    expectedEndDate: "",
    requiredDays,
    completedDays: 0,
    remainingDays: requiredDays,
    skippedCutOrderDays: 0,
    cappedByLineEnd: false,
  };

  if (!restriction?.enabled || !restriction.startDate || !targetDate) {
    return emptyStatus;
  }

  const start = new Date(`${restriction.startDate}T12:00:00`);
  const target = new Date(`${targetDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) {
    return emptyStatus;
  }

  const latestReportByDate = new Map<string, AttendanceReport>();
  reports
    .filter(
      (report) =>
        report.isReset !== true &&
        (report.userId === user.userId ||
          Boolean(
            user.personalId &&
              (report as AttendanceReport & { personalId?: string }).personalId ===
                user.personalId
          ))
    )
    .forEach((report) => {
      const dateKey = getReportDate(report);
      if (!dateKey) return;
      const previous = latestReportByDate.get(dateKey);
      if (!previous || getReportTime(report) >= getReportTime(previous)) {
        latestReportByDate.set(dateKey, report);
      }
    });

  let cursor = start;
  let countedDays = 0;
  let naturalEndDate = "";

  for (let guard = 0; guard < 3660; guard += 1) {
    const dateKey = toDateKey(cursor);
    const isCutOrder = latestReportByDate.get(dateKey)?.status === "cut_order";

    if (!isCutOrder) countedDays += 1;
    if (countedDays >= requiredDays) {
      naturalEndDate = dateKey;
      break;
    }

    cursor = addOneDay(cursor);
  }

  const configuredLineEnd = restriction.endDate || "";
  const cappedByLineEnd = Boolean(
    configuredLineEnd &&
      configuredLineEnd >= restriction.startDate &&
      (!naturalEndDate || configuredLineEnd < naturalEndDate)
  );
  const expectedEndDate = cappedByLineEnd
    ? configuredLineEnd
    : naturalEndDate || configuredLineEnd;

  let completedDays = 0;
  let totalDaysInRestriction = 0;
  let skippedCutOrderDays = 0;
  cursor = start;
  const actualEnd = expectedEndDate
    ? new Date(`${expectedEndDate}T12:00:00`)
    : start;

  for (let guard = 0; guard < 3660 && cursor <= actualEnd; guard += 1) {
    const dateKey = toDateKey(cursor);
    const isCutOrder = latestReportByDate.get(dateKey)?.status === "cut_order";
    if (isCutOrder) skippedCutOrderDays += 1;
    else {
      totalDaysInRestriction += 1;
      if (cursor <= target) completedDays += 1;
    }
    cursor = addOneDay(cursor);
  }

  const active =
    target.getTime() >= start.getTime() &&
    (!expectedEndDate || targetDate <= expectedEndDate);

  return {
    active,
    startDate: restriction.startDate,
    expectedEndDate,
    requiredDays,
    completedDays: Math.min(completedDays, requiredDays),
    remainingDays: active
      ? Math.max(0, totalDaysInRestriction - completedDays)
      : 0,
    skippedCutOrderDays,
    cappedByLineEnd,
  };
};
