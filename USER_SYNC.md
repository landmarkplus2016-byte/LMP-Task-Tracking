# User Account Sync — Google Apps Script Build Guide

## What This Feature Does
Replaces the credentials-package approach with a live Google Sheet as the single
source of truth for user accounts. When any team member opens the app for the
first time on a new device, their account is fetched automatically from the Sheet
— no file sharing needed. The PM creates and manages accounts in the app exactly
as before; the app silently keeps the Sheet in sync. All task data stays local
in IndexedDB and never touches Google.

## Architecture
```
Google Sheet ("Users" tab)
         ↑ write (via Apps Script, runs as PM's Google account)
         ↓ read (anyone with the script URL)
Google Apps Script Web App (/exec URL)
         ↑ fetch()
         ↓ JSON response
PWA (src/utils/userSync.js)
         ↓ upsert
Local IndexedDB (users table)
         ↓
Login screen — works offline from cache after first load
```

## Files Produced by This Guide
```
google-apps-script/
├── Code.gs          ← Apps Script backend (deployed as Web App)
├── SETUP.md         ← Step-by-step deployment instructions for PM
src/utils/
└── userSync.js      ← PWA-side sync utility
App.jsx              ← modified startup logic (first launch + background sync)
src/pages/settings/UserAccounts.jsx  ← modified to write-through to Sheet
```

---

## Non-Negotiable Rules

**NEVER break these regardless of what Claude Code suggests:**

1. Tasks, catalogs, dropdown lists, and all app data stay in IndexedDB only.
   Google Sheet holds ONLY the users table. Nothing else ever goes to Google.

2. The app must work fully offline after first launch. If the Sheet is
   unreachable on subsequent opens, use the local cached users silently.
   Never block login because of a Sheet sync failure.

3. On first launch with empty DB and Sheet unreachable: show a clear retry
   screen. Never show the "Create PM account" wizard unless the correct
   setup code is entered. A coordinator must never be able to create a PM account.

4. All Sheet writes from the PWA are fire-and-forget with local fallback.
   If a write fails: save to pending queue in app_settings, show amber toast,
   retry silently on next app open. Never block the PM's UI waiting for Sheet.

5. The Apps Script URL is stored in app_settings (not hardcoded in source).
   PM pastes the URL in Settings → Sync & Shared Folder after deploying.

6. Never overwrite a user's password_hash from the Sheet if the user has
   already changed their password locally (must_change_password = false).
   Sheet is authoritative only for: name, email, role, prefix, is_active.
   Password hash sync direction: local → Sheet only (PM sets temp password
   in app → pushed to Sheet → coordinator pulls it once → they change it
   locally and it is never overwritten from Sheet again).

7. Upsert logic: match users by id field only. Never match by email or name.
   If a user id from the Sheet does not exist locally → insert.
   If it exists → update only the safe fields listed in Rule 6 above.

---

## What NOT To Do

- Do NOT store tasks or any task data in Google Sheets — ever
- Do NOT use Google Sheets API with OAuth — Apps Script Web App is the
  correct approach (no API keys, no OAuth, no secrets, simpler)
- Do NOT make Sheet sync blocking on the login screen for returning users
- Do NOT show raw error messages from the Apps Script response to end users
- Do NOT create separate sheets for different data types — one sheet, one
  tab, users only
- Do NOT retry failed Sheet writes in an infinite loop — queue once, retry
  once on next app open, that is enough
- Do NOT change anything about the existing task CRUD, import/merge, shared
  folder, or backup logic — this feature touches only user account flows
- Do NOT remove the PM setup code gate — it stays as last-resort fallback
  even though the Sheet handles normal first-launch

---

## Before You Start

- The main app build (Phases 1–3 of BUILD_GUIDE.md) must be complete
- User Accounts UI (Stage 3.2) must be complete
- You need a Google account to create the Sheet and deploy the script
- Have CLAUDE.md and this file open in VS Code before starting
- Complete stages in order — each one depends on the previous

---

## PHASE U1 — Apps Script Backend

*Goal: A deployed Apps Script Web App that reads and writes the Users sheet,
returning clean JSON responses*

