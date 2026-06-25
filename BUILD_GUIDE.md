# Build Guide — Project Tracker PWA
> Your step-by-step manual for building the app from zero to live.
> Work through this top to bottom. Check off every item as you go.
> Never skip a test. Never move to the next step if a test fails.

---

## Before You Write a Single Line of Code

### One-time setup checklist
- [ ] Create a GitHub repository named `project-tracker` (public)
- [ ] Enable GitHub Pages: Settings → Pages → Deploy from main branch → / (root)
- [ ] Create your project folder: `project-tracker`
- [ ] Drop `CLAUDE.md` into the root of that folder
- [ ] Drop `BUILD_GUIDE.md` into the root of that folder
- [ ] Drop `DESIGN_SPEC.md` into the root of that folder
- [ ] Create the full folder structure as defined in the File Map section of `CLAUDE.md` — empty files only
- [ ] Open the folder in VS Code
- [ ] Connect the local folder to the GitHub repository
- [ ] Verify GitHub Pages URL is live: `https://[username].github.io/project-tracker`

### First message to Claude Code — copy and paste this exactly:
```
Read CLAUDE.md first and confirm you understand the project before writing any code.
Then read DESIGN_SPEC.md and describe back to me:
- The two fonts used and where each is applied
- The sidebar background color and expanded width
- What color PM field column headers use
- The three status badge colors (Done, Assigned, Cancelled)
Then describe: the tech stack, the four roles and what each can do,
the file structure, and the three most important business rules.
Then create the full folder and file structure as defined in the File Map section —
empty files only, no code yet. Do not write any logic until I confirm the structure looks correct.
```

### After structure is created — verify before moving on:
- [ ] All folders exist: `js/`, `css/`, `assets/`
- [ ] All JS files listed in the File Map exist and are empty
- [ ] All CSS files exist and are empty
- [ ] `index.html`, `manifest.json`, `sw.js` exist in root
- [ ] `CLAUDE.md` and `BUILD_GUIDE.md` are in the root
- [ ] No code has been written yet

---

## Stage 1 — App Shell + Database + Auth

**Goal:** App loads in browser, database initializes, PM setup wizard runs once, login works, role-based nav renders correctly, GitHub Pages deployment works.

---

### Step 1.1 — index.html + CDN dependencies

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md. We are on Stage 1, Step 1.
Build index.html — the app shell only.

index.html must:
- Load IBM Plex Sans + IBM Plex Mono from Google Fonts (exact URL in DESIGN_SPEC.md section 2)
- Load all CDN dependencies in this exact order:
  1. Tailwind CSS play CDN
  2. Dexie.js 3.2.4 from cdnjs
  3. SheetJS (xlsx) 0.18.5 from cdnjs
  4. Chart.js 4.4.1 from cdnjs
  5. PapaParse 5.4.1 from cdnjs
  6. Then all local CSS files: styles.css, mobile.css, desktop.css
  7. Then all local JS files in the exact order from CLAUDE.md File Map
- Show a loading screen on launch (simple centered spinner + "Loading...")
- Contain a single <div id="app"> where all views are rendered
- Contain a <nav id="nav"> for sidebar or bottom tabs
- No visible content until JS runs — the shell is just the container

css/styles.css must:
- Define ALL CSS variables from DESIGN_SPEC.md section 3 (Color Tokens) exactly as written:
  --bg, --surface, --surface-2, --sidebar, --sidebar-2,
  --ink, --ink-2, --ink-3, --line, --line-2,
  --accent, --accent-ink, --accent-bg,
  --green, --green-bg, --blue, --blue-bg, --red, --red-bg,
  --amber, --amber-bg, --slate, --slate-bg
- Define shape tokens from DESIGN_SPEC.md section 4: --radius, --radius-sm, all three --shadow-* values
- Define font tokens from DESIGN_SPEC.md section 2: --font-sans, --font-mono
- Add custom scrollbar styles from DESIGN_SPEC.md section 5
- Add .fade-in and .scale-in animation keyframes from DESIGN_SPEC.md section 6.10
- Add .mono and .num utility classes from DESIGN_SPEC.md section 2
- Apply -webkit-font-smoothing: antialiased on body
- One breakpoint rule: sidebar hidden + bottom-nav shown below 900px, reversed above 900px
- Base reset and font setup using --font-sans
```

**Tests for Step 1.1:**
- [ ] Open `index.html` in Chrome — loading spinner appears
- [ ] No 404 errors in Network tab (all CDN scripts load)
- [ ] `window.Dexie` is defined in console
- [ ] `window.XLSX` is defined in console
- [ ] `window.Chart` is defined in console
- [ ] `window.Papa` is defined in console
- [ ] CSS variables visible in DevTools (--color-primary etc.)

---

### Step 1.2 — Database schema + seed (`js/db.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 1, Step 2.
Build js/db.js — the Dexie.js database instance, full schema, and first-run seed.

db.js must:
- Create a Dexie database named ProjectTrackerDB version 1
- Define all tables with indexes exactly as listed in CLAUDE.md under Database Schema
- Export the db instance as window.db so all other JS files can use it
- Define a runSeed() function:
  Check if users table is empty
  If empty: create the PM setup wizard — do NOT auto-create any account
  If not empty: skip
- Define a purgeSoftDeleted() function:
  Find all tasks where is_deleted = true AND deleted_at < (now - 10 days)
  Hard delete those records from db
  Log purge count to app_settings: { key: 'last_purge', value: { timestamp, count } }
- Run purgeSoftDeleted() on every app startup
```

**Tests for Step 1.2:**
- [ ] Open app → no console errors
- [ ] In console: `await db.users.count()` returns 0
- [ ] In console: `await db.tasks.count()` returns 0
- [ ] In DevTools → Application → IndexedDB → ProjectTrackerDB → all tables visible
- [ ] All table indexes visible in DevTools

---

### Step 1.3 — Auth + Login screen (`js/auth.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 1, Step 3.
Build js/auth.js — login screen, setup wizard, password change, session management.

utils.js must first have:
- hashPassword(plain): uses Web Crypto API SubtleCrypto.digest('SHA-256') → returns hex string
- All other utils functions can be stubbed for now

auth.js must:
- getCurrentUser(): parse pt_user from localStorage → return user object or null
- requireRole(roles[]): if getCurrentUser().role not in roles → redirect to dashboard
- logout(): remove pt_user from localStorage → render login screen

Setup wizard (shown when users table is empty):
- Centered card: "Welcome to Project Tracker. Create your PM account."
- Fields: Full Name, Email, Password, Confirm Password
- Validation: all required, passwords match, min 8 characters
- On submit: hash password → insert user { name, email, password_hash, role: 'project_manager',
  is_active: true, must_change_password: false, created_at: now }
- Auto-login after creation → render PM dashboard
- Wizard never shown again once a user exists

Login screen must:
- Show Email field + Password field + Sign In button
- On submit: hash password → look up email in db.users →
  a) No match → show error "Invalid email or password"
  b) match but is_active = false → show error "Account is deactivated. Contact PM."
  c) match + must_change_password = true → show change password screen
  d) match → store { id, name, role, prefix } in localStorage pt_user → render home screen

Change password screen:
- New password + Confirm password fields
- Validate: min 8 chars, both match
- On submit: update password_hash in db, set must_change_password = false → render home screen
- Cannot be skipped — back button returns to login

