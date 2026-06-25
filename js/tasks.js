const PM_FIELDS = [
  'acceptance_status', 'fac_date', 'certificate_no', 'acceptance_week', 'tsr_sub_no',
  'po_status', 'po_number', 'vf_invoice_no', 'first_receiving_date',
  'lmp_portion', 'contractor_portion',
  'sent_to_cost_control', 'received_from_cost_control',
  'contractor_invoice_no', 'contractor_invoice_submission_date',
  'vf_invoice_submission_date', 'cash_received_date'
];

async function writeAuditLog(entry) {
  await db.audit_log.add({
    task_id: entry.task_id ?? null,
    user_id: entry.user_id ?? null,
    action: entry.action,
    field_name: entry.field_name ?? null,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    timestamp: new Date(),
    source_file: entry.source_file ?? null
  });
}

let usersByIdCache = {};

async function loadUsersByIdCache() {
  const users = await db.users.toArray();
  usersByIdCache = Object.fromEntries(users.map(u => [u.id, u.name]));
}

function lockTooltipText(task) {
  if (!task.is_locked) return '';
  const name = usersByIdCache[task.locked_by] || 'Unknown';
  return `Locked by ${name}${task.locked_at ? ' on ' + formatDate(task.locked_at) : ''}`;
}

async function addTask(taskData) {
  const currentUser = getCurrentUser();

  const requiredCheck = validateRequiredFields(taskData);
  if (!requiredCheck.valid) {
    return { error: 'Missing required fields', errors: requiredCheck.errors };
  }

  const allTasks = await getAllTasks();
  const jobCodeCheck = validateJobCode(taskData.job_code, taskData.physical_site_id, allTasks, null);
  if (!jobCodeCheck.valid) {
    return { error: jobCodeCheck.error };
  }

  const id = await generateTaskId(currentUser.prefix);
  const now = new Date();

  const task = {
    ...taskData,
    id,
    is_deleted: false,
    is_locked: false,
    created_at: now,
    updated_at: now,
    created_by: currentUser.id,
    coordinator_id: currentUser.id,
    coordinator_name: currentUser.name
  };

  await db.tasks.add(task);
  await writeAuditLog({ task_id: id, user_id: currentUser.id, action: 'task_created' });

  return task;
}

async function updateTask(id, changes) {
  const currentUser = getCurrentUser();
  const existing = await db.tasks.get(id);
  if (!existing) return { error: 'Task not found' };

  if (existing.is_deleted) return { error: 'Task is deleted' };

  if (existing.is_locked && currentUser.role === 'coordinator') {
    const touchesCoordinatorField = Object.keys(changes).some(key => !PM_FIELDS.includes(key));
    if (touchesCoordinatorField) {
      return { error: 'Task is locked' };
    }
  }

  const isFirstAcceptanceStatus = Object.prototype.hasOwnProperty.call(changes, 'acceptance_status') &&
    !existing.acceptance_status && !!changes.acceptance_status;

  const changedFields = Object.keys(changes).filter(key => changes[key] !== existing[key]);

  await db.tasks.update(id, { ...changes, updated_at: new Date() });

  for (const field of changedFields) {
    await writeAuditLog({
      task_id: id,
      user_id: currentUser.id,
      action: 'task_updated',
      field_name: field,
      old_value: existing[field],
      new_value: changes[field]
    });
  }

  if (isFirstAcceptanceStatus) {
    await lockTask(id, `Auto-locked: Acceptance Status set to ${changes.acceptance_status}`);
    showToast('Task locked automatically', 'success');
  }

  return await db.tasks.get(id);
}

async function softDeleteTask(id) {
  const currentUser = getCurrentUser();
  const existing = await db.tasks.get(id);
  if (!existing) return { error: 'Task not found' };

  if (existing.is_locked) return { error: 'Locked tasks cannot be deleted' };

  await db.tasks.update(id, { is_deleted: true, deleted_at: new Date(), deleted_by: currentUser.id });
  await writeAuditLog({ task_id: id, user_id: currentUser.id, action: 'task_deleted' });

  return await db.tasks.get(id);
}

async function recoverTask(id) {
  const currentUser = getCurrentUser();
  const existing = await db.tasks.get(id);
  if (!existing) return { error: 'Task not found' };

  await db.tasks.update(id, { is_deleted: false, deleted_at: null, deleted_by: null });
  await writeAuditLog({ task_id: id, user_id: currentUser.id, action: 'task_recovered' });

  return await db.tasks.get(id);
}

async function lockTask(id, reason) {
  const currentUser = getCurrentUser();
  const existing = await db.tasks.get(id);
  if (!existing) return { error: 'Task not found' };

  await db.tasks.update(id, {
    is_locked: true,
    locked_at: new Date(),
    locked_by: currentUser.id,
    lock_reason: reason
  });
  await writeAuditLog({ task_id: id, user_id: currentUser.id, action: 'task_locked', new_value: reason });

  return await db.tasks.get(id);
}

async function unlockTask(id, reason) {
  if (!requireRole(MASTER_ROLES)) return { error: 'Not authorized' };

  const currentUser = getCurrentUser();
  const existing = await db.tasks.get(id);
  if (!existing) return { error: 'Task not found' };

  await db.tasks.update(id, { is_locked: false, locked_at: null, locked_by: null, lock_reason: null });
  await writeAuditLog({ task_id: id, user_id: currentUser.id, action: 'task_unlocked', new_value: reason });

  return await db.tasks.get(id);
}

async function getMyTasks(coordinatorId) {
  const tasks = await db.tasks.where('coordinator_id').equals(coordinatorId).toArray();
  return tasks.filter(t => !t.is_deleted);
}

async function getAllTasks() {
  const tasks = await db.tasks.toArray();
  return tasks.filter(t => !t.is_deleted);
}

async function getDeletedTasks(coordinatorId) {
  const currentUser = getCurrentUser();
  const deleted = (await db.tasks.toArray()).filter(t => t.is_deleted);

  if (currentUser && MASTER_ROLES.includes(currentUser.role)) {
    return deleted;
  }

  const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  return deleted.filter(t =>
    t.coordinator_id === coordinatorId &&
    t.deleted_at && new Date(t.deleted_at) >= cutoff
  );
}

const REGIONS = ['Upper', 'Delta', 'Cairo', 'Giza'];
const DISTANCE_BANDS = ['0Km-100Km', '100Km-400Km', '400Km-800Km', '>800Km'];
const CONTRACTORS = ['In-House', 'Connect', 'Upper Telecom', 'El-khayal', 'New Plan', 'Dam', 'NFM', 'In-House-Connect'];
const TXRF_OPTIONS = ['TX', 'RF'];
const TASK_NAMES = ['ROT', 'Hu swap', 'Link upgrade', 'POC3 integration & cutover', 'New Physical Sites', 'Fixed Account', 'Upgrade-Time SYNC', 'Upgrade-IDU Upgrade'];
const STATUS_OPTIONS = ['Assigned', 'Done', 'Cancelled'];
const ACCEPTANCE_STATUSES = ['REJ', 'PAC', 'PAC for Ever', 'TOC', 'FAC'];
const PO_STATUSES = ['Sent', 'Partially Received', 'Received'];
const TASKS_PAGE_SIZE = 50;

/* ==========================================================================
   Dropdown Lists — backed by app_settings, editable in Settings (Stage 8.2)
   All arrays below are mutated in place (splice/push) so every existing
   reference (selects, filters, PM_COLUMNS.options, etc.) stays in sync —
   never reassign these bindings.
   ========================================================================== */

const SIMPLE_DROPDOWN_LISTS = [
  { key: 'status', label: 'Status', array: STATUS_OPTIONS, settingsKey: 'dropdown_status', systemValues: ['Assigned', 'Done', 'Cancelled'], taskField: 'status' },
  { key: 'acceptance_status', label: 'Acceptance Status', array: ACCEPTANCE_STATUSES, settingsKey: 'dropdown_acceptance_status', systemValues: [], taskField: 'acceptance_status', note: 'All values trigger auto-lock' },
  { key: 'po_status', label: 'PO Status', array: PO_STATUSES, settingsKey: 'dropdown_po_status', systemValues: [], taskField: 'po_status' },
  { key: 'region', label: 'Region', array: REGIONS, settingsKey: 'dropdown_region', systemValues: [], taskField: 'region' },
  { key: 'contractor', label: 'Contractor', array: CONTRACTORS, settingsKey: 'dropdown_contractor', systemValues: [], taskField: 'contractor' },
  { key: 'tx_rf', label: 'TX/RF', array: TXRF_OPTIONS, settingsKey: 'dropdown_tx_rf', systemValues: [], taskField: 'tx_rf' },
  { key: 'task_name', label: 'Task Name', array: TASK_NAMES, settingsKey: 'dropdown_task_name', systemValues: [], taskField: 'task_name' }
];

const DISTANCE_LIST_SETTINGS_KEY = 'dropdown_distance';
const DISTANCE_LIST = [
  { band: '0Km-100Km', multiplier: 1.00 },
  { band: '100Km-400Km', multiplier: 1.10 },
  { band: '400Km-800Km', multiplier: 1.20 },
  { band: '>800Km', multiplier: 1.25 }
];

function syncDistanceBandsFromList() {
  DISTANCE_BANDS.splice(0, DISTANCE_BANDS.length, ...DISTANCE_LIST.map(d => d.band));
}

async function loadDropdownListsFromSettings() {
  for (const list of SIMPLE_DROPDOWN_LISTS) {
    const setting = await db.app_settings.get(list.settingsKey);
    if (setting && Array.isArray(setting.value) && setting.value.length > 0) {
      list.array.splice(0, list.array.length, ...setting.value);
    }
  }

  const distanceSetting = await db.app_settings.get(DISTANCE_LIST_SETTINGS_KEY);
  if (distanceSetting && Array.isArray(distanceSetting.value) && distanceSetting.value.length > 0) {
    DISTANCE_LIST.splice(0, DISTANCE_LIST.length, ...distanceSetting.value.map(d => ({ band: d.band, multiplier: d.multiplier })));
  }
  syncDistanceBandsFromList();

  await loadColumnOrderFromSettings();
}

let taskListCache = [];
let taskListState = { search: '', status: '', region: '', vendor: '', tx_rf: '', sortField: 'done_date', sortDir: 'desc', page: 1 };

function renderTasks() {
  const user = getCurrentUser();
  if (!user) return;

  if (user.role === 'coordinator') {
    renderCoordinatorTaskList();
  } else {
    renderMasterTaskList();
  }
}

async function renderCoordinatorTaskList() {
  const user = getCurrentUser();
  taskListCache = await getMyTasks(user.id);
  await loadUsersByIdCache();
  taskListState.page = 1;

  const container = document.getElementById('page-content');
  container.innerHTML = coordinatorListShellHtml();
  attachTaskListShellEvents();
  renderTaskTableSection();
}

function distinctVendors() {
  return Array.from(new Set(taskListCache.map(t => t.vendor).filter(Boolean))).sort();
}

function coordinatorListShellHtml() {
  return `
    <div class="fade-in tasks-page">
      <div class="tasks-page-header">
        <div>
          <h1>My Tasks</h1>
          <p class="tasks-subtitle">${taskListCache.length} task${taskListCache.length === 1 ? '' : 's'}</p>
        </div>
        <div class="tasks-page-header-actions">
          <button id="export-json-btn" class="btn ghost sm">${iconSvg('download', 14)}<span>Export JSON</span></button>
          <button id="export-excel-btn" class="btn ghost sm">${iconSvg('download', 14)}<span>Export Excel</span></button>
          <button id="bulk-entry-btn" class="btn ghost">${iconSvg('layers', 15)}<span>Bulk Entry</span></button>
          <button id="add-task-btn" class="btn primary">${iconSvg('add', 15)}<span>Add Task</span></button>
        </div>
      </div>
      <div class="tasks-filters-bar">
        <div class="tasks-search-wrap">
          ${iconSvg('search', 15)}
          <input id="task-search" class="input tasks-search" type="text" placeholder="Search Site ID, Job Code, Engineer…">
        </div>
        <select id="filter-status" class="select tasks-filter">
          <option value="">All Status</option>
          ${STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select id="filter-region" class="select tasks-filter">
          <option value="">All Regions</option>
          ${REGIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
        <select id="filter-vendor" class="select tasks-filter">
          <option value="">All Vendors</option>
          ${distinctVendors().map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
        </select>
        <select id="filter-txrf" class="select tasks-filter">
          <option value="">All TX/RF</option>
          ${TXRF_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div id="task-table-section" class="tasks-table-section"></div>
    </div>`;
}

