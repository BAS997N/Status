export type UserRole =
  | "soldier"
  | "commander"
  | "adjutant_officer";

export type SystemRole =
  | "super_admin"
  | "admin"
  | "viewer"
  | "reporter";

export interface PermissionDefinition {
  id: string;
  label: string;
  description?: string;
  category?: string;
  enabled: boolean;
  sortOrder: number;
}

export interface RolePermissionConfig {
  systemRole: SystemRole;
  permissions: Record<string, boolean>;
  updatedAt?: string;
  updatedBy?: string;
}


export interface UnitConfig {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  systemUnit?: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}


export interface MedicalRoleConfig {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}




export type DefaultStartScreen = "reporter" | "dashboard";

export interface SystemSettingsConfig {
  systemName: string;
  unitName: string;
  footerText: string;
  systemVersion: string;
  timeZone: string;
  defaultStartScreen: DefaultStartScreen;
  notificationsEnabled: boolean;
  toastNotificationsEnabled: boolean;
  notificationSoundEnabled: boolean;
  cacheMinutes: number;
  autoRefreshSeconds: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  attendanceReportingEnabled: boolean;
  attendanceReportingDisabledMessage: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type GoogleSheetsSyncStatus = "success" | "partial" | "error" | "idle";

export interface GoogleSheetsSyncHistoryItem {
  id: string;
  startedAt: string;
  completedAt: string;
  startDate?: string;
  endDate?: string;
  sentCount: number;
  failedCount: number;
  foundCount?: number;
  skippedCount?: number;
  skippedReasons?: Record<string, number>;
  durationMs: number;
  status: Exclude<GoogleSheetsSyncStatus, "idle">;
  errorMessage?: string;
}

export interface GoogleSheetsSyncResult {
  status: Exclude<GoogleSheetsSyncStatus, "idle">;
  sentCount: number;
  failedCount: number;
  foundCount?: number;
  skippedCount?: number;
  skippedReasons?: Record<string, number>;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  startDate?: string;
  endDate?: string;
  errorMessage?: string;
}

export interface GoogleSheetsConfig {
  enabled: boolean;
  webAppUrl: string;
  spreadsheetName?: string;
  lastTestAt?: string;
  lastTestStatus?: "success" | "error" | "idle";
  lastTestMessage?: string;
  lastSyncAt?: string;
  lastSyncStatus?: GoogleSheetsSyncStatus;
  lastSyncStartDate?: string;
  lastSyncEndDate?: string;
  lastSyncSentCount?: number;
  lastSyncFailedCount?: number;
  lastSyncFoundCount?: number;
  lastSyncSkippedCount?: number;
  lastSyncSkippedReasons?: Record<string, number>;
  lastSyncDurationMs?: number;
  lastSyncError?: string;
  syncHistory?: GoogleSheetsSyncHistoryItem[];
  updatedAt?: string;
  updatedBy?: string;
}


export type AuditAction = "create" | "update" | "delete" | "sync" | "reset";
export type AuditModule =
  | "users"
  | "permissions"
  | "attendance_statuses"
  | "units"
  | "medical_roles"
  | "google_sheets"
  | "reports"
  | "system_settings";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  module: AuditModule;
  actorId: string;
  actorName: string;
  actorRole?: string;
  targetId?: string;
  targetLabel?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  fullName: string;
  role: UserRole;
  unit: string;
  email: string;
  createdAt: string;
  personalId?: string;
  phoneNumber?: string;
  isDischarged?: boolean;
  className?: string;
  medicalRole?: string;
  systemRole?: SystemRole;
}

/*
 * הסטטוסים המובנים של המערכת.
 * בעתיד יהיה אפשר להוסיף סטטוסים דרך מסך ההגדרות
 * בלי להוסיף אותם ידנית לכאן.
 */
export type BuiltInAttendanceStatus =
  | "base"
  | "home"
  | "field"
  | "sick"
  | "course"
  | "other"
  | "cut_order"
  | "not_on_order"
  | "processing_days"
  | "refresh_days";

/*
 * מאפשר גם סטטוסים דינמיים חדשים שיישמרו ב־Firestore.
 *
 * החלק `(string & {})` משאיר השלמה אוטומטית
 * לסטטוסים המובנים, אך אינו מגביל אותנו רק אליהם.
 */
export type AttendanceStatus =
  | BuiltInAttendanceStatus
  | (string & {});

export type AttendanceChartCategory =
  | "present"
  | "absent"
  | "medical"
  | "administrative"
  | "not_on_order"
  | "neutral"
  | "exclude";

/*
 * מבנה ההגדרות של כל סטטוס.
 */