Apply clean professional styling with Tailwind — centered card layout, consistent with --color-primary.
```

**Tests for Step 1.3:**
- [ ] First open: setup wizard appears (no login form)
- [ ] Create PM account → auto-logged in → see dashboard placeholder
- [ ] Reload page → goes directly to login (session not persisted across tab close — localStorage clears? No: check that pt_user persists across refresh)
- [ ] Login with correct credentials → dashboard shown
- [ ] Login with wrong password → error message shown
- [ ] Login with deactivated account → correct error shown
- [ ] must_change_password flow: can't skip, password rules enforced
- [ ] logout() → pt_user removed from localStorage → login screen shown

---

### Step 1.4 — App router + role-based nav (`js/app.js`)

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md sections 8.1 and 8.2. Stage 1, Step 4.
Build js/app.js — app initialization, router, and role-based navigation.
Apply the sidebar and topbar exactly as specified in DESIGN_SPEC.md sections 8.1 and 8.2.

app.js must:
- init(): called on page load
  1. Run db.js purgeSoftDeleted()
  2. Run db.js runSeed() — shows wizard if empty
  3. Check auth.js getCurrentUser() — if null → render login screen, stop
  4. If user found → renderNav() → renderCurrentRoute()
- renderNav(): check window.innerWidth >= 900
  Desktop (≥900px): render left sidebar with nav items filtered by role
  Mobile (<900px): render bottom tab bar with nav items filtered by role
  Nav items by role:
    ALL roles: Dashboard, Tasks, Settings
    Coordinators only: "My Tasks" label, Export button
    PM only: Import, Reports
    AM + CCM only: Reports
- hash-based router: listen to window.location.hash changes
  #dashboard → renderDashboard()
  #tasks → renderTasks()
  #import → renderImport() [PM only — redirect others]
  #reports → renderReports() [master roles only]
  #settings → renderSettings()
  default/empty → #dashboard
- Each render function is stubbed for now — just shows "<h1>Page Name</h1>"
- Active nav item highlighted based on current hash
```

**Tests for Step 1.4:**
- [ ] Login as PM → sidebar appears on desktop (≥900px)
- [ ] Resize window below 900px → bottom tab bar appears, sidebar hidden
- [ ] Resize back above 900px → sidebar returns
- [ ] Click each nav item → hash changes → correct placeholder renders
- [ ] Direct URL to #import as coordinator → redirected to #dashboard
- [ ] Active nav item highlighted correctly on each route
- [ ] PM sees Import in nav — coordinator does not

---

### Step 1.5 — GitHub Pages deployment

**Prompt:**
```
Read CLAUDE.md. Stage 1, Step 5.
Set up GitHub Pages deployment.

Create .github/workflows/deploy.yml:
- Trigger: push to main branch
- Steps: checkout repo → copy all files to Pages → deploy
- No build step needed — files are served as-is (no npm, no Vite)

Create a .gitignore:
- .DS_Store
- Thumbs.db
- *.log

Update manifest.json:
- name: "Project Tracker"
- short_name: "Tracker"
- display: "standalone"
- start_url: "/project-tracker/"
- theme_color: "#0066CC"
- background_color: "#ffffff"
- icons: 192x192 and 512x512 (reference assets/icon-192.png and assets/icon-512.png)

Create placeholder icons in assets/ (simple colored squares are fine for now)

Update index.html:
- Add <link rel="manifest" href="manifest.json">
- Add <meta name="theme-color" content="#0066CC">
```

**Tests for Step 1.5:**
- [ ] Push to main → GitHub Actions workflow runs without errors
- [ ] App loads at `https://[username].github.io/project-tracker`
- [ ] Login works on GitHub Pages URL
- [ ] Chrome DevTools → Application → Manifest → no errors

### ✅ Stage 1 Complete — Full check before moving on:
- [ ] App loads from GitHub Pages URL
- [ ] Setup wizard runs once on empty database
- [ ] Login works with correct credentials
- [ ] Wrong credentials show error
- [ ] must_change_password flow enforced — cannot skip
- [ ] Role-based nav renders correctly for each role
- [ ] Hash router works — all routes render correct placeholder
- [ ] Coordinator cannot access #import route
- [ ] Logout clears session and returns to login
- [ ] IndexedDB visible in DevTools with all tables

---

## Stage 2 — Task CRUD + Forms

**Goal:** Coordinators can add, edit, soft delete, and recover their own tasks. All required field validation works. Job code uniqueness validated. Task IDs generate correctly.

---

### Step 2.1 — ID generator + validators (`js/utils.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 2, Step 1.
Build the utility functions in js/utils.js.

hashPassword(plain) — already built in Stage 1, keep it.

generateTaskId(prefix):
- Format: PREFIX-YYMMDDHHMMSS-seq (see CLAUDE.md ID Generation section for exact code)
- seq: per-coordinator per-day counter stored in app_settings
- Returns full ID string

validateJobCode(jobCode, physicalSiteId, allTasks, currentTaskId):
- Implements the rule from CLAUDE.md Job Code Validation
- Returns { valid: bool, error: string|null }

validateRequiredFields(formData):
- Checks all required fields listed in CLAUDE.md Required Fields section
- Returns { valid: bool, errors: { fieldName: errorMessage } }

formatDate(date):
- Returns DD/MM/YYYY string

formatDateISO(date):
- Returns YYYY-MM-DD string

parseCSV(csvString):
- Uses PapaParse (window.Papa) to parse CSV
- Returns { data: [], errors: [] }
```

**Tests for Step 2.1:**
- [ ] `generateTaskId('EM')` returns string matching `EM-YYMMDDHHMMSS-1` on first call
- [ ] Second call same day same prefix → seq = 2
- [ ] New day → seq resets to 1
- [ ] `validateJobCode('JC001', 'SITE-A', tasks)` where JC001 used on SITE-B → returns error
- [ ] Same JC on same site → returns valid
- [ ] `validateRequiredFields({})` → returns errors for all required fields
- [ ] `formatDate(new Date())` → returns DD/MM/YYYY string

---

### Step 2.2 — Task CRUD (`js/tasks.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 2, Step 2.
Build js/tasks.js — all task database operations.

addTask(taskData):
- Validate required fields via utils.js validateRequiredFields()
- Validate job code via utils.js validateJobCode()
- Generate ID via utils.js generateTaskId(prefix)
- Set created_at, updated_at, created_by, coordinator_id, coordinator_name from currentUser
- Save to db.tasks
- Write audit_log entry: { action: 'task_created', task_id, user_id, timestamp }
- Return saved task or { error }

updateTask(id, changes):
- Get existing task from db
- Check is_locked — if true AND changes include coordinator fields AND currentUser is coordinator → return { error: 'Task is locked' }
- Check is_deleted — if true → return { error: 'Task is deleted' }
- Check if acceptance_status is being set for the first time → call lockTask() after saving
- Save changes + update updated_at
- Write audit_log entry for each changed field: { action: 'task_updated', field_name, old_value, new_value }
- Return updated task or { error }

softDeleteTask(id):
- Check is_locked → if true → return { error: 'Locked tasks cannot be deleted' }
- Set is_deleted = true, deleted_at = now, deleted_by = currentUser.id
- Write audit_log entry: { action: 'task_deleted' }

recoverTask(id):
- Set is_deleted = false, deleted_at = null, deleted_by = null
- Write audit_log entry: { action: 'task_recovered' }

lockTask(id, reason):
- Set is_locked = true, locked_at = now, locked_by = currentUser.id, lock_reason = reason
- Write audit_log entry: { action: 'task_locked', new_value: reason }

unlockTask(id, reason):
- requireRole(['project_manager', 'acceptance_manager', 'cost_control_manager'])
- Set is_locked = false, locked_at = null, locked_by = null, lock_reason = null
- Write audit_log entry: { action: 'task_unlocked', new_value: reason }

getMyTasks(coordinatorId):
- Return all tasks where coordinator_id = coordinatorId AND is_deleted = false

getAllTasks():
- Return all tasks where is_deleted = false

