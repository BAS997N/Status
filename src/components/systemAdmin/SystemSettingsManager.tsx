import { useEffect, useState } from "react";
import {
  Bell,
  Clock3,
  Database,
  MonitorCog,
  Save,
  Settings,
  ShieldAlert,
  MessageCircle,
  Plus,
  Trash2,
  Star,
} from "lucide-react";
import {
  SystemMode,
  SystemRole,
  SystemSettingsConfig,
  UserProfile,
  WhatsAppGroupConfig,
} from "../../types";
import { dataService } from "../../services/dataService";

interface SystemSettingsManagerProps {
  currentUser: UserProfile;
  settings: SystemSettingsConfig | null;
  onSettingsChanged: (settings: SystemSettingsConfig) => void;
}

const DEFAULT_SETTINGS: SystemSettingsConfig = {
  systemName: "מערכת נוכחות חיילים",
  unitName: "תאג״ד 997",
  footerText: "Created by AviElias",
  systemVersion: "1.0.0",
  timeZone: "Asia/Jerusalem",
  defaultStartScreen: "dashboard",
  notificationsEnabled: true,
  toastNotificationsEnabled: true,
  notificationSoundEnabled: false,
  cacheMinutes: 30,
  autoRefreshSeconds: 60,
  maintenanceMode: false,
  maintenanceMessage: "המערכת נמצאת כרגע בתחזוקה. נסו שוב מאוחר יותר.",
  maintenanceAllowedRoles: ["super_admin", "admin"],
  reportingEnabled: true,
  reportingClosedMessage: "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס.",
  reportingClosedAllowedRoles: ["super_admin", "admin"],
  shiftsEnabled: true,
  shiftsClosedMessage: "מסך המשמרות אינו זמין כעת. יש להתעדכן מול המפקד.",
  systemMode: "routine",
  operationalMessage: "המערכת פועלת במצב מבצעי.",
  emergencyEvent: {
    active: false,
    eventId: "",
    title: "מצב חירום",
    message: "",
    assemblyLocation: "",
    assemblyTime: "",
  },
  whatsappGroups: [],
  adminTabOrder: [],
  mainTabOrder: [],
};

const SYSTEM_ROLE_OPTIONS: Array<{
  value: SystemRole;
  label: string;
  description: string;
}> = [
  {
    value: "super_admin",
    label: "מנהל אתר",
    description: "גישה מלאה לניהול המערכת.",
  },
  {
    value: "admin",
    label: "מפקד",
    description: "ניהול שוטף ולוח בקרה.",
  },
  {
    value: "viewer",
    label: "שליש",
    description: "צפייה בנתונים בהתאם להרשאות.",
  },
  {
    value: "reporter",
    label: "חייל",
    description: "גישה למסך הדיווח האישי.",
  },
];

