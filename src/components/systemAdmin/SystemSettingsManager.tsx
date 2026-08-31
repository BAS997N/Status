import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Clock3,
  Database,
  MonitorCog,
  Save,
  Settings,
  ShieldAlert,
  MessageCircle,
  Plus,
  Trash2,
  Star,
  Edit2,
  CalendarRange,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  AttendanceStatusConfig,
  SystemMode,
  SystemRole,
  SystemSettingsConfig,
  UserProfile,
  WhatsAppGroupConfig,
  OrderEventConfig,
  ReportingClosedVisibleSection,
} from "../../types";
import { dataService } from "../../services/dataService";
import { playNotificationSound } from "../../services/notificationSoundService";

interface SystemSettingsManagerProps {
  currentUser: UserProfile;
  users: UserProfile[];
  attendanceStatuses: AttendanceStatusConfig[];
  settings: SystemSettingsConfig | null;
  onSettingsChanged: (settings: SystemSettingsConfig) => void;
}

const MAIN_TAB_OPTIONS = [
  { id: "reporter", label: "דיווח נוכחות אישי" },
  { id: "dashboard", label: "לוח בקרה מפקדים" },
  { id: "shifts", label: "משמרות" },
  { id: "line_planning", label: "תכנון קו ואילוצים" },
  { id: "emergency", label: "מרכז חירום" },
  { id: "system_admin", label: "ניהול מערכת" },
] as const;

const ADMIN_TAB_OPTIONS = [
  { id: "users", label: "משתמשים ותפקידי מערכת" },
  { id: "app_status", label: "התקנת אפליקציה והתראות" },
  { id: "system_roles", label: "תפקידי ניהול" },
  { id: "permissions", label: "הרשאות לפי תפקיד" },
  { id: "statuses", label: "סטטוסי נוכחות" },
  { id: "units", label: "יחידות ושיוכים" },
  { id: "roles", label: "תפקידי רפואה" },
  { id: "shift_types", label: "שמות וסוגי משמרות" },
  { id: "shift_roles", label: "ניהול תפקידי משמרת" },
  { id: "external_staff", label: "אנשי צוות חיצוניים" },
  { id: "shift_resources", label: "משאבי פעילות מיוחדת" },
  { id: "settings", label: "הגדרות מערכת" },
  { id: "sheets", label: "Google Sheets" },
  { id: "audit", label: "Audit — יומן ביקורת" },
  { id: "backups", label: "גיבויים ושחזור" },
] as const;

const DASHBOARD_CARD_OPTIONS = [
  { id: "available", label: "זמינים לפעילות" },
  { id: "disciplinary", label: "בריתוק / עבודות רס״ר" },
  { id: "order_benefits", label: "הטבות לאחר שירות" },
  { id: "outside_unit", label: "מחוץ ליחידה" },
  { id: "not_on_order", label: "לא בצו" },
  { id: "cut_order", label: "חיתוך צו / משוחרר זמנית" },
  { id: "return_to_base", label: "חוזרים לבסיס היום" },
  { id: "exit_home", label: "יוצאים לבית היום" },
  { id: "unreported", label: "טרם דיווחו היום" },
] as const;

const DEFAULT_SETTINGS: SystemSettingsConfig = {
  systemName: "מערכת נוכחות חיילים",
  unitName: "תאג״ד 997",
  footerText: "Created by AviElias",
  systemVersion: "1.0.0",
  timeZone: "Asia/Jerusalem",
  defaultStartScreen: "dashboard",
  hideEmptyDashboardCards: true,
  dashboardCardVisibilityOverrides: {},
  notificationsEnabled: true,
  toastNotificationsEnabled: true,
  notificationSoundEnabled: false,
  attendanceReminderEnabled: false,
  attendanceReminderTime: "09:00",
  registrationNotificationRecipientPersonalIds: ["5749199"],
  attendanceReportPushEnabled: false,
  attendanceReportPushRecipientPersonalIds: ["5749199"],
  cacheMinutes: 30,
  autoRefreshSeconds: 60,
  maintenanceMode: false,
  maintenanceMessage: "המערכת נמצאת כרגע בתחזוקה. נסו שוב מאוחר יותר.",
  maintenanceAllowedRoles: ["super_admin", "admin"],
  reportingEnabled: true,
  reportingClosedMessage: "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס.",
  reportingClosedAllowedRoles: ["super_admin", "admin"],
  reportingClosedVisibleSections: [],
  orderEvents: [],
  linePlanningVisibleToSoldiers: true,
  shiftsEnabled: true,
  shiftsClosedMessage: "מסך המשמרות אינו זמין כעת. יש להתעדכן מול המפקד.",
  systemMode: "routine",
  operationalMessage: "המערכת פועלת במצב מבצעי.",
  emergencyEvent: {
    active: false,
    eventId: "",
    title: "מצב חירום",
    message: "",
    assemblyLocation: "",
    assemblyTime: "",
  },
  whatsappGroups: [],
  adminTabOrder: ADMIN_TAB_OPTIONS.map((item) => item.id),
  mainTabOrder: MAIN_TAB_OPTIONS.map((item) => item.id),
  operationalResources: [],
};

const SYSTEM_ROLE_OPTIONS: Array<{
  value: SystemRole;
  label: string;
  description: string;
}> = [
  {
    value: "super_admin",
    label: "מנהל אתר",
    description: "גישה מלאה לניהול המערכת.",
  },
  {
    value: "admin",
    label: "מפקד",
    description: "ניהול שוטף ולוח בקרה.",
  },
  {
    value: "viewer",
    label: "שליש",
    description: "צפייה בנתונים בהתאם להרשאות.",
  },
  {
    value: "reporter",
    label: "חייל",
    description: "גישה למסך הדיווח האישי.",
  },
];

const REPORTING_CLOSED_SECTION_OPTIONS: Array<{
  value: ReportingClosedVisibleSection;
  label: string;
  description: string;
}> = [
  {
    value: "shifts",
    label: "משמרות",
    description: "המשמרת הבאה והמשמרות השבועיות של החייל.",
  },
  {
    value: "planning",
    label: "לוח יציאות",
    description: "תכנון הנוכחות האישי בקו.",
  },
  {
    value: "order",
    label: "הצו שלי",
    description: "פרטי הצו והימים האישיים.",
  },
  {
    value: "messages",
    label: "הודעות",
    description: "הודעות מפקד ואישורי קריאה.",
  },
];

