export type UserRole =
  | "soldier"
  | "commander"
  | "adjutant_officer";

export type BuiltInSystemRole =
  | "super_admin"
  | "admin"
  | "viewer"
  | "reporter";

/**
 * Built-in roles keep their existing IDs, while custom roles may use any
 * stable string ID created from the system administration screen.
 */
export type SystemRole = BuiltInSystemRole | (string & {});

export type SystemRoleAccessLevel = "admin" | "viewer" | "reporter";

export interface SystemRoleConfig {
  id: SystemRole;
  name: string;
  description: string;
  accessLevel: SystemRoleAccessLevel;
  enabled: boolean;
  protected: boolean;
  sortOrder: number;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

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

export type SystemMode = "routine" | "operational" | "emergency";

export type EmergencyResponseStatus =
  | "acknowledged"
  | "on_the_way"
  | "arrived"
  | "unavailable"
  | "needs_help";

export interface EmergencyResponse {
  responseId: string;
  eventId?: string;
  eventTitle?: string;
  authUid?: string;
  userId: string;
  userName: string;
  personalId?: string;
  status: EmergencyResponseStatus;
  note?: string;
  updatedAt: string;
  markedByUserId?: string;
  markedByName?: string;
  history?: Array<{
    status: EmergencyResponseStatus;
    note?: string;
    markedAt: string;
    markedByUserId?: string;
    markedByName?: string;
  }>;
}

export interface EmergencyEventConfig {
  active: boolean;
  eventId: string;
  title: string;
  message: string;
  assemblyLocation: string;
  assemblyTime: string;
  activatedAt?: string;
  activatedBy?: string;
  activatedByName?: string;
  previousSystemMode?: Exclude<SystemMode, "emergency">;
  closedAt?: string;
  closedBy?: string;
}

export interface WhatsAppGroupConfig {
  id: string;
  name: string;
  link: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface OrderEventConfig {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  processingDays?: number;
  processingDayType?: "processing" | "family";
  trainingStartDate?: string;
  lineStartDate?: string;
  lineEndDate?: string;
  processingDate?: string;
  processingExcludedUserIds?: string[];
  personalStartDates?: Record<string, string>;
  personalEndDates?: Record<string, string>;
  personalProcessingBenefits?: Record<
    string,
    {
      processingDays?: number;
      processingDate?: string;
      familyDays?: number;
      familyDate?: string;
    }
  >;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export type LineCycleStatus = "open" | "closed" | "archived";

export interface LineCycle {
  cycleId: string;
  title: string;
  startDate: string;
  endDate: string;
  submissionDeadline?: string;
  googleSheetTabName?: string;
  status: LineCycleStatus;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface LineConstraint {
  constraintId: string;
  cycleId: string;
  userId: string;
  userName: string;
  unit: string;
  unavailableDates: string[];
  periods?: LineConstraintPeriod[];
  notesByDate?: Record<string, string>;
  note?: string;
  submittedAt: string;
  updatedAt: string;
}

export type LineConstraintPriority =
  | "request"
  | "preferred"
  | "required";

export interface LineConstraintPeriod {
  periodId: string;
  startDate: string;
  endDate: string;
  priority: LineConstraintPriority;
  note?: string;
}

// Planning statuses are sourced from the dynamic attendance-status settings.
// Keep this open-ended so newly configured statuses can be used without a code change.
export type LinePresenceStatus = string;

export interface LinePresencePlan {
  planId: string;
  cycleId: string;
  userId: string;
  userName: string;
  unit: string;
  dates: Record<string, LinePresenceStatus>;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export interface LinePlanCommanderNotes {
  noteId: string;
  cycleId: string;
  userId: string;
  userName: string;
  notesByDate: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export type ReportingClosedVisibleSection =
  | "shifts"
  | "planning"
  | "order"
  | "messages";

export type OperationalResourceType = "hospital" | "helipad";

export interface OperationalResourceConfig {
  id: string;
  name: string;
  type: OperationalResourceType;
  enabled: boolean;
  sortOrder: number;
}

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
  attendanceReminderEnabled: boolean;
  attendanceReminderTime: string;
  registrationNotificationRecipientPersonalIds: string[];
  cacheMinutes: number;
  autoRefreshSeconds: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceAllowedRoles: SystemRole[];
  reportingEnabled: boolean;
  reportingClosedMessage: string;
  reportingClosedAllowedRoles: SystemRole[];
  reportingClosedVisibleSections: ReportingClosedVisibleSection[];
  orderEvents: OrderEventConfig[];
  linePlanningVisibleToSoldiers?: boolean;
  shiftsEnabled: boolean;
  shiftsClosedMessage: string;
  systemMode: SystemMode;
  operationalMessage: string;
  emergencyEvent: EmergencyEventConfig;
  whatsappGroups: WhatsAppGroupConfig[];
  adminTabOrder: string[];
  mainTabOrder: string[];
  operationalResources?: OperationalResourceConfig[];
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


export type AuditAction = "create" | "update" | "delete" | "sync" | "reset" | "backup" | "restore" | "acknowledge";
export type AuditModule =
  | "users"
  | "permissions"
  | "attendance_statuses"
  | "units"
  | "medical_roles"
  | "google_sheets"
  | "reports"
  | "system_settings"
  | "backups"
  | "shifts"
  | "line_planning";

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


export type BackupSection =
  | "users"
  | "attendance"
  | "attendance_logs"
  | "notifications"
  | "settings"
  | "system_logs"
  | "shifts"
  | "shift_acknowledgements"
  | "external_staff"
  | "emergency_responses"
  | "commander_messages";

export interface BackupDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface SystemBackupFile {
  format: "idf-attendance-backup";
  formatVersion: 1;
  createdAt: string;
  createdBy?: string;
  systemVersion?: string;
  projectId?: string;
  sections: Partial<Record<BackupSection, BackupDocument[]>>;
  counts: Partial<Record<BackupSection, number>>;
}

export interface BackupRestoreResult {
  restoredSections: BackupSection[];
  restoredDocuments: number;
  skippedDocuments: number;
  completedAt: string;
}







export interface ExternalStaffMember {
  id: string;
  fullName: string;
  staffType: string;
  phoneNumber?: string;
  note?: string;
  enabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}



export interface ShiftTypeConfig {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  defaultStartTime?: string;
  defaultEndTime?: string;
  crossesMidnight?: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ShiftSlotConfig {
  id: string;
  name: string;
  quantity: number;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
  allowedMedicalRoleIds: string[];
  allowedSystemRoles: SystemRole[];
  /** סטטוסי הנוכחות שמאפשרים שיבוץ לתפקיד זה. ברירת המחדל היא בבסיס בלבד. */
  allowedAttendanceStatusIds?: string[];
  allowedUserIds?: string[];
  allowSystemUsers?: boolean;
  allowDischargedUsers?: boolean;
  allowExternalStaff?: boolean;
  allowedExternalStaffTypes?: string[];
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type ShiftStatus = "draft" | "published" | "scheduled" | "cancelled";
export type ShiftReadStatus = "unread" | "read";

export interface ShiftAssignment {
  slotId?: string;
  slotLabel?: string;
  assigneeType?: "user" | "external";
  externalStaffId?: string;
  userId: string;
  userName: string;
  personalId?: string;
  unit?: string;
  medicalRole?: string;
  readStatus?: ShiftReadStatus;
  readAt?: string;
  replacementTime?: string;
}

export interface ShiftRecord {
  shiftId: string;
  title: string;
  shiftType: string;
  startAt: string;
  endAt: string;
  location?: string;
  note?: string;
  specialActivity?: boolean;
  dispatchTime?: string;
  specialActivityEndTime?: string;
  specialForceCommanderUserId?: string;
  specialForceCommanderName?: string;
  specialEventManagerUserId?: string;
  specialEventManagerName?: string;
  hospitalIds?: string[];
  helipadIds?: string[];
  status: ShiftStatus;
  sendPushOnPublish?: boolean;
  signupRequestsEnabled?: boolean;
  signupRequestsLocked?: boolean;
  assignments: ShiftAssignment[];
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface ShiftSignupRequest {
  requestId: string;
  shiftId: string;
  shiftTitle: string;
  shiftStartAt: string;
  userId: string;
  userName: string;
  personalId?: string;
  unit?: string;
  medicalRole?: string;
  createdAt: string;
}

export interface PushDeviceStatus {
  subscriptionId: string;
  userId: string;
  enabled: boolean;
  platform?: string;
  userAgent?: string;
  standalone?: boolean;
  updatedAt?: string;
}

export interface PwaInstallationStatus {
  installationId: string;
  userId: string;
  deviceId: string;
  platform?: string;
  userAgent?: string;
  installed: boolean;
  lastOpenedAt?: string;
}

export interface UserProfile {
  userId: string;
  fullName: string;
  role: UserRole;
  unit: string;
  email: string;
  recoveryEmail?: string;
  recoveryEmailVerified?: boolean;
  createdAt: string;
  personalId?: string;
  phoneNumber?: string;
  isDischarged?: boolean;
  systemAccessBlocked?: boolean;
  systemAccessBlockedAt?: string;
  systemAccessBlockedBy?: string;
  className?: string;
  medicalRole?: string;
  systemRole?: SystemRole;
  systemRoleAccessLevel?: SystemRoleAccessLevel;
  disciplinaryRestriction?: {
    type: "rasar_duty";
    enabled: boolean;
    startDate: string;
    endDate?: string;
    requiredDays: number;
    allowManagerShiftAssignment?: boolean;
    note?: string;
    createdAt?: string;
    updatedAt?: string;
  };
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
  numericRosterCode?: string;
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
  type?: "attendance" | "registration";
  recipientPersonalIds?: string[];
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

export type CommanderMessageTarget = "all" | "unit" | "user" | "role";

export interface CommanderMessageAcknowledgement {
  userId: string;
  userName: string;
  readAt: string;
}

export interface CommanderMessage {
  messageId: string;
  title: string;
  content: string;
  important: boolean;
  targetType: CommanderMessageTarget;
  targetUnit?: string;
  targetUserId?: string;
  targetUserName?: string;
  targetRole?: UserRole;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  acknowledgements: Record<string, CommanderMessageAcknowledgement>;
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
    numericRosterCode: "1",
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
    numericRosterCode: "0",
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
    numericRosterCode: "1",
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
    numericRosterCode: "2",
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
    numericRosterCode: "3",
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
    numericRosterCode: "100",
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
    numericRosterCode: "4",
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
    numericRosterCode: "5",
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
    numericRosterCode: "6",
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
    numericRosterCode: "9",
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
