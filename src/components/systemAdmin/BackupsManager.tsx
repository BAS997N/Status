import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  BackupRestoreResult,
  BackupSection,
  SystemBackupFile,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";
import { appDialog } from "../AppDialogProvider";

interface BackupsManagerProps {
  currentUser: UserProfile;
  systemVersion?: string;
  onRestoreCompleted?: () => void;
}

const SECTION_LABELS: Record<BackupSection, string> = {
  users: "משתמשים",
  attendance: "דיווחי נוכחות",
  attendance_logs: "היסטוריית עריכות דיווחים",
  notifications: "התראות",
  settings: "כל הגדרות המערכת",
  system_logs: "Audit ויומן מערכת",
  shifts: "משמרות ושיבוצים",
  shift_acknowledgements: "אישורי קריאת משמרות",
  external_staff: "אנשי צוות חיצוניים",
  emergency_responses: "תגובות והיסטוריית מרכז חירום",
  commander_messages: "הודעות מפקד ואישורי קריאה",
  line_cycles: "קווים ותאריכי תכנון",
  line_constraints: "אילוצי חיילים לקווים",
  line_presence_plans: "תכנון נוכחות בקווים",
  line_plan_commander_notes: "הערות מפקדים בתכנון קו",
  line_cycle_backups: "גיבויי קווים שנמחקו",
};

const DEFAULT_SECTIONS: BackupSection[] = [
  "users",
  "attendance",
  "attendance_logs",
  "notifications",
  "settings",
  "system_logs",
  "shifts",
  "shift_acknowledgements",
  "external_staff",
  "emergency_responses",
  "commander_messages",
  "line_cycles",
  "line_constraints",
  "line_presence_plans",
  "line_plan_commander_notes",
  "line_cycle_backups",
];

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString("he-IL") : "—";

