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
  ATTENDANCE_STATUS_LABELS,
  IDF_UNITS,
  UserRole
} from "./types";
import { dataService } from "./services/dataService";
import Header from "./components/Header";
import SoldierReporter from "./components/SoldierReporter";
import CommandDashboard from "./components/CommandDashboard";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldCheck, 
  LayoutDashboard, 
  UserCheck, 
  AlertTriangle, 
  KeyRound, 
  Info,
  LogOut
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"reporter" | "dashboard">("reporter");

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

  // Simulation switch helper counter to trigger state re-reads
  const [simCounter, setSimCounter] = useState(0);

  const [medicalUnits, setMedicalUnits] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>([]);

  useEffect(() => {
  const loadMedicalSettings = async () => {
    const unitsKey = "idf_medical_units_list";
    const rolesKey = "idf_custom_roles_list";

    const defaultUnits = [
      "חוליית רפואה גדודית",
      "מחלקת פינוי וטראומה",
      "צוות טיפול נמרץ",
      "מרפאת בסיס קדמית",
      "סגל ופיקוד רפואי",
      "חוליית אפידמיולוגיה",
      "בית חולים שדה",
    ];

    const defaultRoles = [
      "רופא/ה צבאי/ת",
      "פרמדיק/ית",
      "חובש/ת",
      "סניטר/ית",
      "נהג/ת אמבולנס",
      "אח/ות צבאי/ת",
      "מפקד/ת תאג״ד",
      "חייל/ת מדווח/ת",
    ];

    try {
      if (isFirebaseActive() && db) {
        const snap = await getDoc(doc(db, "settings", "medical_config"));

        if (snap.exists()) {
          const data = snap.data();

          const finalUnits =
            Array.isArray(data.medicalUnits) && data.medicalUnits.length > 0
              ? data.medicalUnits
              : defaultUnits;

          const finalRoles =
            Array.isArray(data.customRoles) && data.customRoles.length > 0
              ? data.customRoles
              : defaultRoles;

          setMedicalUnits(finalUnits);
          setCustomRoles(finalRoles);

          if (finalUnits.length > 0) {
            setRegUnit(finalUnits[0]);
          }

          return;
        }

        await setDoc(doc(db, "settings", "medical_config"), {
          medicalUnits: defaultUnits,
          customRoles: defaultRoles,
          updatedAt: new Date().toISOString(),
        });

        setMedicalUnits(defaultUnits);
        setCustomRoles(defaultRoles);
        setRegUnit(defaultUnits[0]);
        return;
      }

      const storedUnits = localStorage.getItem(unitsKey);
      const storedRoles = localStorage.getItem(rolesKey);

      const finalUnits = storedUnits ? JSON.parse(storedUnits) : defaultUnits;
      const finalRoles = storedRoles ? JSON.parse(storedRoles) : defaultRoles;

      localStorage.setItem(unitsKey, JSON.stringify(finalUnits));
      localStorage.setItem(rolesKey, JSON.stringify(finalRoles));

      setMedicalUnits(finalUnits);
      setCustomRoles(finalRoles);

      if (finalUnits.length > 0) {
        setRegUnit(finalUnits[0]);
      }
    } catch (error) {
      console.error("Failed loading medical settings:", error);

      setMedicalUnits(defaultUnits);
      setCustomRoles(defaultRoles);
      setRegUnit(defaultUnits[0]);
    }
  };

  loadMedicalSettings();
}, []);

 const handleUpdateMedicalSettings = async (
  newUnits: string[],
  newRoles: string[]
) => {
  if (isFirebaseActive() && db) {
    await setDoc(
      doc(db, "settings", "medical_config"),
      {
        medicalUnits: newUnits,
        customRoles: newRoles,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } else {
    localStorage.setItem("idf_medical_units_list", JSON.stringify(newUnits));
    localStorage.setItem("idf_custom_roles_list", JSON.stringify(newRoles));
  }

  setMedicalUnits(newUnits);
  setCustomRoles(newRoles);
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

          if (profile.role === "commander" || profile.role === "adjutant_officer") {
            setActiveTab("dashboard");
          } else {
            setActiveTab("reporter");
          }
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

  useEffect(() => {
  if (!userProfile) return;
  refreshReports();
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
    alert("אירעה שגיאה במחיקת החייל");
  }
};
  const handleSyncOldReportsToSheets = async () => {
  await dataService.syncAllReportsToGoogleSheets();
  alert("ייבוא הדיווחים הישנים לגוגל שיטס הסתיים");
};
  const handleDeleteReport = async (reportId: string) => {
  try {
    await dataService.deleteAttendanceReport(reportId);
    await refreshReports();
    await refreshNotifications();
  } catch (error) {
    console.error("Failed deleting report:", error);
    alert("אירעה שגיאה במחיקת הדיווח");
  }
};
  
  
  // Poll reports and notifications every 4 seconds in commander/adjutant mode to pop up real-time soldier reports
  useEffect(() => {
    const poll = async () => {
      if (userProfile && (userProfile.role === "commander" || userProfile.role === "adjutant_officer")) {
        try {
          const updatedReports = await dataService.fetchAllReports();
          const updatedNots = await dataService.fetchNotifications();
          const updatedUsers = await dataService.getAllUsers();
          setReports(updatedReports);
          setAllUsers(updatedUsers);

          setNotifications(prev => {
            const prevIds = new Set(prev.map(n => n.notificationId));
            updatedNots.forEach(not => {
              if (prev.length > 0 && !prevIds.has(not.notificationId) && !not.isRead) {
                // Pop a gorgeous live floating banner
                const labelObj = ATTENDANCE_STATUS_LABELS[not.status] || { label: not.status };
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

    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [userProfile]);

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
  const foundProfile = await dataService.findProfileByPersonalId(cleanId);

  if (!foundProfile) {
    setRegPersonalId(cleanId);
    setPersonalIdInput(cleanId);
    setLoginError("");
    setIsRegisteringId(true);
    setLoading(false);
    return;
  }

  if (isFirebaseActive() && auth) {
    const authEmail = buildAuthEmail(cleanId);
    await signInWithEmailAndPassword(auth, authEmail, cleanCode);
  }


    localStorage.setItem("idf_active_user_id", foundProfile.userId);
    localStorage.setItem("idf_active_personal_id", foundProfile.personalId || cleanId);

    setUserProfile(foundProfile);

    const reps = await dataService.fetchAllReports();
    const nots = await dataService.fetchNotifications();

    setReports(reps);
    setNotifications(nots);

    if (foundProfile.role === "commander" || foundProfile.role === "adjutant_officer") {
      setActiveTab("dashboard");
    } else {
      setActiveTab("reporter");
    }
  } catch (error: any) {
    console.error("Login verification error:", error);

    if (error?.code === "auth/invalid-credential") {
      setLoginError("מספר אישי או קוד אישי שגויים.");
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

      if (newProfile.role === "commander" || newProfile.role === "adjutant_officer") {
        setActiveTab("dashboard");
      } else {
        setActiveTab("reporter");
      }
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
  cutOrderEndDate?: string
) => {
  if (!userProfile) return;

  const createTimestampForDate = (dateStr?: string) => {
    const selectedDate = dateStr || new Date().toISOString().split("T")[0];
    const now = new Date();
    const timePart = now.toTimeString().split(" ")[0];
    return new Date(`${selectedDate}T${timePart}`).toISOString();
  };

  const buildReportPayload = (dateStr?: string) => ({
    userId: userProfile.userId,
    personalId: userProfile.personalId,
    userName: userProfile.fullName,
    unit: userProfile.unit,
    status,
    location,
    note,
    timestamp: createTimestampForDate(dateStr),

    createdBy: userProfile.userId,
    createdByName: userProfile.fullName,
    createdByRole: userProfile.role,

    ...(coords
      ? {
          latitude: coords.lat,
          longitude: coords.lng,
        }
      : {}),

    ...(userProfile.role === "commander" ||
    userProfile.role === "adjutant_officer"
      ? {
          verifiedBy: userProfile.userId,
          verifiedAt: new Date().toISOString(),
        }
      : {}),
  });

  const isRangeReport =
  !!cutOrderStartDate &&
  !!cutOrderEndDate &&
  ["cut_order", "base", "home"].includes(status);

if (isRangeReport) {
    if (!cutOrderStartDate || !cutOrderEndDate) {
      alert("יש לבחור תאריך התחלה ותאריך סיום לדיווח");
      return;
    }

    const start = new Date(cutOrderStartDate);
    const end = new Date(cutOrderEndDate);

    if (end < start) {
      alert("תאריך הסיום לא יכול להיות לפני תאריך ההתחלה");
      return;
    }

    const current = new Date(start);

    const firstDate = cutOrderStartDate;
    const lastDate = cutOrderEndDate;

    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];

      await dataService.createAttendanceReport({
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
});
    

      current.setDate(current.getDate() + 1);
    }
  } else {
    await dataService.createAttendanceReport(buildReportPayload(reportDate));
   
  }

  await refreshReports();
  await refreshNotifications();

  if (status !== "base") {
    const labelObj = ATTENDANCE_STATUS_LABELS[status] || { label: status };
    const localToast: ToastMessage = {
      id: `toast_${Date.now()}`,
      title: `דיווח חריג נשלח בהצלחה`,
      message: `דיווחת על מיקום חריג (${labelObj.label}). מפקד היחידה קיבל התראה על כך.`,
      status: status
    };

    setToasts(current => [localToast, ...current]);
    setTimeout(() => {
      setToasts(current => current.filter(t => t.id !== localToast.id));
    }, 6000);
  }
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
    const users = await dataService.getAllUsers();
    setAllUsers(users);

    if (userProfile && userProfile.userId === profileToSave.userId) {
      setUserProfile(profileToSave);
    }
  } catch (err) {
    console.error("Admin save soldier error:", err);
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
};

if (reportData.dayMarker) {
  updatePayload.dayMarker = reportData.dayMarker;
}
    else {
  updatePayload.dayMarker = deleteField();
  updatePayload.afterHours = deleteField();
}

if (reportData.dayMarker === "after_hours") {
  updatePayload.afterHours = reportData.afterHours || 4;
}
    else if (reportData.dayMarker) {
  updatePayload.afterHours = deleteField();
}

await dataService.updateAttendanceReport(
  reportData.reportId,
  updatePayload,
  userProfile || undefined
);
  } else {
    const startDate =
      reportData.rangeStartDate ||
      reportData.reportDate ||
      new Date().toISOString().split("T")[0];

    const endDate = reportData.rangeEndDate || startDate;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      alert("תאריך הסיום לא יכול להיות לפני תאריך ההתחלה");
      return;
    }

    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      await dataService.createAttendanceReport(buildPayload(dateStr));
      current.setDate(current.getDate() + 1);
    }
  }

  await refreshReports();
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
        canEdit={userProfile.role === "commander" || userProfile.role === "adjutant_officer"}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 w-full flex-grow">
        
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
        {userProfile.role === "commander" && (
          <div className="flex border-b border-slate-200/80 mb-6 gap-2">
            <button
              onClick={() => setActiveTab("reporter")}
              className={`pb-3.5 px-4 font-bold text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "reporter"
                  ? "border-military-600 text-military-800"
                  : "border-transparent text-slate-400 hover:text-slate-500"
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>דיווח נוכחות אישי</span>
            </button>

            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-3.5 px-4 font-bold text-sm transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "dashboard"
                  ? "border-military-600 text-military-800"
                  : "border-transparent text-slate-400 hover:text-slate-500"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>לוח בקרה מפקדים (סגל)</span>
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "reporter" && userProfile.role !== "adjutant_officer" ? (
            <motion.div
              key="reporter-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <SoldierReporter 
                currentUser={userProfile}
                reports={reports}
                onSubmitReport={handleSubmitReport}
              />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
             <CommandDashboard
  currentUser={userProfile}
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
  medicalUnits={medicalUnits}
  customRoles={customRoles}
  onUpdateMedicalSettings={handleUpdateMedicalSettings}
  onSyncOldReportsToSheets={handleSyncOldReportsToSheets}
/>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
      <footer className="text-center py-6 text-cyan-500 font-bold text-sm select-none animate-fade-in" dir="rtl">
        Created by AviElias
      </footer>
    </div>
  );
}

