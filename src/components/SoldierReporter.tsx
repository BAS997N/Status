import React, { useState, useEffect } from "react";
import { 
  Send, 
  MapPin, 
  Clock, 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Compass, 
  CalendarDays, 
  FileText,
  CircleHelp,
  ChevronDown,
  ChevronUp,
  Bell,
  CheckCheck,
  ShieldAlert
} from "lucide-react";
import { 
  UserProfile, 
  AttendanceReport, 
  AttendanceStatus,
  AttendanceStatusConfig,
  ShiftRecord,
  SystemSettingsConfig,
  CommanderMessage,
  LineCycle,
  LinePresencePlan,
  DEFAULT_ATTENDANCE_STATUS_CONFIGS
} from "../types";
import { motion, AnimatePresence } from "motion/react";
import { dataService } from "../services/dataService";
import { getDisciplinaryRestrictionStatus } from "../utils/shiftRestriction";

interface SoldierReporterProps {
  currentUser: UserProfile;
  reports: AttendanceReport[];
  shifts?: ShiftRecord[];
  systemSettings: SystemSettingsConfig;
  attendanceStatuses?: AttendanceStatusConfig[];
  readOnly?: boolean;
 onSubmitReport: (
  status: AttendanceStatus,
  location: string,
  note: string,
  coords?: { lat: number; lng: number },
  reportDate?: string,
  cutOrderStartDate?: string,
  cutOrderEndDate?: string,
  dayMarker?: "return_to_base" | "exit_home"
) => Promise<void>;
}

type SoldierPageSection =
  | "report"
  | "shifts"
  | "planning"
  | "order"
  | "messages";

const readStoredCollapsedState = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
};

