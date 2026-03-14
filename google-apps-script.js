// ============================================================
// סושי הבית - Google Apps Script API
// Paste into Extensions > Apps Script in your Google Spreadsheet
// ============================================================

var EMAIL_TO    = 'YOUR_EMAIL@gmail.com';  // <-- your email
var ADMIN_PASS  = 'YOUR_ADMIN_PASSWORD';   // <-- choose a password for the admin console

// Sheet names
var SHEET_ORDERS = 'הזמנות';
var SHEET_AVAIL  = 'זמינות';

// ---- Entry points ----------------------------------------

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'newOrder';

    if (action === 'getOrders')         return authWrap(data, getOrders);
    if (action === 'setAvailability')   return authWrap(data, function() { return setAvailability(data.availability, data.weekLabel); });
    if (action === 'updateOrderStatus') return authWrap(data, function() { return updateOrderStatus(data.row, data.status); });
    if (action === 'getAvailability')   return respond(getAvailability());
    if (action === 'newOrder')          return respond(saveOrder(data));

    return respond({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return respond({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  // Public endpoint — only exposes availability (no auth needed)
  return respond(getAvailability());
}

// ---- Auth wrapper ----------------------------------------

function authWrap(data, fn) {
  if (data.password !== ADMIN_PASS) {
    return respond({ status: 'error', message: 'unauthorized' });
  }
  return respond(fn());
}

// ---- Orders -----------------------------------------------

function saveOrder(data) {
  var sheet = getOrCreateSheet(SHEET_ORDERS, [
    'תאריך', 'שם', 'טלפון', 'כתובת', 'יום משלוח',
    'גודל מגש', 'סוג דג', 'הורדת פריטים', 'בקשות', 'סטטוס'
  ]);

  var timestamp = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

  sheet.appendRow([
    timestamp,
    data.name,
    data.phone    || '',
    data.address  || '',
    data.day      || '',
    data.platter  || '',
    data.fish     || '',
    data.remove   || '',
    data.notes    || '',
    'חדש'
  ]);

  // Email notification
  var subject = 'הזמנה חדשה - ' + data.name + ' | סושי הבית';
  var body =
    '🍣 הזמנה חדשה התקבלה!\n\n' +
    'שם: '          + data.name             + '\n' +
    'טלפון: '       + (data.phone    || '-') + '\n' +
    'כתובת: '       + (data.address  || '-') + '\n' +
    'יום משלוח: '   + (data.day      || '-') + '\n' +
    'גודל מגש: '    + (data.platter  || '-') + ' יחידות\n' +
    'סוג דג: '      + (data.fish     || '-') + '\n' +
    'הורדת פריטים: '+ (data.remove   || 'ללא') + '\n' +
    'בקשות: '       + (data.notes    || 'ללא') + '\n\n' +
    'תאריך: ' + timestamp + '\n\n' +
    '🔗 ניהול הזמנות: https://wreuven.github.io/sushi/admin.html';

  MailApp.sendEmail(EMAIL_TO, subject, body);

  return { status: 'ok' };
}

function getOrders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet || sheet.getLastRow() < 2) return { status: 'ok', orders: [] };

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var orders = rows.map(function(r, i) {
    return {
      row:        i + 2,
      timestamp:  r[0],
      name:       r[1],
      phone:      r[2],
      address:    r[3],
      day:        r[4],
      platter:    r[5],
      fish:       r[6],
      remove:     r[7],
      notes:      r[8],
      status:     r[9]
    };
  });

  return { status: 'ok', orders: orders };
}

function updateOrderStatus(row, status) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) return { status: 'error', message: 'Orders sheet not found' };
  sheet.getRange(row, 10).setValue(status);
  return { status: 'ok' };
}

// ---- Availability -----------------------------------------

function setAvailability(days, weekLabel) {
  var sheet = getOrCreateSheet(SHEET_AVAIL, [
    'יום', 'שם תצוגה', 'דדליין', 'משלוח מ', 'משלוח עד', 'פעיל'
  ]);

  // Clear existing data rows
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }

  // Write week label in A1 description cell if desired
  // (we store weekLabel as first row data with special day value)
  sheet.appendRow(['__weekLabel__', weekLabel || '', '', '', '', true]);

  days.forEach(function(d) {
    sheet.appendRow([d.day, d.label, d.deadline, d.deliveryStart, d.deliveryEnd, d.active]);
  });

  return { status: 'ok' };
}

function getAvailability() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AVAIL);
  if (!sheet || sheet.getLastRow() < 2) {
    return { status: 'ok', weekLabel: '', days: [] };
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  var weekLabel = '';
  var days = [];

  rows.forEach(function(r) {
    if (r[0] === '__weekLabel__') {
      weekLabel = r[1];
    } else {
      days.push({
        day:           r[0],
        label:         r[1],
        deadline:      formatTime(r[2]),
        deliveryStart: formatTime(r[3]),
        deliveryEnd:   formatTime(r[4]),
        active:        r[5] === true || r[5] === 'TRUE'
      });
    }
  });

  return { status: 'ok', weekLabel: weekLabel, days: days };
}

// ---- Helpers ----------------------------------------------

function formatTime(val) {
  if (!val) return '';
  // Google Sheets returns time cells as Date-like objects;
  // use duck typing instead of instanceof to handle Apps Script's runtime.
  if (typeof val.getHours === 'function') {
    var h = String(val.getHours()).padStart(2, '0');
    var m = String(val.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }
  return String(val);
}

function getOrCreateSheet(name, headers) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