### Stage U1.1 — Code.gs + SETUP.md
```
Read CLAUDE.md and USER_SYNC.md for full project context.

Create two files:

FILE 1: google-apps-script/Code.gs

Write a complete Google Apps Script that:

Constants at top:
  const SHEET_NAME = "Users";
  const COLUMNS = ["id","name","email","password_hash","role","prefix",
                   "is_active","must_change_password","created_at",
                   "deactivated_at","deactivated_by"];

doGet(e) — handles read requests:
  action = e.parameter.action
  if action === "getUsers":
    read all rows from Sheet (skip header row)
    convert each row to object using COLUMNS array
    return JSON array of all users
  else:
    return { success: false, error: "Unknown action" }

doPost(e) — handles write requests:
  parse body: const body = JSON.parse(e.postData.contents)

  if body.action === "createUser":
    validate body.user has: id, name, email, role, is_active
    append new row to sheet in COLUMNS order
    return { success: true, id: body.user.id }

  if body.action === "updateUser":
    find row where column "id" === body.user.id
    if not found: return { success: false, error: "User not found" }
    update all fields in that row from body.user
    return { success: true }

  if body.action === "deactivateUser":
    find row where column "id" === body.id
    if not found: return { success: false, error: "User not found" }
    set is_active = false
    set deactivated_at = new Date().toISOString()
    set deactivated_by = body.deactivated_by
    return { success: true }

  else:
    return { success: false, error: "Unknown action" }

Helper: rowToObject(row) — maps array of values to object using COLUMNS
Helper: findRowById(sheet, id) — returns { rowIndex, rowData } or null
Helper: jsonResponse(data) — returns ContentService output with JSON mime type

Error handling:
  Wrap entire doGet and doPost in try/catch
  catch: return jsonResponse({ success: false, error: e.toString() })

All responses go through jsonResponse() — never return raw values.


FILE 2: google-apps-script/SETUP.md

Write clear step-by-step setup instructions:

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
```

**Test gate before moving to U1.2:**
- [ ] Code.gs file exists in google-apps-script/ folder
- [ ] SETUP.md file exists with all 5 steps
- [ ] Code.gs has doGet and doPost functions
- [ ] Code.gs has COLUMNS constant at top
- [ ] Code.gs has try/catch on both handler functions
- [ ] All responses go through jsonResponse() helper
- [ ] No WRITE_SECRET or any secret/auth logic anywhere in Code.gs

---

## PHASE U2 — PWA Sync Utility

*Goal: A clean utility module the rest of the app calls for all Sheet
operations. No Sheet logic anywhere else — only through this file.*

### Stage U2.1 — userSync.js
```
Read CLAUDE.md and USER_SYNC.md for full project context.

Create src/utils/userSync.js

This is the only file in the PWA that communicates with Google Apps Script.
All other files that need Sheet sync call functions from this file only.
No secret constants. No auth logic. Just clean fetch calls.

Constants at top:
  const PENDING_SYNC_KEY = "pending_user_sync";
    // Key used in app_settings table for queued failed operations

---

Helper: getScriptUrl(db)
  reads app_settings key "apps_script_url" from IndexedDB
  returns the URL string or null if not set

---

fetchUsersFromSheet(db)
  Purpose: fetch all users from Sheet, return as array
  Steps:
    1. url = await getScriptUrl(db)
       if url is null or empty: throw new Error("SCRIPT_URL_NOT_CONFIGURED")
    2. response = await fetch(url + "?action=getUsers")
       if !response.ok: throw new Error("FETCH_FAILED: " + response.status)
    3. data = await response.json()
       return data (array of user objects)
  Throws on any failure — caller handles the error.

---

pushUserToSheet(db, action, payload)
  Purpose: send a write operation to the Sheet
  Steps:
    1. url = await getScriptUrl(db)
       if url is null: throw new Error("SCRIPT_URL_NOT_CONFIGURED")
    2. body = { action, ...payload }
    3. response = await fetch(url, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(body)
       })
    4. result = await response.json()
       if result.success === false: throw new Error(result.error)
    5. return result
  Throws on network error or success:false response.

---

syncUsersToLocal(db)
  Purpose: pull Sheet users into local IndexedDB (upsert)
  Steps:
    1. users = await fetchUsersFromSheet(db)
    2. for each user in users:
         existing = await db.users.get(user.id)
         if existing AND existing.must_change_password === false:
           // User has already set their own password — never overwrite it
           // Only update safe fields:
           await db.users.update(user.id, {
             name: user.name,
             email: user.email,
             role: user.role,
             prefix: user.prefix,
             is_active: user.is_active,
             deactivated_at: user.deactivated_at,
             deactivated_by: user.deactivated_by
           })
         else:
           // New user OR user who has not changed their temp password yet
           // Full upsert including password_hash and must_change_password
           await db.users.put(user)
    3. return { synced: users.length }
  Throws if fetchUsersFromSheet throws.

---

queueFailedSync(db, action, payload)
  Purpose: save a failed Sheet write to retry later
  Steps:
    1. existing = await db.app_settings.get(PENDING_SYNC_KEY)
    2. queue = existing ? JSON.parse(existing.value) : []
    3. queue.push({ action, payload, queued_at: new Date().toISOString() })
    4. await db.app_settings.put({
         key: PENDING_SYNC_KEY,
         value: JSON.stringify(queue),
         updated_at: new Date().toISOString()
       })

---

retryPendingSync(db)
  Purpose: attempt all queued operations on app open
  Steps:
    1. record = await db.app_settings.get(PENDING_SYNC_KEY)
       if none: return { retried: 0, remaining: 0 }
    2. queue = JSON.parse(record.value)
       if empty: return { retried: 0, remaining: 0 }
    3. successful = []
       for each item in queue:
         try:
           await pushUserToSheet(db, item.action, item.payload)
           successful.push(item)
         catch:
           // leave in queue, will retry next open
    4. remaining = queue.filter(item => !successful.includes(item))
    5. save remaining back to app_settings (delete key if empty)
    6. return { retried: successful.length, remaining: remaining.length }

---

Export all five functions as named exports.
No default export.
No React imports — this is a pure utility module.
No secret or auth logic anywhere in this file.
```

