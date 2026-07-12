import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleOff,
  Clock3,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  Save,
  Send,
  TestTube2,
  XCircle,
} from "lucide-react";
import {
  GoogleSheetsConfig,
  GoogleSheetsSyncResult,
  UserProfile,
} from "../../types";
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
  lastSyncStatus: "idle",
  syncHistory: [],
};

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultStartDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDuration = (durationMs?: number) => {
  if (!durationMs) return "—";
  if (durationMs < 1000) return `${durationMs} מילישניות`;
  return `${(durationMs / 1000).toFixed(1)} שניות`;
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStartDate, setSyncStartDate] = useState(getDefaultStartDate());
  const [syncEndDate, setSyncEndDate] = useState(getTodayLocalDate());
  const [lastRequestedRange, setLastRequestedRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
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

  const refreshConfig = async () => {
    const refreshed = await dataService.getGoogleSheetsConfig(true);
    setDraft(refreshed);
    onConfigChanged(refreshed);
    return refreshed;
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

      const saved = await dataService.saveGoogleSheetsConfig(
        testedConfig,
        currentUser.userId
      );
      setDraft(saved);
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

  const runSync = async (startDate: string, endDate: string) => {
    setMessage(null);

    if (!draft.enabled) {
      setMessage({
        type: "error",
        text: "יש להפעיל ולשמור את הסנכרון לפני שליחת דיווחים.",
      });
      return;
    }

    if (!isValidWebAppUrl(draft.webAppUrl)) {
      setMessage({
        type: "error",
        text: "כתובת ה־Web App אינה תקינה.",
      });
      return;
    }

    if (!startDate || !endDate) {
      setMessage({
        type: "error",
        text: "יש לבחור תאריך התחלה ותאריך סיום.",
      });
      return;
    }

    if (endDate < startDate) {
      setMessage({
        type: "error",
        text: "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה.",
      });
      return;
    }

    setIsSyncing(true);
    setLastRequestedRange({ startDate, endDate });

    try {
      const result: GoogleSheetsSyncResult =
        await dataService.syncAllReportsToGoogleSheets(startDate, endDate);

      await refreshConfig();

      if (result.status === "success") {
        setMessage({
          type: "success",
          text: `הסנכרון הסתיים בהצלחה. נשלחו ${result.sentCount} דיווחים.`,
        });
      } else if (result.status === "partial") {
        setMessage({
          type: "error",
          text: `הסנכרון הסתיים חלקית: ${result.sentCount} נשלחו ו־${result.failedCount} נכשלו.`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.errorMessage || "הסנכרון נכשל.",
        });
      }
    } catch (error) {
      console.error("Google Sheets manual sync failed:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "הסנכרון נכשל.",
      });
      await refreshConfig().catch(() => undefined);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = () => runSync(syncStartDate, syncEndDate);

  const handleRetry = () => {
    const range = lastRequestedRange || {
      startDate: draft.lastSyncStartDate || syncStartDate,
      endDate: draft.lastSyncEndDate || syncEndDate,
    };
    return runSync(range.startDate, range.endDate);
  };

  const formattedLastTest = draft.lastTestAt
    ? new Date(draft.lastTestAt).toLocaleString("he-IL")
    : "טרם בוצעה בדיקה";

  const formattedLastSync = draft.lastSyncAt
    ? new Date(draft.lastSyncAt).toLocaleString("he-IL")
    : "טרם בוצע סנכרון";

  const history = useMemo(() => draft.syncHistory || [], [draft.syncHistory]);

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
                ניהול החיבור, בדיקת תקינות וסנכרון דיווחי נוכחות לפי טווח תאריכים.
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
                כאשר האפשרות כבויה, דיווחים חדשים וסנכרונים ידניים לא יישלחו.
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

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || isSaving || isSyncing}
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
              disabled={isSaving || isTesting || isSyncing}
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Send className="h-5 w-5 text-emerald-600" />
          <h3 className="text-sm font-black text-slate-900">
            סנכרון ידני
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-xs font-black text-slate-700">
            מתאריך
            <input
              type="date"
              value={syncStartDate}
              onChange={(event) => setSyncStartDate(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
            />
          </label>

          <label className="text-xs font-black text-slate-700">
            עד תאריך
            <input
              type="date"
              value={syncEndDate}
              onChange={(event) => setSyncEndDate(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing || isSaving || isTesting || !draft.enabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSyncing ? "מסנכרן..." : "סנכרן עכשיו"}
          </button>

          {(draft.lastSyncStatus === "error" ||
            draft.lastSyncStatus === "partial") && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isSyncing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              ניסיון חוזר
            </button>
          )}
        </div>

        {isSyncing && (
          <div className="mt-4 overflow-hidden rounded-full bg-slate-100">
            <div className="h-2 w-full animate-pulse bg-emerald-500" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Clock3 className="mb-2 h-5 w-5 text-slate-500" />
          <div className="text-[11px] font-black text-slate-500">סנכרון אחרון</div>
          <div className="mt-1 text-xs font-bold text-slate-800">{formattedLastSync}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-[11px] font-black text-emerald-700">נשלחו</div>
          <div className="mt-1 text-2xl font-black text-emerald-800">
            {draft.lastSyncSentCount || 0}
          </div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-[11px] font-black text-rose-700">נכשלו</div>
          <div className="mt-1 text-2xl font-black text-rose-800">
            {draft.lastSyncFailedCount || 0}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-black text-slate-500">משך</div>
          <div className="mt-1 text-sm font-black text-slate-800">
            {formatDuration(draft.lastSyncDurationMs)}
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-600" />
          <h3 className="text-sm font-black text-slate-900">
            היסטוריית סנכרונים
          </h3>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
            עדיין אין היסטוריית סנכרונים.
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {new Date(item.completedAt).toLocaleString("he-IL")}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {item.startDate || "ללא התחלה"} עד {item.endDate || "ללא סיום"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                    נשלחו {item.sentCount}
                  </span>
                  <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                    נכשלו {item.failedCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    {formatDuration(item.durationMs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
