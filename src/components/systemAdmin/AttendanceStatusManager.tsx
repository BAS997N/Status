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
import { AttendanceStatusConfig, UserProfile } from "../../types";
import { dataService } from "../../services/dataService";

interface AttendanceStatusManagerProps {
  currentUser: UserProfile;
}

interface ColorOption {
  key: string;
  label: string;
  preview: string;
  color: string;
  bg: string;
  border: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  {
    key: "emerald",
    label: "ירוק",
    preview: "bg-emerald-500",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/60",
  },
  {
    key: "indigo",
    label: "אינדיגו",
    preview: "bg-indigo-500",
    color: "text-indigo-700 dark:text-indigo-300",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    border: "border-indigo-200 dark:border-indigo-800/60",
  },
  {
    key: "amber",
    label: "ענבר",
    preview: "bg-amber-500",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/60",
  },
  {
    key: "rose",
    label: "ורוד",
    preview: "bg-rose-500",
    color: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-800/60",
  },
  {
    key: "cyan",
    label: "טורקיז",
    preview: "bg-cyan-500",
    color: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-50 dark:bg-cyan-950/40",
    border: "border-cyan-200 dark:border-cyan-800/60",
  },
  {
    key: "red",
    label: "אדום",
    preview: "bg-red-500",
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800/60",
  },
  {
    key: "orange",
    label: "כתום",
    preview: "bg-orange-500",
    color: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-800/60",
  },
  {
    key: "purple",
    label: "סגול",
    preview: "bg-purple-500",
    color: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-200 dark:border-purple-800/60",
  },
  {
    key: "sky",
    label: "תכלת",
    preview: "bg-sky-500",
    color: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-200 dark:border-sky-800/60",
  },
  {
    key: "slate",
    label: "אפור",
    preview: "bg-slate-500",
    color: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-50 dark:bg-slate-950/40",
    border: "border-slate-200 dark:border-slate-800/60",
  },
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

export default function AttendanceStatusManager({
  currentUser,
}: AttendanceStatusManagerProps) {
  const [statuses, setStatuses] = useState<AttendanceStatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder),
    [statuses]
  );

  const loadStatuses = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError("");
      const loaded = await dataService.getAttendanceStatusConfigs(forceRefresh);
      setStatuses(applyOrder(loaded));
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

  const updateStatus = (
    id: string,
    patch: Partial<AttendanceStatusConfig>
  ) => {
    setStatuses((current) =>
      current.map((status) =>
        status.id === id ? { ...status, ...patch } : status
      )
    );
    setMessage("");
    setError("");
  };

  const addStatus = () => {
    const baseId = `new_status_${Date.now()}`;
    const defaultColor = COLOR_OPTIONS[9];
    const next: AttendanceStatusConfig = {
      id: baseId,
      label: "סטטוס חדש",
      enabled: true,
      visibleToSoldiers: false,
      visibleToCommanders: true,
      sortOrder: statuses.length + 1,
      systemStatus: false,
      requiresNote: false,
      colorKey: defaultColor.key,
      color: defaultColor.color,
      bg: defaultColor.bg,
      border: defaultColor.border,
      createdAt: new Date().toISOString(),
      updatedBy: currentUser.userId,
    };

    setStatuses((current) => [...current, next]);
    setMessage("");
    setError("");
  };

  const duplicateStatus = (source: AttendanceStatusConfig) => {
    const copyId = `${source.id}_copy_${Date.now()}`;
    const copy: AttendanceStatusConfig = {
      ...source,
      id: copyId,
      label: `${source.label} - עותק`,
      sortOrder: statuses.length + 1,
      systemStatus: false,
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      updatedBy: currentUser.userId,
    };

    setStatuses((current) => [...current, copy]);
    setMessage("");
    setError("");
  };

  const deleteStatus = (status: AttendanceStatusConfig) => {
    if (status.systemStatus) return;

    const confirmed = window.confirm(
      `למחוק את הסטטוס “${status.label}”? דיווחים ישנים עם המזהה שלו לא יימחקו.`
    );
    if (!confirmed) return;

    setStatuses((current) =>
      applyOrder(current.filter((item) => item.id !== status.id))
    );
    setMessage("");
    setError("");
  };

  const moveStatus = (id: string, direction: -1 | 1) => {
    const ordered = [...sortedStatuses];
    const index = ordered.findIndex((status) => status.id === id);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    [ordered[index], ordered[targetIndex]] = [
      ordered[targetIndex],
      ordered[index],
    ];

    setStatuses(applyOrder(ordered));
    setMessage("");
    setError("");
  };

  const changeColor = (id: string, colorKey: string) => {
    const option = COLOR_OPTIONS.find((item) => item.key === colorKey);
    if (!option) return;

    updateStatus(id, {
      colorKey: option.key,
      color: option.color,
      bg: option.bg,
      border: option.border,
    });
  };

  const validate = () => {
    const cleaned = applyOrder(
      sortedStatuses.map((status) => ({
        ...status,
        id: normalizeId(status.id),
        label: status.label.trim(),
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

      const validated = validate();
      const payload = validated.map((status) => ({
        ...status,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      }));

      const saved = await dataService.saveAttendanceStatusConfigs(
        payload,
        currentUser.userId
      );

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
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">
        טוען סטטוסים...
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
              <ListChecks className="h-5 w-5 text-rose-600" />
              ניהול סטטוסי נוכחות
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              שינוי שם, סדר, צבע וזמינות לחיילים ולמפקדים. סטטוסים מוגנים
              ניתנים לעריכה אך לא למחיקה.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadStatuses(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              רענן
            </button>
            <button
              type="button"
              onClick={addStatus}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              הוסף סטטוס
            </button>
            <button
              type="button"
              onClick={saveStatuses}
              disabled={saving || statuses.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "שומר..." : "שמור שינויים"}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {sortedStatuses.map((status, index) => {
          const selectedColor =
            COLOR_OPTIONS.find((item) => item.key === status.colorKey) ||
            COLOR_OPTIONS[9];

          return (
            <div
              key={status.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[64px_minmax(180px,1fr)_minmax(180px,1fr)_160px_auto] xl:items-center">
                <div className="flex items-center gap-1 xl:flex-col">
                  <button
                    type="button"
                    onClick={() => moveStatus(status.id, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                    title="הזז למעלה"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <span className="min-w-7 text-center text-xs font-black text-slate-500">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveStatus(status.id, 1)}
                    disabled={index === sortedStatuses.length - 1}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                    title="הזז למטה"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                <label className="space-y-1">
                  <span className="text-[11px] font-black text-slate-500">
                    שם שיוצג באתר
                  </span>
                  <input
                    value={status.label}
                    onChange={(event) =>
                      updateStatus(status.id, { label: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-black text-slate-500">
                    מזהה פנימי באנגלית
                  </span>
                  <input
                    value={status.id}
                    disabled={status.systemStatus}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setStatuses((current) =>
                        current.map((item) =>
                          item.id === status.id
                            ? { ...item, id: nextId }
                            : item
                        )
                      );
                    }}
                    onBlur={(event) => {
                      const normalized = normalizeId(event.target.value);
                      setStatuses((current) =>
                        current.map((item) =>
                          item.id === event.target.value
                            ? { ...item, id: normalized }
                            : item
                        )
                      );
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  {status.systemStatus && (
                    <span className="block text-[10px] font-bold text-slate-400">
                      מזהה של סטטוס מערכת מוגן
                    </span>
                  )}
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-black text-slate-500">
                    צבע
                  </span>
                  <div className="relative">
                    <span
                      className={`pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${selectedColor.preview}`}
                    />
                    <select
                      value={selectedColor.key}
                      onChange={(event) =>
                        changeColor(status.id, event.target.value)
                      }
                      className="w-full appearance-none rounded-xl border border-slate-200 py-2 pl-3 pr-9 text-xs font-bold text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    >
                      {COLOR_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => duplicateStatus(status)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                    title="שכפל סטטוס"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteStatus(status)}
                    disabled={status.systemStatus}
                    className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                    title={status.systemStatus ? "סטטוס מוגן" : "מחק סטטוס"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-100 pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={status.enabled}
                    onChange={(event) =>
                      updateStatus(status.id, { enabled: event.target.checked })
                    }
                    className="h-4 w-4 accent-rose-600"
                  />
                  פעיל
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={status.visibleToSoldiers}
                    onChange={(event) =>
                      updateStatus(status.id, {
                        visibleToSoldiers: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-rose-600"
                  />
                  להצגה לחיילים
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={status.visibleToCommanders}
                    onChange={(event) =>
                      updateStatus(status.id, {
                        visibleToCommanders: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-rose-600"
                  />
                  להצגה למפקדים
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={status.requiresNote === true}
                    onChange={(event) =>
                      updateStatus(status.id, {
                        requiresNote: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-rose-600"
                  />
                  חובה להזין הערה
                </label>

                <span
                  className={`mr-auto rounded-xl border px-3 py-1.5 text-xs font-black ${status.color} ${status.bg} ${status.border}`}
                >
                  תצוגה מקדימה: {status.label || "ללא שם"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {statuses.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
          אין סטטוסים. לחץ על “הוסף סטטוס” כדי להתחיל.
        </div>
      )}
    </div>
  );
}
