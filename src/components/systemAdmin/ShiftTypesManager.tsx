import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { ShiftTypeConfig, UserProfile } from "../../types";
import { dataService } from "../../services/dataService";

interface ShiftTypesManagerProps {
  currentUser: UserProfile;
}

const createId = () =>
  `shift_type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function ShiftTypesManager({
  currentUser,
}: ShiftTypesManagerProps) {
  const [items, setItems] = useState<ShiftTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newCrossesMidnight, setNewCrossesMidnight] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingStartTime, setEditingStartTime] = useState("");
  const [editingEndTime, setEditingEndTime] = useState("");
  const [editingCrossesMidnight, setEditingCrossesMidnight] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );

  useEffect(() => {
    let cancelled = false;

    dataService
      .getShiftTypeConfigs(true)
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch((error) => {
        console.error("Failed loading shift types:", error);
        if (!cancelled) {
          setMessage({
            type: "error",
            text: "טעינת שמות המשמרות נכשלה.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizeOrder = (values: ShiftTypeConfig[]) =>
    values.map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const updateItems = (values: ShiftTypeConfig[]) => {
    setItems(normalizeOrder(values));
    setMessage(null);
  };

  const addItem = () => {
    const name = newName.trim();
    if (!name) {
      setMessage({ type: "error", text: "יש להזין שם משמרת." });
      return;
    }

    const duplicate = items.some(
      (item) =>
        item.name.trim().toLocaleLowerCase("he") ===
        name.toLocaleLowerCase("he")
    );
    if (duplicate) {
      setMessage({ type: "error", text: "שם המשמרת כבר קיים." });
      return;
    }

    updateItems([
      ...items,
      {
        id: createId(),
        name,
        enabled: true,
        sortOrder: items.length + 1,
        defaultStartTime: newStartTime,
        defaultEndTime: newEndTime,
        crossesMidnight: newCrossesMidnight,
        createdAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      },
    ]);

    setNewName("");
    setNewStartTime("");
    setNewEndTime("");
    setNewCrossesMidnight(false);
  };

  const beginEdit = (item: ShiftTypeConfig) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingStartTime(item.defaultStartTime || "");
    setEditingEndTime(item.defaultEndTime || "");
    setEditingCrossesMidnight(item.crossesMidnight === true);
    setMessage(null);
  };

  const finishEdit = () => {
    if (!editingId || !editingName.trim()) return;

    updateItems(
      items.map((item) =>
        item.id === editingId
          ? {
              ...item,
              name: editingName.trim(),
              defaultStartTime: editingStartTime,
              defaultEndTime: editingEndTime,
              crossesMidnight: editingCrossesMidnight,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.userId,
            }
          : item
      )
    );
    setEditingId(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sortedItems.length) return;

    const next = [...sortedItems];
    [next[index], next[target]] = [next[target], next[index]];
    updateItems(next);
  };

  const save = async () => {
    if (items.filter((item) => item.enabled).length === 0) {
      setMessage({
        type: "error",
        text: "חייב להישאר לפחות שם משמרת פעיל אחד.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = await dataService.saveShiftTypeConfigs(
        items,
        currentUser.userId
      );
      setItems(saved);
      setMessage({
        type: "success",
        text: "שמות המשמרות נשמרו בהצלחה.",
      });
    } catch (error) {
      console.error("Failed saving shift types:", error);
      setMessage({ type: "error", text: "שמירת שמות המשמרות נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              ניהול שמות וסוגי משמרות
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              הוספה, עריכה וסידור של שמות המשמרות וזמני ברירת המחדל שלהן.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder='לדוגמה: תגב"ץ בוקר'
            className="input"
          />
          <input
            type="time"
            value={newStartTime}
            onChange={(event) => setNewStartTime(event.target.value)}
            className="input"
            aria-label="שעת התחלה"
          />
          <input
            type="time"
            value={newEndTime}
            onChange={(event) => setNewEndTime(event.target.value)}
            className="input"
            aria-label="שעת סיום"
          />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <input
              type="checkbox"
              checked={newCrossesMidnight}
              onChange={(event) =>
                setNewCrossesMidnight(event.target.checked)
              }
            />
            <span className="text-xs font-bold text-slate-700">
              הסיום ביום הבא
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={addItem}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white hover:bg-amber-700"
        >
          <Plus className="h-4 w-4" />
          הוסף שם משמרת
        </button>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          טוען שמות משמרות...
        </div>
      ) : (
        <div className="space-y-3">
          {sortedItems.map((item, index) => (
            <section
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              {editingId === item.id ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    className="input"
                  />
                  <input
                    type="time"
                    value={editingStartTime}
                    onChange={(event) =>
                      setEditingStartTime(event.target.value)
                    }
                    className="input"
                  />
                  <input
                    type="time"
                    value={editingEndTime}
                    onChange={(event) =>
                      setEditingEndTime(event.target.value)
                    }
                    className="input"
                  />
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={editingCrossesMidnight}
                      onChange={(event) =>
                        setEditingCrossesMidnight(event.target.checked)
                      }
                    />
                    <span className="text-xs font-bold text-slate-700">
                      הסיום ביום הבא
                    </span>
                  </label>

                  <div className="flex gap-2 md:col-span-4">
                    <button
                      type="button"
                      onClick={finishEdit}
                      className="rounded-lg bg-emerald-600 p-2 text-white"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-200 p-2"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.defaultStartTime && item.defaultEndTime
                        ? `${item.defaultStartTime}–${item.defaultEndTime}${
                            item.crossesMidnight ? " · סיום ביום הבא" : ""
                          }`
                        : "ללא שעות ברירת מחדל"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateItems(
                          items.map((current) =>
                            current.id === item.id
                              ? { ...current, enabled: !current.enabled }
                              : current
                          )
                        )
                      }
                      className="rounded-lg border border-slate-200 p-2"
                      title={item.enabled ? "השבת" : "הפעל"}
                    >
                      {item.enabled ? (
                        <Eye className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => beginEdit(item)}
                      className="rounded-lg border border-slate-200 p-2"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === sortedItems.length - 1}
                      className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`למחוק את "${item.name}"?`)) {
                          return;
                        }
                        updateItems(
                          items.filter((current) => current.id !== item.id)
                        );
                      }}
                      className="rounded-lg border border-rose-200 p-2 text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

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

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "שומר..." : "שמור שמות משמרות"}
      </button>
    </div>
  );
}
