import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Eye,
  EyeOff,
  MapPinned,
  Plus,
  Radio,
  Save,
  Trash2,
} from "lucide-react";
import {
  OperationalResourceConfig,
  OperationalResourceType,
  SystemSettingsConfig,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";
import { appDialog } from "../AppDialogProvider";

interface ShiftResourcesManagerProps {
  currentUser: UserProfile;
  settings: SystemSettingsConfig | null;
  onSettingsChanged: (settings: SystemSettingsConfig) => void;
}

const createId = (type: OperationalResourceType) =>
  `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function ShiftResourcesManager({
  currentUser,
  settings,
  onSettingsChanged,
}: ShiftResourcesManagerProps) {
  const sorted = useMemo(
    () =>
      [...(settings?.operationalResources || [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [settings]
  );
  const [draft, setDraft] = useState<OperationalResourceConfig[]>(sorted);
  const [name, setName] = useState("");
  const [type, setType] = useState<OperationalResourceType>("hospital");
  const [coordinates, setCoordinates] = useState("");
  const [link, setLink] = useState("");
  const [frequency, setFrequency] = useState("");
  const [callSign, setCallSign] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => setDraft(sorted), [sorted]);

  const normalize = (items: OperationalResourceConfig[]) =>
    items.map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const add = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setMessage({ type: "error", text: "יש להזין שם." });
      return;
    }
    if (
      draft.some(
        (item) =>
          item.type === type &&
          item.name.trim().toLocaleLowerCase("he") ===
            cleanName.toLocaleLowerCase("he")
      )
    ) {
      setMessage({ type: "error", text: "השם כבר קיים ברשימה זו." });
      return;
    }
    setDraft(
      normalize([
        ...draft,
        {
          id: createId(type),
          name: cleanName,
          type,
          enabled: true,
          sortOrder: draft.length + 1,
          coordinates: type === "helipad" ? coordinates.trim() : "",
          link:
            type === "helipad" || type === "evacuation_point"
              ? link.trim()
              : "",
          frequency: type === "frequency" ? frequency.trim() : "",
          callSign: type === "frequency" ? callSign.trim() : "",
        },
      ])
    );
    setName("");
    setCoordinates("");
    setLink("");
    setFrequency("");
    setCallSign("");
    setMessage(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const sameType = draft.filter((item) => item.type === draft[index].type);
    const currentTypeIndex = sameType.findIndex(
      (item) => item.id === draft[index].id
    );
    const target = sameType[currentTypeIndex + direction];
    if (!target) return;
    const targetIndex = draft.findIndex((item) => item.id === target.id);
    const next = [...draft];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setDraft(normalize(next));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await dataService.saveSystemSettings(
        { ...settings, operationalResources: normalize(draft) },
        currentUser.userId
      );
      onSettingsChanged(saved);
      setMessage({
        type: "success",
        text: "רשימות בתי החולים, המנחתים והתדרים נשמרו.",
      });
    } catch (error) {
      console.error("Failed saving shift resources:", error);
      setMessage({ type: "error", text: "שמירת הרשימות נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  const groups: Array<{
    type: OperationalResourceType;
    title: string;
    icon: typeof Building2;
  }> = [
    { type: "hospital", title: "בתי חולים לפינוי", icon: Building2 },
    { type: "helipad", title: "מנחתים", icon: MapPinned },
    {
      type: "evacuation_point",
      title: "נקודות שחלוף ויעדי פינוי",
      icon: MapPinned,
    },
    { type: "frequency", title: "תדרי קשר", icon: Radio },
  ];

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-l from-sky-50 to-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">
          מנחתים, בתי חולים ותדרים
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          הרשימות הפעילות יופיעו לבחירה בטופס יצירת ועריכת משמרת.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto]">
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as OperationalResourceType)
            }
            className="input"
          >
            <option value="hospital">בית חולים</option>
            <option value="helipad">מנחת</option>
            <option value="evacuation_point">נקודת שחלוף / יעד פינוי</option>
            <option value="frequency">תדר</option>
          </select>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder={
              type === "hospital"
                ? "שם בית החולים"
                : type === "helipad"
                ? "שם המנחת"
                : type === "evacuation_point"
                ? "שם הנקודה, למשל 104"
                : "מטרת התדר, למשל: פינוי רפואי"
            }
            className="input"
          />
          <button
            type="button"
            onClick={add}
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-black text-white"
          >
            <Plus className="h-4 w-4" /> הוסף
          </button>
        </div>
        {type === "helipad" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={coordinates} onChange={(event) => setCoordinates(event.target.value)} placeholder="נ.צ" className="input" />
            <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="קישור למפה" className="input" />
          </div>
        )}
        {type === "evacuation_point" && (
          <div className="mt-3">
            <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="קישור למיקום במפה" className="input" />
          </div>
        )}
        {type === "frequency" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={callSign} onChange={(event) => setCallSign(event.target.value)} placeholder="או״ק / שם הרשת" className="input" />
            <input value={frequency} onChange={(event) => setFrequency(event.target.value)} placeholder="תדר, למשל 53.900" className="input" />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const Icon = group.icon;
          const items = draft.filter((item) => item.type === group.type);
          return (
            <section
              key={group.type}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                <Icon className="h-5 w-5 text-sky-600" /> {group.title}
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
                    טרם נוספו פריטים.
                  </div>
                ) : (
                  items.map((item) => {
                    const index = draft.findIndex(
                      (current) => current.id === item.id
                    );
                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-3 ${
                          item.enabled
                            ? "border-slate-200 bg-white"
                            : "border-slate-100 bg-slate-50 opacity-60"
                        }`}
                      >
                        <div className="grid grid-cols-1 gap-2">
                          <input
                            value={item.name}
                            onChange={(event) =>
                              setDraft((current) =>
                                current.map((value) =>
                                  value.id === item.id
                                    ? { ...value, name: event.target.value }
                                    : value
                                )
                              )
                            }
                            className="input w-full"
                          />
                        {item.type === "helipad" && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input value={item.coordinates || ""} onChange={(event) => setDraft((current) => current.map((value) => value.id === item.id ? { ...value, coordinates: event.target.value } : value))} placeholder="נ.צ" className="input min-w-[150px] flex-1" />
                            <input value={item.link || ""} onChange={(event) => setDraft((current) => current.map((value) => value.id === item.id ? { ...value, link: event.target.value } : value))} placeholder="קישור למפה" className="input min-w-[180px] flex-1" />
                          </div>
                        )}
                        {item.type === "evacuation_point" && (
                          <input value={item.link || ""} onChange={(event) => setDraft((current) => current.map((value) => value.id === item.id ? { ...value, link: event.target.value } : value))} placeholder="קישור למיקום במפה" className="input w-full" />
                        )}
                        {item.type === "frequency" && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input value={item.callSign || ""} onChange={(event) => setDraft((current) => current.map((value) => value.id === item.id ? { ...value, callSign: event.target.value } : value))} placeholder="או״ק / שם הרשת" className="input min-w-[160px] flex-1" />
                            <input value={item.frequency || ""} onChange={(event) => setDraft((current) => current.map((value) => value.id === item.id ? { ...value, frequency: event.target.value } : value))} placeholder="תדר" className="input min-w-[120px] flex-1" />
                          </div>
                        )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((current) =>
                              current.map((value) =>
                                value.id === item.id
                                  ? { ...value, enabled: !value.enabled }
                                  : value
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
                          onClick={() => move(index, -1)}
                          className="rounded-lg border border-slate-200 p-2"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          className="rounded-lg border border-slate-200 p-2"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !(await appDialog.confirm(
                                `למחוק את „${item.name}”?`,
                                {
                                  title: "מחיקת פריט",
                                  confirmLabel: "מחק",
                                  tone: "danger",
                                }
                              ))
                            )
                              return;
                            setDraft((current) =>
                              normalize(
                                current.filter((value) => value.id !== item.id)
                              )
                            );
                          }}
                          className="rounded-lg border border-rose-200 p-2 text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
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
        disabled={saving || !settings}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "שומר..." : "שמור מנחתים, בתי חולים ותדרים"}
      </button>
    </div>
  );
}
