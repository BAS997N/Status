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
  serverTimestamp
} from "firebase/firestore";
import { db, auth, isFirebaseActive } from "../firebase";
import { UserProfile, AttendanceReport, AttendanceStatus, AppNotification, ATTENDANCE_STATUS_LABELS, IDF_UNITS } from "../types";

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
const GOOGLE_SHEETS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbzoMH-OzKtGCCWW0rdqaf8TPwlEXoPPSTV3tqjaC4DtFe5o4hVutyzK_FB5HeJRDj_VeQ/exec";


export const dataService = {
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
  const payload = {
    ...logData,
    timestamp: new Date().toISOString(),
  };

  if (!isFirebaseActive()) {
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
      ...payload,
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
        list.push({ reportId: docSnap.id, ...docSnap.data() } as AttendanceReport);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },
  async syncAllReportsToGoogleSheets(): Promise<void> {
  const reports = await this.fetchAllReports();
  const users = await this.getAllUsers();

  const sortedReports = [...reports].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const report of sortedReports) {
    const soldier = users.find(
      (u) => u.userId === report.userId || u.personalId === (report as any).personalId
    );

    const markerText =
      report.dayMarker === "return_to_base"
        ? "חזרה לבסיס"
        : report.dayMarker === "exit_home"
        ? "יציאה לבית"
        : report.dayMarker === "after_hours"
        ? `אפטר ${report.afterHours || ""} שעות`
        : "";

    const statusText = ATTENDANCE_STATUS_LABELS[report.status]?.label || report.status;
    const reportDateObj = new Date(report.timestamp);
const formattedDate = `${String(reportDateObj.getDate()).padStart(2, "0")}/${String(
  reportDateObj.getMonth() + 1
).padStart(2, "0")}/${reportDateObj.getFullYear()}`;
    
    fetch(GOOGLE_SHEETS_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
  personalId: soldier?.personalId || (report as any).personalId || report.userId,
  fullName: soldier?.fullName || report.userName,
  medicalRole: soldier?.medicalRole || "",
  role: soldier?.medicalRole || "",
  phone: soldier?.phoneNumber || "",
  date: formattedDate,
  cellValue: markerText ? `${statusText}/${markerText}` : statusText,
}),
    }).catch((err) => {
      console.warn("Google Sheets old report sync failed:", err);
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
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
        list.push({ reportId: docSnap.id, ...docSnap.data() } as AttendanceReport);
      });
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async createAttendanceReport(reportData: Omit<AttendanceReport, "reportId">): Promise<string> {
    const reportPayload: AttendanceReport = {
  ...reportData,
  reportId: "",
  verifiedBy: reportData.verifiedBy || "SYSTEM_AUTO",
  verifiedAt: reportData.verifiedAt || new Date().toISOString()
};

Object.keys(reportPayload).forEach((key) => {
  if ((reportPayload as any)[key] === undefined) {
    delete (reportPayload as any)[key];
  }
});
    const isAlert = reportPayload.status !== "base";
    const statusLabel = ATTENDANCE_STATUS_LABELS[reportPayload.status]?.label || reportPayload.status;
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
     const docRef = doc(collection(db, "attendance"));

await setDoc(docRef, {
  ...reportPayload,
  reportId: docRef.id,
  timestamp: serverTimestamp(),
  verifiedAt: serverTimestamp(),
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

const statusText =
  ATTENDANCE_STATUS_LABELS[reportPayload.status]?.label || reportPayload.status;

const reportDateObj = new Date(reportPayload.timestamp);
const formattedDate = `${String(reportDateObj.getDate()).padStart(2, "0")}/${String(
  reportDateObj.getMonth() + 1
).padStart(2, "0")}/${reportDateObj.getFullYear()}`;

fetch(GOOGLE_SHEETS_WEB_APP_URL, {
  method: "POST",
  mode: "no-cors",
  body: JSON.stringify({
    personalId:
      soldier?.personalId || (reportPayload as any).personalId || reportPayload.userId,
    fullName: soldier?.fullName || reportPayload.userName,
    role: soldier?.medicalRole || "",
    phone: soldier?.phoneNumber || "",
    date: formattedDate,
    cellValue: markerText ? `${statusText}/${markerText}` : statusText,
  }),
}).catch((err) => {
  console.warn("Google Sheets sync failed:", err);
});
      // Generate Firestore notification
      if (isAlert) {
        const notPayload = {
          reportId: docRef.id,
          userId: reportPayload.userId,
          soldierName: reportPayload.userName,
          unit: reportPayload.unit,
          status: reportPayload.status,
          location: reportPayload.location,
          timestamp: reportPayload.timestamp,
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
  await updateDoc(doc(db, "attendance", reportId), finalReportData);

  const updatedSnap = await getDoc(doc(db, "attendance", reportId));

  if (updatedSnap.exists()) {
    const updatedReport = {
      reportId,
      ...updatedSnap.data(),
    } as AttendanceReport;

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
      ATTENDANCE_STATUS_LABELS[updatedReport.status]?.label ||
      updatedReport.status;

    const reportDateObj = new Date(updatedReport.timestamp);
    const formattedDate = `${String(reportDateObj.getDate()).padStart(2, "0")}/${String(
      reportDateObj.getMonth() + 1
    ).padStart(2, "0")}/${reportDateObj.getFullYear()}`;

    fetch(GOOGLE_SHEETS_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        personalId:
          soldier?.personalId ||
          (updatedReport as any).personalId ||
          updatedReport.userId,
        fullName: soldier?.fullName || updatedReport.userName,
        role: soldier?.medicalRole || "",
        phone: soldier?.phoneNumber || "",
        date: formattedDate,
        cellValue: markerText ? `${statusText}/${markerText}` : statusText,
      }),
    }).catch((err) => {
      console.warn("Google Sheets update sync failed:", err);
    });
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
};
