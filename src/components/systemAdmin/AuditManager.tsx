import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ClipboardList,
  DatabaseBackup,
  FileSpreadsheet,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { AuditLogEntry } from "../../types";
import { dataService } from "../../services/dataService";

const ACTION_LABELS: Record<string, string> = {
  create: "יצירה",
  update: "עדכון",
  delete: "מחיקה",
  sync: "סנכרון",
  reset: "איפוס",
  backup: "גיבוי",
  restore: "שחזור",
};

const MODULE_LABELS: Record<string, string> = {
  users: "משתמשים",
  permissions: "הרשאות",
  attendance_statuses: "סטטוסים",
  units: "יחידות",
  medical_roles: "תפקידי רפואה",
  google_sheets: "Google Sheets",
  reports: "דיווחים",
  system_settings: "הגדרות מערכת",
  backups: "גיבויים ושחזור",
};

const MODULE_ICONS: Record<string, typeof ClipboardList> = {
  users: Users,
  permissions: ShieldCheck,
  attendance_statuses: ListChecks,
  units: Building2,
  medical_roles: BadgeCheck,
  google_sheets: FileSpreadsheet,
  reports: ClipboardList,
  system_settings: UserCog,
  backups: DatabaseBackup,
};

const ACTION_STYLES: Record<string, string> = {
  create: "border-emerald-200 bg-emerald-50 text-emerald-700",
  update: "border-amber-200 bg-amber-50 text-amber-700",
  delete: "border-rose-200 bg-rose-50 text-rose-700",
  sync: "border-blue-200 bg-blue-50 text-blue-700",
  reset: "border-violet-200 bg-violet-50 text-violet-700",
  backup: "border-sky-200 bg-sky-50 text-sky-700",
  restore: "border-orange-200 bg-orange-50 text-orange-700",
};

const FIELD_LABELS: Record<string, string> = {
  enabled: "פעיל",
  name: "שם",
  label: "שם תצוגה",
  sortOrder: "סדר הצגה",
  systemRole: "תפקיד מערכת",
  visibleToSoldiers: "מוצג לחיילים",
  visibleToCommanders: "מוצג למפקדים",
  exportToSheets: "ייצוא ל־Google Sheets",
  requiresGps: "דורש GPS",
  requiresDateRange: "דורש טווח תאריכים",
  requiresNote: "דורש הערה",
  requiresCommanderApproval: "דורש אישור מפקד",
  chartCategory: "קטגוריית גרף",
  webAppUrl: "כתובת Web App",
  spreadsheetName: "שם הגיליון",
  permissions: "הרשאות",
};

const SKIP_REASON_LABELS: Record<string, string> = {
  reset: "דיווחים שאופסו",
  statusNotExported: "סטטוסים שאינם מיוצאים",
  missingUser: "חסר משתמש או מספר אישי",
  missingDate: "חסר תאריך",
  duplicate: "דיווח קודם לאותו חייל באותו יום",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "מנהל אתר",
  admin: "מפקד",
  viewer: "שליש",
  reporter: "חייל מדווח",
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "string" && ROLE_LABELS[value]) return ROLE_LABELS[value];
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const flattenObject = (
  value: unknown,
  prefix = "",
  target: Record<string, unknown> = {}
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) target[prefix] = value;
    return target;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      flattenObject(item, path, target);
    } else {
      target[path] = item;
    }
  });

  return target;
};

const getFriendlyFieldLabel = (path: string) => {
  const parts = path.split(".");
  const last = parts[parts.length - 1];

  if (parts[0] === "permissions" && parts.length > 1) {
    return `הרשאה: ${parts.slice(1).join(".")}`;
  }

  return FIELD_LABELS[last] || path;
};

const getChanges = (before: unknown, after: unknown) => {
  const beforeFlat = flattenObject(before);
  const afterFlat = flattenObject(after);
  const keys = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]));

  return keys
    .filter((key) => JSON.stringify(beforeFlat[key]) !== JSON.stringify(afterFlat[key]))
    .map((key) => ({
      key,
      label: getFriendlyFieldLabel(key),
      before: beforeFlat[key],
      after: afterFlat[key],
    }));
};

