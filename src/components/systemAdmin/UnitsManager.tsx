import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { UnitConfig, UserProfile } from "../../types";
import { dataService } from "../../services/dataService";

interface UnitsManagerProps {
  currentUser: UserProfile;
  units: UnitConfig[];
  onUnitsChanged: (units: UnitConfig[]) => void;
}

const createUnitId = () =>
  `unit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function UnitsManager({
  currentUser,
  units,
  onUnitsChanged,
}: UnitsManagerProps) {
  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.sortOrder - b.sortOrder),
    [units]
  );

  const [draftUnits, setDraftUnits] = useState<UnitConfig[]>(sortedUnits);
  const [newUnitName, setNewUnitName] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setDraftUnits(sortedUnits);
  }, [sortedUnits]);

  const normalizeOrder = (items: UnitConfig[]) =>
    items.map((unit, index) => ({ ...unit, sortOrder: index + 1 }));

  const updateDraft = (nextUnits: UnitConfig[]) => {
    setDraftUnits(normalizeOrder(nextUnits));
    setMessage(null);
  };

  const handleAddUnit = () => {
    const name = newUnitName.trim();
    if (!name) return;

    const alreadyExists = draftUnits.some(
      (unit) => unit.name.trim().toLocaleLowerCase("he") === name.toLocaleLowerCase("he")
    );

    if (alreadyExists) {
      setMessage({ type: "error", text: "כבר קיימת יחידה בשם הזה." });
      return;
    }

    updateDraft([
      ...draftUnits,
      {
        id: createUnitId(),
        name,
        enabled: true,
        sortOrder: draftUnits.length + 1,
        systemUnit: false,
        createdAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      },
    ]);
    setNewUnitName("");
  };

  const handleStartEdit = (unit: UnitConfig) => {
    setEditingUnitId(unit.id);
    setEditingName(unit.name);
    setMessage(null);
  };

  const handleSaveEdit = () => {
    if (!editingUnitId) return;
    const name = editingName.trim();
    if (!name) return;

    const duplicate = draftUnits.some(
      (unit) =>
        unit.id !== editingUnitId &&
        unit.name.trim().toLocaleLowerCase("he") === name.toLocaleLowerCase("he")
    );

    if (duplicate) {
      setMessage({ type: "error", text: "כבר קיימת יחידה בשם הזה." });
      return;
    }

    updateDraft(
      draftUnits.map((unit) =>
        unit.id === editingUnitId
          ? {
              ...unit,
              name,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.userId,
            }
          : unit
      )
    );
    setEditingUnitId(null);
    setEditingName("");
  };

  const handleToggle = (unitId: string) => {
    const unit = draftUnits.find((item) => item.id === unitId);
    if (!unit) return;

    const enabledCount = draftUnits.filter((item) => item.enabled).length;
    if (unit.enabled && enabledCount <= 1) {
      setMessage({
        type: "error",
        text: "חייבת להישאר לפחות יחידה פעילה אחת במערכת.",
      });
      return;
    }

    updateDraft(
      draftUnits.map((item) =>
        item.id === unitId ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const handleDelete = (unit: UnitConfig) => {
    if (unit.systemUnit) {
      setMessage({
        type: "error",
        text: "יחידת מערכת מוגנת אינה ניתנת למחיקה. ניתן להסתיר אותה.",
      });
      return;
    }

    if (unit.enabled && draftUnits.filter((item) => item.enabled).length <= 1) {
      setMessage({
        type: "error",
        text: "לא ניתן למחוק את היחידה הפעילה האחרונה.",
      });
      return;
    }

    updateDraft(draftUnits.filter((item) => item.id !== unit.id));
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftUnits.length) return;

    const next = [...draftUnits];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateDraft(next);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const saved = await dataService.saveUnitConfigs(
        normalizeOrder(draftUnits),
        currentUser.userId
      );
      setDraftUnits(saved);
      onUnitsChanged(saved);
      setMessage({ type: "success", text: "היחידות נשמרו והתעדכנו במערכת." });
    } catch (error) {
      console.error("Failed saving units:", error);
      setMessage({ type: "error", text: "שמירת היחידות נכשלה. נסה שוב." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-rose-600" />
              <h2 className="text-base font-black text-slate-900">ניהול יחידות</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              היחידות הפעילות יוצגו ברישום, בעריכת פרופיל ובמסכי הניהול.
              ניתן להוסיף, לשנות שם, להסתיר, למחוק ולשנות סדר.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
            <input
              value={newUnitName}
              onChange={(event) => setNewUnitName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddUnit();
                }
              }}
              placeholder="שם יחידה חדשה"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
            <button
              type="button"
              onClick={handleAddUnit}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              הוסף יחידה
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-bold text-slate-500">
            {draftUnits.filter((unit) => unit.enabled).length} יחידות פעילות מתוך {draftUnits.length}
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {draftUnits.map((unit, index) => (
            <div
              key={unit.id}
              className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                unit.enabled ? "bg-white" : "bg-slate-50/80"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-600">
                  {index + 1}
                </div>

                {editingUnitId === unit.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleSaveEdit();
                        if (event.key === "Escape") setEditingUnitId(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-100"
                    />
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100"
                      title="שמור שם"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingUnitId(null)}
                      className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
                      title="בטל"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`truncate text-sm font-black ${unit.enabled ? "text-slate-800" : "text-slate-400"}`}>
                        {unit.name}
                      </h3>
                      {unit.systemUnit && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                          יחידת מערכת
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          unit.enabled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {unit.enabled ? "פעילה" : "מוסתרת"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  title="העבר למעלה"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === draftUnits.length - 1}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  title="העבר למטה"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStartEdit(unit)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                  title="ערוך שם"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(unit.id)}
                  className={`rounded-lg border p-2 transition ${
                    unit.enabled
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                  title={unit.enabled ? "הסתר יחידה" : "הצג יחידה"}
                >
                  {unit.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(unit)}
                  className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 transition hover:bg-rose-100"
                  title="מחק יחידה"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 p-4">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving || draftUnits.length === 0}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "שומר יחידות..." : "שמור את כל השינויים"}
          </button>
        </div>
      </div>
    </div>
  );
}