getDeletedTasks(coordinatorId?):
- PM/AM/CCM: return all deleted tasks
- Coordinator: return own deleted tasks within 10-day window
```

**Tests for Step 2.2:**
- [ ] `addTask({...valid data})` → task saved in IndexedDB with correct ID format
- [ ] `addTask({...missing required field})` → returns error, nothing saved
- [ ] `addTask({...duplicate JC on different site})` → returns job code error
- [ ] audit_log entry written on addTask
- [ ] `updateTask` on locked task as coordinator → returns locked error
- [ ] `softDeleteTask` on locked task → returns locked error
- [ ] `softDeleteTask` then `recoverTask` → task visible again
- [ ] `lockTask` → is_locked = true in db
- [ ] `unlockTask` as coordinator → fails with role error

---

### Step 2.3 — Task form + task list view (`js/tasks.js` continued)

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md sections 9.2 and 6 (core components). Stage 2, Step 3.
Build the task list view and add/edit task form — rendered inside js/tasks.js renderTasks() and renderTaskForm().
Apply all visual patterns from DESIGN_SPEC.md exactly: table row heights, column widths,
status badges, lock row treatment, PM field amber headers, drawer layout for task detail.

Task list view (coordinator — own tasks only):
- Table with columns: ID, Physical Site ID, Job Code, TX/RF, Vendor, Task Name, Line Item,
  Status (colored badge), Done Date, Total Price, Actions (Edit, Delete)
- Locked task row: subtle grey background, lock icon in Actions column, no Edit/Delete
- Search bar: filter by Physical Site ID, Job Code, Engineer Name
- Filter dropdowns: Status, Region, Vendor, TX/RF
- Sort: Done Date (desc default), Status, Site ID
- "Add Task" button top right
- Empty state: "No tasks yet. Click Add Task to get started."
- Pagination: 50 rows per page

Task form (add/edit):
- Two-column layout, four sections:
  Section 1 "Site Info": Job Code*, TX/RF*, Vendor*, Physical Site ID*, Logical Site ID,
    Site Option, Facing, Region*, Sub Region, Distance*, General Stream*
  Section 2 "Task Info": Main Task, Task Name*, Contractor*, Engineer Name*,
    Line Item* (dropdown), Absolute Quantity*, Actual Quantity*
  Section 3 "Status": Status*, Task Date, Done Date, VF Task Owner, PRQ, PC, Comments
  Section 4 "Calculated" (read-only): New Price (auto), New Total Price (auto),
    LMP Portion (auto), Contractor Portion (auto)
- Required fields: red asterisk, red border on submit if empty
- Job code: validate on blur — show inline error immediately if conflict
- Save and Cancel buttons
- Edit mode: pre-fill all fields. Locked task → all fields read-only + lock banner at top.
- PM fields section NOT rendered for coordinators at all (not hidden — not rendered)
```

**Tests for Step 2.3:**
- [ ] Task list renders with correct columns
- [ ] "Add Task" opens form
- [ ] Submit with missing required field → field highlighted red, no save
- [ ] Enter duplicate job code for different site → inline error on blur
- [ ] Valid submission → task appears in list with correct ID
- [ ] Edit task → form pre-filled
- [ ] Locked task → lock banner shown, all fields read-only
- [ ] Delete task → confirmation dialog → task disappears from list
- [ ] Deleted task visible in "Show deleted" toggle with days remaining
- [ ] Recover button restores task to list
- [ ] No PM fields rendered anywhere in coordinator view — inspect DOM

---

### Step 2.4 — Auto-calculations (`js/calc.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 2, Step 4.
Build js/calc.js — all financial calculations as described in CLAUDE.md Auto-Calculation Chain.

getPriceForDate(lineItemCode, doneDate):
- Implements the Catalog Fallback Chain from CLAUDE.md
- Returns { price, catalogYear, catalogId } or { price: null, warning: 'no_catalog' }

getPortionForDate(contractorName, doneDate):
- Find contractor_portions rule where contractor_name = contractorName
  AND valid_from <= doneDate — take most recent
- Returns { lmpPct, contractorPct, ruleId } or { lmpPct: null, warning: 'no_rule' }

getDistanceMultiplier(distanceValue):
- Look up multiplier from Distance dropdown list in app_settings
- Returns multiplier number (default 1.00 if not found)

calculateTaskFinancials(task):
- Full 5-step chain from CLAUDE.md
- Respects all override flags
- Returns { price_snapshot, actual_quantity, new_total_price,
            lmp_portion, contractor_portion, catalog_year, portion_rule_id, warnings[] }
- All values rounded to 2 decimal places

Wire into task form:
- When Line Item selected → call getPriceForDate() → show in Section 4
- When Absolute Qty or Distance changes → recalculate actual_quantity → show in Section 4
- When Done Date entered → call calculateTaskFinancials() → show full Section 4
- Override indicator: show ✏ icon next to any overridden field
- Click ✏ → recalculate back to formula value, clear override flag
- Warning shown if no catalog or no contractor portion rule
```

**Tests for Step 2.4:**
- [ ] Select a line item → New Price appears in Section 4 (need at least one catalog loaded)
- [ ] Enter Absolute Qty + Distance → Actual Qty calculated correctly (e.g. 2 × 1.10 = 2.20)
- [ ] Enter Done Date → all 5 fields populate in Section 4
- [ ] Manual override on New Price → ✏ icon appears
- [ ] Click ✏ → recalculates back to catalog price
- [ ] No catalog in db → warning shown in Section 4, save still allowed
- [ ] No contractor portion rule → warning shown, lmp/contractor portions empty

### ✅ Stage 2 Complete — Full check before moving on:
- [ ] Full add task flow works end to end with all required fields
- [ ] ID generated in correct format (PREFIX-YYMMDDHHMMSS-seq)
- [ ] Job code duplicate on different site blocked
- [ ] Auto-calculations chain works correctly
- [ ] Override + recalculate works
- [ ] Soft delete + recover works
- [ ] Locked task is read-only for coordinators
- [ ] PM fields not rendered at all in coordinator view — verify in DOM

---

## Stage 3 — Coordinator Export + Bulk Entry

**Goal:** Coordinator can export tasks as JSON (to send to PM) and Excel. Bulk entry form works for entering multiple line items for one site.

---

### Step 3.1 — JSON export + Excel export (`js/export.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 3, Step 1.
Build js/export.js — coordinator JSON export and coordinator Excel export.

exportCoordinatorJSON():
- Get all of currentUser's non-deleted tasks from db
- Build: { exported_at, coordinator_id, coordinator_name, prefix, version: "1.0", tasks: [...] }
- Trigger download: [prefix]_tasks_[YYYY-MM-DD].json
- Write audit_log: { action: 'export_created', user_id, timestamp }
- Show success toast: "Exported [N] tasks. Send this file to your PM."

exportCoordinatorExcel():
- Same task data as JSON export
- Uses SheetJS (window.XLSX)
- Sheet 1 "My Tasks": all coordinator fields — NO PM fields
- Apply formatting from CLAUDE.md Excel Export section
- Filename: [coordinator_name]_tasks_[YYYY-MM-DD].xlsx

Add "Export JSON" and "Export Excel" buttons to coordinator task list top bar.
```

**Tests for Step 3.1:**
- [ ] "Export JSON" button → downloads .json file
- [ ] JSON file structure has correct header fields (exported_at, coordinator_id etc.)
- [ ] JSON tasks array contains only currentUser's tasks
- [ ] No PM fields in the JSON output
- [ ] "Export Excel" → downloads .xlsx file
- [ ] Excel file opens correctly in Excel/Sheets
- [ ] No PM fields in Excel output
- [ ] audit_log entry written on export

---

### Step 3.2 — Bulk entry form (`js/tasks.js`)

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md section 9.3. Stage 3, Step 2.
Build the bulk entry form as described in CLAUDE.md Bulk Entry Form section.
Apply the exact layout from DESIGN_SPEC.md section 9.3: field grid, line items table columns,
price preview bar styling, amber left border for per-row overrides.

renderBulkEntryForm():
Two-section layout:

SECTION 1 — Site Header (one set of shared fields):
  Job Code*, TX/RF*, Vendor*, Physical Site ID*, Logical Site ID
  Site Option, Facing, Region*, Sub Region, Distance*
  Contractor*, Engineer Name*, VF Task Owner, General Stream*
  [Apply Template ▾] [Apply] [Fill same status ▾] [Fill same date 📅]
  Pre-fill from coordinator's My Defaults (app_settings key: user_defaults_{userId})

SECTION 2 — Line Items Table:
  Columns: #, Line Item*, Abs Qty*, Act Qty*, Status*, Done Date, Price (read-only), Comments, [×]
  Last row always blank for new input
  [+ Add row] button below table
  Price preview footer: "Done: 2 items = 41,480 EGP | Assigned: 1 item | Total rows: 3"

Footer: [Cancel] [Save all N tasks]

Behaviour:
- All rows inherit site header values on creation
- Row cell that differs from header: amber left border
- Job code validated on blur across all rows
- Fill same status: dropdown → applies to all rows instantly
- Fill same date: date picker → applies to all rows + triggers price calc per row
- Cannot save if any required field empty — highlight missing fields red
- Cannot save if any JC conflict
- On save: create N task records in one db transaction → toast "N tasks created for site [ID]"
```

