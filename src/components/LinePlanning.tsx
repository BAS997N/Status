import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Lock,
  Plus,
  Save,
  Search,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  AttendanceStatusConfig,
  LineConstraint,
  LineConstraintPeriod,
  LineConstraintPriority,
  LineCycle,
  LineCycleStatus,
  LinePresencePlan,
  LinePresenceStatus,
  SystemSettingsConfig,
  UserProfile,
} from "../types";
import { dataService } from "../services/dataService";

interface LinePlanningProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  canManage: boolean;
  readOnly?: boolean;
  systemSettings?: SystemSettingsConfig | null;
  attendanceStatuses: AttendanceStatusConfig[];
  onSystemSettingsChanged: (settings: SystemSettingsConfig) => void;
}

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 10);
};

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const getDatesInRange = (startDate: string, endDate: string) => {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate && dates.length < 370) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
};

const priorityLabel: Record<LineConstraintPriority, string> = {
  request: "בקשה",
  preferred: "מועדף",
  required: "חובה",
};

const priorityClasses: Record<LineConstraintPriority, string> = {
  request: "border-violet-200 bg-violet-50 text-violet-800",
  preferred: "border-amber-200 bg-amber-50 text-amber-800",
  required: "border-rose-200 bg-rose-50 text-rose-800",
};

const legacyDatesToPeriods = (
  dates: string[],
  notesByDate: Record<string, string> = {}
): LineConstraintPeriod[] => {
  const sortedDates = Array.from(new Set(dates)).sort();
  const periods: LineConstraintPeriod[] = [];

  sortedDates.forEach((date) => {
    const previous = periods[periods.length - 1];
    if (previous && addDays(previous.endDate, 1) === date) {
      previous.endDate = date;
      const dateNote = notesByDate[date]?.trim();
      if (dateNote && !previous.note?.includes(dateNote)) {
        previous.note = [previous.note, dateNote].filter(Boolean).join(" | ");
      }
      return;
    }

    periods.push({
      periodId: `legacy_${date}`,
      startDate: date,
      endDate: date,
      priority: "required",
      note: notesByDate[date]?.trim() || "",
    });
  });

  return periods;
};

const datesToPeriods = (
  dates: string[],
  existingPeriods: LineConstraintPeriod[]
): LineConstraintPeriod[] => {
  const grouped = legacyDatesToPeriods(dates);
  const usedIds = new Set<string>();

  return grouped.map((group, index) => {
    const matchingPeriod = [...existingPeriods]
      .map((period) => ({
        period,
        overlap: getDatesInRange(group.startDate, group.endDate).filter(
          (date) => date >= period.startDate && date <= period.endDate
        ).length,
      }))
      .sort((a, b) => b.overlap - a.overlap)
      .find((item) => item.overlap > 0)?.period;

    const canReuseId =
      matchingPeriod && !usedIds.has(matchingPeriod.periodId);
    const periodId = canReuseId
      ? matchingPeriod.periodId
      : `period_${group.startDate}_${index}_${Date.now()}`;
    usedIds.add(periodId);

    return {
      ...group,
      periodId,
      priority: matchingPeriod?.priority || "request",
      note: matchingPeriod?.note || "",
    };
  });
};

const formatDate = (value: string, includeYear = false) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    ...(includeYear ? { year: "numeric" } : {}),
  });

const statusLabel: Record<LineCycleStatus, string> = {
  open: "פתוח להזנת אילוצים",
  closed: "סגור להזנה",
  archived: "בארכיון",
};

const PLANNING_ONLY_STATUSES: AttendanceStatusConfig[] = [
  {
    id: "exit_home",
    label: "יציאה לבית",
    enabled: true,
    visibleToSoldiers: false,
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
    visibleToSoldiers: false,
    visibleToCommanders: true,
    sortOrder: 1002,
    systemStatus: false,
    chartCategory: "present",
    color: "text-blue-800",
    bg: "bg-blue-100",
    border: "border-blue-300",
  },
  {
    id: "recall_base",
    label: "הקפצה (בסיס)",
    enabled: true,
    visibleToSoldiers: false,
    visibleToCommanders: true,
    sortOrder: 1003,
    systemStatus: false,
    chartCategory: "present",
    color: "text-red-800",
    bg: "bg-red-100",
    border: "border-red-300",
  },
];

