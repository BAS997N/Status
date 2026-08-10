import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Clock3,
  Edit2,
  MapPin,
  MessageCircle,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  Users,
  UnlockKeyhole,
  X,
} from "lucide-react";
import {
  AttendanceReport,
  AttendanceStatusConfig,
  ExternalStaffMember,
  MedicalRoleConfig,
  ShiftAssignment,
  ShiftRecord,
  ShiftSignupRequest,
  ShiftSlotConfig,
  ShiftTypeConfig,
  SystemRole,
  SystemSettingsConfig,
  UserProfile,
  WhatsAppGroupConfig,
} from "../types";
import { dataService } from "../services/dataService";
import ShiftFilters, { ShiftViewMode } from "./shifts/ShiftFilters";
import WeeklyShiftView from "./shifts/WeeklyShiftView";
import CompactShiftList from "./shifts/CompactShiftList";
import MonthlyShiftCalendar from "./shifts/MonthlyShiftCalendar";
import DailyShiftView from "./shifts/DailyShiftView";
import battalionLogo from "../assets/battalion-logo.png";
import { isPublishedShift } from "./shifts/shiftViewUtils";
import { sendAutomaticPush } from "../services/pushService";
import { buildCsv } from "../utils/csvSecurity";
import { getDisciplinaryRestrictionStatus } from "../utils/shiftRestriction";

