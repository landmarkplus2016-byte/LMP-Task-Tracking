# CLAUDE.md — Project Tracker PWA
> This file is Claude Code's persistent memory for this project.
> Read this at the start of every session before writing any code.

---

## What We Are Building

A GPS-free, offline-first PWA for tracking Vodafone microwave telecom infrastructure tasks.
- **Coordinator app:** Desktop/mobile PWA — coordinators enter and manage their own tasks, export JSON to send to PM
- **PM desktop app:** Same PWA, PM role view — imports coordinator files, reviews changes, manages all master data
- **AM / CCM desktop app:** Same PWA, master role view — full task visibility, PM field editing, reports
- Hosted on **GitHub Pages** (public repo — NO sensitive data ever in code)
- **IndexedDB via Dexie.js** as the local database — no server, no backend, works fully offline
- **No npm. No build tools. No React.** Pure HTML, CSS, vanilla JS — all dependencies via CDN
- Master users (PM, AM, CCM) share a `master_latest.json` file via a Dropbox shared folder

---

## Design Reference

A full design specification lives at `DESIGN_SPEC.md`.

**Read this file before building any UI screen. It is the single source of truth for all visual decisions.**

It defines:
- The exact CSS variable tokens for every color, surface, border, shadow, and radius
- Typography system — IBM Plex Sans + IBM Plex Mono, exact sizes and weights for every text role
- Every core UI component with exact CSS: buttons, inputs, badges, cards, modals, drawer, toasts
- App shell layout — sidebar (230px/56px collapsed), topbar (52px), main content area
- Page-by-page specifications: Dashboard, All Tasks, Bulk Entry, Import, Reports, Settings
- Table column definitions — exact widths, fonts, and PM field amber treatment
- Icon system — full inline SVG path library for all 30+ icons used in the app
- Data display patterns — money formatting, date formatting, null/missing value display
- Animation keyframes — `.fade-in`, `.scale-in`, sidebar/drawer transitions
- Chart color mapping for Chart.js

**Rules for using the design spec:**
- Do not invent a visual style — extract everything from `DESIGN_SPEC.md` and match it exactly
- When a prompt says "apply the design spec", read `DESIGN_SPEC.md` first — it takes priority over any generic styling decisions
- All CSS variables must be defined in `css/styles.css` under `:root` exactly as listed in the spec
- IBM Plex Sans + IBM Plex Mono must be loaded from Google Fonts — exact URL in the spec
- All icons must use the inline SVG paths from the spec — do not substitute other icon libraries

---

## Non-Negotiable Rules

1. **No backend, no server** — all data lives in IndexedDB on the user's device, never sent to any server
2. **Never call any external API** — the only network calls are loading CDN libraries on first load
3. **One file, one job** — never add logic to a file that belongs in another file
4. **Passwords are always hashed** — never store or log plain-text passwords anywhere, ever
5. **PM fields are sacred** — coordinator imports NEVER overwrite PM fields under any circumstances
6. **Task IDs never change** — not on reassignment, not ever — PREFIX-YYMMDDHHMMSS-seq format is permanent
7. **Never hard-delete tasks** — soft delete only, 10-day recovery window, then purge on app startup
8. **Locked tasks cannot be deleted** — lock status must be checked before any delete operation
9. **Frozen calculated fields never recalculate** — once done_date is set, price_snapshot, lmp_portion, contractor_portion are frozen permanently unless done_date changes on an unlocked task
10. **Role enforcement is client-side via auth.js** — every render function checks currentUser.role before showing any PM field or admin action

---

## Four User Roles — Quick Reference

| Role | Device | Navigation | Key permissions |
|---|---|---|---|
| Project Manager (PM) | Desktop | Left sidebar | Full access — all tasks, all settings, import, reports, user management |
| Acceptance Manager (AM) | Desktop | Left sidebar | All tasks + PM fields, reports, shared folder — no settings management |
| Cost Control Manager (CCM) | Desktop | Left sidebar | All tasks + PM fields, reports, shared folder — no settings management |
| Coordinator | Desktop or mobile | Sidebar / bottom tabs | Own tasks only, export JSON, no PM fields visible |