const normalizeRoleName = (value?: string) =>
  String(value || "")
    .replace(/[״"'׳/\\().\-\s]/g, "")
    .toLocaleLowerCase("he");

const getPlanningRoleRank = (user: UserProfile) => {
  const role = normalizeRoleName(`${user.medicalRole || ""} ${user.unit || ""}`);
  if (role.includes("מפרפואה")) return 0;
  if (role.includes("סגל") && role.includes("פיקוד") && role.includes("רפוא")) return 1;
  if (role.includes("רופא")) return 2;
  if (role.includes("פראמדיק") || role.includes("פרמדיק")) return 3;
  if (role.includes("מנהל") && role.includes("אירוע")) return 4;
  if (role.includes("חייל") && role.includes("תאגד")) return 5;
  if (role.includes("תאגד") && role.includes("מסופח")) return 6;
  return 99;
};

export default function LinePlanning({
  currentUser,
  allUsers,
  canManage,
  readOnly = false,
  systemSettings,
  attendanceStatuses,
  onSystemSettingsChanged,
}: LinePlanningProps) {
  const canEdit = canManage && !readOnly;
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const matrixHeaderScrollRef = useRef<HTMLDivElement>(null);
  const today = getLocalDate();
  const [cycles, setCycles] = useState<LineCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [constraints, setConstraints] = useState<LineConstraint[]>([]);
  const [plans, setPlans] = useState<LinePresencePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newStartDate, setNewStartDate] = useState(today);
  const [newEndDate, setNewEndDate] = useState(addDays(today, 27));
  const [newDeadline, setNewDeadline] = useState(today);
  const [editingCycleId, setEditingCycleId] = useState("");
  const [search, setSearch] = useState("");
  const [hiddenPlanningRoles, setHiddenPlanningRoles] = useState<string[]>([]);
  const [hidePastPlanningDates, setHidePastPlanningDates] = useState(
    () =>
      localStorage.getItem("idf_line_planning_hide_past_dates") !== "false"
  );
  const [constraintDetailsUserId, setConstraintDetailsUserId] = useState("");
  const [myPeriods, setMyPeriods] = useState<LineConstraintPeriod[]>([]);
  const [myNote, setMyNote] = useState("");
  const [draftPlans, setDraftPlans] = useState<
    Record<string, Record<string, LinePresenceStatus>>
  >({});
  const [dirtyPlanUserIds, setDirtyPlanUserIds] = useState<string[]>([]);

  const selectedCycle =
    cycles.find((cycle) => cycle.cycleId === selectedCycleId) || null;
  const cycleDates = useMemo(
    () =>
      selectedCycle
        ? getDatesInRange(selectedCycle.startDate, selectedCycle.endDate)
        : [],
    [selectedCycle]
  );
  const managerCycleDates = useMemo(
    () =>
      hidePastPlanningDates
        ? cycleDates.filter((date) => date >= today)
        : cycleDates,
    [cycleDates, hidePastPlanningDates, today]
  );
  const pastPlanningDateCount = cycleDates.filter(
    (date) => date < today
  ).length;

  useEffect(() => {
    localStorage.setItem(
      "idf_line_planning_hide_past_dates",
      String(hidePastPlanningDates)
    );
  }, [hidePastPlanningDates]);

  const planningStatusOptions = useMemo(() => {
    const configured = attendanceStatuses
      .filter((status) => status.enabled && status.visibleToCommanders)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const configuredIds = new Set(configured.map((status) => status.id));
    return [
      ...configured,
      ...PLANNING_ONLY_STATUSES.filter(
        (status) => !configuredIds.has(status.id)
      ),
    ];
  }, [attendanceStatuses]);

  const planningStatusById = useMemo(() => {
    const entries = planningStatusOptions.map(
      (status) => [status.id, status] as const
    );
    const legacyLine =
      planningStatusOptions.find((status) => status.id === "base") ||
      ({
        id: "line",
        label: "בקו",
        chartCategory: "present",
        color: "text-emerald-800",
        bg: "bg-emerald-100",
        border: "border-emerald-300",
      } as AttendanceStatusConfig);
    return new Map([...entries, ["line", legacyLine] as const]);
  }, [planningStatusOptions]);

  const planningRoleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allUsers
            .filter((user) => !user.isDischarged)
            .map((user) => user.medicalRole?.trim() || "ללא תפקיד")
        )
      ).sort((first, second) => first.localeCompare(second, "he")),
    [allUsers]
  );

  const planningUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("he");
    return allUsers
      .filter((user) => !user.isDischarged)
      .filter(
        (user) =>
          !hiddenPlanningRoles.includes(
            user.medicalRole?.trim() || "ללא תפקיד"
          )
      )
      .filter((user) =>
        normalizedSearch
          ? [user.fullName, user.personalId, user.unit, user.medicalRole]
              .filter(Boolean)
              .some((value) =>
                String(value)
                  .toLocaleLowerCase("he")
                  .includes(normalizedSearch)
              )
          : true
      )
      .sort((a, b) => {
        const roleDifference =
          getPlanningRoleRank(a) - getPlanningRoleRank(b);
        return (
          roleDifference || a.fullName.localeCompare(b.fullName, "he")
        );
      });
  }, [allUsers, hiddenPlanningRoles, search]);

  const dischargedConstraintUsers = useMemo(
    () =>
      allUsers
        .filter((user) => user.isDischarged)
        .filter((user) => {
          const constraint = constraints.find(
            (item) => item.userId === user.userId
          );
          return Boolean(
            constraint &&
              ((constraint.periods?.length || 0) > 0 ||
                (constraint.unavailableDates?.length || 0) > 0)
          );
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "he")),
    [allUsers, constraints]
  );

  const constraintByUser = useMemo(
    () => new Map(constraints.map((item) => [item.userId, item])),
    [constraints]
  );
  const constraintDetailsUser = allUsers.find(
    (user) => user.userId === constraintDetailsUserId
  );
  const constraintDetails = constraintDetailsUserId
    ? constraintByUser.get(constraintDetailsUserId)
    : undefined;
  const constraintDetailsPeriods = constraintDetails
    ? constraintDetails.periods?.length
      ? constraintDetails.periods
      : legacyDatesToPeriods(
          constraintDetails.unavailableDates || [],
          constraintDetails.notesByDate || {}
        )
    : [];

  const loadCycles = async () => {
    setLoading(true);
    try {
      const items = await dataService.getLineCycles();
      setCycles(items);
      setSelectedCycleId((current) => {
        if (current && items.some((item) => item.cycleId === current)) {
          return current;
        }
        return (
          items.find((item) => item.status === "open")?.cycleId ||
          items[0]?.cycleId ||
          ""
        );
      });
    } catch {
      setMessage({ type: "error", text: "טעינת הקווים נכשלה." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCycles();
  }, []);

  useEffect(() => {
    if (!selectedCycleId) {
      setConstraints([]);
      setPlans([]);
      return;
    }

    let cancelled = false;
    const loadCycleData = async () => {
      setLoading(true);
      try {
        const ownUserId = canManage ? undefined : currentUser.userId;
        const [nextConstraints, nextPlans] = await Promise.all([
          dataService.getLineConstraints(selectedCycleId, ownUserId),
          dataService.getLinePresencePlans(selectedCycleId, ownUserId),
        ]);
        if (cancelled) return;

        setConstraints(nextConstraints);
        setPlans(nextPlans);
        setDraftPlans(
          Object.fromEntries(
            nextPlans.map((plan) => [plan.userId, { ...plan.dates }])
          )
        );
        setDirtyPlanUserIds([]);

        const mine = nextConstraints.find(
          (item) => item.userId === currentUser.userId
        );
        setMyPeriods(
          mine?.periods?.length
            ? mine.periods
            : legacyDatesToPeriods(
                mine?.unavailableDates || [],
                mine?.notesByDate || {}
              )
        );
        setMyNote(mine?.note || "");
      } catch {
        if (!cancelled) {
          setMessage({ type: "error", text: "טעינת נתוני הקו נכשלה." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadCycleData();
    return () => {
      cancelled = true;
    };
  }, [selectedCycleId, currentUser.userId, canManage]);

  const createCycle = async () => {
    setMessage(null);
    if (!newTitle.trim() || !newStartDate || !newEndDate) {
      setMessage({
        type: "error",
        text: "יש להזין שם קו, תאריך התחלה ותאריך סיום.",
      });
      return;
    }
    if (newEndDate < newStartDate) {
      setMessage({
        type: "error",
        text: "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה.",
      });
      return;
    }

    const now = new Date().toISOString();
    const existingCycle = cycles.find(
      (item) => item.cycleId === editingCycleId
    );
    const cycle: LineCycle = {
      ...(existingCycle || {
        cycleId: `line_${Date.now()}`,
        status: "open" as LineCycleStatus,
        createdAt: now,
        createdBy: currentUser.userId,
        createdByName: currentUser.fullName,
      }),
      title: newTitle.trim(),
      startDate: newStartDate,
      endDate: newEndDate,
      ...(newDeadline ? { submissionDeadline: newDeadline } : {}),
      updatedAt: now,
      updatedBy: currentUser.userId,
    };

    setSaving(true);
    try {
      await dataService.saveLineCycle(cycle);
      setCycles((current) =>
        existingCycle
          ? current.map((item) =>
              item.cycleId === cycle.cycleId ? cycle : item
            )
          : [cycle, ...current]
      );
      setSelectedCycleId(cycle.cycleId);
      setNewTitle("");
      setEditingCycleId("");
      setMessage({
        type: "success",
        text: existingCycle
          ? "פרטי הקו והתאריכים עודכנו."
          : "הקו נפתח להזנת אילוצים.",
      });
    } catch {
      setMessage({ type: "error", text: "פתיחת הקו נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  const startEditingCycle = () => {
    if (!selectedCycle) return;
    setEditingCycleId(selectedCycle.cycleId);
    setNewTitle(selectedCycle.title);
    setNewStartDate(selectedCycle.startDate);
    setNewEndDate(selectedCycle.endDate);
    setNewDeadline(selectedCycle.submissionDeadline || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditingCycle = () => {
    setEditingCycleId("");
    setNewTitle("");
    setNewStartDate(today);
    setNewEndDate(addDays(today, 27));
    setNewDeadline(today);
  };

  const toggleSoldierVisibility = async () => {
    if (!canEdit || !systemSettings) return;
    setSaving(true);
    try {
      const saved = await dataService.saveSystemSettings(
        {
          ...systemSettings,
          linePlanningVisibleToSoldiers:
            systemSettings.linePlanningVisibleToSoldiers === false,
        },
        currentUser.userId
      );
      onSystemSettingsChanged(saved);
      setMessage({
        type: "success",
        text:
          saved.linePlanningVisibleToSoldiers === false
            ? "מסך האילוצים הוסתר מהחיילים."
            : "מסך האילוצים מוצג כעת לחיילים.",
      });
    } catch {
      setMessage({
        type: "error",
        text: "עדכון הצגת מסך האילוצים נכשל.",
      });
    } finally {
      setSaving(false);
    }
  };

  const changeCycleStatus = async (status: LineCycleStatus) => {
    if (!selectedCycle) return;
    const updated: LineCycle = {
      ...selectedCycle,
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.userId,
    };
    setSaving(true);
    try {
      await dataService.saveLineCycle(updated);
      setCycles((current) =>
        current.map((item) =>
          item.cycleId === updated.cycleId ? updated : item
        )
      );
      setMessage({
        type: "success",
        text:
          status === "open"
            ? "הזנת האילוצים נפתחה."
            : status === "closed"
            ? "הזנת האילוצים נסגרה."
            : "הקו הועבר לארכיון.",
      });
    } catch {
      setMessage({ type: "error", text: "עדכון מצב הקו נכשל." });
    } finally {
      setSaving(false);
    }
  };

  const canSubmitConstraints =
    selectedCycle?.status === "open" &&
    (!selectedCycle.submissionDeadline ||
      today <= selectedCycle.submissionDeadline);

  const removePeriod = (periodId: string) => {
    setMyPeriods((current) =>
      current.filter((period) => period.periodId !== periodId)
    );
  };

  const selectedConstraintDates = new Set(
    myPeriods.flatMap((period) =>
      getDatesInRange(period.startDate, period.endDate)
    )
  );

  const toggleConstraintDate = (date: string) => {
    setMyPeriods((current) => {
      const selectedDates = new Set(
        current.flatMap((period) =>
          getDatesInRange(period.startDate, period.endDate)
        )
      );
      if (selectedDates.has(date)) selectedDates.delete(date);
      else selectedDates.add(date);
      return datesToPeriods(Array.from(selectedDates), current);
    });
  };

  const updatePeriod = (
    periodId: string,
    changes: Partial<Pick<LineConstraintPeriod, "priority" | "note">>
  ) => {
    setMyPeriods((current) =>
      current.map((period) =>
        period.periodId === periodId ? { ...period, ...changes } : period
      )
    );
  };

  const saveMyConstraints = async () => {
    if (!selectedCycle || !canSubmitConstraints) return;
    const now = new Date().toISOString();
    const unavailableDates = Array.from(
      new Set(
        myPeriods.flatMap((period) =>
          getDatesInRange(period.startDate, period.endDate)
        )
      )
    ).sort();
    const constraint: LineConstraint = {
      constraintId: `${selectedCycle.cycleId}_${currentUser.userId}`,
      cycleId: selectedCycle.cycleId,
      userId: currentUser.userId,
      userName: currentUser.fullName,
      unit: currentUser.unit,
      unavailableDates,
      periods: myPeriods,
      note: myNote.trim(),
      notesByDate: Object.fromEntries(
        myPeriods
          .flatMap((period) =>
            getDatesInRange(period.startDate, period.endDate).map((date) => [
              date,
              period.note?.trim() || "",
            ])
          )
          .filter(([, note]) => Boolean(note))
      ),
      submittedAt:
        constraintByUser.get(currentUser.userId)?.submittedAt || now,
      updatedAt: now,
    };

    setSaving(true);
    try {
      await dataService.saveLineConstraint(constraint);
      setConstraints((current) => [
        ...current.filter((item) => item.userId !== currentUser.userId),
        constraint,
      ]);
      setMessage({ type: "success", text: "האילוצים נשמרו בהצלחה." });
    } catch {
      setMessage({ type: "error", text: "שמירת האילוצים נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  const cyclePlanStatus = (
    userId: string,
    date: string
  ): LinePresenceStatus | undefined => draftPlans[userId]?.[date];

  const setPlanCellStatus = (
    userId: string,
    date: string,
    next: LinePresenceStatus | undefined
  ) => {
    setDraftPlans((allPlans) => {
      const userDates = { ...(allPlans[userId] || {}) };
      if (next) userDates[date] = next;
      else delete userDates[date];
      return { ...allPlans, [userId]: userDates };
    });
    setDirtyPlanUserIds((current) =>
      current.includes(userId) ? current : [...current, userId]
    );
  };

  const savePlans = async () => {
    if (!selectedCycle || dirtyPlanUserIds.length === 0) return;
    const now = new Date().toISOString();
    setSaving(true);
    try {
      const nextPlans = await Promise.all(
        dirtyPlanUserIds.map((userId) => {
          const user = allUsers.find((item) => item.userId === userId);
          if (!user) throw new Error("User not found");
          return dataService.saveLinePresencePlan({
            planId: `${selectedCycle.cycleId}_${user.userId}`,
            cycleId: selectedCycle.cycleId,
            userId: user.userId,
            userName: user.fullName,
            unit: user.unit,
            dates: draftPlans[user.userId] || {},
            updatedAt: now,
            updatedBy: currentUser.userId,
            updatedByName: currentUser.fullName,
          });
        })
      );
      setPlans((current) => {
        const updatedIds = new Set(nextPlans.map((item) => item.userId));
        return [
          ...current.filter((item) => !updatedIds.has(item.userId)),
          ...nextPlans,
        ];
      });
      setDirtyPlanUserIds([]);
      setMessage({ type: "success", text: "תכנון הנוכחות נשמר." });
    } catch {
      setMessage({ type: "error", text: "שמירת תכנון הנוכחות נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  if (loading && cycles.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
        טוען תכנון קו ואילוצים...
      </div>
    );
  }

  return (
    <section dir="rtl" className="min-w-0 space-y-4">
      <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black">תכנון קו ואילוצים</h2>
              <p className="mt-1 text-xs font-bold text-slate-300">
                כל קו נשמר בנפרד יחד עם האילוצים ותכנון הנוכחות שלו.
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={toggleSoldierVisibility}
              disabled={saving || !systemSettings}
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black transition disabled:opacity-50 ${
                systemSettings?.linePlanningVisibleToSoldiers === false
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                  : "border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
              }`}
            >
              {systemSettings?.linePlanningVisibleToSoldiers === false ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              {systemSettings?.linePlanningVisibleToSoldiers === false
                ? "הצג עמוד לחיילים"
                : "הסתר עמוד מחיילים"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-black ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {canEdit && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-black text-slate-900">
            {editingCycleId ? "עריכת קו קיים" : "פתיחת קו חדש"}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-black text-slate-700">
              שם הקו
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="לדוגמה: קו אוגוסט 2026"
                className="input mt-1"
              />
            </label>
            <label className="text-xs font-black text-slate-700">
              תאריך התחלה
              <input
                type="date"
                value={newStartDate}
                onChange={(event) => setNewStartDate(event.target.value)}
                className="input mt-1"
              />
            </label>
            <label className="text-xs font-black text-slate-700">
              תאריך סיום
              <input
                type="date"
                min={newStartDate}
                value={newEndDate}
                onChange={(event) => setNewEndDate(event.target.value)}
                className="input mt-1"
              />
            </label>
            <label className="text-xs font-black text-slate-700">
              מועד אחרון לאילוצים
              <input
                type="date"
                value={newDeadline}
                onChange={(event) => setNewDeadline(event.target.value)}
                className="input mt-1"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={createCycle}
            disabled={saving}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {editingCycleId ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {editingCycleId ? "שמור שינויים" : "פתח קו חדש"}
          </button>
          {editingCycleId && (
            <button
              type="button"
              onClick={cancelEditingCycle}
              className="mt-3 mr-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700"
            >
              ביטול עריכה
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-black text-slate-700">
            בחירת קו
            <select
              value={selectedCycleId}
              onChange={(event) => setSelectedCycleId(event.target.value)}
              className="input mt-1"
            >
              <option value="">בחר קו...</option>
              {cycles.map((cycle) => (
                <option key={cycle.cycleId} value={cycle.cycleId}>
                  {cycle.title} · {formatDate(cycle.startDate, true)}–
                  {formatDate(cycle.endDate, true)} · {statusLabel[cycle.status]}
                </option>
              ))}
            </select>
          </label>
          {selectedCycle && canEdit && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startEditingCycle}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700"
              >
                <Pencil className="h-4 w-4" />
                ערוך תאריכים
              </button>
              {selectedCycle.status !== "open" && (
                <button
                  type="button"
                  onClick={() => changeCycleStatus("open")}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"
                >
                  <Unlock className="h-4 w-4" />
                  פתח אילוצים
                </button>
              )}
              {selectedCycle.status === "open" && (
                <button
                  type="button"
                  onClick={() => changeCycleStatus("closed")}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800"
                >
                  <Lock className="h-4 w-4" />
                  סגור אילוצים
                </button>
              )}
              {selectedCycle.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => changeCycleStatus("archived")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
                >
                  <Archive className="h-4 w-4" />
                  העבר לארכיון
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedCycle ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-400">
          {canManage ? "פתח קו חדש כדי להתחיל." : "אין כרגע קו פתוח."}
        </div>
      ) : canManage ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-slate-900">
                {selectedCycle.title}
              </div>
              <div className="mt-1 text-[11px] font-bold text-slate-500">
                {formatDate(selectedCycle.startDate, true)} עד{" "}
                {formatDate(selectedCycle.endDate, true)} ·{" "}
                {constraints.length} הזינו אילוצים
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pastPlanningDateCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setHidePastPlanningDates((current) => !current)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  {hidePastPlanningDates ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                  {hidePastPlanningDates
                    ? `הצג ${pastPlanningDateCount} ימים שעברו`
                    : "הסתר ימים שעברו"}
                </button>
              )}
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש חייל..."
                  className="input pr-9"
                />
              </div>
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                  <EyeOff className="h-4 w-4" />
                  הסתר תפקידים
                  {hiddenPlanningRoles.length > 0 && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-700">
                      {hiddenPlanningRoles.length}
                    </span>
                  )}
                </summary>
                <div className="absolute left-0 z-[70] mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 text-right shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-2">
                    <span className="text-[11px] font-black text-slate-700">
                      סמן תפקידים להסתרה
                    </span>
                    {hiddenPlanningRoles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setHiddenPlanningRoles([])}
                        className="text-[10px] font-black text-rose-700 hover:text-rose-900"
                      >
                        הצג הכול
                      </button>
                    )}
                  </div>
                  <div className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                    {planningRoleOptions.map((role) => (
                      <label
                        key={role}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={hiddenPlanningRoles.includes(role)}
                          onChange={(event) =>
                            setHiddenPlanningRoles((current) =>
                              event.target.checked
                                ? [...current, role]
                                : current.filter((item) => item !== role)
                            )
                          }
                          className="h-4 w-4 accent-rose-600"
                        />
                        <span>{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>
              {canEdit && (
                <button
                  type="button"
                  onClick={savePlans}
                  disabled={saving || dirtyPlanUserIds.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  שמור תכנון
                </button>
              )}
            </div>
          </div>

          <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="sticky top-0 z-50 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-black text-slate-600">
                הזזת תאריכים
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    matrixScrollRef.current?.scrollBy({
                      left: 280,
                      behavior: "smooth",
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700"
                  aria-label="הזז תאריכים ימינה"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    matrixScrollRef.current?.scrollBy({
                      left: -280,
                      behavior: "smooth",
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700"
                  aria-label="הזז תאריכים שמאלה"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div
              ref={matrixHeaderScrollRef}
              className="overflow-hidden"
            >
              <table className="w-max min-w-full border-collapse text-center text-[10px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="sticky right-0 z-30 w-40 min-w-40 border-b border-l border-slate-200 bg-slate-100 px-2 py-3 text-right text-xs sm:w-48 sm:min-w-48">
                      חייל
                    </th>
                    {managerCycleDates.map((date) => (
                      <th
                        key={date}
                        title={`${new Date(
                          `${date}T12:00:00`
                        ).toLocaleDateString("he-IL", {
                          weekday: "long",
                        })}, ${formatDate(date, true)}`}
                        className="min-w-28 border-b border-l border-slate-200 px-2 py-2 text-[10px]"
                      >
                        <span className="block font-black text-slate-800">
                          {new Date(`${date}T12:00:00`).toLocaleDateString(
                            "he-IL",
                            { weekday: "short" }
                          )}
                        </span>
                        <span className="block text-[9px] font-bold text-slate-500">
                          {formatDate(date)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
            </div>
            </div>
            <div
              ref={matrixScrollRef}
              onScroll={(event) => {
                if (matrixHeaderScrollRef.current) {
                  matrixHeaderScrollRef.current.scrollLeft =
                    event.currentTarget.scrollLeft;
                }
              }}
              className="overflow-x-auto scroll-smooth"
            >
              <table className="w-max min-w-full border-collapse text-center text-[10px]">
                <tbody>
                  {planningUsers.map((user) => {
                    const constraint = constraintByUser.get(user.userId);
                    const constraintPeriods = constraint
                      ? constraint.periods?.length
                        ? constraint.periods
                        : legacyDatesToPeriods(
                            constraint.unavailableDates || [],
                            constraint.notesByDate || {}
                          )
                      : [];
                    const unavailable = new Set(
                      constraint?.unavailableDates || []
                    );
                    return (
                      <tr key={user.userId} className="hover:bg-slate-50">
                        <td className="sticky right-0 z-10 w-40 min-w-40 max-w-40 border-b border-l border-slate-200 bg-white px-2 py-2 text-right sm:w-48 sm:min-w-48 sm:max-w-48">
                          <div className="font-black text-slate-800">
                            {user.fullName}
                          </div>
                          <div className="mt-0.5 break-words text-[10px] font-bold leading-4 text-slate-500">
                            {[user.unit, user.medicalRole || "ללא תפקיד"]
                              .filter(Boolean)
                              .join(" · ")}
                            <span
                              className={
                                constraint
                                  ? "text-emerald-700"
                                  : "text-slate-400"
                              }
                            >
                              {constraint ? " · אילוצים הוזנו" : " · טרם הוזן"}
                            </span>
                          </div>
                          {constraint?.note && (
                            <div
                              className="mt-1 max-w-36 truncate text-[9px] font-bold text-amber-700 sm:max-w-44"
                              title={constraint.note}
                            >
                              {constraint.note}
                            </div>
                          )}
                          {constraintPeriods.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setConstraintDetailsUserId(user.userId)
                              }
                              className="mt-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[9px] font-black text-indigo-700 hover:bg-indigo-100"
                            >
                              {constraintPeriods.length}{" "}
                              {constraintPeriods.length === 1
                                ? "אילוץ"
                                : "אילוצים"}{" "}
                              · הצג
                            </button>
                          )}
                        </td>
                        {managerCycleDates.map((date) => {
                          const planStatus = cyclePlanStatus(
                            user.userId,
                            date
                          );
                          const selectedStatus = planStatus
                            ? planningStatusById.get(planStatus)
                            : undefined;
                          const isUnavailable = unavailable.has(date);
                          const constraintPeriod = constraintPeriods.find(
                            (period) =>
                              period.startDate <= date &&
                              period.endDate >= date
                          );
                          const constraintPriority =
                            constraintPeriod?.priority || "required";
                          const conflict =
                            isUnavailable &&
                            selectedStatus?.chartCategory === "present";
                          return (
                            <td
                              key={`${user.userId}_${date}`}
                              className="min-w-28 border-b border-l border-slate-200 p-1"
                            >
                              <select
                                disabled={!canEdit}
                                value={planStatus || ""}
                                onChange={(event) =>
                                  setPlanCellStatus(
                                    user.userId,
                                    date,
                                    event.target.value || undefined
                                  )
                                }
                                title={
                                  conflict
                                    ? "שובץ לקו למרות אילוץ"
                                    : isUnavailable
                                    ? `${priorityLabel[constraintPriority]}${
                                        constraintPeriod?.note
                                          ? `: ${constraintPeriod.note}`
                                          : ""
                                      }`
                                    : "לחיצה מחליפה: קו / בית / ריק"
                                }
                                className={`h-11 w-full cursor-pointer rounded-md border px-1.5 py-1 text-center text-xs font-black disabled:cursor-default ${
                                  conflict
                                    ? "bg-orange-500 text-white ring-2 ring-orange-200"
                                    : selectedStatus
                                    ? `${selectedStatus.bg} ${selectedStatus.color} ${selectedStatus.border}`
                                    : isUnavailable
                                    ? priorityClasses[constraintPriority]
                                    : "border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-200"
                                }`}
                              >
                                <option value="">
                                  {conflict
                                    ? "חריגה"
                                    : planStatus === "line"
                                    ? "בקו"
                                    : planStatus === "home"
                                    ? "בבית"
                                    : isUnavailable
                                    ? priorityLabel[constraintPriority]
                                    : "—"}
                                </option>
                                {planStatus === "line" && (
                                  <option value="line">בקו</option>
                                )}
                                {planningStatusOptions.map((status) => (
                                  <option key={status.id} value={status.id}>
                                    {status.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black">
              {planningStatusOptions.map((status) => (
                <span
                  key={`legend_${status.id}`}
                  className={`rounded-md border px-2 py-1 ${status.bg} ${status.color} ${status.border}`}
                >
                  {status.label}
                </span>
              ))}
              <span className="text-violet-700">סגול — בקשה</span>
              <span className="text-amber-700">צהוב — מועדף</span>
              <span className="text-rose-700">אדום — חובה</span>
              <span className="text-orange-700">
                כתום — שיבוץ לקו בניגוד לאילוץ
              </span>
            </div>
          </div>

          {dischargedConstraintUsers.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-sm font-black text-slate-900">
                  חיילים שנגרעו שהזינו אילוצים
                </h3>
                <p className="mt-1 text-[11px] font-bold text-slate-500">
                  החיילים אינם נכללים בטבלת התכנון הפעילה, אך האילוצים
                  שהזינו נשמרים ומוצגים כאן.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] border-collapse text-right text-xs">
                  <thead className="bg-amber-50 text-slate-700">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2">
                        חייל
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        יחידה
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        מספר אילוצים
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        עדכון אחרון
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2">
                        פירוט
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dischargedConstraintUsers.map((user) => {
                      const constraint = constraintByUser.get(user.userId)!;
                      const periods = constraint.periods?.length
                        ? constraint.periods
                        : legacyDatesToPeriods(
                            constraint.unavailableDates || [],
                            constraint.notesByDate || {}
                          );
                      return (
                        <tr key={user.userId} className="bg-white">
                          <td className="border-b border-slate-100 px-3 py-2 font-black text-slate-800">
                            {user.fullName}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 font-bold text-slate-500">
                            {user.unit}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 font-black text-amber-800">
                            {periods.length}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 font-bold text-slate-500">
                            {constraint.updatedAt
                              ? new Date(
                                  constraint.updatedAt
                                ).toLocaleString("he-IL")
                              : "—"}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setConstraintDetailsUserId(user.userId)
                              }
                              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100"
                            >
                              הצג אילוצים
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {constraintDetailsUser && constraintDetails && (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4"
              onClick={() => setConstraintDetailsUserId("")}
            >
              <div
                dir="rtl"
                className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      האילוצים של {constraintDetailsUser.fullName}
                    </h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {constraintDetailsUser.unit} ·{" "}
                      {constraintDetailsPeriods.length} אילוצים
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConstraintDetailsUserId("")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
                  >
                    סגור
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {constraintDetailsPeriods.map((period) => (
                    <div
                      key={period.periodId}
                      className={`rounded-xl border p-3 ${priorityClasses[period.priority]}`}
                    >
                      <div className="text-xs font-black">
                        {formatDate(period.startDate, true)}
                        {period.endDate !== period.startDate
                          ? ` עד ${formatDate(period.endDate, true)}`
                          : ""}
                        {" · "}
                        {priorityLabel[period.priority]}
                      </div>
                      {period.note && (
                        <div className="mt-1 text-xs font-bold">
                          {period.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {constraintDetails.note && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600">
                    הערה כללית: {constraintDetails.note}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {selectedCycle.title}
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatDate(selectedCycle.startDate, true)} עד{" "}
                  {formatDate(selectedCycle.endDate, true)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black ${
                  canSubmitConstraints
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {canSubmitConstraints
                  ? "פתוח להזנת אילוצים"
                  : "הזנת האילוצים סגורה"}
              </span>
            </div>
            {selectedCycle.submissionDeadline && (
              <p className="mt-2 text-[11px] font-bold text-amber-700">
                ניתן לעדכן עד {formatDate(selectedCycle.submissionDeadline, true)}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-black text-slate-900">
              בחירת תאריכי אילוץ
            </div>
            <p className="mb-3 text-[11px] font-bold leading-5 text-slate-500">
              לחץ על כל התאריכים שבהם יש לך אילוץ. ימים רצופים יאוחדו
              אוטומטית לתקופה אחת, ויום שאינו רצוף יוצג בנפרד.
            </p>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-10">
              {cycleDates.map((date) => {
                const selected = selectedConstraintDates.has(date);
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!canSubmitConstraints || readOnly}
                    onClick={() => toggleConstraintDate(date)}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-black transition ${
                      selected
                        ? "border-rose-300 bg-rose-100 text-rose-800 ring-1 ring-rose-200"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300"
                    } disabled:opacity-60`}
                  >
                    <span className="block">
                      {new Date(`${date}T12:00:00`).toLocaleDateString(
                        "he-IL",
                        { weekday: "short" }
                      )}
                    </span>
                    <span>{formatDate(date)}</span>
                  </button>
                );
              })}
            </div>

            {myPeriods.length > 0 && (
              <button
                type="button"
                disabled={!canSubmitConstraints || readOnly}
                onClick={() => setMyPeriods([])}
                className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-600 disabled:opacity-50"
              >
                נקה את כל הבחירות
              </button>
            )}

            {myPeriods.length > 0 && (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black text-slate-800">
                  תקופות האילוץ שלי
                </div>
                {myPeriods.map((period) => (
                  <div
                    key={period.periodId}
                    className={`rounded-xl border p-3 ${priorityClasses[period.priority]}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-black">
                        {formatDate(period.startDate, true)}
                        {period.endDate !== period.startDate
                          ? ` עד ${formatDate(period.endDate, true)}`
                          : ""}
                        {" · "}
                        {priorityLabel[period.priority]}
                      </div>
                      {!readOnly && canSubmitConstraints && (
                        <button
                          type="button"
                          onClick={() => removePeriod(period.periodId)}
                          className="rounded-lg border border-current/20 bg-white/70 p-2"
                          aria-label="מחיקת תקופה"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-[10px] font-black">
                        רמת עדיפות
                        <select
                          value={period.priority}
                          disabled={!canSubmitConstraints || readOnly}
                          onChange={(event) =>
                            updatePeriod(period.periodId, {
                              priority:
                                event.target.value as LineConstraintPriority,
                            })
                          }
                          className="input mt-1 bg-white"
                        >
                          <option value="request">1. בקשה</option>
                          <option value="preferred">2. מועדף</option>
                          <option value="required">3. חובה</option>
                        </select>
                      </label>
                      <label className="text-[10px] font-black">
                        הערה לאילוץ
                        <input
                          value={period.note || ""}
                          disabled={!canSubmitConstraints || readOnly}
                          onChange={(event) =>
                            updatePeriod(period.periodId, {
                              note: event.target.value,
                            })
                          }
                          placeholder="לדוגמה: לימודים או אירוע משפחתי"
                          className="input mt-1 bg-white"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {myPeriods.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs font-bold text-slate-400">
                עדיין לא נוספו תקופות אילוץ.
              </div>
            )}

            {myNote && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-bold text-slate-600">
                הערה כללית מאילוצים קודמים: {myNote}
              </div>
            )}
            <button
              type="button"
              onClick={saveMyConstraints}
              disabled={saving || !canSubmitConstraints || readOnly}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              שמור ושלח אילוצים
            </button>
          </div>

          {plans[0] && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                <CalendarDays className="h-4 w-4 text-indigo-600" />
                תכנון הנוכחות שלי
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-10">
                {cycleDates.map((date) => {
                  const value = plans[0].dates[date];
                  const selectedStatus = value
                    ? planningStatusById.get(value)
                    : undefined;
                  return (
                    <div
                      key={date}
                      className={`rounded-lg px-2 py-2 text-center text-[10px] font-black ${
                        selectedStatus
                          ? `${selectedStatus.bg} ${selectedStatus.color}`
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <span className="block">{formatDate(date)}</span>
                      <span>{selectedStatus?.label || "טרם נקבע"}</span>
                      <span className="hidden">
                        {value === "line"
                          ? "בקו"
                          : value === "home"
                          ? "בבית"
                          : "טרם נקבע"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
