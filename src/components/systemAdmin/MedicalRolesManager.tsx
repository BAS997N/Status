import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { MedicalRoleConfig, UserProfile } from "../../types";
import { dataService } from "../../services/dataService";

interface MedicalRolesManagerProps {
  currentUser: UserProfile;
  roles: MedicalRoleConfig[];
  onRolesChanged: (roles: MedicalRoleConfig[]) => void;
}

const createMedicalRoleId = () =>
  `medical_role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function MedicalRolesManager({
  currentUser,
  roles,
  onRolesChanged,
}: MedicalRolesManagerProps) {
  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.sortOrder - b.sortOrder),
    [roles]
  );

  const [draftRoles, setDraftRoles] = useState<MedicalRoleConfig[]>(sortedRoles);
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setDraftRoles(sortedRoles);
  }, [sortedRoles]);

  const normalizeOrder = (items: MedicalRoleConfig[]) =>
    items.map((role, index) => ({ ...role, sortOrder: index + 1 }));

  const updateDraft = (nextRoles: MedicalRoleConfig[]) => {
    setDraftRoles(normalizeOrder(nextRoles));
    setMessage(null);
  };

  const handleAddRole = () => {
    const name = newRoleName.trim();
    if (!name) return;

    const alreadyExists = draftRoles.some(
      (role) => role.name.trim().toLocaleLowerCase("he") === name.toLocaleLowerCase("he")
    );

    if (alreadyExists) {
      setMessage({ type: "error", text: "כבר קיים תפקיד בשם הזה." });
      return;
    }

    updateDraft([
      ...draftRoles,
      {
        id: createMedicalRoleId(),
        name,
        enabled: true,
        sortOrder: draftRoles.length + 1,
        createdAt: new Date().toISOString(),
        updatedBy: currentUser.userId,
      },
    ]);
    setNewRoleName("");
  };

  const handleStartEdit = (role: MedicalRoleConfig) => {
    setEditingRoleId(role.id);
    setEditingName(role.name);
    setMessage(null);
  };

  const handleSaveEdit = () => {
    if (!editingRoleId) return;
    const name = editingName.trim();
    if (!name) return;

    const duplicate = draftRoles.some(
      (role) =>
        role.id !== editingRoleId &&
        role.name.trim().toLocaleLowerCase("he") === name.toLocaleLowerCase("he")
    );

    if (duplicate) {
      setMessage({ type: "error", text: "כבר קיים תפקיד בשם הזה." });
      return;
    }

    updateDraft(
      draftRoles.map((role) =>
        role.id === editingRoleId
          ? {
              ...role,
              name,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.userId,
            }
          : role
      )
    );
    setEditingRoleId(null);
    setEditingName("");
  };

  const handleToggle = (roleId: string) => {
    const role = draftRoles.find((item) => item.id === roleId);
    if (!role) return;

    const enabledCount = draftRoles.filter((item) => item.enabled).length;
    if (role.enabled && enabledCount <= 1) {
      setMessage({
        type: "error",
        text: "חייב להישאר לפחות תפקיד פעיל אחד במערכת.",
      });
      return;
    }

    updateDraft(
      draftRoles.map((item) =>
        item.id === roleId ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const handleDelete = (role: MedicalRoleConfig) => {

    if (role.enabled && draftRoles.filter((item) => item.enabled).length <= 1) {
      setMessage({
        type: "error",
        text: "לא ניתן למחוק את התפקיד הפעיל האחרון.",
      });
      return;
    }

    updateDraft(draftRoles.filter((item) => item.id !== role.id));
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftRoles.length) return;

    const next = [...draftRoles];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateDraft(next);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const saved = await dataService.saveMedicalRoleConfigs(
        normalizeOrder(draftRoles),
        currentUser.userId
      );
      setDraftRoles(saved);
      onRolesChanged(saved);
      setMessage({ type: "success", text: "התפקידים נשמרו והתעדכנו במערכת." });
    } catch (error) {
      console.error("Failed saving roles:", error);
      setMessage({ type: "error", text: "שמירת התפקידים נכשלה. נסה שוב." });
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
              <BadgeCheck className="h-5 w-5 text-rose-600" />
              <h2 className="text-base font-black text-slate-900">ניהול תפקידי רפואה</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              התפקידים הפעילים יוצגו ברישום, בעריכת פרופיל ובמסכי הניהול.
              ניתן להוסיף, לשנות שם, להסתיר, למחוק ולשנות סדר.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
            <input
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddRole();
                }
              }}
              placeholder="שם תפקיד חדש"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
            <button
              type="button"
              onClick={handleAddRole}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              הוסף תפקיד
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
            {draftRoles.filter((role) => role.enabled).length} תפקידים פעילים מתוך {draftRoles.length}
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {draftRoles.map((role, index) => (
            <div
              key={role.id}
              className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                role.enabled ? "bg-white" : "bg-slate-50/80"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-600">
                  {index + 1}
                </div>

                {editingRoleId === role.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleSaveEdit();
                        if (event.key === "Escape") setEditingRoleId(null);
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
                      onClick={() => setEditingRoleId(null)}
                      className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
                      title="בטל"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`truncate text-sm font-black ${role.enabled ? "text-slate-800" : "text-slate-400"}`}>
                        {role.name}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          role.enabled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {role.enabled ? "פעיל" : "מוסתר"}
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
                  disabled={index === draftRoles.length - 1}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  title="העבר למטה"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStartEdit(role)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                  title="ערוך שם"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(role.id)}
                  className={`rounded-lg border p-2 transition ${
                    role.enabled
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                  title={role.enabled ? "הסתר תפקיד" : "הצג תפקיד"}
                >
                  {role.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(role)}
                  className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 transition hover:bg-rose-100"
                  title="מחק תפקיד"
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
            disabled={isSaving || draftRoles.length === 0}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "שומר תפקידים..." : "שמור את כל השינויים"}
          </button>
        </div>
      </div>
    </div>
  );
}
