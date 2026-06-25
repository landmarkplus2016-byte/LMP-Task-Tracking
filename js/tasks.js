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
        <button id="add-task-btn" class="btn primary">${iconSvg('add', 15)}<span>Add Task</span></button>
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
