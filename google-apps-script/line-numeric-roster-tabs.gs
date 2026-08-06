/**
 * הוספה לסקריפט Google Sheets הקיים.
 *
 * בתוך doPost(e), מיד אחרי JSON.parse, יש להוסיף:
 *
 * if (payload.action === 'syncLineNumericRoster') {
 *   return jsonResponse_(handleLineNumericRoster_(payload));
 * }
 *
 * אם המשתנה אצלך נקרא data במקום payload, החלף את payload ב-data.
 */

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleLineNumericRoster_(payload) {
  if (!payload || !Array.isArray(payload.dates) || !Array.isArray(payload.rows)) {
    throw new Error('Invalid syncLineNumericRoster payload');
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    var spreadsheetId = PropertiesService.getScriptProperties()
      .getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('No active spreadsheet. Set SPREADSHEET_ID in Script properties.');
    }
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  }

  var requestedName = String(payload.sheetName || payload.cycleTitle || 'סידור קו');
  var sheetName = requestedName
    .replace(/[\\/?*\[\]:]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'סידור קו';
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  sheet.clear();
  sheet.setRightToLeft(true);

  var dates = payload.dates.map(String);
  var headers = ['מספר אישי', 'שם מלא', 'תפקיד', 'יחידה']
    .concat(dates.map(formatRosterDate_))
    .concat(['סה״כ']);
  var dataRows = payload.rows.map(function (row) {
    var values = Array.isArray(row.values) ? row.values.slice(0, dates.length) : [];
    while (values.length < dates.length) values.push('');
    return [row.personalId || '', row.fullName || '', row.medicalRole || '', row.unit || '']
      .concat(values.map(function (value) {
        return value === null || typeof value === 'undefined' ? '' : value;
      }))
      .concat(['']);
  });
  var table = [headers].concat(dataRows);
  var lastColumn = headers.length;
  var lastDataRow = dataRows.length + 1;

  sheet.getRange(1, 1, table.length, lastColumn).setValues(table);

  if (dataRows.length) {
    var firstDateColumn = 5;
    var lastDateColumn = firstDateColumn + dates.length - 1;
    var totalColumn = lastColumn;
    var formulas = dataRows.map(function (_, index) {
      var rowNumber = index + 2;
      return ['=SUM(' + columnLetter_(firstDateColumn) + rowNumber + ':' +
        columnLetter_(lastDateColumn) + rowNumber + ')'];
    });
    sheet.getRange(2, totalColumn, formulas.length, 1).setFormulas(formulas);
  }

  var headerRange = sheet.getRange(1, 1, 1, lastColumn);
  headerRange
    .setBackground('#1E3A5F')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  if (dataRows.length) {
    var bodyRange = sheet.getRange(2, 1, dataRows.length, lastColumn);
    bodyRange
      .setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID)
      .setVerticalAlignment('middle');
    sheet.getRange(2, 1, dataRows.length, 4)
      .setBackground('#F8FAFC')
      .setFontWeight('bold');
    sheet.getRange(2, 5, dataRows.length, dates.length)
      .setHorizontalAlignment('center')
      .setFontWeight('bold');

    var colorByCode = {};
    (payload.legend || []).forEach(function (item) {
      var key = String(item.code);
      colorByCode[key] = item.color || defaultRosterColor_(Number(item.code));
    });
    var dateBackgrounds = dataRows.map(function (row) {
      return row.slice(4, 4 + dates.length).map(function (value) {
        if (value === '' || value === null || typeof value === 'undefined') return '#FFFFFF';
        return colorByCode[String(value)] || defaultRosterColor_(Number(value));
      });
    });
    sheet.getRange(2, 5, dataRows.length, dates.length).setBackgrounds(dateBackgrounds);
    sheet.getRange(2, lastColumn, dataRows.length, 1)
      .setBackground('#DBEAFE')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }

  if (sheet.getFilter()) sheet.getFilter().remove();
  if (lastDataRow >= 2) sheet.getRange(1, 1, lastDataRow, lastColumn).createFilter();

  sheet.setColumnWidth(1, 105);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 165);
  sheet.setColumnWidth(4, 135);
  dates.forEach(function (_, index) { sheet.setColumnWidth(index + 5, 72); });
  sheet.setColumnWidth(lastColumn, 85);

  var legend = Array.isArray(payload.legend) ? payload.legend : [];
  if (legend.length) {
    var legendStart = lastDataRow + 3;
    sheet.getRange(legendStart, 1, 1, 3)
      .merge()
      .setValue('מקרא')
      .setBackground('#E2E8F0')
      .setFontWeight('bold');
    var legendRows = legend.map(function (item) {
      return [item.code, item.label || '', item.color || defaultRosterColor_(Number(item.code))];
    });
    var legendRange = sheet.getRange(legendStart + 1, 1, legendRows.length, 3);
    legendRange.setValues(legendRows);
    legendRange.setBorder(true, true, true, true, true, true);
    legendRows.forEach(function (row, index) {
      sheet.getRange(legendStart + 1 + index, 1, 1, 3)
        .setBackground(row[2])
        .setFontWeight('bold');
    });
  }

  sheet.getRange('A1').setNote(
    'קו: ' + String(payload.cycleTitle || '') + '\n' +
    'תקופה: ' + String(payload.startDate || '') + ' עד ' + String(payload.endDate || '') + '\n' +
    'עודכן: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
  );

  SpreadsheetApp.flush();
  return {
    ok: true,
    action: 'syncLineNumericRoster',
    sheetName: sheetName,
    soldierCount: dataRows.length,
    dateCount: dates.length
  };
}

function formatRosterDate_(isoDate) {
  var parts = String(isoDate).split('-');
  if (parts.length !== 3) return String(isoDate);
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var weekdays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  return weekdays[date.getDay()] + ' ' + parts[2] + '.' + parts[1];
}

function defaultRosterColor_(code) {
  if (code === 1) return '#86EFAC';
  if (code === 0) return '#34D399';
  if (code === 0.5) return '#FDE047';
  if (code === 100) return '#A855F7';
  if (code === 2) return '#FCA5A5';
  if (code === 3) return '#93C5FD';
  return '#E2E8F0';
}

function columnLetter_(columnNumber) {
  var result = '';
  var current = columnNumber;
  while (current > 0) {
    current--;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}
