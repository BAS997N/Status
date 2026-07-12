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
  getWeekStart,
} from "./shiftViewUtils";

interface Props extends ShiftViewActions {
  shifts: ShiftRecord[];
  anchorDate: Date;
  onAnchorDateChange: (date: Date) => void;
}

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function WeeklyShiftView({
  shifts,
  anchorDate,
  onAnchorDateChange,
  onOpen,
}: Props) {
  const weekStart = getWeekStart(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => onAnchorDateChange(addDays(weekStart, -7))}
          className="rounded-xl border border-slate-200 p-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="text-sm font-black text-slate-800">
          השבוע של {weekStart.toLocaleDateString("he-IL")}
        </div>
        <button
          type="button"
          onClick={() => onAnchorDateChange(addDays(weekStart, 7))}
          className="rounded-xl border border-slate-200 p-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((day, index) => {
          const key = getLocalDateKey(day.toISOString());
          const dayShifts = shifts.filter(
            (shift) => getLocalDateKey(shift.startAt) === key
          );

          return (
            <section
              key={key}
              className="min-h-36 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-3 border-b border-slate-100 pb-2">
                <div className="text-xs font-black text-slate-800">
                  {DAY_NAMES[index]}
                </div>
                <div className="text-[10px] font-bold text-slate-400">
                  {day.toLocaleDateString("he-IL")}
                </div>
              </div>

              <div className="space-y-2">
                {dayShifts.length === 0 ? (
                  <div className="py-5 text-center text-[10px] text-slate-300">
                    אין משמרות
                  </div>
                ) : (
                  dayShifts.map((shift) => (
                    <button
                      key={shift.shiftId}
                      type="button"
                      onClick={() => onOpen(shift)}
                      className="w-full rounded-xl border border-slate-200 p-2 text-right hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      <div className="truncate text-xs font-black text-slate-900">
                        {shift.title}
                      </div>
                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        {formatTime(shift.startAt)}–{formatTime(shift.endAt)}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-slate-600">
                          {getAssignedCount(shift)} משובצים
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black ${getStatusClasses(
                            shift
                          )}`}
                        >
                          {getStatusLabel(shift)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