**Tests for Step 3.2:**
- [ ] Bulk entry form opens with site header pre-filled from My Defaults
- [ ] Add 3 rows — each inherits header values
- [ ] Change one row's status — amber border appears on that cell
- [ ] Fill same date → all rows get the date + price preview updates
- [ ] Fill same status → all rows update
- [ ] Apply template (if templates exist) → rows populate
- [ ] Submit with missing required field → row highlighted, no save
- [ ] Duplicate JC on different site → error shown on that row
- [ ] Valid submit → N tasks created, all appear in task list

### ✅ Stage 3 Complete — Full check before moving on:
- [ ] JSON export downloads correctly with right structure
- [ ] Excel export downloads and opens correctly
- [ ] Bulk entry creates correct number of tasks
- [ ] All tasks from bulk entry have correct IDs and coordinator fields

---

## Stage 4 — Price Catalog + General Stream

**Goal:** PM can upload annual price catalogs and stream lists. Line item dropdown populated. Prices calculate correctly for done dates.

---

### Step 4.1 — Catalog management (`js/catalog.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 4, Step 1.
Build js/catalog.js — price catalog upload, storage, and lookup.

renderCatalogSettings():
- List of uploaded catalogs: year, valid_from, item count, uploaded by, date uploaded
- Click to expand and see all line items in that catalog
- [Upload New Catalog] button

Upload catalog:
- Form: Year (number), Valid From date (default 01/04/[year])
- CSV file picker (accepts .csv only)
- On file select: parse with PapaParse — expected columns: code, name, category, price
- Show preview table: code, name, category, price
- Show diff vs previous catalog: NEW (green), REMOVED (red), PRICE CHANGED (amber)
- Validation: show errors if missing columns or invalid prices — block save
- [Confirm] saves catalog + all items to db.catalogs + db.catalog_items
- [Cancel] discards

Delete catalog:
- Blocked if any task references that catalog year — show count of affected tasks

Wire line item dropdown in task form:
- Populated from catalog active for today's date (or for done_date if set)
- Shows: "[code] — [name] — [price] EGP"
- If no catalog: empty dropdown + "No active catalog. Ask PM to upload." message
```

**Tests for Step 4.1:**
- [ ] Upload a valid catalog CSV → preview shows items correctly
- [ ] Diff shows NEW / REMOVED / PRICE CHANGED correctly vs previous catalog
- [ ] Malformed CSV (missing columns) → error shown, save blocked
- [ ] After upload: line item dropdown in task form populated
- [ ] Select line item → price shown in Section 4
- [ ] Delete catalog with tasks referencing it → blocked with count shown
- [ ] Delete catalog with no tasks → succeeds

---

### Step 4.2 — General Stream + Contractor Portions (`js/catalog.js` + `js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 4, Step 2.
Add General Stream management and Contractor Portions to Settings.

General Stream (same pattern as catalog):
- Settings → General Stream
- Upload CSV: single column "stream_name", Year, Valid From date
- Preview before confirm: list of stream names, diff vs previous year
- Saved streams populate General Stream dropdown in task form
- Fallback: if no stream list for current year → use most recent available
- General Stream is a required field — cannot save task without selecting

Contractor Portions (Settings → Contractor Portions):
- One card per contractor (matching Contractor dropdown list)
- Each card shows: contractor name, current LMP%, current Contractor%, effective since
- Expand card → full version history table
- [Update Portion] button per contractor:
  Form: LMP% (number), Contractor% (auto = 100 - LMP%), Effective From date, Notes
  Validation: LMP% must be between 0 and 100
  Save: adds new version record — does NOT modify old records
- New contractor added to dropdown list → card appears automatically with no rules yet
  Task form warns: "No portion rule for [contractor]. Portions will be empty."
```

**Tests for Step 4.2:**
- [ ] Upload stream CSV → General Stream dropdown populated in task form
- [ ] General Stream required — save blocked if empty
- [ ] Contractor portion card visible for each contractor in dropdown list
- [ ] Add portion rule → appears in card with correct LMP% + Contractor%
- [ ] LMP% > 100 → validation error
- [ ] History expands to show all past rules with dates
- [ ] Task with done_date → correct portion rule applied based on that date

### ✅ Stage 4 Complete — Full check before moving on:
- [ ] Catalog upload, preview, save, and delete all work
- [ ] Line item dropdown populated from correct catalog
- [ ] Done Date on task → price calculated from correct catalog
- [ ] Stream upload works, dropdown populated, field required
- [ ] Contractor portions rules saved and applied to calculations

---

## Stage 5 — PM Master View + Import

**Goal:** PM sees all tasks from all coordinators with PM fields. Import flow works — diff, review, accept/discard, apply.

---

### Step 5.1 — PM master table (`js/tasks.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 5, Step 1.
Build the PM master table view — rendered when role is PM/AM/CCM.

Master table features:
- Shows ALL non-deleted tasks from ALL coordinators
- All coordinator fields + all 17 PM fields visible
- PM field column headers: amber background (--color-pm-field)
- Coordinator badge on each row (colored initials circle)
- Filters: Status, Region, Vendor, Coordinator, Acceptance Status, TX/RF
- Additional PM filters: Missing price, Locked, Done but no acceptance status
- Search bar: Physical Site ID, Job Code, Task Name, Engineer Name
- Sort by any column header click
- Inline edit for PM fields: click cell → edit in place → Enter to save → Escape to cancel
- Column visibility toggle button — hide/show individual columns, saved to app_settings
- Virtual scrolling for performance (show 50 rows, load more on scroll)
- Locked task rows: subtle grey background + lock icon
- Row checkbox for bulk selection

Bulk action bar (appears when rows selected):
- PM/AM/CCM: Set Acceptance Status, Set FAC Date, Set PO Status, Set VF Invoice #, Lock selected
- Cannot bulk unlock
- Locked tasks skipped for coordinator field bulk actions with count shown
```

**Tests for Step 5.1:**
- [ ] PM login → master table shows tasks from ALL coordinators
- [ ] Coordinator badge visible on each row
- [ ] PM field columns have amber header background
- [ ] Click PM field cell → editable in place
- [ ] Enter saves → audit_log entry written
- [ ] Escape cancels → reverts to original value
- [ ] Filter by coordinator → only that coordinator's tasks shown
- [ ] Filter "Missing price" → only tasks with null price_snapshot
- [ ] Column visibility toggle → hidden column disappears, setting persists on reload
- [ ] Select 3 rows → bulk action bar appears
- [ ] "Lock selected" → all 3 tasks locked

---

### Step 5.2 — Import engine (`js/import.js`)

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md section 9.4. Stage 5, Step 2.
Build js/import.js — the full coordinator JSON import flow.
Apply the exact layout from DESIGN_SPEC.md section 9.4: drop zone styling, summary card,
count chips (green/amber/slate), changes review table, locked task amber strip.

renderImport() — PM only route:
- Drag-and-drop zone + file picker (accepts .json only)
- On file load:
  Validate: check version field exists, coordinator_id exists in file header
  Parse tasks array
  Run diffImport(incomingTasks, existingTasks):
    For each incoming task:
      ID not in master → stage as NEW
      ID exists → compare every coordinator field (NOT PM fields — never touch PM fields)
      field changed → stage as CHANGE { fieldName, oldValue, newValue }
      field unchanged → skip
  Show summary: coordinator name, export date, "X new tasks / Y changes / Z unchanged"

Change review screen:
- Section "New Tasks": table with checkboxes (default checked)
- Section "Changes": grouped by task ID, each change shows:
  field name | old value → new value | checkbox (default checked)
- [Accept All] [Discard All] buttons at top
- Locked task changes: warning badge "Task is locked — coordinator field changes will be ignored"
- [Confirm Import] button:
  Apply all checked new tasks and changes to db
  Write audit_log entry per accepted change: { action: 'import_applied', source_file: filename }
  Show success toast: "Import complete. X tasks added, Y changes applied."
- [Cancel] → nothing written

Edge cases:
- Wrong coordinator file (coordinator_id mismatch) → warn with confirmation dialog
- Duplicate import (same exported_at timestamp already imported) → warn "Appears already imported"
- Task in file is soft-deleted in master → show conflict: "Task was deleted in master. Restore and apply?"
```

