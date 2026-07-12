import { ChevronLeft, ChevronRight } from "lucide-react";
import { ShiftRecord } from "../../types";
import { ShiftViewActions } from "./types";
import { getLocalDateKey } from "./shiftViewUtils";

interface Props extends ShiftViewActions {
  shifts: ShiftRecord[];
  monthDate: Date;
  onMonthDateChange: (date: Date) => void;
}

const DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export default function MonthlyShiftCalendar({
  shifts,
  monthDate,
  onMonthDateChange,
  onOpen,
}: Props) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 12);
  const cells: Array<Date | null> = [];

  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 12));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const moveMonth = (delta: number) =>
    onMonthDateChange(
      new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1, 12)
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="rounded-xl border border-slate-200 p-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="text-sm font-black text-slate-800">
          {monthDate.toLocaleDateString("he-IL", {
            month: "long",
            year: "numeric",
          })}
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="rounded-xl border border-slate-200 p-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DAYS.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-[10px] font-black text-slate-500"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((date, index) => {
            if (!date) {
              return (
                <div
                  key={`empty_${index}`}
                  className="min-h-24 border-b border-l border-slate-100 bg-slate-50/40"
                />
              );
            }

            const key = getLocalDateKey(date.toISOString());
            const dayShifts = shifts.filter(
              (shift) => getLocalDateKey(shift.startAt) === key
            );

            return (
              <div
                key={key}
                className="min-h-24 border-b border-l border-slate-100 p-1.5"
              >
                <div className="mb-1 text-[10px] font-black text-slate-500">
                  {date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map((shift) => (
                    <button
                      key={shift.shiftId}
                      type="button"
                      onClick={() => onOpen(shift)}
                      className="block w-full truncate rounded-md bg-indigo-50 px-1.5 py-1 text-right text-[9px] font-black text-indigo-800 hover:bg-indigo-100"
                    >
                      {shift.title}
                    </button>
                  ))}
                  {dayShifts.length > 3 && (
                    <div className="text-[9px] font-bold text-slate-400">
                      +{dayShifts.length - 3} נוספות
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