const getLinePlanDates = (startDate: string, endDate: string) => {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate && dates.length < 370) {
    dates.push(cursor);
    const next = new Date(`${cursor}T12:00:00`);
    next.setDate(next.getDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return dates;
};

const PERSONAL_PLANNING_DAY_MARKERS: AttendanceStatusConfig[] = [
  {
    id: "exit_home",
    label: "יציאה לבית",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 1001,
    systemStatus: false,
    chartCategory: "absent",
    color: "text-purple-800",
    bg: "bg-purple-100",
    border: "border-purple-300",
  },
  {
    id: "return_to_base",
    label: "חזרה לבסיס",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 1002,
    systemStatus: false,
    chartCategory: "present",
    color: "text-blue-800",
    bg: "bg-blue-100",
    border: "border-blue-300",
  },
  {
    id: "after_hours",
    label: "אפטר",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 1003,
    systemStatus: false,
    chartCategory: "absent",
    color: "text-fuchsia-800",
    bg: "bg-fuchsia-100",
    border: "border-fuchsia-300",
  },
];

export default function SoldierReporter({ 
  currentUser, 
  reports,
  shifts = [],
  systemSettings,
  attendanceStatuses = DEFAULT_ATTENDANCE_STATUS_CONFIGS,
  onSubmitReport,
  readOnly = false
}: SoldierReporterProps) {
  const orderCollapseStorageKey = `idf_order_card_collapsed_${currentUser.userId}`;
  const nextShiftCollapseStorageKey = `idf_next_shift_collapsed_${currentUser.userId}`;
  const weeklyShiftsCollapseStorageKey = `idf_weekly_shifts_collapsed_${currentUser.userId}`;
  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const [status, setStatus] = useState<AttendanceStatus>("base");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [reportDate, setReportDate] = useState(getTodayLocalDate());

const [cutOrderStartDate, setCutOrderStartDate] = useState("");
const [cutOrderEndDate, setCutOrderEndDate] = useState("");
const [isDateRangeReport, setIsDateRangeReport] = useState(false);
  const [dayMarker, setDayMarker] = useState<"return_to_base" | "exit_home" | "">("");
  
  // Geolocation states
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [geoState, setGeoState] = useState<"idle" | "fetching" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [commanderMessages, setCommanderMessages] = useState<CommanderMessage[]>([]);
  const [acknowledgingMessageId, setAcknowledgingMessageId] = useState<string | null>(null);
  const [isOrderCollapsed, setIsOrderCollapsed] = useState<boolean>(() =>
    readStoredCollapsedState(orderCollapseStorageKey, false)
  );
  const legacyShiftCardsCollapsed = readStoredCollapsedState(
    `idf_shift_cards_collapsed_${currentUser.userId}`,
    typeof window !== "undefined" && window.innerWidth < 640
  );
  const [isNextShiftCollapsed, setIsNextShiftCollapsed] = useState<boolean>(() =>
    readStoredCollapsedState(nextShiftCollapseStorageKey, legacyShiftCardsCollapsed)
  );
  const [isWeeklyShiftsCollapsed, setIsWeeklyShiftsCollapsed] =
    useState<boolean>(() =>
      readStoredCollapsedState(
        weeklyShiftsCollapseStorageKey,
        legacyShiftCardsCollapsed
      )
    );
  const [collapseHelp, setCollapseHelp] = useState<"order" | "shifts" | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [activeSection, setActiveSection] =
    useState<SoldierPageSection>("report");
  const [myLineCycle, setMyLineCycle] = useState<LineCycle | null>(null);
  const [myLinePlan, setMyLinePlan] = useState<LinePresencePlan | null>(null);
  const [isMyLinePlanLoading, setIsMyLinePlanLoading] = useState(false);
  const [myLinePlanError, setMyLinePlanError] = useState("");
  const [myLinePlanLoaded, setMyLinePlanLoaded] = useState(false);

  const loadMyLinePlan = async () => {
    if (systemSettings.linePlanningVisibleToSoldiers === false) return;
    setIsMyLinePlanLoading(true);
    setMyLinePlanError("");
    try {
      const cycles = await dataService.getLineCycles();
      const selectedCycle =
        cycles.find((cycle) => cycle.status === "open") || cycles[0] || null;
      setMyLineCycle(selectedCycle);
      if (!selectedCycle) {
        setMyLinePlan(null);
        return;
      }
      const plans = await dataService.getLinePresencePlans(
        selectedCycle.cycleId,
        currentUser.userId
      );
      setMyLinePlan(
        plans.find((plan) => plan.userId === currentUser.userId) || null
      );
    } catch (error) {
      console.error("Failed loading soldier line plan:", error);
      setMyLinePlanError("טעינת תכנון הנוכחות נכשלה. נסה שוב.");
    } finally {
      setIsMyLinePlanLoading(false);
      setMyLinePlanLoaded(true);
    }
  };

  useEffect(() => {
    if (
      activeSection === "planning" &&
      !myLinePlanLoaded &&
      systemSettings.linePlanningVisibleToSoldiers !== false
    ) {
      void loadMyLinePlan();
    }
  }, [
    activeSection,
    currentUser.userId,
    myLinePlanLoaded,
    systemSettings.linePlanningVisibleToSoldiers,
  ]);

  useEffect(() => {
    setMyLineCycle(null);
    setMyLinePlan(null);
    setMyLinePlanError("");
    setMyLinePlanLoaded(false);
  }, [currentUser.userId]);

  useEffect(() => {
    if (
      systemSettings.linePlanningVisibleToSoldiers === false &&
      activeSection === "planning"
    ) {
      setActiveSection("report");
    }
  }, [activeSection, systemSettings.linePlanningVisibleToSoldiers]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(orderCollapseStorageKey, String(isOrderCollapsed));
  }, [isOrderCollapsed, orderCollapseStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(
      nextShiftCollapseStorageKey,
      String(isNextShiftCollapsed)
    );
  }, [isNextShiftCollapsed, nextShiftCollapseStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(
      weeklyShiftsCollapseStorageKey,
      String(isWeeklyShiftsCollapsed)
    );
  }, [isWeeklyShiftsCollapsed, weeklyShiftsCollapseStorageKey]);

  const soldierStatusOptions = attendanceStatuses
    .filter((item) => item.enabled && item.visibleToSoldiers)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const refreshCommanderMessages = async () => {
    const messages = await dataService.getCommanderMessages();
    setCommanderMessages(
      messages
        .filter((message) => {
          if (message.acknowledgements?.[currentUser.userId]) {
            return false;
          }
          if (message.targetType === "unit") {
            return message.targetUnit === currentUser.unit;
          }
          if (message.targetType === "user") {
            return message.targetUserId === currentUser.userId;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.important !== b.important) return a.important ? -1 : 1;
          return b.createdAt.localeCompare(a.createdAt);
        })
    );
  };

  useEffect(() => {
    refreshCommanderMessages().catch((error) =>
      console.error("Failed loading messages for soldier:", error)
    );
  }, [currentUser.userId, currentUser.unit]);

  const handleAcknowledgeMessage = async (messageId: string) => {
    if (readOnly) return;
    setAcknowledgingMessageId(messageId);
    try {
      await dataService.acknowledgeCommanderMessage(messageId, currentUser);
      await refreshCommanderMessages();
    } finally {
      setAcknowledgingMessageId(null);
    }
  };

  const statusLabels = React.useMemo(
    () =>
      Object.fromEntries(
        attendanceStatuses.map((item) => [
          item.id,
          {
            label: item.label,
            color: item.color,
            bg: item.bg,
            border: item.border,
          },
        ])
      ),
    [attendanceStatuses]
  );

  const selectedStatusConfig = attendanceStatuses.find(
    (item) => item.id === status
  );

  const requiresGps = selectedStatusConfig?.requiresGps === true;
  const requiresDateRange =
    selectedStatusConfig?.requiresDateRange === true || status === "cut_order";
  const requiresCommanderApproval =
    selectedStatusConfig?.requiresCommanderApproval === true;
  const showOptionalDateRangeToggle =
    !requiresDateRange && ["base", "home"].includes(status);
  const showDateRangeFields = requiresDateRange || isDateRangeReport;

  useEffect(() => {
    if (soldierStatusOptions.some((item) => item.id === status)) return;
    const fallback = soldierStatusOptions[0];
    if (fallback) setStatus(fallback.id as AttendanceStatus);
  }, [attendanceStatuses, status]);

  useEffect(() => {
    setIsDateRangeReport(selectedStatusConfig?.requiresDateRange === true);
    setCutOrderStartDate("");
    setCutOrderEndDate("");
    setCoords(undefined);
    setGeoState("idle");
  }, [status]);

  // Filter reports submitted by this user
const userReports = reports
  .filter((r) =>
    r.userId === currentUser.userId ||
    (r as any).personalId === currentUser.personalId
  )
  .sort((a, b) => {
  const aDay =
    (a as any).reportDate ||
    a.timestamp?.split("T")[0] ||
    "";

  const bDay =
    (b as any).reportDate ||
    b.timestamp?.split("T")[0] ||
    "";

  const byDate = bDay.localeCompare(aDay);
  if (byDate !== 0) return byDate;

  return (
    new Date(b.updatedAt || b.timestamp).getTime() -
    new Date(a.updatedAt || a.timestamp).getTime()
  );
});

const selectedReportDate = reportDate || getTodayLocalDate();

const latestReport = userReports
  .filter((r) => {
    if ((r as any).isReset) return false;

    const rDate =
      (r as any).reportDate ||
      r.timestamp?.split("T")[0];

    return rDate === selectedReportDate;
  })
  .sort(
    (a, b) =>
      new Date(b.updatedAt || b.timestamp).getTime() -
      new Date(a.updatedAt || a.timestamp).getTime()
  )[0];

useEffect(() => {
  if (!latestReport) return;

  setStatus(latestReport.status);
  setLocation(latestReport.location || "");
  setNote(latestReport.note || "");
  setDayMarker(
    latestReport.dayMarker === "return_to_base" ||
      latestReport.dayMarker === "exit_home"
      ? latestReport.dayMarker
      : ""
  );
  setCoords(
    typeof latestReport.latitude === "number" &&
      typeof latestReport.longitude === "number"
      ? { lat: latestReport.latitude, lng: latestReport.longitude }
      : undefined
  );
}, [latestReport?.reportId, selectedReportDate]);

  const commanderEditedReports = userReports
  .filter((r) => {
    const updatedByRole = (r as any).updatedByRole;
    const updatedAt = (r as any).updatedAt;

    return (
      updatedByRole === "commander" &&
      updatedAt &&
      updatedAt !== r.timestamp
    );
  })
  .sort(
    (a, b) =>
      new Date((b as any).updatedAt || b.timestamp).getTime() -
      new Date((a as any).updatedAt || a.timestamp).getTime()
  );

  const assignedShifts = shifts
    .filter((shift) =>
      shift.status === "published" || shift.status === "scheduled"
    )
    .filter((shift) =>
      shift.assignments.some(
        (assignment) =>
          assignment.userId === currentUser.userId ||
          Boolean(
            currentUser.personalId &&
              assignment.personalId === currentUser.personalId
          )
      )
    )
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

  const now = new Date(currentTime);
  const nextShift = assignedShifts.find(
    (shift) => new Date(shift.endAt).getTime() >= now.getTime()
  );

  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weeklyShifts = assignedShifts.filter((shift) => {
    const startAt = new Date(shift.startAt).getTime();
    const endAt = new Date(shift.endAt).getTime();
    return endAt >= currentTime && startAt < weekEnd.getTime();
  });

  const getShiftAssignmentLabel = (shift: ShiftRecord) => {
    const assignment = shift.assignments.find(
      (item) =>
        item.userId === currentUser.userId ||
        Boolean(
          currentUser.personalId && item.personalId === currentUser.personalId
        )
    );

    return assignment?.slotLabel || "שיבוץ למשמרת";
  };

  const formatShiftDateTime = (value: string) =>
    new Date(value).toLocaleString("he-IL", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const todayDate = getTodayLocalDate();
  const disciplinaryRestrictionStatus = getDisciplinaryRestrictionStatus(
    currentUser,
    reports,
    todayDate
  );
  const orderEvents = [...(systemSettings.orderEvents || [])].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const getPersonalOrderStartDate = (order: (typeof orderEvents)[number]) =>
    order.personalStartDates?.[currentUser.userId] || order.startDate;
  const getPersonalOrderEndDate = (order: (typeof orderEvents)[number]) =>
    order.personalEndDates?.[currentUser.userId] || order.endDate;
  const activeOrderEvent = orderEvents.find(
    (order) =>
      getPersonalOrderStartDate(order) <= todayDate &&
      getPersonalOrderEndDate(order) >= todayDate
  );
  const futureOrderEvent = orderEvents.find(
    (order) => getPersonalOrderStartDate(order) > todayDate
  );
  const latestPastOrderEvent = [...orderEvents]
    .reverse()
    .find((order) => getPersonalOrderEndDate(order) < todayDate);
  const displayedOrderEvent =
    activeOrderEvent || futureOrderEvent || latestPastOrderEvent;
  const hasOrderPeriod = Boolean(displayedOrderEvent);
  const globalOrderStartDate = displayedOrderEvent?.startDate || "";
  const personalOrderStartDate = displayedOrderEvent
    ? getPersonalOrderStartDate(displayedOrderEvent)
    : "";
  const orderStartDate = personalOrderStartDate || globalOrderStartDate;
  const globalOrderEndDate = displayedOrderEvent?.endDate || "";
  const personalOrderEndDate = displayedOrderEvent
    ? getPersonalOrderEndDate(displayedOrderEvent)
    : "";
  const orderEndDate = personalOrderEndDate || globalOrderEndDate;
  const configuredLineEndDate =
    displayedOrderEvent?.lineEndDate || globalOrderEndDate;
  const remainingOrderEndDate =
    orderEndDate && configuredLineEndDate
      ? orderEndDate < configuredLineEndDate
        ? orderEndDate
        : configuredLineEndDate
      : orderEndDate || configuredLineEndDate;
  const latestTodayReport = userReports.find((report) => {
    if (report.isReset) return false;
    const reportDay = report.reportDate || report.timestamp?.split("T")[0];
    return reportDay === todayDate;
  });
  const isOutsideOrderToday = Boolean(
    latestTodayReport &&
      ["not_on_order", "cut_order"].includes(latestTodayReport.status)
  );

  const latestOrderReportByDate = new Map<string, AttendanceReport>();
  userReports.forEach((report) => {
    if (report.isReset) return;
    const reportDay = report.reportDate || report.timestamp?.split("T")[0];
    if (!reportDay || latestOrderReportByDate.has(reportDay)) return;
    latestOrderReportByDate.set(reportDay, report);
  });

  const excludedOrderDates = hasOrderPeriod
    ? Array.from(latestOrderReportByDate.entries())
        .filter(
          ([reportDay, report]) =>
            reportDay >= orderStartDate &&
            reportDay <= orderEndDate &&
            ["not_on_order", "cut_order"].includes(report.status)
        )
        .map(([reportDay]) => reportDay)
    : [];

  const getInclusiveDayCount = (start: string, end: string) =>
    Math.max(
      1,
      Math.round(
        (new Date(`${end}T12:00:00`).getTime() -
          new Date(`${start}T12:00:00`).getTime()) /
          86400000
      ) + 1
    );

  const orderState = !hasOrderPeriod
    ? "none"
    : activeOrderEvent && isOutsideOrderToday
    ? "excluded"
    : futureOrderEvent && displayedOrderEvent?.id === futureOrderEvent.id
    ? "future"
    : latestPastOrderEvent && displayedOrderEvent?.id === latestPastOrderEvent.id
    ? "ended"
    : "active";

  const remainingOrderDays =
    (orderState === "active" || orderState === "excluded") &&
    todayDate <= remainingOrderEndDate
    ? Math.max(
        0,
        getInclusiveDayCount(todayDate, remainingOrderEndDate) -
          excludedOrderDates.filter(
            (date) => date >= todayDate && date <= remainingOrderEndDate
          ).length
      )
    : 0;

  const remainingUntilOrderEndDays =
    (orderState === "active" || orderState === "excluded") &&
    todayDate <= orderEndDate
      ? Math.max(
          0,
          getInclusiveDayCount(todayDate, orderEndDate) -
            excludedOrderDates.filter(
              (date) => date >= todayDate && date <= orderEndDate
            ).length
        )
      : 0;

  const totalEffectiveOrderDays = hasOrderPeriod
    ? Math.max(
        0,
        getInclusiveDayCount(orderStartDate, orderEndDate) -
          excludedOrderDates.length
      )
    : 0;

  const getRefreshmentDays = (serviceDays: number) => {
    if (serviceDays >= 57) return 9;
    if (serviceDays >= 43) return 7;
    if (serviceDays >= 29) return 5;
    if (serviceDays >= 15) return 3;
    if (serviceDays >= 10) return 2;
    return 0;
  };

  const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addCalendarDays = (dateValue: string, days: number) => {
    const date = new Date(`${dateValue}T12:00:00`);
    date.setDate(date.getDate() + days);
    return toLocalDateString(date);
  };

  const getLastPersonalServiceDate = () => {
    if (!hasOrderPeriod || totalEffectiveOrderDays === 0) return "";
    const excluded = new Set(excludedOrderDates);
    let candidate = orderEndDate;
    while (candidate >= orderStartDate && excluded.has(candidate)) {
      candidate = addCalendarDays(candidate, -1);
    }
    return candidate >= orderStartDate ? candidate : "";
  };

  const calculateBenefitEndDate = (
    firstBenefitDate: string,
    benefitDays: number,
    combineFridayAndSaturday = false
  ) => {
    if (benefitDays <= 0) return addCalendarDays(firstBenefitDate, -1);
    let current = new Date(`${firstBenefitDate}T12:00:00`);
    let remaining = benefitDays;

    while (remaining > 0) {
      const dayOfWeek = current.getDay();
      remaining -= 1;

      // בתקופות עיבוד והתרעננות שישי ושבת רצופים צורכים יחד יום זכאות אחד.
      if (combineFridayAndSaturday && dayOfWeek === 5) {
        current.setDate(current.getDate() + 1);
      }

      if (remaining > 0) current.setDate(current.getDate() + 1);
    }

    return toLocalDateString(current);
  };

  const configuredProcessingDays = displayedOrderEvent?.processingDays ?? 3;
  const personalSeparateBenefits =
    displayedOrderEvent?.personalProcessingBenefits?.[currentUser.userId];
  const hasPersonalEarlyEnd = Boolean(
    personalOrderEndDate &&
      globalOrderEndDate &&
      personalOrderEndDate < globalOrderEndDate
  );
  const isExplicitlyExcludedFromProcessing =
    displayedOrderEvent?.processingExcludedUserIds?.includes(
      currentUser.userId
    ) ?? false;
  const isExcludedFromProcessing =
    isExplicitlyExcludedFromProcessing || hasPersonalEarlyEnd;
  const processingDays = isExcludedFromProcessing
    ? 0
    : configuredProcessingDays;
  const processingDayType = displayedOrderEvent?.processingDayType || "processing";
  const processingDayLabel =
    processingDayType === "family"
      ? processingDays === 1
        ? "יום משפחות"
        : "ימי משפחות"
      : processingDays === 1
      ? "יום עיבוד"
      : "ימי עיבוד";
  const totalActualServiceDays = totalEffectiveOrderDays + processingDays;
  const refreshmentDays = getRefreshmentDays(totalActualServiceDays);
  const personalLastServiceDate = getLastPersonalServiceDate();
  const processingStartDate = personalLastServiceDate
    ? addCalendarDays(personalLastServiceDate, 1)
    : "";
  const processingEndDate = processingStartDate
    ? calculateBenefitEndDate(processingStartDate, processingDays, true)
    : "";
  const refreshmentStartDate = processingEndDate
    ? addCalendarDays(processingEndDate, 1)
    : "";
  const personalEntitlementEndDate = refreshmentStartDate
    ? calculateBenefitEndDate(refreshmentStartDate, refreshmentDays, true)
    : "";
  const processingCalendarDays =
    processingDays > 0 && processingStartDate && processingEndDate
      ? getInclusiveDayCount(processingStartDate, processingEndDate)
      : 0;
  const refreshmentCalendarDays =
    refreshmentStartDate && personalEntitlementEndDate
      ? getInclusiveDayCount(refreshmentStartDate, personalEntitlementEndDate)
      : 0;
  const totalCalendarDays =
    totalEffectiveOrderDays + processingCalendarDays + refreshmentCalendarDays;

  // Auto set default locations based on status selection
useEffect(() => {
  switch (status) {
    case "base":
      setLocation("בסיס 105");
      break;

    case "home":
      setLocation("בית");
      break;

    case "field":
      setLocation("שטח אימונים");
      break;

    case "sick":
      setLocation("בית - גימלים");
      break;

    case "course":
      setLocation("בא״פ לכיש - בסיס הדרכה");
      break;

      case "cut_order":
  setLocation("חיתוך צו");
  break;

    default:
      setLocation("");
  }
}, [status]);

const handleGetLocation = () => {
  if (!navigator.geolocation) {
    setGeoState("error");
    alert("הדפדפן לא תומך באימות מיקום GPS.");
    return;
  }

  setGeoState("fetching");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });

      setGeoState("success");

      if (location === "בסיס 105" || location === "בית" || !location) {
        setLocation((prev) => `${prev} (GPS מאומת)`);
      }
    },
    () => {
      setCoords(undefined);
      setGeoState("error");
      alert("לא ניתן לקבל מיקום. יש לאשר הרשאת מיקום בדפדפן ולנסות שוב.");
    },
    { timeout: 5000 }
  );
};

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) return;
    if (selectedStatusConfig?.requiresNote && !note.trim()) {
      alert("בסטטוס זה חובה להזין הערה.");
      return;
    }
    if (requiresGps && !coords) {
      alert("בסטטוס זה חובה לאמת מיקום GPS לפני שליחת הדיווח.");
      return;
    }
    if (showDateRangeFields) {
      if (!cutOrderStartDate || !cutOrderEndDate) {
        alert("בסטטוס זה חובה לבחור תאריך התחלה ותאריך סיום.");
        return;
      }
      if (cutOrderEndDate < cutOrderStartDate) {
        alert("תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmitReport(
  status,
  location,
  note,
  coords,
  reportDate,
  showDateRangeFields ? cutOrderStartDate : undefined,
  showDateRangeFields ? cutOrderEndDate : undefined,
dayMarker || undefined
);
      setNote("");
      setCoords(undefined);
      setGeoState("idle");
      setActionSuccess(true);
      setTimeout(() => setActionSuccess(false), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const myLinePlanDates = myLineCycle
    ? getLinePlanDates(myLineCycle.startDate, myLineCycle.endDate)
    : [];
  const myLatestDayMarkerByDate = new Map<string, AttendanceReport>();
  const currentPersonalId = String(currentUser.personalId || "").trim();
  reports.forEach((report) => {
    const reportPersonalId = String(report.personalId || "").trim();
    const belongsToCurrentUser =
      report.userId === currentUser.userId ||
      (Boolean(currentPersonalId) &&
        Boolean(reportPersonalId) &&
        currentPersonalId === reportPersonalId);
    if (!belongsToCurrentUser || report.isReset || !report.dayMarker) return;
    const reportDate = report.reportDate || report.timestamp?.slice(0, 10);
    if (!reportDate) return;
    const previous = myLatestDayMarkerByDate.get(reportDate);
    if (
      !previous ||
      new Date(report.updatedAt || report.timestamp || 0).getTime() >=
        new Date(previous.updatedAt || previous.timestamp || 0).getTime()
    ) {
      myLatestDayMarkerByDate.set(reportDate, report);
    }
  });
  const linePlanStatusById = new Map(
    [...attendanceStatuses, ...PERSONAL_PLANNING_DAY_MARKERS].map((item) => [
      item.id,
      item,
    ])
  );
  const basePlanningStatus =
    linePlanStatusById.get("base") || DEFAULT_ATTENDANCE_STATUS_CONFIGS[0];

  return (
    <div id="soldier-reporter-section" className="min-w-0 space-y-6">
      
      {/* Hello Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-military-100 rounded-full flex items-center justify-center border border-military-200">
            <span className="text-military-800 text-lg font-bold">
              {currentUser.fullName.split(" ").map(n => n[0]).join("")}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">שלום, {currentUser.fullName}</h2>
           <p className="text-xs text-slate-500 font-medium">
  שייך ל: <span className="text-military-700">{currentUser.unit}</span> · תפקיד:{" "}
  {currentUser.medicalRole ||
    (currentUser.role === "commander"
      ? "מפקד / מנהל"
      : currentUser.role === "adjutant_officer"
      ? "שליש / צפייה"
      : "חייל מדווח")}
</p>
          </div>
        </div>

        {/* Current report card badge */}
        <div className="flex flex-col items-start sm:items-end justify-center">
          <span className="text-[11px] text-slate-400 font-bold block mb-1">דיווח נוכחי לתאריך שנבחר:</span>
          {(() => {
            if (!latestReport) {
              return (
                <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>טרם דיווחת היום!</span>
                </div>
              );
            }
            const statusInfo = statusLabels[latestReport.status] || {
              label: latestReport.status || "לא מוגדר",
              color: "text-slate-600 dark:text-slate-300",
              bg: "bg-slate-50 dark:bg-slate-900/40",
              border: "border-slate-200 dark:border-slate-800"
            };
            return (
              <div id="soldier-latest-report-badge" className={`text-xs px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 ${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`}>
                <span className="w-2 h-2 rounded-full bg-current"></span>
                <span>
  {statusInfo.label}
  {latestReport.dayMarker && (
    <>
      {" / "}
      {latestReport.dayMarker === "return_to_base"
  ? "חזרה לבסיס"
  : latestReport.dayMarker === "exit_home"
  ? "יציאה לבית"
  : latestReport.dayMarker === "after_hours"
? `אפטר${latestReport.afterHours ? ` ${latestReport.afterHours} שעות` : ""}`
  : latestReport.dayMarker}
    </>
  )}
</span>
                <span className="text-[10px] text-slate-400 font-medium">({new Date(latestReport.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })})</span>
              </div>
            );
          })()}
        </div>
      </div>

      <nav
        dir="rtl"
        aria-label="ניווט בעמוד האישי"
        className={`sticky top-2 z-30 grid gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-md backdrop-blur-sm sm:gap-2 sm:p-2 ${
          systemSettings.linePlanningVisibleToSoldiers === false
            ? "grid-cols-4"
            : "grid-cols-5"
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveSection("report")}
          aria-current={activeSection === "report" ? "page" : undefined}
          className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-black transition sm:text-xs ${
            activeSection === "report"
              ? "bg-military-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Activity className="h-4 w-4 shrink-0" />
          <span>דיווח</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("shifts")}
          aria-current={activeSection === "shifts" ? "page" : undefined}
          className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-black transition sm:text-xs ${
            activeSection === "shifts"
              ? "bg-military-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span>משמרות</span>
        </button>
        {systemSettings.linePlanningVisibleToSoldiers !== false && (
          <button
            type="button"
            onClick={() => setActiveSection("planning")}
            aria-current={activeSection === "planning" ? "page" : undefined}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-[10px] font-black transition sm:px-2 sm:text-xs ${
              activeSection === "planning"
                ? "bg-military-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>לוח יציאות</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveSection("order")}
          aria-current={activeSection === "order" ? "page" : undefined}
          className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-black transition sm:text-xs ${
            activeSection === "order"
              ? "bg-military-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span>הצו שלי</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("messages")}
          aria-current={activeSection === "messages" ? "page" : undefined}
          className={`relative flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-black transition sm:text-xs ${
            activeSection === "messages"
              ? "bg-military-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Bell className="h-4 w-4 shrink-0" />
          <span>הודעות</span>
          {commanderMessages.length > 0 && (
            <span
              className={`absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-black ${
                activeSection === "messages"
                  ? "bg-white text-military-800"
                  : "bg-rose-600 text-white"
              }`}
            >
              {commanderMessages.length}
            </span>
          )}
        </button>
      </nav>

      {disciplinaryRestrictionStatus.active && (
        <section
          dir="rtl"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-amber-950">
                    עבודות רס״ר — מניעת שיבוץ פעילה
                  </h3>
                  <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[9px] font-black text-white">
                    פעיל
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-bold leading-5 text-amber-800">
                  בתקופה זו לא ניתן להשתבץ או לשלוח בקשת שיבוץ למשמרות.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2">
                <span className="block text-[9px] font-bold text-slate-500">הושלמו</span>
                <strong className="text-base text-amber-800">
                  {disciplinaryRestrictionStatus.completedDays}/{disciplinaryRestrictionStatus.requiredDays}
                </strong>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2">
                <span className="block text-[9px] font-bold text-slate-500">נותרו</span>
                <strong className="text-base text-amber-800">
                  {disciplinaryRestrictionStatus.remainingDays}
                </strong>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2">
                <span className="block text-[9px] font-bold text-slate-500">חיתוך צו</span>
                <strong className="text-base text-amber-800">
                  {disciplinaryRestrictionStatus.skippedCutOrderDays}
                </strong>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2">
                <span className="block text-[9px] font-bold text-slate-500">
                  {disciplinaryRestrictionStatus.cappedByLineEnd
                    ? "סיום הקו"
                    : "סיום משוער"}
                </span>
                <strong className="text-xs text-amber-900">
                  {disciplinaryRestrictionStatus.expectedEndDate
                    ? new Date(
                        `${disciplinaryRestrictionStatus.expectedEndDate}T12:00:00`
                      ).toLocaleDateString("he-IL")
                    : "לא חושב"}
                </strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeSection === "planning" &&
        systemSettings.linePlanningVisibleToSoldiers !== false && (
          <section
            dir="rtl"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    לוח היציאות שלי
                  </h3>
                  {myLineCycle && (
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {myLineCycle.title} · {new Date(
                        `${myLineCycle.startDate}T12:00:00`
                      ).toLocaleDateString("he-IL")}–{new Date(
                        `${myLineCycle.endDate}T12:00:00`
                      ).toLocaleDateString("he-IL")}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={isMyLinePlanLoading}
                onClick={() => void loadMyLinePlan()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isMyLinePlanLoading ? "טוען..." : "רענן תכנון"}
              </button>
            </div>

            {isMyLinePlanLoading && !myLinePlanLoaded ? (
              <div className="rounded-xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
                טוען את תכנון הנוכחות שלך...
              </div>
            ) : myLinePlanError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center">
                <AlertCircle className="mx-auto mb-2 h-6 w-6 text-rose-500" />
                <p className="text-sm font-black text-rose-700">
                  {myLinePlanError}
                </p>
              </div>
            ) : !myLineCycle ? (
              <div className="rounded-xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
                אין כרגע תכנון קו פעיל.
              </div>
            ) : !myLinePlan ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
                <CalendarDays className="mx-auto mb-2 h-7 w-7 text-amber-500" />
                <p className="text-sm font-black text-amber-800">
                  טרם נקבע עבורך תכנון נוכחות בתקופה זו.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {myLinePlanDates.map((date) => {
                  const actualReport = myLatestDayMarkerByDate.get(date);
                  const storedValue = myLinePlan.dates?.[date];
                  const storedIsDayMarker = [
                    "exit_home",
                    "return_to_base",
                    "after_hours",
                  ].includes(storedValue || "");
                  const dayMarkerValue =
                    actualReport?.dayMarker ||
                    (storedIsDayMarker ? storedValue : undefined);
                  const presenceValue =
                    actualReport?.status ||
                    (storedIsDayMarker ? "base" : storedValue);
                  const presenceStatus =
                    presenceValue === "line"
                      ? basePlanningStatus
                      : presenceValue
                      ? linePlanStatusById.get(presenceValue)
                      : undefined;
                  const dayMarkerStatus = dayMarkerValue
                    ? linePlanStatusById.get(dayMarkerValue)
                    : undefined;
                  const isToday = date === getTodayLocalDate();
                  return (
                    <article
                      key={date}
                      className={`min-h-24 rounded-xl border p-3 text-center ${
                        presenceStatus
                          ? `${presenceStatus.bg} ${presenceStatus.border}`
                          : "border-slate-200 bg-slate-50"
                      } ${isToday ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
                    >
                      <p className="text-[10px] font-black text-slate-500">
                        {new Date(`${date}T12:00:00`).toLocaleDateString(
                          "he-IL",
                          { weekday: "short" }
                        )}
                      </p>
                      <p className="mt-0.5 text-xs font-black text-slate-800">
                        {new Date(`${date}T12:00:00`).toLocaleDateString(
                          "he-IL",
                          { day: "2-digit", month: "2-digit" }
                        )}
                      </p>
                      <div
                        className={`mt-2 text-xs font-black ${
                          presenceStatus?.color || "text-slate-400"
                        }`}
                      >
                        {presenceStatus ? (
                          <>
                            {presenceStatus.icon && (
                              <span className="mb-1 block text-base" aria-hidden="true">
                                {presenceStatus.icon}
                              </span>
                            )}
                            {presenceStatus.label}
                          </>
                        ) : (
                          "טרם נקבע"
                        )}
                      </div>
                      {dayMarkerStatus && (
                        <div
                          className={`mt-1 rounded-md border px-1.5 py-1 text-[10px] font-black ${dayMarkerStatus.bg} ${dayMarkerStatus.color} ${dayMarkerStatus.border}`}
                        >
                          {dayMarkerStatus.label}
                          {dayMarkerValue === "after_hours" &&
                          actualReport?.afterHours
                            ? ` · ${actualReport.afterHours} שעות`
                            : ""}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

      {activeSection === "messages" && commanderMessages.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm" dir="rtl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-black text-slate-900">הודעות מהמפקד</h3>
            </div>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">
              {commanderMessages.filter(
                (message) => !message.acknowledgements?.[currentUser.userId]
              ).length} חדשות
            </span>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto custom-scrollbar">
            {commanderMessages.map((message) => {
              const acknowledgement =
                message.acknowledgements?.[currentUser.userId];
              return (
                <article
                  key={message.messageId}
                  className={`rounded-xl border p-4 ${
                    message.important
                      ? "border-amber-300 bg-amber-50"
                      : "border-blue-100 bg-white"
                  } ${acknowledgement ? "opacity-75" : "shadow-sm"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900">
                          {message.title}
                        </h4>
                        {message.important && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-white">
                            חשוב
                          </span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                        {message.content}
                      </p>
                      <p className="mt-2 text-[10px] font-bold text-slate-400">
                        {message.createdByName} · {new Date(message.createdAt).toLocaleString("he-IL")}
                      </p>
                    </div>
                    {acknowledgement ? (
                      <div className="rounded-lg bg-emerald-100 px-3 py-2 text-[10px] font-black text-emerald-700">
                        <CheckCheck className="mx-auto mb-1 h-4 w-4" />
                        אושר {new Date(acknowledgement.readAt).toLocaleString("he-IL")}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={readOnly || acknowledgingMessageId === message.messageId}
                        onClick={() => handleAcknowledgeMessage(message.messageId)}
                        className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {readOnly
                          ? "תצוגה בלבד"
                          : acknowledgingMessageId === message.messageId
                          ? "שומר..."
                          : "קראתי ואישרתי"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeSection === "messages" && commanderMessages.length === 0 && (
        <section
          dir="rtl"
          className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <Bell className="mx-auto mb-3 h-7 w-7 text-slate-300" />
          <h3 className="text-sm font-black text-slate-700">אין הודעות חדשות</h3>
          <p className="mt-1 text-xs font-bold text-slate-400">
            הודעות שאושרו מוסרות מהעמוד באופן אוטומטי.
          </p>
        </section>
      )}

      {activeSection === "order" && (
      <section
        dir="rtl"
        className={`rounded-xl border px-4 py-3 shadow-sm sm:px-5 ${
          orderState === "active"
            ? "border-emerald-200 bg-emerald-50"
            : orderState === "excluded"
            ? "border-amber-200 bg-amber-50"
            : orderState === "future"
            ? "border-blue-200 bg-blue-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                orderState === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : orderState === "excluded"
                  ? "bg-amber-100 text-amber-700"
                  : orderState === "future"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-slate-800">הצו שלי</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    orderState === "active"
                      ? "bg-emerald-600 text-white"
                      : orderState === "excluded"
                      ? "bg-amber-500 text-white"
                      : orderState === "future"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {orderState === "active"
                    ? "צו פעיל"
                    : orderState === "excluded"
                    ? "מחוץ לצו היום"
                    : orderState === "future"
                    ? "צו עתידי"
                    : orderState === "ended"
                    ? "הצו הסתיים"
                    : "אין צו פעיל"}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOrderCollapsed((current) => !current)}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white/80 px-2 py-1 text-[10px] font-black text-slate-600 transition hover:bg-white"
                  aria-expanded={!isOrderCollapsed}
                >
                  {isOrderCollapsed ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                  {isOrderCollapsed ? "הצג" : "מזער"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCollapseHelp((current) =>
                      current === "order" ? null : "order"
                    )
                  }
                  className="rounded-full p-1 text-slate-500 transition hover:bg-white/80 hover:text-blue-700"
                  aria-label="הסבר על שמירת מצב המיזעור"
                  title="הסבר על שמירת מצב המיזעור"
                >
                  <AlertCircle className="h-4 w-4" />
                </button>
              </div>
              {collapseHelp === "order" && (
                <p className="mt-1 rounded-lg bg-white/80 px-2 py-1.5 text-[10px] font-bold leading-4 text-slate-600">
                  מצב המיזעור נשמר במכשיר ויישאר כפי שבחרת גם בכניסה הבאה, עד שתפתח או תמזער מחדש.
                </p>
              )}
              {!isOrderCollapsed && (hasOrderPeriod ? (
                <div className="mt-1 space-y-1">
                  <p className="text-xs font-black text-slate-700">
                    {displayedOrderEvent?.title}
                  </p>
                  <p className="text-xs font-bold text-slate-600">
                    {new Date(`${orderStartDate}T12:00:00`).toLocaleDateString("he-IL")} –{" "}
                    {new Date(`${orderEndDate}T12:00:00`).toLocaleDateString("he-IL")}
                    <span className="mr-2 text-slate-400">
                      ({totalEffectiveOrderDays} ימי צו)
                    </span>
                  </p>
                  {[
                    ["תאריך עלייה לאימון", displayedOrderEvent?.trainingStartDate],
                    ["תאריך עלייה לקו", displayedOrderEvent?.lineStartDate],
                    ["תאריך סיום הקו", displayedOrderEvent?.lineEndDate],
                    [
                      "תאריך תחילת צו אישי",
                      personalOrderStartDate !== globalOrderStartDate
                        ? personalOrderStartDate
                        : "",
                    ],
                    [
                      "תאריך סיום אישי",
                      personalOrderEndDate !== globalOrderEndDate
                        ? personalOrderEndDate
                        : "",
                    ],
                    [
                      processingDayLabel,
                      isExcludedFromProcessing
                        ? ""
                        : displayedOrderEvent?.processingDate,
                    ],
                    [
                      `ימי עיבוד אישיים (${personalSeparateBenefits?.processingDays || 0})`,
                      personalSeparateBenefits?.processingDays
                        ? personalSeparateBenefits.processingDate
                        : "",
                    ],
                    [
                      `ימי משפחות אישיים (${personalSeparateBenefits?.familyDays || 0})`,
                      personalSeparateBenefits?.familyDays
                        ? personalSeparateBenefits.familyDate
                        : "",
                    ],
                  ].some(([, value]) => Boolean(value)) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                      {[
                        ["תאריך עלייה לאימון", displayedOrderEvent?.trainingStartDate],
                        ["תאריך עלייה לקו", displayedOrderEvent?.lineStartDate],
                        ["תאריך סיום הקו", displayedOrderEvent?.lineEndDate],
                        [
                          "תאריך תחילת צו אישי",
                          personalOrderStartDate !== globalOrderStartDate
                            ? personalOrderStartDate
                            : "",
                        ],
                        [
                          "תאריך סיום אישי",
                          personalOrderEndDate !== globalOrderEndDate
                            ? personalOrderEndDate
                            : "",
                        ],
                        [
                          processingDayLabel,
                          isExcludedFromProcessing
                            ? ""
                            : displayedOrderEvent?.processingDate,
                        ],
                        [
                          `ימי עיבוד אישיים (${personalSeparateBenefits?.processingDays || 0})`,
                          personalSeparateBenefits?.processingDays
                            ? personalSeparateBenefits.processingDate
                            : "",
                        ],
                        [
                          `ימי משפחות אישיים (${personalSeparateBenefits?.familyDays || 0})`,
                          personalSeparateBenefits?.familyDays
                            ? personalSeparateBenefits.familyDate
                            : "",
                        ],
                      ]
                        .filter(([, value]) => Boolean(value))
                        .map(([label, value]) => (
                          <span
                            key={label}
                            className="rounded-md border border-slate-200 bg-white/80 px-2 py-1"
                          >
                            {label}: {new Date(`${value}T12:00:00`).toLocaleDateString("he-IL")}
                          </span>
                        ))}
                    </div>
                  )}
                  {displayedOrderEvent?.note && (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2 text-[11px] font-bold text-slate-600">
                      הערה: {displayedOrderEvent.note}
                    </p>
                  )}
                  {excludedOrderDates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800">
                        ימי צו בפועל: {totalEffectiveOrderDays} מתוך{" "}
                        {getInclusiveDayCount(orderStartDate, orderEndDate)}
                      </span>
                      <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-800">
                        ימים מחוץ לצו: {excludedOrderDates.length}
                      </span>
                    </div>
                  )}
                  {isExcludedFromProcessing && (
                    <div className="flex">
                      <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">
                        לא משתתף בימי{" "}
                        {processingDayType === "family" ? "המשפחות" : "העיבוד"}
                      </span>
                    </div>
                  )}
                  {personalLastServiceDate && (
                    <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5">
                        <span className="block font-bold text-slate-500">שירות בפועל</span>
                        <strong className="text-slate-800">
                          {totalActualServiceDays} ימים
                        </strong>
                        <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                          {isExcludedFromProcessing
                            ? `ללא ימי ${
                                processingDayType === "family"
                                  ? "משפחות"
                                  : "עיבוד"
                              }`
                            : `מתוכם ${processingDays} ${processingDayLabel}`}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5">
                        <span className="block font-bold text-slate-500">ימי התרעננות</span>
                        <strong className="text-slate-800">{refreshmentDays} ימים</strong>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-2 py-1.5">
                        <span className="block font-bold text-blue-700">סה״כ ימים קלנדריים</span>
                        <strong className="text-blue-900">{totalCalendarDays} ימים</strong>
                        <span className="mt-0.5 block text-[10px] font-bold text-blue-600">
                          ימי צו + תקופת {processingDayType === "family" ? "משפחות" : "עיבוד"} + תקופת התרעננות
                        </span>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-100/80 px-2 py-1.5">
                        <span className="block font-bold text-emerald-700">סיום אישי כולל</span>
                        <strong className="text-emerald-900">
                          {new Date(`${personalEntitlementEndDate}T12:00:00`).toLocaleDateString("he-IL")}
                        </strong>
                      </div>
                    </div>
                  )}
                  {displayedOrderEvent?.location && (
                    <p className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {displayedOrderEvent.location}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs font-medium text-slate-500">
                  לא נפתח צו גדודי במערכת
                </p>
              ))}
            </div>
          </div>

          {!isOrderCollapsed &&
            (orderState === "active" || orderState === "excluded") && (
            <div className="rounded-lg bg-white/80 px-3 py-2 text-center shadow-sm">
              <div className="mb-0.5 block text-xs font-black leading-none text-slate-600">
                נותרו
              </div>
              <span className="block text-lg font-black text-emerald-700">
                {remainingOrderDays}
              </span>
              <span className="block text-[10px] font-bold text-slate-500">
                ימים כולל היום
              </span>
              {orderEndDate > remainingOrderEndDate && (
                <span className="mt-1 block border-t border-slate-200 pt-1 text-[9px] font-bold text-slate-400">
                  עד סיום הצו: {remainingUntilOrderEndDays} ימים
                </span>
              )}
            </div>
          )}
        </div>
      </section>
      )}

      {activeSection === "shifts" && (
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" dir="rtl">
        <div className="flex items-center justify-end gap-2 lg:col-span-2">
          <button
            type="button"
            onClick={() => {
              const shouldOpenBoth =
                isNextShiftCollapsed && isWeeklyShiftsCollapsed;
              setIsNextShiftCollapsed(!shouldOpenBoth);
              setIsWeeklyShiftsCollapsed(!shouldOpenBoth);
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-expanded={
              !isNextShiftCollapsed || !isWeeklyShiftsCollapsed
            }
          >
            {isNextShiftCollapsed && isWeeklyShiftsCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
            {isNextShiftCollapsed && isWeeklyShiftsCollapsed
              ? "פתח את שתי תצוגות המשמרות"
              : "מזער את שתי תצוגות המשמרות"}
          </button>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-black text-slate-800">המשמרת הבאה שלי</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsNextShiftCollapsed((current) => !current)}
                className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-indigo-700 transition hover:bg-indigo-50"
                aria-expanded={!isNextShiftCollapsed}
                aria-label="פתיחה או מזעור של המשמרת הבאה"
              >
                {isNextShiftCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
                {isNextShiftCollapsed ? "הצג" : "מזער"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setCollapseHelp((current) =>
                    current === "shifts" ? null : "shifts"
                  )
                }
                className="rounded-full p-1 text-slate-500 transition hover:bg-white hover:text-blue-700"
                aria-label="הסבר על שמירת מצב המיזעור"
                title="הסבר על שמירת מצב המיזעור"
              >
                <AlertCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          {collapseHelp === "shifts" && (
            <p className="mb-3 rounded-lg bg-white/80 px-2.5 py-2 text-[10px] font-bold leading-4 text-slate-600">
              מצב המיזעור של שני אזורי המשמרות נשמר במכשיר ויישאר כפי שבחרת גם בכניסה הבאה.
            </p>
          )}

          {!isNextShiftCollapsed && (nextShift ? (
            <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-black text-slate-900">{nextShift.title}</p>
                  <p className="mt-1 text-xs font-bold text-indigo-700">
                    {getShiftAssignmentLabel(nextShift)}
                  </p>
                </div>
                <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-[11px] font-black text-indigo-700">
                  {nextShift.shiftType}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-600">
                {formatShiftDateTime(nextShift.startAt)} – {formatShiftDateTime(nextShift.endAt)}
              </p>
              {nextShift.location && (
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {nextShift.location}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-xs font-bold text-slate-400">
              אין לך משמרת עתידית שפורסמה
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-military-600" />
              <h3 className="text-base font-black text-slate-800">המשמרות שלי השבוע</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                {weeklyShifts.length}
              </span>
              <button
                type="button"
                onClick={() => setIsWeeklyShiftsCollapsed((current) => !current)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-black text-slate-600 transition hover:bg-slate-100"
                aria-expanded={!isWeeklyShiftsCollapsed}
                aria-label="פתיחה או מזעור של המשמרות השבועיות"
              >
                {isWeeklyShiftsCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
                {isWeeklyShiftsCollapsed ? "הצג" : "מזער"}
              </button>
            </div>
          </div>

          {!isWeeklyShiftsCollapsed && (weeklyShifts.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pl-1 custom-scrollbar">
              {weeklyShifts.map((shift) => (
                <div
                  key={shift.shiftId}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800">{shift.title}</span>
                    <span className="text-[10px] font-bold text-military-700">
                      {getShiftAssignmentLabel(shift)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] font-bold text-slate-500">
                    {formatShiftDateTime(shift.startAt)} – {formatShiftDateTime(shift.endAt)}
                  </p>
                  {shift.location && (
                    <p className="mt-1 text-[11px] text-slate-400">{shift.location}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs font-bold text-slate-400">
              לא נמצאו משמרות שפורסמו בשבוע הנוכחי
            </div>
          ))}
        </div>
      </section>
      )}

      {activeSection === "report" && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* REPORT FORM */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
  <div className="flex items-center gap-2">
    <Activity className="w-5 h-5 text-military-500" />
    <h3 className="text-base font-bold text-slate-800">
      דיווח נוכחות ומצב נוכחי
    </h3>
  </div>

  <button
  type="button"
  onClick={() => setIsHelpOpen(true)}
  className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black flex items-center gap-1"
>
  <CircleHelp className="w-4 h-4" />
  עזרה
</button>
</div>

          <form onSubmit={handleFormSubmit} className="min-w-0 space-y-5">
            <div>
  <label className="block text-sm font-bold text-slate-700 mb-2">
    תאריך דיווח
  </label>

  <input
    type="date"
    value={reportDate}
    onChange={(e) => setReportDate(e.target.value)}
    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-military-400 outline-none"
  />
</div>
            {/* 1. Status Selection */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2.5">
                1. בחר סטטוס נוכחות נוכחי: <span className="text-rose-500">*</span>
              </label>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {soldierStatusOptions.map((statusConfig) => {
                  const st = statusConfig.id as AttendanceStatus;
                  const item = {
                    label: statusConfig.label,
                    color: statusConfig.color,
                    bg: statusConfig.bg,
                    border: statusConfig.border,
                  };
                  const isSelected = status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`p-3.5 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between h-20 ${
                        isSelected 
                          ? `${item.bg} border-2 ${item.border.replace("/60", "")} shadow-sm ring-1 ring-offset-1 ring-military-300` 
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <span className={`text-xs font-bold ${item.color}`}>{item.label}</span>
                      <span className="text-[10px] text-slate-400 font-medium">בחר מצב זה</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {!isDateRangeReport && ["base", "home"].includes(status) && (
  <div className="min-w-0 space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
    <label className="block text-sm font-bold text-slate-700">
      סימון יום
    </label>

    <select
      value={dayMarker}
      onChange={(e) => setDayMarker(e.target.value as any)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
    >
      <option value="">ללא סימון</option>

      {status === "base" && (
        <>
          <option value="return_to_base">חזרה לבסיס</option>
          <option value="exit_home">יציאה לבית</option>
        </>
      )}

      {status === "home" && (
        <option value="return_to_base">חזרה לבסיס</option>
      )}
    </select>
  </div>
)}
            {showOptionalDateRangeToggle && (
  <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
    <input
      type="checkbox"
      checked={isDateRangeReport}
      onChange={(e) => setIsDateRangeReport(e.target.checked)}
    />
    דיווח לטווח תאריכים
  </label>
)}
          {showDateRangeFields && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">

    {status === "base" && (
      <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 font-medium">
        ℹ️ בדיווח "בבסיס" לטווח תאריכים:
        <br />
        היום הראשון יסומן כחזרה לבסיס.
        <br />
        היום האחרון יסומן כיום יציאה לבית.
      </div>
    )}

    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">
        מתאריך
      </label>

      <input
        type="date"
        value={cutOrderStartDate}
        onChange={(e) => setCutOrderStartDate(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2"
      />
    </div>

    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">
        עד תאריך
      </label>

      <input
        type="date"
        value={cutOrderEndDate}
        onChange={(e) => setCutOrderEndDate(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2"
      />
    </div>
  </div>
)}

            {/* 2. Location Input with GPS validation */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-bold text-slate-700">
                  2. איפה אתה נמצא? (מיקום פיזי מדויק): <span className="text-rose-500">*</span>
                  {requiresGps && (
                    <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      GPS חובה
                    </span>
                  )}
                </label>
                
                <button
                  type="button"
                  onClick={handleGetLocation}
                  disabled={geoState === "fetching"}
                  className="text-xs text-military-600 dark:text-military-700 font-bold hover:text-military-800 flex items-center gap-1 cursor-pointer"
                >
                  <Compass className={`w-3.5 h-3.5 ${geoState === "fetching" ? "animate-spin text-military-400" : ""}`} />
                  <span>
                    {geoState === "idle" && "אימות מיקום GPS"}
                    {geoState === "fetching" && "מאתר לוויינים..."}
                    {geoState === "success" && "מיקום אומת בהצלחה!"}
                    {geoState === "error" && "שגיאה, נסה שנית"}
                  </span>
                </button>
              </div>

              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="הקלד שם בסיס, ישוב, או מקום פעילות..."
                  className="block w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-military-400 outline-none"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              {/* Coordinates Badge */}
              {coords && (
                <div className="mt-2 text-xs bg-emerald-50 border border-emerald-100 text-emerald-800 p-2 rounded-lg flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                    <span>אימות GPS מאושר לדיווח</span>
                  </span>
                  <span className="font-mono text-[10px]">
                    Lat: {coords.lat.toFixed(4)}°, Lng: {coords.lng.toFixed(4)}°
                  </span>
                  <a
  href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
  target="_blank"
  rel="noopener noreferrer"
  className="text-[10px] font-bold text-blue-700 underline"
>
  פתח במפות
</a>
                </div>
              )}
            </div>

            {/* 3. Notes */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                3. הערות / הסבר נוסף{selectedStatusConfig?.requiresNote ? " (חובה)" : " (אופציונלי)"}:
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute top-2.5 right-3 text-slate-400">
                  <FileText className="h-4 w-4" />
                </div>
                <textarea
                  rows={2}
                  placeholder="למשל: 'מחכה להסעה לשטח', 'בביקורת רפואית', 'באישור רס״ר'"
                  className="block w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-military-400 outline-none resize-none"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            {requiresCommanderApproval && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                הדיווח יישמר כממתין לאישור מפקד.
              </div>
            )}

            {/* Safety Declaration */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-military-500 mt-0.5 shrink-0" />
              <div className="text-[11px] text-slate-500 leading-relaxed">
                <span className="font-bold text-slate-700 block">הצהרת אמינות נוכחות</span>
                דיווחי נוכחות חתומים בסטמפ דיגיטלי בלתי הפיך הכולל שרת זמן מדויק. דיווח כוזב מהווה עבירת משמעת חמורה ועלול להוביל לדין משמעתי.
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                readOnly ||
                !location.trim() ||
                (requiresGps && !coords) ||
                (showDateRangeFields && (!cutOrderStartDate || !cutOrderEndDate))
              }
              className={`w-full py-3 rounded-xl font-bold text-sm tracking-wide text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                !location.trim() ||
                (requiresGps && !coords) ||
                (showDateRangeFields && (!cutOrderStartDate || !cutOrderEndDate))
                  ? "bg-slate-300 cursor-not-allowed" 
                  : "bg-military-700 hover:bg-military-800"
              }`}
            >
              <Send className="w-4 h-4" />
              <span>
                {readOnly
                  ? "תצוגה בלבד — לא ניתן לשלוח דיווח"
                  : isSubmitting
                  ? latestReport
                    ? "מעדכן דיווח..."
                    : "שולח דיווח מאובטח..."
                  : latestReport
                  ? "עדכן את הדיווח של יום זה"
                  : "שלח דיווח נוכחות ומצב לענן"}
              </span>
            </button>
          </form>

          {/* Success Banner */}
          {actionSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs px-3.5 py-2.5 rounded-lg font-bold flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>הדיווח שלך התקבל בהצלחה ונחתם בשעון השרת הצה״לי! המפקד קיבל הודעה על כך.</span>
            </motion.div>
          )}
        </div>

        {/* RECENT REPORTS CARD */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
              <CalendarDays className="w-5 h-5 text-military-500" />
              <h3 className="text-base font-bold text-slate-800">היסטוריית הדיווחים שלך</h3>
            </div>

            <div className="min-w-0 space-y-3.5 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
  {userReports.length === 0 ? (
    <div className="text-center py-10 text-slate-400 text-xs">
      אין דיווחים קודמים רשומים במערכת
    </div>
  ) : (
    userReports.map((r) => {
      const statusInfo = statusLabels[r.status] || {
        label: r.status || "לא מוגדר",
        color: "text-slate-600 dark:text-slate-300",
        bg: "bg-slate-50 dark:bg-slate-900/40",
        border: "border-slate-200 dark:border-slate-800",
      };

      const reportDay =
  (r as any).reportDate ||
  r.timestamp?.split("T")[0];

const reportDateText = reportDay
  ? reportDay.split("-").reverse().slice(0, 2).join("/")
  : "";

const reportTimeText = r.timestamp
  ? new Date(r.timestamp).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    })
  : "";

const formattedDateTime = `${reportDateText} ${reportTimeText}`;

      const createdByRole = (r as any).createdByRole;
      const createdByName = (r as any).createdByName;
      const updatedByName = (r as any).updatedByName;
      const updatedByRole = (r as any).updatedByRole;
      const updatedAt = (r as any).updatedAt;

      const createdByLabel =
        createdByRole === "commander"
          ? `דווח ע״י מפקד${createdByName ? `: ${createdByName}` : ""}`
          : createdByRole === "adjutant_officer"
          ? `דווח ע״י שליש${createdByName ? `: ${createdByName}` : ""}`
          : "דווח ע״י החייל";

      const wasEdited =
        updatedAt &&
        updatedAt !== r.timestamp &&
        (updatedByName || updatedByRole);

      return (
        <div
          key={r.reportId}
          className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2 text-xs"
        >
          <div className="flex justify-between items-center">
            <span
  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
    (r as any).isReset
      ? "bg-slate-100 text-slate-600 border-slate-300"
      : `${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`
  }`}
>
  {(r as any).isReset ? (
    <>אופס ע״י מפקד</>
  ) : (
    <>
      {statusInfo.label}

      {r.dayMarker && (
        <>
          {" / "}
          {r.dayMarker === "return_to_base"
            ? "חזרה לבסיס"
            : r.dayMarker === "exit_home"
            ? "יציאה לבית"
            : r.dayMarker === "after_hours"
            ? `אפטר${r.afterHours ? ` ${r.afterHours} שעות` : ""}`
            : r.dayMarker}
        </>
      )}
    </>
  )}
</span>

            <span className="text-[10px] text-slate-400 font-mono">
              {formattedDateTime}
            </span>
          </div>

          <div className="text-slate-700 font-semibold flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{r.location}</span>
          </div>

          {r.note && (
            <div className="text-slate-500 text-[11px] bg-white p-1 rounded border border-slate-100">
              {r.note}
            </div>
          )}

          <div className="pt-1.5 border-t border-slate-100 flex flex-col gap-1.5 text-[10px]">
            <div className="flex flex-col gap-1">
              <span
                className={`font-black ${
                  createdByRole === "commander"
                    ? "text-blue-700"
                    : createdByRole === "adjutant_officer"
                    ? "text-purple-700"
                    : "text-emerald-700"
                }`}
              >
                {createdByLabel}
              </span>

             
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">מאושר ע״י מפקד:</span>

              {r.verifiedBy ? (
                <span className="text-emerald-700 dark:text-emerald-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  אושר בהצלחה
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  ממתין לבדיקה
                </span>
              )}
            </div>
          </div>
        </div>
      );
    })
  )}
</div>

          <div className="pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 font-medium leading-relaxed mt-4">
            סה״כ דיווחים שנשמרו: {userReports.length}
          </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
  <h4 className="text-xs font-black text-slate-700 mb-3">
    דיווחים שנערכו ע״י מפקד
  </h4>

  {commanderEditedReports.length === 0 ? (
    <p className="text-[11px] text-slate-400 font-bold">
      לא קיימות עריכות מפקד לדיווחים שלך
    </p>
  ) : (
    <div className="min-w-0 space-y-2 max-h-[220px] overflow-y-auto pr-1">
      {commanderEditedReports.map((r) => {
        const statusInfo = statusLabels[r.status];
const updatedAt = (r as any).updatedAt;
const updatedByName = (r as any).updatedByName;

const reportDay =
  (r as any).reportDate ||
  r.timestamp?.split("T")[0];

const reportDateText = reportDay
  ? reportDay.split("-").reverse().join("/")
  : "";

const reportTimeText = new Date(r.timestamp).toLocaleTimeString("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
});

        return (
          <div
            key={`commander-edit-${r.reportId}`}
            className="p-2.5 rounded-lg border border-blue-100 bg-blue-50 text-[11px] space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-blue-700">
                נערך ע״י מפקד{updatedByName ? `: ${updatedByName}` : ""}
              </span>

              <span className="text-slate-500 font-mono whitespace-nowrap">
                {new Date(updatedAt).toLocaleString("he-IL")}
              </span>
            </div>

            <div className="text-slate-700 font-bold">
              דיווח מתאריך {reportDateText} בשעה {reportTimeText} ·{" "}
{statusInfo?.label || r.status} · {r.location || "לא צוין"}
            </div>

            {r.note && (
              <div className="text-slate-500">
                הערה: {r.note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
        </div>
          </div>

      </div>
      )}
<AnimatePresence>
  {isHelpOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[12000] flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-sm"
      onClick={() => setIsHelpOpen(false)}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[88vh] overflow-y-auto text-right"
        dir="rtl"
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-800">
            עזרה בדיווח נוכחות
          </h3>

          <button
            type="button"
            onClick={() => setIsHelpOpen(false)}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-black"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs leading-relaxed text-slate-600">
          <section>
            <h4 className="font-black text-slate-800 mb-1">מתי לדווח?</h4>
            <p>
              יש לדווח בתחילת היום או בכל שינוי מצב במהלך היום. אם בחרת תאריך אחר,
              הדיווח יישמר עבור אותו תאריך.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-800 mb-2">הסבר סטטוסים</h4>
            <div className="min-w-0 space-y-2">
              <p><b>בבסיס</b> — כאשר אתה נמצא ביחידה או בבסיס.</p>
              <p><b>בית / אפטר</b> — יום בית מלא בלבד: קמת בבית והלכת לישון בבית. יציאה חלקית או חזרה באותו יום יש לסמן באמצעות סימון יום.</p>
              <p className="mt-2 text-amber-700 font-black"> ⚠️ אפטר — רק בעדכון של אבי. כל יציאה לאפטר חייבת להיות מדווחת לאבי על מנת שיעדכן אותה במערכת.</p>
              <p><b>שטח / אימון</b> — כאשר אתה נמצא באימון, משימה או שטח.</p>
              <p><b>גימלים</b> — כאשר אתה בגימלים או מחלה מאושרת.</p>
              <p><b>קורס / הכשרה</b> — כאשר אתה בקורס, השתלמות או הכשרה.</p>
              <p><b>חיתוך צו</b> — לא מסומן ע״י חייל. רק מפקד יכול לעדכן מצב זה.</p>
            </div>
          </section>

          <section>
            <h4 className="font-black text-slate-800 mb-2">סימון יום</h4>
            <p>
              סימון יום מופיע רק במצבים מסוימים, ומשמש כדי להבהיר מעבר במהלך היום.
            </p>
            <div className="mt-2 space-y-1">
              <p><b>חזרה לבסיס</b> — כאשר חזרת מהבית או מחופשה לבסיס.</p>
              <p><b>יציאה לבית</b> — כאשר יצאת מהבסיס לבית.</p>
            </div>
          </section>

          <section>
            <h4 className="font-black text-slate-800 mb-2">דיווח לטווח תאריכים</h4>
            <p>
  בדיווח לטווח תאריכים, היום הראשון בטווח יסומן אוטומטית כ־
  <b>חזרה לבסיס</b>, והיום האחרון בטווח יסומן אוטומטית כ־
  <b>יציאה לבית</b>.
</p>
<p className="mt-2 font-black text-rose-700">
  חשוב: יום נחשב “בית” רק אם קמת בבית וגם הלכת לישון בבית.
</p>
          </section>

          <section>
            <h4 className="font-black text-slate-800 mb-2">מיקום ו־GPS</h4>
            <p>
              יש להזין מיקום ברור, למשל בסיס, בית, שטח אימונים או מקום פעילות.
              ניתן ללחוץ על “אימות מיקום GPS” כדי לצרף מיקום מאומת לדיווח.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-800 mb-2">הערות</h4>
            <p>
              בשדה ההערות אפשר להוסיף הסבר קצר, למשל אישור חריג, המתנה להסעה,
              ביקורת רפואית או כל פרט שהמפקד צריך לדעת.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => setIsHelpOpen(false)}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-xs font-black"
          >
            הבנתי, סגור
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
    </div>
  );
}
