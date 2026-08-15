import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  PencilLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import {
  SystemRole,
  SystemRoleConfig,
  SystemRoleAccessLevel,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";
import { updateUserCredentials } from "../../services/adminUserService";
import { appDialog } from "../AppDialogProvider";

interface UsersManagerProps {
  currentUser: UserProfile;
  users: UserProfile[];
  onUpdateSystemRole: (
    userId: string,
    systemRole: SystemRole,
    accessLevel?: SystemRoleAccessLevel
  ) => Promise<void>;
  onCredentialsUpdated?: (userId: string, personalId: string) => void;
}

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
  onCredentialsUpdated,
}: UsersManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleOptions, setRoleOptions] = useState<SystemRoleConfig[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, SystemRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [credentialUser, setCredentialUser] = useState<UserProfile | null>(null);
  const [credentialPersonalId, setCredentialPersonalId] = useState("");
  const [credentialCode, setCredentialCode] = useState("");
  const [credentialCodeConfirm, setCredentialCodeConfirm] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    dataService
      .getSystemRoleConfigs(true)
      .then((roles) =>
        setRoleOptions(
          roles
            .filter((role) => role.enabled)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        )
      )
      .catch((error) =>
        console.error("Failed loading system role options:", error)
      );
  }, []);

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
      const selectedConfig = roleOptions.find(
        (role) => role.id === nextRole
      );
      await onUpdateSystemRole(
        user.userId,
        nextRole,
        selectedConfig?.accessLevel
      );
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

  const openCredentialEditor = (user: UserProfile) => {
    setCredentialUser(user);
    setCredentialPersonalId(String(user.personalId || ""));
    setCredentialCode("");
    setCredentialCodeConfirm("");
    setMessage(null);
  };

  const closeCredentialEditor = () => {
    if (savingCredentials) return;
    setCredentialUser(null);
    setCredentialCode("");
    setCredentialCodeConfirm("");
  };

  const handleCredentialSave = async () => {
    if (!credentialUser) return;
    const cleanPersonalId = credentialPersonalId.trim();
    const cleanCode = credentialCode.trim();
    const personalIdChanged =
      cleanPersonalId !== String(credentialUser.personalId || "").trim();

    if (!/^\d{5,10}$/.test(cleanPersonalId)) {
      setMessage({
        type: "error",
        text: "מספר אישי חייב להכיל 5 עד 10 ספרות.",
      });
      return;
    }
    if (cleanCode && !/^\d{6}$/.test(cleanCode)) {
      setMessage({ type: "error", text: "הקוד החדש חייב להכיל 6 ספרות." });
      return;
    }
    if (cleanCode && cleanCode !== credentialCodeConfirm.trim()) {
      setMessage({ type: "error", text: "אימות הקוד החדש אינו תואם." });
      return;
    }
    const changeDescription = [
      personalIdChanged ? `מספר אישי חדש: ${cleanPersonalId}` : "",
      !personalIdChanged ? `סנכרון ההתחברות למספר ${cleanPersonalId}` : "",
      cleanCode ? "איפוס הקוד האישי" : "",
    ]
      .filter(Boolean)
      .join(" ו־");
    if (
      !(await appDialog.confirm(
        `לעדכן את פרטי ההתחברות של ${credentialUser.fullName}?\n${changeDescription}`,
        { title: "עדכון פרטי התחברות", confirmLabel: "עדכן פרטים", tone: "warning" }
      ))
    ) {
      return;
    }

    setSavingCredentials(true);
    setMessage(null);
    try {
      const result = await updateUserCredentials({
        targetUserId: credentialUser.userId,
        // Always send the displayed personal ID. This also repairs accounts whose
        // Firestore personalId was edited without updating the Firebase Auth email.
        newPersonalId: cleanPersonalId,
        newCode: cleanCode || undefined,
      });
      if (!result.authEmailSynced) {
        throw new Error(
          "הסנכרון לא הושלם. יש לפרסם את הגרסה החדשה של Cloudflare Worker ולנסות שוב."
        );
      }
      onCredentialsUpdated?.(credentialUser.userId, result.personalId);
      setCredentialUser(null);
      setCredentialCode("");
      setCredentialCodeConfirm("");
      setMessage({
        type: "success",
        text: `פרטי ההתחברות של ${credentialUser.fullName} עודכנו בהצלחה. המשתמש ייכנס מחדש עם הפרטים המעודכנים.`,
      });
    } catch (error) {
      console.error("Failed updating user credentials:", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "עדכון פרטי ההתחברות נכשל.",
      });
    } finally {
      setSavingCredentials(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
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
        <div className="custom-scrollbar max-w-full overflow-x-auto">
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
                        {roleOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                        {
                          roleOptions.find(
                            (option) => option.id === selectedRole
                          )?.description
                        }
                      </p>
                    </td>
                    <td className="min-w-[190px] px-4 py-4">
                      <div className="flex flex-wrap gap-2">
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
                      <button
                        type="button"
                        onClick={() => openCredentialEditor(user)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                      >
                        <KeyRound className="h-4 w-4" />
                        פרטי התחברות
                      </button>
                      </div>
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

      {credentialUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCredentialEditor();
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <PencilLine className="h-5 w-5 text-blue-600" />
                  <h3 className="text-base font-black text-slate-900">
                    פרטי ההתחברות של {credentialUser.fullName}
                  </h3>
                </div>
                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                  ניתן לתקן מספר אישי, לאפס קוד, או לסנכרן מחדש חשבון שלא מצליח להתחבר.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCredentialEditor}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="סגירה"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black text-slate-700">
                  מספר אישי
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={credentialPersonalId}
                  onChange={(event) =>
                    setCredentialPersonalId(
                      event.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black text-slate-700">
                  קוד חדש בן 6 ספרות
                </span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={credentialCode}
                  onChange={(event) =>
                    setCredentialCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  placeholder="השאר ריק אם אין צורך באיפוס"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {credentialCode && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-slate-700">
                    אימות הקוד החדש
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={credentialCodeConfirm}
                    onChange={(event) =>
                      setCredentialCodeConfirm(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCredentialEditor}
                disabled={savingCredentials}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleCredentialSave}
                disabled={savingCredentials}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                {savingCredentials ? "מעדכן..." : "עדכן וסנכרן פרטי התחברות"}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
