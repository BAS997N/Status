import React, { useState } from "react";
import { AttendanceReport } from "../types";
import { Clock, FileText, User, Calendar, Trash2, X } from "lucide-react";

interface HistoryViewProps {
  logs: any[];
  reports: AttendanceReport[];
  onDeleteReport?: (reportId: string) => Promise<void>;
}

export default function HistoryView({ logs, reports, onDeleteReport }: HistoryViewProps) {
  const [filterDate, setFilterDate] = useState("");
  const [reportToDelete, setReportToDelete] = useState<AttendanceReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredLogs = logs.filter(log => !filterDate || log.updatedAt.startsWith(filterDate));
  const filteredReports = reports.filter(rep => !filterDate || rep.timestamp.startsWith(filterDate));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <h2 className="text-lg font-black mb-4">היסטוריית דיווחים</h2>
        <input 
          type="date" 
          value={filterDate} 
          onChange={(e) => setFilterDate(e.target.value)}
          className="border p-2 rounded mb-4 text-sm"
        />

        <div className="space-y-6">
          <section>
            <h3 className="text-md font-bold mb-2 flex items-center gap-2"><Clock className="w-4 h-4"/> דיווחים מקוריים ליום זה</h3>
            {filteredReports.length === 0 ? <p className="text-sm text-slate-500">אין דיווחים</p> : (
              <div className="space-y-2">
                {filteredReports.map(rep => (
  <div key={rep.reportId} className="p-3 border rounded text-sm flex items-center justify-between gap-3">
    <div>
      <strong>{rep.userName}</strong>: {rep.status} - {rep.location} ({new Date(rep.timestamp).toLocaleString()})
    </div>

    {onDeleteReport && (
      <button
        type="button"
        onClick={() => setReportToDelete(rep)}
        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold"
      >
        מחק
      </button>
    )}
  </div>
))}
                {reportToDelete && (
  <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden text-right" dir="rtl">
      <div className="bg-rose-900 text-white p-4 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-rose-200" />
          <h3 className="text-sm font-black tracking-tight">אישור מחיקת דיווח</h3>
        </div>
        <button
          onClick={() => setReportToDelete(null)}
          className="text-white opacity-80 hover:opacity-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-3">
        <p className="text-xs text-slate-700 font-bold leading-relaxed">
          האם למחוק לצמיתות את הדיווח של{" "}
          <span className="text-rose-600 font-extrabold">
            {reportToDelete.userName}
          </span>
          ?
        </p>
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          פעולה זו תמחק את הדיווח מהיסטוריית הדיווחים ומטבלאות הנוכחות.
        </p>
      </div>

      <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3">
        <button
          onClick={() => setReportToDelete(null)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-xs rounded-lg border border-slate-200 transition cursor-pointer"
        >
          בטל פעולה
        </button>

        <button
          type="button"
          disabled={isDeleting}
          onClick={async () => {
            if (!onDeleteReport || !reportToDelete) return;
            setIsDeleting(true);
            try {
              await onDeleteReport(reportToDelete.reportId);
              setReportToDelete(null);
            } finally {
              setIsDeleting(false);
            }
          }}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold text-xs rounded-lg border-none transition cursor-pointer shadow-sm"
        >
          {isDeleting ? "מוחק..." : "אישור ומחיקת דיווח"}
        </button>
      </div>
    </div>
  </div>
)}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-md font-bold mb-2 flex items-center gap-2"><FileText className="w-4 h-4"/> עריכות ושינויים</h3>
            {filteredLogs.length === 0 ? <p className="text-sm text-slate-500">אין עריכות</p> : (
              <div className="space-y-2">
                {filteredLogs.map((log, idx) => (
                  <div key={idx} className="p-3 border rounded text-sm bg-slate-50">
                    <strong>דיווח {log.reportId}</strong> עודכן ב-{new Date(log.updatedAt).toLocaleString()} ע"י {log.updatedBy}
                    <pre className="text-xs bg-white p-2 mt-1 rounded border">{JSON.stringify(log.newData)}</pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
