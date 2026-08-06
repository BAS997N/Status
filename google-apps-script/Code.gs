function doGet() {
  return ContentService.createTextOutput("WEB APP IS WORKING");
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const sheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("נוכחות מתעדכן");

    if (!sheet) {
      return createResponse("ERROR: sheet not found");
    }

    if (!e || !e.postData || !e.postData.contents) {
      return createResponse("ERROR: no post data");
    }

    const data = JSON.parse(e.postData.contents);

    // יצירה או עדכון של שתי לשוניות לכל קו: שמי ומספרי.
    if (data.action === "syncLineNumericRoster") {
      return createResponse(
        JSON.stringify(syncLineRosterTabs(data))
      );
    }

    const personalId = normalizePersonalId(data.personalId);
    const fullName = String(data.fullName || "").trim();
    const role = String(data.role || "").trim();
    const phone = String(data.phone || "").trim();
    const date = normalizeDateText(data.date);
    const cellValue = String(
      data.cellValue || data.status || ""
    ).trim();

    if (!personalId || !date) {
      return createResponse("ERROR: missing personalId/date");
    }

    const lastRow = Math.max(sheet.getLastRow(), 2);
    const lastColumn = Math.max(sheet.getLastColumn(), 4);

    /*
     * חיפוש החייל לפי מספר אישי מנורמל.
     * קריאה אחת של כל הטבלה במקום getRange בכל לולאה.
     */
    let soldierRow = null;

    if (lastRow >= 3) {
      const personalIds = sheet
        .getRange(3, 1, lastRow - 2, 1)
        .getDisplayValues();

      for (let index = 0; index < personalIds.length; index++) {
        const existingPersonalId = normalizePersonalId(
          personalIds[index][0]
        );

        if (
          existingPersonalId &&
          existingPersonalId === personalId
        ) {
          soldierRow = index + 3;
          break;
        }
      }
    }

    /*
     * בזכות LockService רק בקשה אחת יכולה ליצור
     * שורה חדשה בכל רגע, ולכן לא ייווצרו כפילויות.
     */
    if (!soldierRow) {
      soldierRow = Math.max(sheet.getLastRow() + 1, 3);

      sheet
        .getRange(soldierRow, 1, 1, 4)
        .setValues([
          [
            personalId,
            fullName,
            role,
            phone,
          ],
        ]);
    } else {
      /*
       * מעדכן גם את פרטי החייל הקיימים,
       * כדי ששינוי שם/תפקיד/טלפון יגיע לשיטס.
       */
      sheet
        .getRange(soldierRow, 2, 1, 3)
        .setValues([
          [
            fullName,
            role,
            phone,
          ],
        ]);
    }

    /*
     * חיפוש עמודת התאריך.
     */
    let dateColumn = null;
    const currentLastColumn = Math.max(
      sheet.getLastColumn(),
      4
    );

    if (currentLastColumn >= 5) {
      const dateHeaders = sheet
        .getRange(
          2,
          5,
          1,
          currentLastColumn - 4
        )
        .getDisplayValues()[0];

      for (
        let index = 0;
        index < dateHeaders.length;
        index++
      ) {
        const headerDate = normalizeDateText(
          dateHeaders[index]
        );

        if (headerDate === date) {
          dateColumn = index + 5;
          break;
        }
      }
    }

    /*
     * אם אין עמודה לתאריך — יוצרים אותה,
     * במקום לפספס את הדיווח.
     */
    if (!dateColumn) {
      dateColumn = Math.max(
        sheet.getLastColumn() + 1,
        5
      );

      sheet
        .getRange(2, dateColumn)
        .setNumberFormat("@")
        .setValue(date);

      sheet
        .getRange(1, dateColumn)
        .setValue(getHebrewDayName(date))
        .setFontWeight("bold");

      sheet
        .getRange(2, dateColumn)
        .setFontWeight("bold");
    }

    const targetCell = sheet.getRange(
      soldierRow,
      dateColumn
    );

    applyStatusStyle(
      targetCell,
      cellValue || "—"
    );

    return createResponse(
      JSON.stringify({
        success: true,
        personalId,
        date,
        row: soldierRow,
        column: dateColumn,
      })
    );
  } catch (err) {
    return createResponse(
      "ERROR: " +
        (err && err.message
          ? err.message
          : String(err))
    );
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {
      // אין צורך בפעולה
    }
  }
}