function getFilteredSortedTasks() {
  const q = taskListState.search.trim().toLowerCase();

  let rows = taskListCache.filter(t => {
    if (q) {
      const hay = `${t.physical_site_id || ''} ${t.job_code || ''} ${t.engineer_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (taskListState.status && t.status !== taskListState.status) return false;
    if (taskListState.region && t.region !== taskListState.region) return false;
    if (taskListState.vendor && t.vendor !== taskListState.vendor) return false;
    if (taskListState.tx_rf && t.tx_rf !== taskListState.tx_rf) return false;
    return true;
  });

  const dir = taskListState.sortDir === 'asc' ? 1 : -1;
  const field = taskListState.sortField;

  rows.sort((a, b) => {
    let av = a[field];
    let bv = b[field];
    if (field === 'done_date') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else {
      av = (av || '').toString().toLowerCase();
      bv = (bv || '').toString().toLowerCase();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return rows;
}

function sortIconHtml(field) {
  if (taskListState.sortField !== field) return '';
  const rotated = taskListState.sortDir === 'asc' ? ' style="transform:rotate(180deg)"' : '';
  return `<span class="sort-icon"${rotated}>${iconSvg('chevDown', 11)}</span>`;
}

function statusBadgeHtml(status) {
  const map = { Done: 'status-done', Assigned: 'status-assigned', Cancelled: 'status-cancelled' };
  const cls = map[status] || 'status-assigned';
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${escapeHtml(status || '')}</span>`;
}

function taskRowHtml(t) {
  const lockedClass = t.is_locked ? ' locked-row' : '';
  const moneyVal = formatMoney(t.new_total_price);
  const moneyCell = moneyVal === null ? `<span style="color:var(--amber)">—</span>` : moneyVal;
  const doneDateCell = t.done_date
    ? `<span class="mono" style="color:var(--ink-2)">${formatDate(t.done_date)}</span>`
    : `<span style="color:var(--ink-3)">—</span>`;
  const actionsHtml = t.is_locked
    ? `<span class="lock-icon" title="${escapeHtml(lockTooltipText(t))}">${iconSvg('lock', 13)}</span>`
    : `<button class="icon-btn sm-icon-btn" data-action="edit" data-id="${t.id}" title="Edit">${iconSvg('edit', 14)}</button>
       <button class="icon-btn sm-icon-btn" data-action="delete" data-id="${t.id}" title="Delete">${iconSvg('trash', 14)}</button>`;

  return `
    <tr class="data-row${lockedClass}">
      <td class="mono">${escapeHtml(t.id)}</td>
      <td class="mono">${escapeHtml(t.physical_site_id || '')}</td>
      <td class="mono">${escapeHtml(t.job_code || '')}</td>
      <td>${escapeHtml(t.tx_rf || '')}</td>
      <td>${escapeHtml(t.vendor || '')}</td>
      <td>${escapeHtml(t.task_name || '')}</td>
      <td class="mono">${escapeHtml(t.line_item_code || '')}</td>
      <td>${statusBadgeHtml(t.status)}</td>
      <td>${doneDateCell}</td>
      <td class="num-col num">${moneyCell}</td>
      <td class="actions-cell">${actionsHtml}</td>
    </tr>`;
}

function renderTaskTableSection() {
  const section = document.getElementById('task-table-section');
  if (!section) return;

  const rows = getFilteredSortedTasks();

  if (rows.length === 0) {
    section.innerHTML = `
      <div class="card tasks-table-wrap">
        <div class="empty-state">
          ${iconSvg('search', 30)}
          <div class="empty-state-title">No tasks yet.</div>
          <div class="empty-state-desc">Click Add Task to get started.</div>
        </div>
      </div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / TASKS_PAGE_SIZE));
  if (taskListState.page > totalPages) taskListState.page = totalPages;
  const start = (taskListState.page - 1) * TASKS_PAGE_SIZE;
  const pageRows = rows.slice(start, start + TASKS_PAGE_SIZE);

  section.innerHTML = `
    <div class="card tasks-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:160px">ID #</th>
            <th style="width:110px" data-sort="physical_site_id" class="sortable">Site ID ${sortIconHtml('physical_site_id')}</th>
            <th style="width:110px">Job Code</th>
            <th style="width:64px">TX/RF</th>
            <th style="width:90px">Vendor</th>
            <th style="width:150px">Task Name</th>
            <th style="width:96px">Line Item</th>
            <th style="width:104px" data-sort="status" class="sortable">Status ${sortIconHtml('status')}</th>
            <th style="width:100px" data-sort="done_date" class="sortable">Done Date ${sortIconHtml('done_date')}</th>
            <th style="width:112px" class="num-col">Total (EGP)</th>
            <th style="width:90px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(taskRowHtml).join('')}
        </tbody>
      </table>
    </div>
    <div class="tasks-pagination">
      <span class="tasks-pagination-info">Showing ${start + 1}–${Math.min(start + TASKS_PAGE_SIZE, rows.length)} of ${rows.length}</span>
      <div class="tasks-pagination-controls">
        <button class="icon-btn" id="page-prev-btn" ${taskListState.page <= 1 ? 'disabled' : ''}>${iconSvg('chevLeft', 16)}</button>
        <span class="tasks-pagination-page">Page ${taskListState.page} of ${totalPages}</span>
        <button class="icon-btn" id="page-next-btn" ${taskListState.page >= totalPages ? 'disabled' : ''}>${iconSvg('chevRight', 16)}</button>
      </div>
    </div>`;

  attachTaskRowEvents();

  document.getElementById('page-prev-btn')?.addEventListener('click', () => { taskListState.page--; renderTaskTableSection(); });
  document.getElementById('page-next-btn')?.addEventListener('click', () => { taskListState.page++; renderTaskTableSection(); });

  section.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (taskListState.sortField === field) {
        taskListState.sortDir = taskListState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        taskListState.sortField = field;
        taskListState.sortDir = field === 'done_date' ? 'desc' : 'asc';
      }
      taskListState.page = 1;
      renderTaskTableSection();
    });
  });
}

function attachTaskListShellEvents() {
  document.getElementById('add-task-btn').addEventListener('click', () => showTaskForm(null));
  document.getElementById('bulk-entry-btn').addEventListener('click', () => renderBulkEntryForm());
  document.getElementById('export-json-btn').addEventListener('click', () => exportCoordinatorJSON());
  document.getElementById('export-excel-btn').addEventListener('click', () => exportCoordinatorExcel());

  let searchTimer = null;
  document.getElementById('task-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => {
      taskListState.search = value;
      taskListState.page = 1;
      renderTaskTableSection();
    }, 300);
  });

  document.getElementById('filter-status').addEventListener('change', (e) => {
    taskListState.status = e.target.value;
    taskListState.page = 1;
    renderTaskTableSection();
  });
  document.getElementById('filter-region').addEventListener('change', (e) => {
    taskListState.region = e.target.value;
    taskListState.page = 1;
    renderTaskTableSection();
  });
  document.getElementById('filter-vendor').addEventListener('change', (e) => {
    taskListState.vendor = e.target.value;
    taskListState.page = 1;
    renderTaskTableSection();
  });
  document.getElementById('filter-txrf').addEventListener('change', (e) => {
    taskListState.tx_rf = e.target.value;
    taskListState.page = 1;
    renderTaskTableSection();
  });
}

function attachTaskRowEvents() {
  const section = document.getElementById('task-table-section');
  if (!section) return;

  section.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => showTaskForm(btn.dataset.id));
  });
  section.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteTask(btn.dataset.id));
  });
}

async function handleDeleteTask(id) {
  if (!window.confirm('Delete this task? It can be recovered within 10 days.')) return;

  const result = await softDeleteTask(id);
  if (result && result.error) {
    window.alert(result.error);
    return;
  }
  await renderCoordinatorTaskList();
}

/* ==========================================================================
   Master table — PM / AM / CCM view
   ========================================================================== */

const COORDINATOR_COLUMNS = [
  { key: 'id', label: 'ID #', width: 168, type: 'mono', alwaysVisible: true },
  { key: 'physical_site_id', label: 'Physical Site', width: 110, type: 'mono', alwaysVisible: true },
  { key: 'job_code', label: 'Job Code', width: 110, type: 'mono', alwaysVisible: true },
  { key: 'tx_rf', label: 'TX/RF', width: 64, type: 'text', defaultVisible: true },
  { key: 'vendor', label: 'Vendor', width: 90, type: 'text', defaultVisible: true },
  { key: 'region', label: 'Region', width: 78, type: 'text', defaultVisible: true },
  { key: 'sub_region', label: 'Sub Region', width: 100, type: 'text' },
  { key: 'logical_site_id', label: 'Logical Site ID', width: 110, type: 'text' },
  { key: 'site_option', label: 'Site Option', width: 90, type: 'text' },
  { key: 'facing', label: 'Facing', width: 90, type: 'text' },
  { key: 'distance', label: 'Distance', width: 110, type: 'text' },
  { key: 'task_name', label: 'Task Name', width: 150, type: 'text', defaultVisible: true },
  { key: 'main_task', label: 'Main Task', width: 120, type: 'text' },
  { key: 'contractor', label: 'Contractor', width: 120, type: 'text', alwaysVisible: true },
  { key: 'engineer_name', label: 'Engineer Name', width: 130, type: 'text' },
  { key: 'line_item_code', label: 'Line Item', width: 96, type: 'mono', alwaysVisible: true },
  { key: 'absolute_quantity', label: 'Abs Qty', width: 90, type: 'num' },
  { key: 'actual_quantity', label: 'Act Qty', width: 72, type: 'num', alwaysVisible: true },
  { key: 'new_price', label: 'Price', width: 100, type: 'num' },
  { key: 'new_total_price', label: 'Total (EGP)', width: 112, type: 'money', defaultVisible: true },
  { key: 'general_stream', label: 'General Stream', width: 130, type: 'text' },
  { key: 'vf_task_owner', label: 'VF Task Owner', width: 110, type: 'text' },
  { key: 'prq', label: 'PRQ', width: 80, type: 'text' },
  { key: 'pc', label: 'PC', width: 80, type: 'text' },
  { key: 'status', label: 'Status', width: 104, type: 'badge', alwaysVisible: true },
  { key: 'task_date', label: 'Task Date', width: 100, type: 'date' },
  { key: 'done_date', label: 'Done Date', width: 100, type: 'date', alwaysVisible: true },
  { key: 'comments', label: 'Comments', width: 160, type: 'text' }
];

const PM_COLUMNS = [
  { key: 'acceptance_status', label: 'Acceptance', width: 110, type: 'select', options: ACCEPTANCE_STATUSES, alwaysVisible: true },
  { key: 'fac_date', label: 'FAC Date', width: 100, type: 'date' },
  { key: 'certificate_no', label: 'Certificate #', width: 110, type: 'text' },
  { key: 'acceptance_week', label: 'Acceptance Wk', width: 110, type: 'text' },
  { key: 'tsr_sub_no', label: 'TSR Sub#', width: 100, type: 'text' },
  { key: 'po_status', label: 'PO Status', width: 120, type: 'select', options: PO_STATUSES, defaultVisible: true },
  { key: 'po_number', label: 'PO Number', width: 110, type: 'text' },
  { key: 'vf_invoice_no', label: 'VF Invoice #', width: 120, type: 'text', defaultVisible: true },
  { key: 'first_receiving_date', label: '1st Receiving', width: 110, type: 'date' },
  { key: 'lmp_portion', label: 'LMP Portion', width: 110, type: 'num', defaultVisible: true, overrideKey: 'lmp_portion_overridden' },
  { key: 'contractor_portion', label: 'Ctr Portion', width: 110, type: 'num', defaultVisible: true, overrideKey: 'contractor_portion_overridden' },
  { key: 'sent_to_cost_control', label: 'Sent to CC', width: 100, type: 'date' },
  { key: 'received_from_cost_control', label: 'Received from CC', width: 130, type: 'date' },
  { key: 'contractor_invoice_no', label: 'Ctr Invoice #', width: 120, type: 'text' },
  { key: 'contractor_invoice_submission_date', label: 'Ctr Invoice Sub', width: 120, type: 'date' },
  { key: 'vf_invoice_submission_date', label: 'VF Invoice Sub', width: 120, type: 'date' },
  { key: 'cash_received_date', label: 'Cash Received', width: 110, type: 'date' }
];

const ALL_MASTER_COLUMNS = [...COORDINATOR_COLUMNS, ...PM_COLUMNS];
const PM_FIELD_META_MAP = Object.fromEntries(PM_COLUMNS.map(c => [c.key, c]));
const MASTER_COLUMNS_SETTINGS_KEY = 'master_table_columns';
const MASTER_COLUMN_ORDER_KEY = 'master_table_column_order';
const MASTER_BADGE_PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#dc2626', '#d97706', '#0e7490', '#65a30d', '#be185d'];

function syncAllMasterColumns() {
  ALL_MASTER_COLUMNS.splice(0, ALL_MASTER_COLUMNS.length, ...COORDINATOR_COLUMNS, ...PM_COLUMNS);
}

async function loadColumnOrderFromSettings() {
  const setting = await db.app_settings.get(MASTER_COLUMN_ORDER_KEY);
  if (!setting || !Array.isArray(setting.value)) return;

  const savedOrder = setting.value;
  const reorderInPlace = (arr) => {
    const byKey = Object.fromEntries(arr.map(c => [c.key, c]));
    const reordered = savedOrder.map(k => byKey[k]).filter(Boolean);
    arr.forEach(c => { if (!savedOrder.includes(c.key)) reordered.push(c); });
    arr.splice(0, arr.length, ...reordered);
  };

  reorderInPlace(COORDINATOR_COLUMNS);
  reorderInPlace(PM_COLUMNS);
  syncAllMasterColumns();
}

async function saveColumnOrder() {
  await db.app_settings.put({ key: MASTER_COLUMN_ORDER_KEY, value: ALL_MASTER_COLUMNS.map(c => c.key), updated_at: new Date() });
}

let masterTaskCache = [];
let coordinatorBadgeMap = {};
let masterTableState = {
  search: '', status: '', region: '', vendor: '', coordinator: '', acceptanceStatus: '', txrf: '',
  quickFilter: '',
  sortField: 'done_date', sortDir: 'desc',
  visibleCount: TASKS_PAGE_SIZE,
  selectedIds: new Set(),
  visibleColumns: {},
  columnsMenuOpen: false
};

function coordinatorBadgeColor(name) {
  if (!name) return '#64748b';
  if (!coordinatorBadgeMap[name]) {
    const idx = Object.keys(coordinatorBadgeMap).length % MASTER_BADGE_PALETTE.length;
    coordinatorBadgeMap[name] = MASTER_BADGE_PALETTE[idx];
  }
  return coordinatorBadgeMap[name];
}

async function loadMasterColumnVisibility() {
  const saved = await db.app_settings.get(MASTER_COLUMNS_SETTINGS_KEY);
  const savedValue = (saved && saved.value) || {};
  const visibility = {};
  ALL_MASTER_COLUMNS.forEach(col => {
    if (col.alwaysVisible) {
      visibility[col.key] = true;
    } else if (Object.prototype.hasOwnProperty.call(savedValue, col.key)) {
      visibility[col.key] = !!savedValue[col.key];
    } else {
      visibility[col.key] = !!col.defaultVisible;
    }
  });
  return visibility;
}

async function saveMasterColumnVisibility(visibility) {
  const toSave = {};
  ALL_MASTER_COLUMNS.forEach(col => {
    if (!col.alwaysVisible) toSave[col.key] = !!visibility[col.key];
  });
  await db.app_settings.put({ key: MASTER_COLUMNS_SETTINGS_KEY, value: toSave, updated_at: new Date() });
}

async function renderMasterTaskList() {
  masterTaskCache = await getAllTasks();
  await loadUsersByIdCache();
  masterTableState.visibleCount = TASKS_PAGE_SIZE;
  masterTableState.selectedIds = new Set();
  masterTableState.visibleColumns = await loadMasterColumnVisibility();

  const container = document.getElementById('page-content');
  container.innerHTML = masterListShellHtml();
  attachMasterListShellEvents();
  renderMasterTableSection();
}

function distinctMasterValues(field) {
  return Array.from(new Set(masterTaskCache.map(t => t[field]).filter(Boolean))).sort();
}

function masterListShellHtml() {
  const totalValue = round2(masterTaskCache.reduce((sum, t) => sum + (t.new_total_price || 0), 0));
  return `
    <div class="fade-in tasks-page master-page">
      <div class="tasks-page-header">
        <div>
          <h1>All Tasks</h1>
          <p class="tasks-subtitle">${masterTaskCache.length} task${masterTaskCache.length === 1 ? '' : 's'} · ${formatMoney(totalValue) || 0} EGP total</p>
        </div>
        <div class="tasks-page-header-actions">
          <div class="master-columns-wrap">
            <button id="master-columns-btn" class="btn ghost sm">${iconSvg('rows', 14)}<span>Columns</span></button>
            <div id="master-columns-menu" class="master-columns-menu card scale-in hidden"></div>
          </div>
        </div>
      </div>
      <div class="tasks-filters-bar">
        <div class="tasks-search-wrap">
          ${iconSvg('search', 15)}
          <input id="master-search" class="input tasks-search" type="text" placeholder="Search Site ID, Job Code, Task Name, Engineer…">
        </div>
        <select id="master-filter-status" class="select tasks-filter">
          <option value="">All Status</option>
          ${STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select id="master-filter-region" class="select tasks-filter">
          <option value="">All Regions</option>
          ${REGIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
        <select id="master-filter-vendor" class="select tasks-filter">
          <option value="">All Vendors</option>
          ${distinctMasterValues('vendor').map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
        </select>
        <select id="master-filter-coordinator" class="select tasks-filter">
          <option value="">All Coordinators</option>
          ${distinctMasterValues('coordinator_name').map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <select id="master-filter-acceptance" class="select tasks-filter">
          <option value="">All Acceptance</option>
          ${ACCEPTANCE_STATUSES.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
        <select id="master-filter-txrf" class="select tasks-filter">
          <option value="">All TX/RF</option>
          ${TXRF_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <select id="master-filter-quick" class="select tasks-filter">
          <option value="">No Quick Filter</option>
          <option value="missing_price">Missing price</option>
          <option value="locked">Locked only</option>
          <option value="done_no_acceptance">Done, no acceptance</option>
        </select>
      </div>
      <div id="master-table-section" class="tasks-table-section master-table-section"></div>
    </div>`;
}

function handleDocumentClickForColumnsMenu(e) {
  const wrap = document.querySelector('.master-columns-wrap');
  if (!wrap) return;
  if (!wrap.contains(e.target)) {
    const menu = document.getElementById('master-columns-menu');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      masterTableState.columnsMenuOpen = false;
    }
  }
}

function attachMasterListShellEvents() {
  document.getElementById('master-columns-btn').addEventListener('click', toggleMasterColumnsMenu);
  document.removeEventListener('click', handleDocumentClickForColumnsMenu);
  document.addEventListener('click', handleDocumentClickForColumnsMenu);

  let searchTimer = null;
  document.getElementById('master-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => {
      masterTableState.search = value;
      masterTableState.visibleCount = TASKS_PAGE_SIZE;
      renderMasterTableSection();
    }, 300);
  });

  const filterMap = {
    'master-filter-status': 'status',
    'master-filter-region': 'region',
    'master-filter-vendor': 'vendor',
    'master-filter-coordinator': 'coordinator',
    'master-filter-acceptance': 'acceptanceStatus',
    'master-filter-txrf': 'txrf',
    'master-filter-quick': 'quickFilter'
  };
  Object.keys(filterMap).forEach(id => {
    document.getElementById(id).addEventListener('change', (e) => {
      masterTableState[filterMap[id]] = e.target.value;
      masterTableState.visibleCount = TASKS_PAGE_SIZE;
      renderMasterTableSection();
    });
  });
}

function masterColumnsMenuHtml() {
  const groupHtml = (cols, groupLabel) => `
    <div class="master-columns-group">
      <div class="master-columns-group-label">${groupLabel}</div>
      ${cols.map(col => `
        <label class="master-columns-item${col.alwaysVisible ? ' locked' : ''}">
          <input type="checkbox" data-col="${col.key}" ${masterTableState.visibleColumns[col.key] ? 'checked' : ''} ${col.alwaysVisible ? 'disabled' : ''}>
          <span>${escapeHtml(col.label)}</span>
          ${col.alwaysVisible ? iconSvg('lock', 10) : ''}
        </label>`).join('')}
    </div>`;

  return groupHtml(COORDINATOR_COLUMNS, 'Coordinator Fields') + groupHtml(PM_COLUMNS, 'PM Fields');
}

function toggleMasterColumnsMenu() {
  const menu = document.getElementById('master-columns-menu');
  masterTableState.columnsMenuOpen = !masterTableState.columnsMenuOpen;

  if (masterTableState.columnsMenuOpen) {
    menu.innerHTML = masterColumnsMenuHtml();
    menu.classList.remove('hidden');
    menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        masterTableState.visibleColumns[e.target.dataset.col] = e.target.checked;
        await saveMasterColumnVisibility(masterTableState.visibleColumns);
        renderMasterTableSection();
      });
    });
  } else {
    menu.classList.add('hidden');
  }
}

function getVisibleColumnsList() {
  return ALL_MASTER_COLUMNS.filter(col => masterTableState.visibleColumns[col.key]);
}

function getFilteredSortedMasterTasks() {
  const q = masterTableState.search.trim().toLowerCase();

  let rows = masterTaskCache.filter(t => {
    if (q) {
      const hay = `${t.physical_site_id || ''} ${t.job_code || ''} ${t.task_name || ''} ${t.engineer_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (masterTableState.status && t.status !== masterTableState.status) return false;
    if (masterTableState.region && t.region !== masterTableState.region) return false;
    if (masterTableState.vendor && t.vendor !== masterTableState.vendor) return false;
    if (masterTableState.coordinator && t.coordinator_name !== masterTableState.coordinator) return false;
    if (masterTableState.acceptanceStatus && t.acceptance_status !== masterTableState.acceptanceStatus) return false;
    if (masterTableState.txrf && t.tx_rf !== masterTableState.txrf) return false;

    if (masterTableState.quickFilter === 'missing_price' && (t.price_snapshot !== null && t.price_snapshot !== undefined)) return false;
    if (masterTableState.quickFilter === 'locked' && !t.is_locked) return false;
    if (masterTableState.quickFilter === 'done_no_acceptance' && !(t.status === 'Done' && !t.acceptance_status)) return false;

    return true;
  });

  const field = masterTableState.sortField;
  const colMeta = ALL_MASTER_COLUMNS.find(c => c.key === field);
  const dir = masterTableState.sortDir === 'asc' ? 1 : -1;

  rows.sort((a, b) => {
    let av = a[field];
    let bv = b[field];

    if (colMeta && colMeta.type === 'date') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else if (colMeta && (colMeta.type === 'num' || colMeta.type === 'money')) {
      av = (av === null || av === undefined || av === '') ? -Infinity : Number(av);
      bv = (bv === null || bv === undefined || bv === '') ? -Infinity : Number(bv);
    } else {
      av = (av || '').toString().toLowerCase();
      bv = (bv || '').toString().toLowerCase();
    }

    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return rows;
}

function masterSortIconHtml(field) {
  if (masterTableState.sortField !== field) return '';
  const rotated = masterTableState.sortDir === 'asc' ? ' style="transform:rotate(180deg)"' : '';
  return `<span class="sort-icon"${rotated}>${iconSvg('chevDown', 11)}</span>`;
}

function masterCellDisplayValue(task, col) {
  const value = task[col.key];

  if (col.key === 'id') {
    const color = coordinatorBadgeColor(task.coordinator_name);
    return `<span class="id-coord-bar" style="background:${color}"></span><span class="mono">${escapeHtml(value)}</span>`;
  }
  if (col.type === 'badge') {
    return statusBadgeHtml(value);
  }
  if (col.type === 'money') {
    const formatted = formatMoney(value);
    return formatted === null ? `<span style="color:var(--amber)">—</span>` : `<span class="num mono">${formatted}</span>`;
  }
  if (col.type === 'num') {
    if (value === null || value === undefined || value === '') return `<span style="color:var(--ink-3)">—</span>`;
    return `<span class="num mono">${escapeHtml(String(value))}</span>`;
  }
  if (col.type === 'date') {
    return value ? `<span class="mono" style="color:var(--ink-2)">${formatDate(value)}</span>` : `<span style="color:var(--ink-3)">—</span>`;
  }
  if (col.type === 'mono') {
    return `<span class="mono">${escapeHtml(value || '')}</span>`;
  }
  if (value === null || value === undefined || value === '') return `<span style="color:var(--ink-3)">—</span>`;
  return escapeHtml(String(value));
}

function masterTableHeadHtml(visibleCols) {
  const rows = getFilteredSortedMasterTasks();
  const allChecked = rows.length > 0 && rows.every(t => masterTableState.selectedIds.has(t.id));

  const ths = visibleCols.map(col => {
    const isPm = !!PM_FIELD_META_MAP[col.key];
    const lockIcon = col.alwaysVisible ? `<span class="th-lock-icon" title="System-critical — always visible">${iconSvg('lock', 10)}</span>` : '';
    return `<th class="${isPm ? 'pm-col-header' : ''} sortable" style="width:${col.width}px" data-sort="${col.key}">${escapeHtml(col.label)}${lockIcon}${masterSortIconHtml(col.key)}</th>`;
  }).join('');

  return `
    <tr>
      <th style="width:56px">
        <span class="row-checkbox${allChecked ? ' checked' : ''}" id="master-select-all">${allChecked ? iconSvg('check', 11) : ''}</span>
      </th>
      ${ths}
    </tr>`;
}

function masterRowHtml(task, visibleCols) {
  const lockedClass = task.is_locked ? ' locked-row' : '';
  const selected = masterTableState.selectedIds.has(task.id);
  const selectedClass = selected ? ' selected-row' : '';

  const cells = visibleCols.map(col => {
    const isPm = !!PM_FIELD_META_MAP[col.key];
    const cellClass = isPm ? 'pm-col-cell' : '';
    const editableAttr = isPm ? ` data-pm-cell="${col.key}" data-id="${escapeHtml(task.id)}"` : '';
    return `<td class="${cellClass}"${editableAttr}>${masterCellDisplayValue(task, col)}</td>`;
  }).join('');

  return `
    <tr class="data-row${lockedClass}${selectedClass}" data-id="${escapeHtml(task.id)}">
      <td class="master-checkbox-cell">
        <span class="row-checkbox${selected ? ' checked' : ''}" data-action="select-row" data-id="${escapeHtml(task.id)}">${selected ? iconSvg('check', 11) : ''}</span>
        ${masterLockButtonHtml(task)}
      </td>
      ${cells}
    </tr>`;
}

function masterLockButtonHtml(task) {
  if (task.is_locked) {
    return `<span class="lock-icon lock-action" data-action="unlock-task" data-id="${escapeHtml(task.id)}" title="${escapeHtml(lockTooltipText(task))}">${iconSvg('lock', 13)}</span>`;
  }
  return `<span class="lock-icon lock-action" data-action="lock-task" data-id="${escapeHtml(task.id)}" title="Lock task">${iconSvg('unlock', 13)}</span>`;
}

function renderMasterTableSection() {
  const section = document.getElementById('master-table-section');
  if (!section) return;

  const rows = getFilteredSortedMasterTasks();
  const visibleCols = getVisibleColumnsList();

  if (rows.length === 0) {
    section.innerHTML = `
      <div class="card tasks-table-wrap">
        <div class="empty-state">
          ${iconSvg('search', 30)}
          <div class="empty-state-title">No tasks match these filters.</div>
          <div class="empty-state-desc">Try adjusting filters or search.</div>
        </div>
      </div>
      <div id="master-bulk-bar-root"></div>`;
    return;
  }

  const pageRows = rows.slice(0, masterTableState.visibleCount);

  section.innerHTML = `
    <div class="card tasks-table-wrap master-table-wrap" id="master-table-wrap">
      <table class="data-table master-table">
        <thead id="master-thead">${masterTableHeadHtml(visibleCols)}</thead>
        <tbody id="master-tbody">
          ${pageRows.map(t => masterRowHtml(t, visibleCols)).join('')}
        </tbody>
      </table>
    </div>
    <div id="master-bulk-bar-root"></div>`;

  attachMasterTableEvents(visibleCols);
  renderMasterBulkBar();

  document.getElementById('master-table-wrap').addEventListener('scroll', handleMasterTableScroll);
}

function handleMasterTableScroll(e) {
  const wrap = e.target;
  if (wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 120) return;

  const rows = getFilteredSortedMasterTasks();
  if (masterTableState.visibleCount >= rows.length) return;

  const visibleCols = getVisibleColumnsList();
  const nextRows = rows.slice(masterTableState.visibleCount, masterTableState.visibleCount + TASKS_PAGE_SIZE);
  masterTableState.visibleCount += TASKS_PAGE_SIZE;

  const tbody = document.getElementById('master-tbody');
  if (tbody) {
    tbody.insertAdjacentHTML('beforeend', nextRows.map(t => masterRowHtml(t, visibleCols)).join(''));
    attachMasterRowEvents(visibleCols);
  }
}

function attachMasterTableEvents(visibleCols) {
  attachMasterRowEvents(visibleCols);

  const selectAll = document.getElementById('master-select-all');
  if (selectAll) {
    selectAll.addEventListener('click', () => {
      const rows = getFilteredSortedMasterTasks();
      const allChecked = rows.length > 0 && rows.every(t => masterTableState.selectedIds.has(t.id));
      if (allChecked) {
        rows.forEach(t => masterTableState.selectedIds.delete(t.id));
      } else {
        rows.forEach(t => masterTableState.selectedIds.add(t.id));
      }
      renderMasterTableSection();
    });
  }

  document.querySelectorAll('#master-thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (masterTableState.sortField === field) {
        masterTableState.sortDir = masterTableState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        masterTableState.sortField = field;
        masterTableState.sortDir = 'asc';
      }
      renderMasterTableSection();
    });
  });
}

function attachMasterRowEvents() {
  document.querySelectorAll('[data-action="select-row"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (masterTableState.selectedIds.has(id)) {
        masterTableState.selectedIds.delete(id);
      } else {
        masterTableState.selectedIds.add(id);
      }
      renderMasterTableSection();
    });
  });

  document.querySelectorAll('[data-pm-cell]').forEach(cell => {
    cell.addEventListener('click', () => startInlinePmEdit(cell));
  });

  document.querySelectorAll('[data-action="lock-task"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLockTaskClick(btn.dataset.id);
    });
  });

  document.querySelectorAll('[data-action="unlock-task"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUnlockTaskClick(btn.dataset.id);
    });
  });
}

