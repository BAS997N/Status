import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  AttendanceChartCategory,
  AttendanceStatusConfig,
  DEFAULT_ATTENDANCE_STATUS_CONFIGS,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";

interface AttendanceStatusManagerProps {
  currentUser: UserProfile;
}


interface IconOption {
  value: string;
  label: string;
  keywords: string[];
}

const ICON_OPTIONS: IconOption[] = [
  { value: "🟢", label: "בבסיס / פעיל", keywords: ["בסיס", "פעיל", "נוכח", "ירוק"] },
  { value: "🏠", label: "בית", keywords: ["בית", "חופשה", "אפטר"] },
  { value: "🌲", label: "שטח", keywords: ["שטח", "אימון", "טבע"] },
  { value: "🚑", label: "רפואה", keywords: ["רפואה", "גימלים", "חולים", "אמבולנס"] },
  { value: "🩺", label: "בדיקה רפואית", keywords: ["רופא", "בדיקה", "רפואה"] },
  { value: "🏥", label: "בית חולים", keywords: ["אשפוז", "בית חולים", "רפואה"] },
  { value: "📚", label: "קורס / לימודים", keywords: ["קורס", "לימודים", "הכשרה"] },
  { value: "🎓", label: "הכשרה", keywords: ["הכשרה", "קורס", "לימודים"] },
  { value: "✂️", label: "חיתוך צו", keywords: ["חיתוך", "צו"] },
  { value: "⛔", label: "לא בצו / חסום", keywords: ["לא בצו", "חסום", "עצירה"] },
  { value: "📅", label: "תאריך / ימי עיבוד", keywords: ["תאריך", "עיבוד", "ימים"] },
  { value: "☕", label: "התרעננות", keywords: ["התרעננות", "מנוחה", "קפה"] },
  { value: "🛌", label: "מנוחה", keywords: ["מנוחה", "שינה", "בית"] },
  { value: "🛡️", label: "שמירה / אבטחה", keywords: ["שמירה", "אבטחה", "כוננות"] },
  { value: "⚠️", label: "אזהרה", keywords: ["אזהרה", "חריג", "תשומת לב"] },
  { value: "✅", label: "מאושר", keywords: ["מאושר", "תקין", "הושלם"] },
  { value: "⏳", label: "בהמתנה", keywords: ["המתנה", "ממתין", "זמן"] },
  { value: "🚗", label: "נסיעה", keywords: ["נסיעה", "רכב", "נהג"] },
  { value: "🚌", label: "הסעה", keywords: ["הסעה", "אוטובוס", "נסיעה"] },
  { value: "📍", label: "מיקום", keywords: ["מיקום", "GPS", "נקודה"] },
  { value: "🗂️", label: "מנהלי", keywords: ["מנהלי", "מסמכים", "טיפול"] },
  { value: "📋", label: "דיווח", keywords: ["דיווח", "טופס", "רשימה"] },
  { value: "🧭", label: "משימה", keywords: ["משימה", "ניווט", "פעילות"] },
  { value: "🎯", label: "יעד / משימה", keywords: ["יעד", "משימה", "מטרה"] },
  { value: "📌", label: "אחר", keywords: ["אחר", "כללי", "סיכה"] },
];

