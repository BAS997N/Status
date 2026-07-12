import { X } from "lucide-react";
import { ShiftRecord } from "../../types";
import {
  formatTime,
  getReadCount,
  getReadableAssignmentCount,
  getStatusClasses,
  getStatusLabel,
} from "./shiftViewUtils";

interface Props {
  shift: ShiftRecord | null;
  onClose: () => void;
}

export default function ShiftDetailsModal({ shift, onClose }: Props) {
  if (!shift) return null;
  const readable = getReadableAssignmentCount(shift);

  return (
    <div className="fixed inset-0 z-[11900] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        dir="rtl"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">{shift.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${getStatusClasses(
                  shift
                )}`}
              >
                {getStatusLabel(shift)}
              </span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                {formatTime(shift.startAt)}–{formatTime(shift.endAt)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="font-black text-slate-500">התחלה</div>
            <div className="mt-1 font-bold text-slate-800">
              {new Date(shift.startAt).toLocaleString("he-IL")}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="font-black text-slate-500">סיום</div>
            <div className="mt-1 font-bold text-slate-800">
              {new Date(shift.endAt).toLocaleString("he-IL")}
            </div>
          </div>
        </div>

        {shift.location && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
            <span className="font-black text-slate-500">מיקום: </span>
            <span className="font-bold text-slate-800">{shift.location}</span>
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-black text-slate-900">שיבוץ</h4>
            <span className="text-[10px] font-bold text-slate-500">
              אישורי קריאה: {readable ? `${getReadCount(shift)}/${readable}` : "לא נדרש"}
            </span>
          </div>
          <div className="space-y-2">
            {shift.assignments.map((assignment) => (
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
                      {assignment.readStatus === "read" ? "קרא/ה" : "טרם נקרא"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {shift.note && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            {shift.note}
          </div>
        )}
      </div>
    </div>
  );
}
