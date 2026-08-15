import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  RolePermissionConfig,
  SystemRoleConfig,
  SystemRoleAccessLevel,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";
import { PERMISSION_DEFINITIONS } from "../../security/permissions";
import { appDialog } from "../AppDialogProvider";

interface Props {
  currentUser: UserProfile;
}

const createRoleId = (name: string) => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `custom_${normalized || Date.now()}`;
};

const ACCESS_OPTIONS: Array<{
  value: SystemRoleAccessLevel;
  label: string;
  description: string;
}> = [
  {
    value: "admin",
    label: "ניהולי",
    description: "מאפשר פעולות כתיבה ב־Firestore בהתאם להרשאות המסך.",
  },
  {
    value: "viewer",
    label: "צפייה",
    description: "מיועד לתפקידי צפייה ללא פעולות ניהול.",
  },
  {
    value: "reporter",
    label: "מדווח",
    description: "מיועד למשתמשים עם גישה מצומצמת.",
  },
];

export default function SystemRolesManager({ currentUser }: Props) {
  const [roles, setRoles] = useState<SystemRoleConfig[]>([]);
  const [permissions, setPermissions] = useState<RolePermissionConfig[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] =
    useState<SystemRoleAccessLevel>("viewer");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      dataService.getSystemRoleConfigs(true),
      dataService.getRolePermissionConfigs(true),
    ])
      .then(([loadedRoles, loadedPermissions]) => {
        setRoles(loadedRoles);
        setPermissions(loadedPermissions);
      })
      .catch((error) => {
        console.error(error);
        setMessage({
          type: "error",
          text: "טעינת תפקידי המערכת נכשלה.",
        });
      });
  }, []);

  const sorted = useMemo(
    () => [...roles].sort((a, b) => a.sortOrder - b.sortOrder),
    [roles]
  );

  const normalizeOrder = (values: SystemRoleConfig[]) =>
    values.map((role, index) => ({ ...role, sortOrder: index + 1 }));

  const addRole = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setMessage({ type: "error", text: "יש להזין שם לתפקיד החדש." });
      return;
    }

    let id = createRoleId(cleanName);
    let suffix = 2;
    while (roles.some((role) => role.id === id)) {
      id = `${createRoleId(cleanName)}_${suffix++}`;
    }

    const newRole: SystemRoleConfig = {
      id,
      name: cleanName,
      description: description.trim(),
      accessLevel,
      enabled: true,
      protected: false,
      sortOrder: roles.length + 1,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.userId,
    };

    setRoles((current) => normalizeOrder([...current, newRole]));

    const templateRole =
      accessLevel === "admin"
        ? "admin"
        : accessLevel === "viewer"
        ? "viewer"
        : "reporter";

    const templatePermissions =
      permissions.find((item) => item.systemRole === templateRole)
        ?.permissions || {};

    setPermissions((current) => [
      ...current,
      {
        systemRole: id,
        permissions: { ...templatePermissions },
      },
    ]);

    setName("");
    setDescription("");
    setAccessLevel("viewer");
    setMessage({
      type: "success",
      text: "התפקיד נוסף לטיוטה. לחץ על שמור שינויים.",
    });
  };

  const updateRole = (
    id: string,
    changes: Partial<SystemRoleConfig>
  ) => {
    setRoles((current) =>
      current.map((role) =>
        role.id === id ? { ...role, ...changes } : role
      )
    );
    setMessage(null);
  };

  const moveRole = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;

    const next = [...sorted];
    [next[index], next[target]] = [next[target], next[index]];
    setRoles(normalizeOrder(next));
  };

  const removeRole = async (role: SystemRoleConfig) => {
    if (role.protected) return;

    if (
      !(await appDialog.confirm(
        `למחוק את התפקיד "${role.name}"? משתמשים שכבר משויכים אליו לא יימחקו, אך יש לשייך להם תפקיד אחר.`,
        { title: "מחיקת תפקיד מערכת", confirmLabel: "מחק תפקיד", tone: "danger" }
      ))
    ) {
      return;
    }

    setRoles((current) =>
      normalizeOrder(current.filter((item) => item.id !== role.id))
    );
    setPermissions((current) =>
      current.filter((item) => item.systemRole !== role.id)
    );
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const savedRoles = await dataService.saveSystemRoleConfigs(
        roles,
        currentUser.userId
      );

      const activeRoleIds = new Set(savedRoles.map((role) => role.id));
      const permissionByRole = new Map(
        permissions.map((item) => [String(item.systemRole), item])
      );

      const savedPermissions = await dataService.saveRolePermissionConfigs(
        savedRoles.map((role) => ({
          systemRole: role.id,
          permissions: {
            ...Object.fromEntries(
              PERMISSION_DEFINITIONS.map((definition) => [
                definition.id,
                false,
              ])
            ),
            ...(permissionByRole.get(role.id)?.permissions || {}),
          },
        })),
        currentUser.userId
      );

      setRoles(savedRoles);
      setPermissions(
        savedPermissions.filter((item) =>
          activeRoleIds.has(item.systemRole)
        )
      );
      setMessage({
        type: "success",
        text: "תפקידי המערכת נשמרו. התפקידים הקיימים נשמרו ללא שינוי.",
      });
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "שמירת תפקידי המערכת נכשלה.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">
              תפקידי ניהול דינמיים
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              ארבעת התפקידים הקיימים מוגנים ולא ייפגעו. ניתן להוסיף
              תפקידים חדשים ולתת להם הרשאות במסך הרשאות לפי תפקיד.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr_180px_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="שם תפקיד, לדוגמה: מנהל משמרות"
            className="input"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="תיאור קצר"
            className="input"
          />
          <select
            value={accessLevel}
            onChange={(event) =>
              setAccessLevel(event.target.value as SystemRoleAccessLevel)
            }
            className="input"
          >
            {ACCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addRole}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white"
          >
            <Plus className="h-4 w-4" />
            הוסף
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((role, index) => (
          <div
            key={role.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr_180px_auto] lg:items-center">
              <div>
                <input
                  value={role.name}
                  disabled={role.protected}
                  onChange={(event) =>
                    updateRole(role.id, { name: event.target.value })
                  }
                  className="input disabled:bg-slate-100"
                />
                <div className="mt-1 text-[10px] text-slate-400">
                  מזהה: {role.id}
                </div>
              </div>

              <input
                value={role.description}
                onChange={(event) =>
                  updateRole(role.id, {
                    description: event.target.value,
                  })
                }
                className="input"
                placeholder="תיאור התפקיד"
              />

              <select
                value={role.accessLevel}
                disabled={role.id === "super_admin"}
                onChange={(event) =>
                  updateRole(role.id, {
                    accessLevel: event.target
                      .value as SystemRoleAccessLevel,
                  })
                }
                className="input disabled:bg-slate-100"
              >
                {ACCESS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveRole(index, -1)}
                  disabled={index === 0}
                  className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveRole(index, 1)}
                  disabled={index === sorted.length - 1}
                  className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>

                {role.protected ? (
                  <span
                    title="תפקיד מערכת מוגן"
                    className="rounded-lg border border-slate-200 p-2 text-slate-400"
                  >
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeRole(role)}
                    className="rounded-lg border border-rose-200 p-2 text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={role.enabled}
                onChange={(event) =>
                  updateRole(role.id, {
                    enabled: event.target.checked,
                  })
                }
              />
              תפקיד פעיל
            </label>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "שומר..." : "שמור שינויים"}
        </button>
      </div>
    </div>
  );
}
