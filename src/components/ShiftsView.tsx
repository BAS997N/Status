import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit2,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import {
  ExternalStaffMember,
  MedicalRoleConfig,
  ShiftAssignment,
  ShiftRecord,
  ShiftSlotConfig,
  ShiftTypeConfig,
  SystemRole,
  UserProfile,
} from "../types";
import { dataService } from "../services/dataService";

interface ShiftsViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  canManage: boolean;
  shiftSlotConfigs: ShiftSlotConfig[];
  medicalRoleConfigs: MedicalRoleConfig[];
  externalStaff: ExternalStaffMember[];
}

interface ExpandedSlot {
  key: string;
  configId: string;
  label: string;
  required: boolean;
  allowedMedicalRoleIds: string[];
  allowedSystemRoles: SystemRole[];
  allowSystemUsers: boolean;
  allowDischargedUsers: boolean;
  allowExternalStaff: boolean;
  allowedExternalStaffTypes: string[];
  index: number;
}

const toLocalParts = (value?: string) => {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localValue = new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);

  return {
    date: localValue.slice(0, 10),
    time: localValue.slice(11, 16),
  };
};

const getTodayInputDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 10);
};

const addDaysToInputDate = (value: string, days: number) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const combineDateAndTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00`).toISOString();

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("he-IL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const getSystemRole = (user: UserProfile): SystemRole => {
  if (user.systemRole) return user.systemRole;
  if (user.role === "commander") return "admin";
  if (user.role === "adjutant_officer") return "viewer";
  return "reporter";
};

export default function ShiftsView({
  currentUser,
  allUsers,
  canManage,
  shiftSlotConfigs,
  medicalRoleConfigs,
  externalStaff,
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

  const [shiftTypes, setShiftTypes] = useState<ShiftTypeConfig[]>([]);
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [shiftType, setShiftType] = useState("משמרת");
  const [startDate, setStartDate] = useState(getTodayInputDate());
  const [startTime, setStartTime] = useState("05:30");
  const [endDate, setEndDate] = useState(getTodayInputDate());
  const [endTime, setEndTime] = useState("18:30");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});

  const expandedSlots = useMemo<ExpandedSlot[]>(
    () =>
      shiftSlotConfigs
        .filter((config) => config.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((config) =>
          Array.from({ length: Math.max(1, config.quantity) }, (_, index) => ({
            key: `${config.id}_${index + 1}`,
            configId: config.id,
            label:
              config.quantity > 1 ? `${config.name} ${index + 1}` : config.name,
            required: config.required,
            allowedMedicalRoleIds: config.allowedMedicalRoleIds || [],
            allowedSystemRoles: config.allowedSystemRoles || [],
            allowSystemUsers: config.allowSystemUsers !== false,
            allowDischargedUsers: config.allowDischargedUsers === true,
            allowExternalStaff: config.allowExternalStaff === true,
            allowedExternalStaffTypes: config.allowedExternalStaffTypes || [],
            index,
          }))
        ),
    [shiftSlotConfigs]
  );

  const medicalRoleNameById = useMemo(
    () =>
      new Map(
        medicalRoleConfigs.map((role) => [
          role.id,
          role.name.trim().toLocaleLowerCase("he"),
        ])
      ),
    [medicalRoleConfigs]
  );

  const selectableUsers = useMemo(
    () =>
      [...allUsers].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "he")
      ),
    [allUsers]
  );

  const activeExternalStaff = useMemo(
    () =>
      externalStaff
        .filter((item) => item.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [externalStaff]
  );

  const isAllowedForSlot = (user: UserProfile, slot: ExpandedSlot) => {
    const medicalRoleName = (user.medicalRole || "")
      .trim()
      .toLocaleLowerCase("he");
    const medicalAllowed = slot.allowedMedicalRoleIds.some(
      (roleId) => medicalRoleNameById.get(roleId) === medicalRoleName
    );
    const systemAllowed = slot.allowedSystemRoles.includes(getSystemRole(user));
    return medicalAllowed || systemAllowed;
  };

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
    dataService
      .getShiftTypeConfigs()
      .then((items) =>
        setShiftTypes(
          [...items]
            .filter((item) => item.enabled)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        )
      )
      .catch((error) =>
        console.error("Failed loading shift types:", error)
      );
  }, []);

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

  const applyTimeRange = (
    nextStartTime: string,
    nextEndTime: string,
    crossesMidnight: boolean
  ) => {
    const baseDate = startDate || getTodayInputDate();
    setStartDate(baseDate);
    setStartTime(nextStartTime);
    setEndDate(addDaysToInputDate(baseDate, crossesMidnight ? 1 : 0));
    setEndTime(nextEndTime);
  };

  const handleShiftTypeSelection = (value: string) => {
    setSelectedShiftTypeId(value);

    if (value === "custom") {
      setTitle(customTitle.trim());
      setShiftType("אחר");
      return;
    }

    const selected = shiftTypes.find((item) => item.id === value);
    if (!selected) return;

    setTitle(selected.name);
    setShiftType(selected.name);
    setCustomTitle("");

    if (selected.defaultStartTime && selected.defaultEndTime) {
      applyTimeRange(
        selected.defaultStartTime,
        selected.defaultEndTime,
        selected.crossesMidnight === true
      );
    }
  };

  const resetForm = () => {
    setEditingShift(null);
    setSelectedShiftTypeId("");
    setTitle("");
    setCustomTitle("");
    setShiftType("משמרת");
    setStartDate(getTodayInputDate());
    setStartTime("05:30");
    setEndDate(getTodayInputDate());
    setEndTime("18:30");
    setLocation("");
    setNote("");
    setSlotAssignments({});
    setMessage(null);
  };

  const openNew = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (shift: ShiftRecord) => {
    const next: Record<string, string> = {};
    expandedSlots.forEach((slot, index) => {
      const assignment =
        shift.assignments.find((item) => item.slotId === slot.key) ||
        shift.assignments[index];
      next[slot.key] = assignment
        ? assignment.assigneeType === "external"
          ? `external:${assignment.externalStaffId || assignment.userId}`
          : `user:${assignment.userId}`
        : "";
    });
    const startParts = toLocalParts(shift.startAt);
    const endParts = toLocalParts(shift.endAt);
    const matchedType = shiftTypes.find(
      (item) =>
        item.name.trim().toLocaleLowerCase("he") ===
        shift.title.trim().toLocaleLowerCase("he")
    );

    setEditingShift(shift);
    setSelectedShiftTypeId(matchedType?.id || "custom");
    setTitle(shift.title);
    setCustomTitle(matchedType ? "" : shift.title);
    setShiftType(shift.shiftType);
    setStartDate(startParts.date);
    setStartTime(startParts.time);
    setEndDate(endParts.date);
    setEndTime(endParts.time);
    setLocation(shift.location || "");
    setNote(shift.note || "");
    setSlotAssignments(next);
    setIsFormOpen(true);
    setMessage(null);
  };

  const saveShift = async () => {
    setMessage(null);
    const resolvedTitle =
      selectedShiftTypeId === "custom" ? customTitle.trim() : title.trim();

    if (
      !resolvedTitle ||
      !startDate ||
      !startTime ||
      !endDate ||
      !endTime
    ) {
      setMessage({
        type: "error",
        text: "יש להזין שם, שעת התחלה ושעת סיום.",
      });
      return;
    }
    const startAt = combineDateAndTime(startDate, startTime);
    const endAt = combineDateAndTime(endDate, endTime);

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setMessage({
        type: "error",
        text: "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.",
      });
      return;
    }

    const missing = expandedSlots.filter(
      (slot) => slot.required && !slotAssignments[slot.key]
    );
    if (missing.length) {
      setMessage({
        type: "error",
        text: `יש לבחור חייל עבור: ${missing
          .map((slot) => slot.label)
          .join(", ")}.`,
      });
      return;
    }

    const selected = Object.values(slotAssignments).filter(Boolean);
    const duplicate = selected.find(
      (userId, index) => selected.indexOf(userId) !== index
    );
    if (duplicate) {
      const user = selectableUsers.find((item) => item.userId === duplicate);
      setMessage({
        type: "error",
        text: `${user?.fullName || "אותו חייל"} נבחר ליותר מתפקיד אחד.`,
      });
      return;
    }

    const assignments: ShiftAssignment[] = expandedSlots
      .filter((slot) => slotAssignments[slot.key])
      .map((slot) => {
        const selectedValue = slotAssignments[slot.key];

        if (selectedValue.startsWith("external:")) {
          const externalId = selectedValue.replace("external:", "");
          const person = activeExternalStaff.find(
            (item) => item.id === externalId
          );
          if (!person) throw new Error("איש צוות חיצוני לא נמצא");

          return {
            slotId: slot.key,
            slotLabel: slot.label,
            assigneeType: "external",
            externalStaffId: person.id,
            userId: `external:${person.id}`,
            userName: person.fullName,
            medicalRole: person.staffType,
            readStatus: "unread",
          };
        }

        const userId = selectedValue.replace("user:", "");
        const user = selectableUsers.find((item) => item.userId === userId);
        if (!user) throw new Error("משתמש לא נמצא");

        const previous = editingShift?.assignments.find(
          (item) => item.slotId === slot.key && item.userId === user.userId
        );

        return {
          slotId: slot.key,
          slotLabel: slot.label,
          assigneeType: "user",
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
      const values = {
        title: resolvedTitle,
        shiftType:
          selectedShiftTypeId === "custom"
            ? "אחר"
            : shiftType.trim() || resolvedTitle,
        startAt,
        endAt,
        location: location.trim(),
        note: note.trim(),
        assignments,
      };
      if (editingShift) {
        await dataService.updateShift(editingShift.shiftId, values, currentUser);
      } else {
        await dataService.createShift(
          {
            ...values,
            status: "scheduled",
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
    } catch {
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
    } catch {
      setMessage({ type: "error", text: "עדכון סטטוס הקריאה נכשל." });
    }
  };

  const shareShiftOnWhatsApp = (shift: ShiftRecord) => {
    const start = new Date(shift.startAt).toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const end = new Date(shift.endAt).toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const assignmentsText = shift.assignments
      .map(
        (assignment) =>
          `${assignment.slotLabel || "תפקיד"}: ${assignment.userName}`
      )
      .join("\n");

    const message = [
      `*${shift.title}*`,
      shift.shiftType ? `סוג: ${shift.shiftType}` : "",
      `התחלה: ${start}`,
      `סיום: ${end}`,
      shift.location ? `מיקום: ${shift.location}` : "",
      "",
      "*שיבוץ המשמרת:*",
      assignmentsText,
      shift.note ? `\nהערות: ${shift.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
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
                  ? "השיבוצים מסוננים לפי ההגדרות שנקבעו בניהול תפקידי משמרת."
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
              (item) => item.userId === currentUser.userId
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
                        onClick={() => shareShiftOnWhatsApp(shift)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                        title="שלח ב־WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
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
                      {shift.location}
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center gap-2 font-black text-slate-700">
                      <Users className="h-4 w-4 text-sky-500" />
                      שיבוץ המשמרת
                    </div>
                    <div className="space-y-2">
                      {shift.assignments.map((assignment) => (
                        <div
                          key={`${assignment.slotId}_${assignment.userId}`}
                          className={`flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ${
                            assignment.userId === currentUser.userId
                              ? "border border-indigo-300 bg-indigo-50"
                              : ""
                          }`}
                        >
                          <span className="font-bold text-slate-600">
                            {assignment.slotLabel || "תפקיד"}:
                          </span>
                          <span
                            className={
                              assignment.userId === currentUser.userId
                                ? "text-base font-black text-indigo-800 underline decoration-indigo-300 decoration-2 underline-offset-4"
                                : "font-bold text-slate-900"
                            }
                          >
                            {assignment.userName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {shift.note && (
                    <div className="rounded-lg bg-slate-50 p-3 leading-5">
                      {shift.note}
                    </div>
                  )}
                </div>

                {!canManage && myAssignment && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="mb-3 text-xs font-black text-indigo-700">
                      התפקיד שלך: {myAssignment.slotLabel || "משובץ למשמרת"}
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
                <select
                  value={selectedShiftTypeId}
                  onChange={(event) =>
                    handleShiftTypeSelection(event.target.value)
                  }
                  className="input"
                >
                  <option value="">בחר שם משמרת...</option>
                  {shiftTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  <option value="custom">אחר — הזנה ידנית</option>
                </select>
              </Field>

              {selectedShiftTypeId === "custom" ? (
                <Field label="שם משמרת ידני">
                  <input
                    value={customTitle}
                    onChange={(event) => {
                      setCustomTitle(event.target.value);
                      setTitle(event.target.value);
                    }}
                    placeholder="הקלד שם משמרת"
                    className="input"
                  />
                </Field>
              ) : (
                <Field label="שעות בחירה מהירה">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        applyTimeRange("05:30", "18:30", false)
                      }
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-100"
                    >
                      05:30–18:30
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyTimeRange("18:30", "05:30", true)
                      }
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-black text-indigo-800 hover:bg-indigo-100"
                    >
                      18:30–05:30
                    </button>
                  </div>
                </Field>
              )}

              <Field label="תאריך התחלה">
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="שעת התחלה — ניתן לבחור או להקליד">
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  step={60}
                  className="input"
                />
              </Field>

              <Field label="תאריך סיום">
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="input"
                />
              </Field>

              <Field label="שעת סיום — ניתן לבחור או להקליד">
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  step={60}
                  className="input"
                />
              </Field>

              <div className="md:col-span-2">
                <div className="mb-2 text-xs font-bold text-slate-700">
                  טווחי שעות קבועים
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyTimeRange("05:30", "18:30", false)
                    }
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-800 hover:bg-amber-100"
                  >
                    משמרת יום · 05:30–18:30
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyTimeRange("18:30", "05:30", true)
                    }
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-black text-indigo-800 hover:bg-indigo-100"
                  >
                    משמרת לילה · 18:30–05:30 למחרת
                  </button>
                </div>
              </div>

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

            <div className="mt-6 space-y-3">
              <div className="text-sm font-black text-slate-900">
                שיבוץ בעלי תפקידים
              </div>
              {expandedSlots.map((slot) => {
                const availableUsers = slot.allowSystemUsers
                  ? selectableUsers.filter(
                      (user) =>
                        (slot.allowDischargedUsers || !user.isDischarged) &&
                        isAllowedForSlot(user, slot)
                    )
                  : [];

                const availableExternal = slot.allowExternalStaff
                  ? activeExternalStaff.filter(
                      (item) =>
                        slot.allowedExternalStaffTypes.length === 0 ||
                        slot.allowedExternalStaffTypes.includes(item.staffType)
                    )
                  : [];
                return (
                  <div
                    key={slot.key}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[190px_1fr] md:items-center">
                      <div>
                        <div className="text-xs font-black text-slate-800">
                          {slot.label}
                          {!slot.required && (
                            <span className="mr-2 font-medium text-slate-400">
                              (רשות)
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        value={slotAssignments[slot.key] || ""}
                        onChange={(event) =>
                          setSlotAssignments((current) => ({
                            ...current,
                            [slot.key]: event.target.value,
                          }))
                        }
                        className="input"
                      >
                        <option value="">
                          {slot.required ? "בחר חייל..." : "ללא שיבוץ"}
                        </option>
                        {availableUsers.map((user) => (
                          <option
                            key={`user:${user.userId}`}
                            value={`user:${user.userId}`}
                          >
                            {user.fullName}
                            {user.medicalRole ? ` — ${user.medicalRole}` : ""}
                          </option>
                        ))}
                        {availableExternal.map((item) => (
                          <option
                            key={`external:${item.id}`}
                            value={`external:${item.id}`}
                          >
                            {item.fullName}
                            {item.staffType ? ` — ${item.staffType}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {availableUsers.length === 0 &&
                      availableExternal.length === 0 && (
                      <div className="mt-2 text-[10px] font-bold text-rose-600">
                        אין מועמדים מתאימים. ניתן להרחיב את התפקידים המותרים
                        דרך ניהול מערכת → ניהול תפקידי משמרת.
                      </div>
                    )}
                  </div>
                );
              })}
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
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveShift}
                disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
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
