import {
  Copy,
  Edit2,
  Eye,
  EyeOff,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { ShiftRecord } from "../../types";
import { ShiftViewActions } from "./types";
import {
  formatShortDate,
  formatTime,
  getAssignedCount,
  getReadCount,
  getReadableAssignmentCount,
  getStatusClasses,
  getStatusLabel,
  isPublishedShift,
} from "./shiftViewUtils";

interface Props extends ShiftViewActions {
  shifts: ShiftRecord[];
  canManage: boolean;
}

export default function CompactShiftList({
  shifts,
  canManage,
  onOpen,
  onEdit,
  onDuplicate,
  onShare,
  onDelete,
  onTogglePublish,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[90px_1.3fr_110px_120px_115px_150px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black text-slate-500 lg:grid">
        <span>תאריך</span>
        <span>משמרת</span>
        <span>שעות</span>
        <span>שיבוץ</span>
        <span>אישורי קריאה</span>
        <span>פעולות</span>
      </div>

      {shifts.map((shift) => {
        const readable = getReadableAssignmentCount(shift);
        return (
          <div
            key={shift.shiftId}
            className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[90px_1.3fr_110px_120px_115px_150px] lg:items-center"
          >
            <button
              type="button"
              onClick={() => onOpen(shift)}
              className="text-right text-xs font-black text-slate-700"
            >
              {formatShortDate(shift.startAt)}
            </button>

            <button
              type="button"
              onClick={() => onOpen(shift)}
              className="min-w-0 text-right"
            >
              <div className="truncate text-sm font-black text-slate-900">
                {shift.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${getStatusClasses(
                    shift
                  )}`}
                >
                  {getStatusLabel(shift)}
                </span>
                {shift.location && (
                  <span className="truncate text-[10px] text-slate-400">
                    {shift.location}
                  </span>
                )}
              </div>
            </button>

            <div className="text-xs font-bold text-slate-600">
              {formatTime(shift.startAt)}–{formatTime(shift.endAt)}
            </div>

            <div className="text-xs font-black text-slate-700">
              {getAssignedCount(shift)} משובצים
            </div>

            <div className="text-xs font-bold text-slate-600">
              {readable > 0 ? `${getReadCount(shift)}/${readable}` : "לא נדרש"}
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onTogglePublish?.(shift)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title={isPublishedShift(shift) ? "החזר לטיוטה" : "פרסם"}
                >
                  {isPublishedShift(shift) ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicate?.(shift)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title="שכפל"
                >
                  <Copy className="h-4 w-4" />
                </button>
                {isPublishedShift(shift) && (
                  <button
                    type="button"
                    onClick={() => onShare?.(shift)}
                    className="rounded-lg border border-slate-200 p-2 text-emerald-600 hover:bg-emerald-50"
                    title="WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit?.(shift)}
                  className="rounded-lg border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50"
                  title="עריכה"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(shift)}
                  className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                  title="מחיקה"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