export default function SystemSettingsManager({
  currentUser,
  users,
  attendanceStatuses,
  settings,
  onSettingsChanged,
}: SystemSettingsManagerProps) {
  const [draft, setDraft] = useState<SystemSettingsConfig>(
    settings || DEFAULT_SETTINGS
  );
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "general" | "modes" | "orders" | "whatsapp"
  >("general");
  const [newOrderTitle, setNewOrderTitle] = useState("");
  const [newOrderStartDate, setNewOrderStartDate] = useState("");
  const [newOrderEndDate, setNewOrderEndDate] = useState("");
  const [newOrderLocation, setNewOrderLocation] = useState("");
  const [newOrderProcessingDays, setNewOrderProcessingDays] = useState(3);
  const [newOrderProcessingDayType, setNewOrderProcessingDayType] =
    useState<"processing" | "family">("processing");
  const [newOrderTrainingStartDate, setNewOrderTrainingStartDate] = useState("");
  const [newOrderLineStartDate, setNewOrderLineStartDate] = useState("");
  const [newOrderLineEndDate, setNewOrderLineEndDate] = useState("");
  const [newOrderProcessingDate, setNewOrderProcessingDate] = useState("");
  const [
    newOrderProcessingExcludedUserIds,
    setNewOrderProcessingExcludedUserIds,
  ] = useState<string[]>([]);
  const [processingExclusionSearch, setProcessingExclusionSearch] =
    useState("");
  const [newOrderPersonalStartDates, setNewOrderPersonalStartDates] = useState<
    Record<string, string>
  >({});
  const [newOrderPersonalEndDates, setNewOrderPersonalEndDates] = useState<
    Record<string, string>
  >({});
  const [newOrderPersonalProcessingBenefits, setNewOrderPersonalProcessingBenefits] =
    useState<
      Record<
        string,
        {
          processingDays?: number;
          processingDate?: string;
          familyDays?: number;
          familyDate?: string;
        }
      >
    >({});
  const [personalEndDateSearch, setPersonalEndDateSearch] = useState("");
  const [selectedPersonalOrderUserId, setSelectedPersonalOrderUserId] =
    useState<string | null>(null);
  const [personalOrderPickerOpen, setPersonalOrderPickerOpen] =
    useState(false);
  const [newOrderNote, setNewOrderNote] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const getProcessingDayLabel = (
    days: number,
    type: "processing" | "family"
  ) => {
    if (type === "family") return days === 1 ? "יום משפחות" : "ימי משפחות";
    return days === 1 ? "יום עיבוד" : "ימי עיבוד";
  };

  const processingExclusionUsers = users
    .filter((user) => !user.isDischarged)
    .filter((user) => {
      const search = processingExclusionSearch.trim().toLocaleLowerCase("he");
      if (!search) return true;
      return [user.fullName, user.personalId, user.unit]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("he").includes(search)
        );
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));

  const personalEndDateUsers = users
    .filter((user) => !user.isDischarged)
    .filter((user) => {
      const search = personalEndDateSearch.trim().toLocaleLowerCase("he");
      if (!search) return true;
      return [user.fullName, user.personalId, user.unit]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("he").includes(search)
        );
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  const selectedPersonalOrderUser = selectedPersonalOrderUserId
    ? users.find((user) => user.userId === selectedPersonalOrderUserId) || null
    : null;
  const registrationNotificationUsers = users
    .filter(
      (user) =>
        !user.isDischarged &&
        user.systemAccessBlocked !== true &&
        Boolean(String(user.personalId || "").trim()) &&
        (user.role === "commander" ||
          user.role === "adjutant_officer" ||
          user.systemRole === "super_admin" ||
          user.systemRole === "admin" ||
          user.systemRoleAccessLevel === "admin")
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));

  useEffect(() => {
    if (settings && !isDirty && !saving) {
      setDraft(settings);
    }
  }, [settings, isDirty, saving]);

  const update = <K extends keyof SystemSettingsConfig>(
    key: K,
    value: SystemSettingsConfig[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
    setMessage(null);
  };

  const getCompleteOrder = (
    current: string[] | undefined,
    options: ReadonlyArray<{ id: string }>
  ) => {
    const validIds = new Set(options.map((item) => item.id));
    return [
      ...(current || []).filter((id) => validIds.has(id)),
      ...options.map((item) => item.id).filter((id) => !(current || []).includes(id)),
    ];
  };

  const moveTab = (
    key: "mainTabOrder" | "adminTabOrder",
    id: string,
    direction: -1 | 1,
    options: ReadonlyArray<{ id: string }>
  ) => {
    const order = getCompleteOrder(draft[key], options);
    const index = order.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    update(key, order);
  };

  const updateDashboardCardVisibility = (
    cardId: string,
    value: "auto" | "show" | "hide"
  ) => {
    update("dashboardCardVisibilityOverrides", {
      ...(draft.dashboardCardVisibilityOverrides || {}),
      [cardId]: value,
    });
  };

  const dedicatedDashboardStatusIds = new Set([
    "base",
    "home",
    "not_on_order",
    "cut_order",
    "processing_days",
    "refresh_days",
    "family_days",
  ]);
  const dashboardCardOptions = [
    ...DASHBOARD_CARD_OPTIONS,
    ...attendanceStatuses
      .filter(
        (status) =>
          status.enabled &&
          status.visibleToCommanders &&
          !dedicatedDashboardStatusIds.has(status.id)
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((status) => ({
        id: `status:${status.id}`,
        label: status.label,
      })),
  ];

  const toggleRegistrationNotificationRecipient = (
    personalId: string,
    checked: boolean
  ) => {
    const currentRecipients =
      draft.registrationNotificationRecipientPersonalIds || ["5749199"];
    const nextRecipients = checked
      ? Array.from(new Set([...currentRecipients, personalId]))
      : currentRecipients.filter((item) => item !== personalId);

    update(
      "registrationNotificationRecipientPersonalIds",
      nextRecipients.length > 0 ? nextRecipients : ["5749199"]
    );
  };

  const toggleAttendanceReportPushRecipient = (
    personalId: string,
    checked: boolean
  ) => {
    const currentRecipients =
      draft.attendanceReportPushRecipientPersonalIds || ["5749199"];
    const nextRecipients = checked
      ? Array.from(new Set([...currentRecipients, personalId]))
      : currentRecipients.filter((item) => item !== personalId);

    update("attendanceReportPushRecipientPersonalIds", nextRecipients);
  };

  const toggleAllowedRole = (
    key: "maintenanceAllowedRoles" | "reportingClosedAllowedRoles",
    role: SystemRole,
    checked: boolean
  ) => {
    setDraft((current) => {
      const currentRoles = current[key] || [];
      const nextRoles = checked
        ? Array.from(new Set([...currentRoles, role]))
        : currentRoles.filter((item) => item !== role);

      return {
        ...current,
        [key]: nextRoles,
      };
    });
    setIsDirty(true);
    setMessage(null);
  };

  const updateEmergency = (
    key: keyof SystemSettingsConfig["emergencyEvent"],
    value: string | boolean
  ) => {
    setDraft((current) => ({
      ...current,
      emergencyEvent: {
        ...current.emergencyEvent,
        [key]: value,
      },
    }));
    setIsDirty(true);
    setMessage(null);
  };

  const setSystemMode = (mode: SystemMode) => {
    setDraft((current) => ({
      ...current,
      systemMode: mode,
      emergencyEvent:
        mode === "emergency"
          ? {
              ...current.emergencyEvent,
              active: true,
              eventId:
                current.systemMode === "emergency" &&
                current.emergencyEvent.active
                  ? current.emergencyEvent.eventId
                  : `emergency_${Date.now()}`,
              activatedAt: new Date().toISOString(),
              activatedBy: currentUser.userId,
              activatedByName: currentUser.fullName,
              previousSystemMode:
                current.systemMode === "operational"
                  ? "operational"
                  : current.systemMode === "emergency"
                  ? current.emergencyEvent.previousSystemMode || "routine"
                  : "routine",
            }
          : {
              ...current.emergencyEvent,
              active: false,
            },
    }));
    setIsDirty(true);
    setMessage(null);
  };

  const createWhatsAppGroupId = () =>
    `whatsapp_group_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  const updateWhatsAppGroups = (groups: WhatsAppGroupConfig[]) => {
    update(
      "whatsappGroups",
      groups.map((group, index) => ({
        ...group,
        sortOrder: index + 1,
      }))
    );
  };

  const addWhatsAppGroup = () => {
    const currentGroups = draft.whatsappGroups || [];

    updateWhatsAppGroups([
      ...currentGroups,
      {
        id: createWhatsAppGroupId(),
        name: `קבוצה ${currentGroups.length + 1}`,
        link: "",
        enabled: true,
        isDefault: currentGroups.length === 0,
        sortOrder: currentGroups.length + 1,
      },
    ]);
  };

  const updateWhatsAppGroup = (
    groupId: string,
    changes: Partial<WhatsAppGroupConfig>
  ) => {
    const currentGroups = draft.whatsappGroups || [];

    updateWhatsAppGroups(
      currentGroups.map((group) => {
        if (group.id !== groupId) {
          return changes.isDefault ? { ...group, isDefault: false } : group;
        }

        return { ...group, ...changes };
      })
    );
  };

  const removeWhatsAppGroup = (groupId: string) => {
    const currentGroups = draft.whatsappGroups || [];
    const remaining = currentGroups.filter((group) => group.id !== groupId);

    if (remaining.length > 0 && !remaining.some((group) => group.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    updateWhatsAppGroups(remaining);
  };

  const resetOrderForm = () => {
    setEditingOrderId(null);
    setNewOrderTitle("");
    setNewOrderStartDate("");
    setNewOrderEndDate("");
    setNewOrderLocation("");
    setNewOrderProcessingDays(3);
    setNewOrderProcessingDayType("processing");
    setNewOrderTrainingStartDate("");
    setNewOrderLineStartDate("");
    setNewOrderLineEndDate("");
    setNewOrderProcessingDate("");
    setNewOrderProcessingExcludedUserIds([]);
    setProcessingExclusionSearch("");
    setNewOrderPersonalStartDates({});
    setNewOrderPersonalEndDates({});
    setNewOrderPersonalProcessingBenefits({});
    setPersonalEndDateSearch("");
    setSelectedPersonalOrderUserId(null);
    setPersonalOrderPickerOpen(false);
    setNewOrderNote("");
  };

  const saveOrderEvent = () => {
    setMessage(null);
    const wasEditing = Boolean(editingOrderId);

    if (!newOrderTitle.trim() || !newOrderStartDate || !newOrderEndDate) {
      setMessage({
        type: "error",
        text: "יש להזין שם צו, תאריך התחלה ותאריך סיום.",
      });
      return;
    }

    if (newOrderEndDate < newOrderStartDate) {
      setMessage({
        type: "error",
        text: "תאריך סיום הצו לא יכול להיות מוקדם מתאריך ההתחלה.",
      });
      return;
    }

    if (
      newOrderLineStartDate &&
      newOrderLineEndDate &&
      newOrderLineEndDate < newOrderLineStartDate
    ) {
      setMessage({
        type: "error",
        text: "תאריך סיום הקו לא יכול להיות מוקדם מתאריך העלייה לקו.",
      });
      return;
    }

    const invalidPersonalStartDate = Object.values(
      newOrderPersonalStartDates
    ).find(
      (dateValue) =>
        Boolean(dateValue) &&
        (dateValue < newOrderStartDate || dateValue > newOrderEndDate)
    );
    if (invalidPersonalStartDate) {
      setMessage({
        type: "error",
        text: "תאריך תחילת צו אישי חייב להיות בתוך תקופת הצו.",
      });
      return;
    }

    const invalidPersonalEndDate = Object.values(
      newOrderPersonalEndDates
    ).find(
      (dateValue) =>
        Boolean(dateValue) &&
        (dateValue < newOrderStartDate || dateValue > newOrderEndDate)
    );
    if (invalidPersonalEndDate) {
      setMessage({
        type: "error",
        text: "תאריך סיום אישי חייב להיות בתוך תקופת הצו.",
      });
      return;
    }

    const hasInvalidPersonalRange = users.some((user) => {
      const personalStart =
        newOrderPersonalStartDates[user.userId] || newOrderStartDate;
      const personalEnd =
        newOrderPersonalEndDates[user.userId] || newOrderEndDate;
      return personalStart > personalEnd;
    });
    if (hasInvalidPersonalRange) {
      setMessage({
        type: "error",
        text: "תאריך התחלה אישי לא יכול להיות מאוחר מתאריך הסיום האישי.",
      });
      return;
    }

    const hasIncompletePersonalBenefit = Object.values(
      newOrderPersonalProcessingBenefits
    ).some(
      (benefit) =>
        Boolean(benefit.processingDays) !== Boolean(benefit.processingDate) ||
        Boolean(benefit.familyDays) !== Boolean(benefit.familyDate)
    );
    if (hasIncompletePersonalBenefit) {
      setMessage({
        type: "error",
        text: "בכל זכאות אישית יש להזין גם כמות ימים וגם תאריך.",
      });
      return;
    }

    if (editingOrderId) {
      update(
        "orderEvents",
        (draft.orderEvents || []).map((order) =>
          order.id === editingOrderId
            ? {
                ...order,
                title: newOrderTitle.trim(),
                startDate: newOrderStartDate,
                endDate: newOrderEndDate,
                location: newOrderLocation.trim(),
                processingDays: newOrderProcessingDays,
                processingDayType: newOrderProcessingDayType,
                trainingStartDate: newOrderTrainingStartDate,
                lineStartDate: newOrderLineStartDate,
                lineEndDate: newOrderLineEndDate,
                processingDate: newOrderProcessingDate,
                processingExcludedUserIds:
                  newOrderProcessingExcludedUserIds,
                personalStartDates: newOrderPersonalStartDates,
                personalEndDates: newOrderPersonalEndDates,
                personalProcessingBenefits:
                  newOrderPersonalProcessingBenefits,
                note: newOrderNote.trim(),
              }
            : order
        )
      );
    } else {
      const orderEvent: OrderEventConfig = {
        id: `order_${Date.now()}`,
        title: newOrderTitle.trim(),
        startDate: newOrderStartDate,
        endDate: newOrderEndDate,
        location: newOrderLocation.trim(),
        processingDays: newOrderProcessingDays,
        processingDayType: newOrderProcessingDayType,
        trainingStartDate: newOrderTrainingStartDate,
        lineStartDate: newOrderLineStartDate,
        lineEndDate: newOrderLineEndDate,
        processingDate: newOrderProcessingDate,
        processingExcludedUserIds: newOrderProcessingExcludedUserIds,
        personalStartDates: newOrderPersonalStartDates,
        personalEndDates: newOrderPersonalEndDates,
        personalProcessingBenefits: newOrderPersonalProcessingBenefits,
        note: newOrderNote.trim(),
        createdAt: new Date().toISOString(),
        createdBy: currentUser.userId,
      };

      update("orderEvents", [orderEvent, ...(draft.orderEvents || [])]);
    }
    resetOrderForm();
    setMessage({
      type: "success",
      text: wasEditing
        ? "הצו עודכן. יש ללחוץ על „שמור הגדרות” כדי להחיל את השינוי."
        : "הצו נוסף. יש ללחוץ על „שמור הגדרות” כדי להחיל את השינוי.",
    });
  };

  const editOrderEvent = (order: OrderEventConfig) => {
    setEditingOrderId(order.id);
    setNewOrderTitle(order.title);
    setNewOrderStartDate(order.startDate);
    setNewOrderEndDate(order.endDate);
    setNewOrderLocation(order.location || "");
    setNewOrderProcessingDays(order.processingDays ?? 3);
    setNewOrderProcessingDayType(order.processingDayType || "processing");
    setNewOrderTrainingStartDate(order.trainingStartDate || "");
    setNewOrderLineStartDate(order.lineStartDate || "");
    setNewOrderLineEndDate(order.lineEndDate || "");
    setNewOrderProcessingDate(order.processingDate || "");
    setNewOrderProcessingExcludedUserIds(
      order.processingExcludedUserIds || []
    );
    setProcessingExclusionSearch("");
    setNewOrderPersonalStartDates(order.personalStartDates || {});
    setNewOrderPersonalEndDates(order.personalEndDates || {});
    setNewOrderPersonalProcessingBenefits(
      order.personalProcessingBenefits || {}
    );
    setPersonalEndDateSearch("");
    setSelectedPersonalOrderUserId(null);
    setPersonalOrderPickerOpen(false);
    setNewOrderNote(order.note || "");
    setMessage(null);
  };

  const removeOrderEvent = (orderId: string) => {
    update(
      "orderEvents",
      (draft.orderEvents || []).filter((order) => order.id !== orderId)
    );
    if (editingOrderId === orderId) resetOrderForm();
  };

  const handleSave = async () => {
    setMessage(null);
    if (!draft.systemName.trim() || !draft.unitName.trim()) {
      setMessage({ type: "error", text: "שם המערכת ושם היחידה הם שדות חובה." });
      return;
    }

    setSaving(true);
    try {
      const saved = await dataService.saveSystemSettings(
        draft,
        currentUser.userId
      );
      setDraft(saved);
      setIsDirty(false);
      onSettingsChanged(saved);
      setMessage({
        type: "success",
        text: "הגדרות המערכת נשמרו והוחלו בהצלחה.",
      });
    } catch (error) {
      console.error("Failed saving system settings:", error);
      setMessage({ type: "error", text: "שמירת הגדרות המערכת נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-l from-violet-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">הגדרות מערכת</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              ניהול זהות המערכת, התראות, רענון, Cache ומצב תחזוקה. כל שינוי נשמר ב־Audit.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          { id: "general" as const, label: "הגדרות כלליות", icon: Settings },
          { id: "modes" as const, label: "מצבי מערכת", icon: ShieldAlert },
          { id: "orders" as const, label: "ניהול צווים", icon: CalendarRange },
          { id: "whatsapp" as const, label: "קבוצות WhatsApp", icon: MessageCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          const selected = activeSettingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-black transition ${
                selected
                  ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                  : "border-transparent bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <section className={`${activeSettingsTab === "general" ? "" : "hidden"} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
        <div className="mb-4 flex items-center gap-2">
          <MonitorCog className="h-5 w-5 text-violet-600" />
          <h3 className="text-sm font-black text-slate-900">זהות ותצוגה</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="שם המערכת">
            <input value={draft.systemName} onChange={(e) => update("systemName", e.target.value)} className="input" />
          </Field>
          <Field label="שם היחידה / הגדוד">
            <input value={draft.unitName} onChange={(e) => update("unitName", e.target.value)} className="input" />
          </Field>
          <Field label="טקסט Footer">
            <input value={draft.footerText} onChange={(e) => update("footerText", e.target.value)} className="input" />
          </Field>
          <Field label="גרסת מערכת">
            <input value={draft.systemVersion} onChange={(e) => update("systemVersion", e.target.value)} className="input" dir="ltr" />
          </Field>
          <Field label="אזור זמן">
            <select value={draft.timeZone} onChange={(e) => update("timeZone", e.target.value)} className="input">
              <option value="Asia/Jerusalem">ישראל — Asia/Jerusalem</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">לונדון — Europe/London</option>
              <option value="America/New_York">ניו יורק — America/New_York</option>
            </select>
          </Field>
          <Field label="מסך פתיחה למפקדים">
            <select value={draft.defaultStartScreen} onChange={(e) => update("defaultStartScreen", e.target.value as "reporter" | "dashboard")} className="input">
              <option value="dashboard">לוח בקרה</option>
              <option value="reporter">דיווח נוכחות אישי</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <Toggle
            label="הסתר כרטיסים ריקים בלוח הבקרה"
            description="כרטיסי סיכום שהערך שלהם 0 לא יוצגו. כרטיסים שיש בהם נתונים יופיעו אוטומטית."
            checked={draft.hideEmptyDashboardCards}
            onChange={(value) => update("hideEmptyDashboardCards", value)}
          />
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-sm font-black text-slate-900">
            חריגים לתצוגת כרטיסי לוח הבקרה
          </div>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
            ניתן להכריח כרטיס מסוים להופיע או להסתתר, בלי קשר להגדרה הכללית של כרטיסים ריקים.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {dashboardCardOptions.map((card) => (
              <label
                key={card.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span className="min-w-0 text-xs font-black text-slate-800">
                  {card.label}
                </span>
                <select
                  value={
                    draft.dashboardCardVisibilityOverrides?.[card.id] || "auto"
                  }
                  onChange={(event) =>
                    updateDashboardCardVisibility(
                      card.id,
                      event.target.value as "auto" | "show" | "hide"
                    )
                  }
                  className="min-w-[9rem] rounded-lg border border-slate-300 bg-white px-2 py-2 text-[11px] font-bold text-slate-700"
                >
                  <option value="auto">לפי ההגדרה הכללית</option>
                  <option value="show">תמיד להציג</option>
                  <option value="hide">תמיד להסתיר</option>
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[
            {
              title: "סדר הטאבים הראשיים",
              key: "mainTabOrder" as const,
              options: MAIN_TAB_OPTIONS,
            },
            {
              title: "סדר מסכי ניהול המערכת",
              key: "adminTabOrder" as const,
              options: ADMIN_TAB_OPTIONS,
            },
          ].map((list) => {
            const order = getCompleteOrder(draft[list.key], list.options);
            return (
              <div
                key={list.key}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="text-sm font-black text-slate-900">
                  {list.title}
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  השתמשו בחצים כדי לקבוע את סדר ההצגה במערכת.
                </p>
                <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pl-1">
                  {order.map((id, index) => {
                    const option = list.options.find((item) => item.id === id);
                    if (!option) return null;
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-500">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-xs font-black text-slate-800">
                          {option.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => moveTab(list.key, id, -1, list.options)}
                          disabled={index === 0}
                          aria-label={`העבר את ${option.label} למעלה`}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTab(list.key, id, 1, list.options)}
                          disabled={index === order.length - 1}
                          aria-label={`העבר את ${option.label} למטה`}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${activeSettingsTab === "general" ? "" : "hidden"} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-black text-slate-900">התראות</h3>
        </div>
        <div className="space-y-3">
          <Toggle label="הפעלת התראות במערכת" checked={draft.notificationsEnabled} onChange={(value) => update("notificationsEnabled", value)} />
          <Toggle label="הצגת הודעות Toast" checked={draft.toastNotificationsEnabled} disabled={!draft.notificationsEnabled} onChange={(value) => update("toastNotificationsEnabled", value)} />
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <Toggle
              label="צליל התראה"
              description="משמיע צליל קצר ועדין כאשר מתקבלת התראה חדשה בזמן שהמערכת פתוחה."
              checked={draft.notificationSoundEnabled}
              disabled={!draft.notificationsEnabled}
              onChange={(value) => update("notificationSoundEnabled", value)}
            />
            <button
              type="button"
              disabled={!draft.notificationsEnabled || !draft.notificationSoundEnabled}
              onClick={() => void playNotificationSound(true)}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-amber-400 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              בדיקת צליל
            </button>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <div className="text-sm font-black text-slate-900">
              מקבלי התראת רישום חדש
            </div>
            <p className="mt-1 text-xs font-medium text-slate-600">
              רק המשתמשים המסומנים יקבלו התראה באתר ו־Push, אם הופעל במכשיר שלהם.
            </p>
            <div className="mt-3 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {registrationNotificationUsers.map((user) => {
                const personalId = String(user.personalId || "").trim();
                const checked = (
                  draft.registrationNotificationRecipientPersonalIds || [
                    "5749199",
                  ]
                ).includes(personalId);
                return (
                  <label
                    key={user.userId}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      checked
                        ? "border-sky-400 bg-white"
                        : "border-slate-200 bg-white/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        toggleRegistrationNotificationRecipient(
                          personalId,
                          event.target.checked
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-900">
                        {user.fullName}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-slate-500">
                        {user.personalId} · {user.medicalRole || user.unit || "משתמש מערכת"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <Toggle
              label="Push על דיווח נוכחות חדש"
              description="שולח התראה אחת לאחר שחייל מגיש דיווח, גם כאשר ההגשה כוללת טווח תאריכים."
              checked={draft.attendanceReportPushEnabled}
              disabled={!draft.notificationsEnabled}
              onChange={(value) => update("attendanceReportPushEnabled", value)}
            />
            <div className="mt-3 text-xs font-black text-slate-700">
              מי יקבל את ההתראה
            </div>
            <div className="mt-2 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {registrationNotificationUsers.map((user) => {
                const personalId = String(user.personalId || "").trim();
                const checked = (
                  draft.attendanceReportPushRecipientPersonalIds || ["5749199"]
                ).includes(personalId);
                return (
                  <label
                    key={user.userId}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                      checked ? "border-emerald-400 bg-white" : "border-slate-200 bg-white/70"
                    } ${draft.attendanceReportPushEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!draft.attendanceReportPushEnabled}
                      onChange={(event) =>
                        toggleAttendanceReportPushRecipient(personalId, event.target.checked)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-900">
                        {user.fullName}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-slate-500">
                        {user.personalId} · {user.medicalRole || user.unit || "משתמש מערכת"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {draft.attendanceReportPushEnabled &&
              (draft.attendanceReportPushRecipientPersonalIds || []).length === 0 && (
                <p className="mt-2 text-xs font-bold text-rose-600">
                  יש לבחור לפחות מקבל אחד כדי שההתראות יישלחו.
                </p>
              )}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <Toggle
              label="תזכורת Push אוטומטית למי שלא דיווח"
              description="בשעה שנבחרה תישלח תזכורת פעם אחת ביום לכל חייל פעיל שטרם דיווח ושמופעלות אצלו התראות Push."
              checked={draft.attendanceReminderEnabled}
              disabled={!draft.notificationsEnabled}
              onChange={(value) => update("attendanceReminderEnabled", value)}
            />
            <div className="mt-3 max-w-xs">
              <Field label="שעת שליחת התזכורת">
                <input
                  type="time"
                  value={draft.attendanceReminderTime}
                  disabled={
                    !draft.notificationsEnabled ||
                    !draft.attendanceReminderEnabled
                  }
                  onChange={(event) =>
                    update("attendanceReminderTime", event.target.value)
                  }
                  className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className={`${activeSettingsTab === "general" ? "" : "hidden"} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-sky-600" />
          <h3 className="text-sm font-black text-slate-900">ביצועים ורענון</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="זמן Cache בדקות" hint="בין 1 ל־1,440 דקות">
            <input type="number" min={1} max={1440} value={draft.cacheMinutes} onChange={(e) => update("cacheMinutes", Number(e.target.value))} className="input" />
          </Field>
          <Field label="רענון אוטומטי בשניות" hint="בין 60 ל־3,600 שניות · מומלץ 300">
            <input type="number" min={60} max={3600} value={draft.autoRefreshSeconds} onChange={(e) => update("autoRefreshSeconds", Number(e.target.value))} className="input" />
          </Field>
        </div>
      </section>

      <section className={`${activeSettingsTab === "modes" || activeSettingsTab === "orders" ? "" : "hidden"} rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm`}>
        <div className={`${activeSettingsTab === "modes" ? "" : "hidden"} mb-4 flex items-center gap-2`}>
          <ShieldAlert className="h-5 w-5 text-amber-700" />
          <h3 className="text-sm font-black text-slate-900">מצבי מערכת</h3>
        </div>

        <div className="space-y-4">
          <div className={`${activeSettingsTab === "modes" ? "" : "hidden"} rounded-xl border border-red-200 bg-white p-4`}>
            <div className="text-xs font-black text-slate-900">מצב עבודה של המערכת</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { value: "routine", label: "שגרה", description: "עבודה רגילה" },
                { value: "operational", label: "מבצעי", description: "הדגשת נוכחות ומשמרות" },
                { value: "emergency", label: "חירום", description: "הפעלת מרכז חירום והקפצה" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSystemMode(option.value as SystemMode)}
                  className={`rounded-xl border p-3 text-right transition ${
                    draft.systemMode === option.value
                      ? option.value === "emergency"
                        ? "border-red-400 bg-red-50"
                        : option.value === "operational"
                        ? "border-orange-400 bg-orange-50"
                        : "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-black text-slate-900">{option.label}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{option.description}</div>
                </button>
              ))}
            </div>

            {draft.systemMode === "operational" && (
              <div className="mt-4">
                <Field label="הודעת מצב מבצעי">
                  <textarea
                    rows={2}
                    value={draft.operationalMessage}
                    onChange={(e) => update("operationalMessage", e.target.value)}
                    className="input resize-y"
                  />
                </Field>
              </div>
            )}

            {draft.systemMode === "emergency" && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="כותרת אירוע">
                  <input
                    value={draft.emergencyEvent.title}
                    onChange={(e) => updateEmergency("title", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="מיקום התייצבות">
                  <input
                    value={draft.emergencyEvent.assemblyLocation}
                    onChange={(e) => updateEmergency("assemblyLocation", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="שעת התייצבות">
                  <input
                    type="datetime-local"
                    value={draft.emergencyEvent.assemblyTime}
                    onChange={(e) => updateEmergency("assemblyTime", e.target.value)}
                    className="input"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="הודעת הקפצה">
                    <textarea
                      rows={4}
                      value={draft.emergencyEvent.message}
                      onChange={(e) => updateEmergency("message", e.target.value)}
                      className="input resize-y"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          <div className={`${activeSettingsTab === "modes" ? "" : "hidden"} rounded-xl border border-amber-200 bg-white p-4`}>
            <Toggle
              label="מצב תחזוקה מלא"
              description="חוסם את כל חלקי המערכת למשתמשים רגילים. מנהל האתר עדיין יכול להיכנס לניהול ולבטל את המצב."
              checked={draft.maintenanceMode}
              onChange={(value) => update("maintenanceMode", value)}
            />
            <div className="mt-4">
              <Field label="הודעת תחזוקה">
                <textarea
                  rows={3}
                  value={draft.maintenanceMessage}
                  onChange={(e) => update("maintenanceMessage", e.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>

            <RoleAccessGrid
              title="מי יכול להמשיך להשתמש באתר בזמן תחזוקה?"
              selectedRoles={draft.maintenanceAllowedRoles || []}
              onRoleChange={(role, checked) =>
                toggleAllowedRole("maintenanceAllowedRoles", role, checked)
              }
            />
          </div>

          <div className={`${activeSettingsTab === "modes" ? "" : "hidden"} rounded-xl border border-sky-200 bg-white p-4`}>
            <Toggle
              label="קבלת דיווחי נוכחות"
              description="כאשר האפשרות כבויה, לא ניתן להגיש דיווח נוכחות. ניתן לבחור למטה אילו טאבים אישיים יישארו זמינים לצפייה."
              checked={draft.reportingEnabled}
              onChange={(value) => update("reportingEnabled", value)}
            />
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">
                טאבים שיישארו זמינים כשהדיווחים סגורים
              </div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                אם לא ייבחר אף טאב, החייל יראה רק את הודעת הסגירה הקיימת.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {REPORTING_CLOSED_SECTION_OPTIONS.map((option) => {
                  const selected = (
                    draft.reportingClosedVisibleSections || []
                  ).includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                        selected
                          ? "border-sky-300 bg-sky-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          const current =
                            draft.reportingClosedVisibleSections || [];
                          update(
                            "reportingClosedVisibleSections",
                            event.target.checked
                              ? Array.from(new Set([...current, option.value]))
                              : current.filter((item) => item !== option.value)
                          );
                        }}
                        className="mt-0.5 h-4 w-4 accent-sky-600"
                      />
                      <span>
                        <span className="block text-xs font-black text-slate-800">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mt-4">
              <Field label="הודעה כאשר הדיווחים סגורים">
                <textarea
                  rows={3}
                  value={draft.reportingClosedMessage}
                  onChange={(e) => update("reportingClosedMessage", e.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>

            <RoleAccessGrid
              title="מי יכול עדיין לראות ולהשתמש בעמוד הדיווח כשהדיווחים סגורים?"
              selectedRoles={draft.reportingClosedAllowedRoles || []}
              onRoleChange={(role, checked) =>
                toggleAllowedRole(
                  "reportingClosedAllowedRoles",
                  role,
                  checked
                )
              }
            />
          </div>

          <div className={`${activeSettingsTab === "orders" ? "" : "hidden"} rounded-xl border border-blue-200 bg-white p-4 lg:col-span-2`}>
            <div className="text-sm font-black text-slate-900">ניהול צווים גדודיים</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              כל צו נשמר כאירוע נפרד. חייל שדיווח באותו יום „לא בצו” או
              „חיתוך צו” יוצג כמי שאינו בצו באותו יום.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="שם הצו">
                <input
                  value={newOrderTitle}
                  onChange={(e) => setNewOrderTitle(e.target.value)}
                  placeholder="לדוגמה: צו יולי 2026"
                  className="input"
                />
              </Field>
              <Field label="מיקום">
                <input
                  value={newOrderLocation}
                  onChange={(e) => setNewOrderLocation(e.target.value)}
                  placeholder="בסיס / אזור התייצבות"
                  className="input"
                />
              </Field>
              <Field label="תאריך התחלה">
                <input
                  type="date"
                  value={newOrderStartDate}
                  onChange={(e) => setNewOrderStartDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="תאריך סיום">
                <input
                  type="date"
                  min={newOrderStartDate || undefined}
                  value={newOrderEndDate}
                  onChange={(e) => setNewOrderEndDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label={`${getProcessingDayLabel(newOrderProcessingDays, newOrderProcessingDayType)} לאחר השירות`}>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={newOrderProcessingDays}
                  onChange={(e) =>
                    setNewOrderProcessingDays(
                      Math.max(0, Math.min(30, Number(e.target.value) || 0))
                    )
                  }
                  className="input"
                />
              </Field>
              <Field label="סוג הימים לאחר השירות">
                <select
                  value={newOrderProcessingDayType}
                  onChange={(e) =>
                    setNewOrderProcessingDayType(
                      e.target.value === "family" ? "family" : "processing"
                    )
                  }
                  className="input"
                >
                  <option value="processing">עיבוד</option>
                  <option value="family">משפחות</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="תאריך עלייה לאימון (אופציונלי)">
                <input
                  type="date"
                  value={newOrderTrainingStartDate}
                  onChange={(e) => setNewOrderTrainingStartDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="תאריך עלייה לקו (אופציונלי)">
                <input
                  type="date"
                  value={newOrderLineStartDate}
                  onChange={(e) => setNewOrderLineStartDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="תאריך סיום הקו (אופציונלי)">
                <input
                  type="date"
                  min={newOrderLineStartDate || undefined}
                  value={newOrderLineEndDate}
                  onChange={(e) => setNewOrderLineEndDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label={`${getProcessingDayLabel(newOrderProcessingDays, newOrderProcessingDayType)} – תאריך (אופציונלי)`}>
                <input
                  type="date"
                  value={newOrderProcessingDate}
                  onChange={(e) => setNewOrderProcessingDate(e.target.value)}
                  className="input"
                />
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="הערה לצו (אופציונלי)">
                  <textarea
                    rows={2}
                    value={newOrderNote}
                    onChange={(e) => setNewOrderNote(e.target.value)}
                    placeholder="לדוגמה: ירידה מהקו בתאריך..."
                    className="input resize-y"
                  />
                </Field>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-slate-800">
                    חריגים מימי {newOrderProcessingDayType === "family" ? "משפחות" : "עיבוד"}
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                    החיילים שייבחרו לא יקבלו את הימים האלה בחישוב האישי.
                  </p>
                </div>
                {newOrderProcessingExcludedUserIds.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">
                    {newOrderProcessingExcludedUserIds.length} חריגים
                  </span>
                )}
              </div>
              <input
                type="search"
                value={processingExclusionSearch}
                onChange={(event) =>
                  setProcessingExclusionSearch(event.target.value)
                }
                placeholder="חיפוש לפי שם, מספר אישי או יחידה..."
                className="input mt-3"
              />
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {processingExclusionUsers.length === 0 ? (
                  <div className="py-3 text-center text-[11px] font-bold text-slate-400">
                    לא נמצאו חיילים
                  </div>
                ) : (
                  processingExclusionUsers.map((user) => {
                    const checked =
                      newOrderProcessingExcludedUserIds.includes(user.userId);
                    return (
                      <label
                        key={user.userId}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setNewOrderProcessingExcludedUserIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, user.userId]))
                                : current.filter(
                                    (userId) => userId !== user.userId
                                  )
                            )
                          }
                          className="h-4 w-4 accent-amber-600"
                        />
                        <span>{user.fullName}</span>
                        <span className="text-[10px] text-slate-400">
                          {[user.personalId, user.unit]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-slate-800">
                    תאריכי סיום אישיים
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold leading-5 text-slate-500">
                    לחייל שמשתחרר לפני סיום הצו הגדודי ניתן להזין תאריך
                    תאריך התחלה ו/או סיום אישיים. ימי ההתרעננות מתחילים מיד
                    לאחר הסיום האישי. ימי עיבוד
                    וימי משפחות מוזנים בנפרד עם כמות ותאריך ואינם דוחים את
                    ההתרעננות.
                  </p>
                </div>
                {Object.values(newOrderPersonalEndDates).filter(Boolean)
                  .length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-800">
                    {
                      Object.values(newOrderPersonalEndDates).filter(Boolean)
                        .length
                    }{" "}
                    סיומים אישיים
                  </span>
                )}
              </div>
              <div className="relative mt-3">
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={personalEndDateSearch}
                    onFocus={() => setPersonalOrderPickerOpen(true)}
                    onChange={(event) => {
                      setPersonalEndDateSearch(event.target.value);
                      setSelectedPersonalOrderUserId(null);
                      setPersonalOrderPickerOpen(true);
                    }}
                    placeholder="חיפוש ובחירת חייל לפי שם, מספר אישי או יחידה..."
                    className="input"
                    role="combobox"
                    aria-expanded={personalOrderPickerOpen}
                  />
                  {selectedPersonalOrderUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPersonalOrderUserId(null);
                        setPersonalEndDateSearch("");
                        setPersonalOrderPickerOpen(true);
                      }}
                      className="min-w-max rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                    >
                      בחר חייל אחר
                    </button>
                  )}
                </div>
                {personalOrderPickerOpen && !selectedPersonalOrderUser && (
                  <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    {personalEndDateUsers.length === 0 ? (
                      <div className="px-3 py-4 text-center text-[11px] font-bold text-slate-400">
                        לא נמצאו חיילים
                      </div>
                    ) : (
                      personalEndDateUsers.slice(0, 30).map((user) => (
                        <button
                          key={user.userId}
                          type="button"
                          onClick={() => {
                            setSelectedPersonalOrderUserId(user.userId);
                            setPersonalEndDateSearch(user.fullName);
                            setPersonalOrderPickerOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-right hover:bg-blue-50"
                        >
                          <span className="text-xs font-black text-slate-700">
                            {user.fullName}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {[user.personalId, user.unit]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                {!selectedPersonalOrderUser ? (
                  <div className="py-5 text-center text-[11px] font-bold text-slate-400">
                    יש לבחור חייל כדי לפתוח את פרטי התקופה והזכאויות שלו
                  </div>
                ) : (
                  [selectedPersonalOrderUser].map((user) => (
                    <div
                      key={user.userId}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-slate-100 px-2 py-2 hover:bg-slate-50 sm:grid-cols-[minmax(180px,1fr)_170px_170px] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black text-slate-700">
                          {user.fullName}
                        </div>
                        <div className="truncate text-[10px] font-bold text-slate-400">
                          {[user.personalId, user.unit]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <label className="space-y-1 text-[10px] font-black text-slate-500">
                        תחילת צו אישית
                        <input
                          type="date"
                          min={newOrderStartDate || undefined}
                          max={
                            newOrderPersonalEndDates[user.userId] ||
                            newOrderEndDate ||
                            undefined
                          }
                          value={newOrderPersonalStartDates[user.userId] || ""}
                          onChange={(event) => {
                            const dateValue = event.target.value;
                            setNewOrderPersonalStartDates((current) => {
                              if (!dateValue) {
                                const next = { ...current };
                                delete next[user.userId];
                                return next;
                              }
                              return { ...current, [user.userId]: dateValue };
                            });
                          }}
                          className="input mt-1"
                          aria-label={`תאריך תחילת צו אישי עבור ${user.fullName}`}
                        />
                      </label>
                      <label className="space-y-1 text-[10px] font-black text-slate-500">
                        סיום צו אישי
                        <input
                          type="date"
                          min={
                            newOrderPersonalStartDates[user.userId] ||
                            newOrderStartDate ||
                            undefined
                          }
                          max={newOrderEndDate || undefined}
                          value={newOrderPersonalEndDates[user.userId] || ""}
                          onChange={(event) => {
                            const dateValue = event.target.value;
                            setNewOrderPersonalEndDates((current) => {
                              if (!dateValue) {
                                const next = { ...current };
                                delete next[user.userId];
                                return next;
                              }
                              return { ...current, [user.userId]: dateValue };
                            });
                          }}
                          className="input mt-1"
                          aria-label={`תאריך סיום אישי עבור ${user.fullName}`}
                        />
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:col-span-3 lg:grid-cols-2">
                        {(
                          [
                            ["processing", "ימי עיבוד"],
                            ["family", "ימי משפחות"],
                          ] as const
                        ).map(([benefitKey, label]) => {
                          const daysKey = `${benefitKey}Days` as
                            | "processingDays"
                            | "familyDays";
                          const dateKey = `${benefitKey}Date` as
                            | "processingDate"
                            | "familyDate";
                          const benefit =
                            newOrderPersonalProcessingBenefits[user.userId] ||
                            {};
                          return (
                            <div
                              key={benefitKey}
                              className="grid grid-cols-[110px_1fr] gap-2 rounded-lg bg-slate-50 p-2"
                            >
                              <label className="col-span-2 text-[10px] font-black text-slate-600">
                                {label} אישיים
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                placeholder="כמות"
                                value={benefit[daysKey] || ""}
                                onChange={(event) => {
                                  const days = Math.max(
                                    0,
                                    Math.min(
                                      30,
                                      Math.round(Number(event.target.value)) || 0
                                    )
                                  );
                                  setNewOrderPersonalProcessingBenefits(
                                    (current) => {
                                      const nextBenefit = {
                                        ...(current[user.userId] || {}),
                                        [daysKey]: days || undefined,
                                      };
                                      return {
                                        ...current,
                                        [user.userId]: nextBenefit,
                                      };
                                    }
                                  );
                                }}
                                className="input"
                                aria-label={`כמות ${label} עבור ${user.fullName}`}
                              />
                              <input
                                type="date"
                                value={benefit[dateKey] || ""}
                                onChange={(event) =>
                                  setNewOrderPersonalProcessingBenefits(
                                    (current) => ({
                                      ...current,
                                      [user.userId]: {
                                        ...(current[user.userId] || {}),
                                        [dateKey]:
                                          event.target.value || undefined,
                                      },
                                    })
                                  )
                                }
                                className="input"
                                aria-label={`תאריך ${label} עבור ${user.fullName}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-500">
              את מספר ימי העיבוד מזינים בנפרד לכל צו. ימי ההתרעננות מחושבים אוטומטית לפי ימי השירות בפועל: 10–14: 2,
              15–28: 3, 29–42: 5, 43–56: 7, 57 ומעלה: 9. שישי ושבת
              נספרים יחד כיום אחד גם בימי העיבוד וגם בימי ההתרעננות.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveOrderEvent}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700"
              >
                {editingOrderId ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingOrderId ? "עדכן צו קיים" : "פתח צו חדש"}
              </button>
              {editingOrderId && (
                <button
                  type="button"
                  onClick={resetOrderForm}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50"
                >
                  ביטול עריכה
                </button>
              )}
            </div>

            <div className="mt-5 border-t border-blue-100 pt-4">
              <div className="mb-2 text-xs font-black text-slate-700">היסטוריית צווים</div>
              {(draft.orderEvents || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400">
                  טרם נפתחו צווים במערכת
                </div>
              ) : (
                <div className="space-y-2">
                  {[...(draft.orderEvents || [])]
                    .sort((a, b) => b.startDate.localeCompare(a.startDate))
                    .map((order) => (
                      <div
                        key={order.id}
                        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="text-xs font-black text-slate-800">{order.title}</div>
                          <div className="mt-1 text-[11px] font-bold text-slate-500">
                            {new Date(`${order.startDate}T12:00:00`).toLocaleDateString("he-IL")} –{" "}
                            {new Date(`${order.endDate}T12:00:00`).toLocaleDateString("he-IL")}
                            {order.location ? ` · ${order.location}` : ""}
                            {` · ${order.processingDays ?? 3} ${getProcessingDayLabel(
                              order.processingDays ?? 3,
                              order.processingDayType || "processing"
                            )}`}
                          </div>
                          {[
                            ["עלייה לאימון", order.trainingStartDate],
                            ["עלייה לקו", order.lineStartDate],
                            ["סיום הקו", order.lineEndDate],
                            [
                              getProcessingDayLabel(
                                order.processingDays ?? 3,
                                order.processingDayType || "processing"
                              ),
                              order.processingDate,
                            ],
                          ]
                            .filter(([, value]) => Boolean(value))
                            .map(([label, value]) => (
                              <div
                                key={label}
                                className="mt-1 text-[11px] font-bold text-slate-500"
                              >
                                {label}: {new Date(`${value}T12:00:00`).toLocaleDateString("he-IL")}
                              </div>
                            ))}
                          {order.note && (
                            <div className="mt-1 whitespace-pre-wrap text-[11px] font-bold text-slate-600">
                              הערה: {order.note}
                            </div>
                          )}
                          {(order.processingExcludedUserIds?.length || 0) > 0 && (
                            <div className="mt-1 text-[11px] font-bold text-amber-700">
                              חריגים מימי{" "}
                              {order.processingDayType === "family"
                                ? "משפחות"
                                : "עיבוד"}
                              : {order.processingExcludedUserIds?.length}
                            </div>
                          )}
                          {Object.keys(order.personalEndDates || {}).length > 0 && (
                            <div className="mt-1 text-[11px] font-bold text-blue-700">
                              תאריכי סיום אישיים: {Object.keys(order.personalEndDates || {}).length}
                            </div>
                          )}
                          {Object.keys(order.personalStartDates || {}).length > 0 && (
                            <div className="mt-1 text-[11px] font-bold text-blue-700">
                              תאריכי התחלה אישיים: {Object.keys(order.personalStartDates || {}).length}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editOrderEvent(order)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-black text-blue-700 hover:bg-blue-50"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            ערוך
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOrderEvent(order.id)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            מחק
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className={`${activeSettingsTab === "modes" ? "" : "hidden"} rounded-xl border border-indigo-200 bg-white p-4`}>
            <Toggle
              label="מסך משמרות פעיל"
              description="כאשר האפשרות כבויה, לשונית המשמרות נשארת מוצגת אך תוכן המסך מוחלף בהודעה שהוגדרה."
              checked={draft.shiftsEnabled}
              onChange={(value) => update("shiftsEnabled", value)}
            />
            <div className="mt-4">
              <Field label="הודעה כאשר מסך המשמרות סגור">
                <textarea
                  rows={3}
                  value={draft.shiftsClosedMessage}
                  onChange={(e) => update("shiftsClosedMessage", e.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}

      <section className={`${activeSettingsTab === "whatsapp" ? "" : "hidden"} rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                קבוצות WhatsApp
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                שמור שמות וקישורים לקבוצות. בעת שיתוף לוח משמרות ניתן
                לבחור קבוצה, לפתוח WhatsApp כללי או להעתיק את ההודעה.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={addWhatsAppGroup}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            הוסף קבוצה
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {(draft.whatsappGroups || []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs font-bold text-slate-400">
              לא הוגדרו קבוצות WhatsApp.
            </div>
          ) : (
            (draft.whatsappGroups || [])
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
                    <Field label="שם הקבוצה">
                      <input
                        value={group.name}
                        onChange={(event) =>
                          updateWhatsAppGroup(group.id, {
                            name: event.target.value,
                          })
                        }
                        className="input"
                        placeholder='לדוגמה: קבוצת תאג"ד'
                      />
                    </Field>

                    <Field label="קישור לקבוצה">
                      <input
                        value={group.link}
                        onChange={(event) =>
                          updateWhatsAppGroup(group.id, {
                            link: event.target.value,
                          })
                        }
                        className="input"
                        placeholder="https://chat.whatsapp.com/..."
                        dir="ltr"
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => removeWhatsAppGroup(group.id)}
                      className="flex h-10 items-center justify-center rounded-xl border border-rose-200 px-3 text-rose-700 hover:bg-rose-50"
                      title="מחיקת קבוצה"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={group.enabled}
                        onChange={(event) =>
                          updateWhatsAppGroup(group.id, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                      קבוצה פעילה
                    </label>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        name="default_whatsapp_group"
                        checked={group.isDefault}
                        onChange={() =>
                          updateWhatsAppGroup(group.id, {
                            isDefault: true,
                          })
                        }
                      />
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      קבוצת ברירת מחדל
                    </label>
                  </div>
                </div>
              ))
          )}
        </div>

        <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[10px] font-bold leading-5 text-amber-800">
          בדפדפן לא ניתן להזין טקסט ישירות לתוך קבוצה דרך קישור הזמנה.
          לכן בעת בחירת קבוצה ההודעה תועתק ללוח והקבוצה תיפתח; לאחר מכן
          מדביקים את ההודעה בשדה השליחה.
        </div>
      </section>

      {isDirty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          קיימים שינויים שטרם נשמרו. הרענון האוטומטי לא ידרוס אותם.
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "שומר..." : "שמור והחל הגדרות"}
        </button>
      </div>

      <style>{`.input{width:100%;border-radius:.75rem;border:1px solid rgb(226 232 240);background:white;padding:.7rem .85rem;font-size:.8rem;outline:none}.input:focus{border-color:rgb(139 92 246);box-shadow:0 0 0 2px rgb(237 233 254)}`}</style>
    </div>
  );
}

function RoleAccessGrid({
  title,
  selectedRoles,
  onRoleChange,
}: {
  title: string;
  selectedRoles: SystemRole[];
  onRoleChange: (role: SystemRole, checked: boolean) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-xs font-black text-slate-800">{title}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SYSTEM_ROLE_OPTIONS.map((option) => {
          const checked = selectedRoles.includes(option.value);

          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                checked
                  ? "border-violet-300 bg-violet-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onRoleChange(option.value, event.target.checked)
                }
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span>
                <span className="block text-xs font-black text-slate-800">
                  {option.label}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {selectedRoles.length === 0 && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
          אף תפקיד לא מורשה כרגע.
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}</label>;
}

function Toggle({ label, description, checked, disabled = false, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={`flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}><div><div className="text-xs font-black text-slate-800">{label}</div>{description && <div className="mt-1 text-[10px] text-slate-500">{description}</div>}</div><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-violet-600" /></label>;
}
