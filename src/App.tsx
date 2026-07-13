/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  isFirebaseActive, 
  auth, 
  secondaryAuth,
  db 
} from "./firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { 
  UserProfile, 
  AttendanceReport, 
  AttendanceStatus, 
  AppNotification,
  IDF_UNITS,
  UserRole,
  SystemRole,
  SystemRoleAccessLevel,
  RolePermissionConfig,
  AttendanceStatusConfig,
  UnitConfig,
  MedicalRoleConfig,
  GoogleSheetsConfig,
  SystemSettingsConfig,
  ShiftRecord,
  ShiftSlotConfig,
  ExternalStaffMember,
  DEFAULT_ATTENDANCE_STATUS_CONFIGS
} from "./types";
import { dataService } from "./services/dataService";
import { getEffectiveSystemRole, getPermissionsForUser, hasPermission, PermissionMap } from "./security/permissions";
import Header from "./components/Header";
import SoldierReporter from "./components/SoldierReporter";
import CommandDashboard from "./components/CommandDashboard";
import SystemAdminPanel from "./components/SystemAdminPanel";
import AppMessageModal from "./components/AppMessageModal";
import ShiftsView from "./components/ShiftsView";
import EmergencyCenter from "./components/EmergencyCenter";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldCheck, 
  LayoutDashboard, 
  UserCheck, 
  AlertTriangle, 
  KeyRound, 
  Info,
  LogOut,
  CalendarDays,
  Siren
} from "lucide-react";

//שעה לפי אזור זמן ולא לפי חייל
const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

const getIsraelDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