export default function BackupsManager({
  currentUser,
  systemVersion,
  onRestoreCompleted,
}: BackupsManagerProps) {
  const [selectedSections, setSelectedSections] =
    useState<BackupSection[]>(DEFAULT_SECTIONS);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadedBackup, setLoadedBackup] = useState<SystemBackupFile | null>(null);
  const [restoreResult, setRestoreResult] =
    useState<BackupRestoreResult | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalLoadedDocuments = useMemo(
    () =>
      loadedBackup
        ? Object.values(loadedBackup.counts || {}).reduce(
            (sum, count) => sum + Number(count || 0),
            0
          )
        : 0,
    [loadedBackup]
  );

  const toggleSection = (section: BackupSection) => {
    setSelectedSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section]
    );
  };

  const downloadBackup = async () => {
    if (selectedSections.length === 0) {
      setMessage({ type: "error", text: "יש לבחור לפחות אזור אחד לגיבוי." });
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const backup = await dataService.createSystemBackup(
        selectedSections,
        currentUser.userId,
        systemVersion
      );
      const datePart = backup.createdAt.slice(0, 10);
      const timePart = backup.createdAt.slice(11, 19).replace(/:/g, "-");
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-system-backup-${datePart}-${timePart}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage({
        type: "success",
        text: `הגיבוי נוצר בהצלחה וכלל ${Object.values(
          backup.counts
        ).reduce((sum, count) => sum + Number(count || 0), 0)} מסמכים.`,
      });
    } catch (error) {
      console.error("Backup creation failed:", error);
      setMessage({ type: "error", text: "יצירת הגיבוי נכשלה." });
    } finally {
      setCreating(false);
    }
  };

  const handleBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMessage(null);
    setRestoreResult(null);
    try {
      const parsed = JSON.parse(await file.text()) as SystemBackupFile;
      if (
        parsed.format !== "idf-attendance-backup" ||
        parsed.formatVersion !== 1 ||
        !parsed.sections
      ) {
        throw new Error("unsupported");
      }
      setLoadedBackup(parsed);
      setSelectedSections(
        (Object.keys(parsed.sections) as BackupSection[]).filter((section) =>
          DEFAULT_SECTIONS.includes(section)
        )
      );
      setMessage({
        type: "info",
        text: "קובץ הגיבוי נטען. בדוק את הפרטים לפני השחזור.",
      });
    } catch {
      setLoadedBackup(null);
      setMessage({
        type: "error",
        text: "הקובץ שנבחר אינו גיבוי תקין של המערכת.",
      });
    }
  };

  const restoreBackup = async () => {
    if (!loadedBackup || selectedSections.length === 0) return;

    const confirmed = await appDialog.confirm(
      "השחזור יעדכן נתונים קיימים ב־Firestore. מומלץ ליצור גיבוי חדש לפני ההמשך. להמשיך?",
      { title: "שחזור נתוני מערכת", confirmLabel: "המשך לשחזור", tone: "danger" }
    );
    if (!confirmed) return;

    const secondConfirmation = await appDialog.prompt(
      'כדי לאשר שחזור, הקלד בדיוק: שחזור',
      { title: "אישור סופי לשחזור", confirmLabel: "אשר שחזור", placeholder: "שחזור", tone: "danger" }
    );
    if (secondConfirmation !== "שחזור") {
      setMessage({ type: "error", text: "השחזור בוטל כי מילת האישור לא הוקלדה." });
      return;
    }

    setRestoring(true);
    setMessage(null);
    try {
      const result = await dataService.restoreSystemBackup(
        loadedBackup,
        selectedSections,
        currentUser.userId
      );
      setRestoreResult(result);
      setMessage({
        type: "success",
        text: `השחזור הושלם: ${result.restoredDocuments} מסמכים עודכנו.`,
      });
      onRestoreCompleted?.();
    } catch (error) {
      console.error("Backup restore failed:", error);
      setMessage({
        type: "error",
        text: "השחזור נכשל. הנתונים שכבר נכתבו לפני התקלה עשויים להישאר מעודכנים.",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-l from-sky-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <DatabaseBackup className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              גיבויים ושחזור
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              יצירת קובץ JSON מלא ושחזור נתונים נבחרים. כל פעולה מתועדת ב־Audit.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <h3 className="text-sm font-black text-slate-900">
            בחירת מידע לגיבוי או לשחזור
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DEFAULT_SECTIONS.map((section) => {
            const available =
              !loadedBackup || Array.isArray(loadedBackup.sections[section]);
            return (
              <label
                key={section}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${
                  selectedSections.includes(section)
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white"
                } ${!available ? "cursor-not-allowed opacity-45" : ""}`}
              >
                <span className="text-xs font-bold text-slate-700">
                  {SECTION_LABELS[section]}
                </span>
                <input
                  type="checkbox"
                  checked={selectedSections.includes(section)}
                  disabled={!available}
                  onChange={() => toggleSection(section)}
                  className="h-4 w-4"
                />
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedSections(DEFAULT_SECTIONS)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            בחר הכול
          </button>
          <button
            type="button"
            onClick={() => setSelectedSections([])}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            נקה בחירה
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-black text-slate-900">יצירת גיבוי</h3>
          </div>
          <p className="mb-4 text-xs leading-5 text-slate-500">
            הקובץ נשמר במחשב בלבד. שמור אותו במקום מאובטח.
          </p>
          <button
            type="button"
            onClick={downloadBackup}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <FileJson className="h-4 w-4" />
            {creating ? "יוצר גיבוי..." : "צור והורד גיבוי JSON"}
          </button>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-black text-slate-900">שחזור מגיבוי</h3>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleBackupFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-black text-amber-800 hover:bg-amber-100"
          >
            <Upload className="h-4 w-4" />
            בחר קובץ גיבוי
          </button>

          {loadedBackup && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">נוצר בתאריך</span>
                <span className="font-bold">{formatDate(loadedBackup.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">גרסת מערכת</span>
                <span className="font-bold">{loadedBackup.systemVersion || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">מספר מסמכים</span>
                <span className="font-bold">{totalLoadedDocuments}</span>
              </div>
              <button
                type="button"
                onClick={restoreBackup}
                disabled={restoring || selectedSections.length === 0}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 font-black text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {restoring ? "משחזר..." : "שחזר את האזורים שנבחרו"}
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800">
        <div className="mb-1 flex items-center gap-2 font-black">
          <AlertTriangle className="h-4 w-4" />
          חשוב לפני שחזור
        </div>
        השחזור מעדכן או מוסיף מסמכים לפי המזהה שלהם. הוא אינו מוחק מסמכים
        שאינם קיימים בקובץ הגיבוי, כדי למנוע מחיקה מקרית.
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : message.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-sky-200 bg-sky-50 text-sky-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {restoreResult && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          השחזור הסתיים ב־{formatDate(restoreResult.completedAt)}. עודכנו{" "}
          {restoreResult.restoredDocuments} מסמכים ודולגו{" "}
          {restoreResult.skippedDocuments}.
        </div>
      )}
    </div>
  );
}
