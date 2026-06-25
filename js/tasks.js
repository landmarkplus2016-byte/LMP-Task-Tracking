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
    await lockTask(id, `Auto-locked: acceptance status set to ${changes.acceptance_status}`);
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
const TASKS_PAGE_SIZE = 50;

let taskListCache = [];
let taskListState = { search: '', status: '', region: '', vendor: '', tx_rf: '', sortField: 'done_date', sortDir: 'desc', page: 1 };

function renderTasks() {
  const user = getCurrentUser();
  if (!user) return;

  if (user.role === 'coordinator') {
    renderCoordinatorTaskList();
  } else {
    document.getElementById('page-content').innerHTML = `
      <div class="fade-in" style="padding:26px">
        <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.01em;color:var(--ink)">All Tasks</h1>
        <p style="color:var(--ink-2);font-size:13px;margin-top:8px">Master task view is built in a later stage.</p>
      </div>`;
  }
}

async function renderCoordinatorTaskList() {
  const user = getCurrentUser();
  taskListCache = await getMyTasks(user.id);
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
    ? `<span class="lock-icon" title="${escapeHtml(t.lock_reason || 'Locked')}">${iconSvg('lock', 13)}</span>`
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
   Task form — add / edit
   ========================================================================== */

async function showTaskForm(taskId) {
  const task = taskId ? await db.tasks.get(taskId) : null;
  const [lineItems, streams] = await Promise.all([
    db.catalog_items.filter(i => i.is_active).toArray(),
    db.general_streams.filter(s => s.is_active).toArray()
  ]);
  renderTaskForm(task, lineItems, streams);
}

function taskFieldHtml(key, label, type, value, required, disabled) {
  return `
    <label class="field" for="field-${key}">
      <span class="lbl">${escapeHtml(label)}${required ? '<span class="req">*</span>' : ''}</span>
      <input id="field-${key}" name="${key}" type="${type}" class="input" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}>
      <span class="field-error" id="error-${key}"></span>
    </label>`;
}

function selectFieldHtml(key, label, options, value, required, disabled, optionMeta) {
  const opts = options.map(opt => {
    const labelText = optionMeta ? (optionMeta.find(m => m.code === opt) ? `${opt} — ${optionMeta.find(m => m.code === opt).name}` : opt) : opt;
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
  no_catalog: 'No price catalog found for this line item — price could not be calculated.',
  no_rule: 'No contractor portion rule found for this contractor — portions could not be calculated.'
};

function renderTaskForm(task, lineItems, streams) {
  const container = document.getElementById('page-content');
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
            ${selectFieldHtml('general_stream', 'General Stream', streams.map(s => s.stream_name), v('general_stream'), true, locked)}
          </div>
        </div>

        <div class="form-section card">
          <div class="form-section-title">Task Info</div>
          <div class="form-section-grid">
            ${taskFieldHtml('main_task', 'Main Task', 'text', v('main_task'), false, locked)}
            ${selectFieldHtml('task_name', 'Task Name', TASK_NAMES, v('task_name'), true, locked)}
            ${selectFieldHtml('contractor', 'Contractor', CONTRACTORS, v('contractor'), true, locked)}
            ${taskFieldHtml('engineer_name', "Engineer's Name", 'text', v('engineer_name'), true, locked)}
            ${selectFieldHtml('line_item_code', 'Line Item', lineItems.map(i => i.code), v('line_item_code'), true, locked, lineItems)}
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
  const [lineItems, streams, templates, defaultsSetting] = await Promise.all([
    db.catalog_items.filter(i => i.is_active).toArray(),
    db.general_streams.filter(s => s.is_active).toArray(),
    db.task_templates.filter(t => t.is_active).toArray(),
    db.app_settings.get(`user_defaults_${user.id}`)
  ]);

  const defaults = (defaultsSetting && defaultsSetting.value) || {};

  bulkState = {
    lineItems,
    streams,
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
    return `<option value="${escapeHtml(item.code)}" ${selected}>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</option>`;
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
            ${selectFieldHtml('general_stream', 'General Stream', streamNames, h.general_stream, true)}
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
window.renderTaskForm = renderTaskForm;
