import {
  RolePermissionConfig,
  SystemRole,
  UserProfile,
} from "../types";

export const PERMISSION_DEFINITIONS = [
  { id: "reporter.view", label: "דיווח נוכחות אישי", category: "מסכים" },
  { id: "dashboard.view", label: "לוח בקרה למפקדים", category: "מסכים" },
  { id: "dashboard.attendance.view", label: "בקרה ומצבי נוכחות", category: "מסכי לוח בקרה" },
  { id: "dashboard.directory.view", label: "ספר טלפונים וסגל", category: "מסכי לוח בקרה" },
  { id: "dashboard.summary.view", label: "סיכום נוכחות", category: "מסכי לוח בקרה" },
  { id: "dashboard.history.view", label: "היסטוריית דיווחים", category: "מסכי לוח בקרה" },
  { id: "dashboard.system_logs.view", label: "יומן מערכת", category: "מסכי לוח בקרה" },
  { id: "dashboard.notifications.view", label: "התראות", category: "מסכי לוח בקרה" },
  { id: "dashboard.settings.view", label: "הגדרות לוח הבקרה", category: "מסכי לוח בקרה" },
  { id: "reports.manage", label: "יצירה ועריכת דיווחים", category: "דיווחים" },
  { id: "reports.verify", label: "אימות דיווחים", category: "דיווחים" },
  { id: "reports.reset", label: "איפוס דיווחים", category: "דיווחים" },
  { id: "reports.delete", label: "מחיקת דיווחים", category: "דיווחים" },
  { id: "soldiers.manage", label: "ניהול חיילים", category: "חיילים" },
  { id: "soldiers.add", label: "הוספת חיילים", category: "חיילים" },
  { id: "soldiers.edit", label: "עריכת חיילים", category: "חיילים" },
  { id: "soldiers.delete", label: "מחיקת חיילים", category: "חיילים" },
  { id: "shifts.view", label: "צפייה במשמרות", category: "משמרות" },
  { id: "shifts.manage", label: "יצירה, עריכה ומחיקת משמרות", category: "משמרות" },
  { id: "emergency.view", label: "צפייה במרכז חירום", category: "חירום" },
  { id: "emergency.manage", label: "הפעלה וניהול של מצב חירום", category: "חירום" },
  { id: "sheets.export", label: "ייצוא ל־Google Sheets", category: "ייצוא" },
  { id: "system_admin.view", label: "כניסה לניהול מערכת", category: "ניהול מערכת" },
  { id: "system_admin.statuses.manage", label: "ניהול סטטוסים", category: "ניהול מערכת" },
  { id: "system_admin.permissions.manage", label: "ניהול הרשאות", category: "ניהול מערכת" },
  { id: "system_admin.shift_roles.manage", label: "ניהול תפקידי משמרת", category: "ניהול מערכת" },
  { id: "system_admin.external_staff.manage", label: "ניהול אנשי צוות חיצוניים", category: "ניהול מערכת" },
  { id: "system_admin.shift_types.manage", label: "ניהול שמות וסוגי משמרות", category: "ניהול מערכת" },
] as const;

export type PermissionId =
  (typeof PERMISSION_DEFINITIONS)[number]["id"];

export type PermissionMap = Record<string, boolean>;

export const getEffectiveSystemRole = (
  user?: UserProfile | null
): SystemRole => {
  if (!user) return "reporter";
  if (user.systemRole) return user.systemRole;
  if (user.role === "commander") return "admin";
  if (user.role === "adjutant_officer") return "viewer";
  return "reporter";
};

export const getPermissionsForRole = (
  role: SystemRole,
  configs: RolePermissionConfig[]
): PermissionMap => {
  return (
    configs.find((config) => config.systemRole === role)?.permissions || {}
  );
};

export const getPermissionsForUser = (
  user: UserProfile | null | undefined,
  configs: RolePermissionConfig[]
): PermissionMap => {
  return getPermissionsForRole(getEffectiveSystemRole(user), configs);
};

export const hasPermission = (
  permissions: PermissionMap,
  permissionId: PermissionId | string
): boolean => permissions[permissionId] === true;