export interface AttendanceStatusConfig {
  /*
   * מזהה פנימי קבוע באנגלית.
   * לדוגמה: processing_days
   */
  id: string;

  /*
   * שם שמוצג באתר.
   * לדוגמה: ימי עיבוד
   */
  label: string;

  /*
   * האם הסטטוס פעיל במערכת.
   */
  enabled: boolean;

  /*
   * האם חייל יכול לראות ולבחור את הסטטוס.
   */
  visibleToSoldiers: boolean;

  /*
   * האם מפקד יכול לראות ולבחור את הסטטוס.
   */
  visibleToCommanders: boolean;

  /*
   * סדר ההצגה ברשימות.
   */
  sortOrder: number;

  /*
   * סטטוס מערכת מוגן לא יהיה ניתן למחיקה מלאה.
   */
  systemStatus: boolean;

  /*
   * עיצוב הסטטוס במערכת.
   */
  color: string;
  bg: string;
  border: string;

  /*
   * מפתח צבע פשוט לשימוש עתידי במסך ההגדרות.
   */
  colorKey?: string;

  /*
   * האם יש לחייב הערה בעת בחירת הסטטוס.
   */
  requiresNote?: boolean;

  icon?: string;
  description?: string;
  customColor?: string;
  chartCategory?: AttendanceChartCategory;
  exportToSheets?: boolean;
  requiresGps?: boolean;
  requiresDateRange?: boolean;
  requiresPhoto?: boolean;
  requiresCommanderApproval?: boolean;