**Tests for Step 5.2:**
- [ ] Drag JSON file → summary shown with correct counts
- [ ] New tasks shown with checkboxes checked by default
- [ ] Changed fields shown with old → new values
- [ ] Uncheck a change → that change not applied on confirm
- [ ] Locked task changes show warning badge
- [ ] PM field in import file → NOT shown in changes, NOT applied
- [ ] Confirm → tasks and changes written to db, audit_log entries created
- [ ] Cancel → nothing written, db unchanged
- [ ] Wrong coordinator file → warning dialog with option to continue or cancel
- [ ] Duplicate import → warning shown

---

### Step 5.3 — Import history (`js/import.js` + `js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 5, Step 3.
Add import history tracking.

On every confirmed import: write to app_settings:
  key: import_history
  value: array of { import_id, date, coordinator_name, filename,
                    new_count, changes_applied, changes_discarded, imported_by }

Settings → Import History (PM only):
- Table: Date, Coordinator, File, New Added, Changes Applied, Discarded, Imported By
- Click row → expand to show full change log for that import session
  (reads audit_log filtered by source_file + timestamp range)
```

**Tests for Step 5.3:**
- [ ] After import: entry appears in import history table
- [ ] Counts match actual applied/discarded
- [ ] Click row → change log expands with correct field-level detail

### ✅ Stage 5 Complete — Full check before moving on:
- [ ] PM master table shows all tasks from all coordinators
- [ ] PM fields editable inline with audit trail
- [ ] Import diff correctly identifies new tasks and changed fields
- [ ] PM fields never touched by import — verify by including a PM field in the JSON
- [ ] Import history recorded correctly

---

## Stage 6 — Shared Folder Sync + Presence

**Goal:** PM/AM/CCM can load and save the master file via Dropbox shared folder. Heartbeat presence indicator shows who is currently active.

---

### Step 6.1 — Shared folder load + save (`js/sync.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 6, Step 1.
Build js/sync.js — shared folder load, save, lock file, and error handling.

Shared folder path:
- Stored in localStorage as pt_shared_folder (per device)
- Configure in Settings → Sync & Shared Folder: text input + [Browse] button (File System Access API)
- [Test path] button: attempt to read the folder → confirm accessible

loadFromSharedFolder():
- Check pt_shared_folder configured → if not → show "Configure shared folder path first"
- Read master_latest.lock → if exists: warn "[Name] has this open since [time]. Load anyway?"
- Read master_latest.json from folder
- Run diffImport() → show summary → user confirms
- Create master_latest.lock: { locked_by: currentUser.name, locked_at: now, device: navigator.userAgent, last_heartbeat: now }
- Update "Last loaded" timestamp in Settings

saveToSharedFolder():
- Export full master db as master_latest.json (all tasks, all users except passwords, all settings)
- Write to shared folder (overwrite previous file)
- Delete master_latest.lock
- Show toast: "Master saved. Others can now load the latest version."
- Update "Last saved" timestamp

Error handling (exact flow from CLAUDE.md Shared Folder Save section):
- On write failure:
  1. Auto-save master_pending_[YYYY-MM-DD]_[HH-MM].json to Downloads
  2. Show persistent undismissable error banner (cannot be closed by user)
  3. Auto-retry every 2 minutes
  4. Save pending state to app_settings on page close
  5. On next open: show banner about unresolved pending state

Startup prompt for PM/AM/CCM:
- If pt_shared_folder is configured AND user is master role:
  Show non-blocking banner at top: "Load latest master from shared folder before working?"
  [Load now] [Later] — dismissible, not blocking
```

**Tests for Step 6.1:**
- [ ] No folder configured → load button shows setup message
- [ ] Configure folder path → saved to localStorage
- [ ] Load → lock file created in Dropbox folder
- [ ] Open app on second machine → lock warning shown with first user's name
- [ ] Load anyway → proceeds, lock file updated
- [ ] Save → master_latest.json updated in Dropbox, lock file deleted
- [ ] Startup banner shown for PM/AM/CCM when folder configured
- [ ] [Later] dismisses banner for current session
- [ ] Simulated save failure → emergency backup in Downloads, persistent error banner

---

### Step 6.2 — Heartbeat + presence indicator (`js/sync.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 6, Step 2.
Add heartbeat and presence indicator for master users.

Heartbeat:
- Every 30 seconds while app is open: update last_heartbeat in master_latest.lock
- Also read the lock file at the same interval to detect other users

Presence bar (shown at top of screen for PM/AM/CCM only):
- Small compact bar below the main nav: "Active now: [avatars]"
- Each avatar: colored circle with initials of the user, tooltip with full name + last seen time
- 🟢 green ring: last_heartbeat < 1 minute ago
- 🟡 amber ring: last_heartbeat 1–5 minutes ago
- ⚫ grey ring: last_heartbeat > 5 minutes ago
- If only current user is active (or lock file shows only them): "Only you are active"
- The lock file's locked_by field is extended to support multiple users:
  { users: [{ name, locked_at, last_heartbeat, device }] }
  All active master users add themselves to this array when loading
  Each user only updates their own entry every 30 seconds
```

**Tests for Step 6.2:**
- [ ] Open app as PM on machine A → presence bar shows PM avatar (green)
- [ ] Open app as AM on machine B → both machines show 2 avatars (green)
- [ ] Close machine B → after 5 minutes, PM machine shows AM avatar goes grey
- [ ] After 10 minutes → AM avatar removed from presence bar
- [ ] Tooltip on avatar: shows last seen time
- [ ] "Only you are active" when no other users detected

### ✅ Stage 6 Complete — Full check before moving on:
- [ ] Load from shared folder works end-to-end (Dropbox folder)
- [ ] Lock file created on load, deleted on save
- [ ] Lock warning shown when another user has the file open
- [ ] Save updates master_latest.json and removes lock
- [ ] Heartbeat updates every 30 seconds in lock file
- [ ] Presence bar shows correct status for each master user
- [ ] Save failure triggers emergency backup + persistent banner

---

## Stage 7 — Task Locking + Audit Log

**Goal:** Tasks auto-lock when acceptance status is set. Manual lock/unlock works. Audit log viewer complete.

---

### Step 7.1 — Auto-lock + manual lock/unlock (`js/tasks.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 7, Step 1.
Wire up the full locking system.

Auto-lock in updateTask():
- After saving: check if acceptance_status was just set (changed from null/empty to any value)
- If yes: call lockTask(id, "Auto-locked: Acceptance Status set to " + value)
- Toast: "Task locked automatically"

Lock button (PM/AM/CCM only — unlocked tasks):
- Per task row in master table: lock icon button
- Confirmation dialog: "Lock this task? Coordinators will no longer be able to edit it."
- Confirm → lockTask(id, "Manual lock by PM/AM/CCM")

