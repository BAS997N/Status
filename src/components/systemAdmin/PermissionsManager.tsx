import { Fragment, useEffect, useMemo, useState } from "react";
import { Eraser, Save, ShieldCheck } from "lucide-react";
import {
  RolePermissionConfig,
  SystemRole,
  SystemRoleConfig,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";
import { PERMISSION_DEFINITIONS } from "../../security/permissions";

interface PermissionsManagerProps {
  currentUser: UserProfile;
}

export default function PermissionsManager({
  currentUser,
}: PermissionsManagerProps) {
  const [configs, setConfigs] = useState<RolePermissionConfig[]>([]);
  const [roles, setRoles] = useState<SystemRoleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const [loaded, loadedRoles] = await Promise.all([
          dataService.getRolePermissionConfigs(true),
          dataService.getSystemRoleConfigs(true),
        ]);

        if (active) {
          const activeRoles = loadedRoles
            .filter((role) => role.enabled)
            .sort((a, b) => a.sortOrder - b.sortOrder);

          const configByRole = new Map(
            loaded.map((config) => [String(config.systemRole), config])
          );

          setRoles(activeRoles);
          setConfigs(
            activeRoles.map((role) => ({
              systemRole: role.id,
              permissions: {
                ...(configByRole.get(role.id)?.permissions || {}),
              },
              updatedAt: configByRole.get(role.id)?.updatedAt,
              updatedBy: configByRole.get(role.id)?.updatedBy,
            }))
          );
        }
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
    role === "super_admin" ||
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

  const clearRolePermissions = (role: SystemRole) => {
    if (role === "super_admin") return;

    setConfigs((current) =>
      current.map((config) =>
        config.systemRole === role
          ? {
              ...config,
              permissions: Object.fromEntries(
                PERMISSION_DEFINITIONS.map((permission) => [
                  permission.id,
                  false,
                ])
              ),
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

      const normalizedConfigs = configs.map((config) =>
        config.systemRole === "super_admin"
          ? {
              ...config,
              permissions: Object.fromEntries(
                PERMISSION_DEFINITIONS.map((permission) => [
                  permission.id,
                  true,
                ])
              ),
            }
          : config
      );

      const saved = await dataService.saveRolePermissionConfigs(
        normalizedConfigs,
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
    <div className="min-w-0 space-y-4" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
              <ShieldCheck className="h-5 w-5 text-rose-600" />
              הרשאות לפי תפקיד
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              כל תפקיד קיים או חדש מקבל עמודת הרשאות משלו. תפקיד מנהל האתר נשאר מוגן.
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

      <div className="custom-scrollbar max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[900px] w-full border-collapse text-right text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky right-0 z-10 border-b border-l border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-700">
                הרשאה
              </th>
              {roles.map((roleConfig) => {
                const role = roleConfig.id;
                return (
                <th
                  key={role}
                  className="border-b border-l border-slate-200 px-3 py-3 text-center font-black text-slate-700"
                >
                  <div className="flex min-w-[120px] flex-col items-center gap-2">
                    <span>{roleConfig.name}</span>
                    {role !== "super_admin" && (
                      <button
                        type="button"
                        onClick={() => clearRolePermissions(role)}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={`נקה את כל ההרשאות של ${roleConfig.name}`}
                      >
                        <Eraser className="h-3.5 w-3.5" />
                        נקה הכול
                      </button>
                    )}
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {Object.entries(categories).map(([category, permissions]) => (
              <Fragment key={category}>
                <tr key={`${category}-title`}>
                  <td
                    colSpan={roles.length + 1}
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

                    {roles.map((roleConfig) => {
                      const role = roleConfig.id;
                      return (
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
                      );
                    })}
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
