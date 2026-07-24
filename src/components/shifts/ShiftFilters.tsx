import {
  CalendarDays,
  Download,
  List,
  Printer,
  Rows3,
  Search,
} from "lucide-react";

export type ShiftViewMode = "day" | "week" | "list" | "month";

interface Props {
  viewMode: ShiftViewMode;
  onViewModeChange: (mode: ShiftViewMode) => void;
  search: string;
  onSearchChange: (value: string) => void;
  shiftTypeFilter: string;
  onShiftTypeFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  showPast: boolean;
  onShowPastChange: (value: boolean) => void;
  shiftTypes: string[];
  onPrint: () => void;
  onExport: () => void;
}

export default function ShiftFilters({
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  shiftTypeFilter,
  onShiftTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  showPast,
  onShowPastChange,
  shiftTypes,
  onPrint,
  onExport,
}: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="חיפוש לפי משמרת, מיקום או חייל..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-xs outline-none focus:border-indigo-400"
          />
        </div>

        <select
          value={shiftTypeFilter}
          onChange={(event) => onShiftTypeFilterChange(event.target.value)}
          className="input xl:w-48"
        >
          <option value="">כל סוגי המשמרות</option>
          {shiftTypes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
          className="input xl:w-40"
        >
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה לקראת פרסום</option>
          <option value="published">פורסמה</option>
          <option value="cancelled">מבוטלת</option>
        </select>

        <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(event) => onShowPastChange(event.target.checked)}
          />
          הצג משמרות שעברו
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {[
            { id: "day" as const, label: "יום", icon: CalendarDays },
            { id: "week" as const, label: "שבוע", icon: Rows3 },
            { id: "list" as const, label: "רשימה", icon: List },
            { id: "month" as const, label: "חודש", icon: CalendarDays },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewModeChange(item.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black ${
                  viewMode === item.id
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            הדפס / PDF
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
          >
            <Download className="h-4 w-4" />
            Excel / CSV
          </button>
        </div>
      </div>
    </div>
  );
}
