import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Database,
  DatabaseBackup,
  ClipboardList,
  FileSpreadsheet,
  ListChecks,
  Settings,
  CalendarCog,
  CalendarClock,
  UserRoundPlus,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  ArrowUp,
  ArrowDown,
  Save,
  ShieldPlus,
} from "lucide-react";
import { AttendanceStatusConfig, ExternalStaffMember, GoogleSheetsConfig, MedicalRoleConfig, ShiftSlotConfig, SystemRole, SystemSettingsConfig, UnitConfig, UserProfile } from "../types";
import UsersManager from "./systemAdmin/UsersManager";
import PermissionsManager from "./systemAdmin/PermissionsManager";
import AttendanceStatusManager from "./systemAdmin/AttendanceStatusManager";
import UnitsManager from "./systemAdmin/UnitsManager";
import MedicalRolesManager from "./systemAdmin/MedicalRolesManager";
import GoogleSheetsManager from "./systemAdmin/GoogleSheetsManager";
import AuditManager from "./systemAdmin/AuditManager";
import SystemSettingsManager from "./systemAdmin/SystemSettingsManager";
import BackupsManager from "./systemAdmin/BackupsManager";
import ShiftRolesManager from "./systemAdmin/ShiftRolesManager";
import ExternalStaffManager from "./systemAdmin/ExternalStaffManager";
import ShiftTypesManager from "./systemAdmin/ShiftTypesManager";
import SystemRolesManager from "./systemAdmin/SystemRolesManager";
import { dataService } from "../services/dataService";

type AdminSection =
  | "overview"
  | "users"
  | "permissions"
  | "statuses"
  | "roles"
  | "units"
  | "sheets"
  | "audit"
  | "settings"
  | "backups"
  | "shift_roles"
  | "external_staff"
  | "shift_types"
  | "system_roles";