interface ColorOption {
  key: string;
  label: string;
  hex: string;
  color: string;
  bg: string;
  border: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  { key: "emerald", label: "ירוק", hex: "#10b981", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  { key: "green", label: "ירוק כהה", hex: "#16a34a", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  { key: "lime", label: "ליים", hex: "#84cc16", color: "text-lime-700", bg: "bg-lime-50", border: "border-lime-200" },
  { key: "teal", label: "ירוק־כחול", hex: "#14b8a6", color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
  { key: "cyan", label: "טורקיז", hex: "#06b6d4", color: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200" },
  { key: "sky", label: "תכלת", hex: "#0ea5e9", color: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200" },
  { key: "blue", label: "כחול", hex: "#3b82f6", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  { key: "indigo", label: "אינדיגו", hex: "#6366f1", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
  { key: "violet", label: "סגול־כחול", hex: "#8b5cf6", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  { key: "purple", label: "סגול", hex: "#a855f7", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  { key: "fuchsia", label: "פוקסיה", hex: "#d946ef", color: "text-fuchsia-700", bg: "bg-fuchsia-50", border: "border-fuchsia-200" },
  { key: "pink", label: "ורוד", hex: "#ec4899", color: "text-pink-700", bg: "bg-pink-50", border: "border-pink-200" },
  { key: "rose", label: "ורוד־אדום", hex: "#f43f5e", color: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200" },
  { key: "red", label: "אדום", hex: "#ef4444", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  { key: "orange", label: "כתום", hex: "#f97316", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  { key: "amber", label: "ענבר", hex: "#f59e0b", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "yellow", label: "צהוב", hex: "#eab308", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  { key: "stone", label: "אבן", hex: "#78716c", color: "text-stone-700", bg: "bg-stone-50", border: "border-stone-200" },
  { key: "slate", label: "אפור", hex: "#64748b", color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
];

const CHART_OPTIONS: Array<{ value: AttendanceChartCategory; label: string }> = [
  { value: "present", label: "נוכח" },
  { value: "absent", label: "נעדר" },
  { value: "medical", label: "רפואי" },
  { value: "administrative", label: "מנהלי" },
  { value: "not_on_order", label: "לא בצו" },
  { value: "neutral", label: "ניטרלי / אחר" },
  { value: "exclude", label: "לא להציג בגרפים" },
];

const normalizeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const applyOrder = (statuses: AttendanceStatusConfig[]) =>
  statuses.map((status, index) => ({ ...status, sortOrder: index + 1 }));

const restoreBuiltInIcons = (statuses: AttendanceStatusConfig[]) => {
  const defaultsById = new Map(
    DEFAULT_ATTENDANCE_STATUS_CONFIGS.map((status) => [status.id, status])
  );

  return statuses.map((status) => {
    const defaultStatus = defaultsById.get(status.id);
    const shouldRestore =
      defaultStatus?.icon &&
      (!status.icon ||
        (status.icon === "📌" && defaultStatus.icon !== "📌"));

    return shouldRestore
      ? { ...status, icon: defaultStatus.icon }
      : status;
  });
};


export default function AttendanceStatusManager({ currentUser }: AttendanceStatusManagerProps) {
  const [statuses, setStatuses] = useState<AttendanceStatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [openIconPickerId, setOpenIconPickerId] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState("");

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder),
    [statuses]
  );

  const loadStatuses = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError("");
      const loaded = await dataService.getAttendanceStatusConfigs(forceRefresh);
      setStatuses(applyOrder(restoreBuiltInIcons(loaded)));
    } catch (err) {
      console.error(err);
      setError("טעינת הסטטוסים נכשלה");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();
  }, []);

  const updateStatus = (id: string, patch: Partial<AttendanceStatusConfig>) => {
    setStatuses((current) =>
      current.map((status) => (status.id === id ? { ...status, ...patch } : status))
    );
    setMessage("");
    setError("");
  };

  const addStatus = () => {
    const defaultColor = COLOR_OPTIONS.find((item) => item.key === "slate")!;
    const next: AttendanceStatusConfig = {
      id: `new_status_${Date.now()}`,
      label: "סטטוס חדש",
      icon: "📌",
      description: "",
      enabled: true,
      visibleToSoldiers: false,
      visibleToCommanders: true,
      sortOrder: statuses.length + 1,
      systemStatus: false,
      requiresNote: false,
      chartCategory: "neutral",
      exportToSheets: true,
      requiresGps: false,
      requiresDateRange: false,
      requiresPhoto: false,
      requiresCommanderApproval: false,
      colorKey: defaultColor.key,
      color: defaultColor.color,
      bg: defaultColor.bg,
      border: defaultColor.border,
      customColor: defaultColor.hex,
      createdAt: new Date().toISOString(),
      updatedBy: currentUser.userId,
    };
    setStatuses((current) => [...current, next]);
    setMessage("");
    setError("");
  };

  const duplicateStatus = (source: AttendanceStatusConfig) => {
    const copy: AttendanceStatusConfig = {
      ...source,
      id: `${source.id}_copy_${Date.now()}`,
      label: `${source.label} - עותק`,
      sortOrder: statuses.length + 1,
      systemStatus: false,
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      updatedBy: currentUser.userId,
    };
    setStatuses((current) => [...current, copy]);
  };

  const deleteStatus = (status: AttendanceStatusConfig) => {
    if (status.systemStatus) return;
    if (!window.confirm(`למחוק את הסטטוס “${status.label}”? דיווחים ישנים לא יימחקו.`)) return;
    setStatuses((current) => applyOrder(current.filter((item) => item.id !== status.id)));
  };

  const moveStatus = (id: string, direction: -1 | 1) => {
    const ordered = [...sortedStatuses];
    const index = ordered.findIndex((status) => status.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    setStatuses(applyOrder(ordered));
  };

  const changePresetColor = (id: string, colorKey: string) => {
    const option = COLOR_OPTIONS.find((item) => item.key === colorKey);
    if (!option) return;
    updateStatus(id, {
      colorKey: option.key,
      customColor: option.hex,
      color: option.color,
      bg: option.bg,
      border: option.border,
    });
  };

  const changeCustomColor = (id: string, hex: string) => {
    updateStatus(id, {
      colorKey: "custom",
      customColor: hex,
      color: "text-slate-900",
      bg: "bg-white",
      border: "border-slate-200",
    });
  };

  const validate = () => {
    const cleaned = applyOrder(
      sortedStatuses.map((status) => ({
        ...status,
        id: normalizeId(status.id),
        label: status.label.trim(),
        icon: status.icon?.trim() || "📌",
        description: status.description?.trim() || "",
        chartCategory: status.chartCategory || "neutral",
        exportToSheets: status.exportToSheets !== false,
      }))
    );

    if (cleaned.some((status) => !status.id || !status.label)) {
      throw new Error("לכל סטטוס חייבים להיות שם ומזהה פנימי תקינים");
    }
    const ids = cleaned.map((status) => status.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("קיימים שני סטטוסים עם אותו מזהה פנימי");
    }
    return cleaned;
  };

  const saveStatuses = async () => {
    try {
      setSaving(true);
      setMessage("");
      setError("");
      const payload = validate().map((status) => ({
        ...status,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      }));
      const saved = await dataService.saveAttendanceStatusConfigs(payload, currentUser.userId);
      setStatuses(applyOrder(saved));
      setMessage("הסטטוסים נשמרו בהצלחה");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "שמירת הסטטוסים נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">טוען סטטוסים...</div>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
              <ListChecks className="h-5 w-5 text-rose-600" /> ניהול סטטוסי נוכחות
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">ניהול תצוגה, צבעים, אייקונים, גרפים והתנהגות לכל סטטוס.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => loadStatuses(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className="h-4 w-4" />רענן</button>
            <button type="button" onClick={addStatus} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-60"><Plus className="h-4 w-4" />הוסף סטטוס</button>
            <button type="button" onClick={saveStatuses} disabled={saving || statuses.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "שומר..." : "שמור שינויים"}</button>
          </div>
        </div>
        {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{message}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}
      </div>

      <div className="space-y-3">
        {sortedStatuses.map((status, index) => {
          const preset = COLOR_OPTIONS.find((item) => item.key === status.colorKey);
          const previewHex = status.customColor || preset?.hex || "#64748b";
          return (
            <div key={status.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[64px_90px_minmax(180px,1fr)_minmax(180px,1fr)_180px_auto] xl:items-end">
                <div className="flex items-center gap-1 xl:flex-col xl:self-center">
                  <button type="button" onClick={() => moveStatus(status.id, -1)} disabled={index === 0} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <span className="min-w-7 text-center text-xs font-black text-slate-500">{index + 1}</span>
                  <button type="button" onClick={() => moveStatus(status.id, 1)} disabled={index === sortedStatuses.length - 1} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                </div>

                <div className="relative space-y-1">
                  <span className="text-[11px] font-black text-slate-500">אייקון</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenIconPickerId((current) =>
                        current === status.id ? null : status.id
                      );
                      setIconSearch("");
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xl transition hover:border-rose-300 hover:bg-rose-50/30"
                    title="פתח בורר אייקונים"
                  >
                    <span>{status.icon || "📌"}</span>
                    <span className="text-[10px] font-black text-slate-400">בחר</span>
                  </button>

                  {openIconPickerId === status.id && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-[320px] max-w-[85vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <input
                        autoFocus
                        value={iconSearch}
                        onChange={(event) => setIconSearch(event.target.value)}
                        placeholder="חיפוש אייקון: בית, רפואה, שטח..."
                        className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      />

                      <div className="grid max-h-52 grid-cols-5 gap-2 overflow-y-auto pl-1">
                        {ICON_OPTIONS.filter((option) => {
                          const query = iconSearch.trim().toLowerCase();
                          if (!query) return true;
                          return (
                            option.label.toLowerCase().includes(query) ||
                            option.keywords.some((keyword) =>
                              keyword.toLowerCase().includes(query)
                            )
                          );
                        }).map((option) => (
                          <button
                            key={`${option.value}-${option.label}`}
                            type="button"
                            onClick={() => {
                              updateStatus(status.id, { icon: option.value });
                              setOpenIconPickerId(null);
                              setIconSearch("");
                            }}
                            className={`flex h-12 items-center justify-center rounded-xl border text-2xl transition hover:border-rose-300 hover:bg-rose-50 ${
                              status.icon === option.value
                                ? "border-rose-400 bg-rose-50 ring-2 ring-rose-100"
                                : "border-slate-200 bg-white"
                            }`}
                            title={option.label}
                          >
                            {option.value}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <span className="mb-1 block text-[10px] font-black text-slate-500">
                          אימוג׳י מותאם אישית
                        </span>
                        <input
                          value={status.icon || ""}
                          onChange={(event) =>
                            updateStatus(status.id, { icon: event.target.value })
                          }
                          maxLength={8}
                          placeholder="הדבק כאן אימוג׳י"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-center text-xl outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <label className="space-y-1"><span className="text-[11px] font-black text-slate-500">שם שיוצג באתר</span><input value={status.label} onChange={(e) => updateStatus(status.id, { label: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" /></label>
                <label className="space-y-1"><span className="text-[11px] font-black text-slate-500">מזהה פנימי באנגלית</span><input value={status.id} disabled={status.systemStatus} onChange={(e) => updateStatus(status.id, { id: e.target.value })} onBlur={(e) => updateStatus(status.id, { id: normalizeId(e.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400" /></label>

                <div className="space-y-1">
                  <span className="text-[11px] font-black text-slate-500">צבע</span>
                  <div className="flex gap-2">
                    <select value={preset?.key || "custom"} onChange={(e) => e.target.value !== "custom" && changePresetColor(status.id, e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">
                      <option value="custom">מותאם אישית</option>
                      {COLOR_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                    <input type="color" value={previewHex} onChange={(e) => changeCustomColor(status.id, e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" title="בחר צבע מותאם אישית" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 xl:self-center">
                  <button type="button" onClick={() => duplicateStatus(status)} className="rounded-lg border border-slate-200 p-2 text-slate-600" title="שכפל"><Copy className="h-4 w-4" /></button>
                  <button type="button" onClick={() => deleteStatus(status)} disabled={status.systemStatus} className="rounded-lg border border-red-200 p-2 text-red-600 disabled:opacity-30" title="מחק"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
                <label className="space-y-1"><span className="text-[11px] font-black text-slate-500">תיאור / הסבר למשתמש</span><textarea value={status.description || ""} onChange={(e) => updateStatus(status.id, { description: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label>
                <label className="space-y-1"><span className="text-[11px] font-black text-slate-500">איך נספר בגרפים</span><select value={status.chartCategory || "neutral"} onChange={(e) => updateStatus(status.id, { chartCategory: e.target.value as AttendanceChartCategory })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{CHART_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                {[
                  ["enabled", "פעיל"],
                  ["visibleToSoldiers", "להצגה לחיילים"],
                  ["visibleToCommanders", "להצגה למפקדים"],
                  ["requiresNote", "חובה להזין הערה"],
                  ["exportToSheets", "ייצוא ל־Google Sheets"],
                  ["requiresGps", "דורש GPS"],
                  ["requiresDateRange", "דורש טווח תאריכים"],
                  ["requiresPhoto", "דורש תמונה"],
                  ["requiresCommanderApproval", "דורש אישור מפקד"],
                ].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                    <input type="checkbox" checked={Boolean((status as any)[key])} onChange={(e) => updateStatus(status.id, { [key]: e.target.checked } as Partial<AttendanceStatusConfig>)} className="h-4 w-4 accent-rose-600" />
                    {label}
                  </label>
                ))}

                <span className="mr-auto inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-black" style={{ color: previewHex, borderColor: `${previewHex}55`, backgroundColor: `${previewHex}14` }}>
                  <span>{status.icon || "📌"}</span>
                  <span>{status.label || "ללא שם"}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