const GoogleSheetsAuditDetails = ({ log }: { log: AuditLogEntry }) => {
  const result = (log.after || log.metadata || {}) as Record<string, any>;
  const reasons = (result.skippedReasons || {}) as Record<string, number>;
  const visibleReasons = Object.entries(reasons).filter(([, count]) => Number(count) > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-blue-50 p-2 text-center">
          <div className="text-[10px] font-bold text-blue-600">נמצאו בטווח</div>
          <div className="mt-1 text-lg font-black text-blue-800">{result.foundCount || 0}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2 text-center">
          <div className="text-[10px] font-bold text-emerald-600">נשלחו</div>
          <div className="mt-1 text-lg font-black text-emerald-800">{result.sentCount || 0}</div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 text-center">
          <div className="text-[10px] font-bold text-amber-600">דולגו</div>
          <div className="mt-1 text-lg font-black text-amber-800">{result.skippedCount || 0}</div>
        </div>
        <div className="rounded-lg bg-rose-50 p-2 text-center">
          <div className="text-[10px] font-bold text-rose-600">נכשלו</div>
          <div className="mt-1 text-lg font-black text-rose-800">{result.failedCount || 0}</div>
        </div>
      </div>

      {visibleReasons.length > 0 && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
          <div className="mb-2 text-[11px] font-black text-amber-800">
            {Number(result.skippedCount || 0)} דיווחים לא נשלחו בגלל:
          </div>
          <div className="space-y-1.5">
            {visibleReasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-slate-700">{SKIP_REASON_LABELS[reason] || reason}</span>
                <span className="rounded-full bg-white px-2 py-0.5 font-black text-amber-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};



type ConfigItem = Record<string, unknown> & { id?: string; name?: string; label?: string };

const CONFIG_IGNORED_FIELDS = new Set(["createdAt", "updatedAt", "updatedBy"]);

const getItemDisplayName = (item?: ConfigItem) =>
  String(item?.name || item?.label || item?.id || "פריט ללא שם");

const getCollectionAuditChanges = (before: unknown, after: unknown) => {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;

  const beforeItems = before as ConfigItem[];
  const afterItems = after as ConfigItem[];
  const beforeById = new Map(beforeItems.map((item, index) => [String(item.id || `index_${index}`), item]));
  const afterById = new Map(afterItems.map((item, index) => [String(item.id || `index_${index}`), item]));

  const added = Array.from(afterById.entries())
    .filter(([id]) => !beforeById.has(id))
    .map(([, item]) => item);

  const removed = Array.from(beforeById.entries())
    .filter(([id]) => !afterById.has(id))
    .map(([, item]) => item);

  const updated = Array.from(afterById.entries()).flatMap(([id, afterItem]) => {
    const beforeItem = beforeById.get(id);
    if (!beforeItem) return [];

    const keys = Array.from(
      new Set([...Object.keys(beforeItem), ...Object.keys(afterItem)])
    ).filter((key) => !CONFIG_IGNORED_FIELDS.has(key) && key !== "id");

    const fieldChanges = keys
      .filter((key) => JSON.stringify(beforeItem[key]) !== JSON.stringify(afterItem[key]))
      .map((key) => ({
        key,
        label: getFriendlyFieldLabel(key),
        before: beforeItem[key],
        after: afterItem[key],
      }));

    return fieldChanges.length > 0
      ? [{ id, name: getItemDisplayName(afterItem), changes: fieldChanges }]
      : [];
  });

  return { added, removed, updated };
};

const ConfigCollectionAuditDetails = ({ log }: { log: AuditLogEntry }) => {
  const summary = getCollectionAuditChanges(log.before, log.after);
  if (!summary) return null;

  const hasChanges =
    summary.added.length > 0 ||
    summary.removed.length > 0 ||
    summary.updated.length > 0;

  if (!hasChanges) {
    return <div className="text-[11px] text-slate-500">לא נמצאו שינויים בתוכן הרשימה.</div>;
  }

  return (
    <div className="space-y-2">
      {summary.added.map((item, index) => (
        <div key={`added-${item.id || index}`} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] font-black text-emerald-800">נוסף פריט</div>
          <div className="mt-1 text-xs font-bold text-slate-800">{getItemDisplayName(item)}</div>
        </div>
      ))}

      {summary.removed.map((item, index) => (
        <div key={`removed-${item.id || index}`} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <div className="text-[11px] font-black text-rose-800">נמחק פריט</div>
          <div className="mt-1 text-xs font-bold text-slate-800">{getItemDisplayName(item)}</div>
        </div>
      ))}

      {summary.updated.map((item) => (
        <div key={`updated-${item.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-black text-slate-800">{item.name}</div>
          <div className="space-y-2">
            {item.changes.map((change) => (
              <div key={`${item.id}-${change.key}`} className="rounded-md border border-slate-200 bg-white p-2.5">
                <div className="mb-2 text-[11px] font-black text-slate-700">{change.label}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="rounded-md bg-rose-50 px-2.5 py-2 text-[11px] text-rose-800">
                    <span className="mb-1 block text-[9px] font-black text-rose-500">לפני</span>
                    <span className="break-words">{formatValue(change.before)}</span>
                  </div>
                  <span className="hidden text-slate-400 sm:block">←</span>
                  <div className="rounded-md bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
                    <span className="mb-1 block text-[9px] font-black text-emerald-500">אחרי</span>
                    <span className="break-words">{formatValue(change.after)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ChangeDetails = ({ log }: { log: AuditLogEntry }) => {
  if (log.module === "google_sheets" && log.action === "sync") {
    return <GoogleSheetsAuditDetails log={log} />;
  }

  if (["medical_roles", "units", "attendance_statuses"].includes(log.module)) {
    const collectionDetails = <ConfigCollectionAuditDetails log={log} />;
    if (collectionDetails) return collectionDetails;
  }

  const changes = getChanges(log.before, log.after || log.metadata);

  if (changes.length === 0) {
    return <div className="text-[11px] text-slate-500">לא נשמר פירוט נוסף לפעולה זו.</div>;
  }

  return (
    <div className="space-y-2">
      {changes.map((change) => (
        <div key={change.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-[11px] font-black text-slate-700">{change.label}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="rounded-md bg-rose-50 px-2.5 py-2 text-[11px] text-rose-800">
              <span className="mb-1 block text-[9px] font-black text-rose-500">לפני</span>
              <span className="break-words">{formatValue(change.before)}</span>
            </div>
            <span className="hidden text-slate-400 sm:block">←</span>
            <div className="rounded-md bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
              <span className="mb-1 block text-[9px] font-black text-emerald-500">אחרי</span>
              <span className="break-words">{formatValue(change.after)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default function AuditManager() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await dataService.getAuditLogs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          [
            log.actorName,
            log.targetLabel,
            MODULE_LABELS[log.module],
            ACTION_LABELS[log.action],
          ].some((value) => String(value || "").toLowerCase().includes(q));
        const matchesModule = moduleFilter === "all" || log.module === moduleFilter;
        const matchesAction = actionFilter === "all" || log.action === actionFilter;
        const matchesDate =
          !dateFilter || String(log.createdAt || "").slice(0, 10) === dateFilter;
        return matchesSearch && matchesModule && matchesAction && matchesDate;
      }),
    [logs, search, moduleFilter, actionFilter, dateFilter]
  );

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Audit — יומן ביקורת</h2>
            <p className="mt-1 text-xs text-slate-500">
              תיעוד שינויים בהגדרות, הרשאות, משתמשים וסנכרוני Google Sheets.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <label className="relative md:col-span-2">
          <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש לפי משתמש או פעולה"
            className="w-full rounded-xl border border-slate-200 py-2.5 pr-10 pl-3 text-xs outline-none focus:border-indigo-400"
          />
        </label>
        <select
          value={moduleFilter}
          onChange={(event) => setModuleFilter(event.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
        >
          <option value="all">כל המודולים</option>
          {Object.entries(MODULE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
        >
          <option value="all">כל הפעולות</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
          />
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">טוען יומן ביקורת...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">לא נמצאו רשומות.</div>
        ) : (
          <div className="max-h-[720px] overflow-auto">
            <table className="w-full min-w-[940px] text-right text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3">זמן</th>
                  <th className="p-3">מבצע</th>
                  <th className="p-3">מודול</th>
                  <th className="p-3">פעולה</th>
                  <th className="p-3">יעד</th>
                  <th className="p-3">פרטים</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const ModuleIcon = MODULE_ICONS[log.module] || UserCog;

                  return (
                    <tr key={log.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap p-3 text-slate-600">
                        {new Date(log.createdAt).toLocaleString("he-IL")}
                      </td>
                      <td className="p-3 font-bold text-slate-800">{log.actorName}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                          <ModuleIcon className="h-4 w-4 text-slate-500" />
                          {MODULE_LABELS[log.module] || log.module}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${ACTION_STYLES[log.action] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {log.targetLabel || log.targetId || "—"}
                      </td>
                      <td className="max-w-xl p-3">
                        <details className="group rounded-xl border border-slate-200 bg-white">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 font-black text-indigo-700">
                            <span>הצג שינוי</span>
                            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                          </summary>
                          <div className="border-t border-slate-100 p-3">
                            <ChangeDetails log={log} />
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