export default function App() {
  // Auth & Profile states
  const buildAuthEmail = (personalId: string) => {
  return `${personalId.trim()}@idf.local`;
};
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  
  // App reports state
  const [reports, setReports] = useState<AttendanceReport[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [shiftSlotConfigs, setShiftSlotConfigs] = useState<ShiftSlotConfig[]>([]);
  const [externalStaff, setExternalStaff] = useState<ExternalStaffMember[]>([]);
  const [activeTab, setActiveTab] = useState<
    "reporter" | "dashboard" | "system_admin" | "shifts" | "emergency"
  >("reporter");

  // ID-based login states
  const [personalIdInput, setPersonalIdInput] = useState("");
  const [personalCodeInput, setPersonalCodeInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isRegisteringId, setIsRegisteringId] = useState(false);
  const [regPersonalId, setRegPersonalId] = useState("");
  const [regName, setRegName] = useState("");
  const [regUnit, setRegUnit] = useState(IDF_UNITS[0]);
  const [regRole, setRegRole] = useState<UserRole>("soldier");
  const [regPhoneNumber, setRegPhoneNumber] = useState("");
  const [regPasscode, setRegPasscode] = useState("");
  const [regPersonalCode, setRegPersonalCode] = useState("");
const [regPersonalCodeConfirm, setRegPersonalCodeConfirm] = useState("");

  // Notifications & Toast states
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  interface ToastMessage {
    id: string;
    title: string;
    message: string;
    status: AttendanceStatus;
  }
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appMessage, setAppMessage] = useState<{
    title: string;
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showAppMessage = (
    title: string,
    message: string,
    type: "success" | "error" | "info" = "info"
  ) => {
    setAppMessage({ title, message, type });
  };
  const showToast = (
  title: string,
  message: string,
  status: AttendanceStatus = "base"
) => {
  if (systemSettings?.notificationsEnabled === false || systemSettings?.toastNotificationsEnabled === false) return;
  const toastId = `toast_${Date.now()}_${Math.random()}`;

  const newToast: ToastMessage = {
    id: toastId,
    title,
    message,
    status,
  };

  setToasts((current) => [newToast, ...current]);

  setTimeout(() => {
    setToasts((current) =>
      current.filter((toast) => toast.id !== toastId)
    );
  }, 4000);
};

  // Simulation switch helper counter to trigger state re-reads
  const [simCounter, setSimCounter] = useState(0);

  const [unitConfigs, setUnitConfigs] = useState<UnitConfig[]>([]);
  const medicalUnits = React.useMemo(
    () => unitConfigs.filter((unit) => unit.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((unit) => unit.name),
    [unitConfigs]
  );
  const [medicalRoleConfigs, setMedicalRoleConfigs] = useState<MedicalRoleConfig[]>([]);
  const customRoles = React.useMemo(
    () => medicalRoleConfigs.filter((role) => role.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((role) => role.name),
    [medicalRoleConfigs]
  );
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsConfig | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig | null>(null);
  const [permissionConfigs, setPermissionConfigs] = useState<RolePermissionConfig[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [attendanceStatuses, setAttendanceStatuses] = useState<AttendanceStatusConfig[]>(
    DEFAULT_ATTENDANCE_STATUS_CONFIGS
  );

  const handleAttendanceStatusesChanged = (
    statuses: AttendanceStatusConfig[]
  ) => {
    setAttendanceStatuses(
      [...statuses].sort((a, b) => a.sortOrder - b.sortOrder)
    );
  };

  const handleUnitConfigsChanged = (units: UnitConfig[]) => {
    const sorted = [...units].sort((a, b) => a.sortOrder - b.sortOrder);
    setUnitConfigs(sorted);

    const firstEnabledUnit = sorted.find((unit) => unit.enabled)?.name;
    if (firstEnabledUnit && !sorted.some((unit) => unit.enabled && unit.name === regUnit)) {
      setRegUnit(firstEnabledUnit);
    }
  };

  const handleMedicalRoleConfigsChanged = (roles: MedicalRoleConfig[]) => {
    setMedicalRoleConfigs([...roles].sort((a, b) => a.sortOrder - b.sortOrder));
  };

  const handleGoogleSheetsConfigChanged = (config: GoogleSheetsConfig) => {
    setGoogleSheetsConfig(config);
  };

  const handleSystemSettingsChanged = (settings: SystemSettingsConfig) => {
    setSystemSettings(settings);
  };

  const handleShiftSlotConfigsChanged = (configs: ShiftSlotConfig[]) => {
    setShiftSlotConfigs([...configs].sort((a, b) => a.sortOrder - b.sortOrder));
  };

  const handleExternalStaffChanged = (items: ExternalStaffMember[]) => {
    setExternalStaff([...items].sort((a, b) => a.sortOrder - b.sortOrder));
  };


  // גישת אתחול ראשונית לסופר־אדמין.
  // בהמשך ההרשאה תנוהל מתוך מסך ניהול המערכת בלבד.
  const isBootstrapSuperAdmin = userProfile?.personalId === "5749199";
  const permissionUser =
    userProfile && isBootstrapSuperAdmin
      ? { ...userProfile, systemRole: "super_admin" as SystemRole }
      : userProfile;

  const permissions: PermissionMap = getPermissionsForUser(
    permissionUser,
    permissionConfigs
  );


  const statusLabels = React.useMemo(
    () =>
      Object.fromEntries(
        attendanceStatuses.map((status) => [
          status.id,
          {
            label: status.label,
            color: status.color,
            bg: status.bg,
            border: status.border,
          },
        ])
      ),
    [attendanceStatuses]
  );

  useEffect(() => {
    let cancelled = false;

    const loadUnits = async () => {
      if (isFirebaseActive() && !auth?.currentUser) return;

      try {
        const units = await dataService.getUnitConfigs();
        if (!cancelled) {
          setUnitConfigs(units);
          const firstEnabled = units.find((unit) => unit.enabled)?.name;
          if (firstEnabled) setRegUnit(firstEnabled);
        }
      } catch (error) {
        console.error("Failed loading unit configs:", error);
      }
    };

    loadUnits();
    return () => { cancelled = true; };
  }, [firebaseUser]);

  useEffect(() => {
    let cancelled = false;

    const loadAttendanceStatuses = async () => {
      if (isFirebaseActive() && !auth?.currentUser) return;

      try {
        const statuses = await dataService.getAttendanceStatusConfigs();
        if (!cancelled) setAttendanceStatuses(statuses);
      } catch (error) {
        console.error("Failed loading attendance statuses:", error);
      }
    };

    loadAttendanceStatuses();
    return () => { cancelled = true; };
  }, [firebaseUser]);

  useEffect(() => {
    if (isFirebaseActive() && !auth?.currentUser) return;
    if (activeTab === "system_admin") return;

    // When leaving the admin screen, reload directly from Firestore.
    // This prevents an older cached list from restoring statuses that were
    // hidden or deleted moments earlier.
    dataService
      .getAttendanceStatusConfigs(true)
      .then((statuses) =>
        setAttendanceStatuses(
          [...statuses].sort((a, b) => a.sortOrder - b.sortOrder)
        )
      )
      .catch((error) =>
        console.error("Failed refreshing attendance statuses:", error)
      );
  }, [activeTab, firebaseUser]);

  const isSuperAdmin = hasPermission(permissions, "system_admin.view");
  const canViewReporter = hasPermission(permissions, "reporter.view");
  const canViewDashboard = hasPermission(permissions, "dashboard.view");
  const shiftsSystemRole = getEffectiveSystemRole(permissionUser);
  const canViewShifts = hasPermission(permissions, "shifts.view");
  const canManageShifts =
    permissions["shifts.manage"] === true ||
    shiftsSystemRole === "admin" ||
    shiftsSystemRole === "super_admin";
  const canViewEmergency =
    hasPermission(permissions, "emergency.view") ||
    systemSettings?.systemMode === "emergency";
  const canManageEmergency =
    permissions["emergency.manage"] === true ||
    shiftsSystemRole === "admin" ||
    shiftsSystemRole === "super_admin";
  const isEmergencyActive =
    systemSettings?.systemMode === "emergency" &&
    systemSettings?.emergencyEvent?.active === true;

  // Managers keep access so they can prepare or operate the emergency center.
  // Regular soldiers only see the tab while an emergency event is active.
  const isEmergencyManagerRole =
    canManageEmergency ||
    shiftsSystemRole === "admin" ||
    shiftsSystemRole === "super_admin";

  const shouldShowEmergencyTab =
    isEmergencyManagerRole || (canViewEmergency && isEmergencyActive);

  useEffect(() => {
    if (activeTab === "emergency" && !shouldShowEmergencyTab) {
      if (canViewReporter) {
        setActiveTab("reporter");
      } else if (canViewDashboard) {
        setActiveTab("dashboard");
      } else if (canViewShifts) {
        setActiveTab("shifts");
      }
    }
  }, [
    activeTab,
    shouldShowEmergencyTab,
    canViewReporter,
    canViewDashboard,
    canViewShifts,
  ]);

  const getInitialTabForProfile = (profile: UserProfile) => {
    const effectiveProfile =
      profile.personalId === "5749199"
        ? { ...profile, systemRole: "super_admin" as SystemRole }
        : profile;

    const profilePermissions = getPermissionsForUser(
      effectiveProfile,
      permissionConfigs
    );

    const profileCanViewReporter = hasPermission(
      profilePermissions,
      "reporter.view"
    );
    const profileCanViewDashboard = hasPermission(
      profilePermissions,
      "dashboard.view"
    );
    const profileCanViewShifts = hasPermission(
      profilePermissions,
      "shifts.view"
    );
    const profileCanViewEmergency = hasPermission(
      profilePermissions,
      "emergency.view"
    );
    const profileCanViewSystemAdmin = hasPermission(
      profilePermissions,
      "system_admin.view"
    );

    if (
      systemSettings?.defaultStartScreen === "reporter" &&
      profileCanViewReporter
    ) {
      return "reporter";
    }

    if (profileCanViewDashboard) return "dashboard";
    if (profileCanViewShifts) return "shifts";
    if (profileCanViewReporter) return "reporter";
    if (profileCanViewEmergency) return "emergency";
    if (profileCanViewSystemAdmin) return "system_admin";

    return "reporter";
  };

  useEffect(() => {
    let cancelled = false;

    const loadGoogleSheetsConfig = async () => {
      if (isFirebaseActive() && !auth?.currentUser) return;

      try {
        const config = await dataService.getGoogleSheetsConfig();
        if (!cancelled) setGoogleSheetsConfig(config);
      } catch (error) {
        console.error("Failed loading Google Sheets config:", error);
      }
    };

    loadGoogleSheetsConfig();
    return () => { cancelled = true; };
  }, [firebaseUser]);

  useEffect(() => {
    let cancelled = false;

    const refreshSystemSettings = async () => {
      if (isFirebaseActive() && !auth?.currentUser) return;

      try {
        const settings = await dataService.getSystemSettings(true);
        if (!cancelled) setSystemSettings(settings);
      } catch (error) {
        console.error("Failed loading system settings:", error);
      }
    };

    refreshSystemSettings();

    // Keep operational modes current on every open device, even when an old
    // settings value is still present in local cache.
    const intervalId = window.setInterval(refreshSystemSettings, 10000);
    const handleFocus = () => refreshSystemSettings();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSystemSettings();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [firebaseUser]);

  useEffect(() => {
    let cancelled = false;

    const loadPermissions = async () => {
      if (isFirebaseActive() && !auth?.currentUser) {
        if (!cancelled) setPermissionsLoaded(false);
        return;
      }

      try {
        const configs = await dataService.getRolePermissionConfigs();
        if (!cancelled) setPermissionConfigs(configs);
      } catch (error) {
        console.error("Failed loading role permissions:", error);
      } finally {
        if (!cancelled) setPermissionsLoaded(true);
      }
    };

    loadPermissions();
    return () => { cancelled = true; };
  }, [firebaseUser]);

  useEffect(() => {
    if (!userProfile || !permissionsLoaded) return;

    const activeTabIsAllowed =
      (activeTab === "system_admin" && isSuperAdmin) ||
      (activeTab === "dashboard" && canViewDashboard) ||
      (activeTab === "reporter" && canViewReporter) ||
      (activeTab === "shifts" && canViewShifts) ||
      (activeTab === "emergency" && shouldShowEmergencyTab);

    if (activeTabIsAllowed) return;

    if (canViewDashboard) {
      setActiveTab("dashboard");
    } else if (canViewShifts) {
      setActiveTab("shifts");
    } else if (canViewReporter) {
      setActiveTab("reporter");
    } else if (shouldShowEmergencyTab) {
      setActiveTab("emergency");
    } else if (isSuperAdmin) {
      setActiveTab("system_admin");
    }
  }, [
    userProfile,
    permissionsLoaded,
    activeTab,
    isSuperAdmin,
    canViewDashboard,
    canViewReporter,
    canViewShifts,
    shouldShowEmergencyTab,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadMedicalRoles = async () => {
      if (isFirebaseActive() && !auth?.currentUser) return;

      try {
        const roles = await dataService.getMedicalRoleConfigs();
        if (!cancelled) setMedicalRoleConfigs(roles);
      } catch (error) {
        console.error("Failed loading medical role configs:", error);
      }
    };

    loadMedicalRoles();
    return () => { cancelled = true; };
  }, [firebaseUser]);

  const handleUpdateMedicalSettings = async (
    newUnits: string[],
    newRoles: string[]
  ) => {
    if (newUnits.length > 0) {
      const nextUnitConfigs: UnitConfig[] = newUnits.map((name, index) => {
        const existing = unitConfigs.find((unit) => unit.name === name);
        return {
          id: existing?.id || `unit_${Date.now()}_${index}`,
          name,
          enabled: true,
          sortOrder: index + 1,
          systemUnit: existing?.systemUnit === true,
        };
      });
      const savedUnits = await dataService.saveUnitConfigs(
        nextUnitConfigs,
        userProfile?.userId
      );
      setUnitConfigs(savedUnits);
    }

    const nextRoleConfigs: MedicalRoleConfig[] = newRoles.map((name, index) => {
      const existing = medicalRoleConfigs.find((role) => role.name === name);
      return {
        id: existing?.id || `medical_role_${Date.now()}_${index}`,
        name,
        enabled: true,
        sortOrder: index + 1,
      };
    });
    const savedRoles = await dataService.saveMedicalRoleConfigs(
      nextRoleConfigs,
      userProfile?.userId
    );
    setMedicalRoleConfigs(savedRoles);
  };

  const refreshNotifications = async () => {
    const updated = await dataService.fetchNotifications();
    setNotifications(updated);
  };

  // 1. Manage Authentication Lifecycle with Firebase Auth persistence
useEffect(() => {
  let unsubscribe: (() => void) | undefined;

  const loadSession = async (firebaseUid?: string | null) => {
    setLoading(true);

    try {
      const storedActiveId =
        firebaseUid ||
        localStorage.getItem("idf_active_user_id");

      const storedPersonalId =
        localStorage.getItem("idf_active_personal_id");

     if (isFirebaseActive() && !storedActiveId) {
  setUserProfile(null);
  localStorage.removeItem("idf_active_user_id");
  localStorage.removeItem("idf_active_personal_id");
  setLoading(false);
       setAuthChecked(true);
  return;
}

      const profiles = await dataService.getAllUsers();
      setAllUsers(profiles);

      if (storedActiveId) {
        let profile =
          profiles.find(p => p.userId === storedActiveId) ||
          profiles.find(p => p.personalId === storedPersonalId);

        if (!profile && isFirebaseActive()) {
          profile = await dataService.getCurrentUserProfile(storedActiveId);
        }

        if (profile) {
          setUserProfile(profile);

          localStorage.setItem("idf_active_user_id", profile.userId);
          if (profile.personalId) {
            localStorage.setItem("idf_active_personal_id", profile.personalId);
          }

          const reps = await dataService.fetchAllReports();
          const nots = await dataService.fetchNotifications();

          setReports(reps);
          setNotifications(nots);

          setActiveTab(getInitialTabForProfile(profile));
        } else {
          setUserProfile(null);
          localStorage.removeItem("idf_active_user_id");
          localStorage.removeItem("idf_active_personal_id");
        }
      } else {
        setUserProfile(null);
      }
    } catch (err) {
      console.error("Error loading simulation or database session:", err);
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  };

  if (isFirebaseActive()) {
  unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    setFirebaseUser(firebaseUser);
    await loadSession(firebaseUser?.uid || null);
  });
} else {
  loadSession();
}

  return () => {
    if (unsubscribe) unsubscribe();
  };
}, [simCounter]);

  // Read updates of reports whenever actions complete
  const refreshReports = async () => {
  if (isFirebaseActive() && !auth?.currentUser) return;

  const updatedReports = await dataService.fetchAllReports();
  setReports(updatedReports);

  const updatedLogs = await dataService.fetchAttendanceLogs();
  setAttendanceLogs(updatedLogs);
    const updatedSystemLogs = await dataService.getSystemLogs();
setSystemLogs(updatedSystemLogs);
};
  const refreshReportsOnly = async () => {
  if (isFirebaseActive() && !auth?.currentUser) return;

  const updatedReports = await dataService.fetchAllReports();
  setReports(updatedReports);
};
//עריכת דיווח מפקד חדש
  const upsertReportInState = (updatedReport: AttendanceReport) => {
  setReports((currentReports) => {
    const updatedDate =
      (updatedReport as any).reportDate ||
      (typeof updatedReport.timestamp === "string"
        ? updatedReport.timestamp.split("T")[0]
        : "");

    const withoutOldSameReport = currentReports.filter((report) => {
      const reportDate =
        (report as any).reportDate ||
        (typeof report.timestamp === "string"
          ? report.timestamp.split("T")[0]
          : "");

      const sameReportId =
        report.reportId &&
        updatedReport.reportId &&
        report.reportId === updatedReport.reportId;

      const sameSoldierSameDate =
        report.userId === updatedReport.userId &&
        reportDate === updatedDate;

      return !sameReportId && !sameSoldierSameDate;
    });

    return [updatedReport, ...withoutOldSameReport];
  });
};
  useEffect(() => {
  if (!userProfile) return;
  refreshReports();
  dataService
    .getShifts()
    .then(setShifts)
    .catch((error) => console.error("Failed loading shifts:", error));
  dataService
    .getShiftSlotConfigs()
    .then(setShiftSlotConfigs)
    .catch((error) =>
      console.error("Failed loading shift slot configs:", error)
    );
  dataService
    .getExternalStaff()
    .then(setExternalStaff)
    .catch((error) =>
      console.error("Failed loading external staff:", error)
    );
}, [userProfile]);

  // Notification actions
  const handleMarkNotificationRead = async (id: string) => {
    await dataService.markNotificationAsRead(id);
    await refreshNotifications();
  };

  const handleClearAllNotifications = async () => {
    await dataService.clearAllNotifications();
    await refreshNotifications();
  };
    const handleDeleteSoldier = async (userId: string) => {
  try {
    const soldierToDelete = allUsers.find(
      (u) => u.userId === userId
    );

    await dataService.deleteUserProfile(userId);

    await dataService.createSystemLog({
      action: "delete_soldier",
      actorUserId: userProfile?.userId || "unknown",
      actorName: userProfile?.fullName || "משתמש לא ידוע",
      targetUserId: userId,
      targetName: soldierToDelete?.fullName || "לא ידוע",
      details: `נמחק חייל מהמערכת (${soldierToDelete?.medicalRole || "ללא תפקיד"})`,
    });

    const updatedUsers = await dataService.getAllUsers();
    setAllUsers(updatedUsers);

  } catch (error) {
    console.error("Failed deleting soldier:", error);
    showAppMessage("שגיאה", "אירעה שגיאה במחיקת החייל", "error");
  }
};
 const handleUpdateUserSystemRole = async (
  userId: string,
  systemRole: SystemRole,
  accessLevel?: SystemRoleAccessLevel
) => {
  if (!userProfile || !isSuperAdmin) {
    throw new Error("אין הרשאה לעדכן הרשאות מערכת");
  }

  if (userId === userProfile.userId && systemRole !== "super_admin") {
    throw new Error("לא ניתן להסיר מעצמך הרשאת סופר־אדמין");
  }

  await dataService.updateUserSystemRole(
    userId,
    systemRole,
    accessLevel
  );

  setAllUsers((currentUsers) =>
    currentUsers.map((user) =>
      user.userId === userId
        ? {
            ...user,
            systemRole,
            systemRoleAccessLevel: accessLevel,
          }
        : user
    )
  );

  if (userProfile.userId === userId) {
    setUserProfile((currentProfile) =>
      currentProfile
        ? {
            ...currentProfile,
            systemRole,
            systemRoleAccessLevel: accessLevel,
          }
        : currentProfile
    );
  }
};

 const handleSyncOldReportsToSheets = async (
  startDate: string,
  endDate: string
) => {
  const formattedRange = `${startDate} עד ${endDate}`;

  showAppMessage(
    "הסנכרון התחיל",
    `הדיווחים בטווח ${formattedRange} נשלחים כעת לגוגל שיטס. הפעולה עשויה להימשך מספר דקות.`,
    "info"
  );

  try {
    await dataService.syncAllReportsToGoogleSheets(startDate, endDate);

    showAppMessage(
      "הסנכרון הושלם",
      `כל הדיווחים התקינים בטווח ${formattedRange} יוצאו לגוגל שיטס בהצלחה.`,
      "success"
    );
  } catch (error) {
    console.error("Failed syncing reports to Google Sheets:", error);

    showAppMessage(
      "שגיאה בסנכרון",
      "אירעה שגיאה במהלך הייצוא לגוגל שיטס. בדוק את מסוף הדפדפן ואת ה־Apps Script.",
      "error"
    );

    throw error;
  }
};

const handleDeleteReport = async (reportId: string) => {
  try {
    await dataService.deleteAttendanceReport(reportId);
    await refreshReportsOnly();
    await refreshNotifications();
  } catch (error) {
    console.error("Failed deleting report:", error);
    showAppMessage("שגיאה", "אירעה שגיאה במחיקת הדיווח", "error");
  }
};

const handleResetReport = async (reportId: string) => {
  const reportToReset = reports.find(
    (report) => report.reportId === reportId
  );

  if (!reportToReset) {
    throw new Error("הדיווח לא נמצא");
  }

  try {
    await dataService.updateAttendanceReport(
      reportId,
      {
        isReset: true,
        resetAt: new Date().toISOString(),
        resetBy: userProfile?.userId || "unknown",
        resetByName: userProfile?.fullName || "משתמש לא ידוע",
      } as any,
      userProfile || undefined
    );

    // עדכון מיידי של המסך ללא צורך ברענון ידני
    setReports((currentReports) =>
      currentReports.map((report) =>
        report.reportId === reportId
          ? {
              ...report,
              isReset: true,
              resetAt: new Date().toISOString(),
              resetBy: userProfile?.userId || "unknown",
              resetByName:
                userProfile?.fullName || "משתמש לא ידוע",
            }
          : report
      )
    );

    // כשל ביומן המערכת לא צריך להפוך איפוס מוצלח לשגיאה
    try {
      await dataService.createSystemLog({
        action: "reset_report",
        actorUserId: userProfile?.userId || "unknown",
        actorName:
          userProfile?.fullName || "משתמש לא ידוע",
        targetUserId: reportToReset.userId,
        targetName:
          reportToReset.userName || "חייל לא ידוע",
        details: `אופס דיווח לתאריך ${
          (reportToReset as any).reportDate || "לא ידוע"
        }`,
      });
    } catch (logError) {
      console.error(
        "Failed creating reset system log:",
        logError
      );
    }
  } catch (error) {
    console.error("Failed resetting report:", error);
    throw error;
  }
};
  
  
  // Poll reports and notifications every 4 seconds in commander/adjutant mode to pop up real-time soldier reports
  useEffect(() => {
    const poll = async () => {
      if (userProfile) {
        try {
          const updatedReports = await dataService.fetchAllReports();
          const updatedNots = await dataService.fetchNotifications();
          setReports(updatedReports);
          

          setNotifications(prev => {
            const prevIds = new Set(prev.map(n => n.notificationId));
            updatedNots.forEach(not => {
              if (systemSettings?.notificationsEnabled !== false && systemSettings?.toastNotificationsEnabled !== false && prev.length > 0 && !prevIds.has(not.notificationId) && !not.isRead) {
                // Pop a gorgeous live floating banner
                const labelObj = statusLabels[not.status] || { label: not.status };
                const newToast: ToastMessage = {
                  id: `toast_${Date.now()}_${not.notificationId}`,
                  title: `חייל/ת מחוץ לבסיס: ${not.soldierName}`,
                  message: `דווח על סטטוס '${labelObj.label}' במיקום: ${not.location}`,
                  status: not.status
                };
                setToasts(current => [newToast, ...current]);
                setTimeout(() => {
                   setToasts(current => current.filter(t => t.id !== newToast.id));
                }, 6000);
              }
            });
            return updatedNots;
          });
        } catch (e) {
          console.error("Polling error:", e);
        }
      }
    };

    const interval = setInterval(poll, Math.max(10, systemSettings?.autoRefreshSeconds || 60) * 1000);
    return () => clearInterval(interval);
  }, [userProfile, systemSettings?.autoRefreshSeconds, systemSettings?.notificationsEnabled, systemSettings?.toastNotificationsEnabled]);

  if (loading) {
  return (
    <div className="min-h-screen bg-military-50 flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-military-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-bold text-military-800">
          טוען מערכת קשר ודיווח...
        </span>
      </div>
    </div>
  );
}

  // Switch persona (for quick simulation testing in live preview)
  const handleSwitchUser = async (userId: string) => {
    if (!isFirebaseActive()) {
      dataService.switchSimulatedUser(userId);
      setSimCounter(prev => prev + 1);
    }
  };

  // Save current profile (both local and cloud)
  const handleUpdateProfile = async (updated: UserProfile) => {
    await dataService.saveUserProfile(updated);
    setUserProfile(updated);
    // Reload all users list to propagate name changes
    const users = await dataService.getAllUsers();
    setAllUsers(users);
    const logs = await dataService.getSystemLogs();
setSystemLogs(logs);
    await refreshReports();
    await refreshNotifications();
  };

  const handleResetData = () => {
    if (window.confirm("האם אתה בטוח שברצונך לאפס את כל נתוני הסימולציה וההתראות?")) {
      dataService.resetSimulatedData();
      setSimCounter(prev => prev + 1);
    }
  };

  // Complete clean logout
  const handleLogout = async () => {
    setLoading(true);
    try {
      localStorage.removeItem("idf_active_user_id");
      setUserProfile(null);
      setPersonalIdInput("");
      setLoginError("");
      setIsRegisteringId(false);
      if (isFirebaseActive() && auth) {
        await signOut(auth);
        setFirebaseUser(null);
      }
    } catch (e) {
      console.error("Sign out failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // ID-based Login and Registration controllers
const handleIdLoginSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoginError("");

  const cleanId = personalIdInput.trim();
  const cleanCode = personalCodeInput.trim();

  if (!cleanId) {
    setLoginError("נא להזין מספר אישי תקין");
    return;
  }

  if (!/^\d+$/.test(cleanId)) {
    setLoginError("מספר זיהוי חייב להכיל ספרות בלבד");
    return;
  }

  if (cleanId.length < 5) {
    setLoginError("מספר זיהוי קצר מדי (מינימום 5 ספרות)");
    return;
  }

  if (!/^\d{6}$/.test(cleanCode)) {
    setLoginError("קוד אישי חייב להכיל 6 ספרות");
    return;
  }

  setLoading(true);

  try {
    let foundProfile: UserProfile | null = null;

    if (isFirebaseActive() && auth) {
      // Firestore rules require authentication, so authenticate first.
      const authEmail = buildAuthEmail(cleanId);
      const credential = await signInWithEmailAndPassword(
        auth,
        authEmail,
        cleanCode
      );

      foundProfile = await dataService.getCurrentUserProfile(
        credential.user.uid
      );

      if (!foundProfile) {
        await signOut(auth);
        setFirebaseUser(null);
        setLoginError(
          "ההתחברות אומתה, אך לא נמצא פרופיל משתמש מתאים. יש לפנות למנהל המערכת."
        );
        return;
      }

      if (String(foundProfile.personalId || "").trim() !== cleanId) {
        await signOut(auth);
        setFirebaseUser(null);
        setLoginError(
          "המספר האישי אינו תואם לפרופיל המשתמש. יש לפנות למנהל המערכת."
        );
        return;
      }
    } else {
      foundProfile = await dataService.findProfileByPersonalId(cleanId);

      if (!foundProfile) {
        setRegPersonalId(cleanId);
        setPersonalIdInput(cleanId);
        setLoginError("");
        setIsRegisteringId(true);
        return;
      }
    }

    localStorage.setItem("idf_active_user_id", foundProfile.userId);
    localStorage.setItem(
      "idf_active_personal_id",
      foundProfile.personalId || cleanId
    );

    setUserProfile(foundProfile);

    const [reps, nots] = await Promise.all([
      dataService.fetchAllReports(),
      dataService.fetchNotifications(),
    ]);

    setReports(reps);
    setNotifications(nots);
    setActiveTab(getInitialTabForProfile(foundProfile));
  } catch (error: any) {
    console.error("Login verification error:", error);

    if (
      error?.code === "auth/invalid-credential" ||
      error?.code === "auth/wrong-password" ||
      error?.code === "auth/user-not-found"
    ) {
      setLoginError("מספר אישי או קוד אישי שגויים.");
    } else if (error?.code === "auth/user-disabled") {
      setLoginError("החשבון הושבת. יש לפנות למנהל המערכת.");
    } else if (error?.code === "auth/too-many-requests") {
      setLoginError(
        "בוצעו ניסיונות התחברות רבים מדי. יש להמתין מעט ולנסות שוב."
      );
    } else if (error?.code === "auth/network-request-failed") {
      setLoginError("בעיית תקשורת. בדוק את החיבור לאינטרנט ונסה שוב.");
    } else {
      setLoginError("ההתחברות נכשלה. נא לנסות שוב.");
    }
  } finally {
    setLoading(false);
    setAuthChecked(true);
  }
};

  const handleIdRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!regPersonalId.trim() || !regName.trim() || !regPhoneNumber.trim()) {
      setLoginError("נא למלא את כל השדות החיוניים (כולל שם מלא ומספר טלפון)");
      return;
    }
   const cleanRegCode = regPersonalCode.trim();

if (!/^\d{6}$/.test(cleanRegCode)) {
  setLoginError("קוד אישי חייב להכיל 6 ספרות");
  return;
}

if (cleanRegCode !== regPersonalCodeConfirm.trim()) {
  setLoginError("אימות הקוד האישי אינו תואם");
  return;
}

    if (regRole === "commander" || regRole === "adjutant_officer") {
  setLoginError("לא ניתן להירשם עצמאית כמפקד או קצין שלישות. יש לפנות למנהל המערכת.");
  return;
    }

    setLoading(true);
    const generatedUserId = `user_${Date.now()}`;
    const newProfile: UserProfile = {
      userId: generatedUserId,
      fullName: regName.trim(),
      role: regRole,
      unit: "טרם שוייך",
      email: `${regPersonalId}@idf.il`,
      createdAt: new Date().toISOString(),
      personalId: regPersonalId.trim(),
      phoneNumber: regPhoneNumber.trim(),
      medicalRole: "טרם נקבע"
    };

    try {
      if (isFirebaseActive() && auth) {
  const authEmail = buildAuthEmail(regPersonalId.trim());

  const userCredential = await createUserWithEmailAndPassword(
    auth,
    authEmail,
    cleanRegCode
  );

  newProfile.userId = userCredential.user.uid;
  newProfile.email = authEmail;
}
     await dataService.saveUserProfile(newProfile);

localStorage.setItem("idf_active_user_id", newProfile.userId);
localStorage.setItem("idf_active_personal_id", newProfile.personalId || regPersonalId.trim());

setUserProfile(newProfile);
      setIsRegisteringId(false);
      
      const users = await dataService.getAllUsers();
      const reps = await dataService.fetchAllReports();
      setAllUsers(users);
      setReports(reps);
      setSimCounter(prev => prev + 1);

      setActiveTab(getInitialTabForProfile(newProfile));
     } catch (err: any) {
  console.error("Error creating new ID account:", err);

  if (err?.code === "auth/email-already-in-use") {
    setLoginError("המספר האישי הזה כבר רשום במערכת. נסה להתחבר במקום להירשם.");
  } else if (err?.code === "auth/weak-password") {
    setLoginError("הקוד האישי חלש מדי. יש להזין קוד בן 6 ספרות.");
  } else {
    setLoginError("יצירת החשבון נכשלה. נא לנסות שנית.");
  }
    } finally {
      setLoading(false);
    }
  };

  // Submit presence report (by active user)
  const handleSubmitReport = async (
  status: AttendanceStatus,
  location: string,
  note: string,
  coords?: { lat: number; lng: number },
  reportDate?: string,
  cutOrderStartDate?: string,
  cutOrderEndDate?: string,
  dayMarker?: "return_to_base" | "exit_home"
) => {
  if (!userProfile) return;

  const submitterProfile =
    userProfile.personalId === "5749199"
      ? { ...userProfile, systemRole: "super_admin" as SystemRole }
      : userProfile;
  const submitterSystemRole = getEffectiveSystemRole(submitterProfile);
  const allowedWhileClosed =
    systemSettings?.reportingClosedAllowedRoles || ["super_admin", "admin"];

  if (
    systemSettings?.reportingEnabled === false &&
    !allowedWhileClosed.includes(submitterSystemRole)
  ) {
    showAppMessage(
      "הדיווחים סגורים כעת",
      systemSettings.reportingClosedMessage ||
        "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס.",
      "info"
    );
    return;
  }

  const getReportDate = (dateStr?: string) => {
    return dateStr || getIsraelDateString();
  };

  const buildReportPayload = (dateStr?: string) => ({
    userId: userProfile.userId,
    personalId: userProfile.personalId,
    userName: userProfile.fullName,
    unit: userProfile.unit,
    status,
    location,
    note,
    ...(dayMarker ? { dayMarker } : {}),
    reportDate: getReportDate(dateStr),
    timestamp: new Date().toISOString(),

    createdBy: userProfile.userId,
    createdByName: userProfile.fullName,
    createdByRole: userProfile.role,

    ...(coords
      ? {
          latitude: coords.lat,
          longitude: coords.lng,
        }
      : {}),

    ...(hasPermission(permissions, "reports.verify")
      ? {
          verifiedBy: userProfile.userId,
          verifiedAt: new Date().toISOString(),
        }
      : {}),
  });

  const showAlertToast = () => {
    if (status === "base") return;

    const labelObj = statusLabels[status] || { label: status };
    const localToast: ToastMessage = {
      id: `toast_${Date.now()}`,
      title: "דיווח חריג נשלח בהצלחה",
      message: `דיווחת על מיקום חריג (${labelObj.label}). מפקד היחידה קיבל התראה על כך.`,
      status,
    };

    setToasts((current) => [localToast, ...current]);

    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== localToast.id));
    }, 6000);
  };

  const isRangeReport =
    !!cutOrderStartDate &&
    !!cutOrderEndDate &&
    ["cut_order", "base", "home"].includes(status);

  if (isRangeReport) {
    if (!cutOrderStartDate || !cutOrderEndDate) {
      showAppMessage("חסרים תאריכים", "יש לבחור תאריך התחלה ותאריך סיום לדיווח", "info");
      return;
    }

    const start = new Date(cutOrderStartDate);
    const end = new Date(cutOrderEndDate);

    if (end < start) {
      showAppMessage("טווח תאריכים לא תקין", "תאריך הסיום לא יכול להיות לפני תאריך ההתחלה", "error");
      return;
    }

    const current = new Date(start);
    const firstDate = cutOrderStartDate;
    const lastDate = cutOrderEndDate;

    while (current <= end) {
      const dateStr = getIsraelDateString(current);

      const payload = {
        ...buildReportPayload(dateStr),
        dayMarker:
          status === "base"
            ? dateStr === firstDate
              ? "return_to_base"
              : dateStr === lastDate
              ? "exit_home"
              : undefined
            : undefined,
        note,
      };

      const reportId = await dataService.createAttendanceReport(payload);

      upsertReportInState({
        ...payload,
        reportId,
        isReset: false,
resetAt: undefined,
resetBy: undefined,
resetByName: undefined,
        verifiedBy: (payload as any).verifiedBy || "SYSTEM_AUTO",
        verifiedAt: (payload as any).verifiedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as AttendanceReport);

      current.setDate(current.getDate() + 1);
    }
  } else {
    const payload = buildReportPayload(reportDate);
    const reportId = await dataService.createAttendanceReport(payload);

    upsertReportInState({
      ...payload,
      reportId,
      isReset: false,
resetAt: undefined,
resetBy: undefined,
resetByName: undefined,
      verifiedBy: (payload as any).verifiedBy || "SYSTEM_AUTO",
      verifiedAt: (payload as any).verifiedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as AttendanceReport);
  }

  showAlertToast();

  refreshReports();
  refreshNotifications();
};

  
  // Verify/Acknowledge report (by Commander)
  const handleVerifyReport = async (reportId: string) => {
    if (!userProfile) return;
    await dataService.verifyReport(reportId, userProfile.userId);
    await refreshReports();
  };

  // Admin update or add soldier
 const handleAdminUpdateSoldier = async (profile: UserProfile & { personalCode?: string }) => {
  let profileToSave: UserProfile = { ...profile };

  try {
    const isNewSoldier = profile.userId.startsWith("user_");
    const oldSoldier = allUsers.find((u) => u.userId === profile.userId);

const changes: string[] = [];

if (!isNewSoldier && oldSoldier) {
  if (oldSoldier.fullName !== profileToSave.fullName) {
    changes.push(`שם שונה מ-${oldSoldier.fullName} ל-${profileToSave.fullName}`);
  }

  if (oldSoldier.phoneNumber !== profileToSave.phoneNumber) {
    changes.push(`טלפון שונה מ-${oldSoldier.phoneNumber || "לא צוין"} ל-${profileToSave.phoneNumber || "לא צוין"}`);
  }

  if (oldSoldier.unit !== profileToSave.unit) {
    changes.push(`שיוך שונה מ-${oldSoldier.unit || "לא צוין"} ל-${profileToSave.unit || "לא צוין"}`);
  }

  if (oldSoldier.medicalRole !== profileToSave.medicalRole) {
    changes.push(`תפקיד שונה מ-${oldSoldier.medicalRole || "לא צוין"} ל-${profileToSave.medicalRole || "לא צוין"}`);
  }

  if (oldSoldier.role !== profileToSave.role) {
    const roleLabels: Record<string, string> = {
  soldier: "חייל/ת",
  commander: "מפקד/ת",
  adjutant_officer: "קצין/ת שלישות"
};

changes.push(
  `סוג משתמש שונה מ-${
    roleLabels[oldSoldier.role] || oldSoldier.role
  } ל-${
    roleLabels[profileToSave.role] || profileToSave.role
  }`
);
  }
}

    if (isNewSoldier && isFirebaseActive() && secondaryAuth) {
      const authEmail = buildAuthEmail(profile.personalId || "");
      const authPassword = profile.personalCode || "";

      const userCredential = await createUserWithEmailAndPassword(
  secondaryAuth,
  authEmail,
  authPassword
);

await signOut(secondaryAuth);

      profileToSave = {
        ...profileToSave,
        userId: userCredential.user.uid,
        email: authEmail
      };
    }

    delete (profileToSave as any).personalCode;

    await dataService.adminSaveUserProfile(profileToSave);
 await dataService.createSystemLog({
  action: isNewSoldier ? "add_soldier" : "edit_soldier",
  actorUserId: userProfile?.userId || "unknown",
  actorName: userProfile?.fullName || "משתמש לא ידוע",
  targetUserId: profileToSave.userId,
  targetName: profileToSave.fullName,
  details: isNewSoldier
  ? `נוסף חייל חדש (${profileToSave.medicalRole || "ללא תפקיד"})`
  : changes.length > 0
  ? changes.join(" | ")
  : `עודכנו פרטי חייל (${profileToSave.medicalRole || "ללא תפקיד"})`,
});
    
    setSystemLogs((currentLogs) => [
  {
    logId: `local_${Date.now()}`,
    action: isNewSoldier ? "add_soldier" : "edit_soldier",
    actorUserId: userProfile?.userId || "unknown",
    actorName: userProfile?.fullName || "משתמש לא ידוע",
    targetUserId: profileToSave.userId,
    targetName: profileToSave.fullName,
    details: isNewSoldier
      ? `נוסף חייל חדש (${profileToSave.medicalRole || "ללא תפקיד"})`
      : changes.length > 0
      ? changes.join(" | ")
      : `עודכנו פרטי חייל (${profileToSave.medicalRole || "ללא תפקיד"})`,
    timestamp: new Date().toISOString(),
  },
  ...currentLogs,
]);
    const users = await dataService.getAllUsers();
    setAllUsers(users);
    const logs = await dataService.getSystemLogs();
setSystemLogs(logs);

    if (userProfile && userProfile.userId === profileToSave.userId) {
      setUserProfile(profileToSave);
    }
  } catch (err) {
    console.error("Admin save soldier error:", err);
    showAppMessage("שגיאה", "שגיאה בשמירת חייל / יומן מערכת", "error");
    throw err;
  }
};

  // Admin save or create report on behalf of a soldier
const handleAdminSaveReport = async (reportData: {
  reportId?: string;
  userId: string;
  userName: string;
  unit: string;
  status: AttendanceStatus;
  location: string;
  note?: string;
  reportDate?: string;
  rangeStartDate?: string;
  rangeEndDate?: string;
  dayMarker?: "return_to_base" | "exit_home" | "after_hours";
  afterHours?: number;
}) => {
  const buildPayload = (dateStr: string) => ({
    userId: reportData.userId,
    userName: reportData.userName,
    unit: reportData.unit,
    status: reportData.status,
    location: reportData.location,
    note: reportData.note || "",
    reportDate: dateStr,
    timestamp: new Date(`${dateStr}T12:00:00`).toISOString(),

    dayMarker: reportData.dayMarker,
    afterHours:
      reportData.dayMarker === "after_hours"
        ? reportData.afterHours
        : undefined,

    createdBy: userProfile?.userId || "unknown",
    createdByName: userProfile?.fullName || "לא ידוע",
    createdByRole: userProfile?.role || "unknown",
  });

  if (reportData.reportId) {
    const updatePayload: any = {
      status: reportData.status,
      location: reportData.location,
      note: reportData.note || "",
      isReset: false,
    };

    if (reportData.dayMarker) {
      updatePayload.dayMarker = reportData.dayMarker;
    } else {
      updatePayload.dayMarker = deleteField();
      updatePayload.afterHours = deleteField();
    }

    if (reportData.dayMarker === "after_hours") {
      updatePayload.afterHours = reportData.afterHours || 4;
    } else if (reportData.dayMarker) {
      updatePayload.afterHours = deleteField();
    }

    await dataService.updateAttendanceReport(
      reportData.reportId,
      updatePayload,
      userProfile || undefined
    );

    await dataService.createSystemLog({
      action: "edit_report",
      actorUserId: userProfile?.userId || "unknown",
      actorName: userProfile?.fullName || "משתמש לא ידוע",
      targetUserId: reportData.userId,
      targetName: reportData.userName,
      details: `עודכן דיווח לתאריך ${
        reportData.reportDate || "לא ידוע"
      } | סטטוס: ${reportData.status} | מיקום: ${reportData.location}`,
    });

    const existingReport = reports.find(
      (report) =>
        report.reportId === reportData.reportId ||
        (report as any).id === reportData.reportId
    );

    const updatedReport: AttendanceReport = {
      ...(existingReport || {}),
      reportId: reportData.reportId,
      userId: reportData.userId,
      userName: reportData.userName,
      unit: reportData.unit,
      status: reportData.status,
      location: reportData.location,
      note: reportData.note || "",
      reportDate:
        reportData.reportDate ||
        (existingReport as any)?.reportDate ||
        new Date().toISOString().split("T")[0],
      timestamp: existingReport?.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: userProfile?.userId || "unknown",
      updatedByName: userProfile?.fullName || "לא ידוע",
      updatedByRole: userProfile?.role || "unknown",
      isReset: false,
    } as AttendanceReport;

    if (reportData.dayMarker) {
      updatedReport.dayMarker = reportData.dayMarker;
    } else {
      delete (updatedReport as any).dayMarker;
    }

    if (reportData.dayMarker === "after_hours") {
      updatedReport.afterHours = reportData.afterHours || 4;
    } else {
      delete (updatedReport as any).afterHours;
    }

    upsertReportInState(updatedReport);
  } else {
    const startDate =
      reportData.rangeStartDate ||
      reportData.reportDate ||
      new Date().toISOString().split("T")[0];

    const endDate = reportData.rangeEndDate || startDate;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      showAppMessage(
        "טווח תאריכים לא תקין",
        "תאריך הסיום לא יכול להיות לפני תאריך ההתחלה",
        "error"
      );
      return;
    }

    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      await dataService.createAttendanceReport(buildPayload(dateStr));
      current.setDate(current.getDate() + 1);
    }

    await dataService.createSystemLog({
      action: "create_report",
      actorUserId: userProfile?.userId || "unknown",
      actorName: userProfile?.fullName || "משתמש לא ידוע",
      targetUserId: reportData.userId,
      targetName: reportData.userName,
      details: `נוצר דיווח ע״י מפקד לתאריכים ${startDate} עד ${endDate} | סטטוס: ${reportData.status} | מיקום: ${reportData.location}`,
    });

    await refreshReports();
  }

  await refreshNotifications();
};

  // IDF Military and National ID Sign-in Gateway screen
 if (!userProfile) {
  if (auth?.currentUser) {
    return (
      <div className="min-h-screen bg-military-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-military-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-bold text-military-800">
            טוען מערכת קשר ודיווח...
          </span>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden" dir="rtl">
        {/* Ambient background decoration */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-700/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-800/20 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="w-full max-w-md bg-slate-950/80 rounded-2xl border-2 border-emerald-800/40 p-8 shadow-2xl relative z-10 backdrop-blur-md">
          
          <div className="text-center space-y-3 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-800 to-slate-900 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/30 shadow-lg">
              <ShieldCheck className="w-8 h-8 text-emerald-400 animate-pulse" />
            </div>
            
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-white animate-fade-in">כניסה למערכת נוכחות</h1>
              <p className="text-xs text-slate-400 font-bold">תאג״ד 997 - מערך בקרה שדה דיגיטלי</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!isRegisteringId ? (
              <motion.form 
                key="login-form"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleIdLoginSubmit} 
                className="space-y-4 text-right pr-0"
              >
                <div className="bg-slate-900/60 p-4 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed space-y-1.5 shadow-inner">
                  <span className="font-bold text-emerald-400 block mb-1 text-sm">הזדהות בסגל הרפואי:</span>
                  <p>• התחברות באמצעות הזנת **מספר אישי** שנקבעו עבורך על ידי מנהלי המערכת.</p>
                  <p>• כניסה מוגנת וקבועה – המכשיר הנוכחי יישאר מחובר ומאובטח לעמוד האישי שלך!</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-200">מספר זיהוי (מספר אישי)</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="הזן כאן לעריכה וכניסה"
                      value={personalIdInput}
                      onChange={(e) => setPersonalIdInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-3 pr-10 hover:border-emerald-700/50 focus:border-emerald-500 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-left tracking-widest font-black placeholder:text-right placeholder:tracking-normal placeholder:font-normal text-white transition-all shadow-inner"
                      disabled={loading}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
  <label className="block text-xs font-bold text-slate-200">
    קוד אישי
  </label>

  <input
    type="password"
    required
    placeholder="6 ספרות"
    value={personalCodeInput}
    onChange={(e) => setPersonalCodeInput(e.target.value)}
    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-3 focus:border-emerald-500 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-left tracking-widest font-black text-white transition-all shadow-inner"
    disabled={loading}
  />
</div>
                </div>

                {loginError && (
                  <div className="p-3 bg-red-950/40 border border-red-900/40 text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] active:scale-[0.99] disabled:hover:scale-100 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-2 border border-emerald-500/30 shadow-md"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <UserCheck className="w-4.5 h-4.5 text-emerald-100" />
                      <span>התחבר למערכת</span>
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="reg-form"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleIdRegistrationSubmit} 
                className="space-y-4 text-right pr-0"
              >
                <div className="bg-emerald-950/30 p-3.5 border border-emerald-900/30 rounded-xl text-xs text-emerald-200">
                  <span className="font-bold text-white block mb-0.5">סריקה ראשונית - המזהה אינו קיים במאגר</span>
                  מספר הזיהוי <span className="font-bold text-white tracking-widest">{regPersonalId}</span> מעולם לא הופעל עבור גדודינו. באפשרותך לבצע הרשמה מהירה לתפקידך:
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-200">שם מלא (עברית)</label>
                  <input
                    type="text"
                    required
                    placeholder="ישראל ישראלי"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 focus:border-emerald-500 text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-white font-medium"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-200">מספר טלפון נייד</label>
                  <input
                    type="tel"
                    required
                    placeholder="050-1234567"
                    value={regPhoneNumber}
                    onChange={(e) => setRegPhoneNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 focus:border-emerald-500 text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-white font-medium text-left tracking-wider"
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-slate-200">
      קוד אישי
    </label>
    <input
      type="password"
      required
      placeholder="4-6 ספרות"
      value={regPersonalCode}
      onChange={(e) => setRegPersonalCode(e.target.value)}
      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 focus:border-emerald-500 text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-white font-medium text-center tracking-widest"
      disabled={loading}
    />
  </div>

  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-slate-200">
      אימות קוד אישי
    </label>
    <input
      type="password"
      required
      placeholder="הזן שוב את הקוד"
      value={regPersonalCodeConfirm}
      onChange={(e) => setRegPersonalCodeConfirm(e.target.value)}
      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 focus:border-emerald-500 text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-white font-medium text-center tracking-widest"
      disabled={loading}
    />
  </div>
</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-400">שיוך רפואי (מחלקת תאג״ד)</label>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-500 font-bold select-none leading-relaxed">
                      ייקבע ע״י מפקד לאחר הרישום
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-200">הרשאת מערכת ותפקיד</label>
                    <select
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2.5 focus:border-emerald-500 text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none text-white cursor-pointer"
                      disabled={loading}
                    >
                      <option className="bg-slate-950 text-white" value="soldier">חייל/ת - דיווח אישי בלבד</option>
                      <option className="bg-slate-950 text-white" value="commander">מפקד/ת - גישה ללוח בקרה</option>
                      <option className="bg-slate-950 text-white" value="adjutant_officer">קצינ/ת שלישות - צפייה בלבד</option>
                    </select>
                  </div>
                </div>

                {(regRole === "commander" || regRole === "adjutant_officer") && (
                  <div className="space-y-1.5 p-3.5 bg-emerald-950/20 border border-emerald-800/20 rounded-xl animate-fade-in relative">
                    <label className="block text-xs font-bold text-emerald-300">קוד אימות מפקד מורשה</label>
                    <input
                      type="password"
                      required
                      placeholder="הזן קוד אימות"
                      value={regPasscode}
                      onChange={(e) => setRegPasscode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 focus:border-emerald-500 text-xs text-center tracking-widest font-black focus:ring-1 focus:ring-emerald-500 outline-none text-white"
                      disabled={loading}
                    />
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">• הרשאת מפקד כפופה להזנת קוד אימות זה כדי למנוע גישה לא מורשית לנתוני הסגל.</p>
                  </div>
                )}

                {loginError && (
                  <div className="p-3 bg-red-950/40 border border-red-900/40 text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisteringId(false);
                      setLoginError("");
                    }}
                    className="flex-1 bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold py-2.5 rounded-lg border border-slate-800 transition cursor-pointer text-xs"
                    disabled={loading}
                  >
                    חזור
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg border border-emerald-500/30 shadow transition cursor-pointer text-xs"
                  >
                    הרשם והכנס למערכת
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="mt-6 pt-5 border-t border-slate-900 text-center text-[10px] text-slate-500">
             מערכת נוכחות וניהול כוח אדם פנימית של צבא ההגנה לישראל
          </div>
        </div>
      </div>
    );
  }

  const effectiveSystemRole = permissionUser
    ? getEffectiveSystemRole(permissionUser)
    : null;

  const maintenanceAllowedRoles =
    systemSettings?.maintenanceAllowedRoles || ["super_admin", "admin"];
  const reportingClosedAllowedRoles =
    systemSettings?.reportingClosedAllowedRoles || ["super_admin", "admin"];

  const isMaintenanceBlocked =
    systemSettings?.maintenanceMode === true &&
    !!effectiveSystemRole &&
    !maintenanceAllowedRoles.includes(effectiveSystemRole);

  const canUseReporterWhileClosed =
    !!effectiveSystemRole &&
    reportingClosedAllowedRoles.includes(effectiveSystemRole);

  const maintenanceDisplayMessage =
    systemSettings?.maintenanceMessage ||
    "המערכת נמצאת כרגע בתחזוקה. נסו שוב מאוחר יותר.";

  const reportingDisplayMessage =
    systemSettings?.reportingClosedMessage ||
    "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס.";

  return (
    <div id="full-idf-app-interface" className="min-h-screen bg-military-50 flex flex-col pb-12">
      {/* Floating Toast Notification Popups */}
      <div id="app-alerts-toaster" className="fixed top-4 left-4 right-4 sm:left-6 sm:right-auto sm:top-6 z-[9999] flex flex-col gap-3 sm:max-w-sm font-sans text-right" dir="rtl">
        <AnimatePresence>
          {toasts.map((toast) => {
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: -100, y: 0, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -100, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="bg-slate-900 border border-slate-700 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3 border-r-4 border-r-rose-500 overflow-hidden"
              >
                <div className="p-1.5 bg-rose-950/50 rounded-lg shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-450 animate-bounce" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                    {toast.title}
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {toast.message}
                  </p>
                </div>
                <button
                  onClick={() => setToasts(current => current.filter(t => t.id !== toast.id))}
                  className="text-slate-400 hover:text-white transition cursor-pointer border-none bg-transparent self-start font-bold py-0 px-1 text-xs"
                >
                  ✕
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Header Container */}
      <Header
        currentUser={userProfile}
        allUsers={allUsers}
        onSwitchUser={handleSwitchUser}
        onUpdateProfile={handleUpdateProfile}
        onResetData={handleResetData}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onClearAllNotifications={handleClearAllNotifications}
        onLogout={handleLogout}
        medicalUnits={medicalUnits}
        canEdit={hasPermission(permissions, "soldiers.edit")}
        systemSettings={systemSettings}
      />

      {isMaintenanceBlocked ? (
        <main
          dir="rtl"
          className="mx-auto flex w-full max-w-4xl flex-grow items-center justify-center px-4 py-10 sm:px-6"
        >
          <section className="w-full rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h1 className="mt-5 text-2xl font-black text-slate-900">
              המערכת נמצאת במצב תחזוקה
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              {maintenanceDisplayMessage}
            </p>
            <p className="mt-5 text-xs font-bold text-slate-400">
              נסו להיכנס שוב מאוחר יותר.
            </p>
          </section>
        </main>
      ) : (
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-grow overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        
        {systemSettings?.systemMode === "operational" && (
          <div className="mb-4 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-xs font-bold text-orange-900 shadow-sm">
            מצב מבצעי פעיל — {systemSettings.operationalMessage}
          </div>
        )}

        {systemSettings?.systemMode === "emergency" &&
          systemSettings.emergencyEvent?.active && (
            <button
              type="button"
              onClick={() => setActiveTab("emergency")}
              className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-red-400 bg-red-700 px-4 py-3 text-right text-white shadow-lg"
            >
              <span>
                <span className="block text-sm font-black">מצב חירום פעיל</span>
                <span className="mt-1 block text-xs text-red-100">
                  {systemSettings.emergencyEvent.title}
                </span>
              </span>
              <Siren className="h-6 w-6 shrink-0 animate-pulse" />
            </button>
          )}

        {/* Firebase Account Logging Ribbon */}
        {isFirebaseActive() && firebaseUser && (
          <div className="mb-4 bg-slate-100 border border-slate-200/80 p-2 px-3 rounded-lg flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>מחובר בענן כ: <b className="text-slate-700">{firebaseUser.email}</b></span>
            </span>
            <button
              onClick={handleLogout}
              className="hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer transition text-[10px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>התנתק</span>
            </button>
          </div>
        )}

        {/* Navigation Tabs (Only if Commander) */}
        {(canViewReporter || canViewDashboard || canViewShifts || isSuperAdmin) && (
          <div className="custom-scrollbar mb-5 flex w-full max-w-full gap-2 overflow-x-auto border-b border-slate-200/80 pb-1">
            {canViewReporter && (
            <button
              onClick={() => setActiveTab("reporter")}
              className={`shrink-0 whitespace-nowrap pb-3.5 px-3 font-bold text-xs sm:px-4 sm:text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "reporter"
                  ? systemSettings?.systemMode === "operational"
                    ? "border-orange-600 bg-orange-50 px-3 text-orange-800"
                    : "border-military-600 text-military-800"
                  : systemSettings?.systemMode === "operational"
                  ? "border-orange-300 bg-orange-50 px-3 text-orange-700 hover:text-orange-800"
                  : "border-transparent text-slate-400 hover:text-slate-500"
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>דיווח נוכחות אישי</span>
            </button>
            )}

            {canViewDashboard && (
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`shrink-0 whitespace-nowrap pb-3.5 px-3 font-bold text-xs sm:px-4 sm:text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "dashboard"
                  ? "border-military-600 text-military-800"
                  : "border-transparent text-slate-400 hover:text-slate-500"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>לוח בקרה מפקדים (סגל)</span>
            </button>
            )}

            {canViewShifts && (
              <button
                onClick={() => setActiveTab("shifts")}
                className={`shrink-0 whitespace-nowrap pb-3.5 px-3 font-bold text-xs sm:px-4 sm:text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "shifts"
                    ? systemSettings?.systemMode === "operational"
                      ? "border-orange-600 bg-orange-50 px-3 text-orange-800"
                      : "border-indigo-600 text-indigo-700"
                    : systemSettings?.systemMode === "operational"
                    ? "border-orange-300 bg-orange-50 px-3 text-orange-700 hover:text-orange-800"
                    : "border-transparent text-slate-400 hover:text-slate-500"
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>משמרות</span>
              </button>
            )}

            {shouldShowEmergencyTab && (
              <button
                onClick={() => setActiveTab("emergency")}
                className={`shrink-0 whitespace-nowrap pb-3.5 px-3 font-bold text-xs sm:px-4 sm:text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "emergency"
                    ? "border-red-600 text-red-700"
                    : "border-transparent text-slate-400 hover:text-slate-500"
                }`}
              >
                <Siren className="h-4 w-4" />
                <span>מרכז חירום</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab("system_admin")}
                className={`shrink-0 whitespace-nowrap pb-3.5 px-3 font-bold text-xs sm:px-4 sm:text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "system_admin"
                    ? "border-rose-600 text-rose-700"
                    : "border-transparent text-slate-400 hover:text-slate-500"
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>ניהול מערכת</span>
              </button>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "system_admin" && isSuperAdmin ? (
            <motion.div
              key="system-admin-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <SystemAdminPanel
                currentUser={userProfile}
                permissions={permissions}
                users={allUsers}
                onUpdateSystemRole={handleUpdateUserSystemRole}
                onAttendanceStatusesChanged={handleAttendanceStatusesChanged}
                unitConfigs={unitConfigs}
                onUnitConfigsChanged={handleUnitConfigsChanged}
                medicalRoleConfigs={medicalRoleConfigs}
                onMedicalRoleConfigsChanged={handleMedicalRoleConfigsChanged}
                googleSheetsConfig={googleSheetsConfig}
                onGoogleSheetsConfigChanged={handleGoogleSheetsConfigChanged}
                systemSettings={systemSettings}
                onSystemSettingsChanged={handleSystemSettingsChanged}
                shiftSlotConfigs={shiftSlotConfigs}
                onShiftSlotConfigsChanged={handleShiftSlotConfigsChanged}
                externalStaff={externalStaff}
                onExternalStaffChanged={handleExternalStaffChanged}
              />
            </motion.div>
          ) : activeTab === "emergency" && shouldShowEmergencyTab ? (
            <motion.div
              key="emergency-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <EmergencyCenter
                currentUser={userProfile}
                allUsers={allUsers}
                canManage={canManageEmergency}
                settings={systemSettings!}
                onSettingsChanged={handleSystemSettingsChanged}
              />
            </motion.div>
          ) : activeTab === "shifts" && canViewShifts ? (
            <motion.div
              key="shifts-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              {systemSettings?.shiftsEnabled === false ? (
                <section
                  dir="rtl"
                  className="rounded-3xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-8 text-center shadow-sm"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                    <CalendarDays className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-xl font-black text-slate-900">
                    מסך המשמרות סגור כעת
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                    {systemSettings?.shiftsClosedMessage ||
                      "מסך המשמרות אינו זמין כעת. יש להתעדכן מול המפקד."}
                  </p>
                </section>
              ) : (
                <ShiftsView
                  currentUser={userProfile}
                  allUsers={allUsers}
                  canManage={canManageShifts}
                  shiftSlotConfigs={shiftSlotConfigs}
                  medicalRoleConfigs={medicalRoleConfigs}
                  externalStaff={externalStaff}
                  reports={reports}
                  attendanceStatuses={attendanceStatuses}
                />
              )}
            </motion.div>
          ) : activeTab === "reporter" && canViewReporter ? (
            <motion.div
              key="reporter-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              {systemSettings?.reportingEnabled === false &&
              !canUseReporterWhileClosed ? (
                <section
                  dir="rtl"
                  className="rounded-3xl border border-sky-200 bg-gradient-to-l from-sky-50 to-white p-8 text-center shadow-sm"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Info className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-xl font-black text-slate-900">
                    דיווחי הנוכחות סגורים כעת
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                    {reportingDisplayMessage}
                  </p>
                </section>
              ) : (
                <SoldierReporter
                  currentUser={userProfile}
                  reports={reports}
                  attendanceStatuses={attendanceStatuses}
                  onSubmitReport={handleSubmitReport}
                />
              )}
            </motion.div>
          ) : activeTab === "dashboard" && canViewDashboard ? (
            <motion.div
              key="dashboard-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <CommandDashboard
                currentUser={userProfile}
                permissions={permissions}
                attendanceStatuses={attendanceStatuses}
                reports={reports}
                attendanceLogs={attendanceLogs}
                systemLogs={systemLogs}
                notifications={notifications}
                allSoldiers={allUsers}
                onVerifyReport={handleVerifyReport}
                onAdminUpdateSoldier={handleAdminUpdateSoldier}
                onAdminSaveReport={handleAdminSaveReport}
                onDeleteSoldier={handleDeleteSoldier}
                onDeleteReport={handleDeleteReport}
                onResetReport={handleResetReport}
                onShowMessage={showAppMessage}
                medicalUnits={medicalUnits}
                customRoles={customRoles}
                onUpdateMedicalSettings={handleUpdateMedicalSettings}
                onSyncOldReportsToSheets={handleSyncOldReportsToSheets}
              />
            </motion.div>
          ) : (
            <motion.section
              key="no-access-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              dir="rtl"
              className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"
            >
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
              <h2 className="mt-4 text-xl font-black text-slate-900">
                אין הרשאה למסך זה
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                פנה למנהל האתר כדי לעדכן את הרשאות התפקיד שלך.
              </p>
            </motion.section>
          )}
        </AnimatePresence>

      </main>
      )}
      <AppMessageModal
        isOpen={Boolean(appMessage)}
        title={appMessage?.title || ""}
        message={appMessage?.message || ""}
        type={appMessage?.type || "info"}
        onClose={() => setAppMessage(null)}
      />

      <footer className="text-center py-6 text-cyan-500 font-bold text-sm select-none animate-fade-in" dir="rtl">
        {systemSettings?.footerText || "Created by AviElias"}
      </footer>
    </div>
  );
}
