export type UserRole = "soldier" | "commander" | "adjutant_officer";

export interface UserProfile {
  userId: string;
  fullName: string;
  role: UserRole;
  unit: string;
  email: string;
  createdAt: string;
  personalId?: string; // Military ID (מספר אישי) or National ID (ת.ז)
  phoneNumber?: string; // Phone number (מספר טלפון)
  isDischarged?: boolean; // Discharged soldier status (חייל נגרע)
  className?: string; // Optional presentation styling
  medicalRole?: string; // Custom medical role (doctor, medic, paramedic, etc)
}

export type AttendanceStatus = "base" | "home" | "field" | "sick" | "course" | "other"| "cut_order" | "not_on_order";

export interface AttendanceReport {
  reportId: string;
  userId: string;
  userName: string;
  unit: string;
  status: AttendanceStatus;
  location: string;
  latitude?: number;
  longitude?: number;
  timestamp: string; // ISO String / server timestamp representation
  note?: string;
  verifiedBy?: string; // commander UID who acknowledged
  verifiedAt?: string;
  dayMarker?: "return_to_base" | "exit_home" | "after_hours";
afterHours?: number;
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
  isRead: boolean;
  message: string;
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, { label: string; color: string; bg: string; border: string }> = {
  base: { label: "בבסיס", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800/60" },
  home: { label: "בבית / אפטר", color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-200 dark:border-indigo-800/60" },
  field: { label: "פעילות שטח / אימון", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800/60" },
  sick: { label: "גימלים / חולים", color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-200 dark:border-rose-800/60" },
  course: { label: "קורס / הכשרה", color: "text-cyan-700 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800/60" },
  cut_order: {
  label: "חיתוך צו",
  color: "text-red-700",
  bg: "bg-red-50",
  border: "border-red-200"
},
  not_on_order: {
  label: "לא בצו",
  color: "text-orange-700",
  bg: "bg-orange-50",
  border: "border-orange-200",
},
  other: { label: "אחר (ראה הערה)", color: "text-slate-600 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-950/40", border: "border-slate-200 dark:border-slate-800/60" },
};

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
