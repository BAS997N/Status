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
  Printer,
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
  OperationalResourceConfig,
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
import { appDialog } from "./AppDialogProvider";
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
  systemSettings: SystemSettingsConfig | null;
}

interface ExpandedSlot {
  key: string;
  configId: string;
  roleName: string;
  label: string;
  required: boolean;
  allowedMedicalRoleIds: string[];
  allowedSystemRoles: SystemRole[];
  allowedAttendanceStatusIds: string[];
  allowedUserIds: string[];
  allowSystemUsers: boolean;
  allowDischargedUsers: boolean;
  allowExternalStaff: boolean;
  allowedExternalStaffTypes: string[];
  index: number;
}

interface BulkShiftTypeSchedule {
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
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

const normalizeRoleForComparison = (value?: string) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("he")
    .replace(/["״׳'’`]/g, "")
    .replace(/\/(?:ית|ת|ה)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesPrimaryShiftRole = (
  userMedicalRole?: string,
  shiftRoleName?: string
) => {
  const userRole = normalizeRoleForComparison(userMedicalRole);
  const shiftRole = normalizeRoleForComparison(shiftRoleName);
  if (!userRole || !shiftRole) return false;
  if (userRole === shiftRole) return true;

  const ignoredShiftWords = new Set([
    "מוצב",
    "תורן",
    "תורנית",
    "ראשי",
    "ראשית",
  ]);
  const identifyingWords = shiftRole
    .split(" ")
    .filter(
      (word) =>
        word.length > 1 &&
        !ignoredShiftWords.has(word) &&
        !/^\d+$/.test(word)
    );

  return (
    identifyingWords.length > 0 &&
    identifyingWords.every((word) => userRole.includes(word))
  );
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
  systemSettings,
}: ShiftsViewProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>(initialShifts);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState<ShiftViewMode>(
    canManage ? "week" : "list"
  );
  const [shiftPageTab, setShiftPageTab] = useState<"shifts" | "summary">(
    "shifts"
  );
  const [shiftSummaryStartDate, setShiftSummaryStartDate] = useState("");
  const [shiftSummaryEndDate, setShiftSummaryEndDate] = useState("");
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
  const [isBulkFormOpen, setIsBulkFormOpen] = useState(false);
  const [bulkDateMode, setBulkDateMode] = useState<"range" | "specific">(
    "range"
  );
  const [bulkStartDate, setBulkStartDate] = useState(getTodayInputDate());
  const [bulkEndDate, setBulkEndDate] = useState(
    addDaysToInputDate(getTodayInputDate(), 6)
  );
  const [bulkSpecificDateInput, setBulkSpecificDateInput] = useState("");
  const [bulkSpecificDates, setBulkSpecificDates] = useState<string[]>([]);
  const [bulkSelectedShiftTypeIds, setBulkSelectedShiftTypeIds] = useState<
    string[]
  >([]);
  const [bulkTypeSchedules, setBulkTypeSchedules] = useState<
    Record<string, BulkShiftTypeSchedule>
  >({});
  const [bulkStatus, setBulkStatus] = useState<
    "draft" | "published" | "cancelled"
  >("draft");
  const [bulkLocation, setBulkLocation] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSendPushOnPublish, setBulkSendPushOnPublish] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
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
  const [specialActivity, setSpecialActivity] = useState(false);
  const [specialActivityImportText, setSpecialActivityImportText] =
    useState("");
  const [dispatchTime, setDispatchTime] = useState("");
  const [specialActivityEndTime, setSpecialActivityEndTime] = useState("");
  const [specialForceCommanderName, setSpecialForceCommanderName] =
    useState("");
  const [specialForceCommanderPhone, setSpecialForceCommanderPhone] =
    useState("");
  const [specialEventManagerName, setSpecialEventManagerName] = useState("");
  const [specialEventManagerPhone, setSpecialEventManagerPhone] = useState("");
  const [specialSeniorCaregiverName, setSpecialSeniorCaregiverName] = useState("");
  const [specialSeniorCaregiverPhone, setSpecialSeniorCaregiverPhone] = useState("");
  const [medicalDutyPersonalPhone, setMedicalDutyPersonalPhone] = useState("");
  const [medicalDutyOnCallPhone, setMedicalDutyOnCallPhone] = useState("");
  const [evacuationPointName, setEvacuationPointName] = useState("");
  const [evacuationPointLink, setEvacuationPointLink] = useState("");
  const [selectedHospitalIds, setSelectedHospitalIds] = useState<string[]>([]);
  const [selectedHelipadIds, setSelectedHelipadIds] = useState<string[]>([]);
  const [selectedEvacuationPointIds, setSelectedEvacuationPointIds] =
    useState<string[]>([]);
  const [selectedFrequencyIds, setSelectedFrequencyIds] = useState<string[]>([]);
  const [doubleSlotIds, setDoubleSlotIds] = useState<string[]>([]);
  const [replacementTimes, setReplacementTimes] = useState<
    Record<string, string>
  >({});
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});
  const [allowDuplicateAssignment, setAllowDuplicateAssignment] =
    useState(false);
  const [visibleCandidateStatusIds, setVisibleCandidateStatusIds] = useState<
    string[]
  >(["base"]);