> ⚠️ PM, AM, and CCM work from the same `master_latest.json` shared via Dropbox.
> Coordinators work locally and send JSON exports to the PM — exactly like the current Excel workflow.

---

## Role Permissions Summary

| Feature | PM | AM | CCM | Coordinator |
|---|---|---|---|---|
| View all tasks | ✅ | ✅ | ✅ | Own only |
| Edit coordinator fields | ✅ | ✅ | ✅ | Own only |
| Edit PM fields | ✅ | ✅ | ✅ | ❌ |
| Lock / Unlock tasks | ✅ | ✅ | ✅ | ❌ |
| Import coordinator JSON | ✅ | ❌ | ❌ | ❌ |
| Load / Save shared folder | ✅ | ✅ | ✅ | ❌ |
| View reports | ✅ | ✅ | ✅ | ❌ |
| Export to Excel | ✅ | ✅ | ✅ | ✅ own tasks |
| Settings — full | ✅ | ❌ | ❌ | ❌ |
| Settings — profile + backup + display | ✅ | ✅ | ✅ | ✅ |
| Create / manage user accounts | ✅ | ❌ | ❌ | ❌ |
| Manage catalogs / dropdowns | ✅ | ❌ | ❌ | ❌ |
| View price list (read-only) | ✅ | ✅ | ✅ | ✅ |
| View audit log | ✅ | ❌ | ❌ | ❌ |
| Deactivate / reassign coordinators | ✅ | ❌ | ❌ | ❌ |

---

## File Map — One Job Per File

```
project-tracker/
├── CLAUDE.md                        ← you are here
├── BUILD_GUIDE.md                   ← step-by-step build manual
├── DESIGN_SPEC.md                   ← single source of truth for all UI/visual decisions
├── index.html                       # App shell — loads all CSS and JS, contains router
├── manifest.json                    # PWA manifest — name, icons, display standalone
├── sw.js                            # Service worker — cache-first, offline support, update banner
│
├── js/
│   ├── app.js                       # App init, router, auth state check, role-based nav renderer
│   ├── auth.js                      # Login form, session management, password change, logout
│   ├── db.js                        # Dexie.js database instance — schema, migrations, seed
│   ├── tasks.js                     # Task CRUD — add, update, soft delete, recover, lock, unlock
│   ├── import.js                    # JSON import — parse, diff, stage, review, apply (PM only)
│   ├── export.js                    # JSON export (coordinators) + Excel export (all roles via SheetJS)
│   ├── sync.js                      # Shared folder — load, save, lock file, heartbeat, presence
│   ├── backup.js                    # Auto-backup timer, manual backup, restore from backup
│   ├── catalog.js                   # Price catalog CRUD, general stream CRUD, price lookup
│   ├── calc.js                      # All financial calculations — price chain, portions, freeze logic
│   ├── reports.js                   # Report data assembly + Chart.js rendering
│   ├── settings.js                  # All settings screens — dropdowns, columns, users, templates
│   └── utils.js                     # ID generator, date helpers, hash utilities, CSV parser, validators
│
├── css/
│   ├── styles.css                   # Base styles, CSS variables, shared components, layout shell
│   ├── mobile.css                   # Coordinator mobile-specific styles, bottom tab bar
│   └── desktop.css                  # PM/AM/CCM sidebar layout, data tables, master table grid
│
└── assets/
    ├── icon-192.png                 # PWA icon
    └── icon-512.png                 # PWA icon large
```

---

## CDN Dependencies — Loaded in index.html

```html
<!-- Local database -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js"></script>

<!-- Excel export -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

<!-- Charts -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>

<!-- CSV parsing -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>

<!-- Tailwind CSS (play CDN — no build step) -->
<script src="https://cdn.tailwindcss.com"></script>
```

