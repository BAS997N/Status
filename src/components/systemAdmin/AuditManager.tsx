import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw, Search } from "lucide-react";
import { AuditLogEntry } from "../../types";
import { dataService } from "../../services/dataService";

const ACTION_LABELS: Record<string, string> = {
  create: "יצירה", update: "עדכון", delete: "מחיקה", sync: "סנכרון", reset: "איפוס",
};
const MODULE_LABELS: Record<string, string> = {
  users: "משתמשים", permissions: "הרשאות", attendance_statuses: "סטטוסים",
  units: "יחידות", medical_roles: "תפקידי רפואה", google_sheets: "Google Sheets", reports: "דיווחים",
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
    try { setLogs(await dataService.getAuditLogs()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => logs.filter((log) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [log.actorName, log.targetLabel, MODULE_LABELS[log.module], ACTION_LABELS[log.action]]
      .some((value) => String(value || "").toLowerCase().includes(q));
    const matchesModule = moduleFilter === "all" || log.module === moduleFilter;
    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesDate = !dateFilter || String(log.createdAt || "").slice(0, 10) === dateFilter;
    return matchesSearch && matchesModule && matchesAction && matchesDate;
  }), [logs, search, moduleFilter, actionFilter, dateFilter]);

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><ClipboardList className="h-6 w-6" /></div>
          <div><h2 className="text-lg font-black text-slate-900">Audit — יומן ביקורת</h2><p className="mt-1 text-xs text-slate-500">תיעוד שינויים בהגדרות, הרשאות, משתמשים וסנכרוני Google Sheets.</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <label className="relative md:col-span-2"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי משתמש או פעולה" className="w-full rounded-xl border border-slate-200 py-2.5 pr-10 pl-3 text-xs outline-none focus:border-indigo-400" /></label>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="all">כל המודולים</option>{Object.entries(MODULE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="all">כל הפעולות</option>{Object.entries(ACTION_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
        <div className="flex gap-2"><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/><button onClick={load} className="rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-10 text-center text-sm text-slate-500">טוען יומן ביקורת...</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">לא נמצאו רשומות.</div> :
        <div className="max-h-[650px] overflow-auto"><table className="w-full min-w-[900px] text-right text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="p-3">זמן</th><th className="p-3">מבצע</th><th className="p-3">מודול</th><th className="p-3">פעולה</th><th className="p-3">יעד</th><th className="p-3">פרטים</th></tr></thead><tbody>{filtered.map((log) => <tr key={log.id} className="border-t border-slate-100 align-top"><td className="whitespace-nowrap p-3">{new Date(log.createdAt).toLocaleString("he-IL")}</td><td className="p-3 font-bold">{log.actorName}</td><td className="p-3">{MODULE_LABELS[log.module] || log.module}</td><td className="p-3">{ACTION_LABELS[log.action] || log.action}</td><td className="p-3">{log.targetLabel || log.targetId || "—"}</td><td className="max-w-md p-3"><details><summary className="cursor-pointer font-bold text-indigo-700">הצג שינוי</summary><div className="mt-2 grid gap-2 md:grid-cols-2"><pre className="max-h-48 overflow-auto rounded-lg bg-rose-50 p-2 text-[10px]">לפני: {JSON.stringify(log.before ?? null, null, 2)}</pre><pre className="max-h-48 overflow-auto rounded-lg bg-emerald-50 p-2 text-[10px]">אחרי: {JSON.stringify(log.after ?? log.metadata ?? null, null, 2)}</pre></div></details></td></tr>)}</tbody></table></div>}
      </div>
    </div>
  );
}