function normalizePersonalId(value) {
  const cleanValue = String(value || "")
    .trim()
    .replace(/\s+/g, "");

  // בשיטס אנחנו מקבלים רק מספר אישי מספרי.
  // UID של Firebase לא ייחשב כמספר אישי.
  if (!/^\d+$/.test(cleanValue)) {
    return "";
  }

  return cleanValue;
}

function normalizeDateText(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  /*
   * yyyy-mm-dd -> dd/mm/yyyy
   */
  const isoMatch = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (isoMatch) {
    return [
      String(isoMatch[3]).padStart(2, "0"),
      String(isoMatch[2]).padStart(2, "0"),
      isoMatch[1],
    ].join("/");
  }

  /*
   * d/m/yyyy -> dd/mm/yyyy
   */
  const displayMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (displayMatch) {
    return [
      String(displayMatch[1]).padStart(2, "0"),
      String(displayMatch[2]).padStart(2, "0"),
      displayMatch[3],
    ].join("/");
  }

  return raw;
}

function getHebrewDayName(dateText) {
  const normalized = normalizeDateText(dateText);
  const parts = normalized.split("/");

  if (parts.length !== 3) return "";

  const date = new Date(
    Number(parts[2]),
    Number(parts[1]) - 1,
    Number(parts[0])
  );

  const days = [
    "א׳",
    "ב׳",
    "ג׳",
    "ד׳",
    "ה׳",
    "ו׳",
    "ש׳",
  ];

  return days[date.getDay()] || "";
}

function createResponse(value) {
  return ContentService
    .createTextOutput(String(value))
    .setMimeType(ContentService.MimeType.TEXT);
}

function applyStatusStyle(cell, value) {
  const cleanValue = String(value || "").trim();

  cell
    .setValue(cleanValue)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  if (cleanValue.includes("בבסיס")) {
    cell.setBackground("#d9ead3");
  } else if (
    cleanValue.includes("בית") ||
    cleanValue.includes("אפטר")
  ) {
    cell.setBackground("#cfe2f3");
  } else if (cleanValue.includes("גימלים")) {
    cell.setBackground("#f4cccc");
  } else if (cleanValue.includes("חיתוך צו")) {
    cell.setBackground("#ead1dc");
  } else if (cleanValue.includes("לא בצו")) {
    cell.setBackground("#fce5cd");
  } else if (
    cleanValue.includes("שטח") ||
    cleanValue.includes("אימון")
  ) {
    cell.setBackground("#fff2cc");
  } else if (cleanValue.includes("קורס")) {
    cell.setBackground("#d0e0e3");
  } else {
    cell.setBackground("#eeeeee");
  }
}

