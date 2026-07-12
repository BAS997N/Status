import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit2,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { ShiftAssignment, ShiftRecord, UserProfile } from "../types";
import { dataService } from "../services/dataService";

interface ShiftsViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  canManage: boolean;
}

type ShiftSlotId =
  | "duty_commander"
  | "event_manager"
  | "matab"
  | "medic_1"
  | "medic_2"
  | "outpost_medic";

interface ShiftSlotDefinition {
  id: ShiftSlotId;
  label: string;
  description: string;
  isUserAllowed: (user: UserProfile) => boolean;
}

const normalize = (value = "") =>
  value
    .replace(/[״"׳']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("he");

const includesAny = (value: string | undefined, options: string[]) => {
  const normalized = normalize(value);
  return options.some((option) => normalized.includes(normalize(option)));
};

const isMedic = (user: UserProfile) =>
  includesAny(user.medicalRole, ["חובש"]);

const isDoctorOrParamedic = (user: UserProfile) =>
  includesAny(user.medicalRole, ["רופא", "פרמדיק", "פארמדיק"]);

const isEventManager = (user: UserProfile) =>
  includesAny(user.medicalRole, ["מנהל אירוע"]);

const isCommander = (user: UserProfile) =>
  user.role === "commander" ||
  user.systemRole === "admin" ||
  user.systemRole === "super_admin" ||
  includesAny(user.medicalRole, [
    'מ"פ רפואה',
    "מפ רפואה",
    "מפקד רפואה",
    "מפקד",
  ]);

const SHIFT_SLOTS: ShiftSlotDefinition[] = [
  {
    id: "duty_commander",
    label: "מפקד תורן",
    description: 'מוצגים מפקדים ומ"פ רפואה בלבד.',
    isUserAllowed: isCommander,
  },
  {
    id: "event_manager",
    label: "מנהל אירוע",
    description: "מוצגים רק בעלי תפקיד מנהל אירוע.",
    isUserAllowed: isEventManager,
  },
  {
    id: "matab",
    label: 'מט"ב',
    description: "מוצגים רופאים ופרמדיקים בלבד.",
    isUserAllowed: isDoctorOrParamedic,
  },
  {
    id: "medic_1",
    label: "חובש",
    description: "מוצגים חובשים בלבד.",
    isUserAllowed: isMedic,
  },
  {
    id: "medic_2",
    label: "חובש",
    description: "מוצגים חובשים בלבד.",
    isUserAllowed: isMedic,
  },
  {
    id: "outpost_medic",
    label: "חובש מוצב",
    description: "מוצגים חובשים בלבד.",
    isUserAllowed: isMedic,
  },
];

const EMPTY_SLOT_ASSIGNMENTS: Record<ShiftSlotId, string> = {
  duty_commander: "",
  event_manager: "",
  matab: "",
  medic_1: "",
  medic_2: "",
  outpost_medic: "",
};

const toInputDateTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("he-IL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const getAssignmentForSlot = (
  shift: ShiftRecord,
  slot: ShiftSlotDefinition,
  slotIndex: number
) =>
  shift.assignments.find((assignment) => assignment.slotId === slot.id) ||
  shift.assignments[slotIndex];

export default function ShiftsView({
  currentUser,
  allUsers,
  canManage,
}: ShiftsViewProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [shiftType, setShiftType] = useState("משמרת");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [slotAssignments, setSlotAssignments] =
    useState<Record<ShiftSlotId, string>>(EMPTY_SLOT_ASSIGNMENTS);

  const loadShifts = async () => {
    setLoading(true);
    try {
      setShifts(await dataService.getShifts());
    } catch (error) {
      console.error("Failed loading shifts:", error);
      setMessage({ type: "error", text: "טעינת המשמרות נכשלה." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const activeUsers = useMemo(
    () =>
      allUsers
        .filter((user) => !user.isDischarged)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "he")),
    [allUsers]
  );

  const visibleShifts = useMemo(() => {
    const now = Date.now();
    const normalizedSearch = search.trim().toLocaleLowerCase("he");

    return shifts
      .filter((shift) =>
        canManage
          ? true
          : shift.assignments.some(
              (assignment) => assignment.userId === currentUser.userId
            )
      )
      .filter((shift) => showPast || new Date(shift.endAt).getTime() >= now)
      .filter((shift) => {
        if (!normalizedSearch) return true;
        return [
          shift.title,
          shift.shiftType,
          shift.location,
          shift.note,
          ...shift.assignments.map((assignment) => assignment.userName),
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("he").includes(normalizedSearch)
          );
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [shifts, canManage, currentUser.userId, showPast, search]);

  const resetForm = () => {
    setEditingShift(null);
    setTitle("");
    setShiftType("משמרת");
    setStartAt("");
    setEndAt("");
    setLocation("");
    setNote("");
    setSlotAssignments({ ...EMPTY_SLOT_ASSIGNMENTS });
    setMessage(null);
  };

  const openNew = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (shift: ShiftRecord) => {
    const nextAssignments = { ...EMPTY_SLOT_ASSIGNMENTS };

    SHIFT_SLOTS.forEach((slot, index) => {
      const assignment = getAssignmentForSlot(shift, slot, index);
      nextAssignments[slot.id] = assignment?.userId || "";
    });

    setEditingShift(shift);
    setTitle(shift.title);
    setShiftType(shift.shiftType);
    setStartAt(toInputDateTime(shift.startAt));
    setEndAt(toInputDateTime(shift.endAt));
    setLocation(shift.location || "");
    setNote(shift.note || "");
    setSlotAssignments(nextAssignments);
    setIsFormOpen(true);
    setMessage(null);
  };

  const updateSlotAssignment = (slotId: ShiftSlotId, userId: string) => {
    setSlotAssignments((current) => ({ ...current, [slotId]: userId }));
    setMessage(null);
  };

  const saveShift = async () => {
    setMessage(null);

    if (!title.trim() || !startAt || !endAt) {
      setMessage({
        type: "error",
        text: "יש להזין שם, שעת התחלה ושעת סיום.",
      });
      return;
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setMessage({
        type: "error",
        text: "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.",
      });
      return;
    }

    const missingSlots = SHIFT_SLOTS.filter(
      (slot) => !slotAssignments[slot.id]
    );
    if (missingSlots.length > 0) {
      setMessage({
        type: "error",
        text: `יש לבחור חייל עבור: ${missingSlots
          .map((slot) => slot.label)
          .join(", ")}.`,
      });
      return;
    }

    const selectedIds = Object.values(slotAssignments).filter(Boolean);
    const duplicateUserId = selectedIds.find(
      (userId, index) => selectedIds.indexOf(userId) !== index
    );
    if (duplicateUserId) {
      const duplicateUser = activeUsers.find(
        (user) => user.userId === duplicateUserId
      );
      setMessage({
        type: "error",
        text: `${duplicateUser?.fullName || "אותו חייל"} נבחר ליותר מתפקיד אחד.`,
      });
      return;
    }

    const assignments: ShiftAssignment[] = SHIFT_SLOTS.map((slot) => {
      const user = activeUsers.find(
        (candidate) => candidate.userId === slotAssignments[slot.id]
      );
      if (!user) {
        throw new Error(`לא נמצא משתמש עבור ${slot.label}`);
      }

      const previous = editingShift?.assignments.find(
        (assignment) =>
          assignment.slotId === slot.id || assignment.userId === user.userId
      );

      return {
        slotId: slot.id,
        slotLabel: slot.label,
        userId: user.userId,
        userName: user.fullName,
        personalId: user.personalId,
        unit: user.unit,
        medicalRole: user.medicalRole,
        readStatus: previous?.readStatus || "unread",
        readAt: previous?.readAt,
      };
    });

    setSaving(true);
    try {
      if (editingShift) {
        await dataService.updateShift(
          editingShift.shiftId,
          {
            title: title.trim(),
            shiftType: shiftType.trim() || "משמרת",
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
            location: location.trim(),
            note: note.trim(),
            assignments,
          },
          currentUser
        );
      } else {
        await dataService.createShift(
          {
            title: title.trim(),
            shiftType: shiftType.trim() || "משמרת",
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
            location: location.trim(),
            note: note.trim(),
            status: "scheduled",
            assignments,
            createdBy: currentUser.userId,
            createdByName: currentUser.fullName,
          },
          currentUser
        );
      }

      await loadShifts();
      setIsFormOpen(false);
      resetForm();
      setMessage({ type: "success", text: "המשמרת נשמרה בהצלחה." });
    } catch (error) {
      console.error("Failed saving shift:", error);
      setMessage({ type: "error", text: "שמירת המשמרת נכשלה." });
    } finally {
      setSaving(false);
    }
  };

  const deleteShift = async (shift: ShiftRecord) => {
    if (!window.confirm(`למחוק את המשמרת "${shift.title}"?`)) return;
    try {
      await dataService.deleteShift(shift.shiftId);
      await loadShifts();
      setMessage({ type: "success", text: "המשמרת נמחקה." });
    } catch (error) {
      console.error("Failed deleting shift:", error);
      setMessage({ type: "error", text: "מחיקת המשמרת נכשלה." });
    }
  };

  const markRead = async (shift: ShiftRecord) => {
    try {
      await dataService.markShiftAsRead(
        shift.shiftId,
        currentUser.userId,
        currentUser
      );
      await loadShifts();
      setMessage({ type: "success", text: "המשמרת סומנה כנקראה." });
    } catch (error) {
      console.error("Failed marking shift as read:", error);
      setMessage({ type: "error", text: "עדכון סטטוס הקריאה נכשל." });
    }
  };

  return (
    <section dir="rtl" className="space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {canManage ? "ניהול משמרות" : "המשמרות שלי"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {canManage
                  ? "שיבוץ תפקידים קבועים לפי הכשרת החייל ותפקידו במערכת."
                  : "צפייה בתפקיד שנקבע עבורך ואישור שקראת את המשמרת."}
              </p>
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              משמרת חדשה
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש לפי שם, מיקום או חייל..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-xs outline-none focus:border-indigo-400"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(event) => setShowPast(event.target.checked)}
          />
          הצג משמרות שעברו
        </label>
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

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          טוען משמרות...
        </div>
      ) : visibleShifts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 text-sm font-black text-slate-700">
            אין משמרות להצגה
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleShifts.map((shift) => {
            const myAssignment = shift.assignments.find(
              (assignment) => assignment.userId === currentUser.userId
            );

            return (
              <article
                key={shift.shiftId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-slate-900">
                      {shift.title}
                    </div>
                    <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                      {shift.shiftType}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(shift)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
                        title="עריכה"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteShift(shift)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                        title="מחיקה"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-indigo-500" />
                    <span>
                      {formatDateTime(shift.startAt)} —{" "}
                      {formatDateTime(shift.endAt)}
                    </span>
                  </div>

                  {shift.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-rose-500" />
                      <span>{shift.location}</span>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center gap-2 font-black text-slate-700">
                      <Users className="h-4 w-4 text-sky-500" />
                      שיבוץ המשמרת
                    </div>
                    <div className="space-y-2">
                      {SHIFT_SLOTS.map((slot, index) => {
                        const assignment = getAssignmentForSlot(
                          shift,
                          slot,
                          index
                        );
                        return (
                          <div
                            key={slot.id}
                            className={`flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ${
                              assignment?.userId === currentUser.userId
                                ? "ring-1 ring-indigo-300"
                                : ""
                            }`}
                          >
                            <span className="font-bold text-slate-600">
                              {slot.label}:
                            </span>
                            <span className="text-left font-black text-slate-900">
                              {assignment?.userName || "לא שובץ"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {shift.note && (
                    <div className="rounded-lg bg-slate-50 p-3 leading-5 text-slate-600">
                      {shift.note}
                    </div>
                  )}
                </div>

                {!canManage && myAssignment && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="mb-3 text-xs font-black text-indigo-700">
                      התפקיד שלך:{" "}
                      {myAssignment.slotLabel || "משובץ למשמרת"}
                    </div>
                    {myAssignment.readStatus === "read" ? (
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        נקרא ואושר
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markRead(shift)}
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                      >
                        <UserRoundCheck className="h-4 w-4" />
                        אישור שקראתי
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">
                {editingShift ? "עריכת משמרת" : "יצירת משמרת"}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="שם המשמרת">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="סוג משמרת">
                <input
                  value={shiftType}
                  onChange={(event) => setShiftType(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="התחלה">
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="סיום">
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="מיקום">
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="הערה">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="input resize-y"
                />
              </Field>
            </div>

            <div className="mt-6">
              <div className="mb-3 text-sm font-black text-slate-900">
                שיבוץ בעלי תפקידים
              </div>

              <div className="space-y-3">
                {SHIFT_SLOTS.map((slot) => {
                  const availableUsers = activeUsers.filter(slot.isUserAllowed);

                  return (
                    <div
                      key={slot.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr] md:items-center">
                        <div>
                          <div className="text-xs font-black text-slate-800">
                            {slot.label}
                          </div>
                          <div className="mt-1 text-[10px] leading-4 text-slate-500">
                            {slot.description}
                          </div>
                        </div>

                        <select
                          value={slotAssignments[slot.id]}
                          onChange={(event) =>
                            updateSlotAssignment(slot.id, event.target.value)
                          }
                          className="input"
                        >
                          <option value="">בחר חייל...</option>
                          {availableUsers.map((user) => (
                            <option key={user.userId} value={user.userId}>
                              {user.fullName}
                              {user.medicalRole
                                ? ` — ${user.medicalRole}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {availableUsers.length === 0 && (
                        <div className="mt-2 text-[10px] font-bold text-rose-600">
                          לא נמצאו משתמשים מתאימים. בדוק שתפקיד הרפואה שלהם
                          מוגדר נכון בספר הטלפונים.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {message?.type === "error" && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                {message.text}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveShift}
                disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "שומר..." : "שמור משמרת"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