**Test gate before moving to U3:**
- [ ] userSync.js exists in src/utils/
- [ ] File has no React imports
- [ ] File has no secret or auth constants
- [ ] All five functions are exported as named exports
- [ ] syncUsersToLocal correctly skips password_hash update for users
      where must_change_password === false
- [ ] queueFailedSync appends to existing queue, does not overwrite it
- [ ] retryPendingSync removes only successful items from queue

---

## PHASE U3 — App Startup Logic

*Goal: First launch fetches accounts from Sheet automatically. Returning
users get a silent background refresh. PM setup code gate remains as
last-resort fallback.*

### Stage U3.1 — First Launch + Background Sync
```
Read CLAUDE.md and USER_SYNC.md for full project context.

Modify App.jsx startup logic. Do NOT change anything about task loading,
routing, or any other startup behaviour — only the user account init section.

Current behaviour to replace:
  Empty users table → show "Create PM account" wizard

New behaviour:

ON APP STARTUP — run this sequence before showing any screen:

Step 1: Count users in local IndexedDB
  userCount = await db.users.count()

Step 2a — First launch (userCount === 0):
  Show full-screen loading state:
    Centered spinner
    Text: "Loading your account..."
    No form, no buttons visible yet

  Try:
    await syncUsersToLocal(db)
    // Success — accounts loaded from Sheet
    setAppState("ready")  // proceed to login screen

  Catch error:
    if error.message === "SCRIPT_URL_NOT_CONFIGURED":
      setAppState("first_launch_no_script")
    else:
      // Network failure or Script error
      setAppState("first_launch_failed")

Step 2b — Returning user (userCount > 0):
  setAppState("ready") immediately — show login screen, do not wait
  Then in background (non-blocking, after login screen renders):
    try:
      await syncUsersToLocal(db)
      // Silent success — updated accounts now available locally
    catch:
      // Silent failure — use cached users, no error shown

---

App states and what to render:

"loading":
  Full screen centered spinner + "Loading your account..."

"first_launch_no_script":
  Full screen — two cards side by side:

  Left card:
    Icon: 📋
    Title: "I'm a team member"
    Body: "Ask your PM for the credentials package file."
    Button: [Load credentials package]
      → file picker, accepts .json only
      → validate file has type === "credentials_package"
      → invalid: toast error "Invalid file. Ask your PM for a
                 credentials package."
      → valid: for each user in file.users → db.users.put(user)
               apply file.app_settings to app_settings table
               toast success: "Account loaded. You can now log in."
               setAppState("ready")

  Right card:
    Icon: 🔧
    Title: "I'm the Project Manager"
    Body: "Set up the app for your team."
    Button: [PM Setup]
      → shows setup code input field: "Enter setup code"
      → hardcoded check: code must equal "LMP-SETUP-2026"
      → wrong code: shake animation + error "Incorrect setup code"
      → correct code: show existing create PM account form

  Small text at bottom of screen:
    "Already have the Apps Script URL?
     Set it up in Settings → Sync & Shared Folder after logging in."

"first_launch_failed":
  Full screen:
    Icon: ⚠ (amber)
    Title: "Could not load accounts"
    Body: "Check your internet connection and try again."
    Button: [Retry] → re-runs Step 2a from scratch

    Divider: "— or —"

    Link text: "Load credentials package instead"
      → same file picker and import logic as above

    Small text: "Are you the PM setting up for the first time?"
    Link: "PM Setup →"
      → same setup code gate as above

"ready":
  Normal login screen — no changes

---

Do NOT change the login form itself.
Do NOT change any routing logic after successful login.
Do NOT change anything about tasks, imports, or other startup checks.
```

