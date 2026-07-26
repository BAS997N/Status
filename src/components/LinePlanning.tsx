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

export default function LinePlanning({
  currentUser,
  allUsers,
  canManage,
  readOnly = false,
  systemSettings,
  onSystemSettingsChanged,
}: LinePlanningProps) {
  const canEdit = canManage && !readOnly;
  const matrixScrollRef = useRef<HTMLDivElement>(null);
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
  const [myPeriods, setMyPeriods] = useState<LineConstraintPeriod[]>([]);
  const [myNote, setMyNote] = useState("");
  const [periodStartDate, setPeriodStartDate] = useState(today);
  const [periodEndDate, setPeriodEndDate] = useState(today);
  const [periodPriority, setPeriodPriority] =
    useState<LineConstraintPriority>("request");
  const [periodNote, setPeriodNote] = useState("");
  const [editingPeriodId, setEditingPeriodId] = useState("");
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

  useEffect(() => {
    if (!selectedCycle || editingPeriodId) return;
    setPeriodStartDate(selectedCycle.startDate);
    setPeriodEndDate(selectedCycle.startDate);
  }, [selectedCycle?.cycleId, editingPeriodId]);

  const planningUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("he");
    return allUsers
      .filter((user) => !user.isDischarged)
      .filter((user) =>
        normalizedSearch
          ? [user.fullName, user.personalId, user.unit]
              .filter(Boolean)
              .some((value) =>
                String(value)
                  .toLocaleLowerCase("he")
                  .includes(normalizedSearch)
              )
          : true
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  }, [allUsers, search]);

  const constraintByUser = useMemo(
    () => new Map(constraints.map((item) => [item.userId, item])),
    [constraints]
  );

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

  const resetPeriodForm = () => {
    setEditingPeriodId("");
    setPeriodStartDate(selectedCycle?.startDate || today);
    setPeriodEndDate(selectedCycle?.startDate || today);
    setPeriodPriority("request");
    setPeriodNote("");
  };

  const savePeriodToDraft = () => {
    if (!selectedCycle || !periodStartDate || !periodEndDate) return;
    if (
      periodEndDate < periodStartDate ||
      periodStartDate < selectedCycle.startDate ||
      periodEndDate > selectedCycle.endDate
    ) {
      setMessage({
        type: "error",
        text: "תקופת האילוץ חייבת להיות בתוך תאריכי הקו.",
      });
      return;
    }

    const period: LineConstraintPeriod = {
      periodId: editingPeriodId || `period_${Date.now()}`,
      startDate: periodStartDate,
      endDate: periodEndDate,
      priority: periodPriority,
      note: periodNote.trim(),
    };

    setMyPeriods((current) =>
      [
        ...current.filter((item) => item.periodId !== period.periodId),
        period,
      ].sort((a, b) => a.startDate.localeCompare(b.startDate))
    );
    resetPeriodForm();
    setMessage(null);
  };

  const editPeriod = (period: LineConstraintPeriod) => {
    setEditingPeriodId(period.periodId);
    setPeriodStartDate(period.startDate);
    setPeriodEndDate(period.endDate);
    setPeriodPriority(period.priority);
    setPeriodNote(period.note || "");
  };

  const removePeriod = (periodId: string) => {
    setMyPeriods((current) =>
      current.filter((period) => period.periodId !== periodId)
    );
    if (editingPeriodId === periodId) resetPeriodForm();
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

  const togglePlanCell = (userId: string, date: string) => {
    const current = cyclePlanStatus(userId, date);
    const next =
      current === undefined ? "line" : current === "line" ? "home" : undefined;

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
              <button
                type="button"
                onClick={toggleSoldierVisibility}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-50"
              >
                {systemSettings?.linePlanningVisibleToSoldiers === false ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                {systemSettings?.linePlanningVisibleToSoldiers === false
                  ? "הצג אילוצים לחיילים"
                  : "הסתר אילוצים מהחיילים"}
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
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש חייל..."
                  className="input pr-9"
                />
              </div>
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

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
              ref={matrixScrollRef}
              className="touch-pan-x overflow-x-auto scroll-smooth"
            >
              <table className="min-w-max border-collapse text-center text-[10px]">
                <thead className="sticky top-0 z-20 bg-slate-100">
                  <tr>
                    <th className="sticky right-0 z-30 min-w-48 border-b border-l border-slate-200 bg-slate-100 px-3 py-3 text-right text-xs">
                      חייל
                    </th>
                    {cycleDates.map((date) => (
                      <th
                        key={date}
                        className="min-w-16 border-b border-l border-slate-200 px-1 py-2"
                      >
                        <span className="block font-black">
                          {new Date(`${date}T12:00:00`).toLocaleDateString(
                            "he-IL",
                            { weekday: "short" }
                          )}
                        </span>
                        <span className="text-slate-500">
                          {formatDate(date)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
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
                        <td className="sticky right-0 z-10 border-b border-l border-slate-200 bg-white px-3 py-2 text-right">
                          <div className="font-black text-slate-800">
                            {user.fullName}
                          </div>
                          <div className="mt-0.5 text-[9px] font-bold text-slate-400">
                            {user.unit}
                            {constraint ? " · אילוצים הוזנו" : " · טרם הוזן"}
                          </div>
                          {constraint?.note && (
                            <div
                              className="mt-1 max-w-44 truncate text-[9px] font-bold text-amber-700"
                              title={constraint.note}
                            >
                              {constraint.note}
                            </div>
                          )}
                          {constraintPeriods.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {constraintPeriods.map((period) => (
                                <div
                                  key={period.periodId}
                                  className={`max-w-44 rounded-md border px-1.5 py-1 text-[9px] font-black ${priorityClasses[period.priority]}`}
                                  title={period.note || ""}
                                >
                                  <span>
                                    {formatDate(period.startDate)}
                                    {period.endDate !== period.startDate
                                      ? `–${formatDate(period.endDate)}`
                                      : ""}
                                    {" · "}
                                    {priorityLabel[period.priority]}
                                  </span>
                                  {period.note && (
                                    <span className="mt-0.5 block truncate font-bold">
                                      {period.note}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        {cycleDates.map((date) => {
                          const planStatus = cyclePlanStatus(
                            user.userId,
                            date
                          );
                          const isUnavailable = unavailable.has(date);
                          const constraintPeriod = constraintPeriods.find(
                            (period) =>
                              period.startDate <= date &&
                              period.endDate >= date
                          );
                          const constraintPriority =
                            constraintPeriod?.priority || "required";
                          const conflict =
                            isUnavailable && planStatus === "line";
                          return (
                            <td
                              key={`${user.userId}_${date}`}
                              className="border-b border-l border-slate-200 p-1"
                            >
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() =>
                                  togglePlanCell(user.userId, date)
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
                                className={`h-auto min-h-9 w-full rounded-md px-1 py-1 text-[9px] font-black disabled:cursor-default ${
                                  conflict
                                    ? "bg-orange-500 text-white ring-2 ring-orange-200"
                                    : planStatus === "line"
                                    ? "bg-emerald-500 text-white"
                                    : planStatus === "home"
                                    ? "bg-sky-500 text-white"
                                    : isUnavailable
                                    ? priorityClasses[constraintPriority]
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                }`}
                              >
                                <span className="block">
                                  {conflict
                                    ? "חריגה"
                                    : planStatus === "line"
                                    ? "בקו"
                                    : planStatus === "home"
                                    ? "בבית"
                                    : isUnavailable
                                    ? priorityLabel[constraintPriority]
                                    : "—"}
                                </span>
                                {(constraintPeriod?.note ||
                                  constraint?.notesByDate?.[date]) && (
                                  <span
                                    className="mt-0.5 block max-w-14 truncate font-bold"
                                    title={
                                      constraintPeriod?.note ||
                                      constraint?.notesByDate?.[date]
                                    }
                                  >
                                    {constraintPeriod?.note ||
                                      constraint?.notesByDate?.[date]}
                                  </span>
                                )}
                              </button>
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
              <span className="text-emerald-700">ירוק — בקו</span>
              <span className="text-sky-700">כחול — בבית</span>
              <span className="text-violet-700">סגול — בקשה</span>
              <span className="text-amber-700">צהוב — מועדף</span>
              <span className="text-rose-700">אדום — חובה</span>
              <span className="text-orange-700">
                כתום — שיבוץ לקו בניגוד לאילוץ
              </span>
            </div>
          </div>
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
              הוספת תקופת אילוץ
            </div>
            <p className="mb-3 text-[11px] font-bold leading-5 text-slate-500">
              לכל תקופה מגדירים תאריכי התחלה וסיום, עדיפות והערה אחת.
              אילוץ ליום בודד מוזן עם אותו תאריך בשני השדות.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-black text-slate-700">
                מתאריך
                <input
                  type="date"
                  min={selectedCycle.startDate}
                  max={selectedCycle.endDate}
                  value={periodStartDate}
                  disabled={!canSubmitConstraints || readOnly}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPeriodStartDate(value);
                    if (periodEndDate < value) setPeriodEndDate(value);
                  }}
                  className="input mt-1"
                />
              </label>
              <label className="text-xs font-black text-slate-700">
                עד תאריך
                <input
                  type="date"
                  min={periodStartDate || selectedCycle.startDate}
                  max={selectedCycle.endDate}
                  value={periodEndDate}
                  disabled={!canSubmitConstraints || readOnly}
                  onChange={(event) => setPeriodEndDate(event.target.value)}
                  className="input mt-1"
                />
              </label>
              <label className="text-xs font-black text-slate-700">
                רמת עדיפות
                <select
                  value={periodPriority}
                  disabled={!canSubmitConstraints || readOnly}
                  onChange={(event) =>
                    setPeriodPriority(
                      event.target.value as LineConstraintPriority
                    )
                  }
                  className="input mt-1"
                >
                  <option value="request">1. בקשה</option>
                  <option value="preferred">2. מועדף</option>
                  <option value="required">3. חובה</option>
                </select>
              </label>
              <label className="text-xs font-black text-slate-700">
                הערה לתקופה
                <input
                  value={periodNote}
                  disabled={!canSubmitConstraints || readOnly}
                  onChange={(event) => setPeriodNote(event.target.value)}
                  placeholder="לדוגמה: לימודים או אירוע משפחתי"
                  className="input mt-1"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={savePeriodToDraft}
                disabled={!canSubmitConstraints || readOnly}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
              >
                {editingPeriodId ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingPeriodId ? "עדכן תקופה" : "הוסף תקופה"}
              </button>
              {editingPeriodId && (
                <button
                  type="button"
                  onClick={resetPeriodForm}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700"
                >
                  ביטול עריכה
                </button>
              )}
            </div>

            {myPeriods.length > 0 && (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black text-slate-800">
                  תקופות האילוץ שלי
                </div>
                {myPeriods.map((period) => (
                  <div
                    key={period.periodId}
                    className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${priorityClasses[period.priority]}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-black">
                        {formatDate(period.startDate, true)}
                        {period.endDate !== period.startDate
                          ? ` עד ${formatDate(period.endDate, true)}`
                          : ""}
                        {" · "}
                        {priorityLabel[period.priority]}
                      </div>
                      {period.note && (
                        <div className="mt-1 text-[11px] font-bold">
                          {period.note}
                        </div>
                      )}
                    </div>
                    {!readOnly && canSubmitConstraints && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => editPeriod(period)}
                          className="rounded-lg border border-current/20 bg-white/70 p-2"
                          aria-label="עריכת תקופה"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePeriod(period.periodId)}
                          className="rounded-lg border border-current/20 bg-white/70 p-2"
                          aria-label="מחיקת תקופה"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
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
                  return (
                    <div
                      key={date}
                      className={`rounded-lg px-2 py-2 text-center text-[10px] font-black ${
                        value === "line"
                          ? "bg-emerald-100 text-emerald-800"
                          : value === "home"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <span className="block">{formatDate(date)}</span>
                      <span>
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
