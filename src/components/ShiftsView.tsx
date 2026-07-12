import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
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
import ShiftFilters, { ShiftViewMode } from "./shifts/ShiftFilters";
import WeeklyShiftView from "./shifts/WeeklyShiftView";
import CompactShiftList from "./shifts/CompactShiftList";
import MonthlyShiftCalendar from "./shifts/MonthlyShiftCalendar";
import { isPublishedShift } from "./shifts/shiftViewUtils";

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
  const [viewMode, setViewMode] = useState<ShiftViewMode>(
    canManage ? "week" : "list"
  );
  const [shiftTypeFilter, setShiftTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const [detailsShift, setDetailsShift] = useState<ShiftRecord | null>(null);
  const [includeReadStatusInPrint, setIncludeReadStatusInPrint] =
    useState(false);
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
          : isPublishedShift(shift) &&
            shift.assignments.some(
              (assignment) => assignment.userId === currentUser.userId
            )
      )
      .filter((shift) => showPast || new Date(shift.endAt).getTime() >= now)
      .filter((shift) =>
        shiftTypeFilter ? shift.title === shiftTypeFilter : true
      )
      .filter((shift) => {
        if (!statusFilter) return true;
        if (statusFilter === "published") return isPublishedShift(shift);
        return shift.status === statusFilter;
      })
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
  }, [
    shifts,
    canManage,
    currentUser.userId,
    showPast,
    search,
    shiftTypeFilter,
    statusFilter,
  ]);

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
          ? `external:${
              assignment.externalStaffId ||
              assignment.userId.replace("external:", "")
            }`
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
      const duplicateUserId = duplicate.replace("user:", "");
      const user = selectableUsers.find(
        (item) => item.userId === duplicateUserId
      );
      const externalId = duplicate.replace("external:", "");
      const externalPerson = activeExternalStaff.find(
        (item) => item.id === externalId
      );
      setMessage({
        type: "error",
        text: `${
          user?.fullName || externalPerson?.fullName || "אותו אדם"
        } נבחר ליותר מתפקיד אחד.`,
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
        status: editingShift?.status || "draft",
      };
      if (editingShift) {
        await dataService.updateShift(editingShift.shiftId, values, currentUser);
      } else {
        await dataService.createShift(
          {
            ...values,
            status: "draft",
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

  const duplicateShift = (shift: ShiftRecord) => {
    const startParts = toLocalParts(shift.startAt);
    const endParts = toLocalParts(shift.endAt);
    const startDateValue = new Date(`${startParts.date}T12:00:00`);
    startDateValue.setDate(startDateValue.getDate() + 7);
    const endDateValue = new Date(`${endParts.date}T12:00:00`);
    endDateValue.setDate(endDateValue.getDate() + 7);

    setEditingShift(null);
    setSelectedShiftTypeId("custom");
    setTitle(`${shift.title} - עותק`);
    setCustomTitle(`${shift.title} - עותק`);
    setShiftType(shift.shiftType);
    setStartDate(startDateValue.toISOString().slice(0, 10));
    setStartTime(startParts.time);
    setEndDate(endDateValue.toISOString().slice(0, 10));
    setEndTime(endParts.time);
    setLocation(shift.location || "");
    setNote(shift.note || "");

    const nextAssignments: Record<string, string> = {};
    expandedSlots.forEach((slot, index) => {
      const assignment =
        shift.assignments.find((item) => item.slotId === slot.key) ||
        shift.assignments[index];
      nextAssignments[slot.key] = assignment
        ? assignment.assigneeType === "external"
          ? `external:${assignment.externalStaffId || assignment.userId.replace(
              "external:",
              ""
            )}`
          : `user:${assignment.userId}`
        : "";
    });
    setSlotAssignments(nextAssignments);
    setIsFormOpen(true);
    setMessage({
      type: "success",
      text: "נוצר עותק לשבוע הבא. ניתן לשנות ולשמור.",
    });
  };

  const togglePublishShift = async (shift: ShiftRecord) => {
    try {
      const nextStatus = isPublishedShift(shift) ? "draft" : "published";
      await dataService.updateShift(
        shift.shiftId,
        { status: nextStatus },
        currentUser
      );
      await loadShifts();
      setMessage({
        type: "success",
        text:
          nextStatus === "published"
            ? "המשמרת פורסמה לחיילים."
            : "המשמרת הוחזרה לטיוטה.",
      });
    } catch (error) {
      console.error("Failed updating shift publication:", error);
      setMessage({ type: "error", text: "עדכון סטטוס המשמרת נכשל." });
    }
  };

  const exportShiftsCsv = () => {
    const rows = [
      [
        "שם משמרת",
        "סטטוס",
        "התחלה",
        "סיום",
        "מיקום",
        "תפקיד",
        "משובץ",
        "אישור קריאה",
      ],
      ...visibleShifts.flatMap((shift) =>
        shift.assignments.length
          ? shift.assignments.map((assignment) => [
              shift.title,
              shift.status === "draft"
                ? "טיוטה"
                : shift.status === "cancelled"
                ? "בוטלה"
                : "פורסמה",
              new Date(shift.startAt).toLocaleString("he-IL"),
              new Date(shift.endAt).toLocaleString("he-IL"),
              shift.location || "",
              assignment.slotLabel || "",
              assignment.userName,
              assignment.assigneeType === "external"
                ? "לא נדרש"
                : assignment.readStatus === "read"
                ? "נקרא"
                : "טרם נקרא",
            ])
          : [
              [
                shift.title,
                shift.status,
                new Date(shift.startAt).toLocaleString("he-IL"),
                new Date(shift.endAt).toLocaleString("he-IL"),
                shift.location || "",
                "",
                "",
                "",
              ],
            ]
      ),
    ];

    const csv = "\ufeff" + rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shifts_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printShifts = () => {
    if (visibleShifts.length === 0) {
      setMessage({
        type: "error",
        text: "אין משמרות להדפסה.",
      });
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setMessage({
        type: "error",
        text: "הדפדפן חסם את חלון ההדפסה. יש לאפשר חלונות קופצים לאתר.",
      });
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const shiftsHtml = visibleShifts
      .map((shift) => {
        const assignmentsHtml = shift.assignments
          .map(
            (assignment) => `
              <tr>
                <td>${escapeHtml(assignment.slotLabel || "תפקיד")}</td>
                <td>${escapeHtml(assignment.userName)}</td>
                ${
                  includeReadStatusInPrint
                    ? `<td>${
                        assignment.assigneeType === "external"
                          ? "לא נדרש"
                          : assignment.readStatus === "read"
                          ? "נקרא"
                          : "טרם נקרא"
                      }</td>`
                    : ""
                }
              </tr>
            `
          )
          .join("");

        return `
          <section class="shift-card">
            <div class="shift-header">
              <div>
                <h2>${escapeHtml(shift.title)}</h2>
                <div class="shift-type">${escapeHtml(shift.shiftType)}</div>
              </div>
              <div class="status">
                ${
                  shift.status === "draft"
                    ? "טיוטה"
                    : shift.status === "cancelled"
                    ? "בוטלה"
                    : "פורסמה"
                }
              </div>
            </div>

            <div class="details">
              <div><strong>התחלה:</strong> ${escapeHtml(
                new Date(shift.startAt).toLocaleString("he-IL")
              )}</div>
              <div><strong>סיום:</strong> ${escapeHtml(
                new Date(shift.endAt).toLocaleString("he-IL")
              )}</div>
              ${
                shift.location
                  ? `<div><strong>מיקום:</strong> ${escapeHtml(
                      shift.location
                    )}</div>`
                  : ""
              }
            </div>

            <table>
              <thead>
                <tr>
                  <th>תפקיד</th>
                  <th>משובץ</th>
                  ${includeReadStatusInPrint ? "<th>אישור קריאה</th>" : ""}
                </tr>
              </thead>
              <tbody>${assignmentsHtml}</tbody>
            </table>

            ${
              shift.note
                ? `<div class="note"><strong>הערות:</strong> ${escapeHtml(
                    shift.note
                  )}</div>`
                : ""
            }
          </section>
        `;
      })
      .join("");

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>לוח משמרות</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 24px;
              direction: rtl;
              font-family: Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }
            .print-header {
              margin-bottom: 24px;
              padding-bottom: 14px;
              border-bottom: 2px solid #0f172a;
            }
            .print-header h1 { margin: 0; font-size: 25px; }
            .print-header p {
              margin: 7px 0 0;
              color: #64748b;
              font-size: 13px;
            }
            .shift-card {
              margin-bottom: 18px;
              padding: 16px;
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .shift-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 14px;
              margin-bottom: 14px;
            }
            .shift-header h2 { margin: 0; font-size: 19px; }
            .shift-type {
              margin-top: 5px;
              color: #64748b;
              font-size: 12px;
            }
            .status {
              padding: 5px 10px;
              border-radius: 999px;
              background: #f1f5f9;
              font-size: 11px;
              font-weight: bold;
              white-space: nowrap;
            }
            .details {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px 16px;
              margin-bottom: 14px;
              font-size: 13px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th, td {
              padding: 9px;
              border: 1px solid #cbd5e1;
              text-align: right;
            }
            th { background: #f8fafc; }
            .note {
              margin-top: 12px;
              padding: 10px;
              border-radius: 8px;
              background: #fffbeb;
              font-size: 12px;
              line-height: 1.6;
            }
            @media print {
              body { padding: 0; }
              .shift-card { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <header class="print-header">
            <h1>לוח משמרות</h1>
            <p>הופק בתאריך: ${escapeHtml(
              new Date().toLocaleString("he-IL")
            )}</p>
          </header>
          ${shiftsHtml}
          <script>
            window.addEventListener("load", function () {
              setTimeout(function () {
                window.focus();
                window.print();
              }, 300);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

      <ShiftFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        shiftTypeFilter={shiftTypeFilter}
        onShiftTypeFilterChange={setShiftTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showPast={showPast}
        onShowPastChange={setShowPast}
        shiftTypes={Array.from(new Set(shifts.map((shift) => shift.title))).sort(
          (a, b) => a.localeCompare(b, "he")
        )}
        onPrint={printShifts}
        onExport={exportShiftsCsv}
      />

      {canManage && (
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 shadow-sm">
          <input
            type="checkbox"
            checked={includeReadStatusInPrint}
            onChange={(event) =>
              setIncludeReadStatusInPrint(event.target.checked)
            }
          />
          כלול אישור קריאה בהדפסה / PDF
        </label>
      )}

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
      ) : viewMode === "week" ? (
        <WeeklyShiftView
          shifts={visibleShifts}
          anchorDate={weekAnchor}
          onAnchorDateChange={setWeekAnchor}
          onOpen={setDetailsShift}
        />
      ) : viewMode === "month" ? (
        <MonthlyShiftCalendar
          shifts={visibleShifts}
          monthDate={monthAnchor}
          onMonthDateChange={setMonthAnchor}
          onOpen={setDetailsShift}
        />
      ) : (
        <CompactShiftList
          shifts={visibleShifts}
          canManage={canManage}
          onOpen={setDetailsShift}
          onEdit={openEdit}
          onDuplicate={duplicateShift}
          onShare={shareShiftOnWhatsApp}
          onDelete={deleteShift}
          onTogglePublish={togglePublishShift}
        />
      )}

      {detailsShift && (
        <div className="fixed inset-0 z-[11900] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            dir="rtl"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {detailsShift.title}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                    {formatDateTime(detailsShift.startAt)} —{" "}
                    {formatDateTime(detailsShift.endAt)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                      detailsShift.status === "draft"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : detailsShift.status === "cancelled"
                        ? "border-slate-300 bg-slate-100 text-slate-600"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {detailsShift.status === "draft"
                      ? "טיוטה"
                      : detailsShift.status === "cancelled"
                      ? "בוטלה"
                      : "פורסמה"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailsShift(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailsShift.location && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
                <span className="font-black text-slate-500">מיקום: </span>
                <span className="font-bold text-slate-800">
                  {detailsShift.location}
                </span>
              </div>
            )}

            <div className="mt-5 space-y-2">
              {detailsShift.assignments.map((assignment) => (
                <div
                  key={`${assignment.slotId}_${assignment.userId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <span className="text-xs font-bold text-slate-500">
                    {assignment.slotLabel || "תפקיד"}
                  </span>
                  <div className="text-left">
                    <div className="text-xs font-black text-slate-900">
                      {assignment.userName}
                    </div>
                    {assignment.assigneeType !== "external" && (
                      <div
                        className={`mt-0.5 text-[9px] font-bold ${
                          assignment.readStatus === "read"
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}
                      >
                        {assignment.readStatus === "read"
                          ? "קרא/ה"
                          : "טרם נקרא"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {detailsShift.note && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                {detailsShift.note}
              </div>
            )}

            {canManage && (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <button
                  type="button"
                  onClick={() => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    openEdit(shift);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
                >
                  <Edit2 className="h-4 w-4" />
                  עריכה
                </button>

                <button
                  type="button"
                  onClick={() => shareShiftOnWhatsApp(detailsShift)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    duplicateShift(shift);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  שכפול
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    await togglePublishShift(shift);
                  }}
                  className="rounded-xl border border-amber-200 px-3 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-50"
                >
                  {isPublishedShift(detailsShift)
                    ? "החזר לטיוטה"
                    : "פרסם"}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const shift = detailsShift;
                    setDetailsShift(null);
                    await deleteShift(shift);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-black text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  מחיקה
                </button>
              </div>
            )}
          </div>
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

              <Field label="מצב פרסום">
                <select
                  value={
                    editingShift
                      ? isPublishedShift(editingShift)
                        ? "published"
                        : editingShift.status
                      : "draft"
                  }
                  onChange={(event) => {
                    if (!editingShift) return;
                    setEditingShift({
                      ...editingShift,
                      status: event.target.value as ShiftRecord["status"],
                    });
                  }}
                  className="input"
                  disabled={!editingShift}
                >
                  <option value="draft">טיוטה</option>
                  <option value="published">פורסמה</option>
                  <option value="cancelled">בוטלה</option>
                </select>
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