Unlock button (PM/AM/CCM only — locked tasks):
- Dialog with required text field: "Reason for unlocking"
- Cannot submit empty reason
- Confirm → unlockTask(id, reason)
- Toast: "Task unlocked"

Bulk lock (master table):
- "Lock selected" in bulk action bar → locks all selected unlocked tasks
- Shows count: "Lock N tasks?" confirmation
- Cannot bulk unlock

Coordinator view of locked tasks:
- Grey row background + lock icon
- All cells read-only — not even clickable
- Tooltip on lock icon: "Locked by [name] on [date]"
- No delete button shown at all
```

**Tests for Step 7.1:**
- [ ] Set Acceptance Status on a task → auto-locks immediately
- [ ] Toast "Task locked automatically" shown
- [ ] Locked task: coordinator sees grey row + lock icon, no edit
- [ ] PM lock button → confirmation → task locks
- [ ] PM unlock button → reason required → can't submit empty → task unlocks with reason in audit
- [ ] Bulk lock 3 tasks → all 3 locked
- [ ] Locked task: PM can still edit PM fields (acceptance_status etc.)
- [ ] Locked task: cannot be deleted — delete button absent

---

### Step 7.2 — Audit log viewer (`js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 7, Step 2.
Build the audit log viewer in Settings → Audit Log (PM only).

Audit log table:
- Columns: Timestamp, Task ID, Site ID, User, Action, Field, Old Value, New Value, Source File
- Actions tracked: task_created, task_updated, task_deleted, task_recovered,
  task_locked, task_unlocked, import_applied, export_created, login, password_changed
- Filters: date range, user, action type
- Search by Task ID or Physical Site ID

Display rules:
- lock/unlock rows: amber row background
- import_applied rows: grouped under import session ID, expandable
- Old Value → New Value shown with arrow: "Done → Cancelled"

Export audit log:
- "Export to Excel" button → downloads filtered audit log as .xlsx
```

**Tests for Step 7.2:**
- [ ] Audit log shows entries from all previous stages
- [ ] task_locked entries have amber background
- [ ] Filter by action type = task_locked → only lock entries shown
- [ ] Filter by date range → correct entries shown
- [ ] Search by Task ID → correct task's history shown
- [ ] Export to Excel → downloads .xlsx with all visible entries

### ✅ Stage 7 Complete — Full check before moving on:
- [ ] Set acceptance status → task auto-locks → coordinator sees locked row
- [ ] PM manually locks and unlocks with reason
- [ ] Bulk lock works
- [ ] Audit log has entries for every action taken since Stage 1
- [ ] Audit log filters and export work

---

## Stage 8 — Settings + User Management

**Goal:** All settings sections complete. PM can create and manage all user accounts. Coordinator My Defaults works. Task templates work.

---

### Step 8.1 — User accounts (`js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 8, Step 1.
Build the User Accounts section in Settings (PM only).

Two sections:
MASTER TEAM: PM, AM, CCM
  Table: Name, Email, Role, Created Date
  Actions: Edit, Reset Password (cannot deactivate master team)

COORDINATORS: all coordinators including inactive
  Table: Name, Email, Prefix, Active Status, Task Count, Created Date
  Actions: Edit, Deactivate/Reactivate, Reset Password, Reassign Tasks
  Inactive: grey row + "(inactive)" label

Create user form (modal):
  Master team: Name, Email, Role (AM or CCM), Temporary Password
  Coordinator: Name, Email, Prefix (2-3 uppercase letters, unique forever), Temporary Password
  Prefix validation: unique across ALL users including inactive — checked against db
  On save: must_change_password = true

Edit user form (modal):
  Same fields pre-filled
  Prefix field: locked after creation — cannot change ever

Deactivate coordinator:
  Confirmation: "Deactivate [Name]? Their [N] tasks remain visible.
                 Prefix [XX] is reserved permanently and can never be reused."
  Sets is_active = false — tasks and IDs NEVER touched

Reassign tasks (from coordinator row):
  Step 1: Select new coordinator from active coordinators dropdown
  Step 2: Preview: "N tasks managed by [Old] will be managed by [New].
           coordinator_name stays as '[Old]' on all tasks."
  Step 3: Type old coordinator's name to confirm
  On confirm: managed_by_id → new coordinator id on all tasks
              coordinator_name, coordinator_id, task IDs → NEVER touched
              audit_log entry per batch
```

**Tests for Step 8.1:**
- [ ] Create coordinator with unique prefix → account created
- [ ] Create coordinator with duplicate prefix (even inactive) → blocked with error
- [ ] Deactivate coordinator → is_active = false, cannot log in
- [ ] Deactivated coordinator's tasks still visible in master table
- [ ] Reactivate → can log in again
- [ ] Reassign: type wrong name to confirm → blocked
- [ ] Reassign: type correct name → tasks reassigned (managed_by_id changes)
- [ ] After reassignment: coordinator_name on tasks unchanged
- [ ] Task IDs unchanged after reassignment

---

### Step 8.2 — Dropdown lists + Column manager (`js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 8, Step 2.
Build Dropdown Lists Manager and Column Manager in Settings (PM only).

Dropdown Lists Manager (Settings → Dropdown Lists):
- 8 lists: Status, Acceptance Status, PO Status, Region, Distance, Contractor, TX/RF, Task Name
- Each list: editable chips/tags
  Add: text input + Add button
  Delete: × on chip (warn if in use by tasks: "N tasks use this value")
  Reorder: drag handle
- System values that cannot be deleted:
  Status: Assigned, Done, Cancelled
  Acceptance Status: note under list "All values trigger auto-lock"
- Distance list: special editor — each band has name + multiplier number input
  e.g. "100Km-400Km" | 1.10 | [×]
  Changing multiplier → affects only NEW tasks going forward
  Cannot delete a band currently in use by tasks
- New Contractor value → auto-creates card in Contractor Portions section
- All changes saved to app_settings immediately

Column Manager (Settings → Column Manager):
- Two sections: Coordinator Columns, PM Columns
- Each column: drag handle, column name, visible toggle
- System-critical columns (from CLAUDE.md): lock icon, no toggle, no drag
- Changes saved to app_settings, applied immediately across the app
```

**Tests for Step 8.2:**
- [ ] Add new value to Region list → appears in Region dropdown on task form
- [ ] Delete value in use → warning shown with count, delete proceeds with confirmation
- [ ] Delete system Status value (Assigned) → blocked
- [ ] Distance: change multiplier → new tasks use new multiplier, existing tasks unchanged
- [ ] Add new contractor → Contractor Portions card appears automatically
- [ ] Column Manager: hide a non-critical column → disappears from task table
- [ ] System-critical column → no toggle, no drag
- [ ] Settings persist after page reload

---

### Step 8.3 — Task templates + My Defaults (`js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 8, Step 3.
Build Task Templates (PM only) and My Defaults (coordinators only).

Task Templates (Settings → Task Templates):
- Card grid: template name, description, item count, active/inactive toggle
- [+ New Template] button → form:
  Name*, Description
  Line items section: searchable dropdown to add from active catalog
  Added items as draggable rows: ≡ [name] Default qty: [N] [×]
  [Save Template]
- Edit: same form pre-filled
- Duplicate: creates "[Name] (copy)"
- Delete: if used in past entries → soft delete (hide from coordinators) with count shown
- Inactive templates: not shown to coordinators in bulk entry dropdown

My Defaults (Settings → My Defaults — coordinators only):
- Form: Region, Sub Region, Vendor, TX/RF, Distance, Contractor,
  Engineer Name, VF Task Owner, General Stream, Default Template
