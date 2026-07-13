import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  getDocs, 
  getDocFromServer,
  query, 
  where, 
  orderBy, 
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { db, auth, isFirebaseActive } from "../firebase";
import {
  UserProfile,
  AttendanceReport,
  AttendanceStatus,
  AppNotification,
  ATTENDANCE_STATUS_LABELS,
  IDF_UNITS,
  UnitConfig,
  DEFAULT_UNIT_CONFIGS,
  MedicalRoleConfig,
  DEFAULT_MEDICAL_ROLE_CONFIGS,
  AttendanceStatusConfig,
  DEFAULT_ATTENDANCE_STATUS_CONFIGS,
  SystemRole,
  SystemRoleConfig,
  SystemRoleAccessLevel,
  RolePermissionConfig,
  GoogleSheetsConfig,
  GoogleSheetsSyncResult,
  GoogleSheetsSyncHistoryItem,
  AuditLogEntry,
  AuditAction,
  AuditModule,
  SystemSettingsConfig,
  BackupSection,
  SystemBackupFile,
  BackupRestoreResult,
  ShiftRecord,
  ShiftSlotConfig,
  ExternalStaffMember,
  ShiftTypeConfig,
  EmergencyResponse,
  WhatsAppGroupConfig,
} from "../types";

// Firestore Error Handlers according to standard skill blueprint
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Ensure connection is validated if Firebase is active
if (isFirebaseActive && db) {
  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, "test", "connection"));
    } catch (error) {
      if (error instanceof Error && error.message.includes("client is offline")) {
        console.warn("Firebase client is currently offline or unconfigured.");
      }
    }
  };
  testConnection();
}
const DEFAULT_SIMULATED_PROFILES: UserProfile[] = [];
const DEFAULT_SIMULATED_REPORTS: AttendanceReport[] = [];
const DEFAULT_SIMULATED_NOTIFICATIONS: AppNotification[] = [];
const initSimStorage = () => {
  if (!localStorage.getItem("idf_profiles")) {
    localStorage.setItem("idf_profiles", JSON.stringify(DEFAULT_SIMULATED_PROFILES));
  }
  if (!localStorage.getItem("idf_reports")) {
    localStorage.setItem("idf_reports", JSON.stringify(DEFAULT_SIMULATED_REPORTS));
  }
  if (!localStorage.getItem("idf_notifications")) {
    localStorage.setItem("idf_notifications", JSON.stringify(DEFAULT_SIMULATED_NOTIFICATIONS));
  }
};
initSimStorage();

const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
  systemName: "מערכת נוכחות חיילים",
  unitName: "תאג״ד 997",
  footerText: "Created by AviElias",
  systemVersion: "1.0.0",
  timeZone: "Asia/Jerusalem",
  defaultStartScreen: "dashboard",
  notificationsEnabled: true,
  toastNotificationsEnabled: true,
  notificationSoundEnabled: false,
  cacheMinutes: 30,
  autoRefreshSeconds: 60,
  maintenanceMode: false,
  maintenanceMessage: "המערכת נמצאת כרגע בתחזוקה. נסו שוב מאוחר יותר.",
  maintenanceAllowedRoles: ["super_admin", "admin"],
  reportingEnabled: true,
  reportingClosedMessage: "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס.",
  reportingClosedAllowedRoles: ["super_admin", "admin"],
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
  adminTabOrder: [
    "users",
    "permissions",
    "statuses",
    "roles",
    "units",
    "shift_roles",
    "shift_types",
    "external_staff",
    "sheets",
    "audit",
    "backups",
    "settings",
  ],
  mainTabOrder: ["reporter", "dashboard", "shifts", "emergency", "system_admin"],
};

const SYSTEM_SETTINGS_CACHE_KEY = "idf_system_settings";
const SYSTEM_SETTINGS_CACHE_TIME_KEY = "idf_system_settings_cached_at";

const normalizeSystemSettings = (value: unknown): SystemSettingsConfig => {
  const raw = value && typeof value === "object"
    ? (value as Partial<SystemSettingsConfig>)
    : {};
  const numberInRange = (candidate: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const normalizeWhatsAppGroups = (
    candidate: unknown
  ): WhatsAppGroupConfig[] => {
    if (!Array.isArray(candidate)) return [];

    const normalized = candidate
      .filter(
        (item): item is Partial<WhatsAppGroupConfig> =>
          !!item && typeof item === "object"
      )
      .map((item, index) => ({
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id.trim()
            : `whatsapp_group_${index + 1}`,
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : `קבוצה ${index + 1}`,
        link: typeof item.link === "string" ? item.link.trim() : "",
        enabled: item.enabled !== false,
        isDefault: item.isDefault === true,
        sortOrder:
          typeof item.sortOrder === "number" ? item.sortOrder : index + 1,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let defaultWasSet = false;

    return normalized.map((item) => {
      const isDefault = item.isDefault && !defaultWasSet;
      if (isDefault) defaultWasSet = true;
      return { ...item, isDefault };
    });
  };

  const normalizeAllowedRoles = (
    candidate: unknown,
    fallback: SystemRole[]
  ): SystemRole[] => {
    const validRoles: SystemRole[] = [
      "super_admin",
      "admin",
      "viewer",
      "reporter",
    ];
    if (!Array.isArray(candidate)) return [...fallback];

    const normalized = candidate.filter(
      (role): role is SystemRole =>
        typeof role === "string" &&
        validRoles.includes(role as SystemRole)
    );

    return Array.from(new Set(normalized));
  };
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...raw,
    systemName: typeof raw.systemName === "string" && raw.systemName.trim() ? raw.systemName.trim() : DEFAULT_SYSTEM_SETTINGS.systemName,
    unitName: typeof raw.unitName === "string" && raw.unitName.trim() ? raw.unitName.trim() : DEFAULT_SYSTEM_SETTINGS.unitName,
    footerText: typeof raw.footerText === "string" ? raw.footerText.trim() : DEFAULT_SYSTEM_SETTINGS.footerText,
    systemVersion: typeof raw.systemVersion === "string" && raw.systemVersion.trim() ? raw.systemVersion.trim() : DEFAULT_SYSTEM_SETTINGS.systemVersion,
    timeZone: typeof raw.timeZone === "string" && raw.timeZone.trim() ? raw.timeZone.trim() : DEFAULT_SYSTEM_SETTINGS.timeZone,
    defaultStartScreen: raw.defaultStartScreen === "reporter" ? "reporter" : "dashboard",
    notificationsEnabled: raw.notificationsEnabled !== false,
    toastNotificationsEnabled: raw.toastNotificationsEnabled !== false,
    notificationSoundEnabled: raw.notificationSoundEnabled === true,
    cacheMinutes: numberInRange(raw.cacheMinutes, 30, 1, 1440),
    autoRefreshSeconds: numberInRange(raw.autoRefreshSeconds, 60, 10, 3600),
    maintenanceMode: raw.maintenanceMode === true,
    maintenanceMessage: typeof raw.maintenanceMessage === "string" && raw.maintenanceMessage.trim() ? raw.maintenanceMessage.trim() : DEFAULT_SYSTEM_SETTINGS.maintenanceMessage,
    maintenanceAllowedRoles: normalizeAllowedRoles(
      raw.maintenanceAllowedRoles,
      DEFAULT_SYSTEM_SETTINGS.maintenanceAllowedRoles
    ),
    reportingEnabled: raw.reportingEnabled !== false,
    reportingClosedMessage:
      typeof raw.reportingClosedMessage === "string" && raw.reportingClosedMessage.trim()
        ? raw.reportingClosedMessage.trim()
        : DEFAULT_SYSTEM_SETTINGS.reportingClosedMessage,
    reportingClosedAllowedRoles: normalizeAllowedRoles(
      raw.reportingClosedAllowedRoles,
      DEFAULT_SYSTEM_SETTINGS.reportingClosedAllowedRoles
    ),
    shiftsEnabled: raw.shiftsEnabled !== false,
    shiftsClosedMessage:
      typeof raw.shiftsClosedMessage === "string" &&
      raw.shiftsClosedMessage.trim()
        ? raw.shiftsClosedMessage.trim()
        : DEFAULT_SYSTEM_SETTINGS.shiftsClosedMessage,
    systemMode:
      raw.systemMode === "operational" || raw.systemMode === "emergency"
        ? raw.systemMode
        : "routine",
    operationalMessage:
      typeof raw.operationalMessage === "string"
        ? raw.operationalMessage
        : DEFAULT_SYSTEM_SETTINGS.operationalMessage,
    emergencyEvent:
      raw.emergencyEvent && typeof raw.emergencyEvent === "object"
        ? {
            ...DEFAULT_SYSTEM_SETTINGS.emergencyEvent,
            ...raw.emergencyEvent,
          }
        : { ...DEFAULT_SYSTEM_SETTINGS.emergencyEvent },
    whatsappGroups: normalizeWhatsAppGroups(raw.whatsappGroups),
    adminTabOrder:
      Array.isArray(raw.adminTabOrder) && raw.adminTabOrder.length
        ? raw.adminTabOrder.filter((item): item is string => typeof item === "string")
        : [...DEFAULT_SYSTEM_SETTINGS.adminTabOrder],
    mainTabOrder:
      Array.isArray(raw.mainTabOrder) && raw.mainTabOrder.length
        ? raw.mainTabOrder.filter((item): item is string => typeof item === "string")
        : [...DEFAULT_SYSTEM_SETTINGS.mainTabOrder],
  };
};

const saveSystemSettingsToCache = (settings: SystemSettingsConfig) => {
  localStorage.setItem(SYSTEM_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  localStorage.setItem(SYSTEM_SETTINGS_CACHE_TIME_KEY, String(Date.now()));
};

const getSystemSettingsFromCache = (): SystemSettingsConfig | null => {
  try {
    const raw = localStorage.getItem(SYSTEM_SETTINGS_CACHE_KEY);
    return raw ? normalizeSystemSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const DEFAULT_GOOGLE_SHEETS_CONFIG: GoogleSheetsConfig = {
  enabled: true,
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbzoMH-OzKtGCCWW0rdqaf8TPwlEXoPPSTV3tqjaC4DtFe5o4hVutyzK_FB5HeJRDj_VeQ/exec",
  spreadsheetName: "",
  lastTestStatus: "idle",
  lastSyncStatus: "idle",
  syncHistory: [],
};

const GOOGLE_SHEETS_CONFIG_CACHE_KEY = "idf_google_sheets_config";
const GOOGLE_SHEETS_CONFIG_CACHE_TIME_KEY =
  "idf_google_sheets_config_cached_at";
const GOOGLE_SHEETS_CONFIG_CACHE_TTL_MS = 30 * 60 * 1000;

const normalizeGoogleSheetsConfig = (
  value: unknown
): GoogleSheetsConfig => {
  const raw = value && typeof value === "object" ? (value as Partial<GoogleSheetsConfig>) : {};

  return {
    ...DEFAULT_GOOGLE_SHEETS_CONFIG,
    ...raw,
    enabled: raw.enabled !== false,
    webAppUrl:
      typeof raw.webAppUrl === "string"
        ? raw.webAppUrl.trim()
        : DEFAULT_GOOGLE_SHEETS_CONFIG.webAppUrl,
    spreadsheetName:
      typeof raw.spreadsheetName === "string"
        ? raw.spreadsheetName.trim()
        : "",
    lastTestStatus:
      raw.lastTestStatus === "success" || raw.lastTestStatus === "error"
        ? raw.lastTestStatus
        : "idle",
    lastSyncStatus:
      raw.lastSyncStatus === "success" ||
      raw.lastSyncStatus === "partial" ||
      raw.lastSyncStatus === "error"
        ? raw.lastSyncStatus
        : "idle",
    lastSyncSentCount:
      typeof raw.lastSyncSentCount === "number" ? raw.lastSyncSentCount : 0,
    lastSyncFailedCount:
      typeof raw.lastSyncFailedCount === "number" ? raw.lastSyncFailedCount : 0,
    lastSyncDurationMs:
      typeof raw.lastSyncDurationMs === "number" ? raw.lastSyncDurationMs : 0,
    syncHistory: Array.isArray(raw.syncHistory) ? raw.syncHistory.slice(0, 20) : [],
  };
};

const removeUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedValues(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)])
    ) as T;
  }

  return value;
};


const getAuditActor = async () => {
  const actorId = auth?.currentUser?.uid || "unknown";
  if (!isFirebaseActive() || actorId === "unknown") {
    return { actorId, actorName: auth?.currentUser?.email || "משתמש לא ידוע", actorRole: "unknown" };
  }
  try {
    const snap = await getDoc(doc(db, "users", actorId));
    const data = snap.exists() ? snap.data() : {};
    return {
      actorId,
      actorName: data.fullName || auth?.currentUser?.email || "משתמש לא ידוע",
      actorRole: data.systemRole || data.role || "unknown",
    };
  } catch {
    return { actorId, actorName: auth?.currentUser?.email || "משתמש לא ידוע", actorRole: "unknown" };
  }
};

const writeAuditLog = async (entry: {
  action: AuditAction;
  module: AuditModule;
  targetId?: string;
  targetLabel?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) => {
  const actor = await getAuditActor();
  const createdAt = new Date().toISOString();
  const safeEntry = removeUndefinedValues({ ...entry, ...actor, createdAt });
  if (!isFirebaseActive()) {
    const current = JSON.parse(localStorage.getItem("idf_audit_logs") || "[]");
    localStorage.setItem("idf_audit_logs", JSON.stringify([{ id: `audit_${Date.now()}`, ...safeEntry }, ...current].slice(0, 500)));
    return;
  }
  try {
    await addDoc(collection(db, "system_logs"), { ...safeEntry, logType: "audit", timestamp: createdAt });
  } catch (error) {
    console.warn("Audit log write failed:", error);
  }
};

const buildCollectionAuditMetadata = (
  before: Array<Record<string, any>>,
  after: Array<Record<string, any>>
) => {
  const beforeById = new Map(
    before.map((item, index) => [String(item.id || `index_${index}`), item])
  );
  const afterById = new Map(
    after.map((item, index) => [String(item.id || `index_${index}`), item])
  );

  const added = Array.from(afterById.entries())
    .filter(([id]) => !beforeById.has(id))
    .map(([, item]) => ({ id: item.id, name: item.name || item.label || item.id }));

  const removed = Array.from(beforeById.entries())
    .filter(([id]) => !afterById.has(id))
    .map(([, item]) => ({ id: item.id, name: item.name || item.label || item.id }));

  const updated = Array.from(afterById.entries())
    .filter(([id, item]) => {
      const previous = beforeById.get(id);
      if (!previous) return false;
      const clean = (value: Record<string, any>) =>
        Object.fromEntries(
          Object.entries(value).filter(
            ([key]) => !["createdAt", "updatedAt", "updatedBy"].includes(key)
          )
        );
      return JSON.stringify(clean(previous)) !== JSON.stringify(clean(item));
    })
    .map(([, item]) => ({ id: item.id, name: item.name || item.label || item.id }));

  return {
    addedCount: added.length,
    removedCount: removed.length,
    updatedCount: updated.length,
    added,
    removed,
    updated,
  };
};

const saveGoogleSheetsConfigToCache = (config: GoogleSheetsConfig) => {
  localStorage.setItem(GOOGLE_SHEETS_CONFIG_CACHE_KEY, JSON.stringify(config));
  localStorage.setItem(GOOGLE_SHEETS_CONFIG_CACHE_TIME_KEY, String(Date.now()));
};

const getGoogleSheetsConfigFromCache = (
  allowExpired = false
): GoogleSheetsConfig | null => {
  try {
    const raw = localStorage.getItem(GOOGLE_SHEETS_CONFIG_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(GOOGLE_SHEETS_CONFIG_CACHE_TIME_KEY) || 0
    );

    if (!raw) return null;

    const isExpired =
      !cachedAt || Date.now() - cachedAt > GOOGLE_SHEETS_CONFIG_CACHE_TTL_MS;

    if (isExpired && !allowExpired) return null;

    return normalizeGoogleSheetsConfig(JSON.parse(raw));
  } catch (error) {
    console.warn("Invalid Google Sheets config cache:", error);
    return null;
  }
};

const normalizeFirestoreDate = (value: any) => {
  if (!value) return value;

  if (typeof value === "string") return value;

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return value;
};

const normalizeReportDates = (data: any) => ({
  ...data,
  timestamp: normalizeFirestoreDate(data.timestamp),
  updatedAt: normalizeFirestoreDate(data.updatedAt),
  verifiedAt: normalizeFirestoreDate(data.verifiedAt),
});

const ATTENDANCE_STATUS_CACHE_KEY = "idf_attendance_status_configs";
const ATTENDANCE_STATUS_CACHE_TIME_KEY =
  "idf_attendance_status_configs_cached_at";
const ATTENDANCE_STATUS_CACHE_TTL_MS = 30 * 60 * 1000;

const cloneDefaultAttendanceStatuses = (): AttendanceStatusConfig[] =>
  DEFAULT_ATTENDANCE_STATUS_CONFIGS.map((status) => ({ ...status }));

const normalizeAttendanceStatusConfigs = (
  value: unknown
): AttendanceStatusConfig[] => {
  if (!Array.isArray(value)) {
    return cloneDefaultAttendanceStatuses();
  }

  const validStatuses = value
    .filter(
      (status): status is AttendanceStatusConfig =>
        !!status &&
        typeof status === "object" &&
        typeof (status as AttendanceStatusConfig).id === "string" &&
        typeof (status as AttendanceStatusConfig).label === "string"
    )
    .map((status, index) => ({
      ...status,
      id: status.id.trim(),
      label: status.label.trim(),
      enabled: status.enabled !== false,
      visibleToSoldiers: status.visibleToSoldiers === true,
      visibleToCommanders: status.visibleToCommanders !== false,
      sortOrder:
        typeof status.sortOrder === "number"
          ? status.sortOrder
          : index + 1,
      systemStatus: status.systemStatus === true,
      color: status.color || "text-slate-700",
      bg: status.bg || "bg-slate-50",
      border: status.border || "border-slate-200",
    }))
    .filter((status) => status.id.length > 0 && status.label.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return validStatuses.length > 0
    ? validStatuses
    : cloneDefaultAttendanceStatuses();
};

const saveAttendanceStatusesToCache = (
  statuses: AttendanceStatusConfig[]
) => {
  localStorage.setItem(
    ATTENDANCE_STATUS_CACHE_KEY,
    JSON.stringify(statuses)
  );
  localStorage.setItem(
    ATTENDANCE_STATUS_CACHE_TIME_KEY,
    String(Date.now())
  );
};

const getAttendanceStatusesFromCache = (
  allowExpired = false
): AttendanceStatusConfig[] | null => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_STATUS_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(ATTENDANCE_STATUS_CACHE_TIME_KEY) || 0
    );

    if (!raw) return null;

    const isExpired =
      !cachedAt || Date.now() - cachedAt > ATTENDANCE_STATUS_CACHE_TTL_MS;

    if (isExpired && !allowExpired) return null;

    return normalizeAttendanceStatusConfigs(JSON.parse(raw));
  } catch (error) {
    console.warn("Invalid attendance status cache:", error);
    return null;
  }
};


