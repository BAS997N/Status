import { SystemRole, UserProfile } from "../types";

export interface AppPermissions {
  canViewReporter: boolean;
  canViewDashboard: boolean;
  canViewSystemAdmin: boolean;

  canViewAttendance: boolean;
  canViewDirectory: boolean;
  canViewSummary: boolean;
  canViewHistory: boolean;
  canViewSystemLogs: boolean;
  canViewNotifications: boolean;
  canViewSettings: boolean;

  canManageReports: boolean;
  canVerifyReports: boolean;
  canResetReports: boolean;
  canDeleteReports: boolean;

  canManageSoldiers: boolean;
  canAddSoldiers: boolean;
  canEditSoldiers: boolean;
  canDeleteSoldiers: boolean;

  canExportSheets: boolean;
  canManageStatuses: boolean;
  canManagePermissions: boolean;
}

export const getEffectiveSystemRole = (
  user?: UserProfile | null
): SystemRole => {
  if (!user) return "reporter";

  if (user.systemRole) {
    return user.systemRole;
  }

  if (user.role === "commander") {
    return "admin";
  }

  if (user.role === "adjutant_officer") {
    return "viewer";
  }

  return "reporter";
};

const ROLE_PERMISSIONS: Record<SystemRole, AppPermissions> = {
  super_admin: {
    canViewReporter: true,
    canViewDashboard: true,
    canViewSystemAdmin: true,

    canViewAttendance: true,
    canViewDirectory: true,
    canViewSummary: true,
    canViewHistory: true,
    canViewSystemLogs: true,
    canViewNotifications: true,
    canViewSettings: true,

    canManageReports: true,
    canVerifyReports: true,
    canResetReports: true,
    canDeleteReports: true,

    canManageSoldiers: true,
    canAddSoldiers: true,
    canEditSoldiers: true,
    canDeleteSoldiers: true,

    canExportSheets: true,
    canManageStatuses: true,
    canManagePermissions: true,
  },

  admin: {
    canViewReporter: true,
    canViewDashboard: true,
    canViewSystemAdmin: false,

    canViewAttendance: true,
    canViewDirectory: true,
    canViewSummary: true,
    canViewHistory: true,
    canViewSystemLogs: true,
    canViewNotifications: true,
    canViewSettings: true,

    canManageReports: true,
    canVerifyReports: true,
    canResetReports: true,
    canDeleteReports: true,

    canManageSoldiers: true,
    canAddSoldiers: true,
    canEditSoldiers: true,
    canDeleteSoldiers: true,

    canExportSheets: true,
    canManageStatuses: false,
    canManagePermissions: false,
  },

  viewer: {
    canViewReporter: false,
    canViewDashboard: true,
    canViewSystemAdmin: false,

    canViewAttendance: true,
    canViewDirectory: true,
    canViewSummary: false,
    canViewHistory: false,
    canViewSystemLogs: false,
    canViewNotifications: false,
    canViewSettings: false,

    canManageReports: false,
    canVerifyReports: false,
    canResetReports: false,
    canDeleteReports: false,

    canManageSoldiers: false,
    canAddSoldiers: false,
    canEditSoldiers: false,
    canDeleteSoldiers: false,

    canExportSheets: false,
    canManageStatuses: false,
    canManagePermissions: false,
  },

  reporter: {
    canViewReporter: true,
    canViewDashboard: false,
    canViewSystemAdmin: false,

    canViewAttendance: false,
    canViewDirectory: false,
    canViewSummary: false,
    canViewHistory: false,
    canViewSystemLogs: false,
    canViewNotifications: false,
    canViewSettings: false,

    canManageReports: false,
    canVerifyReports: false,
    canResetReports: false,
    canDeleteReports: false,

    canManageSoldiers: false,
    canAddSoldiers: false,
    canEditSoldiers: false,
    canDeleteSoldiers: false,

    canExportSheets: false,
    canManageStatuses: false,
    canManagePermissions: false,
  },
};

export const getPermissionsForUser = (
  user?: UserProfile | null
): AppPermissions => {
  const role = getEffectiveSystemRole(user);
  return ROLE_PERMISSIONS[role];
};