- [Save defaults] and [Clear all defaults] buttons
- Saved to app_settings key: user_defaults_{userId}
- Loaded on bulk entry form open to pre-fill site header
- Stale value (no longer in dropdown) → keep as-is, no warning, no block
```

**Tests for Step 8.3:**
- [ ] Create template with 3 line items → appears in bulk entry Apply Template dropdown
- [ ] Apply template → 3 rows created with default quantities
- [ ] Template item not in current catalog → amber warning on that row in bulk entry
- [ ] Inactive template → not shown to coordinators
- [ ] My Defaults saved → reopen bulk entry → fields pre-filled
- [ ] Clear defaults → bulk entry opens with empty fields
- [ ] Stale dropdown value in defaults → kept as-is, no error on form open

### ✅ Stage 8 Complete — Full check before moving on:
- [ ] Create coordinator, deactivate, reactivate — all work
- [ ] Prefix uniqueness enforced including inactive users
- [ ] Reassign tasks works end-to-end
- [ ] All 8 dropdown lists editable
- [ ] Distance multipliers update and affect new task calculations
- [ ] Column Manager hides/shows columns correctly
- [ ] Task templates apply correctly in bulk entry
- [ ] My Defaults pre-fills bulk entry form

---

## Stage 9 — Reports + Excel Export

**Goal:** Full reporting dashboard with charts. Excel export for all roles.

---

### Step 9.1 — Reports dashboard (`js/reports.js`)

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md sections 9.5 and 11. Stage 9, Step 1.
Build the Reports page in js/reports.js using Chart.js (window.Chart).
Apply chart colors exactly from DESIGN_SPEC.md section 11:
Done=#16a34a, Assigned=#2563eb, Cancelled=#dc2626, LMP=#2563eb, Contractor=#a78bfa,
Trend line=var(--accent), grid lines=#eef0f3, axis text=var(--ink-3) 11px.
Tooltip style: white bg, 1px border, var(--shadow-lg), var(--radius-sm).

Top KPI cards (4 cards):
- Total Tasks | Done Tasks (+ % complete) | Total Value (done tasks EGP) | Pending Invoicing

Global filters (apply to all charts):
- Date range (applies to done_date), Coordinator (PM only), Region, Vendor, Status
- [Apply Filters] [Reset] buttons

Charts (all using Chart.js):
- Tasks by Status: doughnut chart
- Monthly Completion Trend: line chart (last 12 months)
- Tasks by Coordinator: bar chart — count + value (PM only)
- Tasks by Region: bar chart
- Huawei vs Ericsson: pie chart — count + value

Financial section (PM/AM/CCM only):
- Total invoiced value card
- Total pending invoicing card
- Monthly invoicing trend: line chart
- LMP vs Contractor portions: stacked bar chart

Data quality section (PM only):
- Missing price count + [View tasks] link → filters master table
- Done but no acceptance status count + [View tasks] link

Each chart: "View data" toggle → expands table of raw data below chart
```

**Tests for Step 9.1:**
- [ ] KPI cards show correct numbers (verify against db)
- [ ] Tasks by Status donut matches actual status breakdown
- [ ] Monthly trend chart shows correct month labels and counts
- [ ] Coordinator filter (PM): select one coordinator → all charts update
- [ ] Date range filter → charts update to show only tasks in range
- [ ] "View data" toggle → data table appears below chart
- [ ] Financial section hidden for coordinators
- [ ] "Missing price" link → navigates to master table with filter applied

---

### Step 9.2 — Excel export (master) (`js/export.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 9, Step 2.
Build the master Excel export for PM/AM/CCM in js/export.js.

exportMasterExcel(filters):
- Sheet 1 "All Tasks": all coordinator + PM fields, current filters applied
- Sheet 2 "Summary": KPI totals + per-coordinator breakdown table
- Sheet 3 "Audit Log": included only if checkbox checked before export