No npm. No node_modules. No build step. Open index.html and it works.

---

## Database Schema (Dexie.js) — defined in `js/db.js`

### users
```
++id, name, email, password_hash, role, prefix,
is_active, created_at, must_change_password,
deactivated_at, deactivated_by
```

### tasks
```
++id, row, job_code, tx_rf, vendor,
physical_site_id, logical_site_id, site_option, facing,
region, sub_region, distance, absolute_quantity, actual_quantity,
main_task, task_name, contractor, engineer_name,
line_item_code, new_price, new_total_price,
comments, status, task_date, done_date, vf_task_owner,
prq, pc, general_stream,
price_snapshot, catalog_year, portion_rule_id,
new_price_overridden, actual_quantity_overridden,
new_total_price_overridden, lmp_portion_overridden, contractor_portion_overridden,
lmp_portion, contractor_portion,
is_deleted, deleted_at, deleted_by,
is_locked, locked_at, locked_by, lock_reason,
created_at, updated_at, created_by, coordinator_id, coordinator_name,
managed_by_id,
acceptance_status, fac_date, certificate_no,
acceptance_week, tsr_sub_no, po_status, po_number,
vf_invoice_no, first_receiving_date,
sent_to_cost_control, received_from_cost_control,
contractor_invoice_no, contractor_invoice_submission_date,
vf_invoice_submission_date, cash_received_date
```

Dexie indexes on tasks:
`&id, coordinator_id, status, region, vendor, job_code, physical_site_id, done_date, is_deleted, is_locked`

### catalogs
```
++id, year, valid_from, valid_to, created_by, notes
```

### catalog_items
```
++id, catalog_id, code, name, category, price, is_active
```

### general_streams
```
++id, year, valid_from, stream_name, is_active
```

### contractor_portions
```
++id, contractor_name, lmp_pct, contractor_pct, valid_from, created_by, notes
```

### task_templates
```
++id, name, description, created_by, created_at, updated_at, is_active
```

### task_template_items
```
++id, template_id, line_item_code, default_qty, sort_order
```

### audit_log
```
++id, task_id, user_id, action, field_name, old_value, new_value, timestamp, source_file
```

### app_settings
```
&key, value, updated_at
```

---

## Key Business Logic — Know Before You Code

### Authentication Flow (`js/auth.js` + `js/db.js`)
- User opens PWA → email + password form
- `auth.js` hashes the password using `utils.js hashPassword()` → looks up email in Dexie users table
- Compares hash — if no match → show error
- If `must_change_password = true` → show change password screen before proceeding
- On success: store `{ id, name, role, prefix }` in `localStorage` as `pt_user`
- Every page load: `app.js` reads `pt_user` from localStorage → if missing → show login
- `auth.js` `getCurrentUser()` → parses and returns `pt_user` from localStorage
- `auth.js` `requireRole(roles[])` → if currentUser.role not in roles → redirect to dashboard

### Password Rules
- Stored as SHA-256 hash in `password_hash` field of users table
- PM sets temporary password when creating any account — `must_change_password = true`
- On first login, user must set their own password before proceeding — cannot be skipped
- `utils.js hashPassword(plain)` → returns hex SHA-256 string (Web Crypto API — no library)
- Plain text password never stored anywhere

### ID Generation (`js/utils.js`)
```javascript
// Format: PREFIX-YYMMDDHHMMSS-seq
// Example: EM-260609143022-47
// seq = per-coordinator per-day counter stored in app_settings
async function generateTaskId(prefix) {
    const now = new Date();
    const datePart = now.toISOString().slice(2,10).replace(/-/g,'') +
                     now.toTimeString().slice(0,8).replace(/:/g,'');
    const today = now.toISOString().slice(0,10);
    const seqKey = `seq_${prefix}_${today}`;
    const current = await db.app_settings.get(seqKey);
    const seq = current ? parseInt(current.value) + 1 : 1;
    await db.app_settings.put({ key: seqKey, value: String(seq), updated_at: new Date() });
    return `${prefix}-${datePart}-${seq}`;
}
```
IDs NEVER change — not on reassignment, not ever.

