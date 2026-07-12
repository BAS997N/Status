import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Clock3,
  Edit2,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import {
  AttendanceReport,
  AttendanceStatusConfig,
  ExternalStaffMember,
  MedicalRoleConfig,
  ShiftAssignment,
  ShiftRecord,
  ShiftSlotConfig,
  ShiftTypeConfig,
  SystemRole,
  UserProfile,
} from "../types";
import { dataService } from "../services/dataService";
import ShiftFilters, { ShiftViewMode } from "./shifts/ShiftFilters";
import WeeklyShiftView from "./shifts/WeeklyShiftView";
import CompactShiftList from "./shifts/CompactShiftList";
import MonthlyShiftCalendar from "./shifts/MonthlyShiftCalendar";
import { isPublishedShift } from "./shifts/shiftViewUtils";

interface ShiftsViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  canManage: boolean;
  shiftSlotConfigs: ShiftSlotConfig[];
  medicalRoleConfigs: MedicalRoleConfig[];
  externalStaff: ExternalStaffMember[];
  reports: AttendanceReport[];
  attendanceStatuses: AttendanceStatusConfig[];
}

interface ExpandedSlot {
  key: string;
  configId: string;
  label: string;
  required: boolean;
  allowedMedicalRoleIds: string[];
  allowedSystemRoles: SystemRole[];
  allowSystemUsers: boolean;
  allowDischargedUsers: boolean;
  allowExternalStaff: boolean;
  allowedExternalStaffTypes: string[];
  index: number;
}

const toLocalParts = (value?: string) => {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localValue = new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);

  return {
    date: localValue.slice(0, 10),
    time: localValue.slice(11, 16),
  };
};

const getTodayInputDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 10);
};

