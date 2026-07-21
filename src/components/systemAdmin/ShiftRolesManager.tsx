import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarCog,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  ExternalStaffMember,
  MedicalRoleConfig,
  ShiftSlotConfig,
  SystemRole,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";

interface ShiftRolesManagerProps {
  currentUser: UserProfile;
  users: UserProfile[];
  medicalRoles: MedicalRoleConfig[];
  externalStaff: ExternalStaffMember[];
  configs: ShiftSlotConfig[];
  onConfigsChanged: (configs: ShiftSlotConfig[]) => void;
}

const SYSTEM_ROLE_OPTIONS: Array<{ value: SystemRole; label: string }> = [
  { value: "super_admin", label: "מנהל אתר" },
  { value: "admin", label: "מפקד" },
  { value: "viewer", label: "שליש" },
  { value: "reporter", label: "חייל" },
];

const createId = () =>
  `shift_slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function ShiftRolesManager({
  currentUser,
  users,
  medicalRoles,
  externalStaff,
  configs,
  onConfigsChanged,
}: ShiftRolesManagerProps) {
  const sorted = useMemo(
    () => [...configs].sort((a, b) => a.sortOrder - b.sortOrder),
    [configs]
  );
  const activeMedicalRoles = useMemo(
    () =>
      medicalRoles
        .filter((role) => role.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [medicalRoles]
  );

  const externalStaffTypes = useMemo(
    () =>
      Array.from(
        new Set(
          externalStaff
            .filter((item) => item.enabled)
            .map((item) => item.staffType.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "he")),
    [externalStaff]
  );

  const [draft, setDraft] = useState<ShiftSlotConfig[]>(sorted);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [userSearchBySlot, setUserSearchBySlot] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => setDraft(sorted), [sorted]);

  const normalizeOrder = (items: ShiftSlotConfig[]) =>
    items.map((item, index) => ({ ...item, sortOrder: index + 1 }));

  const updateDraft = (items: ShiftSlotConfig[]) => {
    setDraft(normalizeOrder(items));
    setMessage(null);
  };

  const addRole = () => {
    const name = newName.trim();
    if (!name) return;
    if (
      draft.some(
        (item) =>
          item.name.trim().toLocaleLowerCase("he") ===
          name.toLocaleLowerCase("he")
      )
    ) {
      setMessage({ type: "error", text: "כבר קיים תפקיד משמרת בשם הזה." });
      return;
    }

    updateDraft([
      ...draft,
      {
        id: createId(),
        name,
        quantity: 1,
        required: true,
        enabled: true,
        sortOrder: draft.length + 1,
        allowedMedicalRoleIds: [],
        allowedSystemRoles: [],
        allowedUserIds: [],
        allowSystemUsers: true,
        allowDischargedUsers: false,
        allowExternalStaff: false,
        allowedExternalStaffTypes: [],
        createdAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      },
    ]);
    setNewName("");
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    updateDraft(next);
  };

  const toggleMedicalRole = (slotId: string, roleId: string) => {
    updateDraft(
      draft.map((slot) => {
        if (slot.id !== slotId) return slot;
        const selected = slot.allowedMedicalRoleIds.includes(roleId);
        return {
          ...slot,
          allowedMedicalRoleIds: selected
            ? slot.allowedMedicalRoleIds.filter((id) => id !== roleId)
            : [...slot.allowedMedicalRoleIds, roleId],
        };
      })
    );
  };

  const toggleSystemRole = (slotId: string, role: SystemRole) => {
    updateDraft(
      draft.map((slot) => {
        if (slot.id !== slotId) return slot;
        const selected = slot.allowedSystemRoles.includes(role);
        return {
          ...slot,
          allowedSystemRoles: selected
            ? slot.allowedSystemRoles.filter((item) => item !== role)
            : [...slot.allowedSystemRoles, role],
        };
      })
    );
  };

  const toggleAllowedUser = (slotId: string, userId: string) => {
    updateDraft(
      draft.map((slot) => {
        if (slot.id !== slotId) return slot;
        const current = slot.allowedUserIds || [];
        const selected = current.includes(userId);
        return {
          ...slot,
          allowedUserIds: selected
            ? current.filter((id) => id !== userId)
            : [...current, userId],
        };
      })
    );
  };

  const toggleExternalStaffType = (slotId: string, staffType: string) => {
    updateDraft(
      draft.map((slot) => {
        if (slot.id !== slotId) return slot;
        const current = slot.allowedExternalStaffTypes || [];
        const selected = current.includes(staffType);
        return {
          ...slot,
          allowedExternalStaffTypes: selected
            ? current.filter((item) => item !== staffType)
            : [...current, staffType],
        };
      })
    );
  };

  const save = async () => {
    if (draft.filter((item) => item.enabled).length === 0) {
      setMessage({
        type: "error",
        text: "חייב להישאר לפחות תפקיד משמרת פעיל אחד.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const saved = await dataService.saveShiftSlotConfigs(
        draft,
        currentUser.userId
      );
      setDraft(saved);
      onConfigsChanged(saved);
      setMessage({
        type: "success",
        text: "הגדרות תפקידי המשמרת נשמרו בהצלחה.",
      });
    } catch (error) {
      console.error("Failed saving shift slot configs:", error);
      setMessage({ type: "error", text: "שמירת ההגדרות נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <CalendarCog className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              ניהול תפקידי משמרת
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              קביעת שמות התפקידים, מספר התקנים ומי רשאי להשתבץ בכל תפקיד.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addRole();
            }}
            placeholder="שם תפקיד משמרת חדש"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={addRole}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            הוסף תפקיד
          </button>
        </div>
      </section>

      <div className="space-y-4">
        {draft.map((slot, index) => (
          <section
            key={slot.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                {editingId === slot.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="input"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const name = editingName.trim();
                        if (!name) return;
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id ? { ...item, name } : item
                          )
                        );
                        setEditingId(null);
                      }}
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
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">
                      {slot.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(slot.id);
                        setEditingName(slot.name);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      מספר תקנים
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={slot.quantity}
                      onChange={(event) =>
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id
                              ? {
                                  ...item,
                                  quantity: Math.max(
                                    1,
                                    Math.min(20, Number(event.target.value) || 1)
                                  ),
                                }
                              : item
                          )
                        )
                      }
                      className="input"
                    />
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={slot.required}
                      onChange={(event) =>
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id
                              ? { ...item, required: event.target.checked }
                              : item
                          )
                        )
                      }
                    />
                    <span className="text-xs font-bold text-slate-700">
                      חובה למלא
                    </span>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(event) =>
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id
                              ? { ...item, enabled: event.target.checked }
                              : item
                          )
                        )
                      }
                    />
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-700">
                      {slot.enabled ? (
                        <Eye className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-400" />
                      )}
                      פעיל
                    </span>
                  </label>
                </div>

                <div className="mt-5">
                  <div className="mb-2 text-xs font-black text-slate-700">
                    תפקידי רפואה מותרים
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeMedicalRoles.map((role) => {
                      const checked = slot.allowedMedicalRoleIds.includes(role.id);
                      return (
                        <label
                          key={role.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
                            checked
                              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMedicalRole(slot.id, role.id)}
                          />
                          {role.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-xs font-black text-slate-700">
                    תפקידי מערכת מותרים
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SYSTEM_ROLE_OPTIONS.map((option) => {
                      const checked = slot.allowedSystemRoles.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
                            checked
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleSystemRole(slot.id, option.value)
                            }
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                  <div className="text-xs font-black text-slate-700">
                    משתמשים מורשים נוספים
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    בחירה אישית מאפשרת לשבץ משתמש בתפקיד זה גם אם תפקיד הרפואה שלו אינו מורשה.
                  </p>
                  <input
                    type="search"
                    value={userSearchBySlot[slot.id] || ""}
                    onChange={(event) =>
                      setUserSearchBySlot((current) => ({
                        ...current,
                        [slot.id]: event.target.value,
                      }))
                    }
                    placeholder="חיפוש לפי שם, תפקיד או יחידה"
                    className="input mt-3"
                  />
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-white p-2">
                    {[...users]
                      .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"))
                      .filter((user) => {
                        const search = (userSearchBySlot[slot.id] || "")
                          .trim()
                          .toLocaleLowerCase("he");
                        if (!search) {
                          return (slot.allowedUserIds || []).includes(user.userId);
                        }
                        return [user.fullName, user.medicalRole, user.unit]
                          .filter(Boolean)
                          .some((value) =>
                            String(value).toLocaleLowerCase("he").includes(search)
                          );
                      })
                      .map((user) => {
                        const checked = (slot.allowedUserIds || []).includes(user.userId);
                        const disabled = user.isDischarged && slot.allowDischargedUsers !== true;
                        return (
                          <label
                            key={user.userId}
                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                              checked
                                ? "border-amber-300 bg-amber-50"
                                : "border-slate-100 bg-white"
                            } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                          >
                            <span>
                              <span className="block font-black text-slate-800">
                                {user.fullName}
                              </span>
                              <span className="text-slate-500">
                                {[user.medicalRole, user.unit].filter(Boolean).join(" · ")}
                                {user.isDischarged ? " · נגרע" : ""}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleAllowedUser(slot.id, user.userId)}
                            />
                          </label>
                        );
                      })}
                    {!userSearchBySlot[slot.id] &&
                      (slot.allowedUserIds || []).length === 0 && (
                        <div className="px-2 py-3 text-center text-xs text-slate-400">
                          חפש משתמש כדי להוסיף אותו לתפקיד זה.
                        </div>
                      )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={slot.allowSystemUsers !== false}
                      onChange={(event) =>
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id
                              ? {
                                  ...item,
                                  allowSystemUsers: event.target.checked,
                                }
                              : item
                          )
                        )
                      }
                    />
                    <span className="text-xs font-bold text-slate-700">
                      אפשר משתמשי מערכת
                    </span>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={slot.allowExternalStaff === true}
                      onChange={(event) =>
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id
                              ? {
                                  ...item,
                                  allowExternalStaff: event.target.checked,
                                }
                              : item
                          )
                        )
                      }
                    />
                    <span className="text-xs font-bold text-slate-700">
                      אפשר אנשי צוות חיצוניים
                    </span>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={slot.allowDischargedUsers === true}
                      disabled={slot.allowSystemUsers === false}
                      onChange={(event) =>
                        updateDraft(
                          draft.map((item) =>
                            item.id === slot.id
                              ? {
                                  ...item,
                                  allowDischargedUsers: event.target.checked,
                                }
                              : item
                          )
                        )
                      }
                    />
                    <span className="text-xs font-bold text-slate-700">
                      אפשר גם משתמשים שמסומנים כנגרעו
                    </span>
                  </label>
                </div>

                {slot.allowExternalStaff === true && (
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-black text-slate-700">
                      סוגי אנשי צוות חיצוניים מותרים
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {externalStaffTypes.map((staffType) => {
                        const checked = (
                          slot.allowedExternalStaffTypes || []
                        ).includes(staffType);
                        return (
                          <label
                            key={staffType}
                            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
                              checked
                                ? "border-cyan-300 bg-cyan-50 text-cyan-800"
                                : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleExternalStaffType(slot.id, staffType)
                              }
                            />
                            {staffType}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-1">
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
                    if (!window.confirm(`למחוק את "${slot.name}"?`)) return;
                    updateDraft(draft.filter((item) => item.id !== slot.id));
                  }}
                  className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
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
        {saving ? "שומר..." : "שמור הגדרות תפקידי משמרת"}
      </button>
    </div>
  );
}