const UNIT_CONFIGS_CACHE_KEY = "idf_unit_configs";
const UNIT_CONFIGS_CACHE_TIME_KEY = "idf_unit_configs_cached_at";
const UNIT_CONFIGS_CACHE_TTL_MS = 30 * 60 * 1000;

const cloneDefaultUnitConfigs = (): UnitConfig[] =>
  DEFAULT_UNIT_CONFIGS.map((unit) => ({ ...unit }));

const makeUnitId = (name: string, index: number) => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized ? `unit_${normalized}` : `unit_${index + 1}`;
};

const normalizeUnitConfigs = (value: unknown): UnitConfig[] => {
  if (!Array.isArray(value)) return cloneDefaultUnitConfigs();

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const units = value
    .filter((unit): unit is UnitConfig =>
      !!unit && typeof unit === "object" && typeof (unit as UnitConfig).name === "string"
    )
    .map((unit, index) => {
      const name = unit.name.trim();
      let id = typeof unit.id === "string" && unit.id.trim()
        ? unit.id.trim()
        : makeUnitId(name, index);

      while (seenIds.has(id)) id = `${id}_${index + 1}`;
      seenIds.add(id);

      return {
        ...unit,
        id,
        name,
        enabled: unit.enabled !== false,
        sortOrder: typeof unit.sortOrder === "number" ? unit.sortOrder : index + 1,
        systemUnit: unit.systemUnit === true,
      };
    })
    .filter((unit) => {
      const key = unit.name.toLocaleLowerCase("he");
      if (!unit.name || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((unit, index) => ({ ...unit, sortOrder: index + 1 }));

  return units.length > 0 ? units : cloneDefaultUnitConfigs();
};

const saveUnitConfigsToCache = (units: UnitConfig[]) => {
  localStorage.setItem(UNIT_CONFIGS_CACHE_KEY, JSON.stringify(units));
  localStorage.setItem(UNIT_CONFIGS_CACHE_TIME_KEY, String(Date.now()));
};

const getUnitConfigsFromCache = (allowExpired = false): UnitConfig[] | null => {
  try {
    const raw = localStorage.getItem(UNIT_CONFIGS_CACHE_KEY);
    const cachedAt = Number(localStorage.getItem(UNIT_CONFIGS_CACHE_TIME_KEY) || 0);
    if (!raw) return null;

    const isExpired = !cachedAt || Date.now() - cachedAt > UNIT_CONFIGS_CACHE_TTL_MS;
    if (isExpired && !allowExpired) return null;

    return normalizeUnitConfigs(JSON.parse(raw));
  } catch (error) {
    console.warn("Invalid unit configs cache:", error);
    return null;
  }
};

const MEDICAL_ROLE_CONFIGS_CACHE_KEY = "idf_medical_role_configs";
const MEDICAL_ROLE_CONFIGS_CACHE_TIME_KEY = "idf_medical_role_configs_cached_at";
const MEDICAL_ROLE_CONFIGS_CACHE_TTL_MS = 30 * 60 * 1000;

const cloneDefaultMedicalRoleConfigs = (): MedicalRoleConfig[] =>
  DEFAULT_MEDICAL_ROLE_CONFIGS.map((role) => ({ ...role }));

const makeMedicalRoleId = (name: string, index: number) => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized ? `medical_role_${normalized}` : `medical_role_${index + 1}`;
};

const normalizeMedicalRoleConfigs = (value: unknown): MedicalRoleConfig[] => {
  if (!Array.isArray(value)) return cloneDefaultMedicalRoleConfigs();

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const roles = value
    .filter((role): role is MedicalRoleConfig =>
      !!role && typeof role === "object" && typeof (role as MedicalRoleConfig).name === "string"
    )
    .map((role, index) => {
      const name = role.name.trim();
      let id = typeof role.id === "string" && role.id.trim()
        ? role.id.trim()
        : makeMedicalRoleId(name, index);

      while (seenIds.has(id)) id = `${id}_${index + 1}`;
      seenIds.add(id);

      const { systemRole: _legacySystemRole, ...cleanRole } = role as MedicalRoleConfig & {
        systemRole?: boolean;
      };

      return {
        ...cleanRole,
        id,
        name,
        enabled: role.enabled !== false,
        sortOrder: typeof role.sortOrder === "number" ? role.sortOrder : index + 1,
      };
    })
    .filter((role) => {
      const key = role.name.toLocaleLowerCase("he");
      if (!role.name || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((role, index) => ({ ...role, sortOrder: index + 1 }));

  return roles.length > 0 ? roles : cloneDefaultMedicalRoleConfigs();
};

const saveMedicalRoleConfigsToCache = (roles: MedicalRoleConfig[]) => {
  localStorage.setItem(MEDICAL_ROLE_CONFIGS_CACHE_KEY, JSON.stringify(roles));
  localStorage.setItem(MEDICAL_ROLE_CONFIGS_CACHE_TIME_KEY, String(Date.now()));
};

const getMedicalRoleConfigsFromCache = (allowExpired = false): MedicalRoleConfig[] | null => {
  try {
    const raw = localStorage.getItem(MEDICAL_ROLE_CONFIGS_CACHE_KEY);
    const cachedAt = Number(localStorage.getItem(MEDICAL_ROLE_CONFIGS_CACHE_TIME_KEY) || 0);
    if (!raw) return null;
    const isExpired = !cachedAt || Date.now() - cachedAt > MEDICAL_ROLE_CONFIGS_CACHE_TTL_MS;
    if (isExpired && !allowExpired) return null;
    return normalizeMedicalRoleConfigs(JSON.parse(raw));
  } catch (error) {
    console.warn("Invalid medical role cache:", error);
    return null;
  }
};



const DEFAULT_SHIFT_TYPE_CONFIGS: ShiftTypeConfig[] = [
  {
    id: "tagbatz_morning",
    name: 'תגב"ץ בוקר',
    enabled: true,
    sortOrder: 1,
    defaultStartTime: "05:30",
    defaultEndTime: "18:30",
    crossesMidnight: false,
  },
  {
    id: "tagbatz_evening",
    name: 'תגב"ץ ערב',
    enabled: true,
    sortOrder: 2,
    defaultStartTime: "18:30",
    defaultEndTime: "05:30",
    crossesMidnight: true,
  },
  {
    id: "hipak",
    name: 'חיפ"ק',
    enabled: true,
    sortOrder: 3,
    defaultStartTime: "",
    defaultEndTime: "",
    crossesMidnight: false,
  },
];

const SHIFT_TYPE_CONFIGS_CACHE_KEY = "idf_shift_type_configs";
const SHIFT_TYPE_CONFIGS_CACHE_TIME_KEY = "idf_shift_type_configs_cached_at";
const SHIFT_TYPE_CONFIGS_CACHE_TTL_MS = 30 * 60 * 1000;

const cloneDefaultShiftTypeConfigs = (): ShiftTypeConfig[] =>
  DEFAULT_SHIFT_TYPE_CONFIGS.map((item) => ({ ...item }));

const isValidTimeText = (value: unknown): value is string =>
  typeof value === "string" &&
  (value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

const normalizeShiftTypeConfigs = (value: unknown): ShiftTypeConfig[] => {
  if (!Array.isArray(value)) return cloneDefaultShiftTypeConfigs();

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const normalized = value
    .filter(
      (item): item is ShiftTypeConfig =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ShiftTypeConfig).id === "string" &&
        typeof (item as ShiftTypeConfig).name === "string"
    )
    .map((item, index) => ({
      ...item,
      id: item.id.trim(),
      name: item.name.trim(),
      enabled: item.enabled !== false,
      sortOrder:
        typeof item.sortOrder === "number" ? item.sortOrder : index + 1,
      defaultStartTime: isValidTimeText(item.defaultStartTime)
        ? item.defaultStartTime
        : "",
      defaultEndTime: isValidTimeText(item.defaultEndTime)
        ? item.defaultEndTime
        : "",
      crossesMidnight: item.crossesMidnight === true,
    }))
    .filter((item) => {
      const normalizedName = item.name.toLocaleLowerCase("he");
      if (
        !item.id ||
        !item.name ||
        seenIds.has(item.id) ||
        seenNames.has(normalizedName)
      ) {
        return false;
      }
      seenIds.add(item.id);
      seenNames.add(normalizedName);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  return normalized.length > 0
    ? normalized
    : cloneDefaultShiftTypeConfigs();
};

const saveShiftTypeConfigsToCache = (items: ShiftTypeConfig[]) => {
  localStorage.setItem(SHIFT_TYPE_CONFIGS_CACHE_KEY, JSON.stringify(items));
  localStorage.setItem(SHIFT_TYPE_CONFIGS_CACHE_TIME_KEY, String(Date.now()));
};

const getShiftTypeConfigsFromCache = (
  allowExpired = false
): ShiftTypeConfig[] | null => {
  try {
    const raw = localStorage.getItem(SHIFT_TYPE_CONFIGS_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(SHIFT_TYPE_CONFIGS_CACHE_TIME_KEY) || 0
    );
    if (!raw) return null;

    const expired =
      !cachedAt || Date.now() - cachedAt > SHIFT_TYPE_CONFIGS_CACHE_TTL_MS;
    if (expired && !allowExpired) return null;

    return normalizeShiftTypeConfigs(JSON.parse(raw));
  } catch {
    return null;
  }
};

const DEFAULT_SHIFT_SLOT_CONFIGS: ShiftSlotConfig[] = [
  {
    id: "duty_commander",
    name: "מפקד תורן",
    quantity: 1,
    required: true,
    enabled: true,
    sortOrder: 1,
    allowedMedicalRoleIds: [],
    allowedSystemRoles: ["admin", "super_admin"],
    allowSystemUsers: true,
    allowDischargedUsers: false,
    allowExternalStaff: false,
    allowedExternalStaffTypes: [],
  },
  {
    id: "event_manager",
    name: "מנהל/ת אירוע",
    quantity: 1,
    required: true,
    enabled: true,
    sortOrder: 2,
    allowedMedicalRoleIds: [],
    allowedSystemRoles: [],
    allowSystemUsers: true,
    allowDischargedUsers: false,
    allowExternalStaff: false,
    allowedExternalStaffTypes: [],
  },
  {
    id: "matab",
    name: 'מט"ב',
    quantity: 1,
    required: true,
    enabled: true,
    sortOrder: 3,
    allowedMedicalRoleIds: [],
    allowedSystemRoles: [],
    allowSystemUsers: true,
    allowDischargedUsers: false,
    allowExternalStaff: false,
    allowedExternalStaffTypes: [],
  },
  {
    id: "medic",
    name: "חובש",
    quantity: 2,
    required: true,
    enabled: true,
    sortOrder: 4,
    allowedMedicalRoleIds: [],
    allowedSystemRoles: [],
    allowSystemUsers: true,
    allowDischargedUsers: false,
    allowExternalStaff: false,
    allowedExternalStaffTypes: [],
  },
  {
    id: "outpost_medic",
    name: "חובש מוצב",
    quantity: 1,
    required: true,
    enabled: true,
    sortOrder: 5,
    allowedMedicalRoleIds: [],
    allowedSystemRoles: [],
    allowSystemUsers: true,
    allowDischargedUsers: false,
    allowExternalStaff: false,
    allowedExternalStaffTypes: [],
  },
];

const SHIFT_SLOT_CONFIGS_CACHE_KEY = "idf_shift_slot_configs";
const SHIFT_SLOT_CONFIGS_CACHE_TIME_KEY = "idf_shift_slot_configs_cached_at";
const SHIFT_SLOT_CONFIGS_CACHE_TTL_MS = 30 * 60 * 1000;

const cloneDefaultShiftSlotConfigs = (): ShiftSlotConfig[] =>
  DEFAULT_SHIFT_SLOT_CONFIGS.map((item) => ({
    ...item,
    allowedMedicalRoleIds: [...item.allowedMedicalRoleIds],
    allowedSystemRoles: [...item.allowedSystemRoles],
    allowedExternalStaffTypes: [...(item.allowedExternalStaffTypes || [])],
  }));

const normalizeShiftSlotConfigs = (value: unknown): ShiftSlotConfig[] => {
  if (!Array.isArray(value)) return cloneDefaultShiftSlotConfigs();

  const validSystemRoles: SystemRole[] = [
    "super_admin",
    "admin",
    "viewer",
    "reporter",
  ];

  const seen = new Set<string>();
  const normalized = value
    .filter(
      (item): item is ShiftSlotConfig =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ShiftSlotConfig).id === "string" &&
        typeof (item as ShiftSlotConfig).name === "string"
    )
    .map((item, index) => {
      const id = item.id.trim();
      const name = item.name.trim();
      return {
        ...item,
        id,
        name,
        quantity: Math.min(20, Math.max(1, Number(item.quantity) || 1)),
        required: item.required !== false,
        enabled: item.enabled !== false,
        sortOrder:
          typeof item.sortOrder === "number" ? item.sortOrder : index + 1,
        allowedMedicalRoleIds: Array.isArray(item.allowedMedicalRoleIds)
          ? Array.from(
              new Set(
                item.allowedMedicalRoleIds.filter(
                  (roleId): roleId is string =>
                    typeof roleId === "string" && roleId.trim().length > 0
                )
              )
            )
          : [],
        allowedSystemRoles: Array.isArray(item.allowedSystemRoles)
          ? Array.from(
              new Set(
                item.allowedSystemRoles.filter(
                  (role): role is SystemRole =>
                    typeof role === "string" &&
                    validSystemRoles.includes(role as SystemRole)
                )
              )
            )
          : [],
        allowSystemUsers: item.allowSystemUsers !== false,
        allowDischargedUsers: item.allowDischargedUsers === true,
        allowExternalStaff: item.allowExternalStaff === true,
        allowedExternalStaffTypes: Array.isArray(item.allowedExternalStaffTypes)
          ? Array.from(
              new Set(
                item.allowedExternalStaffTypes.filter(
                  (value): value is string =>
                    typeof value === "string" && value.trim().length > 0
                )
              )
            )
          : [],
      };
    })
    .filter((item) => {
      if (!item.id || !item.name || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  return normalized.length ? normalized : cloneDefaultShiftSlotConfigs();
};

const saveShiftSlotConfigsToCache = (configs: ShiftSlotConfig[]) => {
  localStorage.setItem(SHIFT_SLOT_CONFIGS_CACHE_KEY, JSON.stringify(configs));
  localStorage.setItem(SHIFT_SLOT_CONFIGS_CACHE_TIME_KEY, String(Date.now()));
};

const getShiftSlotConfigsFromCache = (
  allowExpired = false
): ShiftSlotConfig[] | null => {
  try {
    const raw = localStorage.getItem(SHIFT_SLOT_CONFIGS_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(SHIFT_SLOT_CONFIGS_CACHE_TIME_KEY) || 0
    );
    if (!raw) return null;
    const expired =
      !cachedAt || Date.now() - cachedAt > SHIFT_SLOT_CONFIGS_CACHE_TTL_MS;
    if (expired && !allowExpired) return null;
    return normalizeShiftSlotConfigs(JSON.parse(raw));
  } catch {
    return null;
  }
};


const EXTERNAL_STAFF_CACHE_KEY = "idf_external_staff";
const EXTERNAL_STAFF_CACHE_TIME_KEY = "idf_external_staff_cached_at";
const EXTERNAL_STAFF_CACHE_TTL_MS = 30 * 60 * 1000;

const normalizeExternalStaff = (value: unknown): ExternalStaffMember[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .filter(
      (item): item is ExternalStaffMember =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ExternalStaffMember).id === "string" &&
        typeof (item as ExternalStaffMember).fullName === "string" &&
        typeof (item as ExternalStaffMember).staffType === "string"
    )
    .map((item, index) => ({
      ...item,
      id: item.id.trim(),
      fullName: item.fullName.trim(),
      staffType: item.staffType.trim(),
      phoneNumber:
        typeof item.phoneNumber === "string" ? item.phoneNumber.trim() : "",
      note: typeof item.note === "string" ? item.note.trim() : "",
      enabled: item.enabled !== false,
      sortOrder:
        typeof item.sortOrder === "number" ? item.sortOrder : index + 1,
    }))
    .filter((item) => {
      if (!item.id || !item.fullName || !item.staffType || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));
};

const saveExternalStaffToCache = (items: ExternalStaffMember[]) => {
  localStorage.setItem(EXTERNAL_STAFF_CACHE_KEY, JSON.stringify(items));
  localStorage.setItem(EXTERNAL_STAFF_CACHE_TIME_KEY, String(Date.now()));
};

const getExternalStaffFromCache = (
  allowExpired = false
): ExternalStaffMember[] | null => {
  try {
    const raw = localStorage.getItem(EXTERNAL_STAFF_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(EXTERNAL_STAFF_CACHE_TIME_KEY) || 0
    );
    if (!raw) return null;

    const expired =
      !cachedAt || Date.now() - cachedAt > EXTERNAL_STAFF_CACHE_TTL_MS;
    if (expired && !allowExpired) return null;

    return normalizeExternalStaff(JSON.parse(raw));
  } catch {
    return null;
  }
};


const SYSTEM_ROLES_CACHE_KEY = "idf_system_role_configs";
const SYSTEM_ROLES_CACHE_TIME_KEY = "idf_system_role_configs_cached_at";
const SYSTEM_ROLES_CACHE_TTL_MS = 30 * 60 * 1000;

const DEFAULT_SYSTEM_ROLE_CONFIGS: SystemRoleConfig[] = [
  {
    id: "super_admin",
    name: "מנהל אתר",
    description: "גישה מלאה לכל מסכי המערכת וההגדרות.",
    accessLevel: "admin",
    enabled: true,
    protected: true,
    sortOrder: 1,
  },
  {
    id: "admin",
    name: "מפקד פעיל",
    description: "ניהול שוטף של חיילים, דיווחים ומשמרות.",
    accessLevel: "admin",
    enabled: true,
    protected: true,
    sortOrder: 2,
  },
  {
    id: "viewer",
    name: "שליש",
    description: "צפייה בנתונים בהתאם להרשאות שהוגדרו.",
    accessLevel: "viewer",
    enabled: true,
    protected: true,
    sortOrder: 3,
  },
  {
    id: "reporter",
    name: "חייל מדווח",
    description: "דיווח נוכחות וצפייה במידע אישי.",
    accessLevel: "reporter",
    enabled: true,
    protected: true,
    sortOrder: 4,
  },
];

const cloneDefaultSystemRoles = (): SystemRoleConfig[] =>
  DEFAULT_SYSTEM_ROLE_CONFIGS.map((role) => ({ ...role }));

const normalizeSystemRoleConfigs = (value: unknown): SystemRoleConfig[] => {
  const stored = Array.isArray(value) ? value : [];

  const normalizedStored = stored
    .filter(
      (item): item is Partial<SystemRoleConfig> =>
        !!item && typeof item === "object"
    )
    .map((item, index) => {
      const rawId = typeof item.id === "string" ? item.id.trim() : "";
      const id = rawId || `custom_role_${index + 1}`;
      const accessLevel: SystemRoleAccessLevel =
        item.accessLevel === "admin" ||
        item.accessLevel === "viewer" ||
        item.accessLevel === "reporter"
          ? item.accessLevel
          : "reporter";

      return {
        id,
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : id,
        description:
          typeof item.description === "string"
            ? item.description.trim()
            : "",
        accessLevel,
        enabled: item.enabled !== false,
        protected:
          item.protected === true ||
          ["super_admin", "admin", "viewer", "reporter"].includes(id),
        sortOrder:
          typeof item.sortOrder === "number" ? item.sortOrder : index + 10,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
      } as SystemRoleConfig;
    });

  const byId = new Map(
    normalizedStored.map((role) => [String(role.id), role])
  );

  const builtIns = cloneDefaultSystemRoles().map((defaultRole) => ({
    ...defaultRole,
    ...(byId.get(defaultRole.id) || {}),
    id: defaultRole.id,
    protected: true,
  }));

  const customRoles = normalizedStored.filter(
    (role) =>
      !["super_admin", "admin", "viewer", "reporter"].includes(role.id)
  );

  return [...builtIns, ...customRoles]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((role, index) => ({ ...role, sortOrder: index + 1 }));
};

const saveSystemRolesToCache = (roles: SystemRoleConfig[]) => {
  localStorage.setItem(SYSTEM_ROLES_CACHE_KEY, JSON.stringify(roles));
  localStorage.setItem(SYSTEM_ROLES_CACHE_TIME_KEY, String(Date.now()));
};

const getSystemRolesFromCache = (
  allowExpired = false
): SystemRoleConfig[] | null => {
  try {
    const raw = localStorage.getItem(SYSTEM_ROLES_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(SYSTEM_ROLES_CACHE_TIME_KEY) || 0
    );

    if (!raw) return null;

    const expired =
      !cachedAt || Date.now() - cachedAt > SYSTEM_ROLES_CACHE_TTL_MS;

    if (expired && !allowExpired) return null;

    return normalizeSystemRoleConfigs(JSON.parse(raw));
  } catch {
    return null;
  }
};

const ROLE_PERMISSIONS_CACHE_KEY = "idf_role_permission_configs";
const ROLE_PERMISSIONS_CACHE_TIME_KEY =
  "idf_role_permission_configs_cached_at";
const ROLE_PERMISSIONS_CACHE_TTL_MS = 30 * 60 * 1000;

const DEFAULT_ROLE_PERMISSION_CONFIGS: RolePermissionConfig[] = [
  {
    systemRole: "super_admin",
    permissions: {
      "reporter.view": true,
      "dashboard.view": true,
      "dashboard.attendance.view": true,
      "dashboard.directory.view": true,
      "dashboard.summary.view": true,
      "dashboard.history.view": true,
      "dashboard.system_logs.view": true,
      "dashboard.notifications.view": true,
      "dashboard.settings.view": true,
      "reports.manage": true,
      "reports.verify": true,
      "reports.reset": true,
      "reports.delete": true,
      "soldiers.manage": true,
      "soldiers.add": true,
      "soldiers.edit": true,
      "soldiers.delete": true,
      "sheets.export": true,
      "system_admin.view": true,
      "system_admin.statuses.manage": true,
      "system_admin.permissions.manage": true,
      "shifts.view": true,
      "shifts.manage": true,
      "emergency.view": true,
      "emergency.manage": true,
      "system_admin.shift_roles.manage": true,
      "system_admin.external_staff.manage": true,
      "system_admin.shift_types.manage": true,
    },
  },
  {
    systemRole: "admin",
    permissions: {
      "reporter.view": true,
      "dashboard.view": true,
      "dashboard.attendance.view": true,
      "dashboard.directory.view": true,
      "dashboard.summary.view": true,
      "dashboard.history.view": true,
      "dashboard.system_logs.view": true,
      "dashboard.notifications.view": true,
      "dashboard.settings.view": true,
      "reports.manage": true,
      "reports.verify": true,
      "reports.reset": true,
      "reports.delete": true,
      "soldiers.manage": true,
      "soldiers.add": true,
      "soldiers.edit": true,
      "soldiers.delete": true,
      "sheets.export": true,
      "system_admin.view": false,
      "system_admin.statuses.manage": false,
      "system_admin.permissions.manage": false,
    },
  },
  {
    systemRole: "viewer",
    permissions: {
      "reporter.view": false,
      "dashboard.view": true,
      "dashboard.attendance.view": true,
      "dashboard.directory.view": true,
      "dashboard.summary.view": false,
      "dashboard.history.view": false,
      "dashboard.system_logs.view": false,
      "dashboard.notifications.view": false,
      "dashboard.settings.view": false,
      "reports.manage": false,
      "reports.verify": false,
      "reports.reset": false,
      "reports.delete": false,
      "soldiers.manage": false,
      "soldiers.add": false,
      "soldiers.edit": false,
      "soldiers.delete": false,
      "sheets.export": false,
      "system_admin.view": false,
      "system_admin.statuses.manage": false,
      "system_admin.permissions.manage": false,
    },
  },
  {
    systemRole: "reporter",
    permissions: {
      "reporter.view": true,
      "dashboard.view": false,
      "dashboard.attendance.view": false,
      "dashboard.directory.view": false,
      "dashboard.summary.view": false,
      "dashboard.history.view": false,
      "dashboard.system_logs.view": false,
      "dashboard.notifications.view": false,
      "dashboard.settings.view": false,
      "reports.manage": false,
      "reports.verify": false,
      "reports.reset": false,
      "reports.delete": false,
      "soldiers.manage": false,
      "soldiers.add": false,
      "soldiers.edit": false,
      "soldiers.delete": false,
      "sheets.export": false,
      "system_admin.view": false,
      "system_admin.statuses.manage": false,
      "system_admin.permissions.manage": false,
    },
  },
];

const cloneDefaultRolePermissions = (): RolePermissionConfig[] =>
  DEFAULT_ROLE_PERMISSION_CONFIGS.map((config) => ({
    ...config,
    permissions: { ...config.permissions },
  }));

const normalizeRolePermissionConfigs = (
  value: unknown
): RolePermissionConfig[] => {
  const defaults = cloneDefaultRolePermissions();
  const stored = Array.isArray(value)
    ? value.filter(
        (item): item is RolePermissionConfig =>
          !!item &&
          typeof item === "object" &&
          typeof (item as RolePermissionConfig).systemRole === "string"
      )
    : [];

  const storedByRole = new Map(
    stored.map((config) => [String(config.systemRole), config])
  );

  const builtIns = defaults.map((defaultConfig) => {
    const storedConfig = storedByRole.get(defaultConfig.systemRole);
    const mergedPermissions = {
      ...defaultConfig.permissions,
      ...(storedConfig?.permissions || {}),
    };

    return {
      systemRole: defaultConfig.systemRole,
      permissions:
        defaultConfig.systemRole === "super_admin"
          ? Object.fromEntries(
              Object.keys(defaultConfig.permissions).map((permissionId) => [
                permissionId,
                true,
              ])
            )
          : mergedPermissions,
      updatedAt: storedConfig?.updatedAt,
      updatedBy: storedConfig?.updatedBy,
    };
  });

  const custom = stored
    .filter(
      (config) =>
        !["super_admin", "admin", "viewer", "reporter"].includes(
          String(config.systemRole)
        )
    )
    .map((config) => ({
      ...config,
      permissions: { ...(config.permissions || {}) },
    }));

  return [...builtIns, ...custom];
};

const saveRolePermissionsToCache = (
  configs: RolePermissionConfig[]
) => {
  localStorage.setItem(
    ROLE_PERMISSIONS_CACHE_KEY,
    JSON.stringify(configs)
  );
  localStorage.setItem(
    ROLE_PERMISSIONS_CACHE_TIME_KEY,
    String(Date.now())
  );
};

const getRolePermissionsFromCache = (
  allowExpired = false
): RolePermissionConfig[] | null => {
  try {
    const raw = localStorage.getItem(ROLE_PERMISSIONS_CACHE_KEY);
    const cachedAt = Number(
      localStorage.getItem(ROLE_PERMISSIONS_CACHE_TIME_KEY) || 0
    );

    if (!raw) return null;

    const isExpired =
      !cachedAt || Date.now() - cachedAt > ROLE_PERMISSIONS_CACHE_TTL_MS;

    if (isExpired && !allowExpired) return null;

    return normalizeRolePermissionConfigs(JSON.parse(raw));
  } catch (error) {
    console.warn("Invalid role permissions cache:", error);
    return null;
  }
};

const getSheetsPersonalId = (...values: any[]): string => {
  for (const value of values) {
    const cleanValue = String(value || "")
      .trim()
      .replace(/\s+/g, "");

    if (/^\d+$/.test(cleanValue)) {
      return cleanValue;
    }
  }

  return "";
};


const BACKUP_SECTIONS: BackupSection[] = [
  "users",
  "attendance",
  "attendance_logs",
  "notifications",
  "settings",
  "system_logs",
];

const LOCAL_BACKUP_KEYS: Record<BackupSection, string> = {
  users: "idf_profiles",
  attendance: "idf_reports",
  attendance_logs: "idf_attendance_logs",
  notifications: "idf_notifications",
  settings: "idf_system_settings",
  system_logs: "idf_system_logs",
};

const normalizeBackupDocument = (value: unknown, index: number) => {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = String(raw.id || raw.userId || raw.reportId || raw.notificationId || `item_${index + 1}`);
  return { id, data: removeUndefinedValues({ ...raw }) };
};

export const dataService = {

  async getEmergencyResponses(eventId: string): Promise<EmergencyResponse[]> {
    if (!eventId) return [];

    if (!isFirebaseActive()) {
      const all: EmergencyResponse[] = JSON.parse(
        localStorage.getItem("idf_emergency_responses") || "[]"
      );
      return all.filter((item) => item.responseId.startsWith(`${eventId}_`));
    }

    const snapshot = await getDocs(collection(db, "emergency_responses"));
    return snapshot.docs
      .map((item) => ({
        responseId: item.id,
        ...item.data(),
      } as EmergencyResponse))
      .filter((item) => item.responseId.startsWith(`${eventId}_`))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async saveEmergencyResponse(
    eventId: string,
    response: Omit<EmergencyResponse, "responseId" | "updatedAt">
  ): Promise<EmergencyResponse> {
    if (!eventId) throw new Error("אירוע החירום אינו פעיל");

    const value: EmergencyResponse = {
      ...response,
      responseId: `${eventId}_${response.userId}`,
      updatedAt: new Date().toISOString(),
    };

    if (!isFirebaseActive()) {
      const all: EmergencyResponse[] = JSON.parse(
        localStorage.getItem("idf_emergency_responses") || "[]"
      );
      const next = [
        value,
        ...all.filter((item) => item.responseId !== value.responseId),
      ];
      localStorage.setItem("idf_emergency_responses", JSON.stringify(next));
      return value;
    }

    await setDoc(
      doc(db, "emergency_responses", value.responseId),
      removeUndefinedValues(value)
    );
    return value;
  },



  async getShiftTypeConfigs(
    forceRefresh = false
  ): Promise<ShiftTypeConfig[]> {
    if (!forceRefresh) {
      const cached = getShiftTypeConfigsFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const local =
        getShiftTypeConfigsFromCache(true) ||
        cloneDefaultShiftTypeConfigs();
      saveShiftTypeConfigsToCache(local);
      return local;
    }

    try {
      const reference = doc(db, "settings", "shift_types");
      const snapshot = await getDoc(reference);

      if (snapshot.exists()) {
        const items = normalizeShiftTypeConfigs(snapshot.data().items);
        saveShiftTypeConfigsToCache(items);
        return items;
      }

      const defaults = cloneDefaultShiftTypeConfigs();
      await setDoc(reference, {
        items: defaults,
        updatedAt: new Date().toISOString(),
      });
      saveShiftTypeConfigsToCache(defaults);
      return defaults;
    } catch (error) {
      const fallback =
        getShiftTypeConfigsFromCache(true) ||
        cloneDefaultShiftTypeConfigs();
      saveShiftTypeConfigsToCache(fallback);
      console.warn("Failed loading shift type configs:", error);
      return fallback;
    }
  },

  async saveShiftTypeConfigs(
    items: ShiftTypeConfig[],
    updatedBy?: string
  ): Promise<ShiftTypeConfig[]> {
    const before = await this.getShiftTypeConfigs(true).catch(() => []);
    const now = new Date().toISOString();
    const normalized = normalizeShiftTypeConfigs(items).map((item) => ({
      ...item,
      updatedAt: now,
      updatedBy,
    }));

    if (!isFirebaseActive()) {
      saveShiftTypeConfigsToCache(normalized);
    } else {
      try {
        await setDoc(
          doc(db, "settings", "shift_types"),
          removeUndefinedValues({
            items: normalized,
            updatedAt: now,
            updatedBy,
          })
        );
        saveShiftTypeConfigsToCache(normalized);
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          "settings/shift_types"
        );
        throw error;
      }
    }

    await writeAuditLog({
      action: "update",
      module: "shifts",
      targetId: "shift_types",
      targetLabel: "שמות וסוגי משמרות",
      before,
      after: normalized,
      metadata: buildCollectionAuditMetadata(
        before as Array<Record<string, any>>,
        normalized as Array<Record<string, any>>
      ),
    });

    return normalized;
  },



  async getExternalStaff(forceRefresh = false): Promise<ExternalStaffMember[]> {
    if (!forceRefresh) {
      const cached = getExternalStaffFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const local = getExternalStaffFromCache(true) || [];
      saveExternalStaffToCache(local);
      return local;
    }

    try {
      const snapshot = await getDocs(
        query(collection(db, "external_staff"), orderBy("sortOrder", "asc"))
      );
      const items = normalizeExternalStaff(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<ExternalStaffMember, "id">),
        }))
      );
      saveExternalStaffToCache(items);
      return items;
    } catch (error) {
      const fallback = getExternalStaffFromCache(true) || [];
      saveExternalStaffToCache(fallback);
      console.warn("Failed loading external staff:", error);
      return fallback;
    }
  },

  async saveExternalStaff(
    items: ExternalStaffMember[],
    updatedBy?: string
  ): Promise<ExternalStaffMember[]> {
    const before = await this.getExternalStaff(true).catch(() => []);
    const normalized = normalizeExternalStaff(items);
    const now = new Date().toISOString();
    const saved = normalized.map((item) => ({
      ...item,
      updatedAt: now,
      updatedBy,
    }));

    if (!isFirebaseActive()) {
      saveExternalStaffToCache(saved);
    } else {
      try {
        const existingSnapshot = await getDocs(collection(db, "external_staff"));
        const batch = writeBatch(db);
        const incomingIds = new Set(saved.map((item) => item.id));

        existingSnapshot.docs.forEach((item) => {
          if (!incomingIds.has(item.id)) batch.delete(item.ref);
        });

        saved.forEach((item) => {
          const { id, ...payload } = item;
          batch.set(
            doc(db, "external_staff", id),
            removeUndefinedValues(payload),
            { merge: true }
          );
        });

        await batch.commit();
        saveExternalStaffToCache(saved);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "external_staff");
        throw error;
      }
    }

    await writeAuditLog({
      action: "update",
      module: "shifts",
      targetId: "external_staff",
      targetLabel: "אנשי צוות חיצוניים",
      before,
      after: saved,
      metadata: buildCollectionAuditMetadata(
        before as Array<Record<string, any>>,
        saved as Array<Record<string, any>>
      ),
    });

    return saved;
  },



  async getShiftSlotConfigs(forceRefresh = false): Promise<ShiftSlotConfig[]> {
    if (!forceRefresh) {
      const cached = getShiftSlotConfigsFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const local =
        getShiftSlotConfigsFromCache(true) || cloneDefaultShiftSlotConfigs();
      saveShiftSlotConfigsToCache(local);
      return local;
    }

    try {
      const ref = doc(db, "settings", "shift_slot_configs");
      const snapshot = await getDoc(ref);
      if (snapshot.exists()) {
        const configs = normalizeShiftSlotConfigs(snapshot.data().items);
        saveShiftSlotConfigsToCache(configs);
        return configs;
      }

      const defaults = cloneDefaultShiftSlotConfigs();
      await setDoc(ref, {
        items: defaults,
        updatedAt: new Date().toISOString(),
      });
      saveShiftSlotConfigsToCache(defaults);
      return defaults;
    } catch (error) {
      const fallback =
        getShiftSlotConfigsFromCache(true) || cloneDefaultShiftSlotConfigs();
      saveShiftSlotConfigsToCache(fallback);
      console.warn("Failed loading shift slot configs:", error);
      return fallback;
    }
  },

  async saveShiftSlotConfigs(
    configs: ShiftSlotConfig[],
    updatedBy?: string
  ): Promise<ShiftSlotConfig[]> {
    const before = await this.getShiftSlotConfigs(true).catch(() => []);
    const normalized = normalizeShiftSlotConfigs(configs);
    const now = new Date().toISOString();
    const saved = normalized.map((item) => ({
      ...item,
      updatedAt: now,
      updatedBy,
    }));

    if (!isFirebaseActive()) {
      saveShiftSlotConfigsToCache(saved);
    } else {
      try {
        await setDoc(
          doc(db, "settings", "shift_slot_configs"),
          removeUndefinedValues({
            items: saved,
            updatedAt: now,
            updatedBy,
          })
        );
        saveShiftSlotConfigsToCache(saved);
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          "settings/shift_slot_configs"
        );
        throw error;
      }
    }

    await writeAuditLog({
      action: "update",
      module: "shifts",
      targetId: "shift_slot_configs",
      targetLabel: "הגדרות תפקידי משמרת",
      before,
      after: saved,
      metadata: buildCollectionAuditMetadata(
        before as Array<Record<string, any>>,
        saved as Array<Record<string, any>>
      ),
    });

    return saved;
  },



  async getShifts(): Promise<ShiftRecord[]> {
    if (!isFirebaseActive()) {
      const raw = JSON.parse(localStorage.getItem("idf_shifts") || "[]");
      return Array.isArray(raw)
        ? raw.sort((a: ShiftRecord, b: ShiftRecord) =>
            String(a.startAt).localeCompare(String(b.startAt))
          )
        : [];
    }

    try {
      const snapshot = await getDocs(
        query(collection(db, "shifts"), orderBy("startAt", "asc"))
      );

      const shifts = snapshot.docs.map((item) => ({
        shiftId: item.id,
        ...(item.data() as Omit<ShiftRecord, "shiftId">),
      }));

      const currentUserId = auth?.currentUser?.uid;
      if (!currentUserId) return shifts;

      const acknowledgementsSnapshot = await getDocs(
        query(
          collection(db, "shift_acknowledgements"),
          where("userId", "==", currentUserId)
        )
      );

      const acknowledgementByShiftId = new Map(
        acknowledgementsSnapshot.docs.map((item) => {
          const data = item.data() as {
            shiftId?: string;
            readAt?: string;
          };
          return [data.shiftId || "", data.readAt || ""];
        })
      );

      return shifts.map((shift) => {
        const readAt = acknowledgementByShiftId.get(shift.shiftId);
        if (!readAt) return shift;

        return {
          ...shift,
          assignments: shift.assignments.map((assignment) =>
            assignment.userId === currentUserId
              ? {
                  ...assignment,
                  readStatus: "read" as const,
                  readAt,
                }
              : assignment
          ),
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "shifts");
      return [];
    }
  },

  async createShift(
    shift: Omit<ShiftRecord, "shiftId" | "createdAt">,
    actor?: UserProfile
  ): Promise<ShiftRecord> {
    const createdAt = new Date().toISOString();
    const payload = removeUndefinedValues({
      ...shift,
      status: shift.status || "draft",
      createdAt,
      createdBy: actor?.userId || auth?.currentUser?.uid || shift.createdBy || "unknown",
      createdByName: actor?.fullName || shift.createdByName || "משתמש לא ידוע",
    });

    if (!isFirebaseActive()) {
      const current = JSON.parse(localStorage.getItem("idf_shifts") || "[]");
      const created: ShiftRecord = {
        shiftId: `shift_${Date.now()}`,
        ...(payload as Omit<ShiftRecord, "shiftId">),
      };
      localStorage.setItem("idf_shifts", JSON.stringify([created, ...current]));
      await writeAuditLog({
        action: "create",
        module: "shifts",
        targetId: created.shiftId,
        targetLabel: created.title,
        after: created,
      });
      return created;
    }

    try {
      const ref = await addDoc(collection(db, "shifts"), payload);
      const created: ShiftRecord = {
        shiftId: ref.id,
        ...(payload as Omit<ShiftRecord, "shiftId">),
      };
      await writeAuditLog({
        action: "create",
        module: "shifts",
        targetId: created.shiftId,
        targetLabel: created.title,
        after: created,
      });
      return created;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "shifts");
      throw error;
    }
  },

  async updateShift(
    shiftId: string,
    changes: Partial<ShiftRecord>,
    actor?: UserProfile
  ): Promise<ShiftRecord> {
    const before = (await this.getShifts()).find((item) => item.shiftId === shiftId);
    if (!before) throw new Error("המשמרת לא נמצאה.");

    const updated: ShiftRecord = {
      ...before,
      ...changes,
      shiftId,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.userId || auth?.currentUser?.uid || "unknown",
      updatedByName: actor?.fullName || "משתמש לא ידוע",
    };

    if (!isFirebaseActive()) {
      const current = JSON.parse(localStorage.getItem("idf_shifts") || "[]");
      localStorage.setItem(
        "idf_shifts",
        JSON.stringify(
          current.map((item: ShiftRecord) =>
            item.shiftId === shiftId ? updated : item
          )
        )
      );
    } else {
      try {
        const { shiftId: _shiftId, ...safeUpdated } = updated;
        await setDoc(
          doc(db, "shifts", shiftId),
          removeUndefinedValues(safeUpdated),
          { merge: true }
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `shifts/${shiftId}`);
        throw error;
      }
    }

    await writeAuditLog({
      action: "update",
      module: "shifts",
      targetId: shiftId,
      targetLabel: updated.title,
      before,
      after: updated,
    });

    return updated;
  },

  async deleteShift(shiftId: string): Promise<void> {
    const before = (await this.getShifts()).find((item) => item.shiftId === shiftId);

    if (!isFirebaseActive()) {
      const current = JSON.parse(localStorage.getItem("idf_shifts") || "[]");
      localStorage.setItem(
        "idf_shifts",
        JSON.stringify(
          current.filter((item: ShiftRecord) => item.shiftId !== shiftId)
        )
      );
    } else {
      try {
        await deleteDoc(doc(db, "shifts", shiftId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `shifts/${shiftId}`);
        throw error;
      }
    }

    await writeAuditLog({
      action: "delete",
      module: "shifts",
      targetId: shiftId,
      targetLabel: before?.title || "משמרת",
      before,
    });
  },

  async markShiftAsRead(
    shiftId: string,
    userId: string,
    actor?: UserProfile
  ): Promise<ShiftRecord> {
    const shift = (await this.getShifts()).find(
      (item) => item.shiftId === shiftId
    );
    if (!shift) throw new Error("המשמרת לא נמצאה.");

    const isAssigned = shift.assignments.some(
      (assignment) => assignment.userId === userId
    );
    if (!isAssigned) {
      throw new Error("המשתמש אינו משובץ למשמרת הזאת.");
    }

    const currentAuthUserId = auth?.currentUser?.uid;
    if (isFirebaseActive() && currentAuthUserId !== userId) {
      throw new Error("אין הרשאה לאשר קריאה עבור משתמש אחר.");
    }

    const now = new Date().toISOString();

    if (!isFirebaseActive()) {
      const acknowledgements = JSON.parse(
        localStorage.getItem("idf_shift_acknowledgements") || "[]"
      );
      const withoutCurrent = acknowledgements.filter(
        (item: any) =>
          !(item.shiftId === shiftId && item.userId === userId)
      );
      localStorage.setItem(
        "idf_shift_acknowledgements",
        JSON.stringify([
          {
            id: `${shiftId}_${userId}`,
            shiftId,
            userId,
            readAt: now,
          },
          ...withoutCurrent,
        ])
      );
    } else {
      try {
        await setDoc(
          doc(db, "shift_acknowledgements", `${shiftId}_${userId}`),
          {
            shiftId,
            userId,
            readAt: now,
            acknowledgedBy: actor?.userId || currentAuthUserId || userId,
          }
        );
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `shift_acknowledgements/${shiftId}_${userId}`
        );
        throw error;
      }
    }

    const updated: ShiftRecord = {
      ...shift,
      assignments: shift.assignments.map((assignment) =>
        assignment.userId === userId
          ? {
              ...assignment,
              readStatus: "read",
              readAt: now,
            }
          : assignment
      ),
    };

    await writeAuditLog({
      action: "acknowledge",
      module: "shifts",
      targetId: shiftId,
      targetLabel: shift.title,
      metadata: { userId, readAt: now },
    });

    return updated;
  },



  async createSystemBackup(
    selectedSections: BackupSection[] = BACKUP_SECTIONS,
    createdBy?: string,
    systemVersion?: string
  ): Promise<SystemBackupFile> {
    const safeSections = BACKUP_SECTIONS.filter((section) =>
      selectedSections.includes(section)
    );
    const sections: SystemBackupFile["sections"] = {};
    const counts: SystemBackupFile["counts"] = {};

    if (!isFirebaseActive()) {
      for (const section of safeSections) {
        const raw = localStorage.getItem(LOCAL_BACKUP_KEYS[section]);
        let parsed: unknown = raw ? JSON.parse(raw) : [];
        if (section === "settings" && parsed && !Array.isArray(parsed)) {
          parsed = [{ id: "system_settings", ...(parsed as Record<string, unknown>) }];
        }
        const items = Array.isArray(parsed) ? parsed : [];
        const docs = items.map(normalizeBackupDocument);
        sections[section] = docs;
        counts[section] = docs.length;
      }
    } else {
      for (const section of safeSections) {
        const snapshot = await getDocs(collection(db, section));
        const docs = snapshot.docs.map((item) => ({
          id: item.id,
          data: removeUndefinedValues(item.data() as Record<string, unknown>),
        }));
        sections[section] = docs;
        counts[section] = docs.length;
      }
    }

    const backup: SystemBackupFile = {
      format: "idf-attendance-backup",
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || auth?.currentUser?.uid || "unknown",
      systemVersion,
      projectId: (db as any)?.app?.options?.projectId,
      sections,
      counts,
    };

    await writeAuditLog({
      action: "backup",
      module: "backups",
      targetId: backup.createdAt,
      targetLabel: "גיבוי מערכת",
      after: {
        createdAt: backup.createdAt,
        counts: backup.counts,
        sections: safeSections,
      },
    });

    return backup;
  },

  async restoreSystemBackup(
    backup: SystemBackupFile,
    selectedSections?: BackupSection[],
    restoredBy?: string
  ): Promise<BackupRestoreResult> {
    if (
      !backup ||
      backup.format !== "idf-attendance-backup" ||
      backup.formatVersion !== 1 ||
      !backup.sections
    ) {
      throw new Error("קובץ הגיבוי אינו בפורמט נתמך.");
    }

    const requested = selectedSections?.length
      ? selectedSections
      : (Object.keys(backup.sections) as BackupSection[]);
    const sectionsToRestore = BACKUP_SECTIONS.filter(
      (section) => requested.includes(section) && Array.isArray(backup.sections[section])
    );

    let restoredDocuments = 0;
    let skippedDocuments = 0;

    if (!isFirebaseActive()) {
      for (const section of sectionsToRestore) {
        const docs = backup.sections[section] || [];
        const values = docs.map((item) => ({ id: item.id, ...item.data }));
        if (section === "settings") {
          const systemSettingsDoc = docs.find((item) => item.id === "system_settings");
          if (systemSettingsDoc) {
            localStorage.setItem(
              LOCAL_BACKUP_KEYS[section],
              JSON.stringify(systemSettingsDoc.data)
            );
          }
        } else {
          localStorage.setItem(LOCAL_BACKUP_KEYS[section], JSON.stringify(values));
        }
        restoredDocuments += docs.length;
      }
    } else {
      let batch = writeBatch(db);
      let operationsInBatch = 0;

      const commitBatch = async () => {
        if (operationsInBatch === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        operationsInBatch = 0;
      };

      for (const section of sectionsToRestore) {
        for (const item of backup.sections[section] || []) {
          if (!item?.id || !item.data || typeof item.data !== "object") {
            skippedDocuments += 1;
            continue;
          }
          batch.set(
            doc(db, section, item.id),
            removeUndefinedValues(item.data),
            { merge: true }
          );
          restoredDocuments += 1;
          operationsInBatch += 1;
          if (operationsInBatch >= 400) await commitBatch();
        }
      }
      await commitBatch();
    }

    const result: BackupRestoreResult = {
      restoredSections: sectionsToRestore,
      restoredDocuments,
      skippedDocuments,
      completedAt: new Date().toISOString(),
    };

    await writeAuditLog({
      action: "restore",
      module: "backups",
      targetId: backup.createdAt,
      targetLabel: "שחזור גיבוי מערכת",
      before: {
        backupCreatedAt: backup.createdAt,
        backupCreatedBy: backup.createdBy,
      },
      after: {
        ...result,
        restoredBy: restoredBy || auth?.currentUser?.uid || "unknown",
      },
    });

    return result;
  },


  async getSystemSettings(forceRefresh = false): Promise<SystemSettingsConfig> {
    if (!forceRefresh) {
      const cached = getSystemSettingsFromCache();
      if (cached) return cached;
    }
    if (!isFirebaseActive()) {
      const local = getSystemSettingsFromCache() || normalizeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      saveSystemSettingsToCache(local);
      return local;
    }
    try {
      const ref = doc(db, "settings", "system_settings");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const settings = normalizeSystemSettings(snap.data());
        saveSystemSettingsToCache(settings);
        return settings;
      }
      const defaults = normalizeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      await setDoc(ref, removeUndefinedValues({
        ...defaults,
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      }));
      saveSystemSettingsToCache(defaults);
      return defaults;
    } catch (error) {
      console.warn("Failed loading system settings:", error);
      const fallback = getSystemSettingsFromCache() || normalizeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      saveSystemSettingsToCache(fallback);
      return fallback;
    }
  },

  async saveSystemSettings(settings: SystemSettingsConfig, updatedBy?: string): Promise<SystemSettingsConfig> {
    const before = await this.getSystemSettings(true).catch(() => null);
    const normalized = normalizeSystemSettings({
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
    });
    if (!isFirebaseActive()) {
      saveSystemSettingsToCache(normalized);
      await writeAuditLog({ action: "update", module: "system_settings", targetId: "system_settings", targetLabel: "הגדרות מערכת", before, after: normalized });
      return normalized;
    }
    try {
      await setDoc(doc(db, "settings", "system_settings"), removeUndefinedValues(normalized), { merge: true });
      saveSystemSettingsToCache(normalized);
      await writeAuditLog({ action: "update", module: "system_settings", targetId: "system_settings", targetLabel: "הגדרות מערכת", before, after: normalized });
      return normalized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "settings/system_settings");
      return normalized;
    }
  },


  async createAuditLog(entry: { action: AuditAction; module: AuditModule; targetId?: string; targetLabel?: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown> }) {
    await writeAuditLog(entry);
  },

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    if (!isFirebaseActive()) {
      return JSON.parse(localStorage.getItem("idf_audit_logs") || "[]");
    }
    try {
      const snapshot = await getDocs(query(collection(db, "system_logs"), orderBy("timestamp", "desc")));
      return snapshot.docs
        .filter((item) => item.data()?.logType === "audit")
        .map((item) => ({ id: item.id, ...item.data(), createdAt: item.data()?.createdAt || item.data()?.timestamp } as AuditLogEntry));
    } catch (error) {
      console.warn("Audit logs load failed:", error);
      return [];
    }
  },

  async getGoogleSheetsConfig(
    forceRefresh = false
  ): Promise<GoogleSheetsConfig> {
    if (!forceRefresh) {
      const cached = getGoogleSheetsConfigFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const localConfig =
        getGoogleSheetsConfigFromCache(true) ||
        normalizeGoogleSheetsConfig(DEFAULT_GOOGLE_SHEETS_CONFIG);
      saveGoogleSheetsConfigToCache(localConfig);
      return localConfig;
    }

    const path = "settings/google_sheets";

    try {
      const ref = doc(db, "settings", "google_sheets");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const config = normalizeGoogleSheetsConfig(snap.data());
        saveGoogleSheetsConfigToCache(config);
        return config;
      }

      const defaults = normalizeGoogleSheetsConfig(DEFAULT_GOOGLE_SHEETS_CONFIG);
      await setDoc(ref, {
        ...defaults,
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      });
      saveGoogleSheetsConfigToCache(defaults);
      return defaults;
    } catch (error) {
      console.error("Failed loading Google Sheets config:", error);
      const fallback =
        getGoogleSheetsConfigFromCache(true) ||
        normalizeGoogleSheetsConfig(DEFAULT_GOOGLE_SHEETS_CONFIG);
      saveGoogleSheetsConfigToCache(fallback);
      return fallback;
    }
  },

  async saveGoogleSheetsConfig(
    config: GoogleSheetsConfig,
    updatedBy?: string
  ): Promise<GoogleSheetsConfig> {
    const beforeConfig = await this.getGoogleSheetsConfig(true).catch(() => null);
    const normalized = normalizeGoogleSheetsConfig({
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
    });

    if (!isFirebaseActive()) {
      saveGoogleSheetsConfigToCache(normalized);
      await writeAuditLog({ action: "update", module: "google_sheets", targetId: "google_sheets", targetLabel: "Google Sheets", before: beforeConfig, after: normalized });
      return normalized;
    }

    const path = "settings/google_sheets";

    try {
      const firestoreSafeConfig = removeUndefinedValues(normalized);

      await setDoc(
        doc(db, "settings", "google_sheets"),
        firestoreSafeConfig,
        { merge: true }
      );
      saveGoogleSheetsConfigToCache(normalized);
      return normalized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      return normalized;
    }
  },

  async testGoogleSheetsConnection(
    config?: GoogleSheetsConfig
  ): Promise<{ success: boolean; message: string; testedAt: string }> {
    const effectiveConfig = normalizeGoogleSheetsConfig(
      config || (await this.getGoogleSheetsConfig(true))
    );
    const testedAt = new Date().toISOString();

    if (!effectiveConfig.webAppUrl) {
      return {
        success: false,
        message: "לא הוגדרה כתובת Web App.",
        testedAt,
      };
    }

    try {
      await fetch(effectiveConfig.webAppUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "connection_test",
          source: "attendance_system",
          timestamp: testedAt,
        }),
      });

      return {
        success: true,
        message: "הבקשה נשלחה בהצלחה ל־Google Sheets Web App.",
        testedAt,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "בדיקת החיבור נכשלה.",
        testedAt,
      };
    }
  },
  async getSystemRoleConfigs(
    forceRefresh = false
  ): Promise<SystemRoleConfig[]> {
    if (!forceRefresh) {
      const cached = getSystemRolesFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const roles =
        getSystemRolesFromCache(true) || cloneDefaultSystemRoles();
      saveSystemRolesToCache(roles);
      return roles;
    }

    const path = "settings/system_roles";

    try {
      const ref = doc(db, "settings", "system_roles");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const roles = normalizeSystemRoleConfigs(snap.data()?.roles);
        saveSystemRolesToCache(roles);
        return roles;
      }

      const defaults = cloneDefaultSystemRoles();
      await setDoc(ref, {
        roles: defaults,
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      });
      saveSystemRolesToCache(defaults);
      return defaults;
    } catch (error) {
      console.error("Failed loading system roles:", error);
      const fallback =
        getSystemRolesFromCache(true) || cloneDefaultSystemRoles();
      saveSystemRolesToCache(fallback);
      return fallback;
    }
  },

  async saveSystemRoleConfigs(
    roles: SystemRoleConfig[],
    updatedBy?: string
  ): Promise<SystemRoleConfig[]> {
    const beforeValue = await this.getSystemRoleConfigs(true).catch(() => []);
    const normalized = removeUndefinedValues(
      normalizeSystemRoleConfigs(roles).map((role) => ({
        ...role,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
      }))
    );

    if (!isFirebaseActive()) {
      saveSystemRolesToCache(normalized);
      return normalized;
    }

    const path = "settings/system_roles";

    try {
      await setDoc(
        doc(db, "settings", "system_roles"),
        removeUndefinedValues({
          roles: normalized,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
        }),
        { merge: true }
      );

      saveSystemRolesToCache(normalized);
      await writeAuditLog({
        action: "update",
        module: "permissions",
        targetId: "system_roles",
        targetLabel: "תפקידי מערכת",
        before: beforeValue,
        after: normalized,
      });
      return normalized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      return normalized;
    }
  },

  async getRolePermissionConfigs(
    forceRefresh = false
  ): Promise<RolePermissionConfig[]> {
    if (!forceRefresh) {
      const cached = getRolePermissionsFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const localConfigs =
        getRolePermissionsFromCache(true) || cloneDefaultRolePermissions();
      saveRolePermissionsToCache(localConfigs);
      return localConfigs;
    }

    const path = "settings/role_permissions";

    try {
      const ref = doc(db, "settings", "role_permissions");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const configs = normalizeRolePermissionConfigs(
          snap.data()?.roles
        );
        saveRolePermissionsToCache(configs);
        return configs;
      }

      const defaults = cloneDefaultRolePermissions();
      await setDoc(ref, {
        roles: defaults,
        roleMap: Object.fromEntries(
          defaults.map((config) => [config.systemRole, config.permissions])
        ),
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      });
      saveRolePermissionsToCache(defaults);
      return defaults;
    } catch (error) {
      console.error("Failed loading role permissions:", error);
      const fallback =
        getRolePermissionsFromCache(true) || cloneDefaultRolePermissions();
      saveRolePermissionsToCache(fallback);
      return fallback;
    }
  },

  async saveRolePermissionConfigs(
    configs: RolePermissionConfig[],
    updatedBy?: string
  ): Promise<RolePermissionConfig[]> {
    const beforeValue = await this.getRolePermissionConfigs(true).catch(() => []);
    const normalized = normalizeRolePermissionConfigs(configs).map(
      (config) => ({
        ...config,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
      })
    );

    if (!isFirebaseActive()) {
      saveRolePermissionsToCache(normalized);
      return normalized;
    }

    const path = "settings/role_permissions";

    try {
      const roleMap = Object.fromEntries(
        normalized.map((config) => [config.systemRole, config.permissions])
      );

      await setDoc(
        doc(db, "settings", "role_permissions"),
        {
          roles: normalized,
          roleMap,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
        },
        { merge: true }
      );

      saveRolePermissionsToCache(normalized);
      await writeAuditLog({ action: "update", module: "permissions", targetId: "settings", targetLabel: "הרשאות", before: beforeValue, after: normalized });
      return normalized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      return normalized;
    }
  },

  async getUnitConfigs(forceRefresh = false): Promise<UnitConfig[]> {
    if (!forceRefresh) {
      const cached = getUnitConfigsFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const localUnits = getUnitConfigsFromCache(true) || cloneDefaultUnitConfigs();
      saveUnitConfigsToCache(localUnits);
      return localUnits;
    }

    const path = "settings/unit_configs";

    try {
      const ref = doc(db, "settings", "unit_configs");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const units = normalizeUnitConfigs(snap.data()?.units);
        saveUnitConfigsToCache(units);
        return units;
      }

      // Migration: preserve units already stored in the older medical_config document.
      const legacySnap = await getDoc(doc(db, "settings", "medical_config"));
      const legacyUnits = legacySnap.exists() && Array.isArray(legacySnap.data()?.medicalUnits)
        ? legacySnap.data().medicalUnits
        : IDF_UNITS;
      const initialUnits = normalizeUnitConfigs(
        legacyUnits.map((name: string, index: number) => ({
          id: makeUnitId(name, index),
          name,
          enabled: true,
          sortOrder: index + 1,
          systemUnit: index === 0,
        }))
      );

      await setDoc(ref, {
        units: initialUnits,
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      });

      saveUnitConfigsToCache(initialUnits);
      return initialUnits;
    } catch (error) {
      console.error("Failed loading unit settings:", error);
      const fallback = getUnitConfigsFromCache(true) || cloneDefaultUnitConfigs();
      saveUnitConfigsToCache(fallback);
      return fallback;
    }
  },

  async saveUnitConfigs(
    units: UnitConfig[],
    updatedBy?: string
  ): Promise<UnitConfig[]> {
    const beforeValue = await this.getUnitConfigs(true).catch(() => []);
    const normalized = normalizeUnitConfigs(units).map((unit) => ({
      ...unit,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
    }));

    if (!isFirebaseActive()) {
      saveUnitConfigsToCache(normalized);
      await writeAuditLog({
        action: "update",
        module: "units",
        targetId: "settings",
        targetLabel: "יחידות",
        before: beforeValue,
        after: normalized,
        metadata: buildCollectionAuditMetadata(beforeValue, normalized),
      });
      return normalized;
    }

    const path = "settings/unit_configs";

    try {
      await setDoc(
        doc(db, "settings", "unit_configs"),
        {
          units: normalized,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
        },
        { merge: true }
      );

      saveUnitConfigsToCache(normalized);
      await writeAuditLog({
        action: "update",
        module: "units",
        targetId: "settings",
        targetLabel: "יחידות",
        before: beforeValue,
        after: normalized,
        metadata: buildCollectionAuditMetadata(beforeValue, normalized),
      });
      return normalized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      return normalized;
    }
  },

  async getMedicalRoleConfigs(forceRefresh = false): Promise<MedicalRoleConfig[]> {
    if (!forceRefresh) {
      const cached = getMedicalRoleConfigsFromCache();
      if (cached) return cached;
    }

    if (!isFirebaseActive()) {
      const localRoles = getMedicalRoleConfigsFromCache(true) || cloneDefaultMedicalRoleConfigs();
      saveMedicalRoleConfigsToCache(localRoles);
      return localRoles;
    }

    const path = "settings/medical_role_configs";

    try {
      const ref = doc(db, "settings", "medical_role_configs");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const roles = normalizeMedicalRoleConfigs(snap.data()?.roles);
        saveMedicalRoleConfigsToCache(roles);
        return roles;
      }

      const legacySnap = await getDoc(doc(db, "settings", "medical_config"));
      const legacyRoles = legacySnap.exists() && Array.isArray(legacySnap.data()?.customRoles)
        ? legacySnap.data().customRoles
        : DEFAULT_MEDICAL_ROLE_CONFIGS.map((role) => role.name);
      const initialRoles = normalizeMedicalRoleConfigs(
        legacyRoles.map((name: string, index: number) => ({
          id: makeMedicalRoleId(name, index),
          name,
          enabled: true,
          sortOrder: index + 1,
        }))
      );

      await setDoc(ref, {
        roles: initialRoles,
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      });

      saveMedicalRoleConfigsToCache(initialRoles);
      return initialRoles;
    } catch (error) {
      console.error("Failed loading medical role settings:", error);
      const fallback = getMedicalRoleConfigsFromCache(true) || cloneDefaultMedicalRoleConfigs();
      saveMedicalRoleConfigsToCache(fallback);
      return fallback;
    }
  },

  async saveMedicalRoleConfigs(
    roles: MedicalRoleConfig[],
    updatedBy?: string
  ): Promise<MedicalRoleConfig[]> {
    const beforeValue = await this.getMedicalRoleConfigs(true).catch(() => []);
    const normalized = normalizeMedicalRoleConfigs(roles).map((role) => ({
      ...role,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
    }));

    if (!isFirebaseActive()) {
      saveMedicalRoleConfigsToCache(normalized);
      await writeAuditLog({
        action: "update",
        module: "medical_roles",
        targetId: "settings",
        targetLabel: "תפקידי רפואה",
        before: beforeValue,
        after: normalized,
        metadata: buildCollectionAuditMetadata(beforeValue, normalized),
      });
      return normalized;
    }

    const path = "settings/medical_role_configs";

    try {
      await setDoc(
        doc(db, "settings", "medical_role_configs"),
        {
          roles: normalized,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy || auth?.currentUser?.uid || "unknown",
        },
        { merge: true }
      );

      saveMedicalRoleConfigsToCache(normalized);
      await writeAuditLog({
        action: "update",
        module: "medical_roles",
        targetId: "settings",
        targetLabel: "תפקידי רפואה",
        before: beforeValue,
        after: normalized,
        metadata: buildCollectionAuditMetadata(beforeValue, normalized),
      });
      return normalized;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      return normalized;
    }
  },

  async getAttendanceStatusConfigs(
    forceRefresh = false
  ): Promise<AttendanceStatusConfig[]> {
    if (!forceRefresh) {
      const cachedStatuses = getAttendanceStatusesFromCache();
      if (cachedStatuses) return cachedStatuses;
    }

    if (!isFirebaseActive()) {
      const localStatuses =
        getAttendanceStatusesFromCache(true) ||
        cloneDefaultAttendanceStatuses();

      saveAttendanceStatusesToCache(localStatuses);
      return localStatuses;
    }

    const settingsPath = "settings/attendance_statuses";

    try {
      const settingsRef = doc(db, "settings", "attendance_statuses");
      const settingsSnap = await getDoc(settingsRef);

      if (settingsSnap.exists()) {
        const statuses = normalizeAttendanceStatusConfigs(
          settingsSnap.data()?.statuses
        );

        saveAttendanceStatusesToCache(statuses);
        return statuses;
      }

      const defaultStatuses = cloneDefaultAttendanceStatuses();

      await setDoc(settingsRef, {
        statuses: defaultStatuses,
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "SYSTEM_INIT",
      });

      saveAttendanceStatusesToCache(defaultStatuses);
      return defaultStatuses;
    } catch (error) {
      console.error(
        "Failed loading attendance status settings:",
        error
      );

      const fallbackStatuses =
        getAttendanceStatusesFromCache(true) ||
        cloneDefaultAttendanceStatuses();

      saveAttendanceStatusesToCache(fallbackStatuses);
      return fallbackStatuses;
    }
  },

  async saveAttendanceStatusConfigs(
    statuses: AttendanceStatusConfig[],
    updatedBy?: string
  ): Promise<AttendanceStatusConfig[]> {
    const beforeValue = await this.getAttendanceStatusConfigs(true).catch(() => []);
    const normalizedStatuses = normalizeAttendanceStatusConfigs(statuses);

    if (!isFirebaseActive()) {
      saveAttendanceStatusesToCache(normalizedStatuses);
      await writeAuditLog({
        action: "update",
        module: "attendance_statuses",
        targetId: "settings",
        targetLabel: "סטטוסי נוכחות",
        before: beforeValue,
        after: normalizedStatuses,
        metadata: buildCollectionAuditMetadata(beforeValue, normalizedStatuses),
      });
      return normalizedStatuses;
    }

    const settingsPath = "settings/attendance_statuses";

    try {
      await setDoc(
        doc(db, "settings", "attendance_statuses"),
        {
          statuses: normalizedStatuses,
          updatedAt: new Date().toISOString(),
          updatedBy:
            updatedBy || auth?.currentUser?.uid || "unknown",
        },
        { merge: true }
      );

      saveAttendanceStatusesToCache(normalizedStatuses);
      await writeAuditLog({
        action: "update",
        module: "attendance_statuses",
        targetId: "settings",
        targetLabel: "סטטוסי נוכחות",
        before: beforeValue,
        after: normalizedStatuses,
        metadata: buildCollectionAuditMetadata(beforeValue, normalizedStatuses),
      });
      return normalizedStatuses;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        settingsPath
      );
      return normalizedStatuses;
    }
  },

  async deleteAttendanceReport(reportId: string): Promise<void> {
  if (!isFirebaseActive()) {
    const reports: AttendanceReport[] = JSON.parse(localStorage.getItem("idf_reports") || "[]");
    const filtered = reports.filter(r => r.reportId !== reportId);
    localStorage.setItem("idf_reports", JSON.stringify(filtered));
    return;
  }

  const path = `attendance/${reportId}`;
  try {
    await deleteDoc(doc(db, "attendance", reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
},
  // --- USER AUTHENTICATION & PROFILE METHODS ---
  
  async getCurrentUserProfile(testUserId?: string): Promise<UserProfile | null> {
    if (!isFirebaseActive()) {
      // In simulation mode, fetch the current active profile or null if not set yet
      const storedActiveId = localStorage.getItem("idf_active_user_id") || testUserId;
      if (!storedActiveId) return null;
      const profiles: UserProfile[] = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
      const found = profiles.find(p => p.userId === storedActiveId);
      return found || null;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;

      const path = `users/${currentUser.uid}`;
      const docSnap = await getDoc(doc(db, "users", currentUser.uid));
      
      if (docSnap.exists()) {
        return docSnap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${auth?.currentUser?.uid}`);
      return null;
    }
  },

  async findProfileByPersonalId(personalId: string): Promise<UserProfile | null> {
  const cleanId = personalId.trim();

  // אם Firebase פעיל — מחפשים קודם רק ב-Firebase
  if (isFirebaseActive() && db) {
    try {
      const q = query(collection(db, "users"), where("personalId", "==", cleanId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data() as UserProfile;

        return {
          ...data,
          userId: docSnap.id,
        } as UserProfile;
      }
    } catch (error) {
      console.error("Error finding profile by personalId in firestore:", error);
    }

    return null;
  }

  // רק אם Firebase לא פעיל — להשתמש בסימולציה
  const profiles: UserProfile[] = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
  const foundLocal = profiles.find(p => p.personalId === cleanId);
  return foundLocal || null;
},

  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (!isFirebaseActive()) {
      const profiles: UserProfile[] = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
      const index = profiles.findIndex(p => p.userId === profile.userId);
      if (index > -1) {
        profiles[index] = profile;
      } else {
        profiles.push(profile);
      }
      localStorage.setItem("idf_profiles", JSON.stringify(profiles));
      localStorage.setItem("idf_active_user_id", profile.userId);
      return;
    }

    const path = `users/${profile.userId}`;
    try {
      await setDoc(doc(db, "users", profile.userId), profile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async adminSaveUserProfile(profile: UserProfile): Promise<void> {
    if (!isFirebaseActive()) {
      const profiles: UserProfile[] = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
      const index = profiles.findIndex(p => p.userId === profile.userId);
      if (index > -1) {
        profiles[index] = profile;
      } else {
        profiles.push(profile);
      }
      localStorage.setItem("idf_profiles", JSON.stringify(profiles));
      return;
    }

    const path = `users/${profile.userId}`;
    try {
      await setDoc(doc(db, "users", profile.userId), profile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },
  async updateUserSystemRole(
    userId: string,
    systemRole: SystemRole,
    systemRoleAccessLevel?: SystemRoleAccessLevel
  ): Promise<void> {
    if (!userId) {
      throw new Error("Missing userId for system role update");
    }

    if (!isFirebaseActive()) {
      const profiles: UserProfile[] = JSON.parse(
        localStorage.getItem("idf_profiles") || "[]"
      );
      const index = profiles.findIndex((profile) => profile.userId === userId);

      if (index === -1) {
        throw new Error("User profile not found");
      }

      profiles[index] = {
        ...profiles[index],
        systemRole,
        systemRoleAccessLevel:
          systemRoleAccessLevel ||
          (systemRole === "super_admin" || systemRole === "admin"
            ? "admin"
            : systemRole === "viewer"
            ? "viewer"
            : "reporter"),
      };

      localStorage.setItem("idf_profiles", JSON.stringify(profiles));
      return;
    }

    const path = `users/${userId}`;

    let beforeUser: any = null;
    try {
      const beforeSnap = await getDoc(doc(db, "users", userId));
      beforeUser = beforeSnap.exists() ? beforeSnap.data() : null;
      const resolvedAccessLevel: SystemRoleAccessLevel =
        systemRoleAccessLevel ||
        (systemRole === "super_admin" || systemRole === "admin"
          ? "admin"
          : systemRole === "viewer"
          ? "viewer"
          : "reporter");

      await updateDoc(doc(db, "users", userId), {
        systemRole,
        systemRoleAccessLevel: resolvedAccessLevel,
        systemRoleUpdatedAt: new Date().toISOString(),
        systemRoleUpdatedBy: auth?.currentUser?.uid || "unknown",
      });
      await writeAuditLog({ action: "update", module: "users", targetId: userId, targetLabel: beforeUser?.fullName || userId, before: beforeUser, after: { ...beforeUser, systemRole, systemRoleAccessLevel: resolvedAccessLevel } });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async getSystemLogs(): Promise<any[]> {
  if (!isFirebaseActive()) {
    return JSON.parse(
      localStorage.getItem("idf_system_logs") || "[]"
    );
  }

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "system_logs"),
        orderBy("timestamp", "desc")
      )
    );

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      logId: doc.id,
    }));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.LIST,
      "system_logs"
    );
    return [];
  }
},
async createSystemLog(logData: {
  action:
    | "add_soldier"
    | "edit_soldier"
    | "delete_soldier"
    | "create_report"
    | "edit_report"
    | "delete_report"
    | "reset_report";
  actorUserId: string;
  actorName: string;
  targetUserId?: string;
  targetName?: string;
  details?: string;
}): Promise<void> {
  if (!isFirebaseActive()) {
    const payload = {
      ...logData,
      timestamp: new Date().toISOString(),
    };

    const logs = JSON.parse(localStorage.getItem("idf_system_logs") || "[]");
    logs.unshift({
      logId: `log_${Date.now()}`,
      ...payload,
    });
    localStorage.setItem("idf_system_logs", JSON.stringify(logs));
    return;
  }

  try {
    const logRef = doc(collection(db, "system_logs"));
    await setDoc(logRef, {
      logId: logRef.id,
      ...logData,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "system_logs");
  }
},
  
  async deleteUserProfile(userId: string): Promise<void> {
    if (!isFirebaseActive()) {
      const profiles: UserProfile[] = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
      const filtered = profiles.filter(p => p.userId !== userId);
      localStorage.setItem("idf_profiles", JSON.stringify(filtered));
      return;
    }

    const path = `users/${userId}`;
    try {
      await deleteDoc(doc(db, "users", userId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async getAllUsers(): Promise<UserProfile[]> {
    if (!isFirebaseActive()) {
      const stored = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
      // Merge defaults with stored changes
      const all = [...DEFAULT_SIMULATED_PROFILES];
      stored.forEach((s: UserProfile) => {
        const idx = all.findIndex(a => a.userId === s.userId);
        if (idx > -1) all[idx] = s;
        else all.push(s);
      });
      return all;
    }

    const path = "users";
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const list: UserProfile[] = [];
     querySnapshot.forEach((docSnap) => {
  const data = docSnap.data() as UserProfile;
  list.push({
    ...data,
    userId: docSnap.id,
  });
});
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  // Helper to switch simulated active user inside the live app preview
  switchSimulatedUser(userId: string): void {
    localStorage.setItem("idf_active_user_id", userId);
  },

  // --- ATTENDANCE REPORTS METHODS ---

  async fetchAllReports(): Promise<AttendanceReport[]> {
    if (!isFirebaseActive()) {
      const reports = JSON.parse(localStorage.getItem("idf_reports") || "[]");
      // Sort descending by timestamp
      return reports.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const path = "attendance";
    try {
      const q = query(collection(db, "attendance"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const list: AttendanceReport[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({
  reportId: docSnap.id,
  ...normalizeReportDates(docSnap.data()),
} as AttendanceReport);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },
  async syncAllReportsToGoogleSheets(
    startDate?: string,
    endDate?: string
  ): Promise<GoogleSheetsSyncResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const googleSheetsConfig = await this.getGoogleSheetsConfig(true);

    const buildResult = (
      status: "success" | "partial" | "error",
      sentCount: number,
      failedCount: number,
      errorMessage?: string,
      foundCount = 0,
      skippedCount = 0,
      skippedReasons: Record<string, number> = {}
    ): GoogleSheetsSyncResult => ({
      status,
      sentCount,
      failedCount,
      foundCount,
      skippedCount,
      skippedReasons,
      durationMs: Date.now() - startedMs,
      startedAt,
      completedAt: new Date().toISOString(),
      startDate,
      endDate,
      errorMessage,
    });

    const persistResult = async (result: GoogleSheetsSyncResult) => {
      const historyItem: GoogleSheetsSyncHistoryItem = {
        id: `sheets_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        startDate: result.startDate,
        endDate: result.endDate,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        foundCount: result.foundCount,
        skippedCount: result.skippedCount,
        skippedReasons: result.skippedReasons,
        durationMs: result.durationMs,
        status: result.status,
        errorMessage: result.errorMessage,
      };

      await this.saveGoogleSheetsConfig(
        {
          ...googleSheetsConfig,
          lastSyncAt: result.completedAt,
          lastSyncStatus: result.status,
          lastSyncStartDate: startDate,
          lastSyncEndDate: endDate,
          lastSyncSentCount: result.sentCount,
          lastSyncFailedCount: result.failedCount,
          lastSyncFoundCount: result.foundCount || 0,
          lastSyncSkippedCount: result.skippedCount || 0,
          lastSyncSkippedReasons: result.skippedReasons || {},
          lastSyncDurationMs: result.durationMs,
          lastSyncError: result.errorMessage || "",
          syncHistory: [historyItem, ...(googleSheetsConfig.syncHistory || [])].slice(0, 20),
        },
        auth?.currentUser?.uid || "SYSTEM_SYNC"
      );
      await writeAuditLog({ action: "sync", module: "google_sheets", targetId: historyItem.id, targetLabel: `${startDate || ""}–${endDate || ""}`, after: result });
      return result;
    };

    if (!googleSheetsConfig.enabled) {
      return persistResult(buildResult("error", 0, 0, "הסנכרון ל־Google Sheets כבוי."));
    }

    if (!googleSheetsConfig.webAppUrl) {
      return persistResult(buildResult("error", 0, 0, "לא הוגדרה כתובת Google Sheets Web App."));
    }

    try {
      const reports = await this.fetchAllReports();
      const users = await this.getAllUsers();
      const attendanceStatusConfigs = await this.getAttendanceStatusConfigs();
      const attendanceStatusById = new Map(
        attendanceStatusConfigs.map((status) => [status.id, status])
      );

      const skippedReasons: Record<string, number> = {
        reset: 0,
        statusNotExported: 0,
        missingUser: 0,
        missingDate: 0,
        duplicate: 0,
      };

      /*
       * תחילה מסננים רק לפי טווח התאריכים. דיווחים שמחוץ לטווח
       * אינם נחשבים "דולגו" — הם פשוט לא היו מועמדים לסנכרון.
       */
      const reportsInSelectedRange = reports.filter((report) => {
        const reportDate =
          (report as any).reportDate ||
          (typeof report.timestamp === "string"
            ? report.timestamp.split("T")[0]
            : "");

        if (!reportDate) return false;
        if (startDate && reportDate < startDate) return false;
        if (endDate && reportDate > endDate) return false;
        return true;
      });

      /*
       * רק בתוך הטווח סופרים סיבות דילוג אמיתיות.
       */
      const activeReports: AttendanceReport[] = [];
      reportsInSelectedRange.forEach((report) => {
        if ((report as any).isReset) {
          skippedReasons.reset++;
          return;
        }

        if (!report.userId) {
          skippedReasons.missingUser++;
          return;
        }

        const statusConfig = attendanceStatusById.get(report.status);
        if (statusConfig?.exportToSheets === false) {
          skippedReasons.statusNotExported++;
          return;
        }

        const reportDate =
          (report as any).reportDate ||
          (typeof report.timestamp === "string"
            ? report.timestamp.split("T")[0]
            : "");

        if (!reportDate) {
          skippedReasons.missingDate++;
          return;
        }

        activeReports.push(report);
      });

      const latestReportBySoldierAndDate = new Map<string, AttendanceReport>();
      activeReports.forEach((report) => {
        const soldier = users.find((user) =>
          user.userId === report.userId || user.personalId === (report as any).personalId
        );
        const stablePersonalId = getSheetsPersonalId(
          soldier?.personalId,
          (report as any).personalId
        );
        const reportDate = (report as any).reportDate ||
          (typeof report.timestamp === "string" ? report.timestamp.split("T")[0] : "");
        if (!stablePersonalId || !reportDate) return;
        const key = `${stablePersonalId}_${reportDate}`;
        const existing = latestReportBySoldierAndDate.get(key);
        const reportTime = new Date(report.updatedAt || report.timestamp || 0).getTime();
        const existingTime = existing
          ? new Date(existing.updatedAt || existing.timestamp || 0).getTime()
          : 0;
        if (!existing || reportTime >= existingTime) {
          if (existing) skippedReasons.duplicate++;
          latestReportBySoldierAndDate.set(key, report);
        } else {
          skippedReasons.duplicate++;
        }
      });

      const reportsToSync = Array.from(latestReportBySoldierAndDate.values());
      if (reportsToSync.length === 0) {
        return persistResult(
          buildResult(
            "success",
            0,
            0,
            undefined,
            reportsInSelectedRange.length,
            Object.values(skippedReasons).reduce((a, b) => a + b, 0),
            skippedReasons
          )
        );
      }

      const userById = new Map(users.map((user) => [user.userId, user]));
      const userByPersonalId = new Map(
        users.filter((user) => !!user.personalId).map((user) => [String(user.personalId), user])
      );

      const createPayload = (report: AttendanceReport) => {
        const soldier = userById.get(report.userId) ||
          userByPersonalId.get(String((report as any).personalId || ""));
        const stablePersonalId = getSheetsPersonalId(
          soldier?.personalId,
          (report as any).personalId
        );
        const reportDate = (report as any).reportDate ||
          (typeof report.timestamp === "string" ? report.timestamp.split("T")[0] : "");
        if (!stablePersonalId || !reportDate) return null;

        const markerText = report.dayMarker === "return_to_base"
          ? "חזרה לבסיס"
          : report.dayMarker === "exit_home"
          ? "יציאה לבית"
          : report.dayMarker === "after_hours"
          ? `אפטר ${report.afterHours || ""} שעות`
          : "";
        const statusText = attendanceStatusById.get(report.status)?.label ||
          ATTENDANCE_STATUS_LABELS[report.status]?.label || report.status;
        const [year, month, day] = reportDate.split("-");
        const formattedDate = year && month && day
          ? `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`
          : reportDate;

        return {
          personalId: stablePersonalId,
          fullName: soldier?.fullName || report.userName || "",
          medicalRole: soldier?.medicalRole || "",
          role: soldier?.medicalRole || "",
          phone: soldier?.phoneNumber || "",
          date: formattedDate,
          cellValue: markerText ? `${statusText}/${markerText}` : statusText,
          reportId: report.reportId,
        };
      };

      const fetchWithTimeout = async (payload: Record<string, unknown>) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12000);
        try {
          await fetch(googleSheetsConfig.webAppUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          return true;
        } catch (error) {
          console.warn("Google Sheets historical sync failed:", error);
          return false;
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      let sentCount = 0;
      let failedCount = 0;
      const batchSize = 5;
      for (let index = 0; index < reportsToSync.length; index += batchSize) {
        const batch = reportsToSync.slice(index, index + batchSize);
        const results = await Promise.all(
          batch.map(async (report) => {
            const payload = createPayload(report);
            return payload ? fetchWithTimeout(payload) : false;
          })
        );
        sentCount += results.filter(Boolean).length;
        failedCount += results.filter((success) => !success).length;
      }

      const status = failedCount === 0 ? "success" : sentCount > 0 ? "partial" : "error";
      const skippedCount = Object.values(skippedReasons).reduce((total, count) => total + count, 0);
      return persistResult(buildResult(
        status,
        sentCount,
        failedCount,
        status === "error" ? "כל הדיווחים נכשלו בשליחה." : undefined,
        reportsInSelectedRange.length,
        skippedCount,
        skippedReasons
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "הסנכרון נכשל.";
      return persistResult(buildResult("error", 0, 0, message));
    }
  },

  async fetchReportsByUser(userId: string): Promise<AttendanceReport[]> {
    if (!isFirebaseActive()) {
      const reports: AttendanceReport[] = JSON.parse(localStorage.getItem("idf_reports") || "[]");
      return reports
        .filter(r => r.userId === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const path = "attendance";
    try {
      const q = query(
        collection(db, "attendance"), 
        where("userId", "==", userId),
        orderBy("timestamp", "desc")
      );
      const querySnapshot = await getDocs(q);
      const list: AttendanceReport[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({
  reportId: docSnap.id,
  ...normalizeReportDates(docSnap.data()),
} as AttendanceReport);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async createAttendanceReport(reportData: Omit<AttendanceReport, "reportId">): Promise<string> {
    const currentSystemSettings = await this.getSystemSettings(true);
    if (currentSystemSettings.reportingEnabled === false) {
      const actor = await getAuditActor();
      const actorRole = actor.actorRole as SystemRole;
      const allowedRoles =
        currentSystemSettings.reportingClosedAllowedRoles || [];

      if (!allowedRoles.includes(actorRole)) {
        throw new Error(
          currentSystemSettings.reportingClosedMessage ||
            "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס."
        );
      }
    }

    const attendanceStatusConfigs = await this.getAttendanceStatusConfigs();
    const selectedStatusConfig = attendanceStatusConfigs.find(
      (status) => status.id === reportData.status
    );
    const requiresCommanderApproval =
      selectedStatusConfig?.requiresCommanderApproval === true;

    const reportPayload: AttendanceReport = {
      ...reportData,
      reportId: "",
      verifiedBy: requiresCommanderApproval
        ? undefined
        : reportData.verifiedBy || "SYSTEM_AUTO",
      verifiedAt: requiresCommanderApproval
        ? undefined
        : reportData.verifiedAt || new Date().toISOString()
    };

Object.keys(reportPayload).forEach((key) => {
  if ((reportPayload as any)[key] === undefined) {
    delete (reportPayload as any)[key];
  }
});
    const isAlert = reportPayload.status !== "base";
    const statusLabel =
      selectedStatusConfig?.label ||
      ATTENDANCE_STATUS_LABELS[reportPayload.status]?.label ||
      reportPayload.status;
    const notificationMsg = `החייל/ת ${reportPayload.userName} דיווח/ה על סטטוס ${statusLabel} מחוץ לבסיס במיקום: ${reportPayload.location}`;
    
    if (!isFirebaseActive()) {
      const reportId = `rep_${Date.now()}`;
      const reports: AttendanceReport[] = JSON.parse(localStorage.getItem("idf_reports") || "[]");
      const newReport: AttendanceReport = {
        ...reportPayload,
        reportId
      };
      reports.push(newReport);
      localStorage.setItem("idf_reports", JSON.stringify(reports));

      // Generate simulation notification
      if (isAlert) {
        const notifications: AppNotification[] = JSON.parse(localStorage.getItem("idf_notifications") || "[]");
        const newNot: AppNotification = {
          notificationId: `not_${Date.now()}`,
          reportId,
          userId: reportPayload.userId,
          soldierName: reportPayload.userName,
          unit: reportPayload.unit,
          status: reportPayload.status,
          location: reportPayload.location,
          timestamp: reportPayload.timestamp,
          isRead: false,
          message: notificationMsg
        };
        notifications.unshift(newNot);
        localStorage.setItem("idf_notifications", JSON.stringify(notifications));
      }

      return reportId;
    }

    const path = "attendance";
    try {
     const reportDateForLookup =
  reportPayload.reportDate ||
  (typeof reportPayload.timestamp === "string"
    ? reportPayload.timestamp.split("T")[0]
    : new Date().toISOString().split("T")[0]);

const existingQuery = query(
  collection(db, "attendance"),
  where("userId", "==", reportPayload.userId),
  where("reportDate", "==", reportDateForLookup)
);

const existingSnapshot = await getDocs(existingQuery);

// מחפשים רק דיווח פעיל שאינו מאופס
const existingActiveDoc = existingSnapshot.docs.find(
  (existingDoc) => existingDoc.data().isReset !== true
);

// אם קיים רק דיווח מאופס, יוצרים מסמך חדש
const docRef = existingActiveDoc
  ? doc(db, "attendance", existingActiveDoc.id)
  : doc(collection(db, "attendance"));

await setDoc(
  docRef,
  {
    ...reportPayload,
    reportId: docRef.id,
    reportDate: reportDateForLookup,
    timestamp: reportPayload.timestamp || new Date().toISOString(),
    verifiedAt: requiresCommanderApproval
      ? null
      : reportPayload.verifiedAt || new Date().toISOString(),
    verifiedBy: requiresCommanderApproval
      ? null
      : reportPayload.verifiedBy || "SYSTEM_AUTO",
    updatedAt: new Date().toISOString(),

    // דיווח חדש מבטל מצב איפוס קודם
    isReset: false,
resetAt: null,
resetBy: null,
resetByName: null,
  },
  { merge: true }
);
      const statusText =
  selectedStatusConfig?.label ||
  ATTENDANCE_STATUS_LABELS[reportPayload.status]?.label ||
  reportPayload.status;
      await this.createSystemLog({
  action: existingActiveDoc ? "edit_report" : "create_report",
  actorUserId: reportPayload.createdBy || "unknown",
  actorName: reportPayload.createdByName || "לא ידוע",
  targetUserId: reportPayload.userId,
  targetName: reportPayload.userName,
  details: `${statusText} | ${reportDateForLookup}`,
});
const users = await this.getAllUsers();

const soldier = users.find(
  (u) =>
    u.userId === reportPayload.userId ||
    u.personalId === (reportPayload as any).personalId
);

const markerText =
  reportPayload.dayMarker === "return_to_base"
    ? "חזרה לבסיס"
    : reportPayload.dayMarker === "exit_home"
    ? "יציאה לבית"
    : reportPayload.dayMarker === "after_hours"
    ? `אפטר ${reportPayload.afterHours || ""} שעות`
    : "";


const reportDateObj = new Date(`${reportDateForLookup}T12:00:00`);
const formattedDate = `${String(reportDateObj.getDate()).padStart(2, "0")}/${String(
  reportDateObj.getMonth() + 1
).padStart(2, "0")}/${reportDateObj.getFullYear()}`;

const personalIdForSheets = getSheetsPersonalId(
  soldier?.personalId,
  (reportPayload as any).personalId
);

const googleSheetsConfig = await this.getGoogleSheetsConfig();

if (
  googleSheetsConfig.enabled &&
  !!googleSheetsConfig.webAppUrl &&
  selectedStatusConfig?.exportToSheets !== false &&
  personalIdForSheets
) {
  try {
    await fetch(googleSheetsConfig.webAppUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        personalId: personalIdForSheets,
        fullName: soldier?.fullName || reportPayload.userName,
        role: soldier?.medicalRole || "",
        phone: soldier?.phoneNumber || "",
        date: formattedDate,
        cellValue: markerText ? `${statusText}/${markerText}` : statusText,
      }),
    });
  } catch (err) {
    console.warn("Google Sheets sync failed:", err);
  }
} else if (
  selectedStatusConfig?.exportToSheets !== false &&
  !personalIdForSheets
) {
  console.warn(
    "Google Sheets sync skipped: missing numeric personalId",
    docRef.id,
    reportPayload.userName
  );
}
      // Generate Firestore notification
      if (isAlert) {
        const notPayload = {
  reportId: docRef.id,
  userId: reportPayload.userId,
  soldierName: reportPayload.userName,
  unit: reportPayload.unit,
  status: reportPayload.status,
  location: reportPayload.location,
  timestamp: new Date().toISOString(),
  reportTimestamp: reportPayload.timestamp,
  reportDate: reportPayload.reportDate,
  isRead: false,
  message: notificationMsg
        };
        const notRef = doc(collection(db, "notifications"));

await setDoc(notRef, {
  ...notPayload,
  notificationId: notRef.id
});
      }

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return "";
    }
  },

  async updateAttendanceReport(
  reportId: string,
  reportData: Partial<AttendanceReport>,
  updatedByProfile?: UserProfile
): Promise<void> {

    const updatedAt = new Date().toISOString();

const finalReportData = {
  ...reportData,
  updatedAt,
  updatedBy: updatedByProfile?.userId || auth?.currentUser?.uid || "unknown",
  updatedByName: updatedByProfile?.fullName || (updatedByProfile as any)?.name || "לא ידוע",
  updatedByRole: updatedByProfile?.role || "unknown",
};

  const updateLog = {
  reportId,
  oldData: {},
  newData: finalReportData,
  updatedAt,
  updatedBy: finalReportData.updatedBy,
  updatedByName: finalReportData.updatedByName,
  updatedByRole: finalReportData.updatedByRole,
};

  if (!isFirebaseActive()) {
    const reports: AttendanceReport[] = JSON.parse(localStorage.getItem("idf_reports") || "[]");
    const index = reports.findIndex(r => r.reportId === reportId);

    if (index > -1) {
      reports[index] = { ...reports[index], ...finalReportData };
      localStorage.setItem("idf_reports", JSON.stringify(reports));

      const logs: any[] = JSON.parse(localStorage.getItem("idf_attendance_logs") || "[]");
      logs.unshift(updateLog);
      localStorage.setItem("idf_attendance_logs", JSON.stringify(logs));
    }

    return;
  }

  const path = `attendance/${reportId}`;
 
 try {
  await updateDoc(
    doc(db, "attendance", reportId),
    finalReportData
  );

  const updatedSnap = await getDoc(
    doc(db, "attendance", reportId)
  );

  if (updatedSnap.exists()) {
    const updatedReport = {
      reportId,
      ...updatedSnap.data(),
    } as AttendanceReport;

    const attendanceStatusConfigs = await this.getAttendanceStatusConfigs();
    const selectedStatusConfig = attendanceStatusConfigs.find(
      (status) => status.id === updatedReport.status
    );

    const users = await this.getAllUsers();

    const soldier = users.find(
      (u) =>
        u.userId === updatedReport.userId ||
        u.personalId === (updatedReport as any).personalId
    );

    const markerText =
      updatedReport.dayMarker === "return_to_base"
        ? "חזרה לבסיס"
        : updatedReport.dayMarker === "exit_home"
        ? "יציאה לבית"
        : updatedReport.dayMarker === "after_hours"
        ? `אפטר ${updatedReport.afterHours || ""} שעות`
        : "";

    const statusText =
      selectedStatusConfig?.label ||
      ATTENDANCE_STATUS_LABELS[updatedReport.status]?.label ||
      updatedReport.status;
   
    await this.createSystemLog({
  action: "edit_report",
  actorUserId: finalReportData.updatedBy,
  actorName: finalReportData.updatedByName,
  targetUserId: updatedReport.userId,
  targetName: updatedReport.userName,
  details: `${statusText} | ${
    updatedReport.reportDate || ""
  }`,
});

    const reportDateForSheets =
  (updatedReport as any).reportDate ||
  (typeof updatedReport.timestamp === "string"
    ? updatedReport.timestamp.split("T")[0]
    : "");

const [year, month, day] =
  reportDateForSheets.split("-");

const formattedDate =
  year && month && day
    ? `${day.padStart(2, "0")}/${month.padStart(
        2,
        "0"
      )}/${year}`
    : reportDateForSheets;

    const personalIdForSheets = getSheetsPersonalId(
      soldier?.personalId,
      (updatedReport as any).personalId
    );

    const googleSheetsConfig = await this.getGoogleSheetsConfig();

    if (
      googleSheetsConfig.enabled &&
      !!googleSheetsConfig.webAppUrl &&
      selectedStatusConfig?.exportToSheets !== false &&
      personalIdForSheets
    ) {
      try {
        await fetch(googleSheetsConfig.webAppUrl, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify({
            personalId: personalIdForSheets,
            fullName: soldier?.fullName || updatedReport.userName,
            role: soldier?.medicalRole || "",
            phone: soldier?.phoneNumber || "",
            date: formattedDate,
            cellValue: markerText ? `${statusText}/${markerText}` : statusText,
          }),
        });
      } catch (err) {
        console.warn("Google Sheets update sync failed:", err);
      }
    } else if (
      selectedStatusConfig?.exportToSheets !== false &&
      !personalIdForSheets
    ) {
      console.warn(
        "Google Sheets update sync skipped: missing numeric personalId",
        reportId,
        updatedReport.userName
      );
    }
  }

  await addDoc(collection(db, "attendance_logs"), updateLog);
} catch (error) {
  handleFirestoreError(error, OperationType.UPDATE, path);
}
},
  async fetchAttendanceLogs(): Promise<any[]> {
    if (!isFirebaseActive()) {
      return JSON.parse(localStorage.getItem("idf_attendance_logs") || "[]");
    }

    const path = "attendance_logs";
    try {
      const q = query(collection(db, "attendance_logs"), orderBy("updatedAt", "desc"));
      const querySnapshot = await getDocs(q);
      const list: any[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ logId: docSnap.id, ...docSnap.data() });
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async verifyReport(reportId: string, commanderId: string): Promise<void> {
    const verifiedAt = new Date().toISOString();
    
    if (!isFirebaseActive()) {
      const reports: AttendanceReport[] = JSON.parse(localStorage.getItem("idf_reports") || "[]");
      const index = reports.findIndex(r => r.reportId === reportId);
      if (index > -1) {
        reports[index].verifiedBy = commanderId;
        reports[index].verifiedAt = verifiedAt;
        localStorage.setItem("idf_reports", JSON.stringify(reports));
      }
      return;
    }

    const path = `attendance/${reportId}`;
    try {
      await updateDoc(doc(db, "attendance", reportId), {
        verifiedBy: commanderId,
        verifiedAt: verifiedAt
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async fetchNotifications(): Promise<AppNotification[]> {
    if (!isFirebaseActive()) {
      const notifications = JSON.parse(localStorage.getItem("idf_notifications") || "[]");
      return notifications.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const path = "notifications";
    try {
      const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const list: AppNotification[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ notificationId: docSnap.id, ...docSnap.data() } as AppNotification);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async markNotificationAsRead(notificationId: string): Promise<void> {
    if (!isFirebaseActive()) {
      const notifications: AppNotification[] = JSON.parse(localStorage.getItem("idf_notifications") || "[]");
      const index = notifications.findIndex(n => n.notificationId === notificationId);
      if (index > -1) {
        notifications[index].isRead = true;
        localStorage.setItem("idf_notifications", JSON.stringify(notifications));
      }
      return;
    }

    const path = `notifications/${notificationId}`;
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        isRead: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async clearAllNotifications(): Promise<void> {
    if (!isFirebaseActive()) {
      localStorage.setItem("idf_notifications", JSON.stringify([]));
      return;
    }
    const path = "notifications";
    try {
      const querySnapshot = await getDocs(collection(db, "notifications"));
      const promises: Promise<void>[] = [];
      querySnapshot.forEach((docSnap) => {
        if (!docSnap.data().isRead) {
          promises.push(updateDoc(doc(db, "notifications", docSnap.id), { isRead: true }));
        }
      });
      await Promise.all(promises);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  // Seed back original simulated database values
  resetSimulatedData(): void {
    localStorage.setItem("idf_profiles", JSON.stringify(DEFAULT_SIMULATED_PROFILES));
    localStorage.setItem("idf_reports", JSON.stringify(DEFAULT_SIMULATED_REPORTS));
    localStorage.setItem("idf_notifications", JSON.stringify(DEFAULT_SIMULATED_NOTIFICATIONS));
    localStorage.setItem("idf_active_user_id", "sim_soldier_1");
  }
  }
  export async function getReliableServerNow(): Promise<Date> {
  if (!isFirebaseActive() || !db || !auth?.currentUser?.uid) {
    return new Date();
  }
  

  const ref = doc(db, "server_clock", auth.currentUser.uid);

  await setDoc(
    ref,
    {
      now: serverTimestamp(),
    },
    { merge: true }
  );

  const snap = await getDocFromServer(ref);
  const value = snap.data()?.now;

  if (value && typeof value.toDate === "function") {
    return value.toDate();
  }

  return new Date();
}