interface ShiftsViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  initialShifts: ShiftRecord[];
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
  allowedUserIds: string[];
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
  return_to_base: "חזרה מהבית",
  exit_home: "יציאה לבית",
  after_hours: "אפטר",
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
  initialShifts,
  canManage,
  shiftSlotConfigs,
  medicalRoleConfigs,
  externalStaff,
  reports,
  attendanceStatuses,
}: ShiftsViewProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>(initialShifts);
  const [loading, setLoading] = useState(false);
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
  const [dayAnchor, setDayAnchor] = useState(new Date());
  const [detailsShift, setDetailsShift] = useState<ShiftRecord | null>(null);
  const [includeReadStatusInPrint, setIncludeReadStatusInPrint] =
    useState(false);
  const [includePhonesInPrint, setIncludePhonesInPrint] = useState(false);
  const [printPhoneRoleMode, setPrintPhoneRoleMode] = useState<
    "all" | "custom"
  >("all");
  const [selectedPrintPhoneRoles, setSelectedPrintPhoneRoles] = useState<
    string[]
  >([]);
  const [includeLocationInPrint, setIncludeLocationInPrint] = useState(true);
  const [includeNotesInPrint, setIncludeNotesInPrint] = useState(false);
  const [addContactSheetInPrint, setAddContactSheetInPrint] =
    useState(false);
  const [isPrintOptionsOpen, setIsPrintOptionsOpen] = useState(false);
  const [printStartDate, setPrintStartDate] = useState(getTodayInputDate());
  const [printEndDate, setPrintEndDate] = useState(
    addDaysToInputDate(getTodayInputDate(), 6)
  );
  const [isWhatsAppOptionsOpen, setIsWhatsAppOptionsOpen] = useState(false);
  const [whatsAppStartDate, setWhatsAppStartDate] = useState(
    getTodayInputDate()
  );
  const [whatsAppEndDate, setWhatsAppEndDate] = useState(
    addDaysToInputDate(getTodayInputDate(), 6)
  );
  const [includeLocationInWhatsApp, setIncludeLocationInWhatsApp] =
    useState(true);
  const [includeNotesInWhatsApp, setIncludeNotesInWhatsApp] =
    useState(true);
  const [includePhonesInWhatsApp, setIncludePhonesInWhatsApp] =
    useState(false);
  const [includeDraftsInWhatsApp, setIncludeDraftsInWhatsApp] =
    useState(false);
  const [phoneRoleMode, setPhoneRoleMode] = useState<"all" | "custom">(
    "all"
  );
  const [selectedPhoneRoles, setSelectedPhoneRoles] = useState<string[]>(
    []
  );
  const [whatsAppGroups, setWhatsAppGroups] = useState<
    WhatsAppGroupConfig[]
  >([]);
  const [selectedWhatsAppTarget, setSelectedWhatsAppTarget] =
    useState("__general__");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null);
  const [formStatus, setFormStatus] = useState<
    "draft" | "published" | "cancelled"
  >("draft");
  const [sendPushOnPublish, setSendPushOnPublish] = useState(false);
  const [signupRequestsEnabled, setSignupRequestsEnabled] = useState(false);
  const [signupRequestsLocked, setSignupRequestsLocked] = useState(false);
  const [signupRequests, setSignupRequests] = useState<ShiftSignupRequest[]>(
    []
  );
  const [signupRequestSavingId, setSignupRequestSavingId] = useState("");
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
  const [endTime, setEndTime] = useState("17:30");
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
            allowedUserIds: config.allowedUserIds || [],
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
      dayMarkerLabel:
        report.dayMarker === "after_hours"
          ? `אפטר${report.afterHours ? ` ${report.afterHours} שעות` : ""}`
          : report.dayMarker
          ? DAY_MARKER_LABELS[report.dayMarker] || report.dayMarker
          : "",
      priority: report.status === "base" ? 0 : 1,
    };
  };

  const getShiftRestriction = (user: UserProfile, shiftDate = startDate) =>
    getDisciplinaryRestrictionStatus(user, reports, shiftDate);

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
    const individuallyAllowed = slot.allowedUserIds.includes(user.userId);
    return medicalAllowed || systemAllowed || individuallyAllowed;
  };

  const getSlotRoleMatchPriority = (
    user: UserProfile,
    slot: ExpandedSlot
  ) => {
    const medicalRoleName = (user.medicalRole || "")
      .trim()
      .toLocaleLowerCase("he");
    const matchesMedicalRole = slot.allowedMedicalRoleIds.some(
      (roleId) => medicalRoleNameById.get(roleId) === medicalRoleName
    );

    if (matchesMedicalRole) return 0;
    if (slot.allowedUserIds.includes(user.userId)) return 1;
    if (slot.allowedSystemRoles.includes(getSystemRole(user))) return 2;
    return 3;
  };

  const getAttendanceSortPriority = (
    attendance: ReturnType<typeof getAttendanceInfo>
  ) => {
    const report = attendance.report;
    if (!report) return 5;
    if (report.dayMarker === "exit_home") return 0;
    if (report.status === "base" && !report.dayMarker) return 1;
    if (report.dayMarker === "return_to_base") return 2;
    if (report.dayMarker === "after_hours") return 3;
    if (report.status === "base") return 1;
    return 4;
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

  const loadSignupRequests = async () => {
    try {
      setSignupRequests(
        await dataService.getShiftSignupRequests(
          canManage ? undefined : currentUser.userId
        )
      );
    } catch (error) {
      console.error("Failed loading shift signup requests:", error);
      setMessage({
        type: "error",
        text: "טעינת בקשות השיבוץ נכשלה.",
      });
    }
  };

  useEffect(() => {
    dataService
      .getSystemSettings()
      .then((settings: SystemSettingsConfig) => {
        const groups = (settings.whatsappGroups || [])
          .filter((group) => group.enabled)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        setWhatsAppGroups(groups);

        const defaultGroup = groups.find((group) => group.isDefault);
        if (defaultGroup) {
          setSelectedWhatsAppTarget(defaultGroup.id);
        }
      })
      .catch((error) =>
        console.error("Failed loading WhatsApp groups:", error)
      );

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

  useEffect(() => {
    setShifts(initialShifts);
    setLoading(false);
  }, [initialShifts]);

  useEffect(() => {
    void loadSignupRequests();
  }, [canManage, currentUser.userId]);

  useEffect(() => {
    if (canManage && detailsShift?.signupRequestsEnabled) {
      void loadSignupRequests();
    }
  }, [canManage, detailsShift?.shiftId]);

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

  const signupRequestsByShiftId = useMemo(() => {
    const map = new Map<string, ShiftSignupRequest[]>();
    signupRequests.forEach((request) => {
      map.set(request.shiftId, [
        ...(map.get(request.shiftId) || []),
        request,
      ]);
    });
    return map;
  }, [signupRequests]);

  const shiftsOpenForSignup = useMemo(
    () =>
      shifts
        .filter(
          (shift) =>
            isPublishedShift(shift) &&
            shift.signupRequestsEnabled === true &&
            !shift.assignments.some(
              (assignment) => assignment.userId === currentUser.userId
            ) &&
            !getDisciplinaryRestrictionStatus(
              currentUser,
              reports,
              toLocalParts(shift.startAt).date
            ).active &&
            new Date(shift.endAt).getTime() >= Date.now()
        )
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [shifts, currentUser, reports]
  );

  const printRangeShifts = useMemo(
    () =>
      visibleShifts
        .filter((shift) => {
          const shiftDate = toLocalParts(shift.startAt).date;
          return (
            !!printStartDate &&
            !!printEndDate &&
            shiftDate >= printStartDate &&
            shiftDate <= printEndDate
          );
        })
        .sort((first, second) =>
          first.startAt.localeCompare(second.startAt)
        ),
    [visibleShifts, printStartDate, printEndDate]
  );

  const availablePrintPhoneRoles = useMemo(
    () =>
      Array.from(
        new Set(
          printRangeShifts.flatMap((shift) =>
            shift.assignments.map(
              (assignment) => assignment.slotLabel || "תפקיד"
            )
          )
        )
      ).sort((first, second) => first.localeCompare(second, "he")),
    [printRangeShifts]
  );

  useEffect(() => {
    if (printPhoneRoleMode !== "custom") return;

    setSelectedPrintPhoneRoles((current) =>
      current.filter((role) => availablePrintPhoneRoles.includes(role))
    );
  }, [availablePrintPhoneRoles, printPhoneRoleMode]);

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
    setEndTime("17:30");
    setLocation("");
    setNote("");
    setFormStatus("draft");
    setSendPushOnPublish(false);
    setSignupRequestsEnabled(false);
    setSignupRequestsLocked(false);
    setSlotAssignments({});
    setMessage(null);
  };

  const openNew = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (shift: ShiftRecord) => {
    const next: Record<string, string> = {};
    const hasSlotIds = shift.assignments.some((item) => Boolean(item.slotId));
    expandedSlots.forEach((slot, index) => {
      const assignment =
        shift.assignments.find((item) => item.slotId === slot.key) ||
        (!hasSlotIds ? shift.assignments[index] : undefined);
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
    setFormStatus(
      isPublishedShift(shift)
        ? "published"
        : shift.status === "cancelled"
        ? "cancelled"
        : "draft"
    );
    setSendPushOnPublish(shift.sendPushOnPublish === true);
    setSignupRequestsEnabled(shift.signupRequestsEnabled === true);
    setSignupRequestsLocked(shift.signupRequestsLocked === true);
    setSlotAssignments(next);
    setIsFormOpen(true);
    setMessage(null);
  };

  const saveShift = async (
    targetStatus: "draft" | "published" | "cancelled"
  ) => {
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

    const restrictedSelection = (Object.values(slotAssignments) as string[])
      .filter((value) => value.startsWith("user:"))
      .map((value) => value.replace("user:", ""))
      .map((userId) => selectableUsers.find((user) => user.userId === userId))
      .find(
        (user): user is UserProfile =>
          Boolean(
            user &&
              getShiftRestriction(user, startDate).active &&
              user.disciplinaryRestriction?.allowManagerShiftAssignment !== true
          )
      );
    if (restrictedSelection) {
      setMessage({
        type: "error",
        text: `${restrictedSelection.fullName} נמצא/ת בתקופת עבודות רס״ר ומנוע/ה משיבוץ למשמרת בתאריך זה.`,
      });
      return;
    }

    const missing = expandedSlots.filter(
      (slot) => slot.required && !slotAssignments[slot.key]
    );

    if (
      targetStatus === "published" &&
      missing.length &&
      !signupRequestsEnabled
    ) {
      setMessage({
        type: "error",
        text: `לא ניתן לפרסם לפני השלמת השיבוץ עבור: ${missing
          .map((slot) => slot.label)
          .join(", ")}. ניתן לשמור את המשמרת כטיוטה לקראת פרסום.`,
      });
      return;
    }

    const selectedSlotsByAssignee = expandedSlots.reduce<
      Record<string, ExpandedSlot[]>
    >((result, slot) => {
      const assigneeId = slotAssignments[slot.key];
      if (!assigneeId) return result;
      result[assigneeId] = [...(result[assigneeId] || []), slot];
      return result;
    }, {});
    const invalidDuplicate = (
      Object.entries(selectedSlotsByAssignee) as Array<
        [string, ExpandedSlot[]]
      >
    ).find(
      ([, slots]) =>
        slots.length > 1 &&
        !(
          slots.length === 2 &&
          slots.some((slot) => slot.configId === "duty_commander")
        )
    );
    if (invalidDuplicate) {
      const [duplicate] = invalidDuplicate;
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
        status: targetStatus,
        sendPushOnPublish,
        signupRequestsEnabled,
        signupRequestsLocked:
          signupRequestsEnabled && signupRequestsLocked,
      };
      if (editingShift) {
        await dataService.updateShift(editingShift.shiftId, values, currentUser);
      } else {
        await dataService.createShift(
          {
            ...values,
            status: targetStatus,
            createdBy: currentUser.userId,
            createdByName: currentUser.fullName,
          },
          currentUser
        );
      }
      await loadShifts();

      let pushWarning = "";
      let pushSent = false;
      const shouldSendPublicationPush =
        targetStatus === "published" &&
        sendPushOnPublish &&
        (!editingShift || !isPublishedShift(editingShift));
      if (shouldSendPublicationPush) {
        const assignedUserIds = Array.from(
          new Set(
            assignments
              .filter(
                (assignment) =>
                  assignment.assigneeType !== "external" &&
                  Boolean(assignment.userId) &&
                  !assignment.userId.startsWith("external:")
              )
              .map((assignment) => assignment.userId)
          )
        );

        if (assignedUserIds.length > 0) {
          try {
            await sendAutomaticPush({
              kind: "shift",
              target: { type: "users", userIds: assignedUserIds },
              title: "פורסמה משמרת חדשה",
              body: `${resolvedTitle} | ${new Date(startAt).toLocaleString(
                "he-IL",
                { dateStyle: "short", timeStyle: "short" }
              )}${location.trim() ? ` | ${location.trim()}` : ""}`,
              url: "https://bas997n.github.io/Status/",
            });
            pushSent = true;
          } catch (pushError) {
            console.error("Shift publication push failed:", pushError);
            pushWarning = "המשמרת פורסמה, אך שליחת ה־Push נכשלה.";
          }
        }
      }

      setIsFormOpen(false);
      resetForm();
      setMessage({
        type: pushWarning ? "error" : "success",
        text:
          targetStatus === "published"
            ? pushWarning ||
              (pushSent
                ? "המשמרת נשמרה, פורסמה ונשלחה התראת Push למשובצים."
                : "המשמרת נשמרה ופורסמה ללא Push.")
            : targetStatus === "cancelled"
            ? "המשמרת נשמרה כמבוטלת. היא לא תוצג לחיילים ולא תיכלל בשיתוף WhatsApp."
            : missing.length
            ? `המשמרת נשמרה כטיוטה עם ${missing.length} תפקידים שעדיין לא שובצו.`
            : "המשמרת נשמרה כטיוטה לקראת פרסום.",
      });
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

  const requestShiftSignup = async (shift: ShiftRecord) => {
    const shiftDate = toLocalParts(shift.startAt).date;
    if (getShiftRestriction(currentUser, shiftDate).active) {
      setMessage({
        type: "error",
        text: "לא ניתן לשלוח בקשת שיבוץ במהלך תקופת עבודות רס״ר.",
      });
      return;
    }
    setSignupRequestSavingId(shift.shiftId);
    setMessage(null);
    try {
      const created = await dataService.createShiftSignupRequest(
        shift,
        currentUser
      );
      setSignupRequests((current) => [
        created,
        ...current.filter((item) => item.requestId !== created.requestId),
      ]);
      setMessage({
        type: "success",
        text: `בקשת השיבוץ למשמרת „${shift.title}” נשלחה.`,
      });
    } catch {
      setMessage({
        type: "error",
        text: "שליחת בקשת השיבוץ נכשלה.",
      });
    } finally {
      setSignupRequestSavingId("");
    }
  };

  const cancelShiftSignupRequest = async (
    shift: ShiftRecord,
    request: ShiftSignupRequest
  ) => {
    setSignupRequestSavingId(shift.shiftId);
    setMessage(null);
    try {
      await dataService.deleteShiftSignupRequest(request);
      setSignupRequests((current) =>
        current.filter((item) => item.requestId !== request.requestId)
      );
      setMessage({
        type: "success",
        text: `בקשת השיבוץ למשמרת „${shift.title}” בוטלה.`,
      });
    } catch {
      setMessage({
        type: "error",
        text: "ביטול בקשת השיבוץ נכשל.",
      });
    } finally {
      setSignupRequestSavingId("");
    }
  };

  const duplicateShift = (shift: ShiftRecord) => {
    const startParts = toLocalParts(shift.startAt);
    const endParts = toLocalParts(shift.endAt);

    setEditingShift(null);
    setSelectedShiftTypeId("custom");
    setTitle(`${shift.title} - עותק`);
    setCustomTitle(`${shift.title} - עותק`);
    setShiftType(shift.shiftType);
    setStartDate(startParts.date);
    setStartTime(startParts.time);
    setEndDate(endParts.date);
    setEndTime(endParts.time);
    setLocation(shift.location || "");
    setNote(shift.note || "");
    setFormStatus("draft");
    setSendPushOnPublish(false);
    setSignupRequestsEnabled(false);
    setSignupRequestsLocked(false);

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
      text: "נוצר עותק של המשמרת באותו תאריך. ניתן לשנות את התאריך ולשמור.",
    });
  };

  const togglePublishShift = async (shift: ShiftRecord) => {
    try {
      const nextStatus = isPublishedShift(shift) ? "draft" : "published";

      if (nextStatus === "published") {
        const assignedSlotIds = new Set(
          shift.assignments.map((assignment) => assignment.slotId)
        );
        const assignedSlotLabels = new Set(
          shift.assignments.map(
            (assignment) => assignment.slotLabel || "תפקיד"
          )
        );

        const missingRequiredSlots = expandedSlots.filter(
          (slot) =>
            slot.required &&
            !assignedSlotIds.has(slot.key) &&
            !assignedSlotLabels.has(slot.label)
        );

        if (missingRequiredSlots.length) {
          setMessage({
            type: "error",
            text: `לא ניתן לפרסם את המשמרת. חסר שיבוץ עבור: ${missingRequiredSlots
              .map((slot) => slot.label)
              .join(", ")}.`,
          });
          return;
        }
      }

      await dataService.updateShift(
        shift.shiftId,
        { status: nextStatus },
        currentUser
      );
      await loadShifts();

      let pushWarning = "";
      let pushSent = false;
      if (nextStatus === "published" && shift.sendPushOnPublish === true) {
        const assignedUserIds = Array.from(
          new Set(
            shift.assignments
              .filter(
                (assignment) =>
                  assignment.assigneeType !== "external" &&
                  Boolean(assignment.userId) &&
                  !assignment.userId.startsWith("external:")
              )
              .map((assignment) => assignment.userId)
          )
        );

        if (assignedUserIds.length > 0) {
          try {
            await sendAutomaticPush({
              kind: "shift",
              target: { type: "users", userIds: assignedUserIds },
              title: "פורסמה משמרת חדשה",
              body: `${shift.title} | ${new Date(shift.startAt).toLocaleString(
                "he-IL",
                { dateStyle: "short", timeStyle: "short" }
              )}${shift.location ? ` | ${shift.location}` : ""}`,
              url: "https://bas997n.github.io/Status/",
            });
            pushSent = true;
          } catch (pushError) {
            console.error("Shift publication push failed:", pushError);
            pushWarning = "המשמרת פורסמה, אך שליחת ה־Push נכשלה.";
          }
        }
      }

      setMessage({
        type: pushWarning ? "error" : "success",
        text:
          nextStatus === "published"
            ? pushWarning ||
              (pushSent
                ? "המשמרת פורסמה ונשלחה התראת Push למשובצים."
                : "המשמרת פורסמה ללא Push.")
            : "המשמרת הוחזרה לטיוטה לקראת פרסום.",
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
                ? "טיוטה לקראת פרסום"
                : shift.status === "cancelled"
                ? "מבוטלת"
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

    const csv = "\ufeff" + buildCsv(rows);

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

  const openPrintOptions = () => {
    const firstShift = visibleShifts[0];
    const lastShift = visibleShifts[visibleShifts.length - 1];

    setPrintStartDate(
      firstShift ? toLocalParts(firstShift.startAt).date : getTodayInputDate()
    );
    setPrintEndDate(
      lastShift
        ? toLocalParts(lastShift.startAt).date
        : addDaysToInputDate(getTodayInputDate(), 6)
    );
    setIsPrintOptionsOpen(true);
  };

  const printShifts = () => {
    if (!printStartDate || !printEndDate) {
      setMessage({
        type: "error",
        text: "יש לבחור תאריך התחלה ותאריך סיום לייצוא.",
      });
      return;
    }

    if (printEndDate < printStartDate) {
      setMessage({
        type: "error",
        text: "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה.",
      });
      return;
    }

    const shiftsForPrint = printRangeShifts;

    if (shiftsForPrint.length === 0) {
      setMessage({
        type: "error",
        text: "אין משמרות בטווח התאריכים שנבחר.",
      });
      return;
    }

    if (
      includePhonesInPrint &&
      printPhoneRoleMode === "custom" &&
      selectedPrintPhoneRoles.length === 0
    ) {
      setMessage({
        type: "error",
        text: "בחר לפחות תפקיד אחד להצגת מספרי טלפון ב־PDF.",
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

    setIsPrintOptionsOpen(false);

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const formatDateForPrint = (value: string | Date) =>
      new Date(value).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

    const formatTimeForPrint = (value: string) =>
      new Date(value).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      });

    const formatWeekdayForPrint = (value: string | Date) =>
      new Date(value).toLocaleDateString("he-IL", {
        weekday: "long",
      });

    const getPhoneNumber = (assignment: ShiftAssignment) => {
      if (assignment.assigneeType === "external") {
        const externalId =
          assignment.externalStaffId ||
          assignment.userId.replace("external:", "");

        return (
          externalStaff.find((item) => item.id === externalId)
            ?.phoneNumber || ""
        );
      }

      return (
        allUsers.find((user) => user.userId === assignment.userId)
          ?.phoneNumber || ""
      );
    };

    const shouldIncludePhone = (roleLabel: string) =>
      includePhonesInPrint &&
      (printPhoneRoleMode === "all" ||
        selectedPrintPhoneRoles.includes(roleLabel));

    const shiftsByDate = new Map<string, ShiftRecord[]>();

    shiftsForPrint.forEach((shift) => {
      const dateKey = toLocalParts(shift.startAt).date;
      const current = shiftsByDate.get(dateKey) || [];
      current.push(shift);
      shiftsByDate.set(dateKey, current);
    });

    const orderedDays = Array.from(shiftsByDate.entries()).sort(
      ([firstDate], [secondDate]) => firstDate.localeCompare(secondDate)
    );

    const requiredSlotLabels = expandedSlots
      .filter((slot) => slot.required)
      .map((slot) => slot.label);

    const assignedCount = shiftsForPrint.reduce(
      (total, shift) => total + shift.assignments.length,
      0
    );

    const missingCount = shiftsForPrint.reduce((total, shift) => {
      const assignedLabels = new Set(
        shift.assignments.map(
          (assignment) => assignment.slotLabel || "תפקיד"
        )
      );

      return (
        total +
        requiredSlotLabels.filter((label) => !assignedLabels.has(label))
          .length
      );
    }, 0);

    const daySections = orderedDays
      .map(([dateKey, dayShifts]) => {
        const dateValue = new Date(`${dateKey}T12:00:00`);

        const roleLabels = Array.from(
          new Set([
            ...requiredSlotLabels,
            ...dayShifts.flatMap((shift) =>
              shift.assignments.map(
                (assignment) => assignment.slotLabel || "תפקיד"
              )
            ),
          ])
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

        const shiftHeaders = dayShifts
          .map(
            (shift) => `
              <th class="shift-column">
                <div class="shift-title">${escapeHtml(shift.title)}</div>
                <div class="shift-time">
                  ${escapeHtml(formatTimeForPrint(shift.startAt))}–${escapeHtml(
              formatTimeForPrint(shift.endAt)
            )}
                </div>
                ${
                  includeLocationInPrint && shift.location
                    ? `<div class="shift-location"><strong>מיקום:</strong> ${escapeHtml(
                        shift.location
                      )}</div>`
                    : ""
                }
                ${
                  includeNotesInPrint && shift.note
                    ? `<div class="shift-note"><strong>הערות:</strong> ${escapeHtml(shift.note)}</div>`
                    : ""
                }
              </th>
            `
          )
          .join("");

        const rows = roleLabels
          .map((roleLabel) => {
            const isRequired = requiredSlotLabels.includes(roleLabel);

            const cells = dayShifts
              .map((shift) => {
                const assignment = shift.assignments.find(
                  (item) => (item.slotLabel || "תפקיד") === roleLabel
                );

                if (!assignment) {
                  return isRequired
                    ? '<td class="assignment-cell missing-cell">חסר</td>'
                    : '<td class="assignment-cell empty-cell">—</td>';
                }

                const readStatus =
                  includeReadStatusInPrint &&
                  assignment.assigneeType !== "external"
                    ? assignment.readStatus === "read"
                      ? '<span class="read-status read">✓</span>'
                      : '<span class="read-status unread">○</span>'
                    : "";

                const phoneNumber = shouldIncludePhone(roleLabel)
                  ? getPhoneNumber(assignment)
                  : "";

                return `
                  <td class="assignment-cell">
                    <div class="assignee-name">
                      ${escapeHtml(assignment.userName)} ${readStatus}
                    </div>
                    ${
                      phoneNumber
                        ? `<div class="phone-number">${escapeHtml(
                            phoneNumber
                          )}</div>`
                        : ""
                    }
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
          <section class="day-block">
            <div class="day-heading">
              <div>
                <strong>${escapeHtml(
                  formatWeekdayForPrint(dateValue)
                )}</strong>
                <span>${escapeHtml(formatDateForPrint(dateValue))}</span>
              </div>
              <span>${dayShifts.length} משמרות</span>
            </div>

            <div class="table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th class="role-heading">תפקיד</th>
                    ${shiftHeaders}
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </section>
        `;
      })
      .join("");

    const contactEntries = Array.from(
      new Map(
        shiftsForPrint
          .flatMap((shift) =>
            shift.assignments
              .map((assignment) => {
                const roleLabel = assignment.slotLabel || "תפקיד";

                if (!shouldIncludePhone(roleLabel)) return null;

                const phoneNumber = getPhoneNumber(assignment);
                if (!phoneNumber) return null;

                const uniqueKey = `${
                  assignment.assigneeType || "user"
                }_${assignment.userId}_${phoneNumber}`;

                return [
                  uniqueKey,
                  {
                    roleLabel,
                    userName: assignment.userName,
                    phoneNumber,
                  },
                ] as const;
              })
              .filter(
                (
                  item
                ): item is readonly [
                  string,
                  {
                    roleLabel: string;
                    userName: string;
                    phoneNumber: string;
                  }
                ] => item !== null
              )
          )
      ).values()
    ).sort((first, second) =>
      first.roleLabel === second.roleLabel
        ? first.userName.localeCompare(second.userName, "he")
        : first.roleLabel.localeCompare(second.roleLabel, "he")
    );

    const contactSheet =
      addContactSheetInPrint &&
      includePhonesInPrint &&
      contactEntries.length > 0
        ? `
          <section class="contact-sheet">
            <div class="contact-sheet-heading">
              <h2>דף קשר למשמרות</h2>
              <p>
                ${escapeHtml(
                  formatDateForPrint(`${printStartDate}T12:00:00`)
                )}
                —
                ${escapeHtml(
                  formatDateForPrint(`${printEndDate}T12:00:00`)
                )}
              </p>
            </div>

            <table class="contact-table">
              <thead>
                <tr>
                  <th>תפקיד</th>
                  <th>שם</th>
                  <th>מספר טלפון</th>
                </tr>
              </thead>
              <tbody>
                ${contactEntries
                  .map(
                    (entry) => `
                      <tr>
                        <td>${escapeHtml(entry.roleLabel)}</td>
                        <td>${escapeHtml(entry.userName)}</td>
                        <td class="contact-phone">${escapeHtml(
                          entry.phoneNumber
                        )}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </section>
        `
        : "";

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>לוח משמרות</title>

          <style>
            @page {
              size: A4 landscape;
              margin: 7mm;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              direction: rtl;
              background: #ffffff;
              color: #0f172a;
              font-family: Arial, "Assistant", sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .document-header {
              display: grid;
              grid-template-columns: 100px 1fr 190px;
              align-items: center;
              gap: 12px;
              margin-bottom: 8px;
              padding-bottom: 7px;
              border-bottom: 2px solid #334155;
            }

            .logo-wrap {
              display: flex;
              align-items: center;
              justify-content: flex-start;
              height: 60px;
            }

            .logo-wrap img {
              display: block;
              width: auto;
              height: 58px;
              max-width: 98px;
              object-fit: contain;
            }

            .document-title {
              text-align: center;
            }

            .document-title h1 {
              margin: 0;
              font-size: 20px;
            }

            .document-title p {
              margin: 4px 0 0;
              font-size: 10px;
              color: #475569;
            }

            .summary-box {
              border: 1px solid #cbd5e1;
              border-radius: 7px;
              padding: 6px 8px;
              background: #f8fafc;
              font-size: 8.5px;
              line-height: 1.65;
            }

            .day-block {
              margin-bottom: 8px;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .day-heading {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 4px 7px;
              border: 1px solid #64748b;
              border-bottom: 0;
              background: #dbeafe;
              font-size: 10px;
            }

            .day-heading strong {
              margin-left: 6px;
              font-size: 11px;
            }

            .table-wrap {
              width: 100%;
              overflow: hidden;
            }

            .roster-table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              font-size: 9.2px;
            }

            .roster-table th,
            .roster-table td {
              border: 1px solid #64748b;
              padding: 4px;
              text-align: center;
              vertical-align: middle;
              overflow-wrap: anywhere;
            }

            .role-heading,
            .role-cell {
              width: 105px;
              background: #e2e8f0;
              font-weight: 900;
            }

            .shift-column {
              background: #4f81bd;
              color: #ffffff;
              font-weight: 800;
            }

            .shift-title {
              font-size: 10.5px;
              font-weight: 900;
              line-height: 1.25;
            }

            .shift-time {
              margin-top: 3px;
              font-size: 8.8px;
              font-weight: 800;
            }

            .shift-location,
            .shift-note {
              margin-top: 3px;
              font-size: 8.8px;
              font-weight: 700;
              line-height: 1.35;
              opacity: 1;
              overflow-wrap: anywhere;
            }

            .shift-note {
              padding-top: 2px;
              border-top: 1px solid rgba(255, 255, 255, 0.35);
            }

            .assignment-cell {
              background: #ffffff;
            }

            .assignee-name {
              font-size: 9.5px;
              font-weight: 800;
              line-height: 1.25;
            }

            .phone-number {
              margin-top: 2px;
              direction: ltr;
              font-size: 8.2px;
              font-weight: 700;
              color: #334155;
            }

            .empty-cell {
              color: #94a3b8;
              background: #f8fafc;
            }

            .missing-cell {
              background: #fee2e2;
              color: #b91c1c;
              font-weight: 900;
            }

            .read-status {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 11px;
              height: 11px;
              margin-right: 2px;
              border-radius: 50%;
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
              gap: 10px;
              margin-top: 5px;
              padding-top: 4px;
              border-top: 1px solid #cbd5e1;
              color: #64748b;
              font-size: 7.5px;
            }

            .contact-sheet {
              page-break-before: always;
              break-before: page;
            }

            .contact-sheet-heading {
              margin-bottom: 10px;
              padding-bottom: 8px;
              border-bottom: 2px solid #334155;
              text-align: center;
            }

            .contact-sheet-heading h2 {
              margin: 0;
              font-size: 20px;
            }

            .contact-sheet-heading p {
              margin: 4px 0 0;
              color: #64748b;
              font-size: 10px;
            }

            .contact-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
            }

            .contact-table th,
            .contact-table td {
              border: 1px solid #64748b;
              padding: 7px;
              text-align: right;
            }

            .contact-table th {
              background: #e2e8f0;
              font-weight: 900;
            }

            .contact-phone {
              direction: ltr;
              text-align: left !important;
              font-weight: 800;
            }
          </style>
        </head>

        <body>
          <header class="document-header">
            <div class="logo-wrap">
              <img src="${battalionLogo}" alt="לוגו הגדוד" />
            </div>

            <div class="document-title">
              <h1>לוח משמרות</h1>
              <p>
                ${escapeHtml(
                  formatDateForPrint(`${printStartDate}T12:00:00`)
                )}
                —
                ${escapeHtml(
                  formatDateForPrint(`${printEndDate}T12:00:00`)
                )}
              </p>
            </div>

            <div class="summary-box">
              <div><strong>ימים:</strong> ${orderedDays.length}</div>
              <div><strong>משמרות:</strong> ${shiftsForPrint.length}</div>
              <div><strong>משובצים:</strong> ${assignedCount}</div>
              <div><strong>חוסרים:</strong> ${missingCount}</div>
            </div>
          </header>

          ${daySections}

          <footer class="document-footer">
            <span>הופק בתאריך: ${escapeHtml(
              new Date().toLocaleString("he-IL")
            )}</span>
            <span>
              ${
                includeReadStatusInPrint
                  ? "✓ נקרא · ○ טרם נקרא"
                  : ""
              }
              ${
                includePhonesInPrint
                  ? `${includeReadStatusInPrint ? " · " : ""}כולל טלפונים`
                  : ""
              }
            </span>
          </footer>

          ${contactSheet}

          <script>
            window.addEventListener("load", function () {
              setTimeout(function () {
                window.focus();
                window.print();
              }, 500);
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const openWhatsAppOptions = (
    preset: "today" | "week" | "range" = "range"
  ) => {
    const today = getTodayInputDate();
    setIncludeLocationInWhatsApp(true);
    setIncludeNotesInWhatsApp(true);
    setIncludePhonesInWhatsApp(false);
    setIncludeDraftsInWhatsApp(false);

    if (preset === "today") {
      setWhatsAppStartDate(today);
      setWhatsAppEndDate(today);
    } else if (preset === "week") {
      const current = new Date(`${today}T12:00:00`);
      const weekStart = new Date(current);
      weekStart.setDate(current.getDate() - current.getDay());
      const startValue = weekStart.toISOString().slice(0, 10);
      setWhatsAppStartDate(startValue);
      setWhatsAppEndDate(addDaysToInputDate(startValue, 6));
    } else {
      const firstShift = visibleShifts[0];
      const lastShift = visibleShifts[visibleShifts.length - 1];

      setWhatsAppStartDate(
        firstShift ? toLocalParts(firstShift.startAt).date : today
      );
      setWhatsAppEndDate(
        lastShift
          ? toLocalParts(lastShift.startAt).date
          : addDaysToInputDate(today, 6)
      );
    }

    setIsWhatsAppOptionsOpen(true);
  };

  const whatsappRangeShifts = useMemo(
    () =>
      visibleShifts
        .filter(
          (shift) =>
            isPublishedShift(shift) ||
            (includeDraftsInWhatsApp && shift.status === "draft")
        )
        .filter((shift) => {
          const shiftDate = toLocalParts(shift.startAt).date;
          return (
            !!whatsAppStartDate &&
            !!whatsAppEndDate &&
            shiftDate >= whatsAppStartDate &&
            shiftDate <= whatsAppEndDate
          );
        })
        .sort((first, second) =>
          first.startAt.localeCompare(second.startAt)
        ),
    [
      visibleShifts,
      whatsAppStartDate,
      whatsAppEndDate,
      includeDraftsInWhatsApp,
    ]
  );

  const availablePhoneRoles = useMemo(
    () =>
      Array.from(
        new Set(
          whatsappRangeShifts.flatMap((shift) =>
            shift.assignments.map(
              (assignment) => assignment.slotLabel || "תפקיד"
            )
          )
        )
      ).sort((first, second) => first.localeCompare(second, "he")),
    [whatsappRangeShifts]
  );

  useEffect(() => {
    if (phoneRoleMode !== "custom") return;

    setSelectedPhoneRoles((current) =>
      current.filter((role) => availablePhoneRoles.includes(role))
    );
  }, [availablePhoneRoles, phoneRoleMode]);

  const getAssignmentPhoneNumber = (assignment: ShiftAssignment) => {
    if (assignment.assigneeType === "external") {
      const externalId =
        assignment.externalStaffId ||
        assignment.userId.replace("external:", "");

      return (
        externalStaff.find((item) => item.id === externalId)
          ?.phoneNumber || ""
      );
    }

    return (
      allUsers.find((user) => user.userId === assignment.userId)
        ?.phoneNumber || ""
    );
  };

  const shouldIncludePhoneForRole = (roleLabel: string) =>
    includePhonesInWhatsApp &&
    (phoneRoleMode === "all" ||
      selectedPhoneRoles.includes(roleLabel));

  const shareMultipleShiftsOnWhatsApp = async () => {
    if (!whatsAppStartDate || !whatsAppEndDate) {
      setMessage({
        type: "error",
        text: "יש לבחור תאריך התחלה ותאריך סיום לשליחה.",
      });
      return;
    }

    if (whatsAppEndDate < whatsAppStartDate) {
      setMessage({
        type: "error",
        text: "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה.",
      });
      return;
    }

    const selectedShifts = whatsappRangeShifts;

    if (selectedShifts.length === 0) {
      setMessage({
        type: "error",
        text: "אין משמרות בטווח התאריכים שנבחר.",
      });
      return;
    }

    const shiftsByDate = new Map<string, ShiftRecord[]>();

    selectedShifts.forEach((shift) => {
      const dateKey = toLocalParts(shift.startAt).date;
      const current = shiftsByDate.get(dateKey) || [];
      current.push(shift);
      shiftsByDate.set(dateKey, current);
    });

    const dayMessages = Array.from(shiftsByDate.entries())
      .sort(([firstDate], [secondDate]) =>
        firstDate.localeCompare(secondDate)
      )
      .map(([dateKey, dayShifts]) => {
        const dateValue = new Date(`${dateKey}T12:00:00`);
        const dayHeader = `*${dateValue.toLocaleDateString("he-IL", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}*`;

        const shiftsText = dayShifts
          .map((shift) => {
            const assignments = shift.assignments
              .map((assignment) => {
                const roleLabel =
                  assignment.slotLabel || "תפקיד";
                const phoneNumber = shouldIncludePhoneForRole(roleLabel)
                  ? getAssignmentPhoneNumber(assignment)
                  : "";

                return `• ${roleLabel} — ${assignment.userName}${
                  phoneNumber ? ` — ${phoneNumber}` : ""
                }`;
              })
              .join("\n");

            return [
              `*${shift.title}*`,
              `🕒 ${new Date(shift.startAt).toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
              })}–${new Date(shift.endAt).toLocaleTimeString("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
              includeLocationInWhatsApp && shift.location
                ? `📍 מיקום: ${shift.location}`
                : "",
              assignments || "• טרם שובצו חיילים",
              includeNotesInWhatsApp && shift.note
                ? `📝 הערה: ${shift.note}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

        return `${dayHeader}\n${shiftsText}`;
      });

    const header = [
      "*לוח משמרות*",
      `${new Date(`${whatsAppStartDate}T12:00:00`).toLocaleDateString(
        "he-IL"
      )}–${new Date(`${whatsAppEndDate}T12:00:00`).toLocaleDateString(
        "he-IL"
      )}`,
      "",
    ].join("\n");

    const completeMessage = `${header}${dayMessages.join(
      "\n\n━━━━━━━━━━━━\n\n"
    )}`;

    // WhatsApp links can become unreliable with very long text.
    // Keep one-click sharing for normal ranges, and copy oversized schedules.
    if (completeMessage.length > 7000) {
      try {
        await navigator.clipboard.writeText(completeMessage);
        setIsWhatsAppOptionsOpen(false);
        setMessage({
          type: "success",
          text: "ההודעה ארוכה מדי לפתיחה ישירה. כל לוח המשמרות הועתק ללוח — פתח WhatsApp והדבק בקבוצה.",
        });
      } catch (error) {
        console.error("Failed copying WhatsApp schedule:", error);
        setMessage({
          type: "error",
          text: "ההודעה ארוכה מדי ולא ניתן היה להעתיק אותה.",
        });
      }
      return;
    }

    const selectedGroup = whatsAppGroups.find(
      (group) => group.id === selectedWhatsAppTarget
    );

    if (selectedWhatsAppTarget === "__copy__") {
      try {
        await navigator.clipboard.writeText(completeMessage);
        setIsWhatsAppOptionsOpen(false);
        setMessage({
          type: "success",
          text: "לוח המשמרות הועתק ללוח.",
        });
      } catch (error) {
        console.error("Failed copying WhatsApp schedule:", error);
        setMessage({
          type: "error",
          text: "העתקת ההודעה נכשלה.",
        });
      }
      return;
    }

    if (selectedGroup?.link) {
      try {
        await navigator.clipboard.writeText(completeMessage);
        setIsWhatsAppOptionsOpen(false);
        setMessage({
          type: "success",
          text: `ההודעה הועתקה. קבוצת "${selectedGroup.name}" נפתחת כעת — הדבק ושלח.`,
        });
        window.open(
          selectedGroup.link,
          "_blank",
          "noopener,noreferrer"
        );
      } catch (error) {
        console.error("Failed preparing group share:", error);
        setMessage({
          type: "error",
          text: "לא ניתן היה להעתיק את ההודעה לפני פתיחת הקבוצה.",
        });
      }
      return;
    }

    setIsWhatsAppOptionsOpen(false);
    const whatsappUrl = new URL("https://api.whatsapp.com/send");
    whatsappUrl.searchParams.set("text", completeMessage);
    window.open(whatsappUrl.toString(), "_blank", "noopener,noreferrer");
  };

  const shareShiftOnWhatsApp = async (shift: ShiftRecord) => {
    if (shift.status === "cancelled") {
      setMessage({
        type: "error",
        text: "משמרת מבוטלת אינה ניתנת לשיתוף ב־WhatsApp.",
      });
      return;
    }

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
      `🕒 התחלה: ${start}`,
      `🕒 סיום: ${end}`,
      shift.location ? `📍 מיקום: ${shift.location}` : "",
      "",
      "*שיבוץ המשמרת:*",
      assignmentsText,
      shift.note ? `\n📝 הערה: ${shift.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const whatsappUrl = new URL("https://api.whatsapp.com/send");
    whatsappUrl.searchParams.set("text", message);
    window.open(whatsappUrl.toString(), "_blank", "noopener,noreferrer");
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
            <div className="grid grid-cols-1 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => openWhatsAppOptions("range")}
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700 hover:bg-emerald-100"
              >
                <MessageCircle className="h-4 w-4" />
                שליחת כמה משמרות
              </button>
              <button
                type="button"
                onClick={openNew}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                משמרת חדשה
              </button>
            </div>
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
        onPrint={openPrintOptions}
        onExport={exportShiftsCsv}
      />

      {!canManage && shiftsOpenForSignup.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-emerald-700" />
            <h3 className="text-sm font-black text-emerald-950">
              משמרות פתוחות לבקשת שיבוץ
            </h3>
          </div>
          <p className="mt-1 text-[11px] font-bold text-emerald-800">
            הבקשה מועברת למפקד ואינה מהווה שיבוץ מאושר.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {shiftsOpenForSignup.map((shift) => {
              const ownRequest = (
                signupRequestsByShiftId.get(shift.shiftId) || []
              ).find((request) => request.userId === currentUser.userId);
              const locked = shift.signupRequestsLocked === true;
              const saving = signupRequestSavingId === shift.shiftId;

              return (
                <div
                  key={`signup_${shift.shiftId}`}
                  className="rounded-xl border border-emerald-200 bg-white p-3"
                >
                  <div className="font-black text-slate-900">
                    {shift.title}
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-slate-500">
                    {formatDateTime(shift.startAt)} —{" "}
                    {formatDateTime(shift.endAt)}
                  </div>
                  {shift.location && (
                    <div className="mt-1 text-[10px] font-bold text-slate-500">
                      {shift.location}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={saving || locked}
                    onClick={() =>
                      ownRequest
                        ? cancelShiftSignupRequest(shift, ownRequest)
                        : requestShiftSignup(shift)
                    }
                    className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                      ownRequest
                        ? "bg-rose-600 hover:bg-rose-700"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {locked ? (
                      <LockKeyhole className="h-4 w-4" />
                    ) : (
                      <UserRoundCheck className="h-4 w-4" />
                    )}
                    {locked
                      ? ownRequest
                        ? "הבקשה נשמרה — ההרשמה נעולה"
                        : "הבקשות נעולות"
                      : ownRequest
                      ? "בטל בקשת שיבוץ"
                      : "בקש להשתבץ"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
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
      ) : viewMode === "day" ? (
        <DailyShiftView
          shifts={visibleShifts}
          date={dayAnchor}
          onDateChange={setDayAnchor}
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

      {isWhatsAppOptionsOpen && (
        <div className="fixed inset-0 z-[11840] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            dir="rtl"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  שליחת משמרות ל־WhatsApp
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  ההודעה תסודר לפי ימים ותכלול רק משמרות שקיימות.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWhatsAppOptionsOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => openWhatsAppOptions("today")}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                היום
              </button>
              <button
                type="button"
                onClick={() => openWhatsAppOptions("week")}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                השבוע
              </button>
              <button
                type="button"
                onClick={() => openWhatsAppOptions("range")}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700"
              >
                כל הטווח
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="מתאריך">
                <input
                  type="date"
                  value={whatsAppStartDate}
                  onChange={(event) =>
                    setWhatsAppStartDate(event.target.value)
                  }
                  className="input"
                />
              </Field>

              <Field label="עד תאריך">
                <input
                  type="date"
                  value={whatsAppEndDate}
                  onChange={(event) =>
                    setWhatsAppEndDate(event.target.value)
                  }
                  className="input"
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="יעד השליחה">
                <select
                  value={selectedWhatsAppTarget}
                  onChange={(event) =>
                    setSelectedWhatsAppTarget(event.target.value)
                  }
                  className="input"
                >
                  <option value="__general__">
                    WhatsApp כללי — בחירת קבוצה ידנית
                  </option>
                  {whatsAppGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {group.isDefault ? " — ברירת מחדל" : ""}
                    </option>
                  ))}
                  <option value="__copy__">העתק הודעה בלבד</option>
                </select>
              </Field>

              {selectedWhatsAppTarget !== "__general__" &&
                selectedWhatsAppTarget !== "__copy__" && (
                  <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold leading-5 text-amber-800">
                    ההודעה תועתק ללוח והקבוצה תיפתח. יש להדביק את
                    ההודעה בתוך הקבוצה.
                  </div>
                )}
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                <input
                  type="checkbox"
                  checked={includeDraftsInWhatsApp}
                  onChange={(event) =>
                    setIncludeDraftsInWhatsApp(event.target.checked)
                  }
                />
                כלול גם טיוטות לקראת פרסום
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includePhonesInWhatsApp}
                  onChange={(event) =>
                    setIncludePhonesInWhatsApp(event.target.checked)
                  }
                />
                כלול מספרי טלפון
              </label>

              {includePhonesInWhatsApp && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-black text-slate-800">
                    מספרי טלפון לצירוף
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        name="phone_role_mode"
                        checked={phoneRoleMode === "all"}
                        onChange={() => setPhoneRoleMode("all")}
                      />
                      כל בעלי התפקידים המשובצים
                    </label>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        name="phone_role_mode"
                        checked={phoneRoleMode === "custom"}
                        onChange={() => setPhoneRoleMode("custom")}
                      />
                      בחירת תפקידים ידנית
                    </label>
                  </div>

                  {phoneRoleMode === "custom" && (
                    <div className="mt-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPhoneRoles(availablePhoneRoles)
                          }
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-600"
                        >
                          בחר הכול
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPhoneRoles([])}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-600"
                        >
                          נקה הכול
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPhoneRoles(
                              availablePhoneRoles.filter((role) =>
                                role.includes("נהג")
                              )
                            )
                          }
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700"
                        >
                          רק נהגים
                        </button>
                      </div>

                      <div className="mt-3 grid max-h-44 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                        {availablePhoneRoles.map((role) => (
                          <label
                            key={role}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPhoneRoles.includes(role)}
                              onChange={(event) =>
                                setSelectedPhoneRoles((current) =>
                                  event.target.checked
                                    ? Array.from(
                                        new Set([...current, role])
                                      )
                                    : current.filter(
                                        (item) => item !== role
                                      )
                                )
                              }
                            />
                            {role}
                          </label>
                        ))}
                      </div>

                      {availablePhoneRoles.length === 0 && (
                        <div className="mt-3 text-[10px] font-bold text-slate-400">
                          אין תפקידים בטווח התאריכים שנבחר.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeLocationInWhatsApp}
                  onChange={(event) =>
                    setIncludeLocationInWhatsApp(event.target.checked)
                  }
                />
                כלול מיקום
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeNotesInWhatsApp}
                  onChange={(event) =>
                    setIncludeNotesInWhatsApp(event.target.checked)
                  }
                />
                כלול הערות
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsWhatsAppOptionsOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={shareMultipleShiftsOnWhatsApp}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                פתח ב־WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {isPrintOptionsOpen && (
        <div className="fixed inset-0 z-[11850] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            dir="rtl"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  הגדרות ייצוא ל־PDF
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  בחר טווח תאריכים ואת המידע שיופיע במסמך.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintOptionsOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="מתאריך">
                <input
                  type="date"
                  value={printStartDate}
                  onChange={(event) => setPrintStartDate(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="עד תאריך">
                <input
                  type="date"
                  value={printEndDate}
                  onChange={(event) => setPrintEndDate(event.target.value)}
                  className="input"
                />
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeReadStatusInPrint}
                  onChange={(event) =>
                    setIncludeReadStatusInPrint(event.target.checked)
                  }
                />
                כלול אישורי קריאה
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeLocationInPrint}
                  onChange={(event) =>
                    setIncludeLocationInPrint(event.target.checked)
                  }
                />
                כלול מיקום
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeNotesInPrint}
                  onChange={(event) =>
                    setIncludeNotesInPrint(event.target.checked)
                  }
                />
                כלול הערות
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includePhonesInPrint}
                  onChange={(event) => {
                    setIncludePhonesInPrint(event.target.checked);
                    if (!event.target.checked) {
                      setAddContactSheetInPrint(false);
                    }
                  }}
                />
                כלול מספרי טלפון
              </label>
            </div>

            {includePhonesInPrint && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black text-slate-800">
                  מספרי טלפון לצירוף
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input
                      type="radio"
                      name="print_phone_role_mode"
                      checked={printPhoneRoleMode === "all"}
                      onChange={() => setPrintPhoneRoleMode("all")}
                    />
                    כל בעלי התפקידים המשובצים
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input
                      type="radio"
                      name="print_phone_role_mode"
                      checked={printPhoneRoleMode === "custom"}
                      onChange={() => setPrintPhoneRoleMode("custom")}
                    />
                    בחירת תפקידים ידנית
                  </label>
                </div>

                {printPhoneRoleMode === "custom" && (
                  <div className="mt-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPrintPhoneRoles(
                            availablePrintPhoneRoles
                          )
                        }
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-600"
                      >
                        בחר הכול
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedPrintPhoneRoles([])}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-600"
                      >
                        נקה הכול
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPrintPhoneRoles(
                            availablePrintPhoneRoles.filter((role) =>
                              role.includes("נהג")
                            )
                          )
                        }
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700"
                      >
                        רק נהגים
                      </button>
                    </div>

                    <div className="mt-3 grid max-h-44 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {availablePrintPhoneRoles.map((role) => (
                        <label
                          key={role}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPrintPhoneRoles.includes(role)}
                            onChange={(event) =>
                              setSelectedPrintPhoneRoles((current) =>
                                event.target.checked
                                  ? Array.from(new Set([...current, role]))
                                  : current.filter((item) => item !== role)
                              )
                            }
                          />
                          {role}
                        </label>
                      ))}
                    </div>

                    {availablePrintPhoneRoles.length === 0 && (
                      <div className="mt-3 text-[10px] font-bold text-slate-400">
                        אין תפקידים בטווח התאריכים שנבחר.
                      </div>
                    )}
                  </div>
                )}

                <label className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-bold text-indigo-800">
                  <input
                    type="checkbox"
                    checked={addContactSheetInPrint}
                    onChange={(event) =>
                      setAddContactSheetInPrint(event.target.checked)
                    }
                  />
                  הוסף דף קשר בסוף ה־PDF ללא כפילויות
                </label>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold leading-5 text-rose-800">
              תפקיד חובה שלא שובץ יסומן בתא אדום כ״חסר״. מספר טלפון
              יוצג רק אם הוזן בפרופיל החייל או באיש הצוות החיצוני.
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsPrintOptionsOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600"
              >
                ביטול
              </button>

              <button
                type="button"
                onClick={printShifts}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
              >
                הפק PDF
              </button>
            </div>
          </div>
        </div>
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
                      ? "טיוטה לקראת פרסום"
                      : detailsShift.status === "cancelled"
                      ? "מבוטלת"
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

            {canManage && detailsShift.signupRequestsEnabled && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-black text-emerald-950">
                    <UserRoundCheck className="h-4 w-4" />
                    בקשות שיבוץ
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-emerald-800">
                    {detailsShift.signupRequestsLocked ? (
                      <LockKeyhole className="h-3.5 w-3.5" />
                    ) : (
                      <UnlockKeyhole className="h-3.5 w-3.5" />
                    )}
                    {detailsShift.signupRequestsLocked ? "נעול" : "פתוח"}
                  </span>
                </div>
                {(signupRequestsByShiftId.get(detailsShift.shiftId) || [])
                  .length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {(
                      signupRequestsByShiftId.get(detailsShift.shiftId) || []
                    ).map((request) => (
                      <div
                        key={request.requestId}
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2"
                      >
                        <div className="text-xs font-black text-slate-900">
                          {request.userName}
                        </div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                          {[request.medicalRole, request.unit]
                            .filter(Boolean)
                            .join(" | ")}
                          {" · "}
                          {new Date(request.createdAt).toLocaleString("he-IL")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs font-bold text-emerald-800">
                    עדיין לא התקבלו בקשות.
                  </div>
                )}
              </div>
            )}

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

                {detailsShift.status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => shareShiftOnWhatsApp(detailsShift)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </button>
                ) : (
                  <div className="flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-[10px] font-black text-amber-800">
                    משמרת מבוטלת אינה משותפת
                  </div>
                )}

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
                    ? "החזר לטיוטה לקראת פרסום"
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
              {selectedShiftTypeId === "custom" && (
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
              )}

              {selectedShiftTypeId &&
                selectedShiftTypeId !== "custom" && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-800">
                    בחירת סוג המשמרת ממלאת אוטומטית את שעות ברירת
                    המחדל שהוגדרו בניהול סוגי משמרות. ניתן לשנות אותן
                    ידנית בשדות השעה.
                  </div>
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

              <Field label="מצב המשמרת">
                <select
                  value={formStatus}
                  onChange={(event) =>
                    setFormStatus(
                      event.target.value as
                        | "draft"
                        | "published"
                        | "cancelled"
                    )
                  }
                  className="input"
                >
                  <option value="draft">טיוטה לקראת פרסום</option>
                  <option value="published">פורסמה</option>
                  <option value="cancelled">מבוטלת</option>
                </select>
              </Field>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={sendPushOnPublish}
                  onChange={(event) =>
                    setSendPushOnPublish(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-xs font-black text-indigo-900">
                    שלח Push בעת פרסום המשמרת
                  </span>
                  <span className="mt-1 block text-[10px] font-bold text-indigo-700">
                    ההתראה תישלח רק לחיילים ששובצו במשמרת.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={signupRequestsEnabled}
                  onChange={(event) => {
                    setSignupRequestsEnabled(event.target.checked);
                    if (!event.target.checked) {
                      setSignupRequestsLocked(false);
                    }
                  }}
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                />
                <span>
                  <span className="block text-xs font-black text-emerald-900">
                    אפשר לחיילים לבקש להשתבץ
                  </span>
                  <span className="mt-1 block text-[10px] font-bold text-emerald-700">
                    החיילים יראו את המשמרת גם אם עדיין אינם משובצים בה.
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  signupRequestsEnabled
                    ? "cursor-pointer border-amber-200 bg-amber-50"
                    : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={signupRequestsLocked}
                  disabled={!signupRequestsEnabled}
                  onChange={(event) =>
                    setSignupRequestsLocked(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                    {signupRequestsLocked ? (
                      <LockKeyhole className="h-4 w-4" />
                    ) : (
                      <UnlockKeyhole className="h-4 w-4" />
                    )}
                    נעל בקשות שיבוץ
                  </span>
                  <span className="mt-1 block text-[10px] font-bold text-amber-700">
                    הבקשות הקיימות יישמרו, אך לא ניתן יהיה להוסיף או לבטל.
                  </span>
                </span>
              </label>

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
                  המשמרת. חיילים בבסיס מוצגים ראשונים. חיילים בתקופת עבודות
                  רס״ר מוסתרים, אלא אם מנהל התיר עבורם שיבוץ. סימון חפיפה הוא
                  מידע בלבד.
                </div>
              </div>
              {expandedSlots.map((slot) => {
                const availableUsers = slot.allowSystemUsers
                  ? selectableUsers
                      .filter(
                        (user) =>
                          (slot.allowDischargedUsers ||
                            !user.isDischarged) &&
                          isAllowedForSlot(user, slot) &&
                          (!getShiftRestriction(user, startDate).active ||
                            user.disciplinaryRestriction
                              ?.allowManagerShiftAssignment === true)
                      )
                      .map((user) => ({
                        user,
                        attendance: getAttendanceInfo(user),
                        overlappingShift: getOverlappingShift(user.userId),
                        roleMatchPriority: getSlotRoleMatchPriority(user, slot),
                      }))
                      .sort((a, b) => {
                        const dischargedDifference =
                          Number(a.user.isDischarged === true) -
                          Number(b.user.isDischarged === true);
                        if (dischargedDifference !== 0) {
                          return dischargedDifference;
                        }

                        const roleDifference =
                          a.roleMatchPriority - b.roleMatchPriority;
                        if (roleDifference !== 0) {
                          return roleDifference;
                        }

                        const attendanceDifference =
                          getAttendanceSortPriority(a.attendance) -
                          getAttendanceSortPriority(b.attendance);
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
                              `נוכחות: ${attendance.label}`,
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

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600"
              >
                ביטול
              </button>

              <button
                type="button"
                onClick={() => saveShift(formStatus)}
                disabled={saving}
                className={`rounded-xl px-4 py-3 text-xs font-black disabled:opacity-50 ${
                  formStatus === "published"
                    ? "bg-indigo-600 text-white"
                    : formStatus === "cancelled"
                    ? "border border-slate-300 bg-slate-100 text-slate-700"
                    : "border border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {saving
                  ? "שומר..."
                  : formStatus === "published"
                  ? "שמור ופרסם"
                  : formStatus === "cancelled"
                  ? "שמור כמבוטלת"
                  : "שמור כטיוטה לקראת פרסום"}
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-bold leading-5 text-amber-800">
              טיוטה לקראת פרסום מוצגת למנהלים בלבד וניתן לצרף אותה לשיתוף WhatsApp לפי בחירה. משמרת מבוטלת אינה מוצגת לחיילים ולעולם אינה נכללת בשיתוף. ניתן לשמור בשני המצבים גם כאשר לא כל תפקידי החובה שובצו.
              {signupRequestsEnabled
                ? " כאשר בקשות השיבוץ פתוחות, ניתן לפרסם גם לפני השלמת תפקידי החובה כדי שהחיילים יוכלו לראות את המשמרת ולבקש להשתבץ."
                : " פרסום המשמרת יתאפשר רק לאחר השלמת כל השיבוצים הנדרשים."}
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