async function handleLockTaskClick(id) {
  if (!window.confirm('Lock this task? Coordinators will no longer be able to edit it.')) return;

  await lockTask(id, 'Manual lock by PM/AM/CCM');
  showToast('Task locked.', 'success');
  masterTaskCache = await getAllTasks();
  renderMasterTableSection();
}

function handleUnlockTaskClick(id) {
  openUnlockReasonModal(id);
}

function openUnlockReasonModal(id) {
  const root = document.createElement('div');
  document.body.appendChild(root);

  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    root.remove();
    document.removeEventListener('keydown', escHandler);
  };

  root.innerHTML = `
    <div class="modal-backdrop scale-in" id="unlock-modal-backdrop">
      <div class="card modal" id="unlock-modal-card">
        <div class="modal-header">
          <h2>Unlock Task</h2>
          <button class="icon-btn" id="unlock-modal-close">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <label class="field" for="unlock-reason-input">
            <span class="lbl">Reason for unlocking<span class="req">*</span></span>
            <textarea id="unlock-reason-input" class="input textarea" rows="2"></textarea>
            <span class="field-error" id="unlock-reason-error"></span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="unlock-modal-cancel">Cancel</button>
          <button class="btn primary" id="unlock-modal-confirm">Unlock</button>
        </div>
      </div>
    </div>`;

  document.getElementById('unlock-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'unlock-modal-backdrop') close();
  });
  document.getElementById('unlock-modal-close').addEventListener('click', close);
  document.getElementById('unlock-modal-cancel').addEventListener('click', close);
  document.getElementById('unlock-modal-confirm').addEventListener('click', async () => {
    const input = document.getElementById('unlock-reason-input');
    const errorEl = document.getElementById('unlock-reason-error');
    const reason = input.value.trim();

    if (!reason) {
      input.classList.add('input-error');
      errorEl.textContent = 'A reason is required.';
      return;
    }

    const result = await unlockTask(id, reason);
    close();

    if (result && result.error) {
      showToast(result.error, 'error');
      return;
    }

    showToast('Task unlocked', 'success');
    masterTaskCache = await getAllTasks();
    renderMasterTableSection();
  });
  document.addEventListener('keydown', escHandler);
}