### Job Code Validation (`js/utils.js`)
```
validateJobCode(jobCode, physicalSiteId, allTasks, currentTaskId):
  Find any task where job_code = jobCode AND physical_site_id ≠ physicalSiteId AND id ≠ currentTaskId
  If found → return { valid: false, error: "Job code [X] is already used for site [Y]." }
  Otherwise → return { valid: true }
```
Same job code on multiple rows for the same site = allowed.
Same job code on a different site = blocked.

### Auto-Calculation Chain (`js/calc.js`)
```
STEP 1 — Line Item selected:
  new_price = catalog lookup by line_item_code + done_date (or today if no done_date)
  Skip if new_price_overridden = true
  Show with auto indicator (calculator icon)

STEP 2 — Absolute Quantity entered:
  Triggers Step 3 if distance already selected

STEP 3 — Distance selected:
  actual_quantity = absolute_quantity × distance_multiplier
  Distance multipliers (editable by PM in Settings → Dropdown Lists):
    0Km-100Km   → ×1.00
    100Km-400Km → ×1.10
    400Km-800Km → ×1.20
    >800Km      → ×1.25
  Skip if actual_quantity_overridden = true

STEP 4 — Price, qty, or line item changes:
  new_total_price = new_price × actual_quantity
  Skip if new_total_price_overridden = true

STEP 5 — Done Date entered (triggers freeze):
  price_snapshot = new_price (frozen permanently)
  actual_quantity frozen (auto or manual value)
  new_total_price frozen
  lmp_portion = new_total_price × (lmp_pct / 100) from contractor_portions table
  contractor_portion = new_total_price × (contractor_pct / 100)
  All frozen values NEVER recalculate unless done_date changes on an unlocked task
  No catalog found for done_date → use most recent catalog → warn if none at all
```

### Global Override Rule
Every auto-calculated field can be manually overridden — no exceptions.
When overridden: show ✏ icon with tooltip "Manually set. Click to recalculate automatically."
Override state stored as boolean fields: `new_price_overridden`, `actual_quantity_overridden`,
`new_total_price_overridden`, `lmp_portion_overridden`, `contractor_portion_overridden`.

### Task Locking (`js/tasks.js`)
- **Auto-lock**: when `acceptance_status` is set to any value (REJ, PAC, PAC for Ever, TOC, FAC)
- **Manual lock**: PM/AM/CCM presses lock button
- Locked = coordinator fields read-only for everyone — PM fields still editable by PM/AM/CCM
- Unlock: PM/AM/CCM only — requires reason — logged in audit_log
- Locked tasks cannot be deleted under any circumstances

### Soft Delete + 10-Day Recovery (`js/tasks.js`)
- Delete sets `is_deleted = true`, `deleted_at = now`, `deleted_by = currentUser.id`
- Deleted tasks hidden from all normal views
- Recoverable within 10 days — `recoverTask(id)` sets `is_deleted = false`
- On every app startup: purge tasks where `is_deleted = true AND deleted_at < (now - 10 days)`
- PM/AM/CCM see all deleted tasks in Settings → Deleted Tasks
- Coordinators see only their own deleted tasks within the 10-day window

### Import Merge Logic (`js/import.js`) — PM only
```
PM picks coordinator JSON file →
  parse + validate: check version field and coordinator_id in file header
  diffImport(incomingTasks, existingTasks):
    for each incoming task:
      ID not in master → stage as NEW
      ID exists → compare every coordinator field →
        field changed → stage as CHANGE { fieldName, oldValue, newValue }
        field same → skip
    PM fields NEVER compared or touched — ever
  Show review screen:
    "New Tasks" section: list with checkboxes (default checked)
    "Changes" section: grouped by task ID, each change shows old → new, checkbox per change
    [Accept All] [Discard All] + individual checkboxes
    Locked tasks: show warning "Task is locked — coordinator field changes will be ignored"
  PM confirms → write accepted items to db → audit_log entry per change with source filename
```