interface SystemAdminPanelProps {
  currentUser: UserProfile;
  users: UserProfile[];
  onUpdateSystemRole: (
    userId: string,
    systemRole: SystemRole,
    accessLevel?: import("../types").SystemRoleAccessLevel
  ) => Promise<void>;
  onAttendanceStatusesChanged?: (
    statuses: AttendanceStatusConfig[]
  ) => void;
  unitConfigs: UnitConfig[];
  onUnitConfigsChanged: (units: UnitConfig[]) => void;
  medicalRoleConfigs: MedicalRoleConfig[];
  onMedicalRoleConfigsChanged: (roles: MedicalRoleConfig[]) => void;
  googleSheetsConfig: GoogleSheetsConfig | null;
  onGoogleSheetsConfigChanged: (config: GoogleSheetsConfig) => void;
  systemSettings: SystemSettingsConfig | null;
  onSystemSettingsChanged: (settings: SystemSettingsConfig) => void;
  shiftSlotConfigs: ShiftSlotConfig[];
  onShiftSlotConfigsChanged: (configs: ShiftSlotConfig[]) => void;
  externalStaff: ExternalStaffMember[];
  onExternalStaffChanged: (items: ExternalStaffMember[]) => void;
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
    id: "system_roles",
    title: "תפקידי ניהול",
    description: "יצירה ועריכה של תפקידי מערכת חדשים בלי לפגוע בתפקידים הקיימים.",
    icon: ShieldPlus,
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
    id: "audit",
    title: "Audit — יומן ביקורת",
    description: "מעקב אחר שינויים במשתמשים, הרשאות, הגדרות וסנכרונים.",
    icon: ClipboardList,
  },
  {
    id: "backups",
    title: "גיבויים ושחזור",
    description: "יצירת גיבוי JSON ושחזור מבוקר של נתוני המערכת.",
    icon: DatabaseBackup,
  },
  {
    id: "shift_roles",
    title: "ניהול תפקידי משמרת",
    description: "הגדרת תקנים, חובה/רשות ותפקידים מותרים לכל שיבוץ.",
    icon: CalendarCog,
  },
  {
    id: "external_staff",
    title: "אנשי צוות חיצוניים",
    description: "ניהול נהגים ואנשי צוות שאינם משתמשים רשומים באתר.",
    icon: UserRoundPlus,
  },
  {
    id: "shift_types",
    title: "שמות וסוגי משמרות",
    description: "ניהול שמות משמרות ושעות ברירת מחדל לבחירה מהירה.",
    icon: CalendarClock,
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
  onAttendanceStatusesChanged,
  unitConfigs,
  onUnitConfigsChanged,
  medicalRoleConfigs,
  onMedicalRoleConfigsChanged,
  googleSheetsConfig,
  onGoogleSheetsConfigChanged,
  systemSettings,
  onSystemSettingsChanged,
  shiftSlotConfigs,
  onShiftSlotConfigsChanged,
  externalStaff,
  onExternalStaffChanged,
}: SystemAdminPanelProps) {
  const [activeSection, setActiveSection] =
    useState<AdminSection>("overview");
  const [tabOrder, setTabOrder] = useState<string[]>(
    systemSettings?.adminTabOrder?.length
      ? systemSettings.adminTabOrder
      : sections.map((section) => section.id)
  );
  const [savingOrder, setSavingOrder] = useState(false);

  const orderedSections = useMemo(() => {
    const orderMap = new Map(tabOrder.map((id, index) => [id, index]));
    return [...sections].sort(
      (a, b) =>
        (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [tabOrder]);

  const moveSection = (id: string, direction: -1 | 1) => {
    setTabOrder((current) => {
      const normalized = [
        ...current.filter((item) => sections.some((section) => section.id === item)),
        ...sections.map((section) => section.id).filter((item) => !current.includes(item)),
      ];
      const index = normalized.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= normalized.length) return normalized;
      const next = [...normalized];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveTabOrder = async () => {
    if (!systemSettings) return;
    setSavingOrder(true);
    try {
      const saved = await dataService.saveSystemSettings(
        { ...systemSettings, adminTabOrder: tabOrder },
        currentUser.userId
      );
      onSystemSettingsChanged(saved);
    } finally {
      setSavingOrder(false);
    }
  };

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
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold text-slate-500">
              השתמש בחצים בכל כרטיס כדי לקבוע את סדר הטאבים לפי אופן העבודה.
            </div>
            <button
              type="button"
              onClick={saveTabOrder}
              disabled={savingOrder || !systemSettings}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingOrder ? "שומר..." : "שמור סדר"}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedSections.map((section, index) => {
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
                  <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, -1)}
                      disabled={index === 0}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      title="הזז למעלה"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={index === orderedSections.length - 1}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      title="הזז למטה"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
        </div>
      ) : activeSection === "users" ? (
        <UsersManager
          currentUser={currentUser}
          users={users}
          onUpdateSystemRole={onUpdateSystemRole}
        />
      ) : activeSection === "system_roles" ? (
        <SystemRolesManager currentUser={currentUser} />
      ) : activeSection === "permissions" ? (
        <PermissionsManager currentUser={currentUser} />
      ) : activeSection === "statuses" ? (
        <AttendanceStatusManager
          currentUser={currentUser}
          onStatusesChanged={onAttendanceStatusesChanged}
        />
      ) : activeSection === "roles" ? (
        <MedicalRolesManager
          currentUser={currentUser}
          roles={medicalRoleConfigs}
          onRolesChanged={onMedicalRoleConfigsChanged}
        />
      ) : activeSection === "units" ? (
        <UnitsManager
          currentUser={currentUser}
          units={unitConfigs}
          onUnitsChanged={onUnitConfigsChanged}
        />
      ) : activeSection === "sheets" ? (
        <GoogleSheetsManager
          currentUser={currentUser}
          config={googleSheetsConfig}
          onConfigChanged={onGoogleSheetsConfigChanged}
        />
      ) : activeSection === "audit" ? (
        <AuditManager />
      ) : activeSection === "backups" ? (
        <BackupsManager
          currentUser={currentUser}
          systemVersion={systemSettings?.systemVersion}
          onRestoreCompleted={() => window.location.reload()}
        />
      ) : activeSection === "shift_roles" ? (
        <ShiftRolesManager
          currentUser={currentUser}
          medicalRoles={medicalRoleConfigs}
          externalStaff={externalStaff}
          configs={shiftSlotConfigs}
          onConfigsChanged={onShiftSlotConfigsChanged}
        />
      ) : activeSection === "external_staff" ? (
        <ExternalStaffManager
          currentUser={currentUser}
          items={externalStaff}
          onItemsChanged={onExternalStaffChanged}
        />
      ) : activeSection === "shift_types" ? (
        <ShiftTypesManager currentUser={currentUser} />
      ) : activeSection === "settings" ? (
        <SystemSettingsManager
          currentUser={currentUser}
          settings={systemSettings}
          onSettingsChanged={onSystemSettingsChanged}
        />
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
