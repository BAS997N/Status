import { useState } from "react";
import {
  BadgeCheck,
  Building2,
  Database,
  FileSpreadsheet,
  ListChecks,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { SystemRole, UserProfile } from "../types";
import UsersManager from "./systemAdmin/UsersManager";
import PermissionsManager from "./systemAdmin/PermissionsManager";
import AttendanceStatusManager from "./systemAdmin/AttendanceStatusManager";

type AdminSection =
  | "overview"
  | "users"
  | "permissions"
  | "statuses"
  | "roles"
  | "units"
  | "sheets"
  | "settings";

interface SystemAdminPanelProps {
  currentUser: UserProfile;
  users: UserProfile[];
  onUpdateSystemRole: (
    userId: string,
    systemRole: SystemRole
  ) => Promise<void>;
}

const sections: Array<{
  id: AdminSection;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    id: "users",
    title: "משתמשים ותפקידי מערכת",
    description: "שיוך משתמש לסופר־אדמין, אדמין, צפייה בלבד או דיווח בלבד.",
    icon: Users,
  },
  {
    id: "permissions",
    title: "הרשאות לפי תפקיד",
    description: "קביעה אילו מסכים ופעולות זמינים לכל סוג משתמש.",
    icon: ShieldCheck,
  },
  {
    id: "statuses",
    title: "סטטוסי נוכחות",
    description: "יצירה, הסתרה, סדר הצגה והרשאות לחיילים ולמפקדים.",
    icon: ListChecks,
  },
  {
    id: "roles",
    title: "תפקידי רפואה",
    description: "ניהול תפקידים וסדר ההצגה שלהם במערכת.",
    icon: BadgeCheck,
  },
  {
    id: "units",
    title: "יחידות ושיוכים",
    description: "ניהול תאג״ד, מסופחי תאג״ד ויחידות נוספות.",
    icon: Building2,
  },
  {
    id: "sheets",
    title: "Google Sheets",
    description: "ניהול ייצוא, טווחי תאריכים והגדרות הסנכרון.",
    icon: FileSpreadsheet,
  },
  {
    id: "settings",
    title: "הגדרות מערכת",
    description: "הגדרות כלליות, התראות, תצוגה ותחזוקה.",
    icon: Settings,
  },
];

export default function SystemAdminPanel({
  currentUser,
  users,
  onUpdateSystemRole,
}: SystemAdminPanelProps) {
  const [activeSection, setActiveSection] =
    useState<AdminSection>("overview");

  return (
    <section dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-l from-rose-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">
                ניהול מערכת
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-500">
                אזור זה זמין רק למנהל האתר. מחובר: {currentUser.fullName}
              </p>
            </div>
          </div>

          {activeSection !== "overview" && (
            <button
              type="button"
              onClick={() => setActiveSection("overview")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
            >
              חזרה למסך הראשי
            </button>
          )}
        </div>
      </div>

      {activeSection === "overview" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-rose-50 group-hover:text-rose-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <SlidersHorizontal className="h-4 w-4 text-slate-300" />
                </div>
                <h2 className="text-sm font-black text-slate-800">
                  {section.title}
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {section.description}
                </p>
              </button>
            );
          })}
        </div>
      ) : activeSection === "users" ? (
        <UsersManager
          currentUser={currentUser}
          users={users}
          onUpdateSystemRole={onUpdateSystemRole}
        />
      ) : activeSection === "permissions" ? (
        <PermissionsManager currentUser={currentUser} />
      ) : activeSection === "statuses" ? (
        <AttendanceStatusManager currentUser={currentUser} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-rose-600" />
            <div>
              <h2 className="text-base font-black text-slate-800">
                {sections.find((section) => section.id === activeSection)?.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                התשתית למסך זה מוכנה. בשלב הבא נחבר אותו ל־Firestore
                ונוסיף עריכה ושמירה מתוך האתר, בלי שינוי קוד.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