### Shared Folder Sync (`js/sync.js`) — PM + AM + CCM only
```
LOAD (on app open or manual):
  Check shared folder path is configured in localStorage pt_shared_folder
  Read master_latest.lock → if exists: warn "[Name] has this open since [time]. Load anyway?"
  Read master_latest.json → diffImport() → show summary → create master_latest.lock
  Lock file: { locked_by, locked_at, device, last_heartbeat }

SAVE (manual — "Save & Release" button):
  Export full master IndexedDB as master_latest.json
  Write to shared folder path → delete master_latest.lock
  Toast: "Master saved. Others can now load the latest version."

HEARTBEAT (every 30 seconds while app is open):
  Update last_heartbeat timestamp in master_latest.lock
  Read lock file to see current presence of other users → update presence bar

PRESENCE BAR (top of screen for PM/AM/CCM):
  Shows avatar/initials + name for each master user detected in lock file
  🟢 active (heartbeat < 1 min ago)
  🟡 idle (heartbeat 1–5 min ago)
  ⚫ offline (heartbeat > 5 min ago or not in lock file)

SAVE FAILURE:
  Step 1: auto-save master_pending_[YYYY-MM-DD]_[HH-MM].json to Downloads
  Step 2: persistent undismissable banner:
    "⚠ Shared folder save failed. Emergency backup saved locally.
     Do NOT close the app. [Retry now] [Save to different location]"
  Step 3: auto-retry every 2 minutes
  Pending state saved to app_settings on close → banner shown on next open
```

### Shared Folder File Behavior
```
master_latest.json  → shared folder — OVERWRITTEN every successful save — always one file
master_latest.lock  → shared folder — created on load, deleted on save, updated every 30s
master_pending_[ts] → local Downloads — NEVER overwritten — accumulates
[name]_backup_[ts]  → local Downloads — NEVER overwritten — accumulates
```

### Auto-Backup (`js/backup.js`)
- Runs silently every X minutes (configurable: 10/15/30/60 — default 30)
- Writes JSON to backup folder path set in Settings → Backup & Data (stored in localStorage)
- Falls back to Downloads folder if no path configured
- Filename: `[name]_backup_[YYYY-MM-DD]_[HH-MM].json` — NEVER overwritten, accumulates
- Manual "Backup Now" button always available
- "Restore from Backup" reads any backup JSON → shows task count preview → confirms before overwrite
- Applies to ALL roles — coordinators and master team alike
- Silent toast on completion: "Auto-backup saved" (dismisses after 3 seconds)

### Catalog Fallback Chain (`js/catalog.js`)
```
getPriceForDate(lineItemCode, doneDate):
  Find catalog where valid_from <= doneDate — take most recent
  If found: return price for lineItemCode from that catalog
  If not found: use most recent catalog regardless of date
  If no catalogs at all: return null + set warning flag on task
```

### Coordinator Reassignment (`js/settings.js`)
```
PM selects coordinator → Reassign Tasks → select new coordinator
Preview: "N tasks managed by [Old Name] will be managed by [New Name].
          coordinator_name column stays as '[Old Name]' on all tasks."
PM types old coordinator's name to confirm (safety gate)
On confirm:
  All tasks: managed_by_id → new coordinator id
  coordinator_name → NEVER touched (frozen as original creator)
  coordinator_id → NEVER touched
  Task IDs → NEVER change
  Locked tasks → reassigned too, lock status unchanged
  Soft-deleted tasks within recovery window → reassigned too
  Audit log entry: "N tasks reassigned from [old] to [new] by PM at [timestamp]"
```

