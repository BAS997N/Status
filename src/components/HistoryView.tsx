import React, { useState } from "react";
import { AttendanceReport, ATTENDANCE_STATUS_LABELS } from "../types";
import { Clock, FileText, Trash2, X, RotateCcw } from "lucide-react";

interface HistoryViewProps {
  logs: any[];
  reports: AttendanceReport[];
  onDeleteReport?: (reportId: string) => Promise<void>;
  onResetReport?: (reportId: string) => Promise<void>;
}

export default function HistoryView({
  logs,
  reports,
  onDeleteReport,
  onResetReport,
}: HistoryViewProps) {
  const [filterDate, setFilterDate] = useState("");
  const [filterSoldier, setFilterSoldier] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
    const [reportToDelete, setReportToDelete] =
    useState<AttendanceReport | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [selectedReports, setSelectedReports] = useState<string[]>([]);

  const [bulkAction, setBulkAction] = useState<
    "delete" | "reset" | null
  >(null);

  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const getLocalDateString = (timestamp?: string) => {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const filteredLogs = logs.filter(log =>
  !filterDate || getLocalDateString(log.updatedAt) === filterDate
);

const filteredReports = reports.filter((rep) => {
  const reportDay =
  (rep as any).reportDate || getLocalDateString(rep.timestamp);


const matchesDate =
  !filterDate || reportDay === filterDate;

  const matchesSoldier =
    !filterSoldier ||
    (rep.userName || "").toLowerCase().includes(filterSoldier.toLowerCase());

  const matchesStatus =
    filterStatus === "all" || rep.status === filterStatus;

  const createdByRole = (rep as any).createdByRole || "unknown";

  const matchesRole =
    filterRole === "all" || createdByRole === filterRole;

  return matchesDate && matchesSoldier && matchesStatus && matchesRole;
});
  const sortedFilteredReports = [...filteredReports].sort((a, b) => {
  const aDay = (a as any).reportDate || getLocalDateString(a.timestamp);
  const bDay = (b as any).reportDate || getLocalDateString(b.timestamp);

  const byDate = bDay.localeCompare(aDay);
  if (byDate !== 0) return byDate;

  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
});
  const visibleReportIds = sortedFilteredReports
  .map((report) => report.reportId)
  .filter((id): id is string => Boolean(id));

const areAllVisibleReportsSelected =
  visibleReportIds.length > 0 &&
  visibleReportIds.every((id) => selectedReports.includes(id));

const toggleReportSelection = (reportId: string) => {
  setSelectedReports((currentSelected) =>
    currentSelected.includes(reportId)
      ? currentSelected.filter((id) => id !== reportId)
      : [...currentSelected, reportId]
  );
};

const toggleSelectAllVisibleReports = () => {
  setSelectedReports((currentSelected) => {
    if (areAllVisibleReportsSelected) {
      return currentSelected.filter(
        (id) => !visibleReportIds.includes(id)
      );
    }

    return Array.from(
      new Set([...currentSelected, ...visibleReportIds])
    );
  });
};

const handleBulkAction = async () => {
  if (!bulkAction || selectedReports.length === 0) return;

  setIsBulkProcessing(true);

  try {
    if (bulkAction === "delete" && onDeleteReport) {
      await Promise.all(
        selectedReports.map((reportId) =>
          onDeleteReport(reportId)
        )
      );
    }

    if (bulkAction === "reset" && onResetReport) {
      await Promise.all(
        selectedReports.map((reportId) =>
          onResetReport(reportId)
        )
      );
    }

    setSelectedReports([]);
    setBulkAction(null);
  } catch (error) {
    console.error("Bulk report action failed:", error);
  } finally {
    setIsBulkProcessing(false);
  }
};

  const getStatusLabel = (status: string) => {
    if (status === "base") return "בבסיס";
    if (status === "home") return "בית / אפטר";
    if (status === "field") return "שטח / אימון";
    if (status === "sick") return "גימלים";
    if (status === "course") return "קורס / הכשרה";
    if (status === "cut_order") return "חיתוך צו";
    return "אחר";
  };

  const getRelatedLog = (reportId: string) => {
    return filteredLogs.find(log => log.reportId === reportId);
  };
const getActionTypeLabel = (rep: AttendanceReport, relatedLog?: any) => {
  if (relatedLog) {
    const role = relatedLog.updatedByRole || relatedLog.actorRole;

    if (role === "commander") return "עריכת דיווח מפקד";
    if (role === "adjutant_officer") return "עריכת דיווח שליש";

    return "עריכת דיווח";
  }

  const createdByRole = (rep as any).createdByRole;

  if (createdByRole === "commander") return "דיווח מפקד";
  if (createdByRole === "adjutant_officer") return "דיווח שליש";
  if (createdByRole === "soldier") return "דיווח חייל";

  return "דיווח ישן / לא ידוע";
};
  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <div className="space-y-3 mb-4">
  <div className="flex items-center justify-between gap-3">
    <h2 className="text-lg font-black">היסטוריית דיווחים</h2>

    <button
      type="button"
      onClick={() => {
        setFilterDate("");
        setFilterSoldier("");
        setFilterStatus("all");
        setFilterRole("all");
      }}
      className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black"
    >
      נקה סינון
    </button>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
    <input
      type="date"
      value={filterDate}
      onChange={(e) => setFilterDate(e.target.value)}
      className="border border-slate-200 p-2 rounded-lg text-xs font-bold bg-white"
    />

    <input
      type="text"
      placeholder="סינון לפי חייל..."
      value={filterSoldier}
      onChange={(e) => setFilterSoldier(e.target.value)}
      className="border border-slate-200 p-2 rounded-lg text-xs font-bold bg-white"
    />

    <select
      value={filterStatus}
      onChange={(e) => setFilterStatus(e.target.value)}
      className="border border-slate-200 p-2 rounded-lg text-xs font-bold bg-white"
    >
      <option value="all">כל הסטטוסים</option>
      {Object.entries(ATTENDANCE_STATUS_LABELS).map(([key, value]) => (
        <option key={key} value={key}>
          {value.label}
        </option>
      ))}
    </select>

    <select
      value={filterRole}
      onChange={(e) => setFilterRole(e.target.value)}
      className="border border-slate-200 p-2 rounded-lg text-xs font-bold bg-white"
    >
      <option value="all">כל המדווחים</option>
      <option value="soldier">חייל</option>
      <option value="commander">מפקד</option>
      <option value="adjutant_officer">שליש</option>
      <option value="unknown">לא ידוע</option>
    </select>
    </div>

  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
    <label className="flex items-center gap-2 text-xs font-black text-slate-700 cursor-pointer">
      <input
        type="checkbox"
        checked={areAllVisibleReportsSelected}
        onChange={toggleSelectAllVisibleReports}
        disabled={visibleReportIds.length === 0 || isBulkProcessing}
        className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
      />

      <span>
        בחר את כל הדיווחים המוצגים
      </span>
    </label>

    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-black text-slate-500">
        {selectedReports.length > 0
          ? `${selectedReports.length} דיווחים מסומנים`
          : "לא נבחרו דיווחים"}
      </span>

      <button
        type="button"
        onClick={() => setBulkAction("reset")}
        disabled={
          selectedReports.length === 0 ||
          isBulkProcessing ||
          !onResetReport
        }
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RotateCcw size={15} />
        אפס מסומנים
      </button>

      <button
        type="button"
        onClick={() => setBulkAction("delete")}
        disabled={
          selectedReports.length === 0 ||
          isBulkProcessing ||
          !onDeleteReport
        }
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash2 size={15} />
        מחק מסומנים
      </button>
    </div>
  </div>
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
  <th className="p-3 text-center">
    <input
      type="checkbox"
      checked={areAllVisibleReportsSelected}
      onChange={toggleSelectAllVisibleReports}
      disabled={visibleReportIds.length === 0 || isBulkProcessing}
      aria-label="בחר את כל הדיווחים המוצגים"
      className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
    />
  </th>

  <th className="p-3">שם חייל</th>
      <th className="p-3">סטטוס</th>
      <th className="p-3">מיקום</th>
      <th className="p-3">תאריך</th>
      <th className="p-3">שעה</th>
      <th className="p-3">דווח ע״י</th>
      <th className="p-3">נערך ע״י</th>
      <th className="p-3">סוג פעולה</th>
      <th className="p-3 text-center">פעולות</th>
    </tr>
  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {sortedFilteredReports.map((rep) => {
  const reportId = rep.reportId || "";
  const reportDay =
    (rep as any).reportDate || getLocalDateString(rep.timestamp);

const reportDateText = reportDay
  ? reportDay.split("-").reverse().join("/")
  : "";
                const dateObj = new Date(rep.timestamp);
                      const relatedLog = getRelatedLog(rep.reportId);

                     return (
  <tr
    key={rep.reportId}
    className="hover:bg-slate-50 transition"
  >
    <td className="p-3 text-center">
      <input
        type="checkbox"
        checked={reportId ? selectedReports.includes(reportId) : false}
        onChange={() => {
          if (reportId) {
            toggleReportSelection(reportId);
          }
        }}
        disabled={!reportId || isBulkProcessing}
        aria-label={`בחר דיווח של ${rep.userName || "חייל לא ידוע"}`}
        className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
      />
    </td>

    <td className="p-3 font-bold text-slate-800">
      {rep.userName || "לא ידוע"}
    </td>

                          <td className="p-3">
  {(() => {
    const statusInfo = ATTENDANCE_STATUS_LABELS[rep.status];

    return (
      <span
        className={`px-2 py-1 rounded-full font-bold whitespace-nowrap border ${
          statusInfo
            ? `${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`
            : "bg-slate-50 text-slate-600 border-slate-200"
        }`}
      >
        {statusInfo?.label || getStatusLabel(rep.status)}
      </span>
    );
  })()}
</td>

                          <td className="p-3 text-slate-700">
                            {rep.location || "לא צוין"}
                          </td>

                          <td className="p-3 text-slate-600 whitespace-nowrap">
                            {reportDateText}
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
                          <td className="p-3">
  <span className={`px-2 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${
    getActionTypeLabel(rep, relatedLog).includes("מפקד")
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : getActionTypeLabel(rep, relatedLog).includes("שליש")
      ? "bg-purple-50 text-purple-700 border-purple-200"
      : getActionTypeLabel(rep, relatedLog).includes("חייל")
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-slate-50 text-slate-600 border-slate-200"
  }`}>
    {getActionTypeLabel(rep, relatedLog)}
  </span>
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
  דיווח של {log.newData?.userName || "חייל"} עודכן ב־
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