  const expandedSlots = useMemo<ExpandedSlot[]>(
    () =>
      shiftSlotConfigs
        .filter((config) => config.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((config) =>
          Array.from({ length: Math.max(1, config.quantity) }, (_, index) => ({
            key: `${config.id}_${index + 1}`,
            configId: config.id,
            roleName: config.name,
            label:
              config.quantity > 1 ? `${config.name} ${index + 1}` : config.name,
            required: config.required,
            allowedMedicalRoleIds: config.allowedMedicalRoleIds || [],
            allowedSystemRoles: config.allowedSystemRoles || [],
            allowedAttendanceStatusIds:
              config.allowedAttendanceStatusIds || ["base"],
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

  const formSlots = useMemo<ExpandedSlot[]>(
    () =>
      expandedSlots.flatMap((slot) => [
        slot,
        ...(doubleSlotIds.includes(slot.key)
          ? [
              {
                ...slot,
                key: `${slot.key}__double`,
                label: `${slot.label} — מחליף/ה`,
                required: false,
                index: slot.index + 1000,
              },
            ]
          : []),
      ]),
    [expandedSlots, doubleSlotIds]
  );

  const activeOperationalResources = useMemo(
    () =>
      [...(systemSettings?.operationalResources || [])]
        .filter((item) => item.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [systemSettings?.operationalResources]
  );
  const activeHospitals = activeOperationalResources.filter(
    (item) => item.type === "hospital"
  );
  const activeHelipads = activeOperationalResources.filter(
    (item) => item.type === "helipad"
  );
  const activeFrequencies = activeOperationalResources.filter(
    (item) => item.type === "frequency"
  );
  const activeEvacuationPoints = activeOperationalResources.filter(
    (item) => item.type === "evacuation_point"
  );
  const operationalResourceById = useMemo(
    () =>
      new Map(
        (systemSettings?.operationalResources || []).map((item) => [
          item.id,
          item,
        ])
      ),
    [systemSettings?.operationalResources]
  );
  const operationalResourceNameById = useMemo(
    () =>
      new Map(
        (systemSettings?.operationalResources || []).map((item) => [
          item.id,
          item.name,
        ])
      ),
    [systemSettings?.operationalResources]
  );
  const getResourceNames = (ids?: string[]) =>
    (ids || [])
      .map((id) => operationalResourceNameById.get(id))
      .filter((name): name is string => Boolean(name));
  const getResources = (ids?: string[]) =>
    (ids || [])
      .map((id) => operationalResourceById.get(id))
      .filter((item): item is OperationalResourceConfig => Boolean(item));

  const importSpecialActivityMessage = () => {
    const source = specialActivityImportText.replace(/\r/g, "").trim();
    if (!source) {
      setMessage({ type: "error", text: "יש להדביק קודם את הודעת הפעילות." });
      return;
    }

    const cleanText = (value: string) =>
      value
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
        .replace(/[\*_`]/g, "")
        .trim();
    const normalizeName = (value: string) =>
      cleanText(value)
        .replace(/[^\p{L}\p{N}]+/gu, "")
        .toLocaleLowerCase("he");
    const firstPhone = (pattern: RegExp) => {
      const match = source.match(pattern);
      return match?.[1]?.replace(/[^\d+]/g, "") || "";
    };
    const extractSection = (start: RegExp, end: RegExp) => {
      const startMatch = start.exec(source);
      if (!startMatch || startMatch.index === undefined) return "";
      const from = startMatch.index + startMatch[0].length;
      const remainder = source.slice(from);
      const endMatch = end.exec(remainder);
      return remainder.slice(0, endMatch?.index ?? remainder.length).trim();
    };
    const firstUrl = (value: string) =>
      value.match(/https?:\/\/[^\s)\]]+/)?.[0]?.replace(/\\_/g, "_") || "";

    const personalPhone = firstPhone(/(?:📱\s*)?אישי[^\d+]*(\+?\d[\d\s-]{7,})/i);
    const onCallPhone = firstPhone(/(?:☎️?\s*)?כוננות[^\d+]*(\+?\d[\d\s-]{7,})/i);
    const eventManager = source.match(
      /מנ[״"']?א\s*[-–:]\s*([^\d\n]+?)\s+(\+?\d[\d\s-]{7,})/i
    );
    const seniorCaregiver = source.match(
      /מט[״"']?ב\s*[-–:]\s*([^\d\n]+?)\s+(\+?\d[\d\s-]{7,})/i
    );

    if (personalPhone) setMedicalDutyPersonalPhone(personalPhone);
    if (onCallPhone) setMedicalDutyOnCallPhone(onCallPhone);
    if (eventManager) {
      setSpecialEventManagerName(cleanText(eventManager[1]));
      setSpecialEventManagerPhone(eventManager[2].replace(/[^\d+]/g, ""));
    }
    if (seniorCaregiver) {
      setSpecialSeniorCaregiverName(cleanText(seniorCaregiver[1]));
      setSpecialSeniorCaregiverPhone(
        seniorCaregiver[2].replace(/[^\d+]/g, "")
      );
    }

    const pointsSection = extractSection(
      /נקודות?\s+שחלוף[^\n]*\n?/i,
      /(?:🚁|מנחתים|📡|תקשוב)/i
    );
    const pointLines = pointsSection
      .split("\n")
      .map(cleanText)
      .filter((line) => line && !line.startsWith("http"));
    const pointName = pointLines[0] || "";
    const pointLink = firstUrl(pointsSection);
    const matchedPoint = activeEvacuationPoints.find(
      (item) =>
        normalizeName(item.name) === normalizeName(pointName) ||
        (pointName && normalizeName(item.name).includes(normalizeName(pointName)))
    );
    if (matchedPoint) {
      setSelectedEvacuationPointIds([matchedPoint.id]);
      setEvacuationPointName("");
      setEvacuationPointLink("");
    } else {
      setEvacuationPointName(pointName);
      setEvacuationPointLink(pointLink);
    }

    const helipadSection = extractSection(
      /מנחתים[^\n]*\n?/i,
      /(?:📡|תקשוב|\*\*?לשים\s+לב)/i
    );
    const helipadLines = helipadSection
      .split("\n")
      .map(cleanText)
      .filter(
        (line) =>
          line &&
          !line.startsWith("http") &&
          !/^נ[.״"']?צ\s*[-:]/i.test(line)
      );
    const matchedHelipadIds = activeHelipads
      .filter((item) =>
        helipadLines.some((line) =>
          normalizeName(line).includes(normalizeName(item.name))
        )
      )
      .map((item) => item.id);
    if (matchedHelipadIds.length) setSelectedHelipadIds(matchedHelipadIds);

    const matchedFrequencyIds = activeFrequencies
      .filter(
        (item) =>
          (item.frequency && source.includes(item.frequency)) ||
          (item.callSign && normalizeName(source).includes(normalizeName(item.callSign))) ||
          normalizeName(source).includes(normalizeName(item.name))
      )
      .map((item) => item.id);
    if (matchedFrequencyIds.length) setSelectedFrequencyIds(matchedFrequencyIds);

    const emphasisLine = source
      .split("\n")
      .map(cleanText)
      .find((line) => /לשים\s+לב|דגש|חשוב/i.test(line));
    if (emphasisLine) {
      setNote((current) =>
        current.includes(emphasisLine)
          ? current
          : [current.trim(), emphasisLine].filter(Boolean).join("\n")
      );
    }

    const missingLists = [
      pointName && !matchedPoint ? "נקודת השחלוף" : "",
      helipadLines.length && !matchedHelipadIds.length ? "המנחת" : "",
      /(?:📡|תקשוב)/i.test(source) && !matchedFrequencyIds.length
        ? "התדרים"
        : "",
    ].filter(Boolean);

    setMessage({
      type: missingLists.length ? "error" : "success",
      text: missingLists.length
        ? `הפרטים חולצו. לא נמצאה התאמה בהגדרות עבור ${missingLists.join(", ")}; יש להוסיף או לבחור אותם ידנית.`
        : "פרטי הפעילות חולצו. יש לבדוק את השדות לפני השמירה.",
    });
  };

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

  const duplicateAssignmentInfo = useMemo(() => {
    const selectedSlotsByAssignee = formSlots.reduce<
      Record<string, ExpandedSlot[]>
    >((result, slot) => {
      const assigneeId = slotAssignments[slot.key];
      if (!assigneeId) return result;
      result[assigneeId] = [...(result[assigneeId] || []), slot];
      return result;
    }, {});

    const duplicateEntry = (
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

    if (!duplicateEntry) return null;

    const [assigneeId, slots] = duplicateEntry;
    const userId = assigneeId.replace("user:", "");
    const externalId = assigneeId.replace("external:", "");
    const user = selectableUsers.find((item) => item.userId === userId);
    const externalPerson = activeExternalStaff.find(
      (item) => item.id === externalId
    );

    return {
      assigneeId,
      assigneeName:
        user?.fullName || externalPerson?.fullName || "אותו אדם",
      roleLabels: slots.map((slot) => slot.label),
    };
  }, [activeExternalStaff, formSlots, selectableUsers, slotAssignments]);

  const attendanceStatusLabelById = useMemo(
    () =>
      new Map(
        attendanceStatuses.map((status) => [status.id, status.label])
      ),
    [attendanceStatuses]
  );
  const attendanceStatusOrderById = useMemo(
    () =>
      new Map(
        attendanceStatuses.map((status) => [status.id, status.sortOrder])
      ),
    [attendanceStatuses]
  );
  const candidateAttendanceStatuses = useMemo(
    () =>
      attendanceStatuses
        .filter((status) => status.enabled && status.visibleToCommanders)
        .sort((a, b) => a.sortOrder - b.sortOrder),
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
    const attendanceStatusId = getAttendanceInfo(user).report?.status || "";
    const attendanceAllowed =
      (user.isDischarged === true && slot.allowDischargedUsers) ||
      (attendanceStatusId.length > 0 &&
        slot.allowedAttendanceStatusIds.includes(attendanceStatusId));
    return (
      attendanceAllowed &&
      (medicalAllowed || systemAllowed || individuallyAllowed)
    );
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
    const matchesPrimarySlotRole =
      matchesMedicalRole &&
      matchesPrimaryShiftRole(user.medicalRole, slot.roleName);

    const normalizedUserRole = normalizeRoleForComparison(user.medicalRole);
    const normalizedSlotRole = normalizeRoleForComparison(slot.roleName);
    const isMedic = normalizedUserRole.includes("חובש");
    const isEventManager =
      normalizedUserRole.includes("מנהל") &&
      normalizedUserRole.includes("אירוע");
    const isCommander =
      normalizedUserRole.includes("מפקד") ||
      normalizedUserRole.includes("מפ רפואה") ||
      ["admin", "super_admin"].includes(getSystemRole(user));
    const isMedicSlot = normalizedSlotRole.includes("חובש");
    const isEventManagerSlot =
      normalizedSlotRole.includes("מנהל") &&
      normalizedSlotRole.includes("אירוע");

    if (matchesPrimarySlotRole) return 0;

    if (isMedicSlot) {
      if (isEventManager) return 1;
      if (isCommander) return 2;
    }

    if (isEventManagerSlot) {
      if (isMedic) return 1;
      if (isCommander) return 2;
    }

    if (matchesMedicalRole) return 3;
    if (slot.allowedUserIds.includes(user.userId)) return 4;
    if (slot.allowedSystemRoles.includes(getSystemRole(user))) return 5;
    return 6;
  };

  const getAttendanceSortPriority = (
    attendance: ReturnType<typeof getAttendanceInfo>
  ) => {
    const report = attendance.report;
    if (!report) return 999;
    if (report.status === "base" && report.dayMarker === "exit_home") return 0;
    if (report.status === "base" && !report.dayMarker) return 1;
    if (report.status === "base" && report.dayMarker === "return_to_base") return 2;
    if (report.status === "base" && report.dayMarker === "after_hours") return 3;
    if (report.status === "base") return 4;
    return 10 + (attendanceStatusOrderById.get(report.status) || 500);
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

  const completedShiftSummary = useMemo(() => {
    const normalizeLabel = (value?: string) =>
      String(value || "")
        .toLocaleLowerCase("he")
        .replace(/[\s\-_'"״׳]/g, "");
    const completed = shifts.filter((shift) => {
      if (!isPublishedShift(shift)) return false;
      if (new Date(shift.endAt).getTime() > Date.now()) return false;
      const date = toLocalParts(shift.startAt).date;
      if (shiftSummaryStartDate && date < shiftSummaryStartDate) return false;
      if (shiftSummaryEndDate && date > shiftSummaryEndDate) return false;
      return true;
    });
    const byType = Array.from(
      completed.reduce((result, shift) => {
        const label = shift.title || shift.shiftType || "משמרת ללא שם";
        result.set(label, (result.get(label) || 0) + 1);
        return result;
      }, new Map<string, number>())
    ).sort((first, second) =>
      first[0].localeCompare(second[0], "he")
    );

    return {
      total: completed.length,
      tgbatz: completed.filter((shift) =>
        normalizeLabel(`${shift.title} ${shift.shiftType}`).includes("תגבץ")
      ).length,
      hipuk: completed.filter((shift) =>
        normalizeLabel(shift.note).includes("חיפוק")
      ).length,
      byType,
    };
  }, [shifts, shiftSummaryStartDate, shiftSummaryEndDate]);

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
    setSpecialActivity(false);
    setSpecialActivityImportText("");
    setDispatchTime("");
    setSpecialActivityEndTime("");
    setSpecialForceCommanderName("");
    setSpecialForceCommanderPhone("");
    setSpecialEventManagerName("");
    setSpecialEventManagerPhone("");
    setSpecialSeniorCaregiverName("");
    setSpecialSeniorCaregiverPhone("");
    setMedicalDutyPersonalPhone("");
    setMedicalDutyOnCallPhone("");
    setEvacuationPointName("");
    setEvacuationPointLink("");
    setSelectedHospitalIds([]);
    setSelectedHelipadIds([]);
    setSelectedEvacuationPointIds([]);
    setSelectedFrequencyIds([]);
    setDoubleSlotIds([]);
    setReplacementTimes({});
    setFormStatus("draft");
    setSendPushOnPublish(false);
    setSignupRequestsEnabled(false);
    setSignupRequestsLocked(false);
    setSlotAssignments({});
    setAllowDuplicateAssignment(false);
    setMessage(null);
  };

  const openNew = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const resetBulkForm = () => {
    const today = getTodayInputDate();
    setBulkDateMode("range");
    setBulkStartDate(today);
    setBulkEndDate(addDaysToInputDate(today, 6));
    setBulkSpecificDateInput("");
    setBulkSpecificDates([]);
    setBulkSelectedShiftTypeIds([]);
    setBulkTypeSchedules({});
    setBulkStatus("draft");
    setBulkLocation("");
    setBulkNote("");
    setBulkSendPushOnPublish(false);
    setBulkMessage(null);
  };

  const openBulkForm = () => {
    resetBulkForm();
    setIsBulkFormOpen(true);
  };

  const toggleBulkShiftType = (shiftTypeConfig: ShiftTypeConfig) => {
    const selected = bulkSelectedShiftTypeIds.includes(shiftTypeConfig.id);
    setBulkSelectedShiftTypeIds((current) =>
      selected
        ? current.filter((id) => id !== shiftTypeConfig.id)
        : [...current, shiftTypeConfig.id]
    );
    setBulkTypeSchedules((current) => {
      if (selected) {
        const next = { ...current };
        delete next[shiftTypeConfig.id];
        return next;
      }
      return {
        ...current,
        [shiftTypeConfig.id]: {
          startTime: shiftTypeConfig.defaultStartTime || "05:30",
          endTime: shiftTypeConfig.defaultEndTime || "17:30",
          crossesMidnight: shiftTypeConfig.crossesMidnight === true,
        },
      };
    });
  };

  const addBulkSpecificDate = () => {
    if (!bulkSpecificDateInput) return;
    setBulkSpecificDates((current) =>
      Array.from(new Set([...current, bulkSpecificDateInput])).sort()
    );
    setBulkSpecificDateInput("");
  };

  const bulkDates = useMemo(() => {
    if (bulkDateMode === "specific") return bulkSpecificDates;
    if (!bulkStartDate || !bulkEndDate || bulkEndDate < bulkStartDate) {
      return [];
    }

    const dates: string[] = [];
    let current = bulkStartDate;
    while (current <= bulkEndDate && dates.length < 93) {
      dates.push(current);
      current = addDaysToInputDate(current, 1);
    }
    return dates;
  }, [
    bulkDateMode,
    bulkSpecificDates,
    bulkStartDate,
    bulkEndDate,
  ]);

  const bulkPreview = useMemo(
    () =>
      bulkDates.flatMap((date) =>
        bulkSelectedShiftTypeIds.flatMap((shiftTypeId) => {
          const selectedType = shiftTypes.find(
            (item) => item.id === shiftTypeId
          );
          const schedule = bulkTypeSchedules[shiftTypeId];
          if (!selectedType || !schedule) return [];

          const endDateForShift = addDaysToInputDate(
            date,
            schedule.crossesMidnight ? 1 : 0
          );
          const hasValidTimes = Boolean(
            schedule.startTime &&
              schedule.endTime &&
              (schedule.crossesMidnight ||
                schedule.endTime > schedule.startTime)
          );
          const startAt = hasValidTimes
            ? combineDateAndTime(date, schedule.startTime)
            : "";
          const endAt = hasValidTimes
            ? combineDateAndTime(endDateForShift, schedule.endTime)
            : "";
          const duplicate = Boolean(
            startAt &&
              endAt &&
              shifts.some(
                (shift) =>
                  shift.title.trim().toLocaleLowerCase("he") ===
                    selectedType.name.trim().toLocaleLowerCase("he") &&
                  new Date(shift.startAt).getTime() === new Date(startAt).getTime() &&
                  new Date(shift.endAt).getTime() === new Date(endAt).getTime()
              )
          );

          return [
            {
              key: `${date}_${shiftTypeId}`,
              date,
              shiftType: selectedType,
              schedule,
              startAt,
              endAt,
              duplicate,
              hasValidTimes,
            },
          ];
        })
      ),
    [
      bulkDates,
      bulkSelectedShiftTypeIds,
      bulkTypeSchedules,
      shiftTypes,
      shifts,
    ]
  );

  const saveBulkShifts = async () => {
    setBulkMessage(null);
    if (bulkDates.length === 0) {
      setBulkMessage({
        type: "error",
        text: "יש לבחור טווח תאריכים תקין או להוסיף תאריכים מסוימים.",
      });
      return;
    }
    if (bulkDates.length > 62) {
      setBulkMessage({
        type: "error",
        text: "ניתן ליצור עד 62 ימים בפעולה אחת.",
      });
      return;
    }
    if (bulkSelectedShiftTypeIds.length === 0) {
      setBulkMessage({ type: "error", text: "יש לבחור לפחות סוג משמרת אחד." });
      return;
    }
    if (bulkPreview.some((item) => !item.hasValidTimes)) {
      setBulkMessage({
        type: "error",
        text: "יש לתקן את שעות המשמרות. משמרת שמסתיימת למחרת חייבת להיות מסומנת בהתאם.",
      });
      return;
    }

    const itemsToCreate = bulkPreview.filter((item) => !item.duplicate);
    if (itemsToCreate.length === 0) {
      setBulkMessage({
        type: "error",
        text: "כל המשמרות בתצוגה המקדימה כבר קיימות במערכת.",
      });
      return;
    }

    setBulkSaving(true);
    try {
      for (const item of itemsToCreate) {
        await dataService.createShift(
          {
            title: item.shiftType.name,
            shiftType: item.shiftType.name,
            startAt: item.startAt,
            endAt: item.endAt,
            location: bulkLocation.trim(),
            note: bulkNote.trim(),
            assignments: [],
            status: bulkStatus,
            sendPushOnPublish: bulkSendPushOnPublish,
            signupRequestsEnabled: false,
            signupRequestsLocked: false,
            createdBy: currentUser.userId,
            createdByName: currentUser.fullName,
          },
          currentUser
        );
      }

      await loadShifts();
      const skipped = bulkPreview.length - itemsToCreate.length;
      setIsBulkFormOpen(false);
      resetBulkForm();
      setMessage({
        type: "success",
        text: `נוצרו ${itemsToCreate.length} משמרות בהצלחה${
          skipped ? ` · ${skipped} משמרות כפולות דולגו` : ""
        }.`,
      });
    } catch (error) {
      console.error("Bulk shift creation failed:", error);
      setBulkMessage({
        type: "error",
        text: "יצירת המשמרות המרוכזת נכשלה. המשמרות שכבר נוצרו נשמרו במערכת.",
      });
    } finally {
      setBulkSaving(false);
    }
  };

  const openEdit = (shift: ShiftRecord) => {
    const next: Record<string, string> = {};
    const nextReplacementTimes: Record<string, string> = {};
    const nextDoubleSlotIds = expandedSlots
      .filter((slot) =>
        shift.assignments.some(
          (assignment) => assignment.slotId === `${slot.key}__double`
        )
      )
      .map((slot) => slot.key);
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
      const doubleAssignment = shift.assignments.find(
        (item) => item.slotId === `${slot.key}__double`
      );
      if (doubleAssignment) {
        next[`${slot.key}__double`] =
          doubleAssignment.assigneeType === "external"
            ? `external:${
                doubleAssignment.externalStaffId ||
                doubleAssignment.userId.replace("external:", "")
              }`
            : `user:${doubleAssignment.userId}`;
        nextReplacementTimes[`${slot.key}__double`] =
          doubleAssignment.replacementTime || "";
      }
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
    setSpecialActivity(shift.specialActivity === true);
    setDispatchTime(shift.dispatchTime || "");
    setSpecialActivityEndTime(shift.specialActivityEndTime || "");
    setSpecialForceCommanderName(shift.specialForceCommanderName || "");
    setSpecialForceCommanderPhone(shift.specialForceCommanderPhone || "");
    setSpecialEventManagerName(shift.specialEventManagerName || "");
    setSpecialEventManagerPhone(shift.specialEventManagerPhone || "");
    setSpecialSeniorCaregiverName(shift.specialSeniorCaregiverName || "");
    setSpecialSeniorCaregiverPhone(shift.specialSeniorCaregiverPhone || "");
    setMedicalDutyPersonalPhone(shift.medicalDutyPersonalPhone || "");
    setMedicalDutyOnCallPhone(shift.medicalDutyOnCallPhone || "");
    setEvacuationPointName(shift.evacuationPointName || "");
    setEvacuationPointLink(shift.evacuationPointLink || "");
    setSelectedHospitalIds(shift.hospitalIds || []);
    setSelectedHelipadIds(shift.helipadIds || []);
    setSelectedEvacuationPointIds(shift.evacuationPointIds || []);
    setSelectedFrequencyIds(shift.frequencyIds || []);
    setDoubleSlotIds(nextDoubleSlotIds);
    setReplacementTimes(nextReplacementTimes);
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

    const invalidAttendanceSelection = formSlots
      .map((slot) => {
        const selectedValue = slotAssignments[slot.key];
        if (!selectedValue?.startsWith("user:")) return null;
        const userId = selectedValue.replace("user:", "");
        const user = selectableUsers.find((item) => item.userId === userId);
        if (!user) return null;
        const attendance = getAttendanceInfo(user);
        const statusId = attendance.report?.status || "";
        if (
          user.isDischarged === true &&
          slot.allowDischargedUsers
        ) {
          return null;
        }
        if (
          statusId &&
          slot.allowedAttendanceStatusIds.includes(statusId)
        ) {
          return null;
        }
        return { user, slot, attendance };
      })
      .find(Boolean);
    if (invalidAttendanceSelection) {
      setMessage({
        type: "error",
        text: `${invalidAttendanceSelection.user.fullName} לא ניתן/ת לשיבוץ כ${invalidAttendanceSelection.slot.label}: סטטוס הנוכחות לתאריך המשמרת הוא „${invalidAttendanceSelection.attendance.label}”.`,
      });
      return;
    }

    const missing = formSlots.filter(
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

    if (duplicateAssignmentInfo && !allowDuplicateAssignment) {
      setMessage({
        type: "error",
        text: `${duplicateAssignmentInfo.assigneeName} נבחר ליותר מתפקיד אחד. יש לאשר שיבוץ כפול כדי להמשיך.`,
      });
      return;
    }

    const assignments: ShiftAssignment[] = formSlots
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
            replacementTime: replacementTimes[slot.key] || undefined,
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
          replacementTime: replacementTimes[slot.key] || undefined,
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
        specialActivity,
        dispatchTime: specialActivity ? dispatchTime : "",
        specialActivityEndTime: specialActivity
          ? specialActivityEndTime
          : "",
        specialForceCommanderUserId: "",
        specialForceCommanderName: specialActivity
          ? specialForceCommanderName.trim()
          : "",
        specialForceCommanderPhone: specialActivity
          ? specialForceCommanderPhone.trim()
          : "",
        specialEventManagerUserId: "",
        specialEventManagerName: specialActivity
          ? specialEventManagerName.trim()
          : "",
        specialEventManagerPhone: specialActivity
          ? specialEventManagerPhone.trim()
          : "",
        specialSeniorCaregiverName: specialActivity
          ? specialSeniorCaregiverName.trim()
          : "",
        specialSeniorCaregiverPhone: specialActivity
          ? specialSeniorCaregiverPhone.trim()
          : "",
        medicalDutyPersonalPhone: specialActivity
          ? medicalDutyPersonalPhone.trim()
          : "",
        medicalDutyOnCallPhone: specialActivity
          ? medicalDutyOnCallPhone.trim()
          : "",
        evacuationPointName: specialActivity
          ? evacuationPointName.trim()
          : "",
        evacuationPointLink: specialActivity
          ? evacuationPointLink.trim()
          : "",
        evacuationPointIds: specialActivity
          ? selectedEvacuationPointIds
          : [],
        hospitalIds: specialActivity ? selectedHospitalIds : [],
        helipadIds: specialActivity ? selectedHelipadIds : [],
        frequencyIds: specialActivity ? selectedFrequencyIds : [],
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
    if (!(await appDialog.confirm(`למחוק את המשמרת "${shift.title}"?`, {
      title: "מחיקת משמרת", confirmLabel: "מחק משמרת", tone: "danger",
    }))) return;
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
    setSpecialActivity(shift.specialActivity === true);
    setDispatchTime(shift.dispatchTime || "");
    setSpecialActivityEndTime(shift.specialActivityEndTime || "");
    setSpecialForceCommanderName(shift.specialForceCommanderName || "");
    setSpecialForceCommanderPhone(shift.specialForceCommanderPhone || "");
    setSpecialEventManagerName(shift.specialEventManagerName || "");
    setSpecialEventManagerPhone(shift.specialEventManagerPhone || "");
    setSpecialSeniorCaregiverName(shift.specialSeniorCaregiverName || "");
    setSpecialSeniorCaregiverPhone(shift.specialSeniorCaregiverPhone || "");
    setMedicalDutyPersonalPhone(shift.medicalDutyPersonalPhone || "");
    setMedicalDutyOnCallPhone(shift.medicalDutyOnCallPhone || "");
    setEvacuationPointName(shift.evacuationPointName || "");
    setEvacuationPointLink(shift.evacuationPointLink || "");
    setSelectedHospitalIds(shift.hospitalIds || []);
    setSelectedHelipadIds(shift.helipadIds || []);
    setSelectedEvacuationPointIds(shift.evacuationPointIds || []);
    setSelectedFrequencyIds(shift.frequencyIds || []);
    setDoubleSlotIds(
      expandedSlots
        .filter((slot) =>
          shift.assignments.some(
            (assignment) => assignment.slotId === `${slot.key}__double`
          )
        )
        .map((slot) => slot.key)
    );
    setFormStatus("draft");
    setSendPushOnPublish(false);
    setSignupRequestsEnabled(false);
    setSignupRequestsLocked(false);

    const nextAssignments: Record<string, string> = {};
    const nextReplacementTimes: Record<string, string> = {};
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
      const doubleAssignment = shift.assignments.find(
        (item) => item.slotId === `${slot.key}__double`
      );
      if (doubleAssignment) {
        nextAssignments[`${slot.key}__double`] =
          doubleAssignment.assigneeType === "external"
            ? `external:${
                doubleAssignment.externalStaffId ||
                doubleAssignment.userId.replace("external:", "")
              }`
            : `user:${doubleAssignment.userId}`;
        nextReplacementTimes[`${slot.key}__double`] =
          doubleAssignment.replacementTime || "";
      }
    });
    setSlotAssignments(nextAssignments);
    setReplacementTimes(nextReplacementTimes);
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
                  shift.specialActivity && shift.dispatchTime
                    ? `<div class="shift-location"><strong>שעת מוקי:</strong> ${escapeHtml(shift.dispatchTime)}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && shift.specialActivityEndTime
                    ? `<div class="shift-location"><strong>שעת סיום:</strong> ${escapeHtml(shift.specialActivityEndTime)}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && (shift.specialForceCommanderName || shift.specialForceCommanderPhone)
                    ? `<div class="shift-location"><strong>מפקד הכוח החביר:</strong> ${escapeHtml([shift.specialForceCommanderName, shift.specialForceCommanderPhone].filter(Boolean).join(" · "))}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && (shift.specialEventManagerName || shift.specialEventManagerPhone)
                    ? `<div class="shift-location"><strong>מנהל האירוע החביר:</strong> ${escapeHtml([shift.specialEventManagerName, shift.specialEventManagerPhone].filter(Boolean).join(" · "))}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && (shift.specialSeniorCaregiverName || shift.specialSeniorCaregiverPhone)
                    ? `<div class="shift-location"><strong>מטפל בכיר הכוח החביר:</strong> ${escapeHtml([shift.specialSeniorCaregiverName, shift.specialSeniorCaregiverPhone].filter(Boolean).join(" · "))}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && (shift.medicalDutyPersonalPhone || shift.medicalDutyOnCallPhone)
                    ? `<div class="shift-location"><strong>תורן רפואה:</strong> ${escapeHtml([shift.medicalDutyPersonalPhone ? `אישי ${shift.medicalDutyPersonalPhone}` : "", shift.medicalDutyOnCallPhone ? `כוננות ${shift.medicalDutyOnCallPhone}` : ""].filter(Boolean).join(" · "))}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && (shift.evacuationPointName || shift.evacuationPointLink)
                    ? `<div class="shift-location"><strong>נקודת שחלוף / יעד פינוי:</strong> ${shift.evacuationPointName ? escapeHtml(shift.evacuationPointName) : ""}${shift.evacuationPointLink ? `<br>${escapeHtml(shift.evacuationPointLink)}` : ""}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && getResources(shift.evacuationPointIds).length
                    ? `<div class="shift-location"><strong>נקודות שחלוף ויעדי פינוי:</strong> ${getResources(shift.evacuationPointIds).map((item) => `${escapeHtml(item.name)}${item.link ? `<br>${escapeHtml(item.link)}` : ""}`).join("<br>")}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && getResourceNames(shift.hospitalIds).length
                    ? `<div class="shift-location"><strong>בתי חולים:</strong> ${escapeHtml(getResourceNames(shift.hospitalIds).join(", "))}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && getResources(shift.helipadIds).length
                    ? `<div class="shift-location"><strong>מנחתים:</strong> ${getResources(shift.helipadIds).map((item) => `${escapeHtml([item.name, item.coordinates ? `נ.צ ${item.coordinates}` : ""].filter(Boolean).join(" · "))}${item.link ? `<br>${escapeHtml(item.link)}` : ""}`).join("<br>")}</div>`
                    : ""
                }
                ${
                  shift.specialActivity && getResources(shift.frequencyIds).length
                    ? `<div class="shift-location"><strong>תדרים:</strong> ${getResources(shift.frequencyIds).map((item) => escapeHtml([item.name, item.callSign, item.frequency].filter(Boolean).join(" · "))).join("<br>")}</div>`
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

  const getReplacementDetails = (
    shift: ShiftRecord,
    assignment: ShiftAssignment
  ) => {
    if (!assignment.replacementTime) return null;

    const baseSlotId = assignment.slotId.replace(/__double$/, "");
    const replacedAssignment = shift.assignments.find(
      (item) => item.slotId === baseSlotId
    );

    return {
      roleLabel: (assignment.slotLabel || "תפקיד").replace(
        /\s*—\s*(?:שיבוץ נוסף|מחליף\/ה)\s*$/,
        ""
      ),
      replacedName: replacedAssignment?.userName || "החייל/ת הראשי/ת",
      replacementTime: assignment.replacementTime,
    };
  };

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
                const replacement = getReplacementDetails(shift, assignment);
                const roleLabel = replacement?.roleLabel ||
                  assignment.slotLabel || "תפקיד";
                const phoneNumber = shouldIncludePhoneForRole(roleLabel)
                  ? getAssignmentPhoneNumber(assignment)
                  : "";

                const assignmentLine = `• ${roleLabel} — ${assignment.userName}${
                  phoneNumber ? ` — ${phoneNumber}` : ""
                }${
                  replacement
                    ? ` — מחליף/ה את ${replacement.replacedName} בשעה ${replacement.replacementTime}`
                    : ""
                }`;

                return replacement ? `*${assignmentLine}*` : assignmentLine;
              })
              .join("\n");

            return [
              `*${shift.title}*`,
              shift.specialActivity
                ? ""
                : `🕒 ${new Date(shift.startAt).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}–${new Date(shift.endAt).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`,
              includeLocationInWhatsApp && shift.location
                ? `📍 מיקום: ${shift.location}`
                : "",
              shift.specialActivity && shift.dispatchTime
                ? `⏱️ שעת מוקי: ${shift.dispatchTime}`
                : "",
              shift.specialActivity && shift.specialActivityEndTime
                ? `🏁 שעת סיום: ${shift.specialActivityEndTime}`
                : "",
              shift.specialActivity && (shift.specialForceCommanderName || shift.specialForceCommanderPhone)
                ? `👤 מפקד הכוח החביר: ${[shift.specialForceCommanderName, shift.specialForceCommanderPhone].filter(Boolean).join(" · ")}`
                : "",
              shift.specialActivity && (shift.specialEventManagerName || shift.specialEventManagerPhone)
                ? `👤 מנהל האירוע החביר: ${[shift.specialEventManagerName, shift.specialEventManagerPhone].filter(Boolean).join(" · ")}`
                : "",
              shift.specialActivity && (shift.specialSeniorCaregiverName || shift.specialSeniorCaregiverPhone)
                ? `🩺 מטפל בכיר הכוח החביר: ${[shift.specialSeniorCaregiverName, shift.specialSeniorCaregiverPhone].filter(Boolean).join(" · ")}`
                : "",
              shift.specialActivity && (shift.medicalDutyPersonalPhone || shift.medicalDutyOnCallPhone)
                ? `*תורן רפואה:*\n${[shift.medicalDutyPersonalPhone ? `📱 אישי: ${shift.medicalDutyPersonalPhone}` : "", shift.medicalDutyOnCallPhone ? `☎️ כוננות: ${shift.medicalDutyOnCallPhone}` : ""].filter(Boolean).join("\n")}`
                : "",
              shift.specialActivity && (shift.evacuationPointName || shift.evacuationPointLink)
                ? `📌 *נקודת שחלוף / יעד פינוי:*\n${[shift.evacuationPointName, shift.evacuationPointLink].filter(Boolean).join("\n")}`
                : "",
              shift.specialActivity && getResources(shift.evacuationPointIds).length
                ? `📌 *נקודות שחלוף ויעדי פינוי:*\n${getResources(shift.evacuationPointIds).map((item) => `• ${item.name}${item.link ? `\n📍 מיקום במפה:\n${item.link}` : ""}`).join("\n")}`
                : "",
              shift.specialActivity && getResourceNames(shift.hospitalIds).length
                ? `🏥 בתי חולים: ${getResourceNames(shift.hospitalIds).join(", ")}`
                : "",
              shift.specialActivity && getResources(shift.helipadIds).length
                ? `🚁 *מנחתים:*\n${getResources(shift.helipadIds).map((item) => `• ${[item.name, item.coordinates ? `נ.צ ${item.coordinates}` : ""].filter(Boolean).join(" · ")}${item.link ? `\n📍 מיקום במפה:\n${item.link}` : ""}`).join("\n")}`
                : "",
              shift.specialActivity && getResources(shift.frequencyIds).length
                ? `📡 *תקשוב:*\n${getResources(shift.frequencyIds).map((item) => `• ${item.name}${item.callSign || item.frequency ? ` יתנהל בתדר ${[item.callSign, item.frequency].filter(Boolean).join(" ")}` : ""}`).join("\n")}`
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
    const shiftDate = new Date(shift.startAt).toLocaleDateString("he-IL", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const assignmentsText = shift.assignments
      .map((assignment) => {
        const replacement = getReplacementDetails(shift, assignment);
        const roleLabel = replacement?.roleLabel || assignment.slotLabel || "תפקיד";

        const assignmentLine = `${roleLabel}: ${assignment.userName}${
          replacement
            ? ` — מחליף/ה את ${replacement.replacedName} בשעה ${replacement.replacementTime}`
            : ""
        }`;

        return replacement ? `*${assignmentLine}*` : assignmentLine;
      })
      .join("\n");

    const message = [
      `*${shift.title}*`,
      shift.shiftType ? `סוג: ${shift.shiftType}` : "",
      shift.specialActivity ? `📅 תאריך: ${shiftDate}` : `🕒 התחלה: ${start}`,
      shift.specialActivity ? "" : `🕒 סיום: ${end}`,
      shift.location ? `📍 מיקום: ${shift.location}` : "",
      shift.specialActivity && shift.dispatchTime
        ? `⏱️ שעת מוקי: ${shift.dispatchTime}`
        : "",
      shift.specialActivity && shift.specialActivityEndTime
        ? `🏁 שעת סיום: ${shift.specialActivityEndTime}`
        : "",
      shift.specialActivity && (shift.specialForceCommanderName || shift.specialForceCommanderPhone)
        ? `👤 מפקד הכוח החביר: ${[shift.specialForceCommanderName, shift.specialForceCommanderPhone].filter(Boolean).join(" · ")}`
        : "",
      shift.specialActivity && (shift.specialEventManagerName || shift.specialEventManagerPhone)
        ? `👤 מנהל האירוע החביר: ${[shift.specialEventManagerName, shift.specialEventManagerPhone].filter(Boolean).join(" · ")}`
        : "",
      shift.specialActivity && (shift.specialSeniorCaregiverName || shift.specialSeniorCaregiverPhone)
        ? `🩺 מטפל בכיר הכוח החביר: ${[shift.specialSeniorCaregiverName, shift.specialSeniorCaregiverPhone].filter(Boolean).join(" · ")}`
        : "",
      shift.specialActivity && (shift.medicalDutyPersonalPhone || shift.medicalDutyOnCallPhone)
        ? `*תורן רפואה:*\n${[shift.medicalDutyPersonalPhone ? `📱 אישי: ${shift.medicalDutyPersonalPhone}` : "", shift.medicalDutyOnCallPhone ? `☎️ כוננות: ${shift.medicalDutyOnCallPhone}` : ""].filter(Boolean).join("\n")}`
        : "",
      shift.specialActivity && (shift.evacuationPointName || shift.evacuationPointLink)
        ? `📌 *נקודת שחלוף / יעד פינוי:*\n${[shift.evacuationPointName, shift.evacuationPointLink].filter(Boolean).join("\n")}`
        : "",
      shift.specialActivity && getResources(shift.evacuationPointIds).length
        ? `📌 *נקודות שחלוף ויעדי פינוי:*\n${getResources(shift.evacuationPointIds).map((item) => `• ${item.name}${item.link ? `\n📍 מיקום במפה:\n${item.link}` : ""}`).join("\n")}`
        : "",
      shift.specialActivity && getResourceNames(shift.hospitalIds).length
        ? `🏥 בתי חולים: ${getResourceNames(shift.hospitalIds).join(", ")}`
        : "",
      shift.specialActivity && getResources(shift.helipadIds).length
        ? `🚁 *מנחתים:*\n${getResources(shift.helipadIds).map((item) => `• ${[item.name, item.coordinates ? `נ.צ ${item.coordinates}` : ""].filter(Boolean).join(" · ")}${item.link ? `\n📍 מיקום במפה:\n${item.link}` : ""}`).join("\n")}`
        : "",
      shift.specialActivity && getResources(shift.frequencyIds).length
        ? `📡 *תקשוב:*\n${getResources(shift.frequencyIds).map((item) => `• ${item.name}${item.callSign || item.frequency ? ` יתנהל בתדר ${[item.callSign, item.frequency].filter(Boolean).join(" ")}` : ""}`).join("\n")}`
        : "",
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
                onClick={openBulkForm}
                className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-xs font-black text-indigo-700 hover:bg-indigo-50"
              >
                <Copy className="h-4 w-4" />
                יצירה מרוכזת
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

      {canManage && (
        <div className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setShiftPageTab("shifts")}
            className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${
              shiftPageTab === "shifts"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            ניהול משמרות
          </button>
          <button
            type="button"
            onClick={() => setShiftPageTab("summary")}
            className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${
              shiftPageTab === "summary"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            סיכום משמרות
          </button>
        </div>
      )}

      {shiftPageTab === "summary" && canManage ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  סיכום משמרות שבוצעו
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  נספרות רק משמרות שפורסמו ושזמן הסיום שלהן עבר. טיוטות ומשמרות מבוטלות אינן נספרות.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_160px_auto]">
                <Field label="מתאריך">
                  <input
                    type="date"
                    value={shiftSummaryStartDate}
                    onChange={(event) =>
                      setShiftSummaryStartDate(event.target.value)
                    }
                    className="input"
                  />
                </Field>
                <Field label="עד תאריך">
                  <input
                    type="date"
                    value={shiftSummaryEndDate}
                    onChange={(event) =>
                      setShiftSummaryEndDate(event.target.value)
                    }
                    className="input"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => {
                    setShiftSummaryStartDate("");
                    setShiftSummaryEndDate("");
                  }}
                  className="h-[42px] self-end rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 hover:bg-slate-50"
                >
                  כל התקופה
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="text-xs font-black text-emerald-700">כל המשמרות שבוצעו</div>
              <div className="mt-2 text-3xl font-black text-emerald-900">
                {completedShiftSummary.total}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
              <div className="text-xs font-black text-indigo-700">משמרות תגב״ץ שבוצעו</div>
              <div className="mt-2 text-3xl font-black text-indigo-900">
                {completedShiftSummary.tgbatz}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="text-xs font-black text-amber-700">משמרות עם חיפוק בהערה</div>
              <div className="mt-2 text-3xl font-black text-amber-900">
                {completedShiftSummary.hipuk}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4 text-sm font-black text-slate-900">
              פירוט לפי סוג משמרת
            </div>
            {completedShiftSummary.byType.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400">
                אין משמרות שבוצעו בטווח שנבחר.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {completedShiftSummary.byType.map(([label, count]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-5 py-3 text-xs"
                  >
                    <span className="font-black text-slate-700">{label}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-black text-slate-800">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
      {canManage && (
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
          shiftTypes={Array.from(
            new Set<string>(shifts.map((shift) => String(shift.title || "")))
          ).sort((a, b) => a.localeCompare(b, "he"))}
          onPrint={openPrintOptions}
          onExport={exportShiftsCsv}
        />
      )}
      {!canManage && (
        <div className="flex justify-end rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <button
            type="button"
            onClick={openPrintOptions}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black text-indigo-700 hover:bg-indigo-100"
          >
            <Printer className="h-4 w-4" />
            הדפסה / PDF
          </button>
        </div>
      )}

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

            {detailsShift.specialActivity &&
              (detailsShift.dispatchTime ||
              detailsShift.specialActivityEndTime ||
              detailsShift.specialForceCommanderName ||
              detailsShift.specialForceCommanderPhone ||
              detailsShift.specialEventManagerName ||
              detailsShift.specialEventManagerPhone ||
              detailsShift.specialSeniorCaregiverName ||
              detailsShift.specialSeniorCaregiverPhone ||
              detailsShift.medicalDutyPersonalPhone ||
              detailsShift.medicalDutyOnCallPhone ||
              detailsShift.evacuationPointName ||
              detailsShift.evacuationPointLink ||
              getResourceNames(detailsShift.evacuationPointIds).length > 0 ||
              getResourceNames(detailsShift.hospitalIds).length > 0 ||
              getResourceNames(detailsShift.helipadIds).length > 0 ||
              getResourceNames(detailsShift.frequencyIds).length > 0) && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {detailsShift.dispatchTime && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">שעת מוקי</div>
                    <div className="mt-1 font-bold text-slate-900">
                      {detailsShift.dispatchTime}
                    </div>
                  </div>
                )}
                {detailsShift.specialActivityEndTime && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">שעת סיום</div>
                    <div className="mt-1 font-bold text-slate-900">
                      {detailsShift.specialActivityEndTime}
                    </div>
                  </div>
                )}
                {(detailsShift.specialForceCommanderName ||
                  detailsShift.specialForceCommanderPhone) && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">
                      מפקד הכוח החביר
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      {[
                        detailsShift.specialForceCommanderName,
                        detailsShift.specialForceCommanderPhone,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                )}
                {(detailsShift.specialEventManagerName ||
                  detailsShift.specialEventManagerPhone) && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">
                      מנהל האירוע החביר
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      {[
                        detailsShift.specialEventManagerName,
                        detailsShift.specialEventManagerPhone,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                )}
                {(detailsShift.specialSeniorCaregiverName || detailsShift.specialSeniorCaregiverPhone) && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">מטפל בכיר הכוח החביר</div>
                    <div className="mt-1 font-bold text-slate-900">{[detailsShift.specialSeniorCaregiverName, detailsShift.specialSeniorCaregiverPhone].filter(Boolean).join(" · ")}</div>
                  </div>
                )}
                {(detailsShift.medicalDutyPersonalPhone || detailsShift.medicalDutyOnCallPhone) && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">תורן רפואה</div>
                    {detailsShift.medicalDutyPersonalPhone && <div className="mt-1 font-bold text-slate-900">📱 אישי: {detailsShift.medicalDutyPersonalPhone}</div>}
                    {detailsShift.medicalDutyOnCallPhone && <div className="mt-1 font-bold text-slate-900">☎️ כוננות: {detailsShift.medicalDutyOnCallPhone}</div>}
                  </div>
                )}
                {(detailsShift.evacuationPointName || detailsShift.evacuationPointLink) && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">📌 נקודת שחלוף / יעד פינוי</div>
                    {detailsShift.evacuationPointName && <div className="mt-1 font-bold text-slate-900">{detailsShift.evacuationPointName}</div>}
                    {detailsShift.evacuationPointLink && <a href={detailsShift.evacuationPointLink} target="_blank" rel="noreferrer" className="mt-1 block break-all font-bold text-sky-600 underline">פתח קישור</a>}
                  </div>
                )}
                {getResources(detailsShift.evacuationPointIds).length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs sm:col-span-2">
                    <div className="font-black text-slate-500">📌 נקודות שחלוף ויעדי פינוי</div>
                    {getResources(detailsShift.evacuationPointIds).map((item) => (
                      <div key={item.id} className="mt-2 font-bold text-slate-900">
                        <div>{item.name}</div>
                        {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sky-600 underline">מיקום במפה</a>}
                      </div>
                    ))}
                  </div>
                )}
                {getResourceNames(detailsShift.hospitalIds).length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">בתי חולים</div>
                    <div className="mt-1 font-bold text-slate-900">
                      {getResourceNames(detailsShift.hospitalIds).join(", ")}
                    </div>
                  </div>
                )}
                {getResources(detailsShift.helipadIds).length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="font-black text-slate-500">מנחתים</div>
                    {getResources(detailsShift.helipadIds).map((item) => <div key={item.id} className="mt-1 font-bold text-slate-900">{item.name}{item.coordinates ? ` · נ.צ ${item.coordinates}` : ""}{item.link && <a href={item.link} target="_blank" rel="noreferrer" className="mr-1 text-sky-600 underline">קישור</a>}</div>)}
                  </div>
                )}
                {getResources(detailsShift.frequencyIds).length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs sm:col-span-2">
                    <div className="font-black text-slate-500">📡 תדרי קשר</div>
                    {getResources(detailsShift.frequencyIds).map((item) => <div key={item.id} className="mt-1 font-bold text-slate-900">• {item.name}{item.callSign || item.frequency ? ` — ${[item.callSign, item.frequency].filter(Boolean).join(" ")}` : ""}</div>)}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 space-y-2">
              {detailsShift.assignments.map((assignment) => {
                const replacement = getReplacementDetails(
                  detailsShift,
                  assignment
                );

                return (
                  <div
                    key={`${assignment.slotId}_${assignment.userId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <span className="text-xs font-bold text-slate-500">
                      {replacement?.roleLabel || assignment.slotLabel || "תפקיד"}
                    </span>
                    <div className="text-left">
                      <div className="text-xs font-black text-slate-900">
                        {assignment.userName}
                      </div>
                      {replacement && (
                        <div className="mt-0.5 text-[9px] font-black text-indigo-600">
                          מחליף/ה את {replacement.replacedName} בשעה {replacement.replacementTime}
                        </div>
                      )}
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
                );
              })}
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

      {isBulkFormOpen && canManage && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  יצירת משמרות מרוכזת
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  יצירת כמה סוגי משמרות לטווח שבועי או לתאריכים מסוימים.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setBulkDateMode("range")}
                className={`rounded-lg px-3 py-2 text-xs font-black ${
                  bulkDateMode === "range"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                טווח תאריכים
              </button>
              <button
                type="button"
                onClick={() => setBulkDateMode("specific")}
                className={`rounded-lg px-3 py-2 text-xs font-black ${
                  bulkDateMode === "specific"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                תאריכים מסוימים
              </button>
            </div>

            {bulkDateMode === "range" ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="מתאריך">
                  <input
                    type="date"
                    value={bulkStartDate}
                    onChange={(event) => setBulkStartDate(event.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="עד תאריך">
                  <input
                    type="date"
                    value={bulkEndDate}
                    onChange={(event) => setBulkEndDate(event.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="date"
                    value={bulkSpecificDateInput}
                    onChange={(event) =>
                      setBulkSpecificDateInput(event.target.value)
                    }
                    className="input"
                  />
                  <button
                    type="button"
                    onClick={addBulkSpecificDate}
                    className="rounded-xl bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700"
                  >
                    הוסף תאריך
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bulkSpecificDates.length === 0 ? (
                    <span className="text-xs font-bold text-slate-400">
                      עדיין לא נבחרו תאריכים.
                    </span>
                  ) : (
                    bulkSpecificDates.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() =>
                          setBulkSpecificDates((current) =>
                            current.filter((item) => item !== date)
                          )
                        }
                        className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-black text-indigo-700"
                        title="הסר תאריך"
                      >
                        {new Date(`${date}T12:00:00`).toLocaleDateString("he-IL")}
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mt-5">
              <div className="text-sm font-black text-slate-900">
                סוגי משמרות ושעות
              </div>
              <p className="mt-1 text-[10px] font-bold text-slate-500">
                השעות נטענות מברירת המחדל שהוגדרה לכל סוג וניתן לשנות אותן כאן.
              </p>
              <div className="mt-3 space-y-2">
                {shiftTypes.map((item) => {
                  const checked = bulkSelectedShiftTypeIds.includes(item.id);
                  const schedule = bulkTypeSchedules[item.id];
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 ${
                        checked
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-black text-slate-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulkShiftType(item)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        {item.name}
                      </label>
                      {checked && schedule && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                          <Field label="שעת התחלה">
                            <input
                              type="time"
                              value={schedule.startTime}
                              onChange={(event) =>
                                setBulkTypeSchedules((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...current[item.id],
                                    startTime: event.target.value,
                                  },
                                }))
                              }
                              className="input"
                            />
                          </Field>
                          <Field label="שעת סיום">
                            <input
                              type="time"
                              value={schedule.endTime}
                              onChange={(event) =>
                                setBulkTypeSchedules((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...current[item.id],
                                    endTime: event.target.value,
                                  },
                                }))
                              }
                              className="input"
                            />
                          </Field>
                          <label className="flex h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                            <input
                              type="checkbox"
                              checked={schedule.crossesMidnight}
                              onChange={(event) =>
                                setBulkTypeSchedules((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...current[item.id],
                                    crossesMidnight: event.target.checked,
                                  },
                                }))
                              }
                              className="h-4 w-4 accent-indigo-600"
                            />
                            מסתיימת למחרת
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="מצב המשמרות">
                <select
                  value={bulkStatus}
                  onChange={(event) =>
                    setBulkStatus(
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
              <Field label="מיקום משותף (לא חובה)">
                <input
                  value={bulkLocation}
                  onChange={(event) => setBulkLocation(event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="הערה משותפת (לא חובה)">
                <textarea
                  rows={2}
                  value={bulkNote}
                  onChange={(event) => setBulkNote(event.target.value)}
                  className="input resize-y"
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={bulkSendPushOnPublish}
                  onChange={(event) =>
                    setBulkSendPushOnPublish(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-xs font-black text-indigo-900">
                    שמור אפשרות Push בעת הפרסום
                  </span>
                  <span className="mt-1 block text-[10px] font-bold text-indigo-700">
                    Push יישלח רק לאחר שיבוץ חיילים ופרסום המשמרת דרך מסך העריכה.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm font-black text-slate-900">
                  תצוגה מקדימה
                </span>
                <span className="text-xs font-black text-slate-500">
                  {bulkPreview.filter((item) => !item.duplicate).length} ליצירה
                  {bulkPreview.some((item) => item.duplicate)
                    ? ` · ${bulkPreview.filter((item) => item.duplicate).length} כפולות ידולגו`
                    : ""}
                </span>
              </div>
              <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                {bulkPreview.length === 0 ? (
                  <div className="p-6 text-center text-xs font-bold text-slate-400">
                    בחר תאריכים וסוגי משמרות כדי לראות תצוגה מקדימה.
                  </div>
                ) : (
                  bulkPreview.map((item) => (
                    <div
                      key={item.key}
                      className={`flex flex-col gap-1 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                        item.duplicate ? "bg-amber-50" : "bg-white"
                      }`}
                    >
                      <span className="font-black text-slate-800">
                        {item.shiftType.name} · {new Date(`${item.date}T12:00:00`).toLocaleDateString("he-IL")}
                      </span>
                      <span className="font-bold text-slate-500">
                        {item.schedule.startTime}–{item.schedule.endTime}
                        {item.schedule.crossesMidnight ? " (למחרת)" : ""}
                        {!item.hasValidTimes
                          ? " · שעות לא תקינות"
                          : item.duplicate
                          ? " · כבר קיימת — תידלג"
                          : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {bulkMessage && (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-xs font-bold ${
                  bulkMessage.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {bulkMessage.text}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsBulkFormOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveBulkShifts}
                disabled={bulkSaving || bulkPreview.length === 0}
                className="rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkSaving
                  ? "יוצר משמרות..."
                  : `צור ${bulkPreview.filter((item) => !item.duplicate).length} משמרות`}
              </button>
            </div>
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
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={specialActivity}
                  onChange={(event) => setSpecialActivity(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-orange-600"
                />
                <span>
                  <span className="block text-xs font-black text-orange-950">
                    פעילות מיוחדת
                  </span>
                  <span className="mt-1 block text-[10px] font-bold text-orange-700">
                    פתח שעת מוקי, שעת סיום, מפקדים ויעדי פינוי.
                  </span>
                </span>
              </label>
              {specialActivity && (
                <>
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 md:col-span-2">
                    <div className="text-xs font-black text-sky-950">
                      ייבוא פרטים מהודעת WhatsApp
                    </div>
                    <div className="mt-1 text-[10px] font-bold leading-5 text-sky-700">
                      ניתן להדביק הודעה מכל קו. המערכת מאתרת את הכותרות והערכים המשתנים וממלאת את הטופס לבדיקה.
                    </div>
                    <textarea
                      rows={6}
                      value={specialActivityImportText}
                      onChange={(event) =>
                        setSpecialActivityImportText(event.target.value)
                      }
                      placeholder="הדבק כאן את הודעת הפעילות..."
                      className="input mt-3 resize-y bg-white"
                    />
                    <button
                      type="button"
                      onClick={importSpecialActivityMessage}
                      className="mt-2 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-black text-white"
                    >
                      חלץ פרטים ומלא את הטופס
                    </button>
                  </div>
                  <Field label="שעת מוקי">
                    <input
                      type="time"
                      value={dispatchTime}
                      onChange={(event) => setDispatchTime(event.target.value)}
                      step={60}
                      className="input"
                    />
                  </Field>
                  <Field label="שעת סיום">
                    <input
                      type="time"
                      value={specialActivityEndTime}
                      onChange={(event) =>
                        setSpecialActivityEndTime(event.target.value)
                      }
                      step={60}
                      className="input"
                    />
                  </Field>
                  <Field label="מפקד הכוח החביר">
                    <input
                      value={specialForceCommanderName}
                      onChange={(event) =>
                        setSpecialForceCommanderName(event.target.value)
                      }
                      placeholder="שם מלא"
                      className="input"
                    />
                  </Field>
                  <Field label="טלפון מפקד הכוח החביר">
                    <input
                      type="tel"
                      inputMode="tel"
                      value={specialForceCommanderPhone}
                      onChange={(event) =>
                        setSpecialForceCommanderPhone(event.target.value)
                      }
                      placeholder="מספר טלפון"
                      className="input"
                    />
                  </Field>
                  <Field label="מנהל האירוע החביר">
                    <input
                      value={specialEventManagerName}
                      onChange={(event) =>
                        setSpecialEventManagerName(event.target.value)
                      }
                      placeholder="שם מלא"
                      className="input"
                    />
                  </Field>
                  <Field label="טלפון מנהל האירוע החביר">
                    <input
                      type="tel"
                      inputMode="tel"
                      value={specialEventManagerPhone}
                      onChange={(event) =>
                        setSpecialEventManagerPhone(event.target.value)
                      }
                      placeholder="מספר טלפון"
                      className="input"
                    />
                  </Field>
                  <Field label="מטפל בכיר הכוח החביר">
                    <input value={specialSeniorCaregiverName} onChange={(event) => setSpecialSeniorCaregiverName(event.target.value)} placeholder="שם מלא" className="input" />
                  </Field>
                  <Field label="טלפון מטפל בכיר הכוח החביר">
                    <input type="tel" inputMode="tel" value={specialSeniorCaregiverPhone} onChange={(event) => setSpecialSeniorCaregiverPhone(event.target.value)} placeholder="מספר טלפון" className="input" />
                  </Field>
                  <Field label="תורן רפואה — 📱 אישי">
                    <input type="tel" inputMode="tel" value={medicalDutyPersonalPhone} onChange={(event) => setMedicalDutyPersonalPhone(event.target.value)} placeholder="מספר אישי" className="input" />
                  </Field>
                  <Field label="תורן רפואה — ☎️ כוננות">
                    <input type="tel" inputMode="tel" value={medicalDutyOnCallPhone} onChange={(event) => setMedicalDutyOnCallPhone(event.target.value)} placeholder="מספר כוננות" className="input" />
                  </Field>
                  <ResourceDropdown
                    label="נקודות שחלוף ויעדי פינוי"
                    items={activeEvacuationPoints}
                    selectedIds={selectedEvacuationPointIds}
                    onChange={setSelectedEvacuationPointIds}
                    emptyText="לא הוגדרו נקודות שחלוף פעילות בהגדרות."
                  />
                  <ResourceDropdown
                    label="בתי חולים לפינוי"
                    items={activeHospitals}
                    selectedIds={selectedHospitalIds}
                    onChange={setSelectedHospitalIds}
                    emptyText="לא הוגדרו בתי חולים פעילים בהגדרות."
                  />
                  <ResourceDropdown
                    label="מנחתים"
                    items={activeHelipads}
                    selectedIds={selectedHelipadIds}
                    onChange={setSelectedHelipadIds}
                    emptyText="לא הוגדרו מנחתים פעילים בהגדרות."
                  />
                  <ResourceDropdown
                    label="תדרי קשר"
                    items={activeFrequencies}
                    selectedIds={selectedFrequencyIds}
                    onChange={setSelectedFrequencyIds}
                    emptyText="לא הוגדרו תדרים פעילים בהגדרות."
                  />
                </>
              )}
              <Field label="הערה / דגשים">
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
              <details className="group rounded-xl border border-emerald-200 bg-emerald-50/50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                  <div>
                    <div className="text-xs font-black text-slate-800">
                      הצגת מועמדים לפי סטטוס נוכחות
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-slate-500">
                      {visibleCandidateStatusIds.length} סטטוסים מוצגים · לחצו לפתיחת אפשרויות הסינון
                    </div>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-lg font-black text-emerald-800 transition-transform group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <div className="border-t border-emerald-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[10px] font-bold leading-5 text-slate-500">
                      הסינון משפיע רק על הרשימה. ניתן לשבץ רק סטטוסים שהוגדרו כמותרים לכל תפקיד משמרת.
                    </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCandidateStatusIds(["base"])}
                      className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black text-emerald-800"
                    >
                      בסיס בלבד
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCandidateStatusIds(
                          candidateAttendanceStatuses.map((status) => status.id)
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-700"
                    >
                      הצג את כל המותרים
                    </button>
                  </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidateAttendanceStatuses.map((status) => {
                      const checked = visibleCandidateStatusIds.includes(status.id);
                      return (
                        <label
                          key={status.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold ${
                            checked
                              ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setVisibleCandidateStatusIds((current) =>
                                checked
                                  ? current.filter((id) => id !== status.id)
                                  : [...current, status.id]
                              )
                            }
                          />
                          <span>{status.icon || "•"}</span>
                          {status.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>
              {formSlots.map((slot) => {
                const availableUsers = slot.allowSystemUsers
                  ? selectableUsers
                      .filter(
                        (user) =>
                          (slot.allowDischargedUsers ||
                            !user.isDischarged) &&
                           isAllowedForSlot(user, slot) &&
                           ((user.isDischarged === true &&
                             slot.allowDischargedUsers) ||
                             visibleCandidateStatusIds.includes(
                               getAttendanceInfo(user).report?.status || ""
                             )) &&
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
                        {slot.key.endsWith("__double") ? (
                          <button
                            type="button"
                            onClick={() => {
                              const baseKey = slot.key.replace("__double", "");
                              setDoubleSlotIds((current) =>
                                current.filter((key) => key !== baseKey)
                              );
                              setSlotAssignments((current) => {
                                const next = { ...current };
                                delete next[slot.key];
                                return next;
                              });
                              setReplacementTimes((current) => {
                                const next = { ...current };
                                delete next[slot.key];
                                return next;
                              });
                            }}
                            className="mt-2 text-[10px] font-black text-rose-600"
                          >
                            הסר שיבוץ נוסף
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setDoubleSlotIds((current) =>
                                current.includes(slot.key)
                                  ? current
                                  : [...current, slot.key]
                              )
                            }
                            disabled={doubleSlotIds.includes(slot.key)}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-700 disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" /> הזנת חייל נוסף
                          </button>
                        )}
                      </div>
                      <div
                        className={`grid grid-cols-1 gap-2 ${
                          slot.key.endsWith("__double")
                            ? "sm:grid-cols-[1fr_150px]"
                            : ""
                        }`}
                      >
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
                        {slot.key.endsWith("__double") && (
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-black text-slate-500">
                              שעת החלפה
                            </span>
                            <input
                              type="time"
                              value={replacementTimes[slot.key] || ""}
                              onChange={(event) =>
                                setReplacementTimes((current) => ({
                                  ...current,
                                  [slot.key]: event.target.value,
                                }))
                              }
                              step={60}
                              title="שעת החלפה"
                              aria-label="שעת החלפה"
                              className="input"
                            />
                          </label>
                        )}
                      </div>
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

            {duplicateAssignmentInfo && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                <div>
                  {duplicateAssignmentInfo.assigneeName} נבחר ליותר מתפקיד אחד
                  {duplicateAssignmentInfo.roleLabels.length > 0
                    ? ` (${duplicateAssignmentInfo.roleLabels.join(", ")})`
                    : ""}
                  .
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-slate-800">
                  <input
                    type="checkbox"
                    checked={allowDuplicateAssignment}
                    onChange={(event) =>
                      setAllowDuplicateAssignment(event.target.checked)
                    }
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span>אני מאשר/ת את השיבוץ הכפול</span>
                </label>
              </div>
            )}

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
        </>
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

function ResourceDropdown({
  label,
  items,
  selectedIds,
  onChange,
  emptyText,
}: {
  label: string;
  items: OperationalResourceConfig[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
}) {
  const selectedNames = items
    .filter((item) => selectedIds.includes(item.id))
    .map((item) => item.name);

  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </span>
      <details className="group relative">
        <summary className="input flex min-h-[42px] cursor-pointer list-none items-center justify-between gap-2">
          <span className={selectedNames.length ? "text-slate-800" : "text-slate-400"}>
            {selectedNames.length ? selectedNames.join(", ") : `בחר ${label}...`}
          </span>
          <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] font-bold text-slate-400">
              {emptyText}
            </div>
          ) : (
            <>
              {items.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange(
                          checked
                            ? selectedIds.filter((id) => id !== item.id)
                            : [...selectedIds, item.id]
                        )
                      }
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <span>
                      {item.name}
                      {item.type === "helipad" && item.coordinates
                        ? ` · נ.צ ${item.coordinates}`
                        : ""}
                      {item.type === "frequency" && (item.callSign || item.frequency)
                        ? ` · ${[item.callSign, item.frequency].filter(Boolean).join(" ")}`
                        : ""}
                    </span>
                  </label>
                );
              })}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mt-1 w-full rounded-lg bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500"
                >
                  נקה בחירה
                </button>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
