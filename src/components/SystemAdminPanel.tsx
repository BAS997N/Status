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
  ShieldPlus,
  Smartphone,
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
import AppStatusManager from "./systemAdmin/AppStatusManager";
import { hasPermission, PermissionMap } from "../security/permissions";

type AdminSection =
  | "overview"
  | "users"
  | "app_status"
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

type AdminGroupId =
  | "users_access"
  | "attendance_people"
  | "shifts"
  | "connections"
  | "maintenance";

interface SystemAdminPanelProps {
  currentUser: UserProfile;
  permissions?: PermissionMap;
  users: UserProfile[];
  onUpdateSystemRole: (
    userId: string,
    systemRole: SystemRole,
    accessLevel?: import("../types").SystemRoleAccessLevel
  ) => Promise<void>;
  onUserCredentialsUpdated?: (userId: string, personalId: string) => void;
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
    id: "app_status",
    title: "התקנת אפליקציה והתראות",
    description: "מעקב אחר פתיחה מהאפליקציה, התראות פעילות ומספר מכשירים.",
    icon: Smartphone,
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

const adminGroups: Array<{
  id: AdminGroupId;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  sections: AdminSection[];
  overviewLabels?: string[];
}> = [
  {
    id: "users_access",
    title: "משתמשים והרשאות",
    description: "משתמשים, תפקידי ניהול, הרשאות והתקנת האפליקציה.",
    icon: Users,
    sections: ["users", "system_roles", "permissions", "app_status"],
  },
  {
    id: "attendance_people",
    title: "נוכחות וכוח אדם",
    description: "סטטוסי נוכחות, יחידות, שיוכים ותפקידי רפואה.",
    icon: BadgeCheck,
    sections: ["statuses", "units", "roles"],
  },
  {
    id: "shifts",
    title: "ניהול משמרות",
    description: "סוגי משמרות, תקנים ואנשי צוות חיצוניים.",
    icon: CalendarCog,
    sections: ["shift_types", "shift_roles", "external_staff"],
  },
  {
    id: "connections",
    title: "חיבורים והגדרות",
    description:
      "הגדרות כלליות והתראות, מצבי עבודה, ניהול צווים, קבוצות WhatsApp וחיבור Google Sheets.",
    icon: Settings,
    sections: ["settings", "sheets"],
    overviewLabels: [
      "הגדרות כלליות",
      "מצבי מערכת",
      "ניהול צווים",
      "קבוצות WhatsApp",
      "Google Sheets",
    ],
  },
  {
    id: "maintenance",
    title: "מערכת ותחזוקה",
    description: "יומן ביקורת, גיבויים ושחזור המערכת.",
    icon: DatabaseBackup,
    sections: ["audit", "backups"],
  },
];

export default function SystemAdminPanel({
  currentUser,
  permissions = {},
  users,
  onUpdateSystemRole,
  onUserCredentialsUpdated,
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
  const [activeGroup, setActiveGroup] = useState<AdminGroupId | null>(null);

  const sectionPermission: Record<AdminSection, string> = {
    overview: "system_admin.view",
    users: "system_admin.users.manage",
    app_status: "system_admin.users.manage",
    system_roles: "system_admin.roles.manage",
    permissions: "system_admin.permissions.manage",
    statuses: "system_admin.statuses.manage",
    roles: "system_admin.units.manage",
    units: "system_admin.units.manage",
    sheets: "system_admin.sheets.manage",
    audit: "system_admin.audit.view",
    settings: "system_admin.settings.manage",
    backups: "system_admin.backups.manage",
    shift_roles: "system_admin.shift_roles.manage",
    external_staff: "system_admin.external_staff.manage",
    shift_types: "system_admin.shift_types.manage",
  };

  const visibleSections = useMemo(
    () =>
      sections.filter((section) =>
        hasPermission(permissions, sectionPermission[section.id])
      ),
    [permissions]
  );

  const visibleGroups = useMemo(
    () =>
      adminGroups
        .map((group) => ({
          ...group,
          visibleSections: group.sections
            .map((sectionId) =>
              visibleSections.find((section) => section.id === sectionId)
            )
            .filter((section): section is (typeof sections)[number] => Boolean(section)),
        }))
        .filter((group) => group.visibleSections.length > 0),
    [visibleSections]
  );

  const activeGroupSections = useMemo(
    () =>
      visibleGroups.find((group) => group.id === activeGroup)?.visibleSections ||
      [],
    [activeGroup, visibleGroups]
  );

  const openGroup = (groupId: AdminGroupId) => {
    const group = visibleGroups.find((item) => item.id === groupId);
    if (!group?.visibleSections.length) return;
    setActiveGroup(groupId);
    setActiveSection(group.visibleSections[0].id);
  };

  const returnToOverview = () => {
    setActiveGroup(null);
    setActiveSection("overview");
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
                מוצגים רק אזורי הניהול שהוגדרו לתפקיד שלך. מחובר: {currentUser.fullName}
              </p>
            </div>
          </div>

          {activeSection !== "overview" && (
            <button
              type="button"
              onClick={returnToOverview}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
            >
              חזרה למסך הראשי
            </button>
          )}
        </div>
      </div>

      {activeSection === "overview" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => openGroup(group.id)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-rose-50 group-hover:text-rose-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-base font-black text-slate-800">
                  {group.title}
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {group.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(
                    group.overviewLabels ||
                    group.visibleSections.map((section) => section.title)
                  ).map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {activeGroupSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${
                    activeSection === section.id
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {section.title}
                </button>
              );
            })}
          </nav>

          {activeSection === "users" ? (
        <UsersManager
          currentUser={currentUser}
          users={users}
          onUpdateSystemRole={onUpdateSystemRole}
          onCredentialsUpdated={onUserCredentialsUpdated}
        />
      ) : activeSection === "app_status" ? (
        <AppStatusManager users={users} />
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
          users={users}
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
          users={users}
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
        </div>
      )}
    </section>
  );
}
