import { Fragment, useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import {
  RolePermissionConfig,
  SystemRole,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";
import { PERMISSION_DEFINITIONS } from "../../security/permissions";

interface PermissionsManagerProps {
  currentUser: UserProfile;
}

const ROLE_LABELS: Record<SystemRole, string> = {
  super_admin: "מנהל אתר",
  admin: "מפקד פעיל",
  viewer: "שליש",
  reporter: "חייל מדווח",
};

const ROLE_ORDER: SystemRole[] = [
  "super_admin",
  "admin",
  "viewer",
  "reporter",
];

export default function PermissionsManager({
  currentUser,
}: PermissionsManagerProps) {
  const [configs, setConfigs] = useState<RolePermissionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const loaded = await dataService.getRolePermissionConfigs();
        if (active) setConfigs(loaded);
      } catch (err) {
        console.error(err);
        if (active) setError("טעינת ההרשאות נכשלה");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const result: Record<string, typeof PERMISSION_DEFINITIONS[number][]> = {};

    PERMISSION_DEFINITIONS.forEach((permission) => {
      const category = permission.category || "כללי";
      if (!result[category]) result[category] = [];
      result[category].push(permission);
    });

    return result;
  }, []);

  const isChecked = (role: SystemRole, permissionId: string) =>
    configs.find((config) => config.systemRole === role)?.permissions[
      permissionId
    ] === true;

  const togglePermission = (
    role: SystemRole,
    permissionId: string,
    checked: boolean
  ) => {
    if (role === "super_admin") return;

    setConfigs((current) =>
      current.map((config) =>
        config.systemRole === role
          ? {
              ...config,
              permissions: {
                ...config.permissions,
                [permissionId]: checked,
              },
            }
          : config
      )
    );

    setMessage("");
    setError("");
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage("");
      setError("");

      const saved = await dataService.saveRolePermissionConfigs(
        configs,
        currentUser.userId
      );

      setConfigs(saved);
      setMessage("ההרשאות נשמרו בהצלחה");
    } catch (err) {
      console.error(err);
      setError("שמירת ההרשאות נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">
        טוען הרשאות...
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
              <ShieldCheck className="h-5 w-5 text-rose-600" />
              הרשאות לפי תפקיד
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              השינויים נשמרים ב־Firestore וישמשו את כל המערכת לאחר חיבור מנגנון ההרשאות למסכים.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "שומר..." : "שמור הרשאות"}
          </button>
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[900px] w-full border-collapse text-right text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky right-0 z-10 border-b border-l border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-700">
                הרשאה
              </th>
              {ROLE_ORDER.map((role) => (
                <th
                  key={role}
                  className="border-b border-l border-slate-200 px-4 py-3 text-center font-black text-slate-700"
                >
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {Object.entries(categories).map(([category, permissions]) => (
              <Fragment key={category}>
                <tr key={`${category}-title`}>
                  <td
                    colSpan={ROLE_ORDER.length + 1}
                    className="border-b border-slate-200 bg-slate-100 px-4 py-2 font-black text-slate-700"
                  >
                    {category}
                  </td>
                </tr>

                {permissions.map((permission) => (
                  <tr key={permission.id} className="hover:bg-slate-50/70">
                    <td className="sticky right-0 border-b border-l border-slate-100 bg-white px-4 py-3 font-bold text-slate-700">
                      {permission.label}
                    </td>

                    {ROLE_ORDER.map((role) => (
                      <td
                        key={`${permission.id}-${role}`}
                        className="border-b border-l border-slate-100 px-4 py-3 text-center"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked(role, permission.id)}
                          disabled={role === "super_admin"}
                          onChange={(event) =>
                            togglePermission(
                              role,
                              permission.id,
                              event.target.checked
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