function colorExistingReports() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("נוכחות מתעדכן");

  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  for (let row = 3; row <= lastRow; row++) {
    for (let col = 5; col <= lastColumn; col++) {
      const cell = sheet.getRange(row, col);
      const value = String(
        cell.getValue() || ""
      ).trim();

      if (!value) continue;

      applyStatusStyle(cell, value);
    }
  }
}
function removeDuplicateSoldiers() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("נוכחות מתעדכן");

  if (!sheet) {
    throw new Error("Sheet not found");
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 3) return;

  const values = sheet
    .getRange(
      3,
      1,
      lastRow - 2,
      lastColumn
    )
    .getValues();

  const firstRowByPersonalId = {};
  const rowsToDelete = [];

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    const rowNumber = index + 3;
    const personalId =
      normalizePersonalId(values[index][0]);

    if (!personalId) continue;

    if (
      firstRowByPersonalId[
        personalId
      ] === undefined
    ) {
      firstRowByPersonalId[
        personalId
      ] = rowNumber;

      continue;
    }

    const targetRow =
      firstRowByPersonalId[personalId];

    /*
     * מעביר תאים מלאים מהשורה הכפולה
     * לשורה הראשית רק אם התא הראשי ריק.
     */
    for (
      let column = 5;
      column <= lastColumn;
      column++
    ) {
      const sourceValue =
        sheet
          .getRange(
            rowNumber,
            column
          )
          .getValue();

      const targetValue =
        sheet
          .getRange(
            targetRow,
            column
          )
          .getValue();

      if (
        sourceValue !== "" &&
        targetValue === ""
      ) {
        sheet
          .getRange(
            rowNumber,
            column
          )
          .copyTo(
            sheet.getRange(
              targetRow,
              column
            ),
            SpreadsheetApp.CopyPasteType
              .PASTE_NORMAL,
            false
          );
      }
    }

    rowsToDelete.push(rowNumber);
  }

  rowsToDelete
    .sort((a, b) => b - a)
    .forEach((rowNumber) => {
      sheet.deleteRow(rowNumber);
    });
}
function mergeFirebaseUidDuplicateRows() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("נוכחות מתעדכן");

  if (!sheet) {
    throw new Error("Sheet not found");
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 3) return;

  const values = sheet
    .getRange(3, 1, lastRow - 2, lastColumn)
    .getDisplayValues();

  const numericRowByName = {};
  const rowsToDelete = [];

  /*
   * מעבר ראשון:
   * שומרים לכל שם את השורה שבה קיים מספר אישי מספרי.
   */
  for (let index = 0; index < values.length; index++) {
    const rowNumber = index + 3;
    const personalId = String(values[index][0] || "")
      .trim()
      .replace(/\s+/g, "");

    const fullName = normalizeFullName(values[index][1]);

    if (!fullName) continue;

    if (/^\d+$/.test(personalId)) {
      numericRowByName[fullName] = rowNumber;
    }
  }

  /*
   * מעבר שני:
   * מאתרים שורות עם UID לא מספרי ושם שכבר קיים
   * בשורה תקינה עם מספר אישי.
   */
  for (let index = 0; index < values.length; index++) {
    const sourceRow = index + 3;

    const sourceId = String(values[index][0] || "")
      .trim()
      .replace(/\s+/g, "");

    const fullName = normalizeFullName(values[index][1]);

    if (!fullName) continue;

    // מדלגים על שורה תקינה עם מספר אישי
    if (/^\d+$/.test(sourceId)) continue;

    const targetRow = numericRowByName[fullName];

    if (!targetRow || targetRow === sourceRow) {
      continue;
    }

    /*
     * מעבירים דיווחים מהשורה עם UID לשורה התקינה,
     * אבל רק כאשר התא התקין ריק.
     */
    for (let column = 5; column <= lastColumn; column++) {
      const sourceCell = sheet.getRange(sourceRow, column);
      const targetCell = sheet.getRange(targetRow, column);

      const sourceValue = sourceCell.getValue();
      const targetValue = targetCell.getValue();

      if (sourceValue !== "" && targetValue === "") {
        sourceCell.copyTo(
          targetCell,
          SpreadsheetApp.CopyPasteType.PASTE_NORMAL,
          false
        );
      }
    }

    rowsToDelete.push(sourceRow);
  }

  rowsToDelete
    .sort((a, b) => b - a)
    .forEach((rowNumber) => {
      sheet.deleteRow(rowNumber);
    });
}

function normalizeFullName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/* =========================================================
 * סידור קו בשתי לשוניות Google Sheets: שמי ומספרי
 * ========================================================= */

function syncLineRosterTabs(data) {
  if (
    !data ||
    !Array.isArray(data.dates) ||
    !Array.isArray(data.rows)
  ) {
    throw new Error("נתוני סידור הקו אינם תקינים");
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("לא נמצא קובץ Google Sheets פעיל");
  }

  const baseName = String(
    data.sheetName || data.cycleTitle || "סידור קו"
  )
    .replace(/[\\/?*\[\]:]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 78) || "סידור קו";

  const dates = data.dates.map(String);
  const numericSheetName = baseName + " – מספרי";
  const namedSheetName = baseName + " – שמי";

  writeLineRosterTab(
    spreadsheet,
    numericSheetName,
    data,
    dates,
    "numeric"
  );

  writeLineRosterTab(
    spreadsheet,
    namedSheetName,
    data,
    dates,
    "named"
  );

  SpreadsheetApp.flush();

  return {
    success: true,
    action: "syncLineNumericRoster",
    numericSheetName,
    namedSheetName,
    soldierCount: data.rows.length,
    dateCount: dates.length,
  };
}

