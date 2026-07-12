import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleOff,
  FileSpreadsheet,
  Loader2,
  Save,
  TestTube2,
  XCircle,
} from "lucide-react";
import { GoogleSheetsConfig, UserProfile } from "../../types";
import { dataService } from "../../services/dataService";

interface GoogleSheetsManagerProps {
  currentUser: UserProfile;
  config: GoogleSheetsConfig | null;
  onConfigChanged: (config: GoogleSheetsConfig) => void;
}

const EMPTY_CONFIG: GoogleSheetsConfig = {
  enabled: false,
  webAppUrl: "",
  spreadsheetName: "",
  lastTestStatus: "idle",
};

export default function GoogleSheetsManager({
  currentUser,
  config,
  onConfigChanged,
}: GoogleSheetsManagerProps) {
  const [draft, setDraft] = useState<GoogleSheetsConfig>(
    config || EMPTY_CONFIG
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const isValidWebAppUrl = (value: string) => {
    if (!value.trim()) return false;

    try {
      const url = new URL(value.trim());
      return (
        url.protocol === "https:" &&
        url.hostname === "script.google.com" &&
        url.pathname.includes("/macros/s/")
      );
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    setMessage(null);

    if (draft.enabled && !isValidWebAppUrl(draft.webAppUrl)) {
      setMessage({
        type: "error",
        text: "יש להזין כתובת תקינה של Google Apps Script Web App.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const saved = await dataService.saveGoogleSheetsConfig(
        {
          ...draft,
          webAppUrl: draft.webAppUrl.trim(),
          spreadsheetName: draft.spreadsheetName?.trim() || "",
        },
        currentUser.userId
      );

      setDraft(saved);
      onConfigChanged(saved);
      setMessage({ type: "success", text: "הגדרות Google Sheets נשמרו." });
    } catch (error) {
      console.error("Failed saving Google Sheets settings:", error);
      setMessage({ type: "error", text: "שמירת ההגדרות נכשלה." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setMessage(null);

    if (!isValidWebAppUrl(draft.webAppUrl)) {
      setMessage({
        type: "error",
        text: "יש להזין כתובת תקינה לפני בדיקת החיבור.",
      });
      return;
    }

    setIsTesting(true);

    try {
      const result = await dataService.testGoogleSheetsConnection(draft);
      const testedConfig: GoogleSheetsConfig = {
        ...draft,
        lastTestAt: result.testedAt,
        lastTestStatus: result.success ? "success" : "error",
        lastTestMessage: result.message,
      };

      setDraft(testedConfig);

      const saved = await dataService.saveGoogleSheetsConfig(
        testedConfig,
        currentUser.userId
      );
      onConfigChanged(saved);

      setMessage({
        type: result.success ? "success" : "error",
        text: result.message,
      });
    } catch (error) {
      console.error("Google Sheets connection test failed:", error);
      setMessage({ type: "error", text: "בדיקת החיבור נכשלה." });
    } finally {
      setIsTesting(false);
    }
  };

  const formattedLastTest = draft.lastTestAt
    ? new Date(draft.lastTestAt).toLocaleString("he-IL")
    : "טרם בוצעה בדיקה";

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                ניהול Google Sheets
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                כאן מגדירים את כתובת ה־Web App שמקבלת את דיווחי הנוכחות.
                לאחר השמירה המערכת תשתמש בהגדרה זו במקום בכתובת קשיחה בקוד.
              </p>
            </div>
          </div>

          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${
              draft.enabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-500"
            }`}
          >
            {draft.enabled ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <CircleOff className="h-4 w-4" />
            )}
            {draft.enabled ? "הסנכרון פעיל" : "הסנכרון כבוי"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="text-sm font-black text-slate-800">
                הפעלת ייצוא ל־Google Sheets
              </div>
              <div className="mt-1 text-xs text-slate-500">
                כאשר האפשרות כבויה, דיווחים חדשים ועריכות לא יישלחו ל־Sheets.
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
              className="h-5 w-5 cursor-pointer accent-emerald-600"
            />
          </label>

          <div>
            <label className="mb-2 block text-xs font-black text-slate-700">
              כתובת Google Apps Script Web App
            </label>
            <input
              type="url"
              value={draft.webAppUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  webAppUrl: event.target.value,
                  lastTestStatus: "idle",
                }))
              }
              placeholder="https://script.google.com/macros/s/.../exec"
              dir="ltr"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              יש להשתמש בכתובת שמסתיימת ב־<span dir="ltr">/exec</span> מתוך
              פריסת ה־Web App של Google Apps Script.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-black text-slate-700">
              שם הגיליון או הקובץ
            </label>
            <input
              type="text"
              value={draft.spreadsheetName || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  spreadsheetName: event.target.value,
                }))
              }
              placeholder="לדוגמה: נוכחות תאג״ד 997"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-2 text-[11px] text-slate-400">
              בשלב זה השם משמש לזיהוי במסך הניהול ואינו משנה את קוד ה־Apps Script.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-slate-700">
                  בדיקת חיבור אחרונה
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formattedLastTest}
                </div>
                {draft.lastTestMessage && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {draft.lastTestMessage}
                  </div>
                )}
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
                  draft.lastTestStatus === "success"
                    ? "bg-emerald-100 text-emerald-700"
                    : draft.lastTestStatus === "error"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {draft.lastTestStatus === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : draft.lastTestStatus === "error" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <TestTube2 className="h-4 w-4" />
                )}
                {draft.lastTestStatus === "success"
                  ? "הבקשה נשלחה"
                  : draft.lastTestStatus === "error"
                  ? "הבדיקה נכשלה"
                  : "טרם נבדק"}
              </div>
            </div>
          </div>

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                message.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4" />
              )}
              בדוק חיבור
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isTesting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              שמור הגדרות
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
