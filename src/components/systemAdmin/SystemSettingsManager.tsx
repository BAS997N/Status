import { useEffect, useState } from "react";
import {
  Bell,
  Clock3,
  Database,
  MonitorCog,
  Save,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { SystemSettingsConfig, UserProfile } from "../../types";
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
  attendanceReportingEnabled: true,
  attendanceReportingDisabledMessage:
    "האתר אינו מקבל דיווחי נוכחות כעת מאחר שהגדוד אינו מגויס.",
};

export default function SystemSettingsManager({
  currentUser,
  settings,
  onSettingsChanged,
}: SystemSettingsManagerProps) {
  const [draft, setDraft] = useState<SystemSettingsConfig>(
    settings || DEFAULT_SETTINGS
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const update = <K extends keyof SystemSettingsConfig>(
    key: K,
    value: SystemSettingsConfig[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
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
          <div className="rounded-xl border border-amber-200 bg-white p-4">
            <Toggle
              label="מצב תחזוקה מלא"
              description="חוסם את המערכת לכל המשתמשים, למעט מנהל האתר, ומציג את הודעת התחזוקה."
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
          </div>

          <div className="rounded-xl border border-sky-200 bg-white p-4">
            <Toggle
              label="קבלת דיווחי נוכחות"
              description="כאשר האפשרות כבויה, רק עמוד הדיווח האישי מוחלף בהודעה. לוח הבקרה ושאר המערכת ממשיכים לפעול."
              checked={draft.attendanceReportingEnabled}
              onChange={(value) => update("attendanceReportingEnabled", value)}
            />
            <div className="mt-4">
              <Field label="הודעה כאשר הדיווחים סגורים">
                <textarea
                  rows={3}
                  value={draft.attendanceReportingDisabledMessage}
                  onChange={(e) =>
                    update("attendanceReportingDisabledMessage", e.target.value)
                  }
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}</label>;
}

function Toggle({ label, description, checked, disabled = false, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={`flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}><div><div className="text-xs font-black text-slate-800">{label}</div>{description && <div className="mt-1 text-[10px] text-slate-500">{description}</div>}</div><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-violet-600" /></label>;
}
