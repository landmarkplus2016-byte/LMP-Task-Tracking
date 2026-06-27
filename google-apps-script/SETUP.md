# Apps Script User Sync — Setup Guide

This guide walks the PM through deploying the Google Apps Script backend
that keeps user accounts in sync across devices. Only the **Users** sheet
tab is ever touched — no task data, catalogs, or other app data goes to
Google.

## Deploying the Apps Script

### Step 1 — Create the Google Sheet
1. Go to sheets.google.com → create new spreadsheet
2. Rename it: "Project Tracker Users"
3. Rename Sheet1 tab to: "Users"
4. Add header row in row 1 with these exact column names (A to K):
   id | name | email | password_hash | role | prefix |
   is_active | must_change_password | created_at |
   deactivated_at | deactivated_by

### Step 2 — Add the Script
1. In the Sheet: Extensions → Apps Script
2. Delete all existing code in Code.gs
3. Paste the full contents of Code.gs from this folder
4. Click Save (floppy disk icon or Ctrl+S)

### Step 3 — Deploy as Web App
1. Click Deploy → New deployment
2. Click the gear icon next to "Type" → select Web App
3. Description: "Project Tracker User Sync v1"
4. Execute as: Me
5. Who has access: Anyone
6. Click Deploy
7. Click Authorize access → choose your Google account → Allow
8. Copy the Web App URL (ends in /exec)

### Step 4 — Configure the PWA
1. Open Project Tracker app → Settings → Sync & Shared Folder
2. Paste the /exec URL into "Apps Script URL" field
3. Click Save
4. Click "Test connection" — should show "Connection successful"
5. Done — all team members will now get accounts automatically
   on first launch

### Step 5 — Test
1. The Users tab in the Sheet should be empty (just the header row)
2. Create a coordinator account in the app
   → a new row should appear in the Sheet immediately
3. Open the app in an incognito window (simulates empty local DB)
   → the coordinator account should load automatically

### Redeploying after code changes
If you ever need to update Code.gs:
  Deploy → Manage deployments → Edit (pencil icon) → Version: New version
  → Deploy
  The /exec URL stays the same — no need to update the app

### Troubleshooting
- "Script not found": check the URL is the /exec version not /dev
- Sheet not updating: check the Sheet tab is named exactly "Users"
- "Authorization required": re-deploy and click Authorize access again
- CORS error: Apps Script handles CORS automatically — if you see this
  the script is not deployed correctly (re-check Step 3)
