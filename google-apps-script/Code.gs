/**
 * Project Tracker — User Sync Apps Script Backend
 *
 * This script is the ONLY bridge between the PWA and Google Sheets.
 * It manages a single sheet tab ("Users") that holds user account
 * records only. No task data, no catalogs, no audit log — users only.
 *
 * Deploy as a Web App (Execute as: Me, Who has access: Anyone).
 * See SETUP.md in this folder for full deployment steps.
 */

const SHEET_NAME = "Users";
const COLUMNS = [
  "id", "name", "email", "password_hash", "role", "prefix",
  "is_active", "must_change_password", "created_at",
  "deactivated_at", "deactivated_by"
];

/**
 * Handles read requests.
 * GET ?action=getUsers → returns JSON array of all users.
 */
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === "getUsers") {
      const sheet = getSheet();
      const rows = sheet.getDataRange().getValues();
      const users = [];

      // Skip header row (index 0)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Skip fully blank rows
        if (row.every(function (cell) { return cell === ""; })) continue;
        users.push(rowToObject(row));
      }

      return jsonResponse(users);
    }

    return jsonResponse({ success: false, error: "Unknown action" });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handles write requests.
 * POST body: { action: "createUser" | "updateUser" | "deactivateUser", ... }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = getSheet();

    if (body.action === "createUser") {
      return jsonResponse(handleCreateUser(sheet, body));
    }

    if (body.action === "updateUser") {
      return jsonResponse(handleUpdateUser(sheet, body));
    }

    if (body.action === "deactivateUser") {
      return jsonResponse(handleDeactivateUser(sheet, body));
    }

    return jsonResponse({ success: false, error: "Unknown action" });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Appends a new user row in COLUMNS order.
 */
function handleCreateUser(sheet, body) {
  const user = body.user;

  if (!user || !user.id || !user.name || !user.email || !user.role || user.is_active === undefined) {
    return { success: false, error: "Missing required user fields" };
  }

  const newRow = COLUMNS.map(function (col) {
    return user[col] !== undefined && user[col] !== null ? user[col] : "";
  });

  sheet.appendRow(newRow);

  return { success: true, id: user.id };
}

/**
 * Updates every field of the row matching body.user.id.
 */
function handleUpdateUser(sheet, body) {
  const user = body.user;

  if (!user || !user.id) {
    return { success: false, error: "Missing user id" };
  }

  const found = findRowById(sheet, user.id);
  if (!found) {
    return { success: false, error: "User not found" };
  }

  const updatedRow = COLUMNS.map(function (col, idx) {
    return user[col] !== undefined ? user[col] : found.rowData[idx];
  });

  sheet.getRange(found.rowIndex, 1, 1, COLUMNS.length).setValues([updatedRow]);

  return { success: true };
}

/**
 * Sets is_active = false and stamps deactivation metadata for the
 * row matching body.id.
 */
function handleDeactivateUser(sheet, body) {
  if (!body.id) {
    return { success: false, error: "Missing user id" };
  }

  const found = findRowById(sheet, body.id);
  if (!found) {
    return { success: false, error: "User not found" };
  }

  const isActiveCol = COLUMNS.indexOf("is_active") + 1;
  const deactivatedAtCol = COLUMNS.indexOf("deactivated_at") + 1;
  const deactivatedByCol = COLUMNS.indexOf("deactivated_by") + 1;

  sheet.getRange(found.rowIndex, isActiveCol).setValue(false);
  sheet.getRange(found.rowIndex, deactivatedAtCol).setValue(new Date().toISOString());
  sheet.getRange(found.rowIndex, deactivatedByCol).setValue(body.deactivated_by || "");

  return { success: true };
}

/**
 * Returns the "Users" sheet from the active spreadsheet.
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet tab "' + SHEET_NAME + '" not found');
  }
  return sheet;
}

/**
 * Maps a single row (array of cell values) to an object using COLUMNS.
 */
function rowToObject(row) {
  const obj = {};
  COLUMNS.forEach(function (col, idx) {
    obj[col] = row[idx] !== undefined ? row[idx] : "";
  });
  return obj;
}

/**
 * Finds the row matching the given id in the "id" column.
 * Returns { rowIndex, rowData } (rowIndex is 1-based, sheet-relative)
 * or null if not found.
 */
function findRowById(sheet, id) {
  const rows = sheet.getDataRange().getValues();
  const idCol = COLUMNS.indexOf("id");

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(id)) {
      return { rowIndex: i + 1, rowData: rows[i] };
    }
  }

  return null;
}

/**
 * Wraps any response object as JSON ContentService output.
 * All doGet/doPost paths must return through this helper.
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