---

## Required Fields (coordinator form — cannot save without these)
```
Job Code, TX/RF, Vendor, Physical Site ID, Region, Distance,
Absolute Quantity, Actual Quantity, Task Name, Contractor,
Engineer's Name, Line Item, Status, General Stream
```
Optional: Logical Site ID, Site Option, Facing, Sub Region, Main Task,
Comments, Task Date, Done Date, VF Task Owner, PRQ, PC

Done Date is optional but triggers the full calculation chain when filled.

---

## Dropdown Lists (all editable in Settings by PM only)

- **Status**: Assigned, Done, Cancelled
- **Acceptance Status**: REJ, PAC, PAC for Ever, TOC, FAC — ALL values trigger auto-lock
- **PO Status**: Sent, Partially Received, Received
- **Region**: Upper, Delta, Cairo, Giza
- **Distance**: 0Km-100Km (×1.00), 100Km-400Km (×1.10), 400Km-800Km (×1.20), >800Km (×1.25) — each band has an editable multiplier used in actual quantity calculation
- **Contractor**: In-House, Connect, Upper Telecom, El-khayal, New Plan, Dam, NFM, In-House-Connect
- **TX/RF**: TX, RF
- **Task Name**: ROT, Hu swap, Link upgrade, POC3 integration & cutover, New Physical Sites, Fixed Account, Upgrade-Time SYNC, Upgrade-IDU Upgrade

---

## Column Visibility Rules

- Coordinator sees: all coordinator fields only — PM fields are not rendered at all
- PM / AM / CCM sees: all coordinator fields + all 17 PM fields

**PM fields** (rendered only for master roles):
Acceptance Status, FAC Date, Certificate #, Acceptance Week, TSR Sub#,
PO Status, PO Number, VF Invoice #, 1st Receiving Date,
LMP Portion, Contractor Portion,
Sent to Cost Control, Received from Cost Control,
Contractor Invoice #, Contractor Invoice Submission Date,
VF Invoice Submission Date, Cash Received Date

**System-critical fields** (cannot be hidden or deleted via Column Manager):
ID#, Status, Done Date, Acceptance Status, Contractor, Line Item,
Actual Quantity, Physical Site ID, Job Code

---

## Settings Page Structure
```
Settings
├── Profile & Identity                          ← ALL roles
├── My Defaults                                 ← Coordinators only
│   └── Region, Sub Region, Vendor, TX/RF, Distance, Contractor,
│       Engineer Name, VF Task Owner, General Stream, Default Template
├── Backup & Data                               ← ALL roles
│   ├── Backup folder path (per device, localStorage only)
│   ├── Auto-backup interval: 10/15/30/60 minutes
│   ├── Backup Now / Restore from Backup
│   └── Last backup timestamp
├── Sync & Shared Folder                        ← PM + AM + CCM only
│   ├── Shared folder path configuration
│   ├── Load from shared folder
│   ├── Save & Release
│   ├── Lock file status + presence indicator
│   └── Sync history log (last 30 entries)
├── Price Catalog (CSV upload, annual)          ← PM only
├── General Stream (CSV upload, annual)         ← PM only
├── Contractor Portions (versioned rules)       ← PM only
├── Task Templates                              ← PM only
├── Column Manager (add / hide / reorder)       ← PM only
├── Dropdown Lists Manager (8 lists)            ← PM only
├── Import Coordinator Files                    ← PM only
├── User Accounts                               ← PM only
│   ├── Master team (PM, AM, CCM)
│   └── Coordinators (add, edit, deactivate, reactivate, reassign)
├── Deleted Tasks (recover within 10 days)      ← PM/AM/CCM + own coordinator
├── Audit Log                                   ← PM only
└── Display Preferences                         ← ALL roles
    ├── Table density: Compact / Comfortable / Spacious
    ├── Date format: DD/MM/YYYY (default)
    └── Default filters on open
```