**Test gate before moving to U4:**
- [ ] Opening app with empty DB shows loading spinner first
- [ ] Successful Sheet sync on first launch → login screen appears
- [ ] Script URL not configured → two-card screen appears
- [ ] Network failure → retry screen with amber warning appears
- [ ] [Retry] button re-attempts sync correctly
- [ ] PM Setup requires correct code — wrong code shows error, no form
- [ ] Correct setup code shows create PM account form
- [ ] Credentials package import populates users and shows success toast
- [ ] Invalid credentials file shows error toast
- [ ] Returning user (non-empty DB) → login screen appears immediately
- [ ] Background sync runs silently — no UI change visible to user

---

## PHASE U4 — Write-Through from User Accounts

*Goal: Every time PM creates, edits, or deactivates a user, the change
is pushed to the Sheet immediately. Failures queue silently.*

### Stage U4.1 — Write-Through on Create / Edit / Deactivate
```
Read CLAUDE.md and USER_SYNC.md for full project context.

Modify the User Accounts settings page (wherever user CRUD currently lives).
Do NOT change any UI, form validation, or local DB logic — only add Sheet
write-through calls after each successful local DB write.

Pattern to follow for every write operation:

  // 1. Local write first (existing code — do not change)
  await db.users.put(userData)

  // 2. Sheet write-through (new code to add after local save)
  try {
    await pushUserToSheet(db, "createUser", { user: userData })
    // silent success
  } catch (err) {
    await queueFailedSync(db, "createUser", { user: userData })
    showToast("User saved. Will sync to sheet when online.", "warning")
  }

Apply this pattern to all five user operations:

CREATE USER:
  action: "createUser"
  payload: { user: fullUserObject }
  Keep existing success toast. If sheet fails: also show amber toast.

UPDATE USER (edit name, email, or any field):
  action: "updateUser"
  payload: { user: fullUserObject }

DEACTIVATE USER:
  action: "deactivateUser"
  payload: { id: userId, deactivated_by: currentUser.name }

REACTIVATE USER:
  Treat as update:
  action: "updateUser"
  payload: { user: { ...userData, is_active: true,
             deactivated_at: null, deactivated_by: null } }

RESET PASSWORD:
  action: "updateUser"
  payload: { user: { ...userData, password_hash: newHash,
             must_change_password: true } }

Import at top of file:
  import { pushUserToSheet, queueFailedSync } from "../../utils/userSync"

Do NOT change:
  - Any form layout or validation
  - Any local IndexedDB operations
  - The deactivation confirmation dialog
  - The reassign tasks flow (tasks never touch the Sheet)
```

**Test gate before moving to U5:**
- [ ] Creating a user pushes new row to Sheet (verify in Sheet)
- [ ] Editing a user updates the correct row in Sheet
- [ ] Deactivating sets is_active=false in Sheet row
- [ ] Reactivating sets is_active=true in Sheet row
- [ ] Resetting password pushes new hash + must_change_password=true
- [ ] Sheet unreachable: local save succeeds, amber toast shown
- [ ] Amber toast text: "User saved. Will sync to sheet when online."
- [ ] Failed operations appear in app_settings pending_user_sync queue
- [ ] No changes to any task-related code

---

## PHASE U5 — Script URL Settings Field

*Goal: PM can paste the Apps Script URL in Settings. URL is stored in
app_settings and read at runtime — no code changes needed.*

