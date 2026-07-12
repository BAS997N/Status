import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRoundPlus,
  X,
} from "lucide-react";
import { ExternalStaffMember, UserProfile } from "../../types";
import { dataService } from "../../services/dataService";

interface ExternalStaffManagerProps {
  currentUser: UserProfile;
  items: ExternalStaffMember[];
  onItemsChanged: (items: ExternalStaffMember[]) => void;
}

const createId = () =>
  `external_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function ExternalStaffManager({
  currentUser,
  items,
  onItemsChanged,
}: ExternalStaffManagerProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );

  const [draft, setDraft] = useState<ExternalStaffMember[]>(sorted);
  const [fullName, setFullName] = useState("");
  const [staffType, setStaffType] = useState("נהג");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("");
  const [editingPhone, setEditingPhone] = useState("");
  const [editingNote, setEditingNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => setDraft(sorted), [sorted]);

  const normalizeOrder = (values: ExternalStaffMember[]) =>
    values.map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const updateDraft = (values: ExternalStaffMember[]) => {
    setDraft(normalizeOrder(values));
    setMessage(null);
  };

  const addItem = () => {
    const name = fullName.trim();
    const type = staffType.trim();
    if (!name || !type) {
      setMessage({ type: "error", text: "שם מלא וסוג איש צוות הם שדות חובה." });
      return;
    }

    updateDraft([
      ...draft,
      {
        id: createId(),
        fullName: name,
        staffType: type,
        phoneNumber: phoneNumber.trim(),
        note: note.trim(),
        enabled: true,
        sortOrder: draft.length + 1,
        createdAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      },
    ]);

    setFullName("");
    setPhoneNumber("");
    setNote("");
  };

  const startEdit = (item: ExternalStaffMember) => {
    setEditingId(item.id);
    setEditingName(item.fullName);
    setEditingType(item.staffType);
    setEditingPhone(item.phoneNumber || "");
    setEditingNote(item.note || "");
    setMessage(null);
  };

  const finishEdit = () => {
    if (!editingId || !editingName.trim() || !editingType.trim()) return;
    updateDraft(
      draft.map((item) =>
        item.id === editingId
          ? {
              ...item,
              fullName: editingName.trim(),
              staffType: editingType.trim(),
              phoneNumber: editingPhone.trim(),
              note: editingNote.trim(),
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
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    updateDraft(next);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await dataService.saveExternalStaff(
        draft,
        currentUser.userId
      );
      setDraft(saved);
      onItemsChanged(saved);
      setMessage({
        type: "success",
        text: "רשימת אנשי הצוות החיצוניים נשמרה בהצלחה.",
      });
    } catch (error) {
      console.error("Failed saving external staff:", error);
      setMessage({ type: "error", text: "שמירת הרשימה נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-cyan-200 bg-gradient-to-l from-cyan-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
            <UserRoundPlus className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              אנשי צוות חיצוניים
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              ניהול נהגים ואנשי צוות שאינם משתמשים רשומים באתר.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="שם מלא"
            className="input"
          />
          <input
            value={staffType}
            onChange={(event) => setStaffType(event.target.value)}
            placeholder="סוג איש צוות, לדוגמה נהג"
            className="input"
          />
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="מספר טלפון"
            className="input"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="הערה"
            className="input"
          />
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black text-white hover:bg-cyan-700"
        >
          <Plus className="h-4 w-4" />
          הוסף איש צוות
        </button>
      </section>

      <div className="space-y-3">
        {draft.map((item, index) => (
          <section
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            {editingId === item.id ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="input"
                />
                <input
                  value={editingType}
                  onChange={(event) => setEditingType(event.target.value)}
                  className="input"
                />
                <input
                  value={editingPhone}
                  onChange={(event) => setEditingPhone(event.target.value)}
                  className="input"
                />
                <input
                  value={editingNote}
                  onChange={(event) => setEditingNote(event.target.value)}
                  className="input"
                />
                <div className="flex gap-2 md:col-span-2">
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
                    {item.fullName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.staffType}
                    {item.phoneNumber ? ` · ${item.phoneNumber}` : ""}
                  </div>
                  {item.note && (
                    <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(
                        draft.map((current) =>
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
                    onClick={() => startEdit(item)}
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
                    disabled={index === draft.length - 1}
                    className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`למחוק את "${item.fullName}"?`)) return;
                      updateDraft(draft.filter((current) => current.id !== item.id));
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
        {saving ? "שומר..." : "שמור אנשי צוות חיצוניים"}
      </button>
    </div>
  );
}