Apply formatting from CLAUDE.md Excel Export section:
- Header row: bold, grey background
- PM column headers: amber background (#FEF3C7)
- Status column: green/blue/red colored text
- Numbers: 2 decimal places
- Dates: DD/MM/YYYY
- Auto-fit column widths
- Freeze first row

Filename: project_tracker_export_[YYYY-MM-DD].xlsx

Add "Export to Excel" button to master table top bar and to Reports page.
```

**Tests for Step 9.2:**
- [ ] Export button downloads .xlsx file
- [ ] File opens in Excel/Google Sheets without errors
- [ ] PM column headers have amber background
- [ ] Status column: Done rows have green text
- [ ] Numbers show 2 decimal places
- [ ] Dates in DD/MM/YYYY format
- [ ] Sheet 2 Summary has per-coordinator breakdown
- [ ] Sheet 3 included when checkbox checked, absent when unchecked
- [ ] Filters applied: export with Region=Cairo filter → only Cairo tasks in file

### ✅ Stage 9 Complete — Full check before moving on:
- [ ] All KPI cards correct
- [ ] All charts render with correct data
- [ ] Filters apply to all charts simultaneously
- [ ] Excel export opens correctly with all formatting
- [ ] Coordinator export and master export both work

---

## Stage 10 — Auto-Backup + Deleted Tasks + PWA Polish

**Goal:** Auto-backup runs silently. Deleted tasks recoverable within 10 days. PWA installs and works fully offline. Update banner works.

---

### Step 10.1 — Auto-backup (`js/backup.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 10, Step 1.
Build js/backup.js — auto-backup timer and restore.

startAutoBackup():
- Read backup interval from app_settings (default 30 min)
- setInterval: every X minutes call backupNow() silently
- Show toast "Auto-backup saved" for 3 seconds on completion
- Update last_backup_at in app_settings

backupNow():
- Read backup folder path from localStorage pt_backup_folder
- If no path: use browser Downloads folder (window.showSaveFilePicker or fallback anchor download)
- Export: { backup_date, user_id, user_name, role, version: "1.0", tasks: [...], settings: {...} }
- Filename: [name]_backup_[YYYY-MM-DD]_[HH-MM].json — never overwrite, always new file

restoreFromBackup(file):
- Parse JSON, validate version field and task array
- Show preview: "This backup contains [N] tasks from [date]. Restore will replace your local data."
- Confirm → write all tasks and settings to db
- Toast: "Restore complete. [N] tasks loaded."

Settings → Backup & Data:
- Backup folder path input (localStorage)
- Auto-backup interval: 10 / 15 / 30 / 60 minutes dropdown
- [Backup Now] button
- [Restore from Backup] file picker
- Last backup: "[date] at [time] — saved to [folder path]"
- Warning if no folder configured: "No backup folder set. Using Downloads folder."
```

**Tests for Step 10.1:**
- [ ] [Backup Now] → .json file downloads with correct structure
- [ ] Backup file has all tasks in tasks array
- [ ] Auto-backup fires after configured interval (set to 1 min for testing)
- [ ] Toast appears and disappears after 3 seconds
- [ ] Restore from backup file → tasks appear in task list
- [ ] Restore confirmation dialog shown before overwrite
- [ ] "Last backup" timestamp updates correctly in Settings

---

### Step 10.2 — Deleted tasks manager (`js/settings.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 10, Step 2.
Build the Deleted Tasks section in Settings.

Settings → Deleted Tasks:
- PM/AM/CCM: see ALL deleted tasks
- Coordinator: see only their own deleted tasks within 10-day window

Table: Task ID, Physical Site ID, Task Name, Coordinator, Deleted By, Deleted At, Days Remaining
- Days Remaining: "8 days" / "1 day" / "Expired" (red text)
- [Recover] button per row (disabled if expired)
- Recover calls recoverTask(id) → task returns to normal list

Note: purgeSoftDeleted() already runs on startup from db.js (Stage 1, Step 2)
```

**Tests for Step 10.2:**
- [ ] Deleted task appears in Deleted Tasks list
- [ ] Days remaining counts down correctly
- [ ] [Recover] restores task to task list
- [ ] Expired task (> 10 days, simulated by changing deleted_at in db): "Expired" shown, Recover disabled
- [ ] On startup: expired tasks purged (verify task count drops)
- [ ] Coordinator sees only own deleted tasks — not other coordinators'

---

### Step 10.3 — Service worker + PWA polish (`sw.js`)

**Prompt:**
```
Read CLAUDE.md. Stage 10, Step 3.
Finalize sw.js and add PWA install prompt.

sw.js must:
- Cache all static files on install: index.html, all CSS, all JS, manifest.json, icons, all CDN scripts
- Cache-first strategy: serve from cache, fetch in background if online
- On new SW waiting (new version deployed): show update banner

Update banner:
- Small banner at bottom: "A new version of Project Tracker is available." [Update Now]
- [Update Now] → skipWaiting() → page reloads with new version
- Dismiss: tap outside banner, banner hides (update applies on next open)

Install prompt:
- Listen for beforeinstallprompt event
- Show banner at top: "Install Project Tracker for offline use" [Install] [Dismiss]
- [Install] → trigger prompt.prompt()
- [Dismiss] → hide for 7 days (store timestamp in localStorage)
- After install → hide permanently

Offline/online indicator:
- Banner when offline: "Working offline — changes saved locally"
- Banner disappears when back online: "Back online"
```

**Tests for Step 10.3:**
- [ ] Install app on Chrome desktop → Add to taskbar/desktop works
- [ ] Open installed PWA → runs standalone (no browser chrome)
- [ ] Turn off WiFi → "Working offline" banner appears
- [ ] Create a task offline → saved to IndexedDB correctly
- [ ] Turn WiFi back on → "Back online" banner appears briefly
- [ ] All features work offline
- [ ] Deploy a visible change to GitHub Pages → update banner appears in installed PWA
- [ ] [Update Now] → app reloads with new version visible
- [ ] Install prompt appears on first visit, dismissible

### ✅ Stage 10 Complete — Full check before moving on:
- [ ] Auto-backup fires on schedule and produces valid JSON
- [ ] Restore from backup loads tasks correctly
- [ ] Deleted tasks list shows correct entries with days remaining
- [ ] Recover works
- [ ] PWA installs on desktop
- [ ] App works fully offline — all features
- [ ] Update banner works end-to-end

---

## Stage 11 — Final Polish + Performance

**Goal:** Production-ready. All edge cases handled. Smooth UX throughout.

---

### Step 11.1 — Toast system + loading states

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md sections 6.9 and 6.10. Stage 11, Step 1.
Build app-wide toast notifications and loading states.
Apply exact toast styling from DESIGN_SPEC.md section 6.9:
position top-right 18px, left-border 3px type-color, min-width 240px, shadow-lg, scale-in animation.

Toast system (in js/utils.js or a dedicated js/ui.js):
- showToast(message, type, duration):
  Types: success (green), error (red), warning (amber), info (blue)
  Position: top-right, stack multiple toasts
  Auto-dismiss: success/info after 3s, warning/error stay until user closes
- Replace all existing alert() and console.log feedback with showToast()

Loading states:
- Table skeleton: grey animated rows while data loads (5 fake rows)
- Button spinner: replace button text with spinner while async operation runs
- Full-page loader on first startup (db initialization)

Error handling:
- Wrap all db operations in try/catch
- All errors go to showToast(message, 'error')
- Never show raw technical error strings to users
```

**Tests for Step 11.1:**
- [ ] Save task → green success toast appears + disappears
- [ ] Invalid form submit → red error toast appears + stays until closed
- [ ] Multiple toasts stack correctly
- [ ] Table skeleton visible before tasks load
- [ ] Button shows spinner while saving, returns to normal after

---

### Step 11.2 — Final UX + accessibility

**Prompt:**
```
Read CLAUDE.md. Read DESIGN_SPEC.md sections 10, 12, and 14. Stage 11, Step 2.
Final UX polish pass. Apply all data display patterns from DESIGN_SPEC.md section 10:
money formatting, date formatting, null display (— in amber for financial, — in ink-3 for other).
Apply all interaction patterns from DESIGN_SPEC.md section 14 exactly.

Forms:
- Tab order correct on all forms
- Enter key submits forms
- Escape key closes modals with unsaved change warning if form is dirty
- Autofocus first field when modal or form opens

Tables:
- Sticky header row when scrolling
- Sticky first column (ID) on horizontal scroll
- Click row to open task detail (not just the Edit button)
- Sort indicator on sorted column header (▲ ▼)

Accessibility:
- All interactive elements keyboard accessible
- Visible focus outline on all focusable elements
- Aria-label on all icon-only buttons
- Status badges have text labels, not just color

Performance:
- Virtual scroll on master table: render only visible rows + buffer
  (show rows within viewport + 10 rows above and below)
- Debounce search input: 300ms delay before filtering
- Large table filters use Dexie indexed queries — never filter in JS after fetching all rows
```

**Tests for Step 11.2:**
- [ ] Tab through add task form → focus moves in logical order
- [ ] Press Enter in form → submits
- [ ] Press Escape in modal with unsaved changes → confirmation dialog
- [ ] Master table with 1000+ tasks: scroll smoothly, no freezing
- [ ] Search: typing fast → only one search fires (debounce working)
- [ ] Click a task row → opens task detail
- [ ] All icon buttons have visible labels on hover/focus
- [ ] Keyboard navigation: Tab to lock button → Enter → dialog opens

### ✅ Stage 11 Complete — Final checklist before go-live:
- [ ] Install app on Windows desktop Chrome
- [ ] Turn off WiFi — all features work offline
- [ ] Create task as coordinator → export JSON
- [ ] Import JSON as PM → review and accept changes
- [ ] Set Acceptance Status → task auto-locks
- [ ] Unlock task → edit → re-lock manually
- [ ] Upload price catalog CSV → line items appear in dropdown
- [ ] Set done date on task → prices auto-calculate correctly
- [ ] Delete task → recover within 10 days
- [ ] Open shared folder, load master, make changes, save back
- [ ] Open on two machines as PM and AM → presence bar shows both
- [ ] Run all reports with data → all charts render
- [ ] Export to Excel → verify formatting
- [ ] Push to GitHub → verify GitHub Pages deploys and app loads

---

## Go Live

### Switch from test data to real data:
1. [ ] PM logs in to the app
2. [ ] Settings → User Accounts → create accounts for AM, CCM, and all 4 coordinators
3. [ ] Settings → Price Catalog → upload the annual catalog CSV
4. [ ] Settings → General Stream → upload the stream list CSV
5. [ ] Settings → Contractor Portions → add portion rules for each contractor
6. [ ] Settings → Dropdown Lists → verify all lists match your current Excel values
7. [ ] Share the GitHub Pages URL + credentials with each team member
8. [ ] Each person logs in → forced to change password → sees their role view
9. [ ] Coordinators: import historical data from cleaning tool JSON files
10. [ ] PM: import master data from master JSON cleaning tool
11. [ ] Verify one full workflow: coordinator adds task → exports JSON → PM imports → reviews → accepts
12. [ ] You are live ✅

### Post go-live (first week):
- [ ] Verify all coordinators can add tasks and export JSON
- [ ] Verify PM import/merge works with real coordinator files
- [ ] Verify shared folder sync works between PM, AM, and CCM
- [ ] Verify auto-backup is running (check Settings → Backup & Data for last backup time)
- [ ] Verify reports show correct data

---

## Future Additions (when ready)

When adding any new feature, start a new Claude Code session with this message:
```
Read CLAUDE.md. I want to add [feature name].
Confirm you understand the existing architecture before writing any code.
Tell me which files will change, which new files are needed, and whether any
existing business rules are affected.
```

Possible Phase 2 features:
- Supabase optional online sync — swap shared folder flow for real-time cloud sync
- Historical data import tool — clean and import existing Excel data
- Mobile-optimized coordinator view — dedicated PWA experience for phone use
- Dashboard KPI widgets — at-a-glance summary on login
- Notification system — alert PM when coordinator exports a new file

---

*Keep this file open while building. Check off every item as you go.*
*If a test fails, fix it before moving to the next step.*
*Never skip the end-of-stage full checks — they catch cross-file issues early.*
*If Claude Code goes off-plan, paste the relevant CLAUDE.md section and say: follow this exactly.*
