import React, { useState } from "react";
import { AttendanceReport } from "../types";
import { Clock, FileText, User, Calendar } from "lucide-react";

interface HistoryViewProps {
  logs: any[];
  reports: AttendanceReport[];
}

export default function HistoryView({ logs, reports }: HistoryViewProps) {
  const [filterDate, setFilterDate] = useState("");

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
                  <div key={rep.reportId} className="p-3 border rounded text-sm">
                    <strong>{rep.userName}</strong>: {rep.status} - {rep.location} ({new Date(rep.timestamp).toLocaleString()})
                  </div>
                ))}
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
