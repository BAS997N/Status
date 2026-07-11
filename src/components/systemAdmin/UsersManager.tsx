import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { SystemRole, UserProfile } from "../../types";

interface UsersManagerProps {
  currentUser: UserProfile;
  users: UserProfile[];
  onUpdateSystemRole: (
    userId: string,
    systemRole: SystemRole
  ) => Promise<void>;
}

const SYSTEM_ROLE_OPTIONS: Array<{
  value: SystemRole;
  label: string;
  description: string;
}> = [
  {
    value: "super_admin",
    label: "מנהל אתר — סופר אדמין",
    description: "גישה מלאה לניהול המערכת, ההרשאות וההגדרות.",
  },
  {
    value: "admin",
    label: "מפקד פעיל — אדמין",
    description: "ניהול שוטף של חיילים, דיווחים ולוח הבקרה.",
  },
  {
    value: "viewer",
    label: "שליש — צפייה בנתונים",
    description: "צפייה בלבד ללא עריכה, מחיקה או איפוס.",
  },
  {
    value: "reporter",
    label: "חייל — דיווח בלבד",
    description: "גישה למסך הדיווח האישי בלבד.",
  },
];

const getDefaultSystemRole = (user: UserProfile): SystemRole => {
  if (user.systemRole) return user.systemRole;
  if (user.role === "commander") return "admin";
  if (user.role === "adjutant_officer") return "viewer";
  return "reporter";
};

export default function UsersManager({
  currentUser,
  users,
  onUpdateSystemRole,
}: UsersManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [draftRoles, setDraftRoles] = useState<Record<string, SystemRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return [...users]
      .filter((user) => {
        if (!normalizedSearch) return true;

        return [
          user.fullName,
          user.personalId,
          user.medicalRole,
          user.unit,
        ].some((value) =>
          String(value || "").toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  }, [searchTerm, users]);

  const handleRoleChange = (userId: string, role: SystemRole) => {
    setDraftRoles((current) => ({ ...current, [userId]: role }));
    setMessage(null);
  };

  const handleSave = async (user: UserProfile) => {
    const currentRole = getDefaultSystemRole(user);
    const nextRole = draftRoles[user.userId] || currentRole;

    if (user.userId === currentUser.userId && nextRole !== "super_admin") {
      setMessage({
        type: "error",
        text: "לא ניתן להסיר מעצמך את הרשאת הסופר־אדמין מתוך המסך הזה.",
      });
      return;
    }

    if (nextRole === currentRole) {
      setMessage({ type: "success", text: "לא בוצע שינוי בהרשאה." });
      return;
    }

    setSavingUserId(user.userId);
    setMessage(null);

    try {
      await onUpdateSystemRole(user.userId, nextRole);
      setDraftRoles((current) => {
        const next = { ...current };
        delete next[user.userId];
        return next;
      });
      setMessage({
        type: "success",
        text: `ההרשאה של ${user.fullName} עודכנה בהצלחה.`,
      });
    } catch (error) {
      console.error("Failed updating system role:", error);
      setMessage({
        type: "error",
        text: "שמירת ההרשאה נכשלה. בדוק את הרשאות Firestore ונסה שוב.",
      });
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-rose-600" />
              <h2 className="text-base font-black text-slate-900">
                משתמשים והרשאות מערכת
              </h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              התפקיד הצבאי נשאר ללא שינוי. כאן מגדירים רק את רמת הגישה למערכת.
            </p>
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="חיפוש לפי שם, מספר אישי, תפקיד או שיוך"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-10 pl-3 text-xs font-medium outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            />
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-black">משתמש</th>
                <th className="px-4 py-3 font-black">תפקיד צבאי</th>
                <th className="px-4 py-3 font-black">הרשאת מערכת</th>
                <th className="px-4 py-3 font-black">פעולה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => {
                const savedRole = getDefaultSystemRole(user);
                const selectedRole = draftRoles[user.userId] || savedRole;
                const hasChanges = selectedRole !== savedRole;
                const isCurrentUser = user.userId === currentUser.userId;

                return (
                  <tr key={user.userId} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-800">
                        {user.fullName}
                        {isCurrentUser && (
                          <span className="mr-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">
                            המשתמש שלך
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {user.personalId || "ללא מספר אישי"} · {user.medicalRole || "ללא תפקיד רפואי"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {user.unit || "ללא שיוך"}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-600">
                      {user.role === "commander"
                        ? "מפקד/ת"
                        : user.role === "adjutant_officer"
                        ? "שליש / צפייה"
                        : "חייל/ת"}
                    </td>
                    <td className="min-w-[280px] px-4 py-4">
                      <select
                        value={selectedRole}
                        onChange={(event) =>
                          handleRoleChange(
                            user.userId,
                            event.target.value as SystemRole
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      >
                        {SYSTEM_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                        {
                          SYSTEM_ROLE_OPTIONS.find(
                            (option) => option.value === selectedRole
                          )?.description
                        }
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => handleSave(user)}
                        disabled={!hasChanges || savingUserId === user.userId}
                        className={`inline-flex min-w-24 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${
                          hasChanges
                            ? "bg-rose-600 text-white hover:bg-rose-700"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                        }`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {savingUserId === user.userId ? "שומר..." : "שמור"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-10 text-center text-xs font-bold text-slate-400">
            לא נמצאו משתמשים התואמים לחיפוש.
          </div>
        )}
      </div>
    </div>
  );
}