const addDaysToInputDate = (value: string, days: number) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const combineDateAndTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00`).toISOString();

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("he-IL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const getSystemRole = (user: UserProfile): SystemRole => {
  if (user.systemRole) return user.systemRole;
  if (user.role === "commander") return "admin";
  if (user.role === "adjutant_officer") return "viewer";
  return "reporter";
};

const DAY_MARKER_LABELS: Record<string, string> = {
  return_to_base: "חזרה לבסיס",
  exit_home: "יציאה לבית",
  after_hours: "אחרי שעות",
};

const getReportDateKey = (report: AttendanceReport) => {
  if (report.reportDate) return report.reportDate;
  if (typeof report.timestamp === "string") {
    return report.timestamp.slice(0, 10);
  }
  return "";
};

const getReportTimeMs = (report: AttendanceReport) => {
  const value = report.updatedAt || report.timestamp;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function ShiftsView({
  currentUser,
  allUsers,
  canManage,
  shiftSlotConfigs,
  medicalRoleConfigs,
  externalStaff,
  reports,
  attendanceStatuses,
}: ShiftsViewProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState<ShiftViewMode>(
    canManage ? "week" : "list"
  );
  const [shiftTypeFilter, setShiftTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const [detailsShift, setDetailsShift] = useState<ShiftRecord | null>(null);
  const [includeReadStatusInPrint, setIncludeReadStatusInPrint] =
    useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [shiftTypes, setShiftTypes] = useState<ShiftTypeConfig[]>([]);
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [shiftType, setShiftType] = useState("משמרת");
  const [startDate, setStartDate] = useState(getTodayInputDate());
  const [startTime, setStartTime] = useState("05:30");
  const [endDate, setEndDate] = useState(getTodayInputDate());
  const [endTime, setEndTime] = useState("18:30");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});

  const expandedSlots = useMemo<ExpandedSlot[]>(
    () =>
      shiftSlotConfigs
        .filter((config) => config.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((config) =>
          Array.from({ length: Math.max(1, config.quantity) }, (_, index) => ({
            key: `${config.id}_${index + 1}`,
            configId: config.id,
            label:
              config.quantity > 1 ? `${config.name} ${index + 1}` : config.name,
            required: config.required,
            allowedMedicalRoleIds: config.allowedMedicalRoleIds || [],
            allowedSystemRoles: config.allowedSystemRoles || [],
            allowSystemUsers: config.allowSystemUsers !== false,
            allowDischargedUsers: config.allowDischargedUsers === true,
            allowExternalStaff: config.allowExternalStaff === true,
            allowedExternalStaffTypes: config.allowedExternalStaffTypes || [],
            index,
          }))
        ),
    [shiftSlotConfigs]
  );

  const medicalRoleNameById = useMemo(
    () =>
      new Map(
        medicalRoleConfigs.map((role) => [
          role.id,
          role.name.trim().toLocaleLowerCase("he"),
        ])
      ),
    [medicalRoleConfigs]
  );

  const selectableUsers = useMemo(
    () =>
      [...allUsers].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "he")
      ),
    [allUsers]
  );

  const activeExternalStaff = useMemo(
    () =>
      externalStaff
        .filter((item) => item.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [externalStaff]
  );

  const attendanceStatusLabelById = useMemo(
    () =>
      new Map(
        attendanceStatuses.map((status) => [status.id, status.label])
      ),
    [attendanceStatuses]
  );

  const latestReportByUserAndDate = useMemo(() => {
    const map = new Map<string, AttendanceReport>();

    reports
      .filter((report) => report.isReset !== true)
      .forEach((report) => {
        const reportDate = getReportDateKey(report);
        if (!reportDate) return;

        const key = `${report.userId}_${reportDate}`;
        const previous = map.get(key);

        if (!previous || getReportTimeMs(report) > getReportTimeMs(previous)) {
          map.set(key, report);
        }
      });

    return map;
  }, [reports]);

  const getAttendanceInfo = (user: UserProfile) => {
    const report = latestReportByUserAndDate.get(
      `${user.userId}_${startDate}`
    );

    if (!report) {
      return {
        report: null,
        label: "אין דיווח",
        dayMarkerLabel: "",
        priority: 2,
      };
    }

    const label =
      attendanceStatusLabelById.get(report.status) ||
      String(report.status || "סטטוס לא ידוע");

    return {
      report,
      label,
      dayMarkerLabel: report.dayMarker
        ? DAY_MARKER_LABELS[report.dayMarker] || report.dayMarker
        : "",
      priority: report.status === "base" ? 0 : 1,
    };
  };

  const getOverlappingShift = (userId: string) => {
    if (!startDate || !startTime || !endDate || !endTime) return null;

    const candidateStart = new Date(
      combineDateAndTime(startDate, startTime)
    ).getTime();
    const candidateEnd = new Date(
      combineDateAndTime(endDate, endTime)
    ).getTime();

    return shifts.find((shift) => {
      if (editingShift?.shiftId === shift.shiftId) return false;
      if (
        !shift.assignments.some(
          (assignment) =>
            assignment.assigneeType !== "external" &&
            assignment.userId === userId
        )
      ) {
        return false;
      }

      const shiftStart = new Date(shift.startAt).getTime();
      const shiftEnd = new Date(shift.endAt).getTime();

      return candidateStart < shiftEnd && candidateEnd > shiftStart;
    });
  };

  const isAllowedForSlot = (user: UserProfile, slot: ExpandedSlot) => {
    const medicalRoleName = (user.medicalRole || "")
      .trim()
      .toLocaleLowerCase("he");
    const medicalAllowed = slot.allowedMedicalRoleIds.some(
      (roleId) => medicalRoleNameById.get(roleId) === medicalRoleName
    );
    const systemAllowed = slot.allowedSystemRoles.includes(getSystemRole(user));
    return medicalAllowed || systemAllowed;
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      setShifts(await dataService.getShifts());
    } catch (error) {
      console.error("Failed loading shifts:", error);
      setMessage({ type: "error", text: "טעינת המשמרות נכשלה." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
    dataService
      .getShiftTypeConfigs()
      .then((items) =>
        setShiftTypes(
          [...items]
            .filter((item) => item.enabled)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        )
      )
      .catch((error) =>
        console.error("Failed loading shift types:", error)
      );
  }, []);

  const visibleShifts = useMemo(() => {
    const now = Date.now();
    const normalizedSearch = search.trim().toLocaleLowerCase("he");
    return shifts
      .filter((shift) =>
        canManage
          ? true
          : isPublishedShift(shift) &&
            shift.assignments.some(
              (assignment) => assignment.userId === currentUser.userId
            )
      )
      .filter((shift) => showPast || new Date(shift.endAt).getTime() >= now)
      .filter((shift) =>
        shiftTypeFilter ? shift.title === shiftTypeFilter : true
      )
      .filter((shift) => {
        if (!statusFilter) return true;
        if (statusFilter === "published") return isPublishedShift(shift);
        return shift.status === statusFilter;
      })
      .filter((shift) => {
        if (!normalizedSearch) return true;
        return [
          shift.title,
          shift.shiftType,
          shift.location,
          shift.note,
          ...shift.assignments.map((assignment) => assignment.userName),
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("he").includes(normalizedSearch)
          );
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [
    shifts,
    canManage,
    currentUser.userId,
    showPast,
    search,
    shiftTypeFilter,
    statusFilter,
  ]);

  const applyTimeRange = (
    nextStartTime: string,
    nextEndTime: string,
    crossesMidnight: boolean
  ) => {
    const baseDate = startDate || getTodayInputDate();
    setStartDate(baseDate);
    setStartTime(nextStartTime);
    setEndDate(addDaysToInputDate(baseDate, crossesMidnight ? 1 : 0));
    setEndTime(nextEndTime);
  };

  const handleShiftTypeSelection = (value: string) => {
    setSelectedShiftTypeId(value);

    if (value === "custom") {
      setTitle(customTitle.trim());
      setShiftType("אחר");
      return;
    }

    const selected = shiftTypes.find((item) => item.id === value);
    if (!selected) return;

    setTitle(selected.name);
    setShiftType(selected.name);
    setCustomTitle("");

    if (selected.defaultStartTime && selected.defaultEndTime) {
      applyTimeRange(
        selected.defaultStartTime,
        selected.defaultEndTime,
        selected.crossesMidnight === true
      );
    }
  };

  const resetForm = () => {
    setEditingShift(null);
    setSelectedShiftTypeId("");
    setTitle("");
    setCustomTitle("");
    setShiftType("משמרת");
    setStartDate(getTodayInputDate());
    setStartTime("05:30");
    setEndDate(getTodayInputDate());
    setEndTime("18:30");
    setLocation("");
    setNote("");
    setSlotAssignments({});
    setMessage(null);
  };

  const openNew = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (shift: ShiftRecord) => {
    const next: Record<string, string> = {};
    expandedSlots.forEach((slot, index) => {
      const assignment =
        shift.assignments.find((item) => item.slotId === slot.key) ||
        shift.assignments[index];
      next[slot.key] = assignment
        ? assignment.assigneeType === "external"
          ? `external:${
              assignment.externalStaffId ||
              assignment.userId.replace("external:", "")
            }`
          : `user:${assignment.userId}`
        : "";
    });
    const startParts = toLocalParts(shift.startAt);
    const endParts = toLocalParts(shift.endAt);
    const matchedType = shiftTypes.find(
      (item) =>
        item.name.trim().toLocaleLowerCase("he") ===
        shift.title.trim().toLocaleLowerCase("he")
    );

    setEditingShift(shift);
    setSelectedShiftTypeId(matchedType?.id || "custom");
    setTitle(shift.title);
    setCustomTitle(matchedType ? "" : shift.title);
    setShiftType(shift.shiftType);
    setStartDate(startParts.date);
    setStartTime(startParts.time);
    setEndDate(endParts.date);
    setEndTime(endParts.time);
    setLocation(shift.location || "");
    setNote(shift.note || "");
    setSlotAssignments(next);
    setIsFormOpen(true);
    setMessage(null);
  };

  const saveShift = async () => {
    setMessage(null);
    const resolvedTitle =
      selectedShiftTypeId === "custom" ? customTitle.trim() : title.trim();

    if (
      !resolvedTitle ||
      !startDate ||
      !startTime ||
      !endDate ||
      !endTime
    ) {
      setMessage({
        type: "error",
        text: "יש להזין שם, שעת התחלה ושעת סיום.",
      });
      return;
    }
    const startAt = combineDateAndTime(startDate, startTime);
    const endAt = combineDateAndTime(endDate, endTime);

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setMessage({
        type: "error",
        text: "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.",
      });
      return;
    }

    const missing = expandedSlots.filter(
      (slot) => slot.required && !slotAssignments[slot.key]
    );
    if (missing.length) {
      setMessage({
        type: "error",
        text: `יש לבחור חייל עבור: ${missing
          .map((slot) => slot.label)
          .join(", ")}.`,
      });
      return;
    }

    const selected = Object.values(slotAssignments).filter(Boolean);
    const duplicate = selected.find(
      (userId, index) => selected.indexOf(userId) !== index
    );
    if (duplicate) {
      const duplicateUserId = duplicate.replace("user:", "");
      const user = selectableUsers.find(
        (item) => item.userId === duplicateUserId
      );
      const externalId = duplicate.replace("external:", "");
      const externalPerson = activeExternalStaff.find(
        (item) => item.id === externalId
      );
      setMessage({
        type: "error",
        text: `${
          user?.fullName || externalPerson?.fullName || "אותו אדם"
        } נבחר ליותר מתפקיד אחד.`,
      });
      return;
    }

    const assignments: ShiftAssignment[] = expandedSlots
      .filter((slot) => slotAssignments[slot.key])
      .map((slot) => {
        const selectedValue = slotAssignments[slot.key];

        if (selectedValue.startsWith("external:")) {
          const externalId = selectedValue.replace("external:", "");
          const person = activeExternalStaff.find(
            (item) => item.id === externalId
          );
          if (!person) throw new Error("איש צוות חיצוני לא נמצא");

          return {
            slotId: slot.key,
            slotLabel: slot.label,
            assigneeType: "external",
            externalStaffId: person.id,
            userId: `external:${person.id}`,
            userName: person.fullName,
            medicalRole: person.staffType,
            readStatus: "unread",
          };
        }

        const userId = selectedValue.replace("user:", "");
        const user = selectableUsers.find((item) => item.userId === userId);
        if (!user) throw new Error("משתמש לא נמצא");

        const previous = editingShift?.assignments.find(
          (item) => item.slotId === slot.key && item.userId === user.userId
        );

        return {
          slotId: slot.key,
          slotLabel: slot.label,
          assigneeType: "user",
          userId: user.userId,
          userName: user.fullName,
          personalId: user.personalId,
          unit: user.unit,
          medicalRole: user.medicalRole,
          readStatus: previous?.readStatus || "unread",
          readAt: previous?.readAt,
        };
      });

    setSaving(true);
    try {
      const values = {
        title: resolvedTitle,
        shiftType:
          selectedShiftTypeId === "custom"
            ? "אחר"
            : shiftType.trim() || resolvedTitle,
        startAt,
        endAt,
        location: location.trim(),
        note: note.trim(),
        assignments,
        status: editingShift?.status || "draft",
      };
      if (editingShift) {
        await dataService.updateShift(editingShift.shiftId, values, currentUser);
      } else {
        await dataService.createShift(
          {
            ...values,
            status: "draft",
            createdBy: currentUser.userId,
            createdByName: currentUser.fullName,
          },
          currentUser
        );
      }
      await loadShifts();
      setIsFormOpen(false);
      resetForm();
      setMessage({ type: "success", text: "המשמרת נשמרה בהצלחה." });
    } catch (error) {
      console.error("Failed saving shift:", error);
      setMessage({ type: "error", text: "שמירת המשמרת נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  const deleteShift = async (shift: ShiftRecord) => {
    if (!window.confirm(`למחוק את המשמרת "${shift.title}"?`)) return;
    try {
      await dataService.deleteShift(shift.shiftId);
      await loadShifts();
      setMessage({ type: "success", text: "המשמרת נמחקה." });
    } catch {
      setMessage({ type: "error", text: "מחיקת המשמרת נכשלה." });
    }
  };

  const markRead = async (shift: ShiftRecord) => {
    try {
      await dataService.markShiftAsRead(
        shift.shiftId,
        currentUser.userId,
        currentUser
      );
      await loadShifts();
      setMessage({ type: "success", text: "המשמרת סומנה כנקראה." });
    } catch {
      setMessage({ type: "error", text: "עדכון סטטוס הקריאה נכשל." });
    }
  };

  const duplicateShift = (shift: ShiftRecord) => {
    const startParts = toLocalParts(shift.startAt);
    const endParts = toLocalParts(shift.endAt);
    const startDateValue = new Date(`${startParts.date}T12:00:00`);
    startDateValue.setDate(startDateValue.getDate() + 7);
    const endDateValue = new Date(`${endParts.date}T12:00:00`);
    endDateValue.setDate(endDateValue.getDate() + 7);

    setEditingShift(null);
    setSelectedShiftTypeId("custom");
    setTitle(`${shift.title} - עותק`);
    setCustomTitle(`${shift.title} - עותק`);
    setShiftType(shift.shiftType);
    setStartDate(startDateValue.toISOString().slice(0, 10));
    setStartTime(startParts.time);
    setEndDate(endDateValue.toISOString().slice(0, 10));
    setEndTime(endParts.time);
    setLocation(shift.location || "");
    setNote(shift.note || "");

    const nextAssignments: Record<string, string> = {};
    expandedSlots.forEach((slot, index) => {
      const assignment =
        shift.assignments.find((item) => item.slotId === slot.key) ||
        shift.assignments[index];
      nextAssignments[slot.key] = assignment
        ? assignment.assigneeType === "external"
          ? `external:${assignment.externalStaffId || assignment.userId.replace(
              "external:",
              ""
            )}`
          : `user:${assignment.userId}`
        : "";
    });
    setSlotAssignments(nextAssignments);
    setIsFormOpen(true);
    setMessage({
      type: "success",
      text: "נוצר עותק לשבוע הבא. ניתן לשנות ולשמור.",
    });
  };

  const togglePublishShift = async (shift: ShiftRecord) => {
    try {
      const nextStatus = isPublishedShift(shift) ? "draft" : "published";
      await dataService.updateShift(
        shift.shiftId,
        { status: nextStatus },
        currentUser
      );
      await loadShifts();
      setMessage({
        type: "success",
        text:
          nextStatus === "published"
            ? "המשמרת פורסמה לחיילים."
            : "המשמרת הוחזרה לטיוטה.",
      });
    } catch (error) {
      console.error("Failed updating shift publication:", error);
      setMessage({ type: "error", text: "עדכון סטטוס המשמרת נכשל." });
    }
  };

  const exportShiftsCsv = () => {
    const rows = [
      [
        "שם משמרת",
        "סטטוס",
        "התחלה",
        "סיום",
        "מיקום",
        "תפקיד",
        "משובץ",
        "אישור קריאה",
      ],
      ...visibleShifts.flatMap((shift) =>
        shift.assignments.length
          ? shift.assignments.map((assignment) => [
              shift.title,
              shift.status === "draft"
                ? "טיוטה"
                : shift.status === "cancelled"
                ? "בוטלה"
                : "פורסמה",
              new Date(shift.startAt).toLocaleString("he-IL"),
              new Date(shift.endAt).toLocaleString("he-IL"),
              shift.location || "",
              assignment.slotLabel || "",
              assignment.userName,
              assignment.assigneeType === "external"
                ? "לא נדרש"
                : assignment.readStatus === "read"
                ? "נקרא"
                : "טרם נקרא",
            ])
          : [
              [
                shift.title,
                shift.status,
                new Date(shift.startAt).toLocaleString("he-IL"),
                new Date(shift.endAt).toLocaleString("he-IL"),
                shift.location || "",
                "",
                "",
                "",
              ],
            ]
      ),
    ];

    const csv = "\ufeff" + rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shifts_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printShifts = () => {
    if (visibleShifts.length === 0) {
      setMessage({
        type: "error",
        text: "אין משמרות להדפסה.",
      });
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setMessage({
        type: "error",
        text: "הדפדפן חסם את חלון ההדפסה. יש לאפשר חלונות קופצים לאתר.",
      });
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const logoDataUrl =
      "data:image/png;base64,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SqvcbreydetWrqqqClqtlvgCfm54eBhj/u6QJAllZWU98xct+MmE9CEfpfTdzs7O25sbm7i9e/fqb7/jjnnBYOg727dtKxseHoYkSTAYDFi5cqV77qxZd55imSsHAgESCATAGAPP8zCZTLBaYvZ8icfwGo3GB/V6/a11dXViY2OjnuM4wnGcHAqF5IyMjMapU6d+E4D38OHDj7322mvXvf/++1Sj0UhXXnnlnvXr169cunTpJ9XOSxkZGU1XXHEFnTRpklJRUeHfuHGjZ3R0VMcYExMTE5nJZHoXwGmJZ2Zm5gOzZs2aedFFF/2WEDIxWlViYmIGly1bNpKenr7r1POysrI+Liws7C0pKTkxY8YMCYD3xIkTnosuush1+eWXX6woyoU6ne7u7OzsQ1Cn7CoqXx333XPPbycXFAaz0zOU3KxsJSuaXpSWrhQVFErf+uY3j1dVVWWdet7x48e1d91114bJRcXuFctX9B8+ePDXP/nxfwTzc/OUzPQMpaykVPrenXf11NXULD01hYYxxr3xxhve2bNnK3mTcpXU5BTle3feJXk8nsR/1XOOpSn15eTkhOfPnz/0xBNPXKmm9qioqPxDbNy4Mea273znobmzZteWlZZ1lJWV9dxw7fXbX3/99RWMsU9NxWGMkS1btqRWVVXlbdmy5YpFixZtnz59evM111yz56233rqQMfapM5TW1taLf//733dccsklgbvvvtt1+PDh2/81T/d/vPXWW48//vjjl6miqaKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKionLO8P8Bwf3DhN/q7LoAAAAASUVORK5CYII=";

    const getWeekStartForPrint = (value: string) => {
      const date = new Date(value);
      const day = date.getDay();
      const result = new Date(date);
      result.setHours(12, 0, 0, 0);
      result.setDate(result.getDate() - day);
      return result;
    };

    const getLocalDateKeyForPrint = (value: string | Date) => {
      const date = typeof value === "string" ? new Date(value) : value;
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60_000)
        .toISOString()
        .slice(0, 10);
    };

    const formatDateForPrint = (value: string | Date) =>
      new Date(value).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

    const formatShortDateForPrint = (value: string | Date) =>
      new Date(value).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
      });

    const formatTimeForPrint = (value: string) =>
      new Date(value).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      });

    const formatWeekdayForPrint = (value: string) =>
      new Date(value).toLocaleDateString("he-IL", {
        weekday: "long",
      });

    const printableShifts = [...visibleShifts].sort((a, b) =>
      a.startAt.localeCompare(b.startAt)
    );

    const weekGroups = new Map<string, ShiftRecord[]>();

    printableShifts.forEach((shift) => {
      const weekStart = getWeekStartForPrint(shift.startAt);
      const weekKey = getLocalDateKeyForPrint(weekStart);

      if (!weekGroups.has(weekKey)) {
        weekGroups.set(weekKey, []);
      }

      weekGroups.get(weekKey)?.push(shift);
    });

    const weekSections = Array.from(weekGroups.entries())
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(([weekKey, weekShifts]) => {
        const weekStart = new Date(`${weekKey}T12:00:00`);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const orderedRoleLabels = Array.from(
          new Set(
            weekShifts.flatMap((shift) =>
              shift.assignments.map(
                (assignment) => assignment.slotLabel || "תפקיד"
              )
            )
          )
        ).sort((first, second) => {
          const firstIndex = expandedSlots.findIndex(
            (slot) => slot.label === first
          );
          const secondIndex = expandedSlots.findIndex(
            (slot) => slot.label === second
          );

          if (firstIndex >= 0 && secondIndex >= 0) {
            return firstIndex - secondIndex;
          }

          if (firstIndex >= 0) return -1;
          if (secondIndex >= 0) return 1;
          return first.localeCompare(second, "he");
        });

        const assignmentCount = weekShifts.reduce(
          (total, shift) => total + shift.assignments.length,
          0
        );

        const missingCount = weekShifts.reduce((total, shift) => {
          const shiftRoleLabels = new Set(
            shift.assignments.map(
              (assignment) => assignment.slotLabel || "תפקיד"
            )
          );

          return (
            total +
            orderedRoleLabels.filter((roleLabel) => !shiftRoleLabels.has(roleLabel))
              .length
          );
        }, 0);

        const shiftHeaders = weekShifts
          .map(
            (shift) => `
              <th class="shift-column">
                <div class="shift-date">${escapeHtml(
                  formatWeekdayForPrint(shift.startAt)
                )}</div>
                <div class="shift-date-number">${escapeHtml(
                  formatShortDateForPrint(shift.startAt)
                )}</div>
                <div class="shift-title">${escapeHtml(shift.title)}</div>
                <div class="shift-time">
                  ${escapeHtml(formatTimeForPrint(shift.startAt))}–${escapeHtml(
              formatTimeForPrint(shift.endAt)
            )}
                </div>
                ${
                  shift.location
                    ? `<div class="shift-location">${escapeHtml(
                        shift.location
                      )}</div>`
                    : ""
                }
              </th>
            `
          )
          .join("");

        const rows = orderedRoleLabels
          .map((roleLabel) => {
            const cells = weekShifts
              .map((shift) => {
                const assignment = shift.assignments.find(
                  (item) => (item.slotLabel || "תפקיד") === roleLabel
                );

                if (!assignment) {
                  return '<td class="assignment-cell empty-cell">—</td>';
                }

                const readStatus =
                  includeReadStatusInPrint &&
                  assignment.assigneeType !== "external"
                    ? assignment.readStatus === "read"
                      ? '<span class="read-status read">✓</span>'
                      : '<span class="read-status unread">○</span>'
                    : "";

                return `
                  <td class="assignment-cell">
                    <div class="assignee-name">${escapeHtml(
                      assignment.userName
                    )} ${readStatus}</div>
                  </td>
                `;
              })
              .join("");

            return `
              <tr>
                <th class="role-cell">${escapeHtml(roleLabel)}</th>
                ${cells}
              </tr>
            `;
          })
          .join("");

        return `
          <section class="week-sheet">
            <header class="document-header">
              <div class="logo-wrap">
                <img src="${logoDataUrl}" alt="לוגו היחידה" />
              </div>

              <div class="document-title">
                <h1>לוח משמרות שבועי</h1>
                <div class="week-range">
                  שבוע ${escapeHtml(formatDateForPrint(weekStart))}–${escapeHtml(
            formatDateForPrint(weekEnd)
          )}
                </div>
              </div>

              <div class="summary-box">
                <div><strong>משמרות:</strong> ${weekShifts.length}</div>
                <div><strong>שיבוצים:</strong> ${assignmentCount}</div>
                <div><strong>תאים חסרים:</strong> ${missingCount}</div>
              </div>
            </header>

            <div class="table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th class="role-heading">תפקיד</th>
                    ${shiftHeaders}
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>

            <footer class="document-footer">
              <span>הופק בתאריך: ${escapeHtml(
                new Date().toLocaleString("he-IL")
              )}</span>
              ${
                includeReadStatusInPrint
                  ? '<span>✓ נקרא · ○ טרם נקרא</span>'
                  : ""
              }
            </footer>
          </section>
        `;
      })
      .join("");

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>לוח משמרות שבועי</title>

          <style>
            @page {
              size: A4 landscape;
              margin: 8mm;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              direction: rtl;
              font-family: Arial, "Assistant", sans-serif;
              color: #0f172a;
              background: #ffffff;
            }

            body {
              padding: 0;
            }

            .week-sheet {
              width: 100%;
              min-height: 185mm;
              page-break-after: always;
              break-after: page;
              display: flex;
              flex-direction: column;
            }

            .week-sheet:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .document-header {
              display: grid;
              grid-template-columns: 145px 1fr 165px;
              align-items: center;
              gap: 12px;
              margin-bottom: 7px;
              padding-bottom: 7px;
              border-bottom: 2px solid #1e3a5f;
            }

            .logo-wrap {
              display: flex;
              align-items: center;
              justify-content: flex-start;
            }

            .logo-wrap img {
              display: block;
              width: 138px;
              max-height: 64px;
              object-fit: contain;
            }

            .document-title {
              text-align: center;
            }

            .document-title h1 {
              margin: 0;
              font-size: 19px;
              font-weight: 800;
              color: #1e3a5f;
            }

            .week-range {
              margin-top: 4px;
              font-size: 11px;
              font-weight: 700;
              color: #475569;
            }

            .summary-box {
              display: grid;
              grid-template-columns: 1fr;
              gap: 2px;
              border: 1px solid #cbd5e1;
              border-radius: 7px;
              padding: 6px 8px;
              background: #f8fafc;
              font-size: 9px;
              line-height: 1.45;
            }

            .table-wrap {
              width: 100%;
              overflow: hidden;
              flex: 1;
            }

            .roster-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              font-size: 8.2px;
            }

            .roster-table th,
            .roster-table td {
              border: 1px solid #334155;
              padding: 3px 3px;
              text-align: center;
              vertical-align: middle;
              overflow-wrap: anywhere;
            }

            .role-heading,
            .role-cell {
              width: 82px;
              min-width: 82px;
              max-width: 82px;
              background: #facc15;
              color: #991b1b;
              font-weight: 800;
            }

            .role-heading {
              font-size: 9px;
            }

            .role-cell {
              font-size: 8px;
              line-height: 1.2;
            }

            .shift-column {
              background: #4f86c6;
              color: #ffffff;
              font-weight: 700;
              line-height: 1.15;
              min-width: 68px;
            }

            .shift-date {
              font-size: 8px;
              font-weight: 800;
            }

            .shift-date-number {
              margin-top: 1px;
              font-size: 8px;
            }

            .shift-title {
              margin-top: 3px;
              font-size: 8px;
              font-weight: 800;
              color: #ffffff;
            }

            .shift-time {
              margin-top: 2px;
              font-size: 7px;
              color: #e2e8f0;
            }

            .shift-location {
              margin-top: 2px;
              font-size: 6.7px;
              color: #e2e8f0;
            }

            .assignment-cell {
              height: 23px;
              background: #ffffff;
            }

            .assignment-cell:nth-child(even) {
              background: #f8fafc;
            }

            .assignee-name {
              font-size: 7.8px;
              font-weight: 700;
              line-height: 1.15;
            }

            .empty-cell {
              color: #94a3b8;
              font-size: 9px;
            }

            .read-status {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 11px;
              height: 11px;
              margin-right: 2px;
              border-radius: 999px;
              font-size: 7px;
              font-weight: 900;
            }

            .read-status.read {
              background: #dcfce7;
              color: #166534;
            }

            .read-status.unread {
              background: #fef3c7;
              color: #92400e;
            }

            .document-footer {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin-top: 5px;
              padding-top: 4px;
              border-top: 1px solid #cbd5e1;
              font-size: 7px;
              color: #64748b;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>

        <body>
          ${weekSections}

          <script>
            window.addEventListener("load", function () {
              setTimeout(function () {
                window.focus();
                window.print();
              }, 350);
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const shareShiftOnWhatsApp = (shift: ShiftRecord) => {
    const start = new Date(shift.startAt).toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const end = new Date(shift.endAt).toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const assignmentsText = shift.assignments
      .map(
        (assignment) =>
          `${assignment.slotLabel || "תפקיד"}: ${assignment.userName}`
      )
      .join("\n");

    const message = [
      `*${shift.title}*`,
      shift.shiftType ? `סוג: ${shift.shiftType}` : "",
      `התחלה: ${start}`,
      `סיום: ${end}`,
      shift.location ? `מיקום: ${shift.location}` : "",
      "",
      "*שיבוץ המשמרת:*",
      assignmentsText,
      shift.note ? `\nהערות: ${shift.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <section dir="rtl" className="min-w-0 space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {canManage ? "ניהול משמרות" : "המשמרות שלי"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {canManage
                  ? "השיבוצים מסוננים לפי ההגדרות שנקבעו בניהול תפקידי משמרת."
                  : "צפייה בתפקיד שנקבע עבורך ואישור שקראת את המשמרת."}
              </p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              משמרת חדשה
            </button>
          )}
        </div>
      </div>

      <ShiftFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        shiftTypeFilter={shiftTypeFilter}
        onShiftTypeFilterChange={setShiftTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showPast={showPast}
        onShowPastChange={setShowPast}
        shiftTypes={Array.from(new Set(shifts.map((shift) => shift.title))).sort(
          (a, b) => a.localeCompare(b, "he")
        )}
        onPrint={printShifts}
        onExport={exportShiftsCsv}
      />

      {canManage && (
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 shadow-sm">
          <input
            type="checkbox"
            checked={includeReadStatusInPrint}
            onChange={(event) =>
              setIncludeReadStatusInPrint(event.target.checked)
            }
          />
          כלול אישור קריאה בהדפסה / PDF
        </label>
      )}

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          טוען משמרות...
        </div>
      ) : visibleShifts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 text-sm font-black text-slate-700">
            אין משמרות להצגה
          </div>
        </div>
      ) : viewMode === "week" ? (
        <WeeklyShiftView
          shifts={visibleShifts}
          anchorDate={weekAnchor}
          onAnchorDateChange={setWeekAnchor}
          onOpen={setDetailsShift}
        />
      ) : viewMode === "month" ? (
        <MonthlyShiftCalendar
          shifts={visibleShifts}
          monthDate={monthAnchor}
          onMonthDateChange={setMonthAnchor}
          onOpen={setDetailsShift}
        />
      ) : (
        <CompactShiftList
          shifts={visibleShifts}
          canManage={canManage}
          onOpen={setDetailsShift}
          onEdit={openEdit}
          onDuplicate={duplicateShift}
          onShare={shareShiftOnWhatsApp}
          onDelete={deleteShift}
          onTogglePublish={togglePublishShift}
        />
      )}

      {detailsShift && (
        <div className="fixed inset-0 z-[11900] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            dir="rtl"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {detailsShift.title}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                    {formatDateTime(detailsShift.startAt)} —{" "}
                    {formatDateTime(detailsShift.endAt)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                      detailsShift.status === "draft"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : detailsShift.status === "cancelled"
                        ? "border-slate-300 bg-slate-100 text-slate-600"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {detailsShift.status === "draft"
                      ? "טיוטה"
                      : detailsShift.status === "cancelled"
                      ? "בוטלה"
                      : "פורסמה"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailsShift(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailsShift.location && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
                <span className="font-black text-slate-500">מיקום: </span>
                <span className="font-bold text-slate-800">
                  {detailsShift.location}
                </span>
              </div>
            )}

            <div className="mt-5 space-y-2">
              {detailsShift.assignments.map((assignment) => (
                <div
                  key={`${assignment.slotId}_${assignment.userId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <span className="text-xs font-bold text-slate-500">
                    {assignment.slotLabel || "תפקיד"}
                  </span>
                  <div className="text-left">
                    <div className="text-xs font-black text-slate-900">
                      {assignment.userName}
                    </div>
                    {assignment.assigneeType !== "external" && (
                      <div
                        className={`mt-0.5 text-[9px] font-bold ${
                          assignment.readStatus === "read"
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}
                      >
                        {assignment.readStatus === "read"
                          ? "קרא/ה"
                          : "טרם נקרא"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {detailsShift.note && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                {detailsShift.note}
              </div>
            )}

            {canManage && (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <button
                  type="button"
                  onClick={() => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    openEdit(shift);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
                >
                  <Edit2 className="h-4 w-4" />
                  עריכה
                </button>

                <button
                  type="button"
                  onClick={() => shareShiftOnWhatsApp(detailsShift)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    duplicateShift(shift);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  שכפול
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    await togglePublishShift(shift);
                  }}
                  className="rounded-xl border border-amber-200 px-3 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-50"
                >
                  {isPublishedShift(detailsShift)
                    ? "החזר לטיוטה"
                    : "פרסם"}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    await deleteShift(shift);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-black text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  מחיקה
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">
                {editingShift ? "עריכת משמרת" : "יצירת משמרת"}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="שם המשמרת">
                <select
                  value={selectedShiftTypeId}
                  onChange={(event) =>
                    handleShiftTypeSelection(event.target.value)
                  }
                  className="input"
                >
                  <option value="">בחר שם משמרת...</option>
                  {shiftTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  <option value="custom">אחר — הזנה ידנית</option>
                </select>
              </Field>

              {selectedShiftTypeId === "custom" ? (
                <Field label="שם משמרת ידני">
                  <input
                    value={customTitle}
                    onChange={(event) => {
                      setCustomTitle(event.target.value);
                      setTitle(event.target.value);
                    }}
                    placeholder="הקלד שם משמרת"
                    className="input"
                  />
                </Field>
              ) : (
                <Field label="שעות בחירה מהירה">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        applyTimeRange("05:30", "18:30", false)
                      }
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-100"
                    >
                      05:30–18:30
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyTimeRange("18:30", "05:30", true)
                      }
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-black text-indigo-800 hover:bg-indigo-100"
                    >
                      18:30–05:30
                    </button>
                  </div>
                </Field>
              )}

              <Field label="תאריך התחלה">
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="שעת התחלה — ניתן לבחור או להקליד">
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  step={60}
                  className="input"
                />
              </Field>

              <Field label="תאריך סיום">
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="שעת סיום — ניתן לבחור או להקליד">
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  step={60}
                  className="input"
                />
              </Field>

              <div className="md:col-span-2">
                <div className="mb-2 text-xs font-bold text-slate-700">
                  טווחי שעות קבועים
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyTimeRange("05:30", "18:30", false)
                    }
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-800 hover:bg-amber-100"
                  >
                    משמרת יום · 05:30–18:30
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyTimeRange("18:30", "05:30", true)
                    }
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-black text-indigo-800 hover:bg-indigo-100"
                  >
                    משמרת לילה · 18:30–05:30 למחרת
                  </button>
                </div>
              </div>

              <Field label="מצב פרסום">
                <select
                  value={
                    editingShift
                      ? isPublishedShift(editingShift)
                        ? "published"
                        : editingShift.status
                      : "draft"
                  }
                  onChange={(event) => {
                    if (!editingShift) return;
                    setEditingShift({
                      ...editingShift,
                      status: event.target.value as ShiftRecord["status"],
                    });
                  }}
                  className="input"
                  disabled={!editingShift}
                >
                  <option value="draft">טיוטה</option>
                  <option value="published">פורסמה</option>
                  <option value="cancelled">בוטלה</option>
                </select>
              </Field>

              <Field label="מיקום">
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="הערה">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>

            <div className="mt-6 space-y-3">
              <div>
                <div className="text-sm font-black text-slate-900">
                  שיבוץ בעלי תפקידים
                </div>
                <div className="mt-1 text-[10px] font-bold leading-5 text-slate-500">
                  ליד כל חייל מוצגים סטטוס הנוכחות וסימון היום לתאריך
                  המשמרת. חיילים בבסיס מוצגים ראשונים. סימון חפיפה הוא
                  מידע בלבד ואינו חוסם את השיבוץ.
                </div>
              </div>
              {expandedSlots.map((slot) => {
                const availableUsers = slot.allowSystemUsers
                  ? selectableUsers
                      .filter(
                        (user) =>
                          (slot.allowDischargedUsers ||
                            !user.isDischarged) &&
                          isAllowedForSlot(user, slot)
                      )
                      .map((user) => ({
                        user,
                        attendance: getAttendanceInfo(user),
                        overlappingShift: getOverlappingShift(user.userId),
                      }))
                      .sort((a, b) => {
                        const dischargedDifference =
                          Number(a.user.isDischarged === true) -
                          Number(b.user.isDischarged === true);
                        if (dischargedDifference !== 0) {
                          return dischargedDifference;
                        }

                        const attendanceDifference =
                          a.attendance.priority - b.attendance.priority;
                        if (attendanceDifference !== 0) {
                          return attendanceDifference;
                        }

                        return a.user.fullName.localeCompare(
                          b.user.fullName,
                          "he"
                        );
                      })
                  : [];

                const availableExternal = slot.allowExternalStaff
                  ? activeExternalStaff.filter(
                      (item) =>
                        slot.allowedExternalStaffTypes.length === 0 ||
                        slot.allowedExternalStaffTypes.includes(item.staffType)
                    )
                  : [];
                return (
                  <div
                    key={slot.key}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[190px_1fr] md:items-center">
                      <div>
                        <div className="text-xs font-black text-slate-800">
                          {slot.label}
                          {!slot.required && (
                            <span className="mr-2 font-medium text-slate-400">
                              (רשות)
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        value={slotAssignments[slot.key] || ""}
                        onChange={(event) =>
                          setSlotAssignments((current) => ({
                            ...current,
                            [slot.key]: event.target.value,
                          }))
                        }
                        className="input"
                      >
                        <option value="">
                          {slot.required ? "בחר חייל..." : "ללא שיבוץ"}
                        </option>
                        {availableUsers.map(
                          ({ user, attendance, overlappingShift }) => {
                            const details = [
                              user.medicalRole,
                              user.unit,
                              attendance.label,
                              attendance.dayMarkerLabel,
                              user.isDischarged ? "נגרע" : "",
                              overlappingShift
                                ? `חפיפה: ${overlappingShift.title}`
                                : "",
                            ].filter(Boolean);

                            return (
                              <option
                                key={`user:${user.userId}`}
                                value={`user:${user.userId}`}
                              >
                                {user.fullName}
                                {details.length
                                  ? ` — ${details.join(" | ")}`
                                  : ""}
                              </option>
                            );
                          }
                        )}
                        {availableExternal.map((item) => (
                          <option
                            key={`external:${item.id}`}
                            value={`external:${item.id}`}
                          >
                            {item.fullName}
                            {item.staffType ? ` — ${item.staffType}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {availableUsers.length === 0 &&
                      availableExternal.length === 0 && (
                      <div className="mt-2 text-[10px] font-bold text-rose-600">
                        אין מועמדים מתאימים. ניתן להרחיב את התפקידים המותרים
                        דרך ניהול מערכת → ניהול תפקידי משמרת.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {message?.type === "error" && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                {message.text}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveShift}
                disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                {saving ? "שומר..." : "שמור משמרת"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