export default function SystemSettingsManager({
  currentUser,
  settings,
  onSettingsChanged,
}: SystemSettingsManagerProps) {
  const [draft, setDraft] = useState<SystemSettingsConfig>(
    settings || DEFAULT_SETTINGS
  );
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (settings && !isDirty && !saving) {
      setDraft(settings);
    }
  }, [settings, isDirty, saving]);

  const update = <K extends keyof SystemSettingsConfig>(
    key: K,
    value: SystemSettingsConfig[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
    setMessage(null);
  };

  const toggleAllowedRole = (
    key: "maintenanceAllowedRoles" | "reportingClosedAllowedRoles",
    role: SystemRole,
    checked: boolean
  ) => {
    setDraft((current) => {
      const currentRoles = current[key] || [];
      const nextRoles = checked
        ? Array.from(new Set([...currentRoles, role]))
        : currentRoles.filter((item) => item !== role);

      return {
        ...current,
        [key]: nextRoles,
      };
    });
    setIsDirty(true);
    setMessage(null);
  };

  const updateEmergency = (
    key: keyof SystemSettingsConfig["emergencyEvent"],
    value: string | boolean
  ) => {
    setDraft((current) => ({
      ...current,
      emergencyEvent: {
        ...current.emergencyEvent,
        [key]: value,
      },
    }));
    setIsDirty(true);
    setMessage(null);
  };

  const setSystemMode = (mode: SystemMode) => {
    setDraft((current) => ({
      ...current,
      systemMode: mode,
      emergencyEvent:
        mode === "emergency"
          ? {
              ...current.emergencyEvent,
              active: true,
              eventId:
                current.emergencyEvent.eventId ||
                `emergency_${Date.now()}`,
              activatedAt: new Date().toISOString(),
              activatedBy: currentUser.userId,
              activatedByName: currentUser.fullName,
            }
          : {
              ...current.emergencyEvent,
              active: false,
            },
    }));
    setIsDirty(true);
    setMessage(null);
  };

  const createWhatsAppGroupId = () =>
    `whatsapp_group_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  const updateWhatsAppGroups = (groups: WhatsAppGroupConfig[]) => {
    update(
      "whatsappGroups",
      groups.map((group, index) => ({
        ...group,
        sortOrder: index + 1,
      }))
    );
  };

  const addWhatsAppGroup = () => {
    const currentGroups = draft.whatsappGroups || [];

    updateWhatsAppGroups([
      ...currentGroups,
      {
        id: createWhatsAppGroupId(),
        name: `קבוצה ${currentGroups.length + 1}`,
        link: "",
        enabled: true,
        isDefault: currentGroups.length === 0,
        sortOrder: currentGroups.length + 1,
      },
    ]);
  };

  const updateWhatsAppGroup = (
    groupId: string,
    changes: Partial<WhatsAppGroupConfig>
  ) => {
    const currentGroups = draft.whatsappGroups || [];

    updateWhatsAppGroups(
      currentGroups.map((group) => {
        if (group.id !== groupId) {
          return changes.isDefault ? { ...group, isDefault: false } : group;
        }

        return { ...group, ...changes };
      })
    );
  };

  const removeWhatsAppGroup = (groupId: string) => {
    const currentGroups = draft.whatsappGroups || [];
    const remaining = currentGroups.filter((group) => group.id !== groupId);

    if (remaining.length > 0 && !remaining.some((group) => group.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    updateWhatsAppGroups(remaining);
  };

  const handleSave = async () => {
    setMessage(null);
    if (!draft.systemName.trim() || !draft.unitName.trim()) {
      setMessage({ type: "error", text: "שם המערכת ושם היחידה הם שדות חובה." });
      return;
    }

    setSaving(true);
    try {
      const saved = await dataService.saveSystemSettings(
        draft,
        currentUser.userId
      );
      setDraft(saved);
      setIsDirty(false);
      onSettingsChanged(saved);
      setMessage({
        type: "success",
        text: "הגדרות המערכת נשמרו והוחלו בהצלחה.",
      });
    } catch (error) {
      console.error("Failed saving system settings:", error);
      setMessage({ type: "error", text: "שמירת הגדרות המערכת נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-l from-violet-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">הגדרות מערכת</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              ניהול זהות המערכת, התראות, רענון, Cache ומצב תחזוקה. כל שינוי נשמר ב־Audit.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <MonitorCog className="h-5 w-5 text-violet-600" />
          <h3 className="text-sm font-black text-slate-900">זהות ותצוגה</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="שם המערכת">
            <input value={draft.systemName} onChange={(e) => update("systemName", e.target.value)} className="input" />
          </Field>
          <Field label="שם היחידה / הגדוד">
            <input value={draft.unitName} onChange={(e) => update("unitName", e.target.value)} className="input" />
          </Field>
          <Field label="טקסט Footer">
            <input value={draft.footerText} onChange={(e) => update("footerText", e.target.value)} className="input" />
          </Field>
          <Field label="גרסת מערכת">
            <input value={draft.systemVersion} onChange={(e) => update("systemVersion", e.target.value)} className="input" dir="ltr" />
          </Field>
          <Field label="אזור זמן">
            <select value={draft.timeZone} onChange={(e) => update("timeZone", e.target.value)} className="input">
              <option value="Asia/Jerusalem">ישראל — Asia/Jerusalem</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">לונדון — Europe/London</option>
              <option value="America/New_York">ניו יורק — America/New_York</option>
            </select>
          </Field>
          <Field label="מסך פתיחה למפקדים">
            <select value={draft.defaultStartScreen} onChange={(e) => update("defaultStartScreen", e.target.value as "reporter" | "dashboard")} className="input">
              <option value="dashboard">לוח בקרה</option>
              <option value="reporter">דיווח נוכחות אישי</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-black text-slate-900">התראות</h3>
        </div>
        <div className="space-y-3">
          <Toggle label="הפעלת התראות במערכת" checked={draft.notificationsEnabled} onChange={(value) => update("notificationsEnabled", value)} />
          <Toggle label="הצגת הודעות Toast" checked={draft.toastNotificationsEnabled} disabled={!draft.notificationsEnabled} onChange={(value) => update("toastNotificationsEnabled", value)} />
          <Toggle label="צליל התראה" description="התשתית נשמרת כעת ותשמש את מנגנון הצלילים בהמשך." checked={draft.notificationSoundEnabled} disabled={!draft.notificationsEnabled} onChange={(value) => update("notificationSoundEnabled", value)} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-sky-600" />
          <h3 className="text-sm font-black text-slate-900">ביצועים ורענון</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="זמן Cache בדקות" hint="בין 1 ל־1,440 דקות">
            <input type="number" min={1} max={1440} value={draft.cacheMinutes} onChange={(e) => update("cacheMinutes", Number(e.target.value))} className="input" />
          </Field>
          <Field label="רענון אוטומטי בשניות" hint="בין 10 ל־3,600 שניות">
            <input type="number" min={10} max={3600} value={draft.autoRefreshSeconds} onChange={(e) => update("autoRefreshSeconds", Number(e.target.value))} className="input" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-700" />
          <h3 className="text-sm font-black text-slate-900">מצבי מערכת</h3>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-white p-4">
            <div className="text-xs font-black text-slate-900">מצב עבודה של המערכת</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { value: "routine", label: "שגרה", description: "עבודה רגילה" },
                { value: "operational", label: "מבצעי", description: "הדגשת נוכחות ומשמרות" },
                { value: "emergency", label: "חירום", description: "הפעלת מרכז חירום והקפצה" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSystemMode(option.value as SystemMode)}
                  className={`rounded-xl border p-3 text-right transition ${
                    draft.systemMode === option.value
                      ? option.value === "emergency"
                        ? "border-red-400 bg-red-50"
                        : option.value === "operational"
                        ? "border-orange-400 bg-orange-50"
                        : "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-black text-slate-900">{option.label}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{option.description}</div>
                </button>
              ))}
            </div>

            {draft.systemMode === "operational" && (
              <div className="mt-4">
                <Field label="הודעת מצב מבצעי">
                  <textarea
                    rows={2}
                    value={draft.operationalMessage}
                    onChange={(e) => update("operationalMessage", e.target.value)}
                    className="input resize-y"
                  />
                </Field>
              </div>
            )}

            {draft.systemMode === "emergency" && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="כותרת אירוע">
                  <input
                    value={draft.emergencyEvent.title}
                    onChange={(e) => updateEmergency("title", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="מיקום התייצבות">
                  <input
                    value={draft.emergencyEvent.assemblyLocation}
                    onChange={(e) => updateEmergency("assemblyLocation", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="שעת התייצבות">
                  <input
                    type="datetime-local"
                    value={draft.emergencyEvent.assemblyTime}
                    onChange={(e) => updateEmergency("assemblyTime", e.target.value)}
                    className="input"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="הודעת הקפצה">
                    <textarea
                      rows={4}
                      value={draft.emergencyEvent.message}
                      onChange={(e) => updateEmergency("message", e.target.value)}
                      className="input resize-y"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-200 bg-white p-4">
            <Toggle
              label="מצב תחזוקה מלא"
              description="חוסם את כל חלקי המערכת למשתמשים רגילים. מנהל האתר עדיין יכול להיכנס לניהול ולבטל את המצב."
              checked={draft.maintenanceMode}
              onChange={(value) => update("maintenanceMode", value)}
            />
            <div className="mt-4">
              <Field label="הודעת תחזוקה">
                <textarea
                  rows={3}
                  value={draft.maintenanceMessage}
                  onChange={(e) => update("maintenanceMessage", e.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>

            <RoleAccessGrid
              title="מי יכול להמשיך להשתמש באתר בזמן תחזוקה?"
              selectedRoles={draft.maintenanceAllowedRoles || []}
              onRoleChange={(role, checked) =>
                toggleAllowedRole("maintenanceAllowedRoles", role, checked)
              }
            />
          </div>

          <div className="rounded-xl border border-sky-200 bg-white p-4">
            <Toggle
              label="קבלת דיווחי נוכחות"
              description="כאשר האפשרות כבויה, רק עמוד הדיווח האישי מוחלף בהודעה. לוח הבקרה ושאר המערכת נשארים זמינים."
              checked={draft.reportingEnabled}
              onChange={(value) => update("reportingEnabled", value)}
            />
            <div className="mt-4">
              <Field label="הודעה כאשר הדיווחים סגורים">
                <textarea
                  rows={3}
                  value={draft.reportingClosedMessage}
                  onChange={(e) => update("reportingClosedMessage", e.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>

            <RoleAccessGrid
              title="מי יכול עדיין לראות ולהשתמש בעמוד הדיווח כשהדיווחים סגורים?"
              selectedRoles={draft.reportingClosedAllowedRoles || []}
              onRoleChange={(role, checked) =>
                toggleAllowedRole(
                  "reportingClosedAllowedRoles",
                  role,
                  checked
                )
              }
            />
          </div>

          <div className="rounded-xl border border-indigo-200 bg-white p-4">
            <Toggle
              label="מסך משמרות פעיל"
              description="כאשר האפשרות כבויה, לשונית המשמרות נשארת מוצגת אך תוכן המסך מוחלף בהודעה שהוגדרה."
              checked={draft.shiftsEnabled}
              onChange={(value) => update("shiftsEnabled", value)}
            />
            <div className="mt-4">
              <Field label="הודעה כאשר מסך המשמרות סגור">
                <textarea
                  rows={3}
                  value={draft.shiftsClosedMessage}
                  onChange={(e) => update("shiftsClosedMessage", e.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}

      <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                קבוצות WhatsApp
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                שמור שמות וקישורים לקבוצות. בעת שיתוף לוח משמרות ניתן
                לבחור קבוצה, לפתוח WhatsApp כללי או להעתיק את ההודעה.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={addWhatsAppGroup}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            הוסף קבוצה
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {(draft.whatsappGroups || []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs font-bold text-slate-400">
              לא הוגדרו קבוצות WhatsApp.
            </div>
          ) : (
            (draft.whatsappGroups || [])
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
                    <Field label="שם הקבוצה">
                      <input
                        value={group.name}
                        onChange={(event) =>
                          updateWhatsAppGroup(group.id, {
                            name: event.target.value,
                          })
                        }
                        className="input"
                        placeholder='לדוגמה: קבוצת תאג"ד'
                      />
                    </Field>

                    <Field label="קישור לקבוצה">
                      <input
                        value={group.link}
                        onChange={(event) =>
                          updateWhatsAppGroup(group.id, {
                            link: event.target.value,
                          })
                        }
                        className="input"
                        placeholder="https://chat.whatsapp.com/..."
                        dir="ltr"
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => removeWhatsAppGroup(group.id)}
                      className="flex h-10 items-center justify-center rounded-xl border border-rose-200 px-3 text-rose-700 hover:bg-rose-50"
                      title="מחיקת קבוצה"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={group.enabled}
                        onChange={(event) =>
                          updateWhatsAppGroup(group.id, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                      קבוצה פעילה
                    </label>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        name="default_whatsapp_group"
                        checked={group.isDefault}
                        onChange={() =>
                          updateWhatsAppGroup(group.id, {
                            isDefault: true,
                          })
                        }
                      />
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      קבוצת ברירת מחדל
                    </label>
                  </div>
                </div>
              ))
          )}
        </div>

        <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[10px] font-bold leading-5 text-amber-800">
          בדפדפן לא ניתן להזין טקסט ישירות לתוך קבוצה דרך קישור הזמנה.
          לכן בעת בחירת קבוצה ההודעה תועתק ללוח והקבוצה תיפתח; לאחר מכן
          מדביקים את ההודעה בשדה השליחה.
        </div>
      </section>

      {isDirty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          קיימים שינויים שטרם נשמרו. הרענון האוטומטי לא ידרוס אותם.
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "שומר..." : "שמור והחל הגדרות"}
        </button>
      </div>

      <style>{`.input{width:100%;border-radius:.75rem;border:1px solid rgb(226 232 240);background:white;padding:.7rem .85rem;font-size:.8rem;outline:none}.input:focus{border-color:rgb(139 92 246);box-shadow:0 0 0 2px rgb(237 233 254)}`}</style>
    </div>
  );
}

function RoleAccessGrid({
  title,
  selectedRoles,
  onRoleChange,
}: {
  title: string;
  selectedRoles: SystemRole[];
  onRoleChange: (role: SystemRole, checked: boolean) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-xs font-black text-slate-800">{title}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SYSTEM_ROLE_OPTIONS.map((option) => {
          const checked = selectedRoles.includes(option.value);

          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                checked
                  ? "border-violet-300 bg-violet-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onRoleChange(option.value, event.target.checked)
                }
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span>
                <span className="block text-xs font-black text-slate-800">
                  {option.label}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {selectedRoles.length === 0 && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
          אף תפקיד לא מורשה כרגע.
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}</label>;
}

function Toggle({ label, description, checked, disabled = false, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={`flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}><div><div className="text-xs font-black text-slate-800">{label}</div>{description && <div className="mt-1 text-[10px] text-slate-500">{description}</div>}</div><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-violet-600" /></label>;
}