### Stage U5.1 — Script URL Field in Settings
```
Read CLAUDE.md and USER_SYNC.md for full project context.

Modify Settings → Sync & Shared Folder section.
Add the Apps Script URL field at the very top of this section,
above the existing shared folder path input.

UI to add:

  Label: "Apps Script URL"
  Subtext: "Your deployed Google Apps Script Web App URL.
            Required for automatic user account sync across devices."

  Text input:
    Placeholder: "https://script.google.com/macros/s/.../exec"
    Full width
    Value loaded from app_settings key "apps_script_url" on mount

  Two buttons on same row as input:
    [Save URL]
      → writes value to app_settings key "apps_script_url"
      → toast: "Script URL saved."
    [Test connection]
      → calls fetchUsersFromSheet(db)
      → loading spinner on button while running
      → success: green toast "Connection successful. X users found."
      → failure: red toast "Connection failed. Check the URL."

  Status indicator below input:
    URL saved and non-empty → green dot + "Configured"
    URL empty or not saved  → amber dot + "Not configured — user sync disabled"

  Pending sync banner (only shown if queue is non-empty):
    Amber banner: "N user changes waiting to sync to Sheet."
    [Retry now] button
      → calls retryPendingSync(db)
      → toast: "X changes synced. N remaining."
      → refresh pending count after retry

Import at top of component:
  import { fetchUsersFromSheet, retryPendingSync } from "../../utils/userSync"

This section is PM only — confirm existing RoleGuard covers it.
Do NOT change any other part of Sync & Shared Folder section.
```

**Test gate before moving to U6:**
- [ ] Script URL field appears at top of Sync & Shared Folder section
- [ ] URL saves and reloads correctly after page refresh
- [ ] Test connection shows loading state on button while running
- [ ] Successful test shows user count in green toast
- [ ] Failed test shows red toast
- [ ] Green status dot when URL is configured
- [ ] Amber status dot when URL is empty
- [ ] Pending sync banner appears only when queue has items
- [ ] Retry now clears successfully synced items from queue
- [ ] Section only visible to PM

---

## PHASE U6 — Credentials Package Export (Offline Fallback)

*Goal: PM can export a small credentials file as a fallback for team
members who cannot reach the Sheet on first launch.*

### Stage U6.1 — Export Credentials Package
```
Read CLAUDE.md and USER_SYNC.md for full project context.

Add "Export Credentials Package" button to Settings → User Accounts.
Place it in the top-right area, near the existing Add buttons.
Visible to PM only.

On click:
  1. Load all users from local IndexedDB (including inactive)
  2. Load all records from app_settings table
  3. Build export object:
     {
       type: "credentials_package",
       exported_at: new Date().toISOString(),
       exported_by: currentUser.name,
       version: "1.0",
       users: [ ...allUsers ],
       app_settings: { ...allSettings }
     }
  4. Filename: credentials_[YYYY-MM-DD].json
  5. Trigger JSON file download
  6. Toast: "Credentials package exported.
             Share this file with anyone who cannot load accounts
             automatically on first launch."

Do NOT include tasks, catalogs, audit_log, or any other data.
File must stay small — users table only.
No other changes to the User Accounts page.
```

**Test gate — full feature complete:**
- [ ] Export button visible on User Accounts page (PM only)
- [ ] Exported file has type: "credentials_package"
- [ ] File contains users array with all users including inactive
- [ ] File contains app_settings
- [ ] File does NOT contain tasks or any other data
- [ ] Filename: credentials_[YYYY-MM-DD].json
- [ ] File can be imported on first-launch screen successfully
- [ ] Full end-to-end test:
      PM creates coordinator → row in Sheet → open incognito →
      coordinator account loads → login with temp password → 
      change password → coordinator view appears ✅

---

## Quick Reference

| Function | Purpose | Called from |
|---|---|---|
| syncUsersToLocal(db) | Pull Sheet → local DB | App.jsx startup |
| fetchUsersFromSheet(db) | Read Sheet users | syncUsersToLocal, Test button |
| pushUserToSheet(db, action, payload) | Write to Sheet | UserAccounts after every save |
| queueFailedSync(db, action, payload) | Save failed write for later | UserAccounts on catch |
| retryPendingSync(db) | Retry queued writes | App.jsx startup + Retry button |

---

## Flow Summary — First Launch (New Device)

```
Open app → empty DB
        ↓
syncUsersToLocal() called automatically
        ↓
Sheet reachable?
  YES → users loaded into local DB → login screen → done
  NO, URL not set → two-card screen (team member / PM setup)
  NO, network fail → retry screen with fallback options
        ↓
After first successful login:
  background sync runs silently on every subsequent app open
  new accounts added by PM appear automatically
```

## Flow Summary — PM Adds New Coordinator

```
PM fills create coordinator form → clicks Save
        ↓
Write to local IndexedDB (instant)
        ↓
pushUserToSheet() called
        ↓
  Success → silent (row appears in Sheet)
  Failure → queueFailedSync() → amber toast shown to PM
        ↓
Next app open → retryPendingSync() clears the queue
        ↓
Coordinator opens app on their device
        ↓
Background sync pulls new user row from Sheet into their local DB
        ↓
Coordinator logs in with temp password → forced password change → done
```
