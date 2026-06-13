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
  deleteDoc
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

// Realistic Initial Simulation Data
const DEFAULT_SIMULATED_PROFILES: UserProfile[] = [
  {
    userId: "sim_soldier_1",
    fullName: "יוסי כהן",
    role: "soldier",
    unit: IDF_UNITS[0], // פלוגה א' - רובאית
    email: "yossi.cohen@idf.il",
    createdAt: "2026-06-01T08:00:00Z",
    personalId: "8123451",
    medicalRole: "חובש/ת"
  },
  {
    userId: "sim_soldier_2",
    fullName: "רוני אלוני",
    role: "soldier",
    unit: IDF_UNITS[1], // פלוגה ב' - חבלה
    email: "roni.aloni@idf.il",
    createdAt: "2026-06-02T09:00:00Z",
    personalId: "8123452",
    medicalRole: "נהג/ת אמבולנס"
  },
  {
    userId: "sim_soldier_3",
    fullName: "נדב לוי",
    role: "soldier",
    unit: IDF_UNITS[2], // פלוגה ג' - מסייעת
    email: "nadav.levi@idf.il",
    createdAt: "2026-06-02T10:00:00Z",
    personalId: "8123453",
    medicalRole: "חובש/ת"
  },
  {
    userId: "sim_soldier_4",
    fullName: "אלון שרון",
    role: "soldier",
    unit: IDF_UNITS[5], // יחידת קשר (קשר״ג)
    email: "alon.sharon@idf.il",
    createdAt: "2026-06-03T11:00:00Z",
    personalId: "8123454",
    medicalRole: "סניטר/ית"
  },
  {
    userId: "sim_soldier_5",
    fullName: "מיכל רז",
    role: "soldier",
    unit: IDF_UNITS[6], // חוליית רפואה
    email: "michal.raz@idf.il",
    createdAt: "2026-06-03T11:30:00Z",
    personalId: "8123455",
    medicalRole: "פרמדיק/ית"
  },
  {
    userId: "sim_soldier_6",
    fullName: "שני אהרוני",
    role: "soldier",
    unit: IDF_UNITS[7], // מחלקת טנא (חמוש)
    email: "shani.aharoni@idf.il",
    createdAt: "2026-06-04T12:00:00Z",
    personalId: "8123456",
    medicalRole: "אח/ות צבאי/ת"
  },
  {
    userId: "sim_commander_1",
    fullName: "אברהם חי אליאס",
    role: "commander",
    unit: IDF_UNITS[4], // סגל ופיקוד גדוד
    email: "avielias@idf.il",
    createdAt: "2026-05-20T08:00:00Z",
    personalId: "203947841",
    phoneNumber: "0504348057",
    medicalRole: "מפקד/ת תאג״ד"
  }
];

const DEFAULT_SIMULATED_REPORTS: AttendanceReport[] = [
  // Day before yesterday (June 8)
  {
    reportId: "rep_h1",
    userId: "sim_soldier_1",
    userName: "יוסי כהן",
    unit: IDF_UNITS[0],
    status: "base",
    location: "מחנה עופר - מוגדר כבשגרה",
    timestamp: "2026-06-08T07:22:15Z",
    note: "הגעה רגילה עם הסעה",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-08T08:15:00Z"
  },
  {
    reportId: "rep_h2",
    userId: "sim_soldier_2",
    userName: "רוני אלוני",
    unit: IDF_UNITS[1],
    status: "home",
    location: "בית - כפר סבא",
    timestamp: "2026-06-08T08:05:30Z",
    note: "זכאי אפטר מאושר ע״י מ״פ",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-08T08:15:30Z"
  },
  {
    reportId: "rep_h3",
    userId: "sim_soldier_3",
    userName: "נדב לוי",
    unit: IDF_UNITS[2],
    status: "sick",
    location: "ביקור רופא - מרפאה אזורית",
    timestamp: "2026-06-08T09:12:00Z",
    note: "קיבלתי 2 גימלים עד מחר",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-08T09:30:00Z"
  },

  // Yesterday (June 9)
  {
    reportId: "rep_y1",
    userId: "sim_soldier_1",
    userName: "יוסי כהן",
    unit: IDF_UNITS[0],
    status: "base",
    location: "מחנה עופר",
    timestamp: "2026-06-09T07:15:00Z",
    note: "נוכח בבסיס",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-09T08:00:00Z"
  },
  {
    reportId: "rep_y2",
    userId: "sim_soldier_2",
    userName: "רוני אלוני",
    unit: IDF_UNITS[1],
    status: "base",
    location: "מחנה עופר",
    timestamp: "2026-06-09T07:44:20Z",
    note: "חזרה מהאפטר בזמן",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-09T08:00:00Z"
  },
  {
    reportId: "rep_y3",
    userId: "sim_soldier_3",
    userName: "נדב לוי",
    unit: IDF_UNITS[2],
    status: "sick",
    location: "בית - ירושלים",
    timestamp: "2026-06-09T08:10:00Z",
    note: "יום שני לגימלים בבית",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-09T08:30:00Z"
  },
  {
    reportId: "rep_y4",
    userId: "sim_soldier_4",
    userName: "אלון שרון",
    unit: IDF_UNITS[5],
    status: "course",
    location: "בה״ד 7 - קריית ההדרכה",
    timestamp: "2026-06-09T07:55:00Z",
    note: "קורס קשרים מתקדם",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-09T08:05:00Z"
  },
  {
    reportId: "rep_y5",
    userId: "sim_soldier_5",
    userName: "מיכל רז",
    unit: IDF_UNITS[6],
    status: "base",
    location: "מרפאת הגדוד",
    timestamp: "2026-06-09T07:05:00Z",
    note: "כוננות מרפאה",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-09T08:00:00Z"
  },
  {
    reportId: "rep_y6",
    userId: "sim_soldier_6",
    userName: "שני אהרוני",
    unit: IDF_UNITS[7],
    status: "field",
    location: "שטח - אשכולות, אימון פלוגתי",
    timestamp: "2026-06-09T06:12:00Z",
    note: "פריסה בשטח",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-09T08:00:00Z"
  },

  // Today (June 10) - Some are reporting, some haven't reported yet
  {
    reportId: "rep_t1",
    userId: "sim_soldier_1",
    userName: "יוסי כהן",
    unit: IDF_UNITS[0],
    status: "base",
    location: "מחנה עופר",
    timestamp: "2026-06-10T07:08:44Z",
    note: "נוכח גדוד",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-10T08:00:00Z"
  },
  {
    reportId: "rep_t2",
    userId: "sim_soldier_2",
    userName: "רוני אלוני",
    unit: IDF_UNITS[1],
    status: "field",
    location: "שטח אש 102",
    timestamp: "2026-06-10T06:30:10Z",
    note: "יצאנו למארב בוקר",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-10T08:02:00Z"
  },
  {
    reportId: "rep_t3",
    userId: "sim_soldier_3",
    userName: "נדב לוי",
    unit: IDF_UNITS[2],
    status: "base",
    location: "מחנה עופר",
    timestamp: "2026-06-10T07:44:00Z",
    note: "חזרתי מהגימלים, מרגיש מצוין",
    verifiedBy: undefined,
    verifiedAt: undefined
  },
  {
    reportId: "rep_t5",
    userId: "sim_soldier_5",
    userName: "מיכל רז",
    unit: IDF_UNITS[6],
    status: "base",
    location: "מרפאת הגדוד",
    timestamp: "2026-06-10T07:12:30Z",
    note: "נוכחת",
    verifiedBy: "sim_commander_1",
    verifiedAt: "2026-06-10T08:00:00Z"
  }
];

