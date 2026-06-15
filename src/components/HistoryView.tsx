import React, { useState } from "react";
import { AttendanceReport } from "../types";
import { Clock, FileText, Trash2, X } from "lucide-react";

interface HistoryViewProps {
  logs: any[];
  reports: AttendanceReport[];
  onDeleteReport?: (reportId: string) => Promise<void>;
}

export default function HistoryView({ logs, reports, onDeleteReport }: HistoryViewProps) {
  const [filterDate, setFilterDate] = useState("");
  const [reportToDelete, setReportToDelete] = useState<AttendanceReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredLogs = logs.filter(log => !filterDate || log.updatedAt?.startsWith(filterDate));
  const filteredReports = reports.filter(rep => !filterDate || rep.timestamp?.startsWith(filterDate));

  const getStatusLabel = (status: string) => {
    if (status === "base") return "בבסיס";
    if (status === "home") return "בית / אפטר";
    if (status === "field") return "שטח / אימון";
    if (status === "sick") return "גימלים";
    if (status === "course") return "קורס / הכשרה";
    return "אחר";
  };

  const getRelatedLog = (reportId: string) => {
    return filteredLogs.find(log => log.reportId === reportId);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-black">היסטוריית דיווחים</h2>

          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-slate-200 p-2 rounded-lg text-sm"
          />
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="text-md font-bold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              דיווחים מקוריים
            </h3>

            {filteredReports.length === 0 ? (
              <p className="text-sm text-slate-500">אין דיווחים</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-100 text-slate-600 font-black">
                    <tr>
                      <th className="p-3">שם חייל</th>
                      <th className="p-3">סטטוס</th>
                      <th className="p-3">מיקום החתמה</th>
                      <th className="p-3">תאריך</th>
                      <th className="p-3">שעה</th>
                      <td className="p-3 text-slate-700">
  {(rep as any).createdByName
    ? `${(rep as any).createdByName} ${
        (rep as any).createdByRole === "commander"
          ? "(מפקד)"
          : (rep as any).createdByRole === "adjutant_officer"
          ? "(שליש)"
          : "(חייל)"
      }`
    : "דיווח ישן / לא ידוע"}
</td>
                      <th className="p-3">נערך/אומת ע״י</th>
                      <th className="p-3 text-center">פעולות</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredReports.map((rep) => {
                      const dateObj = new Date(rep.timestamp);
                      const relatedLog = getRelatedLog(rep.reportId);

                      return (
                        <tr key={rep.reportId} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-bold text-slate-800">
                            {rep.userName || "לא ידוע"}
                          </td>

                          <td className="p-3">
                            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold whitespace-nowrap">
                              {getStatusLabel(rep.status)}
                            </span>
                          </td>

                          <td className="p-3 text-slate-700">
                            {rep.location || "לא צוין"}
                          </td>

                          <td className="p-3 text-slate-600 whitespace-nowrap">
                            {dateObj.toLocaleDateString("he-IL")}
                          </td>

                          <td className="p-3 text-slate-600 whitespace-nowrap">
                            {dateObj.toLocaleTimeString("he-IL", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>

                          <td className="p-3 text-slate-700">
  {(rep as any).createdByName
    ? `${(rep as any).createdByName} ${
        (rep as any).createdByRole === "commander"
          ? "(מפקד)"
          : (rep as any).createdByRole === "adjutant_officer"
          ? "(שליש)"
          : "(חייל)"
      }`
    : "דיווח ישן / לא ידוע"}
</td>

                          <td className="p-3 text-slate-500">
  {relatedLog
    ? `נערך ע״י ${(relatedLog as any).updatedByName || "מפקד"}`
    : "לא נערך"}
</td>
                          <td className="p-3 text-center">
                            {onDeleteReport && (
                              <button
                                type="button"
                                onClick={() => setReportToDelete(rep)}
                                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                              >
                                מחק
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-md font-bold mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              עריכות ושינויים
            </h3>

            {filteredLogs.length === 0 ? (
              <p className="text-sm text-slate-500">אין עריכות</p>
            ) : (
              <div className="space-y-2">
                {filteredLogs.map((log, idx) => (
                  <div key={idx} className="p-3 border border-slate-200 rounded-lg text-sm bg-slate-50">
                    <div className="font-bold text-slate-700">
                      דיווח {log.reportId} עודכן ב־
                      {new Date(log.updatedAt).toLocaleString("he-IL")}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      עודכן ע״י: {(log as any).updatedByName || log.updatedBy || "לא ידוע"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

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
  );
}