---

## Responsive Layout

```css
/* styles.css — one breakpoint */
.sidebar     { display: none; }
.bottom-nav  { display: flex; }

@media (min-width: 900px) {
    .sidebar    { display: flex; width: 220px; }
    .bottom-nav { display: none; }
}
```
- `app.js renderNav()` checks `window.innerWidth >= 900` → sidebar (PM/AM/CCM desktop) or bottom tabs (coordinator mobile)
- Coordinator sees bottom tabs on mobile, sidebar on desktop
- PM/AM/CCM always on desktop — always sidebar

---

## Excel Export

### Coordinator Export
- Button: "Export my tasks" in task list top bar
- Sheet 1 "My Tasks": all coordinator fields including all auto-calculated fields
- No PM fields, no other coordinators' data
- Filename: `[coordinator_name]_tasks_[YYYY-MM-DD].xlsx`

### Master Export (PM / AM / CCM)
- Button: "Export to Excel" in master table or Reports page
- Sheet 1 "All Tasks": all fields (coordinator + PM), current filters applied
- Sheet 2 "Summary": KPI totals, per-coordinator breakdown
- Sheet 3 "Audit Log": optional (checkbox before export)
- PM column headers: amber background
- Filename: `project_tracker_export_[YYYY-MM-DD].xlsx`

### Formatting (both)
- Header row: bold, grey background (PM headers: amber)
- Status column: color-coded (green=Done, blue=Assigned, red=Cancelled)
- Number columns: 2 decimal places
- Date columns: DD/MM/YYYY
- Auto-fit column widths, frozen header row

---

## Reports (Chart.js — `js/reports.js`)

- Total tasks + total value
- Completion rate (Done %)
- Tasks by status — donut chart
- Monthly completion trend — line chart (last 12 months)
- Task count + value per coordinator — bar chart (PM only)
- Task count + value by region — bar chart
- Huawei vs Ericsson split — pie chart
- Total invoiced value (VF Invoice # filled)
- Total pending invoicing (done + no acceptance status)
- Monthly invoicing trend — line chart
- LMP vs Contractor portion totals — stacked bar
- Tasks with missing price (null price_snapshot) — count + link to filtered table
- Tasks done but no acceptance status — count + link

---

## First Time Setup (runs once on empty database)
```
App detects empty users table on startup
→ Shows setup wizard: "Welcome. Create your PM account."
→ PM enters name, email, password
→ PM account created, logged in automatically, wizard never shown again
→ PM creates all other accounts in Settings → User Accounts
→ PM shares the GitHub Pages URL + credentials with each team member
→ Each person logs in → must_change_password screen → sets own password
→ App shows their role-specific view permanently after that
```

---

## What NOT to Do

- Never recalculate frozen fields (price_snapshot, lmp_portion, contractor_portion) on existing tasks
- Never overwrite PM fields during coordinator import — not even if the import file contains them
- Never hard-delete a task — soft delete only
- Never delete a locked task — check is_locked before any delete operation
- Never change a task's ID — PREFIX-YYMMDDHHMMSS-seq is immutable
- Never reuse a coordinator prefix — reserved forever even after deactivation
- Never call any external server or API — all data stays in IndexedDB
- Never store plain-text passwords — hash before storing, hash before comparing
- Never skip the audit log for: lock, unlock, import, delete, recover, reassign
- Never hide PM fields from coordinators by CSS alone — do not render them at all
- Never add a feature not in this file without confirming with the project owner (Khaled)
- Never touch coordinator_name or coordinator_id on a task after creation — ever
- Never invent a visual style — all UI must be built to match `DESIGN_SPEC.md` exactly
- Never use a different font — IBM Plex Sans and IBM Plex Mono are the only fonts in this app
- Never hardcode a color value — always use the CSS variables defined in `DESIGN_SPEC.md` section 3