const DEFAULT_SIMULATED_NOTIFICATIONS: AppNotification[] = [
  {
    notificationId: "not_1",
    reportId: "rep_t2",
    userId: "sim_soldier_2",
    soldierName: "רוני אלוני",
    unit: IDF_UNITS[1],
    status: "field",
    location: "שטח אש 102",
    timestamp: "2026-06-10T06:30:10Z",
    isRead: false,
    message: "החייל רוני אלוני דיווח על סטטוס פעילות שטח / אימון מחוץ לבסיס במיקום: שטח אש 102"
  },
  {
    notificationId: "not_2",
    reportId: "rep_h2",
    userId: "sim_soldier_2",
    soldierName: "רוני אלוני",
    unit: IDF_UNITS[1],
    status: "home",
    location: "בית - כפר סבא",
    timestamp: "2026-06-08T08:05:30Z",
    isRead: true,
    message: "החייל רוני אלוני דיווח על סטטוס בבית / אפטר מחוץ לבסיס במיקום: בית - כפר סבא"
  }
];

// Helper to seed localStorage
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

export const dataService = {
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
    // 1. Search in local simulation database profiles first
    const profiles: UserProfile[] = JSON.parse(localStorage.getItem("idf_profiles") || "[]");
    const foundLocal = profiles.find(p => p.personalId === cleanId);
    if (foundLocal) {
      return foundLocal;
    }

    // 2. Search in Firebase Firestore profiles if Firebase is active
    if (isFirebaseActive() && db) {
      const path = "users (query by personalId)";
      try {
        const q = query(collection(db, "users"), where("personalId", "==", cleanId));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const docSnap = querySnapshot.docs[0];
          return { userId: docSnap.id, ...docSnap.data() } as UserProfile;
        }
      } catch (error) {
        console.error("Error finding profile by personalId in firestore:", error);
      }
    }
    return null;
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
      reportId: "", // will be set correctly after document creation
      verifiedBy: reportData.verifiedBy || "SYSTEM_AUTO",
      verifiedAt: reportData.verifiedAt || new Date().toISOString()
    };
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
      const docRef = await addDoc(collection(db, "attendance"), reportPayload);
      // Update reportId after creation so it contains real Firestore doc ID
      await updateDoc(docRef, { reportId: docRef.id });

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
        const notRef = await addDoc(collection(db, "notifications"), notPayload);
        await updateDoc(notRef, { notificationId: notRef.id });
      }

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return "";
    }
  },

  async updateAttendanceReport(reportId: string, reportData: Partial<AttendanceReport>): Promise<void> {
    console.log("Updating report:", reportId, reportData);
    
    // Log the change
    const updateLog = {
      reportId,
      oldData: {}, // Simplified: I won't fetch old data now to keep it lean. I will just log the change.
      newData: reportData,
      updatedAt: new Date().toISOString(),
      updatedBy: auth?.currentUser?.uid || "unknown"
    };

    if (!isFirebaseActive()) {
      const reports: AttendanceReport[] = JSON.parse(localStorage.getItem("idf_reports") || "[]");
      const index = reports.findIndex(r => r.reportId === reportId);
      if (index > -1) {
        reports[index] = { ...reports[index], ...reportData };
        localStorage.setItem("idf_reports", JSON.stringify(reports));
        
        // Log in localStorage
        const logs: any[] = JSON.parse(localStorage.getItem("idf_attendance_logs") || "[]");
        logs.unshift(updateLog);
        localStorage.setItem("idf_attendance_logs", JSON.stringify(logs));
      }
      return;
    }

    const path = `attendance/${reportId}`;
    console.log("Updating Firestore report:", path, reportData);
    try {
      await updateDoc(doc(db, "attendance", reportId), reportData);
      
      // Log in Firestore
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
};