function writeLineRosterTab(
  spreadsheet,
  sheetName,
  data,
  dates,
  mode
) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  sheet.clear();
  sheet.setRightToLeft(true);

  const isNumeric = mode === "numeric";
  const headers = [
    "מספר אישי",
    "שם מלא",
    "תפקיד",
    "יחידה",
  ]
    .concat(dates.map(formatLineRosterDate))
    .concat(isNumeric ? ["סה״כ"] : []);

  const tableRows = data.rows.map((row) => {
    const source = isNumeric
      ? Array.isArray(row.values)
        ? row.values.slice(0, dates.length)
        : []
      : Array.isArray(row.labels)
      ? row.labels.slice(0, dates.length)
      : [];

    while (source.length < dates.length) {
      source.push("");
    }

    const normalized = source.map((value) =>
      value === null || value === undefined ? "" : value
    );

    return [
      row.personalId || "",
      row.fullName || "",
      row.medicalRole || "",
      row.unit || "",
    ]
      .concat(normalized)
      .concat(isNumeric ? [""] : []);
  });

  const table = [headers].concat(tableRows);
  const lastColumn = headers.length;
  let lastDataRow = tableRows.length + 1;

  sheet
    .getRange(1, 1, table.length, lastColumn)
    .setValues(table);

  if (isNumeric && tableRows.length && dates.length) {
    const firstDateColumn = 5;
    const lastDateColumn = firstDateColumn + dates.length - 1;
    const formulas = tableRows.map((_, index) => {
      const rowNumber = index + 2;

      return [
        "=SUMIF(" +
          lineRosterColumnLetter(firstDateColumn) +
          rowNumber +
          ":" +
          lineRosterColumnLetter(lastDateColumn) +
          rowNumber +
          ',"<>100",' +
          lineRosterColumnLetter(firstDateColumn) +
          rowNumber +
          ":" +
          lineRosterColumnLetter(lastDateColumn) +
          rowNumber +
          ")",
      ];
    });

    sheet
      .getRange(2, lastColumn, formulas.length, 1)
      .setFormulas(formulas);
  }

  sheet
    .getRange(1, 1, 1, lastColumn)
    .setBackground("#1E3A5F")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  if (tableRows.length) {
    sheet
      .getRange(2, 1, tableRows.length, lastColumn)
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#CBD5E1",
        SpreadsheetApp.BorderStyle.SOLID
      )
      .setVerticalAlignment("middle");

    sheet
      .getRange(2, 1, tableRows.length, 4)
      .setBackground("#F8FAFC")
      .setFontWeight("bold");

    if (dates.length) {
      sheet
        .getRange(2, 5, tableRows.length, dates.length)
        .setHorizontalAlignment("center")
        .setFontWeight(isNumeric ? "bold" : "normal")
        .setWrap(!isNumeric);

      const colorByCode = {};

      (data.legend || []).forEach((item) => {
        colorByCode[String(item.code)] =
          item.color || defaultLineRosterColor(Number(item.code));
      });

      const backgrounds = data.rows.map((row) => {
        const values = Array.isArray(row.values)
          ? row.values.slice(0, dates.length)
          : [];

        while (values.length < dates.length) {
          values.push("");
        }

        return values.map((value) => {
          if (
            value === "" ||
            value === null ||
            value === undefined
          ) {
            return "#FFFFFF";
          }

          return (
            colorByCode[String(value)] ||
            defaultLineRosterColor(Number(value))
          );
        });
      });

      sheet
        .getRange(2, 5, tableRows.length, dates.length)
        .setBackgrounds(backgrounds);
    }

    if (isNumeric) {
      sheet
        .getRange(2, lastColumn, tableRows.length, 1)
        .setBackground("#DBEAFE")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");
    }
  }

  if (isNumeric && tableRows.length) {
    lastDataRow += addNumericLineRosterSubtotals(
      sheet,
      data.rows,
      dates,
      lastColumn
    );
  }

  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }

  if (lastDataRow >= 2) {
    sheet
      .getRange(1, 1, lastDataRow, lastColumn)
      .createFilter();
  }

  sheet.setColumnWidth(1, 105);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 165);
  sheet.setColumnWidth(4, 135);

  dates.forEach((_, index) => {
    sheet.setColumnWidth(index + 5, isNumeric ? 72 : 115);
  });

  if (isNumeric) {
    sheet.setColumnWidth(lastColumn, 85);
    addLineRosterLegend(sheet, data.legend || [], lastDataRow + 3);
  }

  sheet.getRange("A1").setNote(
    "קו: " +
      String(data.cycleTitle || "") +
      "\nתקופה: " +
      String(data.startDate || "") +
      " עד " +
      String(data.endDate || "") +
      "\nעודכן: " +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "dd.MM.yyyy HH:mm:ss"
      )
  );
}

