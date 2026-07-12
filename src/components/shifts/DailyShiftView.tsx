import { ChevronLeft, ChevronRight } from "lucide-react";
import { ShiftRecord } from "../../types";
import { ShiftViewActions } from "./types";
import {
  addDays,
  formatTime,
  getAssignedCount,
  getLocalDateKey,
  getStatusClasses,
  getStatusLabel,
} from "./shiftViewUtils";

interface Props extends ShiftViewActions {
  shifts: ShiftRecord[];
  date: Date;
  onDateChange: (date: Date) => void;
}

export default function DailyShiftView({
  shifts,
  date,
  onDateChange,
  onOpen,
}: Props) {
  const dateKey = getLocalDateKey(date.toISOString());
  const dayShifts = shifts.filter(
    (shift) => getLocalDateKey(shift.startAt) === dateKey
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => onDateChange(addDays(date, -1))}
          className="rounded-xl border border-slate-200 p-2"
          title="היום הקודם"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="text-center">
          <div className="text-sm font-black text-slate-800">
            {date.toLocaleDateString("he-IL", { weekday: "long" })}
          </div>
          <div className="mt-0.5 text-[10px] font-bold text-slate-400">
            {date.toLocaleDateString("he-IL")}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDateChange(addDays(date, 1))}
          className="rounded-xl border border-slate-200 p-2"
          title="היום הבא"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {dayShifts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs font-bold text-slate-400">
          אין משמרות ביום שנבחר
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dayShifts.map((shift) => (
            <button
              key={shift.shiftId}
              type="button"
              onClick={() => onOpen(shift)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-900">
                    {shift.title}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    {formatTime(shift.startAt)}–{formatTime(shift.endAt)}
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${getStatusClasses(
                    shift
                  )}`}
                >
                  {getStatusLabel(shift)}
                </span>
              </div>

              {shift.location && (
                <div className="mt-3 truncate text-[10px] text-slate-400">
                  {shift.location}
                </div>
              )}

              <div className="mt-3 text-[10px] font-black text-slate-600">
                {getAssignedCount(shift)} משובצים
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