function startInlinePmEdit(cell) {
  if (cell.classList.contains('editing')) return;

  const field = cell.dataset.pmCell;
  const id = cell.dataset.id;
  const task = masterTaskCache.find(t => t.id === id);
  if (!task) return;

  const meta = PM_FIELD_META_MAP[field];
  const originalHtml = cell.innerHTML;
  cell.classList.add('editing');

  const rawValue = (task[field] === null || task[field] === undefined) ? '' : task[field];
  let inputHtml;

  if (meta.type === 'select') {
    inputHtml = `<select class="inline-edit-input select">
      <option value="">— Select —</option>
      ${meta.options.map(o => `<option value="${o}" ${rawValue === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`;
  } else if (meta.type === 'date') {
    inputHtml = `<input type="date" class="inline-edit-input input" value="${rawValue ? formatDateISO(rawValue) : ''}">`;
  } else if (meta.type === 'num') {
    inputHtml = `<input type="number" step="0.01" class="inline-edit-input input num" value="${rawValue}">`;
  } else {
    inputHtml = `<input type="text" class="inline-edit-input input" value="${escapeHtml(rawValue)}">`;
  }

  cell.innerHTML = inputHtml;
  const input = cell.querySelector('.inline-edit-input');
  input.focus();
  if (input.select) input.select();

  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    cell.classList.remove('editing');
    cell.innerHTML = originalHtml;
  };

  const commit = async () => {
    if (cancelled) return;

    const newRaw = input.value;
    const newValue = meta.type === 'num'
      ? (newRaw === '' ? null : Number(newRaw))
      : (newRaw === '' ? null : newRaw);

    if (newValue === rawValue) {
      cell.classList.remove('editing');
      cell.innerHTML = originalHtml;
      return;
    }

    const changes = { [field]: newValue };
    if (meta.overrideKey) changes[meta.overrideKey] = true;

    const result = await updateTask(id, changes);
    if (result && result.error) {
      showToast(result.error, 'error');
      cell.classList.remove('editing');
      cell.innerHTML = originalHtml;
      return;
    }

    const idx = masterTaskCache.findIndex(t => t.id === id);
    if (idx !== -1) masterTaskCache[idx] = result;
    cell.classList.remove('editing');
    cell.innerHTML = masterCellDisplayValue(result, meta);
    showToast('Saved.', 'success', 1400);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('blur', commit);
}

function renderMasterBulkBar() {
  const root = document.getElementById('master-bulk-bar-root');
  if (!root) return;

  const count = masterTableState.selectedIds.size;
  if (count === 0) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <div class="master-bulk-bar scale-in">
      <span class="master-bulk-count">${count} selected</span>
      <span class="master-bulk-divider"></span>
      <button class="master-bulk-btn" data-bulk="acceptance_status">Set Acceptance Status</button>
      <button class="master-bulk-btn" data-bulk="fac_date">Set FAC Date</button>
      <button class="master-bulk-btn" data-bulk="po_status">Set PO Status</button>
      <button class="master-bulk-btn" data-bulk="vf_invoice_no">Set VF Invoice #</button>
      <button class="master-bulk-btn" data-bulk="lock">Lock selected</button>
      <button class="master-bulk-btn master-bulk-close" data-bulk="clear" title="Clear selection">${iconSvg('close', 13)}</button>
    </div>
    <div id="bulk-modal-root"></div>`;

  root.querySelectorAll('[data-bulk]').forEach(btn => {
    btn.addEventListener('click', () => handleBulkAction(btn.dataset.bulk));
  });
}

function handleBulkAction(action) {
  if (action === 'clear') {
    masterTableState.selectedIds = new Set();
    renderMasterTableSection();
    return;
  }
  if (action === 'lock') {
    handleBulkLock();
    return;
  }
  openBulkFieldModal(action);
}

function bulkFieldModalConfig(action) {
  const configs = {
    acceptance_status: { title: 'Set Acceptance Status', type: 'select', options: ACCEPTANCE_STATUSES, label: 'Acceptance Status' },
    fac_date: { title: 'Set FAC Date', type: 'date', label: 'FAC Date' },
    po_status: { title: 'Set PO Status', type: 'select', options: PO_STATUSES, label: 'PO Status' },
    vf_invoice_no: { title: 'Set VF Invoice #', type: 'text', label: 'VF Invoice #' }
  };
  return configs[action];
}

function openBulkFieldModal(action) {
  const config = bulkFieldModalConfig(action);
  const root = document.getElementById('bulk-modal-root');
  if (!root) return;

  const inputHtml = config.type === 'select'
    ? `<select id="bulk-field-input" class="select">
        <option value="">— Select —</option>
        ${config.options.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>`
    : `<input id="bulk-field-input" type="${config.type}" class="input">`;

  root.innerHTML = `
    <div class="modal-backdrop scale-in" id="bulk-modal-backdrop">
      <div class="card modal" id="bulk-modal-card">
        <div class="modal-header">
          <h2>${config.title}</h2>
          <button class="icon-btn" id="bulk-modal-close">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <label class="field" for="bulk-field-input">
            <span class="lbl">${config.label}<span class="req">*</span></span>
            ${inputHtml}
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="bulk-modal-cancel">Cancel</button>
          <button class="btn primary" id="bulk-modal-apply">Apply to ${masterTableState.selectedIds.size} task${masterTableState.selectedIds.size === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>`;

  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', escHandler);
  };

  document.getElementById('bulk-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'bulk-modal-backdrop') close(); });
  document.getElementById('bulk-modal-close').addEventListener('click', close);
  document.getElementById('bulk-modal-cancel').addEventListener('click', close);
  document.getElementById('bulk-modal-apply').addEventListener('click', async () => {
    const value = document.getElementById('bulk-field-input').value;
    if (!value) { showToast(`${config.label} is required.`, 'error'); return; }
    await applyBulkFieldUpdate(action, value);
    close();
  });
  document.addEventListener('keydown', escHandler);
}

const BULK_FIELD_LABELS = {
  acceptance_status: 'Acceptance status',
  fac_date: 'FAC date',
  po_status: 'PO status',
  vf_invoice_no: 'VF Invoice #'
};

async function applyBulkFieldUpdate(field, value) {
  const ids = Array.from(masterTableState.selectedIds);
  for (const id of ids) {
    await updateTask(id, { [field]: value });
  }

  showToast(`${BULK_FIELD_LABELS[field]} set on ${ids.length} task${ids.length === 1 ? '' : 's'}.`, 'success');
  masterTableState.selectedIds = new Set();
  masterTaskCache = await getAllTasks();
  renderMasterTableSection();
}

async function handleBulkLock() {
  const ids = Array.from(masterTableState.selectedIds);
  const toLock = ids.filter(id => {
    const t = masterTaskCache.find(task => task.id === id);
    return t && !t.is_locked;
  });

  if (toLock.length === 0) {
    showToast('All selected tasks are already locked.', 'info');
    masterTableState.selectedIds = new Set();
    renderMasterTableSection();
    return;
  }

  if (!window.confirm(`Lock ${toLock.length} task${toLock.length === 1 ? '' : 's'}?`)) return;

  for (const id of toLock) {
    await lockTask(id, 'Bulk locked from master table');
  }

  showToast(`${toLock.length} task${toLock.length === 1 ? '' : 's'} locked.`, 'success');
  masterTableState.selectedIds = new Set();
  masterTaskCache = await getAllTasks();
  renderMasterTableSection();
}

/* ==========================================================================
   Task form — add / edit
   ========================================================================== */

async function showTaskForm(taskId) {
  const task = taskId ? await db.tasks.get(taskId) : null;
  const doneDate = task ? task.done_date : null;
  const [lineItemResult, streamResult] = await Promise.all([
    getLineItemOptionsForDate(doneDate),
    getActiveStreamNames(doneDate)
  ]);
  renderTaskForm(
    task,
    lineItemResult.items,
    streamResult.items,
    lineItemResult.warning === 'no_catalog',
    streamResult.warning === 'no_stream_list'
  );
}

function taskFieldHtml(key, label, type, value, required, disabled) {
  return `
    <label class="field" for="field-${key}">
      <span class="lbl">${escapeHtml(label)}${required ? '<span class="req">*</span>' : ''}</span>
      <input id="field-${key}" name="${key}" type="${type}" class="input" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}>
      <span class="field-error" id="error-${key}"></span>
    </label>`;
}

function selectFieldHtml(key, label, options, value, required, disabled, optionMeta, hintHtml) {
  const opts = options.map(opt => {
    const meta = optionMeta ? optionMeta.find(m => m.code === opt) : null;
    const labelText = meta ? `${opt} — ${meta.name} — ${formatMoney(meta.price)} EGP` : opt;
    const selected = String(value) === String(opt) ? 'selected' : '';
    return `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(labelText)}</option>`;
  }).join('');

  return `
    <label class="field" for="field-${key}">
      <span class="lbl">${escapeHtml(label)}${required ? '<span class="req">*</span>' : ''}</span>
      <select id="field-${key}" name="${key}" class="select" ${disabled ? 'disabled' : ''}>
        <option value="">— Select —</option>
        ${opts}
      </select>
      ${hintHtml || ''}
      <span class="field-error" id="error-${key}"></span>
    </label>`;
}

function textareaFieldHtml(key, label, value, disabled) {
  return `
    <label class="field field-full" for="field-${key}">
      <span class="lbl">${escapeHtml(label)}</span>
      <textarea id="field-${key}" name="${key}" class="input textarea" rows="3" ${disabled ? 'disabled' : ''}>${escapeHtml(value)}</textarea>
    </label>`;
}

function autoCalcFieldHtml(key, label, value, overridden, required, disabled) {
  return `
    <label class="field" for="field-${key}">
      <span class="lbl">${escapeHtml(label)}${required ? '<span class="req">*</span>' : ''}</span>
      <div class="auto-calc-wrap">
        <input id="field-${key}" name="${key}" type="number" step="0.01" class="input num mono" value="${value === null || value === undefined ? '' : value}" ${disabled ? 'disabled' : ''}>
        <span class="auto-calc-icon${overridden && !disabled ? ' clickable' : ''}" id="autocalc-${key}" title="${overridden ? 'Manually set. Click to recalculate.' : 'Auto-calculated'}">
          ${overridden ? iconSvg('edit', 13) : iconSvg('calc', 13)}
        </span>
      </div>
      <input type="hidden" id="override-${key}" name="${key}_overridden" value="${overridden ? 'true' : 'false'}">
      <span class="field-error" id="error-${key}"></span>
    </label>`;
}

const CALC_WARNING_MESSAGES = {
  no_catalog: 'No price catalog found for this line item — price could not be calculated.'
};

function renderTaskForm(task, lineItems, streams, noCatalog, noStreamList) {
  const container = document.getElementById('page-content');
  const noCatalogHint = noCatalog
    ? `<div class="field-hint-warning">${iconSvg('warn', 12)}<span>No active catalog. Ask PM to upload.</span></div>`
    : '';
  const noStreamHint = noStreamList
    ? `<div class="field-hint-warning">${iconSvg('warn', 12)}<span>No general stream list. Ask PM to upload.</span></div>`
    : '';
  const isEdit = !!task;
  const locked = !!(task && task.is_locked);
  const v = (key) => (task && task[key] !== undefined && task[key] !== null) ? task[key] : '';
  const ov = (key) => !!(task && task[key]);

  const overridden = {
    new_price: ov('new_price_overridden'),
    actual_quantity: ov('actual_quantity_overridden'),
    new_total_price: ov('new_total_price_overridden'),
    lmp_portion: ov('lmp_portion_overridden'),
    contractor_portion: ov('contractor_portion_overridden')
  };

  let isFrozen = isEdit && !!task.done_date;

  container.innerHTML = `
    <div class="fade-in task-form-page">
      <div class="task-form-header">
        <h1>${isEdit ? 'Edit Task' : 'Add Task'}</h1>
        ${isEdit ? `<p class="tasks-subtitle mono">${escapeHtml(task.id)}</p>` : ''}
      </div>
      ${locked ? `
        <div class="lock-banner">
          ${iconSvg('lock', 15)}
          <span>This task is locked${task.lock_reason ? `: ${escapeHtml(task.lock_reason)}` : '.'} Fields are read-only.</span>
        </div>` : ''}
      <form id="task-form" class="task-form-grid">

        <div class="form-section card">
          <div class="form-section-title">Site Info</div>
          <div class="form-section-grid">
            ${taskFieldHtml('job_code', 'Job Code', 'text', v('job_code'), true, locked)}
            ${selectFieldHtml('tx_rf', 'TX/RF', TXRF_OPTIONS, v('tx_rf'), true, locked)}
            ${taskFieldHtml('vendor', 'Vendor', 'text', v('vendor'), true, locked)}
            ${taskFieldHtml('physical_site_id', 'Physical Site ID', 'text', v('physical_site_id'), true, locked)}
            ${taskFieldHtml('logical_site_id', 'Logical Site ID', 'text', v('logical_site_id'), false, locked)}
            ${taskFieldHtml('site_option', 'Site Option', 'text', v('site_option'), false, locked)}
            ${taskFieldHtml('facing', 'Facing', 'text', v('facing'), false, locked)}
            ${selectFieldHtml('region', 'Region', REGIONS, v('region'), true, locked)}
            ${taskFieldHtml('sub_region', 'Sub Region', 'text', v('sub_region'), false, locked)}
            ${selectFieldHtml('distance', 'Distance', DISTANCE_BANDS, v('distance'), true, locked)}
            ${selectFieldHtml('general_stream', 'General Stream', streams.map(s => s.stream_name), v('general_stream'), true, locked, null, noStreamHint)}
          </div>
        </div>

        <div class="form-section card">
          <div class="form-section-title">Task Info</div>
          <div class="form-section-grid">
            ${taskFieldHtml('main_task', 'Main Task', 'text', v('main_task'), false, locked)}
            ${selectFieldHtml('task_name', 'Task Name', TASK_NAMES, v('task_name'), true, locked)}
            ${selectFieldHtml('contractor', 'Contractor', CONTRACTORS, v('contractor'), true, locked)}
            ${taskFieldHtml('engineer_name', "Engineer's Name", 'text', v('engineer_name'), true, locked)}
            ${selectFieldHtml('line_item_code', 'Line Item', lineItems.map(i => i.code), v('line_item_code'), true, locked, lineItems, noCatalogHint)}
            ${taskFieldHtml('absolute_quantity', 'Absolute Quantity', 'number', v('absolute_quantity'), true, locked)}
            ${autoCalcFieldHtml('actual_quantity', 'Actual Quantity', v('actual_quantity') === '' ? null : v('actual_quantity'), overridden.actual_quantity, true, locked)}
          </div>
        </div>

        <div class="form-section card">
          <div class="form-section-title">Status</div>
          <div class="form-section-grid">
            ${selectFieldHtml('status', 'Status', STATUS_OPTIONS, v('status'), true, locked)}
            ${taskFieldHtml('task_date', 'Task Date', 'date', formatDateISO(v('task_date')), false, locked)}
            ${taskFieldHtml('done_date', 'Done Date', 'date', formatDateISO(v('done_date')), false, locked)}
            ${taskFieldHtml('vf_task_owner', 'VF Task Owner', 'text', v('vf_task_owner'), false, locked)}
            ${taskFieldHtml('prq', 'PRQ', 'text', v('prq'), false, locked)}
            ${taskFieldHtml('pc', 'PC', 'text', v('pc'), false, locked)}
            ${textareaFieldHtml('comments', 'Comments', v('comments'), locked)}
          </div>
        </div>

        <div class="form-section card">
          <div class="form-section-title">Calculated <span class="calc-badge">${iconSvg('calc', 11)} Auto-calculated</span></div>
          <div id="calc-warnings" class="calc-warnings hidden"></div>
          <div class="form-section-grid">
            ${autoCalcFieldHtml('new_price', 'New Price', v('new_price') === '' ? null : v('new_price'), overridden.new_price, false, locked)}
            ${autoCalcFieldHtml('new_total_price', 'New Total Price', v('new_total_price') === '' ? null : v('new_total_price'), overridden.new_total_price, false, locked)}
            ${autoCalcFieldHtml('lmp_portion', 'LMP Portion', v('lmp_portion') === '' ? null : v('lmp_portion'), overridden.lmp_portion, false, locked)}
            ${autoCalcFieldHtml('contractor_portion', 'Contractor Portion', v('contractor_portion') === '' ? null : v('contractor_portion'), overridden.contractor_portion, false, locked)}
          </div>
          <input type="hidden" id="field-catalog_year" name="catalog_year" value="${v('catalog_year')}">
          <input type="hidden" id="field-portion_rule_id" name="portion_rule_id" value="${v('portion_rule_id')}">
        </div>

        <div class="task-form-footer">
          <button type="button" id="task-form-cancel" class="btn ghost">Cancel</button>
          <button type="submit" id="task-form-save" class="btn primary" ${locked ? 'disabled' : ''}>Save</button>
        </div>
      </form>
    </div>`;

  document.getElementById('task-form-cancel').addEventListener('click', () => renderCoordinatorTaskList());

  if (!locked) {
    document.getElementById('task-form').addEventListener('submit', (e) => handleTaskFormSubmit(e, task ? task.id : null));
    document.getElementById('field-job_code').addEventListener('blur', () => validateJobCodeOnBlur(task ? task.id : null));
    wireCalcEngine(overridden, () => isFrozen, (val) => { isFrozen = val; });
  }
}

function getNumField(key) {
  const input = document.getElementById(`field-${key}`);
  if (!input) return null;
  return input.value === '' ? null : Number(input.value);
}

function getRawField(key) {
  const input = document.getElementById(`field-${key}`);
  return input ? input.value : '';
}

function setFieldValue(key, value) {
  const input = document.getElementById(`field-${key}`);
  if (input) input.value = (value === null || value === undefined) ? '' : value;
}

function setOverrideUI(overridden, key, isOverridden) {
  overridden[key] = isOverridden;

  const hidden = document.getElementById(`override-${key}`);
  if (hidden) hidden.value = isOverridden ? 'true' : 'false';

  const iconEl = document.getElementById(`autocalc-${key}`);
  if (!iconEl) return;
  iconEl.innerHTML = isOverridden ? iconSvg('edit', 13) : iconSvg('calc', 13);
  iconEl.title = isOverridden ? 'Manually set. Click to recalculate.' : 'Auto-calculated';
  iconEl.classList.toggle('clickable', isOverridden);
}

function showCalcWarnings(warningCodes) {
  const el = document.getElementById('calc-warnings');
  if (!el) return;

  const messages = (warningCodes || []).filter(Boolean).map(code => CALC_WARNING_MESSAGES[code] || code);
  if (messages.length === 0) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  el.classList.remove('hidden');
  el.innerHTML = messages.map(m => `<div class="calc-warning">${iconSvg('warn', 14)}<span>${escapeHtml(m)}</span></div>`).join('');
}

function buildCalcSnapshot(overridden) {
  return {
    line_item_code: getRawField('line_item_code') || null,
    absolute_quantity: getNumField('absolute_quantity') || 0,
    distance: getRawField('distance') || null,
    done_date: getRawField('done_date') || null,
    contractor: getRawField('contractor') || null,
    new_price: getNumField('new_price'),
    new_price_overridden: overridden.new_price,
    actual_quantity: getNumField('actual_quantity'),
    actual_quantity_overridden: overridden.actual_quantity,
    new_total_price: getNumField('new_total_price'),
    new_total_price_overridden: overridden.new_total_price,
    lmp_portion: getNumField('lmp_portion'),
    lmp_portion_overridden: overridden.lmp_portion,
    contractor_portion: getNumField('contractor_portion'),
    contractor_portion_overridden: overridden.contractor_portion,
    catalog_year: getRawField('catalog_year') || null,
    portion_rule_id: getRawField('portion_rule_id') || null
  };
}

async function recalcPrice(overridden) {
  if (overridden.new_price) return;
  const lineItemCode = getRawField('line_item_code');
  if (!lineItemCode) return;

  const result = await getPriceForDate(lineItemCode, getRawField('done_date') || null);
  setFieldValue('new_price', result.price);
  setFieldValue('catalog_year', result.catalogYear ?? '');
  showCalcWarnings([result.warning]);
  await recalcTotal(overridden);
}

async function recalcQuantity(overridden) {
  if (overridden.actual_quantity) return;
  const absoluteQty = getNumField('absolute_quantity') || 0;
  const multiplier = await getDistanceMultiplier(getRawField('distance'));
  setFieldValue('actual_quantity', round2(absoluteQty * multiplier));
  await recalcTotal(overridden);
}

async function recalcTotal(overridden) {
  if (overridden.new_total_price) return;
  const price = getNumField('new_price');
  const qty = getNumField('actual_quantity');
  if (price === null || qty === null) return;
  setFieldValue('new_total_price', round2(price * qty));
}

async function recalcPortions(overridden) {
  const contractor = getRawField('contractor');
  if (!contractor) return;

  const result = await getPortionForDate(contractor, getRawField('done_date') || null);
  if (result.warning) {
    showCalcWarnings([result.warning]);
    return;
  }

  setFieldValue('portion_rule_id', result.ruleId ?? '');
  const total = getNumField('new_total_price');
  if (total === null) return;

  if (!overridden.lmp_portion) setFieldValue('lmp_portion', round2(total * (result.lmpPct / 100)));
  if (!overridden.contractor_portion) setFieldValue('contractor_portion', round2(total * (result.contractorPct / 100)));
}

async function recalcDoneDateChain(overridden) {
  const snapshot = buildCalcSnapshot(overridden);
  const result = await calculateTaskFinancials(snapshot);

  if (!overridden.new_price) setFieldValue('new_price', result.price_snapshot);
  if (!overridden.actual_quantity) setFieldValue('actual_quantity', result.actual_quantity);
  if (!overridden.new_total_price) setFieldValue('new_total_price', result.new_total_price);
  if (!overridden.lmp_portion) setFieldValue('lmp_portion', result.lmp_portion);
  if (!overridden.contractor_portion) setFieldValue('contractor_portion', result.contractor_portion);
  setFieldValue('catalog_year', result.catalog_year ?? '');
  setFieldValue('portion_rule_id', result.portion_rule_id ?? '');

  showCalcWarnings(result.warnings);
}

function wireCalcEngine(overridden, getIsFrozen, setIsFrozen) {
  const AUTO_CALC_KEYS = ['new_price', 'actual_quantity', 'new_total_price', 'lmp_portion', 'contractor_portion'];

  AUTO_CALC_KEYS.forEach(key => {
    const input = document.getElementById(`field-${key}`);
    if (input) {
      input.addEventListener('input', () => {
        setOverrideUI(overridden, key, true);
        if (key === 'new_price' || key === 'actual_quantity') recalcTotal(overridden);
      });
    }

    const iconEl = document.getElementById(`autocalc-${key}`);
    if (iconEl) {
      iconEl.addEventListener('click', async () => {
        if (!overridden[key]) return;
        setOverrideUI(overridden, key, false);
        if (key === 'new_price') await recalcPrice(overridden);
        else if (key === 'actual_quantity') await recalcQuantity(overridden);
        else if (key === 'new_total_price') await recalcTotal(overridden);
        else await recalcPortions(overridden);
      });
    }
  });

  const lineItemSelect = document.getElementById('field-line_item_code');
  if (lineItemSelect) {
    lineItemSelect.addEventListener('change', () => {
      if (getIsFrozen()) return;
      recalcPrice(overridden);
    });
  }

  const absoluteQtyInput = document.getElementById('field-absolute_quantity');
  if (absoluteQtyInput) {
    absoluteQtyInput.addEventListener('input', () => {
      if (getIsFrozen()) return;
      recalcQuantity(overridden);
    });
  }

  const distanceSelect = document.getElementById('field-distance');
  if (distanceSelect) {
    distanceSelect.addEventListener('change', () => {
      if (getIsFrozen()) return;
      recalcQuantity(overridden);
    });
  }

  const doneDateInput = document.getElementById('field-done_date');
  if (doneDateInput) {
    doneDateInput.addEventListener('change', () => {
      setIsFrozen(false);
      recalcDoneDateChain(overridden);
    });
  }
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll('[name]').forEach(el => {
    const value = el.value;
    if (el.name.endsWith('_overridden')) {
      data[el.name] = value === 'true';
    } else if (el.type === 'number' || el.name === 'catalog_year' || el.name === 'portion_rule_id') {
      data[el.name] = value === '' ? null : Number(value);
    } else {
      data[el.name] = value === '' ? null : value;
    }
  });
  return data;
}

function clearFieldError(key) {
  const input = document.getElementById(`field-${key}`);
  const errorEl = document.getElementById(`error-${key}`);
  if (input) input.classList.remove('input-error');
  if (errorEl) errorEl.textContent = '';
}

function markFieldError(key, message) {
  const input = document.getElementById(`field-${key}`);
  const errorEl = document.getElementById(`error-${key}`);
  if (input) input.classList.add('input-error');
  if (errorEl) errorEl.textContent = message;
}

function clearAllFieldErrors(form) {
  form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  form.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
}

async function validateJobCodeOnBlur(taskId) {
  clearFieldError('job_code');

  const jobCode = document.getElementById('field-job_code').value.trim();
  const siteId = document.getElementById('field-physical_site_id').value.trim();
  if (!jobCode || !siteId) return;

  const allTasks = await getAllTasks();
  const result = validateJobCode(jobCode, siteId, allTasks, taskId);
  if (!result.valid) {
    markFieldError('job_code', result.error);
  }
}

async function handleTaskFormSubmit(e, taskId) {
  e.preventDefault();
  const form = e.target;
  clearAllFieldErrors(form);

  const formData = collectFormData(form);
  const requiredCheck = validateRequiredFields(formData);
  if (!requiredCheck.valid) {
    Object.keys(requiredCheck.errors).forEach(key => markFieldError(key, requiredCheck.errors[key]));
    return;
  }

  const allTasks = await getAllTasks();
  const jobCodeCheck = validateJobCode(formData.job_code, formData.physical_site_id, allTasks, taskId);
  if (!jobCodeCheck.valid) {
    markFieldError('job_code', jobCodeCheck.error);
    return;
  }

  const result = taskId ? await updateTask(taskId, formData) : await addTask(formData);
  if (result && result.error) {
    window.alert(result.error);
    return;
  }

  await renderCoordinatorTaskList();
}

/* ==========================================================================
   Bulk entry — one site header + N line items
   ========================================================================== */

const BULK_HEADER_REQUIRED = ['job_code', 'tx_rf', 'vendor', 'physical_site_id', 'region', 'distance', 'contractor', 'engineer_name', 'general_stream'];
const BULK_HEADER_KEYS = ['job_code', 'tx_rf', 'vendor', 'physical_site_id', 'logical_site_id', 'site_option', 'facing', 'region', 'sub_region', 'distance', 'contractor', 'engineer_name', 'vf_task_owner', 'general_stream'];
const BULK_ROW_REQUIRED = ['line_item_code', 'absolute_quantity', 'actual_quantity', 'status'];

let bulkState = null;

function createBulkRow(overrides) {
  return Object.assign({
    line_item_code: '',
    absolute_quantity: null,
    actual_quantity: null,
    actual_quantity_overridden: false,
    status: '',
    done_date: null,
    comments: '',
    new_price: null,
    new_total_price: null,
    catalog_year: null,
    portion_rule_id: null,
    lmp_portion: null,
    contractor_portion: null
  }, overrides || {});
}

async function renderBulkEntryForm() {
  const user = getCurrentUser();
  const [lineItemResult, streamResult, templates, defaultsSetting] = await Promise.all([
    getLineItemOptionsForDate(null),
    getActiveStreamNames(null),
    db.task_templates.filter(t => t.is_active).toArray(),
    db.app_settings.get(`user_defaults_${user.id}`)
  ]);

  const defaults = (defaultsSetting && defaultsSetting.value) || {};

  bulkState = {
    lineItems: lineItemResult.items,
    noCatalog: lineItemResult.warning === 'no_catalog',
    streams: streamResult.items,
    noStreamList: streamResult.warning === 'no_stream_list',
    templates,
    defaultTemplateId: defaults.default_template_id || null,
    header: {
      job_code: '',
      tx_rf: defaults.tx_rf || '',
      vendor: defaults.vendor || '',
      physical_site_id: '',
      logical_site_id: '',
      site_option: '',
      facing: '',
      region: defaults.region || '',
      sub_region: defaults.sub_region || '',
      distance: defaults.distance || '',
      contractor: defaults.contractor || '',
      engineer_name: defaults.engineer_name || '',
      vf_task_owner: defaults.vf_task_owner || '',
      general_stream: defaults.general_stream || ''
    },
    rows: [createBulkRow()]
  };

  renderBulkEntryPage();
}

function bulkDataRows() {
  return bulkState.rows.filter(r => r.line_item_code || r.absolute_quantity);
}

function bulkLineItemOptionsHtml(selectedCode) {
  return bulkState.lineItems.map(item => {
    const selected = item.code === selectedCode ? 'selected' : '';
    return `<option value="${escapeHtml(item.code)}" ${selected}>${escapeHtml(item.code)} — ${escapeHtml(item.name)} — ${formatMoney(item.price)} EGP</option>`;
  }).join('');
}

function bulkRowHtml(row, idx) {
  const doneDateVal = row.done_date ? formatDateISO(row.done_date) : '';
  const priceText = (row.new_total_price === null || row.new_total_price === undefined) ? '—' : formatMoney(row.new_total_price);
  const actQtyCellClass = row.actual_quantity_overridden ? ' cell-overridden' : '';

  return `
    <tr data-row="${idx}">
      <td class="bulk-row-num mono">${idx + 1}</td>
      <td>
        <select class="select" data-row="${idx}" data-field="line_item_code">
          <option value="">— Select —</option>
          ${bulkLineItemOptionsHtml(row.line_item_code)}
        </select>
      </td>
      <td><input type="number" step="0.01" class="input num mono" data-row="${idx}" data-field="absolute_quantity" value="${row.absolute_quantity === null || row.absolute_quantity === undefined ? '' : row.absolute_quantity}"></td>
      <td class="${actQtyCellClass}"><input type="number" step="0.01" class="input num mono" data-row="${idx}" data-field="actual_quantity" value="${row.actual_quantity === null || row.actual_quantity === undefined ? '' : row.actual_quantity}"></td>
      <td>
        <select class="select" data-row="${idx}" data-field="status">
          <option value="">— Select —</option>
          ${STATUS_OPTIONS.map(s => `<option value="${s}" ${row.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input type="date" class="input" data-row="${idx}" data-field="done_date" value="${doneDateVal}"></td>
      <td class="num-col mono bulk-price-cell">${priceText}</td>
      <td><input type="text" class="input" data-row="${idx}" data-field="comments" value="${escapeHtml(row.comments || '')}"></td>
      <td><button type="button" class="icon-btn sm-icon-btn" data-action="remove-row" data-row="${idx}" title="Remove row">${iconSvg('trash', 13)}</button></td>
    </tr>`;
}

function bulkEntryPageHtml() {
  const h = bulkState.header;
  const streamNames = bulkState.streams.map(s => s.stream_name);

  return `
    <div class="fade-in task-form-page">
      <div class="task-form-header">
        <h1>Bulk Entry</h1>
        <p class="tasks-subtitle">Add multiple line items for one site</p>
      </div>
      <div class="task-form-grid">
        <div class="form-section card">
          <div class="form-section-title">Site Info</div>
          <div class="bulk-header-grid grid-5">
            ${taskFieldHtml('job_code', 'Job Code', 'text', h.job_code, true)}
            ${selectFieldHtml('tx_rf', 'TX/RF', TXRF_OPTIONS, h.tx_rf, true)}
            ${taskFieldHtml('vendor', 'Vendor', 'text', h.vendor, true)}
            ${taskFieldHtml('physical_site_id', 'Physical Site ID', 'text', h.physical_site_id, true)}
            ${taskFieldHtml('logical_site_id', 'Logical Site ID', 'text', h.logical_site_id, false)}
            ${taskFieldHtml('site_option', 'Site Option', 'text', h.site_option, false)}
            ${taskFieldHtml('facing', 'Facing', 'text', h.facing, false)}
            ${selectFieldHtml('region', 'Region', REGIONS, h.region, true)}
            ${taskFieldHtml('sub_region', 'Sub Region', 'text', h.sub_region, false)}
            ${selectFieldHtml('distance', 'Distance', DISTANCE_BANDS, h.distance, true)}
          </div>
          <div class="bulk-header-grid grid-4">
            ${selectFieldHtml('contractor', 'Contractor', CONTRACTORS, h.contractor, true)}
            ${taskFieldHtml('engineer_name', 'Engineer Name', 'text', h.engineer_name, true)}
            ${taskFieldHtml('vf_task_owner', 'VF Task Owner', 'text', h.vf_task_owner, false)}
            ${selectFieldHtml('general_stream', 'General Stream', streamNames, h.general_stream, true, false, null, bulkState.noStreamList ? `<div class="field-hint-warning">${iconSvg('warn', 12)}<span>No general stream list. Ask PM to upload.</span></div>` : '')}
          </div>
          <div class="bulk-template-row">
            <div class="bulk-template-group">
              <select id="bulk-template-select" class="select">
                <option value="">Apply Template…</option>
                ${bulkState.templates.map(t => `<option value="${t.id}" ${String(bulkState.defaultTemplateId) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
              </select>
              <button type="button" id="bulk-template-apply-btn" class="btn ghost sm">Apply</button>
            </div>
            <div class="bulk-fill-group">
              <select id="bulk-fill-status" class="select">
                <option value="">Fill same status…</option>
                ${STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
              <input type="date" id="bulk-fill-date" class="input" title="Fill same date for all rows">
            </div>
          </div>
        </div>

        <div class="form-section card">
          <div class="form-section-title">Line Items</div>
          ${bulkState.noCatalog ? `<div class="calc-warning" style="margin-bottom:10px">${iconSvg('warn', 14)}<span>No active catalog. Ask PM to upload.</span></div>` : ''}
          <div class="tasks-table-wrap">
            <table class="data-table bulk-items-table">
              <thead>
                <tr>
                  <th style="width:32px">#</th>
                  <th>Line Item<span class="req">*</span></th>
                  <th style="width:90px">Abs Qty<span class="req">*</span></th>
                  <th style="width:90px">Act Qty<span class="req">*</span></th>
                  <th style="width:120px">Status<span class="req">*</span></th>
                  <th style="width:130px">Done Date</th>
                  <th style="width:104px" class="num-col">Price</th>
                  <th>Comments</th>
                  <th style="width:36px"></th>
                </tr>
              </thead>
              <tbody id="bulk-rows-tbody">
                ${bulkState.rows.map((row, idx) => bulkRowHtml(row, idx)).join('')}
              </tbody>
            </table>
          </div>
          <div class="bulk-add-row-wrap">
            <button type="button" id="bulk-add-row-btn" class="btn ghost sm">${iconSvg('add', 13)}<span>Add row</span></button>
          </div>
          <div id="bulk-price-preview" class="bulk-price-preview"></div>
        </div>

        <div class="task-form-footer">
          <button type="button" id="bulk-cancel-btn" class="btn ghost">Cancel</button>
          <button type="button" id="bulk-save-btn" class="btn primary">Save all ${bulkDataRows().length} tasks</button>
        </div>
      </div>
    </div>`;
}

function renderBulkEntryPage() {
  document.getElementById('page-content').innerHTML = bulkEntryPageHtml();
  attachBulkEntryEvents();
  renderPricePreview();
}

function updateBulkSaveButtonLabel() {
  const btn = document.getElementById('bulk-save-btn');
  if (btn) btn.textContent = `Save all ${bulkDataRows().length} tasks`;
}

function renderPricePreview() {
  updateBulkSaveButtonLabel();

  const el = document.getElementById('bulk-price-preview');
  if (!el) return;

  const dataRows = bulkDataRows();
  const doneRows = dataRows.filter(r => r.status === 'Done');
  const assignedRows = dataRows.filter(r => r.status === 'Assigned');
  const doneTotal = round2(doneRows.reduce((sum, r) => sum + (r.new_total_price || 0), 0));

  const parts = [
    `Done: ${doneRows.length} item${doneRows.length === 1 ? '' : 's'}${doneRows.length ? ` = ${formatMoney(doneTotal)} EGP` : ''}`,
    `Assigned: ${assignedRows.length} item${assignedRows.length === 1 ? '' : 's'}`,
    `Total rows: ${dataRows.length}`
  ];

  el.textContent = parts.join('  |  ');
}

function renderBulkRowsTable() {
  const tbody = document.getElementById('bulk-rows-tbody');
  if (!tbody) return;
  tbody.innerHTML = bulkState.rows.map((row, idx) => bulkRowHtml(row, idx)).join('');
  renderPricePreview();
}

async function computeBulkRowFinancials(idx) {
  const row = bulkState.rows[idx];
  if (!row) return;

  if (!row.line_item_code) {
    row.new_price = null;
    row.new_total_price = null;
    row.lmp_portion = null;
    row.contractor_portion = null;
    return;
  }

  const result = await calculateTaskFinancials({
    line_item_code: row.line_item_code,
    absolute_quantity: row.absolute_quantity || 0,
    distance: getRawField('distance'),
    done_date: row.done_date,
    contractor: getRawField('contractor'),
    new_price_overridden: false,
    actual_quantity: row.actual_quantity,
    actual_quantity_overridden: row.actual_quantity_overridden,
    new_total_price_overridden: false,
    lmp_portion_overridden: false,
    contractor_portion_overridden: false
  });

  row.new_price = result.price_snapshot;
  if (!row.actual_quantity_overridden) row.actual_quantity = result.actual_quantity;
  row.new_total_price = result.new_total_price;
  row.lmp_portion = result.lmp_portion;
  row.contractor_portion = result.contractor_portion;
  row.catalog_year = result.catalog_year;
  row.portion_rule_id = result.portion_rule_id;
}

function updateRowCalculatedCellsDOM(idx) {
  const row = bulkState.rows[idx];
  if (!row) return;
  const tr = document.querySelector(`#bulk-rows-tbody tr[data-row="${idx}"]`);
  if (!tr) return;

  const actInput = tr.querySelector('[data-field="actual_quantity"]');
  if (actInput) actInput.value = (row.actual_quantity === null || row.actual_quantity === undefined) ? '' : row.actual_quantity;

  const actCell = actInput ? actInput.closest('td') : null;
  if (actCell) actCell.classList.toggle('cell-overridden', !!row.actual_quantity_overridden);

  const priceCell = tr.querySelector('.bulk-price-cell');
  if (priceCell) {
    priceCell.textContent = (row.new_total_price === null || row.new_total_price === undefined) ? '—' : formatMoney(row.new_total_price);
  }
}

async function recalcBulkRowAndUpdateDOM(idx) {
  await computeBulkRowFinancials(idx);
  updateRowCalculatedCellsDOM(idx);
}

async function recalcAllBulkRowsFinancials() {
  for (let i = 0; i < bulkState.rows.length; i++) {
    await computeBulkRowFinancials(i);
  }
  renderBulkRowsTable();
}

function maybeAppendBlankRow(idx) {
  if (idx !== bulkState.rows.length - 1) return;
  const row = bulkState.rows[idx];
  const hasData = !!(row.line_item_code || row.absolute_quantity);
  if (!hasData) return;

  bulkState.rows.push(createBulkRow());
  const tbody = document.getElementById('bulk-rows-tbody');
  if (tbody) {
    const newIdx = bulkState.rows.length - 1;
    tbody.insertAdjacentHTML('beforeend', bulkRowHtml(bulkState.rows[newIdx], newIdx));
  }
}

function removeBulkRow(idx) {
  if (bulkState.rows.length <= 1) {
    bulkState.rows[0] = createBulkRow();
  } else {
    bulkState.rows.splice(idx, 1);
  }
  renderBulkRowsTable();
}

function applyBulkRowFieldValue(idx, field, value) {
  const row = bulkState.rows[idx];
  if (!row) return;
  if (field === 'absolute_quantity' || field === 'actual_quantity') {
    row[field] = value === '' ? null : Number(value);
  } else if (field === 'done_date') {
    row.done_date = value || null;
  } else {
    row[field] = value;
  }
}

function handleBulkRowInput(e) {
  const target = e.target.closest('[data-field]');
  if (!target) return;
  applyBulkRowFieldValue(Number(target.dataset.row), target.dataset.field, target.value);
}

async function handleBulkRowChange(e) {
  const target = e.target.closest('[data-field]');
  if (!target) return;

  const idx = Number(target.dataset.row);
  const field = target.dataset.field;

  applyBulkRowFieldValue(idx, field, target.value);
  clearBulkRowFieldError(idx, field);

  const row = bulkState.rows[idx];

  if (field === 'actual_quantity') {
    row.actual_quantity_overridden = true;
    const cell = target.closest('td');
    if (cell) cell.classList.add('cell-overridden');
  }

  if (field === 'line_item_code' || field === 'absolute_quantity' || field === 'done_date') {
    await recalcBulkRowAndUpdateDOM(idx);
  }

  maybeAppendBlankRow(idx);
  renderPricePreview();
}

function handleBulkRowClick(e) {
  const btn = e.target.closest('[data-action="remove-row"]');
  if (!btn) return;
  removeBulkRow(Number(btn.dataset.row));
}

function markBulkRowFieldError(idx, field) {
  const input = document.querySelector(`#bulk-rows-tbody tr[data-row="${idx}"] [data-field="${field}"]`);
  if (input) input.classList.add('input-error');
}

function clearBulkRowFieldError(idx, field) {
  const input = document.querySelector(`#bulk-rows-tbody tr[data-row="${idx}"] [data-field="${field}"]`);
  if (input) input.classList.remove('input-error');
}

async function handleApplyTemplate() {
  const select = document.getElementById('bulk-template-select');
  const templateId = Number(select.value);
  if (!templateId) return;

  const items = await db.task_template_items.where('template_id').equals(templateId).sortBy('sort_order');
  if (items.length === 0) {
    showToast('This template has no line items.', 'warning');
    return;
  }

  const template = await db.task_templates.get(templateId);
  if (template) {
    await db.task_templates.update(templateId, { times_applied: (template.times_applied || 0) + 1 });
  }

  bulkState.rows = items.map(item => createBulkRow({
    line_item_code: item.line_item_code,
    absolute_quantity: item.default_qty ?? null
  }));
  bulkState.rows.push(createBulkRow());

  for (let i = 0; i < bulkState.rows.length - 1; i++) {
    await computeBulkRowFinancials(i);
  }

  renderBulkRowsTable();
}

function handleFillSameStatus(e) {
  const value = e.target.value;
  if (!value) return;
  bulkState.rows.forEach(row => { row.status = value; });
  renderBulkRowsTable();
  e.target.value = '';
}

async function handleFillSameDate(e) {
  const value = e.target.value || null;
  bulkState.rows.forEach(row => { row.done_date = value; });
  await recalcAllBulkRowsFinancials();
}

function collectBulkHeaderData() {
  const data = {};
  BULK_HEADER_KEYS.forEach(key => { data[key] = getRawField(key) || null; });
  return data;
}

function validateBulkHeader(header) {
  const errors = {};
  BULK_HEADER_REQUIRED.forEach(key => {
    if (!header[key]) errors[key] = 'Required';
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

async function validateBulkJobCodeOnBlur() {
  clearFieldError('job_code');

  const jobCode = getRawField('job_code').trim();
  const siteId = getRawField('physical_site_id').trim();
  if (!jobCode || !siteId) return;

  const allTasks = await getAllTasks();
  const result = validateJobCode(jobCode, siteId, allTasks, null);
  if (!result.valid) {
    markFieldError('job_code', result.error);
  }
}

function isBulkRowDirty(row) {
  return !!(row.line_item_code || row.absolute_quantity);
}

async function handleBulkSave() {
  clearAllFieldErrors(document.querySelector('.task-form-grid'));

  const header = collectBulkHeaderData();
  const headerCheck = validateBulkHeader(header);
  if (!headerCheck.valid) {
    Object.keys(headerCheck.errors).forEach(key => markFieldError(key, 'Required.'));
    showToast('Fill in all required site header fields.', 'error');
    return;
  }

  const allTasks = await getAllTasks();
  const jobCodeCheck = validateJobCode(header.job_code, header.physical_site_id, allTasks, null);
  if (!jobCodeCheck.valid) {
    markFieldError('job_code', jobCodeCheck.error);
    showToast(jobCodeCheck.error, 'error');
    return;
  }

  const dirtyRows = bulkState.rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => isBulkRowDirty(row));

  if (dirtyRows.length === 0) {
    showToast('Add at least one line item.', 'error');
    return;
  }

  let hasRowErrors = false;
  dirtyRows.forEach(({ row, idx }) => {
    BULK_ROW_REQUIRED.forEach(field => {
      const value = row[field];
      const isEmpty = value === null || value === undefined || value === '';
      if (isEmpty) {
        markBulkRowFieldError(idx, field);
        hasRowErrors = true;
      }
    });
  });

  if (hasRowErrors) {
    showToast('Fill in all required fields on every row.', 'error');
    return;
  }

  const currentUser = getCurrentUser();
  const now = new Date();
  const tasksToCreate = [];

  for (const { row } of dirtyRows) {
    const id = await generateTaskId(currentUser.prefix);
    tasksToCreate.push({
      ...header,
      id,
      line_item_code: row.line_item_code,
      absolute_quantity: row.absolute_quantity,
      actual_quantity: row.actual_quantity,
      actual_quantity_overridden: row.actual_quantity_overridden,
      new_price: row.new_price,
      new_price_overridden: false,
      new_total_price: row.new_total_price,
      new_total_price_overridden: false,
      catalog_year: row.catalog_year,
      portion_rule_id: row.portion_rule_id,
      lmp_portion: row.lmp_portion,
      lmp_portion_overridden: false,
      contractor_portion: row.contractor_portion,
      contractor_portion_overridden: false,
      status: row.status,
      done_date: row.done_date,
      comments: row.comments || null,
      main_task: null,
      task_name: null,
      task_date: null,
      prq: null,
      pc: null,
      is_deleted: false,
      is_locked: false,
      created_at: now,
      updated_at: now,
      created_by: currentUser.id,
      coordinator_id: currentUser.id,
      coordinator_name: currentUser.name
    });
  }

  await db.transaction('rw', db.tasks, db.audit_log, async () => {
    await db.tasks.bulkAdd(tasksToCreate);
    for (const task of tasksToCreate) {
      await writeAuditLog({ task_id: task.id, user_id: currentUser.id, action: 'task_created' });
    }
  });

  showToast(`${tasksToCreate.length} task${tasksToCreate.length === 1 ? '' : 's'} created for site ${header.physical_site_id}.`, 'success');

  await renderCoordinatorTaskList();
}

function attachBulkEntryEvents() {
  document.getElementById('field-job_code').addEventListener('blur', validateBulkJobCodeOnBlur);

  document.getElementById('field-distance').addEventListener('change', () => recalcAllBulkRowsFinancials());
  document.getElementById('field-contractor').addEventListener('change', () => recalcAllBulkRowsFinancials());

  document.getElementById('bulk-template-apply-btn').addEventListener('click', handleApplyTemplate);
  document.getElementById('bulk-fill-status').addEventListener('change', handleFillSameStatus);
  document.getElementById('bulk-fill-date').addEventListener('change', handleFillSameDate);
  document.getElementById('bulk-add-row-btn').addEventListener('click', () => {
    bulkState.rows.push(createBulkRow());
    renderBulkRowsTable();
  });

  document.getElementById('bulk-cancel-btn').addEventListener('click', () => renderCoordinatorTaskList());
  document.getElementById('bulk-save-btn').addEventListener('click', handleBulkSave);

  const tbody = document.getElementById('bulk-rows-tbody');
  tbody.addEventListener('input', handleBulkRowInput);
  tbody.addEventListener('change', handleBulkRowChange);
  tbody.addEventListener('click', handleBulkRowClick);
}

window.renderBulkEntryForm = renderBulkEntryForm;

window.addTask = addTask;
window.updateTask = updateTask;
window.softDeleteTask = softDeleteTask;
window.recoverTask = recoverTask;
window.lockTask = lockTask;
window.unlockTask = unlockTask;
window.getMyTasks = getMyTasks;
window.getAllTasks = getAllTasks;
window.getDeletedTasks = getDeletedTasks;
window.renderTasks = renderTasks;
window.renderMasterTaskList = renderMasterTaskList;
window.renderTaskForm = renderTaskForm;

window.loadDropdownListsFromSettings = loadDropdownListsFromSettings;
window.syncDistanceBandsFromList = syncDistanceBandsFromList;
window.syncAllMasterColumns = syncAllMasterColumns;
window.loadColumnOrderFromSettings = loadColumnOrderFromSettings;
window.saveColumnOrder = saveColumnOrder;
window.loadMasterColumnVisibility = loadMasterColumnVisibility;
window.saveMasterColumnVisibility = saveMasterColumnVisibility;