function addNumericLineRosterSubtotals(
  sheet,
  rows,
  dates,
  lastColumn
) {
  const groups = [
    {
      label: "סיכום ביניים רופאים ופראמדיקים",
      orders: [2, 3],
    },
    {
      label: "סיכום ביניים מנהלי אירוע וחובשים",
      orders: [4, 5, 6],
    },
  ]
    .map((group) => {
      const indexes = rows
        .map((row, index) =>
          group.orders.includes(getLineRosterRowOrder(row)) ? index : -1
        )
        .filter((index) => index >= 0);

      return {
        ...group,
        firstIndex: indexes.length ? Math.min(...indexes) : -1,
        lastIndex: indexes.length ? Math.max(...indexes) : -1,
      };
    })
    .filter((group) => group.firstIndex >= 0)
    .sort((first, second) => second.lastIndex - first.lastIndex);

  groups.forEach((group) => {
    const firstSheetRow = group.firstIndex + 2;
    const lastSheetRow = group.lastIndex + 2;
    const subtotalRow = lastSheetRow + 1;

    sheet.insertRowAfter(lastSheetRow);
    sheet
      .getRange(subtotalRow, 1, 1, lastColumn)
      .setBackground("#BFDBFE")
      .setFontColor("#1E3A8A")
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#60A5FA",
        SpreadsheetApp.BorderStyle.SOLID
      );
    sheet
      .getRange(subtotalRow, 2)
      .setValue(group.label)
      .setHorizontalAlignment("right");

    dates.forEach((_, dateIndex) => {
      const column = dateIndex + 5;
      const letter = lineRosterColumnLetter(column);
      sheet
        .getRange(subtotalRow, column)
        .setFormula(
          "=SUMIF(" +
            letter +
            firstSheetRow +
            ":" +
            letter +
            lastSheetRow +
            ',"<>100",' +
            letter +
            firstSheetRow +
            ":" +
            letter +
            lastSheetRow +
            ")"
        )
        .setNumberFormat("0.##");
    });

    if (dates.length) {
      sheet
        .getRange(subtotalRow, lastColumn)
        .setFormula(
          "=SUM(E" +
            subtotalRow +
            ":" +
            lineRosterColumnLetter(lastColumn - 1) +
            subtotalRow +
            ")"
        )
        .setNumberFormat("0.##");
    }
  });

  return groups.length;
}

function getLineRosterRowOrder(row) {
  const role = normalizeLineRosterGroupText(row.medicalRole);
  const unit = normalizeLineRosterGroupText(row.unit);
  const isAttached =
    unit.includes("מסופח") && unit.includes("תאגד");

  if (role.includes("מפרפואה")) return 0;
  if (
    unit.includes("סגלופיקודרפואי") ||
    role.includes("מפקדתאגד")
  ) {
    return 1;
  }
  if (role.includes("רופא") && !role.includes("פרמדיק")) return 2;
  if (role.includes("פרמדיק")) return 3;
  if (role.includes("מנהלאירוע")) return 4;
  if (isAttached) return 6;
  if (unit.includes("תאגד") || role.includes("חובש")) return 5;
  return 7;
}

function normalizeLineRosterGroupText(value) {
  return String(value || "")
    .replace(/[״׳'"`]/g, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("he");
}

function addLineRosterLegend(sheet, legend, startRow) {
  if (!legend.length) return;

  sheet
    .getRange(startRow, 1, 1, 3)
    .merge()
    .setValue("מקרא")
    .setBackground("#E2E8F0")
    .setFontWeight("bold");

  const rows = legend.map((item) => [
    item.code,
    item.label || "",
    item.color || defaultLineRosterColor(Number(item.code)),
  ]);

  sheet
    .getRange(startRow + 1, 1, rows.length, 3)
    .setValues(rows)
    .setBorder(true, true, true, true, true, true);

  rows.forEach((row, index) => {
    sheet
      .getRange(startRow + 1 + index, 1, 1, 3)
      .setBackground(row[2])
      .setFontWeight("bold");
  });
}

function formatLineRosterDate(isoDate) {
  const parts = String(isoDate).split("-");

  if (parts.length !== 3) return String(isoDate);

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  const weekdays = [
    "א׳",
    "ב׳",
    "ג׳",
    "ד׳",
    "ה׳",
    "ו׳",
    "ש׳",
  ];

  return weekdays[date.getDay()] + " " + parts[2] + "." + parts[1];
}

function defaultLineRosterColor(code) {
  if (code === 1) return "#86EFAC";
  if (code === 0) return "#34D399";
  if (code === 0.5) return "#FDE047";
  if (code === 100) return "#A855F7";
  if (code === 2) return "#FCA5A5";
  if (code === 3) return "#93C5FD";

  return "#E2E8F0";
}

function lineRosterColumnLetter(columnNumber) {
  let result = "";
  let current = columnNumber;

  while (current > 0) {
    current--;
    result =
      String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }

  return result;
}