  /*
   * מי יצר או עדכן את הסטטוס.
   */
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AttendanceReport {
  reportId: string;
  userId: string;
  userName: string;
  unit: string;
  status: AttendanceStatus;
  location: string;

  latitude?: number;
  longitude?: number;

  timestamp: string;
  reportDate?: string;
  updatedAt?: string;

  note?: string;

  verifiedBy?: string;
  verifiedAt?: string;

  createdBy?: string;
  createdByName?: string;
  createdByRole?: UserRole | string;

  updatedBy?: string;
  updatedByName?: string;
  updatedByRole?: UserRole | string;

  dayMarker?:
    | "return_to_base"
    | "exit_home"
    | "after_hours";

  afterHours?: number;

  isReset?: boolean;
  resetAt?: string;
  resetBy?: string;
  resetByName?: string;

  personalId?: string;
}

export interface AppNotification {
  notificationId: string;
  reportId: string;
  userId: string;
  soldierName: string;
  unit: string;
  status: AttendanceStatus;
  location: string;
  timestamp: string;
  reportTimestamp?: string;
  reportDate?: string;
  isRead: boolean;
  message: string;
}

/*
 * ברירת המחדל של כל הסטטוסים.
 *
 * המערך הזה ישמש רק כאשר עדיין אין הגדרה ב־Firestore,
 * או כאשר המערכת עובדת במצב מקומי.
 */
export const DEFAULT_ATTENDANCE_STATUS_CONFIGS:
  AttendanceStatusConfig[] = [
  {
    id: "base",
    icon: "🟢",
    chartCategory: "present",
    exportToSheets: true,
    label: "בבסיס",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 1,
    systemStatus: true,
    colorKey: "emerald",
    color:
      "text-emerald-700 dark:text-emerald-300",
    bg:
      "bg-emerald-50 dark:bg-emerald-950/40",
    border:
      "border-emerald-200 dark:border-emerald-800/60",
  },
  {
    id: "home",
    icon: "🏠",
    chartCategory: "absent",
    exportToSheets: true,
    label: "בבית / אפטר",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 2,
    systemStatus: true,
    colorKey: "indigo",
    color:
      "text-indigo-700 dark:text-indigo-300",
    bg:
      "bg-indigo-50 dark:bg-indigo-950/40",
    border:
      "border-indigo-200 dark:border-indigo-800/60",
  },
  {
    id: "field",
    icon: "🌲",
    chartCategory: "present",
    exportToSheets: true,
    label: "פעילות שטח / אימון",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 3,
    systemStatus: true,
    colorKey: "amber",
    color:
      "text-amber-700 dark:text-amber-300",
    bg:
      "bg-amber-50 dark:bg-amber-950/40",
    border:
      "border-amber-200 dark:border-amber-800/60",
  },
  {
    id: "sick",
    icon: "🚑",
    chartCategory: "medical",
    exportToSheets: true,
    label: "גימלים / חולים",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 4,
    systemStatus: true,
    colorKey: "rose",
    color:
      "text-rose-700 dark:text-rose-300",
    bg:
      "bg-rose-50 dark:bg-rose-950/40",
    border:
      "border-rose-200 dark:border-rose-800/60",
  },
  {
    id: "course",
    icon: "📚",
    chartCategory: "present",
    exportToSheets: true,
    label: "קורס / הכשרה",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 5,
    systemStatus: true,
    colorKey: "cyan",
    color:
      "text-cyan-700 dark:text-cyan-300",
    bg:
      "bg-cyan-50 dark:bg-cyan-950/40",
    border:
      "border-cyan-200 dark:border-cyan-800/60",
  },
  {
    id: "cut_order",
    icon: "✂️",
    chartCategory: "administrative",
    exportToSheets: true,
    label: "חיתוך צו",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 6,
    systemStatus: true,
    colorKey: "red",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  {
    id: "not_on_order",
    icon: "⛔",
    chartCategory: "not_on_order",
    exportToSheets: true,
    label: "לא בצו",
    enabled: true,
    visibleToSoldiers: false,
    visibleToCommanders: true,
    sortOrder: 7,
    systemStatus: true,
    colorKey: "orange",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  {
    id: "processing_days",
    icon: "📅",
    chartCategory: "administrative",
    exportToSheets: true,
    label: "ימי עיבוד",
    enabled: true,
    visibleToSoldiers: false,
    visibleToCommanders: true,
    sortOrder: 8,
    systemStatus: false,
    colorKey: "purple",
    color:
      "text-purple-700 dark:text-purple-300",
    bg:
      "bg-purple-50 dark:bg-purple-950/40",
    border:
      "border-purple-200 dark:border-purple-800/60",
  },
  {
    id: "refresh_days",
    icon: "☕",
    chartCategory: "administrative",
    exportToSheets: true,
    label: "ימי התרעננות",
    enabled: true,
    visibleToSoldiers: false,
    visibleToCommanders: true,
    sortOrder: 9,
    systemStatus: false,
    colorKey: "sky",
    color:
      "text-sky-700 dark:text-sky-300",
    bg:
      "bg-sky-50 dark:bg-sky-950/40",
    border:
      "border-sky-200 dark:border-sky-800/60",
  },
  {
    id: "other",
    icon: "📌",
    chartCategory: "neutral",
    exportToSheets: true,
    label: "אחר (ראה הערה)",
    enabled: true,
    visibleToSoldiers: true,
    visibleToCommanders: true,
    sortOrder: 10,
    systemStatus: true,
    colorKey: "slate",
    requiresNote: true,
    color:
      "text-slate-600 dark:text-slate-300",
    bg:
      "bg-slate-50 dark:bg-slate-950/40",
    border:
      "border-slate-200 dark:border-slate-800/60",
  },
];

/*
 * תאימות לקוד הקיים.
 *
 * רכיבים שכבר משתמשים ב־ATTENDANCE_STATUS_LABELS
 * ימשיכו לעבוד כרגיל.
 */
export const ATTENDANCE_STATUS_LABELS:
  Record<
    string,
    {
      label: string;
      color: string;
      bg: string;
      border: string;
    }
  > = Object.fromEntries(
  DEFAULT_ATTENDANCE_STATUS_CONFIGS.map(
    (status) => [
      status.id,
      {
        label: status.label,
        color: status.color,
        bg: status.bg,
        border: status.border,
      },
    ]
  )
);

export const IDF_UNITS = [
  "פלוגה א' - רובאית",
  "פלוגה ב' - חבלה",
  "פלוגה ג' - מסייעת",
  "מפקדה ורווחה",
  "סגל ופיקוד גדוד",
  "יחידת קשר (קשר״ג)",
  "חוליית רפואה",
  "מחלקת טנא (חמוש)",
];

export const DEFAULT_UNIT_CONFIGS: UnitConfig[] = IDF_UNITS.map(
  (name, index) => ({
    id: `unit_${index + 1}`,
    name,
    enabled: true,
    sortOrder: index + 1,
    systemUnit: index === 0,
  })
);


export const DEFAULT_MEDICAL_ROLE_NAMES = [
  "רופא/ה צבאי/ת",
  "פרמדיק/ית",
  "חובש/ת",
  "סניטר/ית",
  "נהג/ת אמבולנס",
  "אח/ות צבאי/ת",
  "מפקד/ת תאג״ד",
  "חייל/ת מדווח/ת",
];

export const DEFAULT_MEDICAL_ROLE_CONFIGS: MedicalRoleConfig[] =
  DEFAULT_MEDICAL_ROLE_NAMES.map((name, index) => ({
    id: `medical_role_${index + 1}`,
    name,
    enabled: true,
    sortOrder: index + 1,
  }));
