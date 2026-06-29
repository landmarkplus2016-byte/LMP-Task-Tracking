/* ==========================================================================
   Settings — shell nav + Contractor Portions (CLAUDE.md Stage 4.2)
   ========================================================================== */

const SETTINGS_SECTIONS = [
  { key: 'my-defaults', label: 'My Defaults', roles: ['coordinator'] },
  { key: 'backup-data', label: 'Backup & Data', roles: null },
  { key: 'price-catalog', label: 'Price Catalog', roles: null },
  { key: 'general-stream', label: 'General Stream', roles: ['project_manager'] },
  { key: 'contractor-portions', label: 'Contractor Portions', roles: ['project_manager'] },
  { key: 'task-templates', label: 'Task Templates', roles: ['project_manager'] },
  { key: 'column-manager', label: 'Column Manager', roles: ['project_manager'] },
  { key: 'dropdown-lists', label: 'Dropdown Lists', roles: ['project_manager'] },
  { key: 'sync', label: 'Sync & Shared Folder', roles: MASTER_ROLES },
  { key: 'import-history', label: 'Import History', roles: ['project_manager'] },
  { key: 'user-accounts', label: 'User Accounts', roles: ['project_manager'] },
  { key: 'deleted-tasks', label: 'Deleted Tasks', roles: null },
  { key: 'audit-log', label: 'Audit Log', roles: ['project_manager'] }
];

let settingsState = { activeSection: null };

function getAvailableSettingsSections(role) {
  return SETTINGS_SECTIONS.filter(s => !s.roles || s.roles.includes(role));
}

function renderSettings() {
  const user = getCurrentUser();
  if (!user) return;

  const sections = getAvailableSettingsSections(user.role);
  const container = document.getElementById('page-content');
  if (!container) return;

  if (sections.length === 0) {
    container.innerHTML = `<div class="fade-in" style="padding:26px"><p style="color:var(--ink-2);font-size:13px">Nothing to configure yet.</p></div>`;
    return;
  }

  if (!settingsState.activeSection || !sections.find(s => s.key === settingsState.activeSection)) {
    settingsState.activeSection = sections[0].key;
  }

  container.innerHTML = settingsShellHtml(sections);
  attachSettingsNavEvents();
  renderActiveSettingsSection();
}

function settingsShellHtml(sections) {
  return `
    <div class="fade-in settings-page">
      <div class="settings-layout">
        <div class="settings-nav card">
          ${sections.map(settingsNavItemHtml).join('')}
        </div>
        <div id="settings-content" class="settings-content"></div>
      </div>
    </div>`;
}

function settingsNavItemHtml(section) {
  const active = settingsState.activeSection === section.key;
  return `<button class="settings-nav-item${active ? ' active' : ''}" data-section="${section.key}">${escapeHtml(section.label)}</button>`;
}

function attachSettingsNavEvents() {
  document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      settingsState.activeSection = btn.dataset.section;
      document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === settingsState.activeSection));
      renderActiveSettingsSection();
    });
  });
}

function renderActiveSettingsSection() {
  const key = settingsState.activeSection;
  if (key === 'my-defaults') {
    renderMyDefaultsSettings();
  } else if (key === 'backup-data') {
    renderBackupSettings();
  } else if (key === 'price-catalog') {
    renderCatalogSettings('settings-content');
  } else if (key === 'general-stream') {
    renderGeneralStreamSettings('settings-content');
  } else if (key === 'contractor-portions') {
    renderContractorPortionsSettings();
  } else if (key === 'task-templates') {
    renderTaskTemplatesSettings();
  } else if (key === 'column-manager') {
    renderColumnManagerSettings();
  } else if (key === 'dropdown-lists') {
    renderDropdownListsSettings();
  } else if (key === 'sync') {
    renderSyncSettings();
  } else if (key === 'import-history') {
    renderImportHistorySettings();
  } else if (key === 'user-accounts') {
    renderUserAccountsSettings();
  } else if (key === 'deleted-tasks') {
    renderDeletedTasksSettings();
  } else if (key === 'audit-log') {
    renderAuditLogSettings();
  }
}

/* ==========================================================================
   Contractor Portions
   ========================================================================== */

let portionsPageState = { expanded: {} };
let portionModalState = null;
let portionModalFormSnapshot = null;

function getCurrentPortionRule(sortedRulesDesc, dateValue) {
  const ruleDate = dateValue ? new Date(dateValue) : new Date();
  const eligible = sortedRulesDesc.filter(r => new Date(r.valid_from) <= ruleDate);
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, r) => new Date(r.valid_from) > new Date(latest.valid_from) ? r : latest);
}

async function renderContractorPortionsSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  let allRules;
  try {
    allRules = await db.contractor_portions.toArray();
  } catch (err) {
    showToast('Could not load contractor portions.', 'error');
    return;
  }
  const today = new Date();

  container.innerHTML = `
    <div class="fade-in">
      <div class="tasks-page-header" style="margin-bottom:14px">
        <div>
          <h1>Contractor Portions</h1>
          <p class="tasks-subtitle">${CONTRACTORS.length} contractor${CONTRACTORS.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div class="contractor-portion-grid">
        ${CONTRACTORS.map(name => contractorPortionCardHtml(name, allRules.filter(r => r.contractor_name === name), today)).join('')}
      </div>
      <div id="portion-modal-root"></div>
    </div>`;

  attachContractorPortionsEvents();
}

function contractorPortionCardHtml(name, rules, today) {
  const sorted = [...rules].sort((a, b) => new Date(b.valid_from) - new Date(a.valid_from));
  const current = getCurrentPortionRule(sorted, today);
  const expanded = !!portionsPageState.expanded[name];
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return `
    <div class="card contractor-portion-card">
      <div class="contractor-portion-header">
        <div>
          <div class="contractor-portion-name">${escapeHtml(name)}</div>
          ${current
            ? `<div class="contractor-portion-pct">LMP ${current.lmp_pct}% / Contractor ${current.contractor_pct}% <span class="contractor-portion-since">since ${formatDate(current.valid_from)}</span></div>`
            : `<div class="contractor-portion-empty">No portion rule yet</div>`}
        </div>
        <div class="contractor-portion-actions">
          ${sorted.length > 0 ? `<button class="btn ghost sm" data-action="history" data-contractor="${escapeHtml(name)}">${expanded ? 'Hide' : 'History'} (${sorted.length})</button>` : ''}
          <button class="btn primary sm" data-action="update" data-contractor="${escapeHtml(name)}">Update Portion</button>
        </div>
      </div>
      <div class="contractor-portion-history${expanded ? '' : ' hidden'}" id="history-${slug}">
        ${sorted.length > 0 ? contractorHistoryTableHtml(sorted) : ''}
      </div>
    </div>`;
}

function contractorHistoryTableHtml(rules) {
  return `
    <table class="data-table catalog-items-table">
      <thead>
        <tr><th>Effective From</th><th class="num-col">LMP %</th><th class="num-col">Contractor %</th><th>Notes</th></tr>
      </thead>
      <tbody>
        ${rules.map(r => `
          <tr>
            <td class="mono">${formatDate(r.valid_from)}</td>
            <td class="num-col num">${r.lmp_pct}</td>
            <td class="num-col num">${r.contractor_pct}</td>
            <td>${escapeHtml(r.notes || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function attachContractorPortionsEvents() {
  document.querySelectorAll('[data-action="history"]').forEach(btn => {
    btn.addEventListener('click', () => toggleContractorHistory(btn.dataset.contractor));
  });
  document.querySelectorAll('[data-action="update"]').forEach(btn => {
    btn.addEventListener('click', () => openUpdatePortionModal(btn.dataset.contractor));
  });
}

function toggleContractorHistory(name) {
  portionsPageState.expanded[name] = !portionsPageState.expanded[name];
  renderContractorPortionsSettings();
}

/* ==========================================================================
   Update Portion modal
   ========================================================================== */

function openUpdatePortionModal(contractorName) {
  portionModalState = { contractorName, lmpPct: '', validFrom: formatDateISO(new Date()), notes: '' };
  renderUpdatePortionModal();
}

function closeUpdatePortionModal() {
  const root = document.getElementById('portion-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', handlePortionModalEscape);
  portionModalState = null;
}

const handlePortionModalEscape = createModalEscapeHandler(
  () => document.getElementById('portion-modal-card'),
  () => portionModalFormSnapshot,
  closeUpdatePortionModal
);

function updatePortionModalHtml() {
  const s = portionModalState;

  return `
    <div class="modal-backdrop scale-in" id="portion-modal-backdrop">
      <div class="card modal" id="portion-modal-card">
        <div class="modal-header">
          <h2>Update Portion — ${escapeHtml(s.contractorName)}</h2>
          <button class="icon-btn" id="portion-modal-close" title="Close" aria-label="Close">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-section-grid">
            <label class="field" for="portion-lmp-input">
              <span class="lbl">LMP %<span class="req">*</span></span>
              <input id="portion-lmp-input" type="number" min="0" max="100" step="0.01" class="input num" value="${s.lmpPct}">
              <span class="field-error" id="portion-lmp-error"></span>
            </label>
            <label class="field" for="portion-contractor-pct">
              <span class="lbl">Contractor %</span>
              <input id="portion-contractor-pct" type="text" class="input num readonly-field" value="${s.lmpPct === '' ? '' : round2(100 - Number(s.lmpPct))}" disabled>
            </label>
          </div>
          <div class="form-section-grid" style="margin-top:14px">
            <label class="field" for="portion-validfrom-input">
              <span class="lbl">Effective From<span class="req">*</span></span>
              <input id="portion-validfrom-input" type="date" class="input" value="${s.validFrom}">
            </label>
          </div>
          <label class="field" for="portion-notes-input" style="margin-top:14px">
            <span class="lbl">Notes</span>
            <textarea id="portion-notes-input" class="input textarea" rows="2">${escapeHtml(s.notes)}</textarea>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="portion-modal-cancel">Cancel</button>
          <button class="btn primary" id="portion-modal-save">Save</button>
        </div>
      </div>
    </div>`;
}

function renderUpdatePortionModal() {
  const root = document.getElementById('portion-modal-root');
  if (!root) return;
  root.innerHTML = updatePortionModalHtml();
  attachUpdatePortionModalEvents();
}

function attachUpdatePortionModalEvents() {
  const modalCard = document.getElementById('portion-modal-card');
  portionModalFormSnapshot = captureFormSnapshot(modalCard);
  autofocusFirstField(modalCard);

  document.getElementById('portion-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'portion-modal-backdrop') closeUpdatePortionModal();
  });
  document.getElementById('portion-modal-close').addEventListener('click', closeUpdatePortionModal);
  document.getElementById('portion-modal-cancel').addEventListener('click', closeUpdatePortionModal);
  document.getElementById('portion-modal-save').addEventListener('click', handleSavePortion);
  document.getElementById('portion-lmp-input').addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('portion-contractor-pct').value = val === '' ? '' : round2(100 - Number(val));
  });

  enableEnterToSubmit(modalCard, document.getElementById('portion-modal-save'));
  document.addEventListener('keydown', handlePortionModalEscape);
}

async function handleSavePortion() {
  const lmpInput = document.getElementById('portion-lmp-input');
  const validFromInput = document.getElementById('portion-validfrom-input');
  const notesInput = document.getElementById('portion-notes-input');
  const lmpErrorEl = document.getElementById('portion-lmp-error');

  const lmpPct = Number(lmpInput.value);
  const validFrom = validFromInput.value;

  lmpErrorEl.textContent = '';
  lmpInput.classList.remove('input-error');

  if (lmpInput.value === '' || isNaN(lmpPct) || lmpPct < 0 || lmpPct > 100) {
    lmpInput.classList.add('input-error');
    lmpErrorEl.textContent = 'LMP % must be between 0 and 100.';
    return;
  }
  if (!validFrom) {
    showToast('Enter a valid "Effective From" date.', 'error');
    return;
  }

  const saveBtn = document.getElementById('portion-modal-save');
  setButtonLoading(saveBtn, true);

  try {
    await saveContractorPortion({
      contractor_name: portionModalState.contractorName,
      lmp_pct: lmpPct,
      valid_from: validFrom,
      notes: notesInput.value.trim() || null
    });

    showToast(`Portion rule saved for ${portionModalState.contractorName}.`, 'success');
    closeUpdatePortionModal();
    await renderContractorPortionsSettings();
  } catch (err) {
    setButtonLoading(saveBtn, false);
    showToast('Could not save the portion rule. Please try again.', 'error');
  }
}

async function saveContractorPortion({ contractor_name, lmp_pct, valid_from, notes }) {
  const currentUser = getCurrentUser();
  const contractor_pct = round2(100 - lmp_pct);

  const id = await db.contractor_portions.add({
    contractor_name,
    lmp_pct: round2(lmp_pct),
    contractor_pct,
    valid_from: new Date(valid_from),
    created_by: currentUser.id,
    notes: notes || null
  });

  await writeAuditLog({ user_id: currentUser.id, action: 'portion_rule_added', field_name: 'contractor_name', new_value: contractor_name });

  return await db.contractor_portions.get(id);
}

/* ==========================================================================
   Import History (CLAUDE.md Stage 5.3)
   ========================================================================== */

let importHistoryPageState = { history: [], expandedId: null, entries: {} };

async function renderImportHistorySettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  container.innerHTML = tableSkeletonHtml(4);

  try {
    importHistoryPageState.history = await getImportHistory();
    importHistoryPageState.expandedId = null;
    importHistoryPageState.entries = {};

    container.innerHTML = importHistoryPageHtml();
    attachImportHistoryEvents();
  } catch (err) {
    showToast('Could not load import history.', 'error');
  }
}

function importHistoryPageHtml() {
  const history = importHistoryPageState.history;

  if (history.length === 0) {
    return `
      <div class="fade-in">
        <h1>Import History</h1>
        <div class="card tasks-table-wrap">
          <div class="empty-state">
            ${iconSvg('import', 30)}
            <div class="empty-state-title">No imports yet.</div>
            <div class="empty-state-desc">Completed coordinator imports will appear here.</div>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="fade-in">
      <h1>Import History</h1>
      <p class="tasks-subtitle">${history.length} import${history.length === 1 ? '' : 's'}</p>
      <div class="card tasks-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:32px"></th>
              <th style="width:140px">Date</th>
              <th style="width:140px">Coordinator</th>
              <th style="width:220px">File</th>
              <th style="width:100px" class="num-col">New Added</th>
              <th style="width:130px" class="num-col">Changes Applied</th>
              <th style="width:100px" class="num-col">Discarded</th>
              <th style="width:140px">Imported By</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(importHistoryRowHtml).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function importHistoryRowHtml(entry) {
  const expanded = importHistoryPageState.expandedId === entry.import_id;

  const row = `
    <tr class="data-row catalog-row" data-import-id="${escapeHtml(entry.import_id)}">
      <td><span class="catalog-expand-icon${expanded ? ' expanded' : ''}">${iconSvg('chevRight', 14)}</span></td>
      <td class="mono">${importFormatDateTime(entry.date)}</td>
      <td>${escapeHtml(entry.coordinator_name || '')}</td>
      <td class="mono">${escapeHtml(entry.filename || '')}</td>
      <td class="num-col num">${entry.new_count}</td>
      <td class="num-col num">${entry.changes_applied}</td>
      <td class="num-col num">${entry.changes_discarded}</td>
      <td>${escapeHtml(entry.imported_by || '')}</td>
    </tr>`;

  const expandedRow = expanded
    ? `<tr class="catalog-items-row"><td colspan="8">${importHistoryDetailHtml(entry)}</td></tr>`
    : '';

  return row + expandedRow;
}

function importHistoryDetailHtml(entry) {
  const logs = importHistoryPageState.entries[entry.import_id];

  if (!logs) {
    return `<div class="catalog-items-wrap"><span style="color:var(--ink-3);font-size:13px">Loading…</span></div>`;
  }
  if (logs.length === 0) {
    return `<div class="catalog-items-wrap"><span style="color:var(--ink-3);font-size:13px">No audit log entries found for this import.</span></div>`;
  }

  return `
    <div class="catalog-items-wrap">
      <table class="data-table catalog-items-table">
        <thead>
          <tr>
            <th style="width:140px">Time</th>
            <th style="width:160px">Task ID</th>
            <th>Field</th>
            <th>Old → New</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td class="mono">${importFormatDateTime(l.timestamp)}</td>
              <td class="mono">${escapeHtml(l.task_id || '')}</td>
              <td>${l.field_name ? escapeHtml(importFieldLabel(l.field_name)) : '<span style="color:var(--ink-3)">Task added</span>'}</td>
              <td>${l.field_name ? `${importValueHtml(l.field_name, l.old_value)} → ${importValueHtml(l.field_name, l.new_value)}` : '<span style="color:var(--ink-3)">—</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function attachImportHistoryEvents() {
  document.querySelectorAll('[data-import-id]').forEach(row => {
    row.addEventListener('click', () => toggleImportHistoryExpand(row.dataset.importId));
  });
}

async function toggleImportHistoryExpand(importId) {
  if (importHistoryPageState.expandedId === importId) {
    importHistoryPageState.expandedId = null;
  } else {
    importHistoryPageState.expandedId = importId;
    if (!importHistoryPageState.entries[importId]) {
      const entry = importHistoryPageState.history.find(h => h.import_id === importId);
      if (entry) {
        try {
          importHistoryPageState.entries[importId] = await getImportSessionAuditEntries(entry);
        } catch (err) {
          showToast('Could not load import details.', 'error');
          return;
        }
      }
    }
  }

  const container = document.getElementById('settings-content');
  if (container) {
    container.innerHTML = importHistoryPageHtml();
    attachImportHistoryEvents();
  }
}

/* ==========================================================================
   Audit Log — PM only (CLAUDE.md Stage 7.2)
   ========================================================================== */

const AUDIT_ACTION_LABELS = {
  task_created: 'Task Created',
  task_updated: 'Task Updated',
  task_deleted: 'Task Deleted',
  task_recovered: 'Task Recovered',
  task_locked: 'Task Locked',
  task_unlocked: 'Task Unlocked',
  import_applied: 'Import Applied',
  restore_applied: 'Backup Restored',
  export_created: 'Export Created',
  login: 'Login',
  password_changed: 'Password Changed'
};

function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || action;
}

function auditFieldLabel(field) {
  if (!field) return '';
  const meta = ALL_MASTER_COLUMNS.find(c => c.key === field);
  return meta ? meta.label : field;
}

function auditFormatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const meta = ALL_MASTER_COLUMNS.find(c => c.key === field);
  if (meta && meta.type === 'date') {
    const formatted = formatDate(value);
    return formatted || String(value);
  }
  return String(value);
}

function auditValueDisplayHtml(formatted) {
  return formatted === '—' ? '<span style="color:var(--ink-3)">—</span>' : escapeHtml(formatted);
}

function auditOldValueHtml(entry) {
  if (!entry.field_name) return '<span style="color:var(--ink-3)">—</span>';
  return auditValueDisplayHtml(auditFormatValue(entry.field_name, entry.old_value));
}

function auditNewValueHtml(entry) {
  if (!entry.field_name) return '<span style="color:var(--ink-3)">—</span>';
  return `→ ${auditValueDisplayHtml(auditFormatValue(entry.field_name, entry.new_value))}`;
}

let auditLogState = {
  rows: [],
  usersById: {},
  siteIdByTaskId: {},
  expandedSessionId: null,
  filters: { dateFrom: '', dateTo: '', userName: '', action: '', search: '' }
};

async function buildAuditDisplayRows() {
  const allEntries = await db.audit_log.toArray();
  const importHistory = await getImportHistory();

  const consumedIds = new Set();
  const importSessionRows = [];

  for (const session of importHistory) {
    const entries = await getImportSessionAuditEntries(session);
    entries.forEach(e => consumedIds.add(e.id));
    importSessionRows.push({ type: 'import_session', session, entries, timestamp: session.date });
  }

  const flatRows = allEntries
    .filter(e => !consumedIds.has(e.id))
    .map(e => ({ type: 'entry', entry: e, timestamp: e.timestamp }));

  return [...importSessionRows, ...flatRows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function renderAuditLogSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  container.innerHTML = tableSkeletonHtml(5);

  try {
    const [rows, allUsers, allTasks] = await Promise.all([
      buildAuditDisplayRows(),
      db.users.toArray(),
      db.tasks.toArray()
    ]);

    auditLogState.rows = rows;
    auditLogState.usersById = Object.fromEntries(allUsers.map(u => [u.id, u.name]));
    auditLogState.siteIdByTaskId = Object.fromEntries(allTasks.map(t => [t.id, t.physical_site_id]));
    auditLogState.expandedSessionId = null;

    container.innerHTML = auditLogPageHtml();
    attachAuditLogEvents();
  } catch (err) {
    showToast('Could not load the audit log.', 'error');
  }
}

function rowUserName(row) {
  return row.type === 'entry'
    ? (auditLogState.usersById[row.entry.user_id] || '—')
    : (row.session.imported_by || '—');
}

function rowAction(row) {
  return row.type === 'entry' ? row.entry.action : 'import_applied';
}

function auditDistinctUserNames() {
  const names = new Set();
  auditLogState.rows.forEach(row => {
    const name = rowUserName(row);
    if (name && name !== '—') names.add(name);
  });
  return Array.from(names).sort();
}

function auditDistinctActions() {
  const actions = new Set();
  auditLogState.rows.forEach(row => actions.add(rowAction(row)));
  return Array.from(actions).sort();
}

function getFilteredAuditRows() {
  const f = auditLogState.filters;
  const query = f.search.trim().toLowerCase();
  const fromTime = f.dateFrom ? new Date(f.dateFrom).getTime() : null;
  const toTime = f.dateTo ? new Date(f.dateTo).getTime() + (24 * 60 * 60 * 1000 - 1) : null;

  return auditLogState.rows.filter(row => {
    const ts = new Date(row.timestamp).getTime();
    if (fromTime !== null && ts < fromTime) return false;
    if (toTime !== null && ts > toTime) return false;
    if (f.userName && rowUserName(row) !== f.userName) return false;
    if (f.action && rowAction(row) !== f.action) return false;

    if (query) {
      const entriesToCheck = row.type === 'entry' ? [row.entry] : row.entries;
      const matches = entriesToCheck.some(e => {
        const taskId = (e.task_id || '').toLowerCase();
        const siteId = (auditLogState.siteIdByTaskId[e.task_id] || '').toLowerCase();
        return taskId.includes(query) || siteId.includes(query);
      });
      if (!matches) return false;
    }

    return true;
  });
}

function auditLogPageHtml() {
  const userNames = auditDistinctUserNames();
  const actions = auditDistinctActions();
  const f = auditLogState.filters;

  return `
    <div class="fade-in">
      <div class="tasks-page-header" style="margin-bottom:14px">
        <div>
          <h1>Audit Log</h1>
          <p class="tasks-subtitle">${auditLogState.rows.length} entr${auditLogState.rows.length === 1 ? 'y' : 'ies'} recorded</p>
        </div>
        <div class="tasks-page-header-actions">
          <button id="audit-export-btn" class="btn ghost sm">${iconSvg('download', 14)}<span>Export to Excel</span></button>
        </div>
      </div>
      <div class="tasks-filters-bar">
        <div class="tasks-search-wrap">
          ${iconSvg('search', 15)}
          <input id="audit-search" class="input tasks-search" type="text" placeholder="Search Task ID or Site ID…" value="${escapeHtml(f.search)}">
        </div>
        <input id="audit-date-from" type="date" class="input tasks-filter" title="From date" value="${f.dateFrom}">
        <input id="audit-date-to" type="date" class="input tasks-filter" title="To date" value="${f.dateTo}">
        <select id="audit-filter-user" class="select tasks-filter">
          <option value="">All Users</option>
          ${userNames.map(n => `<option value="${escapeHtml(n)}" ${f.userName === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
        </select>
        <select id="audit-filter-action" class="select tasks-filter">
          <option value="">All Actions</option>
          ${actions.map(a => `<option value="${escapeHtml(a)}" ${f.action === a ? 'selected' : ''}>${escapeHtml(auditActionLabel(a))}</option>`).join('')}
        </select>
      </div>
      <div id="audit-table-section" class="tasks-table-section"></div>
    </div>`;
}

function auditEmptyStateHtml() {
  return `
    <div class="empty-state">
      ${iconSvg('rows', 30)}
      <div class="empty-state-title">No audit entries match these filters.</div>
      <div class="empty-state-desc">Try adjusting the filters or search.</div>
    </div>`;
}

function auditEntryRowHtml(entry) {
  const siteId = auditLogState.siteIdByTaskId[entry.task_id] || '';
  const userName = auditLogState.usersById[entry.user_id] || '—';
  const amberClass = (entry.action === 'task_locked' || entry.action === 'task_unlocked') ? ' audit-row-amber' : '';

  return `
    <tr class="data-row${amberClass}">
      <td class="mono">${importFormatDateTime(entry.timestamp)}</td>
      <td class="mono">${escapeHtml(entry.task_id || '—')}</td>
      <td class="mono">${escapeHtml(siteId || '—')}</td>
      <td>${escapeHtml(userName)}</td>
      <td>${escapeHtml(auditActionLabel(entry.action))}</td>
      <td>${escapeHtml(auditFieldLabel(entry.field_name))}</td>
      <td>${auditOldValueHtml(entry)}</td>
      <td>${auditNewValueHtml(entry)}</td>
      <td class="mono">${escapeHtml(entry.source_file || '—')}</td>
    </tr>`;
}

function auditSessionDetailHtml(entries) {
  if (entries.length === 0) {
    return `<div class="catalog-items-wrap"><span style="color:var(--ink-3);font-size:13px">No individual changes recorded.</span></div>`;
  }
  return `
    <div class="catalog-items-wrap">
      <table class="data-table catalog-items-table">
        <thead>
          <tr><th style="width:150px">Time</th><th style="width:160px">Task ID</th><th>Field</th><th>Old Value</th><th>New Value</th></tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td class="mono">${importFormatDateTime(e.timestamp)}</td>
              <td class="mono">${escapeHtml(e.task_id || '')}</td>
              <td>${e.field_name ? escapeHtml(auditFieldLabel(e.field_name)) : '<span style="color:var(--ink-3)">Task added</span>'}</td>
              <td>${e.field_name ? auditOldValueHtml(e) : '—'}</td>
              <td>${e.field_name ? auditNewValueHtml(e) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function auditSessionRowHtml(row) {
  const session = row.session;
  const expanded = auditLogState.expandedSessionId === session.import_id;

  const summary = `
    <tr class="data-row audit-row-amber audit-session-row" data-session-id="${escapeHtml(session.import_id)}">
      <td class="mono">${importFormatDateTime(session.date)}</td>
      <td colspan="2"><span class="catalog-expand-icon${expanded ? ' expanded' : ''}">${iconSvg('chevRight', 14)}</span> Import session — ${escapeHtml(session.coordinator_name || 'Unknown')}</td>
      <td>${escapeHtml(session.imported_by || '—')}</td>
      <td>${escapeHtml(auditActionLabel('import_applied'))}</td>
      <td colspan="3">${session.new_count} added, ${session.changes_applied} changed${session.changes_discarded ? `, ${session.changes_discarded} discarded` : ''}</td>
      <td class="mono">${escapeHtml(session.filename || '—')}</td>
    </tr>`;

  const detail = expanded
    ? `<tr class="catalog-items-row"><td colspan="9">${auditSessionDetailHtml(row.entries)}</td></tr>`
    : '';

  return summary + detail;
}

function auditRowHtml(row) {
  return row.type === 'import_session' ? auditSessionRowHtml(row) : auditEntryRowHtml(row.entry);
}

function auditLogTableHtml(rows) {
  return `
    <table class="data-table audit-log-table">
      <thead>
        <tr>
          <th style="width:150px">Timestamp</th>
          <th style="width:160px">Task ID</th>
          <th style="width:100px">Site ID</th>
          <th style="width:130px">User</th>
          <th style="width:130px">Action</th>
          <th style="width:130px">Field</th>
          <th style="width:130px">Old Value</th>
          <th>New Value</th>
          <th style="width:170px">Source File</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(auditRowHtml).join('')}
      </tbody>
    </table>`;
}

function renderAuditTableSection() {
  const section = document.getElementById('audit-table-section');
  if (!section) return;

  const rows = getFilteredAuditRows();
  section.innerHTML = `
    <div class="card tasks-table-wrap">
      ${rows.length === 0 ? auditEmptyStateHtml() : auditLogTableHtml(rows)}
    </div>`;

  attachAuditSessionRowEvents();
}

function attachAuditSessionRowEvents() {
  document.querySelectorAll('.audit-session-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.sessionId;
      auditLogState.expandedSessionId = auditLogState.expandedSessionId === id ? null : id;
      renderAuditTableSection();
    });
  });
}

function attachAuditLogEvents() {
  document.getElementById('audit-export-btn').addEventListener('click', exportAuditLogExcel);

  let searchTimer = null;
  document.getElementById('audit-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => {
      auditLogState.filters.search = value;
      renderAuditTableSection();
    }, 300);
  });

  document.getElementById('audit-date-from').addEventListener('change', (e) => {
    auditLogState.filters.dateFrom = e.target.value;
    renderAuditTableSection();
  });
  document.getElementById('audit-date-to').addEventListener('change', (e) => {
    auditLogState.filters.dateTo = e.target.value;
    renderAuditTableSection();
  });
  document.getElementById('audit-filter-user').addEventListener('change', (e) => {
    auditLogState.filters.userName = e.target.value;
    renderAuditTableSection();
  });
  document.getElementById('audit-filter-action').addEventListener('change', (e) => {
    auditLogState.filters.action = e.target.value;
    renderAuditTableSection();
  });

  renderAuditTableSection();
}

function auditExcelRow(entry) {
  return {
    Timestamp: importFormatDateTime(entry.timestamp),
    'Task ID': entry.task_id || '',
    'Site ID': auditLogState.siteIdByTaskId[entry.task_id] || '',
    User: auditLogState.usersById[entry.user_id] || '',
    Action: auditActionLabel(entry.action),
    Field: auditFieldLabel(entry.field_name),
    'Old Value': auditFormatValue(entry.field_name, entry.old_value),
    'New Value': auditFormatValue(entry.field_name, entry.new_value),
    'Source File': entry.source_file || ''
  };
}

async function exportAuditLogExcel() {
  const rows = getFilteredAuditRows();
  const flatRows = [];

  rows.forEach(row => {
    if (row.type === 'entry') {
      flatRows.push(auditExcelRow(row.entry));
      return;
    }
    if (row.entries.length === 0) {
      flatRows.push({
        Timestamp: importFormatDateTime(row.session.date),
        'Task ID': '',
        'Site ID': '',
        User: row.session.imported_by || '',
        Action: auditActionLabel('import_applied'),
        Field: '',
        'Old Value': '',
        'New Value': '',
        'Source File': row.session.filename || ''
      });
      return;
    }
    row.entries.forEach(e => flatRows.push(auditExcelRow(e)));
  });

  if (flatRows.length === 0) {
    showToast('No audit entries to export.', 'warning');
    return;
  }

  try {
    const ws = window.XLSX.utils.json_to_sheet(flatRows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');

    const filename = `audit_log_${formatDateISO(new Date())}.xlsx`;
    window.XLSX.writeFile(wb, filename);

    showToast(`Exported ${flatRows.length} audit log entr${flatRows.length === 1 ? 'y' : 'ies'}.`, 'success');
  } catch (err) {
    showToast('Could not export the audit log. Please try again.', 'error');
  }
}

/* ==========================================================================
   User Accounts — PM only (CLAUDE.md Stage 8.1)
   ========================================================================== */

let userAccountsState = {
  masterUsers: [],
  coordinators: [],
  taskCountByCoordinatorId: {}
};

async function renderUserAccountsSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  try {
    const [allUsers, allTasks] = await Promise.all([db.users.toArray(), db.tasks.toArray()]);

    userAccountsState.masterUsers = allUsers
      .filter(u => MASTER_ROLES.includes(u.role))
      .sort((a, b) => a.name.localeCompare(b.name));

    userAccountsState.coordinators = allUsers
      .filter(u => u.role === 'coordinator')
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const counts = {};
    allTasks.forEach(t => {
      if (!t.is_deleted && t.coordinator_id) counts[t.coordinator_id] = (counts[t.coordinator_id] || 0) + 1;
    });
    userAccountsState.taskCountByCoordinatorId = counts;

    container.innerHTML = userAccountsPageHtml();
    attachUserAccountsEvents();
  } catch (err) {
    showToast('Could not load user accounts.', 'error');
  }
}

function userAccountsPageHtml() {
  return `
    <div class="fade-in">
      <div class="tasks-page-header" style="margin-bottom:14px">
        <div>
          <h1>User Accounts</h1>
          <p class="tasks-subtitle">${userAccountsState.masterUsers.length} master team member${userAccountsState.masterUsers.length === 1 ? '' : 's'} · ${userAccountsState.coordinators.length} coordinator${userAccountsState.coordinators.length === 1 ? '' : 's'}</p>
        </div>
        <div class="tasks-page-header-actions">
          <button id="export-credentials-btn" class="btn ghost sm">${iconSvg('download', 14)}<span>Export Credentials Package</span></button>
          <button id="export-refdata-btn" class="btn ghost sm">${iconSvg('download', 14)}<span>Export Reference Data</span></button>
        </div>
      </div>

      <div class="card user-accounts-section">
        <div class="user-accounts-section-header">
          <div class="user-accounts-section-title">Master Team</div>
          <button id="add-master-user-btn" class="btn primary sm">${iconSvg('add', 13)}<span>Add Master User</span></button>
        </div>
        ${masterTeamTableHtml()}
      </div>

      <div class="card user-accounts-section">
        <div class="user-accounts-section-header">
          <div class="user-accounts-section-title">Coordinators</div>
          <button id="add-coordinator-btn" class="btn primary sm">${iconSvg('add', 13)}<span>Add Coordinator</span></button>
        </div>
        ${coordinatorsTableHtml()}
      </div>

      <div id="user-modal-root"></div>
    </div>`;
}

function masterTeamTableHtml() {
  const rows = userAccountsState.masterUsers;
  if (rows.length === 0) {
    return `<div class="empty-state"><div class="empty-state-title">No master team members yet.</div></div>`;
  }
  return `
    <div class="tasks-table-wrap">
      <table class="data-table user-accounts-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th style="width:170px">Role</th>
            <th style="width:120px">Created</th>
            <th style="width:190px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(masterUserRowHtml).join('')}
        </tbody>
      </table>
    </div>`;
}

function masterUserRowHtml(u) {
  return `
    <tr class="data-row">
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(roleLabel(u.role))}</td>
      <td class="mono">${formatDate(u.created_at)}</td>
      <td class="actions-cell">
        <button class="btn ghost sm" data-action="edit-user" data-id="${u.id}">Edit</button>
        <button class="btn ghost sm" data-action="reset-password" data-id="${u.id}">Reset Password</button>
      </td>
    </tr>`;
}

function coordinatorsTableHtml() {
  const rows = userAccountsState.coordinators;
  if (rows.length === 0) {
    return `<div class="empty-state"><div class="empty-state-title">No coordinators yet.</div></div>`;
  }
  return `
    <div class="tasks-table-wrap">
      <table class="data-table user-accounts-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th style="width:70px">Prefix</th>
            <th style="width:90px">Status</th>
            <th style="width:70px" class="num-col">Tasks</th>
            <th style="width:110px">Created</th>
            <th style="width:290px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(coordinatorRowHtml).join('')}
        </tbody>
      </table>
    </div>`;
}

function coordinatorRowHtml(u) {
  const inactiveClass = !u.is_active ? ' inactive-row' : '';
  const taskCount = userAccountsState.taskCountByCoordinatorId[u.id] || 0;
  const statusBadge = u.is_active
    ? `<span class="badge status-done"><span class="badge-dot"></span>Active</span>`
    : `<span class="badge status-cancelled"><span class="badge-dot"></span>Inactive</span>`;

  return `
    <tr class="data-row${inactiveClass}">
      <td>${escapeHtml(u.name)}${!u.is_active ? ' <span class="inactive-label">(inactive)</span>' : ''}</td>
      <td>${escapeHtml(u.email)}</td>
      <td class="mono">${escapeHtml(u.prefix || '')}</td>
      <td>${statusBadge}</td>
      <td class="num-col num">${taskCount}</td>
      <td class="mono">${formatDate(u.created_at)}</td>
      <td class="actions-cell">
        <button class="btn ghost sm" data-action="edit-user" data-id="${u.id}">Edit</button>
        <button class="btn ghost sm" data-action="reset-password" data-id="${u.id}">Reset Password</button>
        <button class="btn ghost sm" data-action="toggle-active" data-id="${u.id}">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>
        <button class="btn ghost sm" data-action="reassign-tasks" data-id="${u.id}">Reassign</button>
      </td>
    </tr>`;
}

function findUserAccountById(id) {
  const numId = Number(id);
  return [...userAccountsState.masterUsers, ...userAccountsState.coordinators].find(u => u.id === numId);
}

function attachUserAccountsEvents() {
  document.getElementById('add-master-user-btn').addEventListener('click', () => openUserFormModal({ mode: 'create', accountType: 'master' }));
  document.getElementById('add-coordinator-btn').addEventListener('click', () => openUserFormModal({ mode: 'create', accountType: 'coordinator' }));
  document.getElementById('export-credentials-btn').addEventListener('click', handleExportCredentialsPackage);
  document.getElementById('export-refdata-btn').addEventListener('click', handleExportReferenceDataPackage);

  document.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = findUserAccountById(btn.dataset.id);
      if (user) openUserFormModal({ mode: 'edit', accountType: MASTER_ROLES.includes(user.role) ? 'master' : 'coordinator', user });
    });
  });

  document.querySelectorAll('[data-action="reset-password"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = findUserAccountById(btn.dataset.id);
      if (user) openResetPasswordModal(user);
    });
  });

  document.querySelectorAll('[data-action="toggle-active"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = findUserAccountById(btn.dataset.id);
      if (user) handleToggleActive(user);
    });
  });

  document.querySelectorAll('[data-action="reassign-tasks"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = findUserAccountById(btn.dataset.id);
      if (user) openReassignModal(user);
    });
  });
}

async function handleExportCredentialsPackage() {
  const btn = document.getElementById('export-credentials-btn');
  setButtonLoading(btn, true);

  try {
    const currentUser = getCurrentUser();
    const allUsers = await db.users.toArray();
    const allSettingsRecords = await db.app_settings.toArray();

    const appSettings = {};
    allSettingsRecords.forEach(s => {
      appSettings[s.key] = { value: s.value, updated_at: s.updated_at };
    });

    const payload = {
      type: 'credentials_package',
      exported_at: new Date().toISOString(),
      exported_by: currentUser.name,
      version: '1.0',
      users: allUsers,
      app_settings: appSettings
    };

    const filename = `credentials_${formatDateISO(new Date())}.json`;
    downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');

    showToast('Credentials package exported. Share this file with anyone who cannot load accounts automatically on first launch.', 'success');
  } catch (err) {
    showToast('Could not export the credentials package. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleExportReferenceDataPackage() {
  const btn = document.getElementById('export-refdata-btn');
  setButtonLoading(btn, true);

  try {
    const currentUser = getCurrentUser();
    const [catalogs, catalog_items, general_streams, contractor_portions, task_templates, task_template_items] = await Promise.all([
      db.catalogs.toArray(),
      db.catalog_items.toArray(),
      db.general_streams.toArray(),
      db.contractor_portions.toArray(),
      db.task_templates.toArray(),
      db.task_template_items.toArray()
    ]);

    const payload = {
      type: 'reference_data_package',
      exported_at: new Date().toISOString(),
      exported_by: currentUser.name,
      version: '1.0',
      catalogs,
      catalog_items,
      general_streams,
      contractor_portions,
      task_templates,
      task_template_items
    };

    const filename = `reference_data_${formatDateISO(new Date())}.json`;
    downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');

    showToast('Reference data exported. Share this file with your coordinators.', 'success');
  } catch (err) {
    showToast('Could not export reference data. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

/* --------------------------------------------------------------------------
   Create / Edit user modal
   -------------------------------------------------------------------------- */

let userFormModalState = null;
let userFormModalFormSnapshot = null;

function openUserFormModal({ mode, accountType, user }) {
  userFormModalState = {
    mode,
    accountType,
    userId: user ? user.id : null,
    values: {
      name: user ? user.name : '',
      email: user ? user.email : '',
      role: user ? user.role : (accountType === 'master' ? 'acceptance_manager' : ''),
      prefix: user ? (user.prefix || '') : '',
      password: ''
    }
  };
  renderUserFormModal();
}

function closeUserFormModal() {
  const root = document.getElementById('user-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', handleUserFormModalEscape);
  userFormModalState = null;
}

const handleUserFormModalEscape = createModalEscapeHandler(
  () => document.getElementById('user-form-card'),
  () => userFormModalFormSnapshot,
  closeUserFormModal
);

function userFormRoleFieldHtml(state) {
  if (state.values.role === 'project_manager') {
    return `
      <label class="field" for="user-form-role-display">
        <span class="lbl">Role</span>
        <input id="user-form-role-display" type="text" class="input readonly-field" value="Project Manager" disabled>
        <input type="hidden" id="user-form-role" value="project_manager">
      </label>`;
  }
  return `
    <label class="field" for="user-form-role">
      <span class="lbl">Role<span class="req">*</span></span>
      <select id="user-form-role" class="select">
        <option value="acceptance_manager" ${state.values.role === 'acceptance_manager' ? 'selected' : ''}>Acceptance Manager</option>
        <option value="cost_control_manager" ${state.values.role === 'cost_control_manager' ? 'selected' : ''}>Cost Control Manager</option>
      </select>
    </label>`;
}

function userFormModalHtml(state) {
  const isEdit = state.mode === 'edit';
  const isMaster = state.accountType === 'master';
  const title = isEdit ? `Edit ${isMaster ? 'Master User' : 'Coordinator'}` : `Add ${isMaster ? 'Master User' : 'Coordinator'}`;

  return `
    <div class="modal-backdrop scale-in" id="user-form-backdrop">
      <div class="card modal" id="user-form-card">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="icon-btn" id="user-form-close" aria-label="Close modal">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-section-grid">
            <label class="field" for="user-form-name">
              <span class="lbl">Name<span class="req">*</span></span>
              <input id="user-form-name" type="text" class="input" value="${escapeHtml(state.values.name)}">
              <span class="field-error" id="user-form-name-error"></span>
            </label>
            <label class="field" for="user-form-email">
              <span class="lbl">Email<span class="req">*</span></span>
              <input id="user-form-email" type="email" class="input" value="${escapeHtml(state.values.email)}">
              <span class="field-error" id="user-form-email-error"></span>
            </label>
            ${isMaster ? userFormRoleFieldHtml(state) : `
            <label class="field" for="user-form-prefix">
              <span class="lbl">Prefix<span class="req">*</span></span>
              <input id="user-form-prefix" type="text" maxlength="3" class="input mono${isEdit ? ' readonly-field' : ''}" value="${escapeHtml(state.values.prefix)}" ${isEdit ? 'disabled' : ''}>
              <span class="field-error" id="user-form-prefix-error"></span>
            </label>`}
            ${!isEdit ? `
            <label class="field" for="user-form-password">
              <span class="lbl">Temporary Password<span class="req">*</span></span>
              <input id="user-form-password" type="text" class="input" value="${escapeHtml(state.values.password)}">
              <span class="field-error" id="user-form-password-error"></span>
            </label>` : ''}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="user-form-cancel">Cancel</button>
          <button class="btn primary" id="user-form-save">Save</button>
        </div>
      </div>
    </div>`;
}

function renderUserFormModal() {
  const root = document.getElementById('user-modal-root');
  if (!root) return;
  root.innerHTML = userFormModalHtml(userFormModalState);
  attachUserFormModalEvents();
}

function attachUserFormModalEvents() {
  const modalCard = document.getElementById('user-form-card');
  userFormModalFormSnapshot = captureFormSnapshot(modalCard);
  autofocusFirstField(modalCard);

  document.getElementById('user-form-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'user-form-backdrop') closeUserFormModal();
  });
  document.getElementById('user-form-close').addEventListener('click', closeUserFormModal);
  document.getElementById('user-form-cancel').addEventListener('click', closeUserFormModal);
  document.getElementById('user-form-save').addEventListener('click', handleSaveUserForm);
  enableEnterToSubmit(modalCard, document.getElementById('user-form-save'));
  document.addEventListener('keydown', handleUserFormModalEscape);

  const prefixInput = document.getElementById('user-form-prefix');
  if (prefixInput && !prefixInput.disabled) {
    prefixInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    });
  }
}

function markUserFormFieldError(key, message) {
  const input = document.getElementById(`user-form-${key}`);
  const errorEl = document.getElementById(`user-form-${key}-error`);
  if (input) input.classList.add('input-error');
  if (errorEl) errorEl.textContent = message;
}

function clearUserFormFieldError(key) {
  const input = document.getElementById(`user-form-${key}`);
  const errorEl = document.getElementById(`user-form-${key}-error`);
  if (input) input.classList.remove('input-error');
  if (errorEl) errorEl.textContent = '';
}

async function handleSaveUserForm() {
  const state = userFormModalState;
  const isEdit = state.mode === 'edit';
  const isMaster = state.accountType === 'master';

  ['name', 'email', 'prefix', 'password'].forEach(clearUserFormFieldError);

  const name = document.getElementById('user-form-name').value.trim();
  const email = document.getElementById('user-form-email').value.trim().toLowerCase();
  let hasError = false;

  if (!name) { markUserFormFieldError('name', 'Name is required.'); hasError = true; }
  if (!email) { markUserFormFieldError('email', 'Email is required.'); hasError = true; }

  const allUsers = [...userAccountsState.masterUsers, ...userAccountsState.coordinators];
  const emailConflict = email && allUsers.find(u => u.email.toLowerCase() === email && u.id !== state.userId);
  if (emailConflict) { markUserFormFieldError('email', 'This email is already in use.'); hasError = true; }

  let role = null;
  let prefix = state.values.prefix;

  if (isMaster) {
    role = document.getElementById('user-form-role').value;
  } else if (!isEdit) {
    prefix = document.getElementById('user-form-prefix').value.trim().toUpperCase();
    if (!/^[A-Z]{2,3}$/.test(prefix)) {
      markUserFormFieldError('prefix', 'Prefix must be 2-3 uppercase letters.');
      hasError = true;
    } else {
      const prefixConflict = allUsers.find(u => (u.prefix || '').toUpperCase() === prefix);
      if (prefixConflict) {
        markUserFormFieldError('prefix', `Prefix ${prefix} is already in use (including inactive accounts).`);
        hasError = true;
      }
    }
  }

  let password = '';
  if (!isEdit) {
    password = document.getElementById('user-form-password').value;
    if (!password || password.length < 8) {
      markUserFormFieldError('password', 'Temporary password must be at least 8 characters.');
      hasError = true;
    }
  }

  if (hasError) return;

  const saveBtn = document.getElementById('user-form-save');
  setButtonLoading(saveBtn, true);

  try {
    if (isEdit) {
      const changes = { name, email };
      if (isMaster) changes.role = role;
      await db.users.update(state.userId, changes);
      showToast('User updated.', 'success');

      const updatedUser = await db.users.get(state.userId);
      try {
        await pushUserToSheet(db, 'updateUser', { user: updatedUser });
      } catch (syncErr) {
        await queueFailedSync(db, 'updateUser', { user: updatedUser });
        showToast('User saved. Will sync to sheet when online.', 'warning');
      }
    } else {
      const password_hash = await hashPassword(password);
      const newUser = {
        name,
        email,
        password_hash,
        role: isMaster ? role : 'coordinator',
        prefix: isMaster ? null : prefix,
        is_active: true,
        must_change_password: true,
        created_at: new Date()
      };
      const id = await db.users.add(newUser);
      showToast(`${isMaster ? 'Master user' : 'Coordinator'} account created.`, 'success');

      const fullUser = { id, ...newUser };
      try {
        await pushUserToSheet(db, 'createUser', { user: fullUser });
      } catch (syncErr) {
        await queueFailedSync(db, 'createUser', { user: fullUser });
        showToast('User saved. Will sync to sheet when online.', 'warning');
      }
    }

    closeUserFormModal();
    await renderUserAccountsSettings();
  } catch (err) {
    setButtonLoading(saveBtn, false);
    showToast('Could not save this user account. Please try again.', 'error');
  }
}

/* --------------------------------------------------------------------------
   Reset password modal
   -------------------------------------------------------------------------- */

function openResetPasswordModal(user) {
  const root = document.getElementById('user-modal-root');
  if (!root) return;

  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', escHandler);
  };

  root.innerHTML = `
    <div class="modal-backdrop scale-in" id="reset-pw-backdrop">
      <div class="card modal" id="reset-pw-card">
        <div class="modal-header">
          <h2>Reset Password — ${escapeHtml(user.name)}</h2>
          <button class="icon-btn" id="reset-pw-close" aria-label="Close modal">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <label class="field" for="reset-pw-input">
            <span class="lbl">New Temporary Password<span class="req">*</span></span>
            <input id="reset-pw-input" type="text" class="input">
            <span class="field-error" id="reset-pw-error"></span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="reset-pw-cancel">Cancel</button>
          <button class="btn primary" id="reset-pw-confirm">Reset Password</button>
        </div>
      </div>
    </div>`;

  const modalCard = document.getElementById('reset-pw-card');
  const formSnapshot = captureFormSnapshot(modalCard);
  const escHandler = createModalEscapeHandler(() => document.getElementById('reset-pw-card'), () => formSnapshot, close);

  autofocusFirstField(modalCard);

  document.getElementById('reset-pw-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'reset-pw-backdrop') close();
  });
  document.getElementById('reset-pw-close').addEventListener('click', close);
  document.getElementById('reset-pw-cancel').addEventListener('click', close);
  document.getElementById('reset-pw-confirm').addEventListener('click', async () => {
    const input = document.getElementById('reset-pw-input');
    const errorEl = document.getElementById('reset-pw-error');
    const password = input.value;

    if (!password || password.length < 8) {
      input.classList.add('input-error');
      errorEl.textContent = 'Password must be at least 8 characters.';
      return;
    }

    const confirmBtn = document.getElementById('reset-pw-confirm');
    setButtonLoading(confirmBtn, true);

    try {
      const password_hash = await hashPassword(password);
      await db.users.update(user.id, { password_hash, must_change_password: true });

      const updatedUser = { ...user, password_hash, must_change_password: true };
      try {
        await pushUserToSheet(db, 'updateUser', { user: updatedUser });
      } catch (syncErr) {
        await queueFailedSync(db, 'updateUser', { user: updatedUser });
        showToast('User saved. Will sync to sheet when online.', 'warning');
      }

      await writeAuditLog({ user_id: getCurrentUser().id, action: 'password_changed', field_name: 'name', new_value: user.name });

      showToast(`Password reset for ${user.name}. They must set a new password on next login.`, 'success');
      close();
    } catch (err) {
      setButtonLoading(confirmBtn, false);
      showToast('Could not reset the password. Please try again.', 'error');
      return;
    }
  });
  enableEnterToSubmit(modalCard, document.getElementById('reset-pw-confirm'));
  document.addEventListener('keydown', escHandler);
}

/* --------------------------------------------------------------------------
   Deactivate / Reactivate
   -------------------------------------------------------------------------- */

async function handleToggleActive(user) {
  try {
    if (user.is_active) {
      const taskCount = userAccountsState.taskCountByCoordinatorId[user.id] || 0;
      const proceed = await confirmDialog({
        title: 'Deactivate Coordinator',
        message: `Deactivate ${user.name}? Their ${taskCount} task${taskCount === 1 ? '' : 's'} remain visible. Prefix ${user.prefix} is reserved permanently and can never be reused.`,
        confirmLabel: 'Deactivate'
      });
      if (!proceed) return;

      const currentUser = getCurrentUser();
      await db.users.update(user.id, { is_active: false, deactivated_at: new Date(), deactivated_by: currentUser.id });
      showToast(`${user.name} deactivated.`, 'success');

      try {
        await pushUserToSheet(db, 'deactivateUser', { id: user.id, deactivated_by: currentUser.name });
      } catch (syncErr) {
        await queueFailedSync(db, 'deactivateUser', { id: user.id, deactivated_by: currentUser.name });
        showToast('User saved. Will sync to sheet when online.', 'warning');
      }
    } else {
      await db.users.update(user.id, { is_active: true, deactivated_at: null, deactivated_by: null });
      showToast(`${user.name} reactivated.`, 'success');

      const reactivatedUser = { ...user, is_active: true, deactivated_at: null, deactivated_by: null };
      try {
        await pushUserToSheet(db, 'updateUser', { user: reactivatedUser });
      } catch (syncErr) {
        await queueFailedSync(db, 'updateUser', { user: reactivatedUser });
        showToast('User saved. Will sync to sheet when online.', 'warning');
      }
    }

    await renderUserAccountsSettings();
  } catch (err) {
    showToast(`Could not update ${user.name}'s account. Please try again.`, 'error');
  }
}

/* --------------------------------------------------------------------------
   Reassign tasks
   -------------------------------------------------------------------------- */

let reassignModalState = null;

function openReassignModal(oldCoordinator) {
  const activeCoordinators = userAccountsState.coordinators.filter(c => c.is_active && c.id !== oldCoordinator.id);

  reassignModalState = {
    step: 1,
    oldCoordinator,
    activeCoordinators,
    newCoordinatorId: '',
    taskCount: 0
  };
  renderReassignModal();
}

function closeReassignModal() {
  const root = document.getElementById('user-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', handleReassignModalEscape);
  reassignModalState = null;
}

function handleReassignModalEscape(e) {
  if (e.key === 'Escape') closeReassignModal();
}

async function getTasksManagedBy(coordinatorId) {
  const allTasks = await db.tasks.toArray();
  return allTasks.filter(t => (t.managed_by_id || t.coordinator_id) === coordinatorId);
}

function reassignModalBodyHtml() {
  const s = reassignModalState;

  if (s.activeCoordinators.length === 0) {
    return `<p style="font-size:13px;color:var(--ink-2)">There are no other active coordinators to reassign tasks to.</p>`;
  }

  if (s.step === 1) {
    return `
      <label class="field" for="reassign-target-select">
        <span class="lbl">New Coordinator<span class="req">*</span></span>
        <select id="reassign-target-select" class="select">
          <option value="">— Select —</option>
          ${s.activeCoordinators.map(c => `<option value="${c.id}" ${String(s.newCoordinatorId) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </label>`;
  }

  const newCoordinator = s.activeCoordinators.find(c => String(c.id) === String(s.newCoordinatorId));

  if (s.step === 2) {
    return `
      <p style="font-size:13px;color:var(--ink-2);line-height:1.6">
        <strong>${s.taskCount}</strong> task${s.taskCount === 1 ? '' : 's'} managed by <strong>${escapeHtml(s.oldCoordinator.name)}</strong> will be managed by <strong>${escapeHtml(newCoordinator.name)}</strong>.<br>
        <span class="mono">coordinator_name</span> stays as "${escapeHtml(s.oldCoordinator.name)}" on all tasks.
      </p>`;
  }

  return `
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:10px">Type <strong>${escapeHtml(s.oldCoordinator.name)}</strong> to confirm this reassignment.</p>
    <label class="field" for="reassign-confirm-input">
      <span class="lbl">Coordinator Name<span class="req">*</span></span>
      <input id="reassign-confirm-input" type="text" class="input">
      <span class="field-error" id="reassign-confirm-error"></span>
    </label>`;
}

function reassignModalFooterHtml() {
  const s = reassignModalState;
  if (s.activeCoordinators.length === 0) {
    return `<button class="btn primary" id="reassign-close-only">Close</button>`;
  }
  const nextLabel = s.step === 3 ? 'Confirm Reassignment' : 'Next';
  return `
    ${s.step > 1 ? `<button class="btn ghost" id="reassign-back">Back</button>` : `<button class="btn ghost" id="reassign-cancel">Cancel</button>`}
    <button class="btn primary" id="reassign-next">${nextLabel}</button>`;
}

function reassignModalHtml() {
  const s = reassignModalState;
  return `
    <div class="modal-backdrop scale-in" id="reassign-backdrop">
      <div class="card modal" id="reassign-card">
        <div class="modal-header">
          <h2>Reassign Tasks — ${escapeHtml(s.oldCoordinator.name)}</h2>
          <button class="icon-btn" id="reassign-close" aria-label="Close modal">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">${reassignModalBodyHtml()}</div>
        <div class="modal-footer">${reassignModalFooterHtml()}</div>
      </div>
    </div>`;
}

function renderReassignModal() {
  const root = document.getElementById('user-modal-root');
  if (!root) return;
  root.innerHTML = reassignModalHtml();
  attachReassignModalEvents();
}

function attachReassignModalEvents() {
  autofocusFirstField(document.getElementById('reassign-card'));

  document.getElementById('reassign-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'reassign-backdrop') closeReassignModal();
  });
  document.getElementById('reassign-close').addEventListener('click', closeReassignModal);
  document.addEventListener('keydown', handleReassignModalEscape);

  const cancelBtn = document.getElementById('reassign-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeReassignModal);

  const closeOnlyBtn = document.getElementById('reassign-close-only');
  if (closeOnlyBtn) closeOnlyBtn.addEventListener('click', closeReassignModal);

  const backBtn = document.getElementById('reassign-back');
  if (backBtn) backBtn.addEventListener('click', () => {
    reassignModalState.step -= 1;
    renderReassignModal();
  });

  const nextBtn = document.getElementById('reassign-next');
  if (nextBtn) nextBtn.addEventListener('click', handleReassignNext);
}

async function handleReassignNext() {
  const s = reassignModalState;

  if (s.step === 1) {
    const select = document.getElementById('reassign-target-select');
    const value = select.value;
    if (!value) {
      showToast('Select a coordinator to reassign tasks to.', 'error');
      return;
    }
    s.newCoordinatorId = Number(value);
    try {
      const tasks = await getTasksManagedBy(s.oldCoordinator.id);
      s.taskCount = tasks.length;
    } catch (err) {
      showToast('Could not load this coordinator\'s tasks. Please try again.', 'error');
      return;
    }
    s.step = 2;
    renderReassignModal();
    return;
  }

  if (s.step === 2) {
    s.step = 3;
    renderReassignModal();
    return;
  }

  const input = document.getElementById('reassign-confirm-input');
  const errorEl = document.getElementById('reassign-confirm-error');
  const typed = input.value.trim();

  if (typed !== s.oldCoordinator.name) {
    input.classList.add('input-error');
    errorEl.textContent = 'Name does not match. Reassignment cancelled for safety.';
    return;
  }

  const nextBtn = document.getElementById('reassign-next');
  setButtonLoading(nextBtn, true, 'Reassigning…');

  try {
    const newCoordinator = s.activeCoordinators.find(c => c.id === s.newCoordinatorId);
    const tasks = await getTasksManagedBy(s.oldCoordinator.id);
    const currentUser = getCurrentUser();

    await db.transaction('rw', db.tasks, db.audit_log, async () => {
      for (const task of tasks) {
        await db.tasks.update(task.id, { managed_by_id: newCoordinator.id, updated_at: new Date() });
      }
      await writeAuditLog({
        user_id: currentUser.id,
        action: 'tasks_reassigned',
        field_name: 'coordinator',
        old_value: `${s.oldCoordinator.name} (${tasks.length} tasks)`,
        new_value: newCoordinator.name
      });
    });

    showToast(`${tasks.length} task${tasks.length === 1 ? '' : 's'} reassigned from ${s.oldCoordinator.name} to ${newCoordinator.name}.`, 'success');
    closeReassignModal();
    await renderUserAccountsSettings();
  } catch (err) {
    setButtonLoading(nextBtn, false);
    showToast('Reassignment failed. No changes were saved — please try again.', 'error');
  }
}

/* ==========================================================================
   Drag-to-reorder — generic helper shared by Dropdown Lists + Column Manager
   ========================================================================== */

function attachDragReorder(containerSelector, itemSelector, array, onReordered, isLockedFn) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  let dragIndex = null;
  const items = Array.from(container.querySelectorAll(itemSelector));

  items.forEach((el, idx) => {
    const locked = isLockedFn ? isLockedFn(idx) : false;
    el.draggable = !locked;

    el.addEventListener('dragstart', () => {
      if (locked) return;
      dragIndex = idx;
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { if (dragIndex !== null) e.preventDefault(); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === idx) return;
      const [moved] = array.splice(dragIndex, 1);
      array.splice(idx, 0, moved);
      dragIndex = null;
      onReordered();
    });
  });
}

/* ==========================================================================
   Dropdown Lists Manager — PM only (CLAUDE.md Stage 8.2)
   ========================================================================== */

async function getDropdownUsageCount(taskField, value) {
  const tasks = await db.tasks.toArray();
  return tasks.filter(t => !t.is_deleted && t[taskField] === value).length;
}

async function persistDropdownList(list) {
  await db.app_settings.put({ key: list.settingsKey, value: [...list.array], updated_at: new Date() });
}

async function persistDistanceList() {
  await db.app_settings.put({
    key: DISTANCE_LIST_SETTINGS_KEY,
    value: DISTANCE_LIST.map(d => ({ band: d.band, multiplier: d.multiplier })),
    updated_at: new Date()
  });
}

async function renderDropdownListsSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  container.innerHTML = dropdownListsPageHtml();
  attachDropdownListsEvents();
}

function dropdownListsPageHtml() {
  return `
    <div class="fade-in">
      <h1>Dropdown Lists</h1>
      <p class="tasks-subtitle">Edit the values coordinators and master users choose from across the app.</p>
      <div class="dropdown-lists-grid">
        ${SIMPLE_DROPDOWN_LISTS.map(dropdownListCardHtml).join('')}
        ${distanceListCardHtml()}
      </div>
    </div>`;
}

function dropdownChipHtml(list, value) {
  const isSystem = list.systemValues.includes(value);
  return `
    <span class="dropdown-chip">
      <span class="dropdown-chip-handle" title="Drag to reorder">${iconSvg('rows', 11)}</span>
      <span class="dropdown-chip-label">${escapeHtml(value)}</span>
      ${isSystem ? '' : `<button class="dropdown-chip-remove" data-remove-list="${list.key}" data-value="${escapeHtml(value)}" title="Remove" aria-label="Remove">${iconSvg('close', 10)}</button>`}
    </span>`;
}

function dropdownListCardHtml(list) {
  return `
    <div class="card dropdown-list-card">
      <div class="dropdown-list-card-title">${escapeHtml(list.label)}</div>
      ${list.note ? `<div class="dropdown-list-note">${escapeHtml(list.note)}</div>` : ''}
      <div class="dropdown-chip-list" data-dropdown-chips="${list.key}">
        ${list.array.map(value => dropdownChipHtml(list, value)).join('')}
      </div>
      <div class="dropdown-add-row">
        <input type="text" class="input" id="dropdown-add-input-${list.key}" placeholder="Add value…">
        <button class="btn ghost sm" data-add-list="${list.key}">Add</button>
      </div>
    </div>`;
}

function distanceBandRowHtml(d) {
  return `
    <div class="distance-band-row">
      <span class="dropdown-chip-handle" title="Drag to reorder">${iconSvg('rows', 11)}</span>
      <span class="distance-band-name">${escapeHtml(d.band)}</span>
      <input type="number" step="0.01" class="input num distance-multiplier-input" data-band="${escapeHtml(d.band)}" value="${d.multiplier}">
      <button class="dropdown-chip-remove" data-remove-distance="${escapeHtml(d.band)}" title="Remove" aria-label="Remove">${iconSvg('close', 10)}</button>
    </div>`;
}

function distanceListCardHtml() {
  return `
    <div class="card dropdown-list-card">
      <div class="dropdown-list-card-title">Distance</div>
      <div class="dropdown-list-note">Changing a multiplier affects only new tasks going forward.</div>
      <div class="distance-band-list">
        ${DISTANCE_LIST.map(distanceBandRowHtml).join('')}
      </div>
      <div class="dropdown-add-row">
        <input type="text" class="input" id="distance-add-band-input" placeholder="Band name (e.g. 800Km-1200Km)">
        <input type="number" step="0.01" class="input num" id="distance-add-multiplier-input" placeholder="Multiplier" style="max-width:110px">
        <button class="btn ghost sm" id="distance-add-btn">Add</button>
      </div>
    </div>`;
}

async function handleAddDropdownValue(listKey) {
  const list = SIMPLE_DROPDOWN_LISTS.find(l => l.key === listKey);
  if (!list) return;

  const input = document.getElementById(`dropdown-add-input-${listKey}`);
  const value = input.value.trim();
  if (!value) { showToast('Enter a value first.', 'error'); return; }
  if (list.array.some(v => v.toLowerCase() === value.toLowerCase())) {
    showToast(`"${value}" is already in this list.`, 'error');
    return;
  }

  list.array.push(value);
  try {
    await persistDropdownList(list);
    showToast(`"${value}" added to ${list.label}.`, 'success');
    renderDropdownListsSettings();
  } catch (err) {
    list.array.pop();
    showToast('Could not save this value. Please try again.', 'error');
  }
}

async function handleRemoveDropdownValue(listKey, value) {
  const list = SIMPLE_DROPDOWN_LISTS.find(l => l.key === listKey);
  if (!list || list.systemValues.includes(value)) return;

  let count;
  try {
    count = await getDropdownUsageCount(list.taskField, value);
  } catch (err) {
    showToast('Could not check usage for this value. Please try again.', 'error');
    return;
  }

  if (count > 0) {
    const proceed = await confirmDialog({
      title: 'Value in use',
      message: `${count} task${count === 1 ? '' : 's'} use this value. Delete anyway?`,
      confirmLabel: 'Delete'
    });
    if (!proceed) return;
  }

  const idx = list.array.indexOf(value);
  if (idx === -1) return;
  list.array.splice(idx, 1);
  try {
    await persistDropdownList(list);
    showToast(`"${value}" removed from ${list.label}.`, 'success');
    renderDropdownListsSettings();
  } catch (err) {
    list.array.splice(idx, 0, value);
    showToast('Could not remove this value. Please try again.', 'error');
  }
}

async function handleAddDistanceBand() {
  const nameInput = document.getElementById('distance-add-band-input');
  const multInput = document.getElementById('distance-add-multiplier-input');
  const band = nameInput.value.trim();
  const multiplier = Number(multInput.value);

  if (!band) { showToast('Enter a band name.', 'error'); return; }
  if (DISTANCE_LIST.some(d => d.band.toLowerCase() === band.toLowerCase())) {
    showToast(`"${band}" already exists.`, 'error');
    return;
  }
  if (multInput.value === '' || isNaN(multiplier) || multiplier <= 0) {
    showToast('Enter a valid multiplier.', 'error');
    return;
  }

  DISTANCE_LIST.push({ band, multiplier: round2(multiplier) });
  syncDistanceBandsFromList();
  try {
    await persistDistanceList();
    showToast(`"${band}" added.`, 'success');
    renderDropdownListsSettings();
  } catch (err) {
    DISTANCE_LIST.pop();
    syncDistanceBandsFromList();
    showToast('Could not add this distance band. Please try again.', 'error');
  }
}

async function handleDistanceMultiplierChange(band, value) {
  const entry = DISTANCE_LIST.find(d => d.band === band);
  if (!entry) return;

  const multiplier = Number(value);
  if (value === '' || isNaN(multiplier) || multiplier <= 0) {
    showToast('Multiplier must be a positive number.', 'error');
    renderDropdownListsSettings();
    return;
  }

  const previousMultiplier = entry.multiplier;
  entry.multiplier = round2(multiplier);
  try {
    await persistDistanceList();
    showToast(`Multiplier for ${band} updated.`, 'success', 1600);
  } catch (err) {
    entry.multiplier = previousMultiplier;
    showToast('Could not update the multiplier. Please try again.', 'error');
  }
}

async function handleRemoveDistanceBand(band) {
  let count;
  try {
    count = await getDropdownUsageCount('distance', band);
  } catch (err) {
    showToast('Could not check usage for this band. Please try again.', 'error');
    return;
  }

  if (count > 0) {
    showToast(`Cannot delete: ${count} task${count === 1 ? '' : 's'} use this band.`, 'error');
    return;
  }

  const idx = DISTANCE_LIST.findIndex(d => d.band === band);
  if (idx === -1) return;
  const [removed] = DISTANCE_LIST.splice(idx, 1);
  syncDistanceBandsFromList();
  try {
    await persistDistanceList();
    showToast(`"${band}" removed.`, 'success');
    renderDropdownListsSettings();
  } catch (err) {
    DISTANCE_LIST.splice(idx, 0, removed);
    syncDistanceBandsFromList();
    showToast('Could not remove this distance band. Please try again.', 'error');
  }
}

function attachDropdownListsEvents() {
  document.querySelectorAll('[data-add-list]').forEach(btn => {
    btn.addEventListener('click', () => handleAddDropdownValue(btn.dataset.addList));
  });
  document.querySelectorAll('[data-remove-list]').forEach(btn => {
    btn.addEventListener('click', () => handleRemoveDropdownValue(btn.dataset.removeList, btn.dataset.value));
  });

  SIMPLE_DROPDOWN_LISTS.forEach(list => {
    attachDragReorder(`[data-dropdown-chips="${list.key}"]`, '.dropdown-chip', list.array, () => {
      persistDropdownList(list).catch(() => showToast('Could not save the new order.', 'error'));
      renderDropdownListsSettings();
    });

    const input = document.getElementById(`dropdown-add-input-${list.key}`);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleAddDropdownValue(list.key); }
      });
    }
  });

  const distanceAddBtn = document.getElementById('distance-add-btn');
  if (distanceAddBtn) distanceAddBtn.addEventListener('click', handleAddDistanceBand);

  document.querySelectorAll('[data-remove-distance]').forEach(btn => {
    btn.addEventListener('click', () => handleRemoveDistanceBand(btn.dataset.removeDistance));
  });
  document.querySelectorAll('.distance-multiplier-input').forEach(input => {
    input.addEventListener('change', (e) => handleDistanceMultiplierChange(e.target.dataset.band, e.target.value));
  });

  attachDragReorder('.distance-band-list', '.distance-band-row', DISTANCE_LIST, () => {
    syncDistanceBandsFromList();
    persistDistanceList().catch(() => showToast('Could not save the new order.', 'error'));
    renderDropdownListsSettings();
  });
}

/* ==========================================================================
   Column Manager — PM only (CLAUDE.md Stage 8.2)
   ========================================================================== */

let columnManagerState = { visibility: {} };

async function renderColumnManagerSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  try {
    columnManagerState.visibility = await loadMasterColumnVisibility();
    container.innerHTML = columnManagerPageHtml();
    attachColumnManagerEvents();
  } catch (err) {
    showToast('Could not load column settings.', 'error');
  }
}

function columnManagerRowHtml(col) {
  const locked = !!col.alwaysVisible;
  const visible = !!columnManagerState.visibility[col.key];

  return `
    <div class="column-manager-row${locked ? ' locked' : ''}">
      <span class="column-manager-handle${locked ? ' disabled' : ''}" title="${locked ? '' : 'Drag to reorder'}">${iconSvg('rows', 12)}</span>
      <span class="column-manager-name">${escapeHtml(col.label)}</span>
      ${locked
        ? `<span class="column-manager-lock" title="System-critical — always visible">${iconSvg('lock', 13)}</span>`
        : `<input type="checkbox" class="column-manager-checkbox" data-toggle-col="${col.key}" ${visible ? 'checked' : ''}>`}
    </div>`;
}

function columnManagerPageHtml() {
  return `
    <div class="fade-in">
      <h1>Column Manager</h1>
      <p class="tasks-subtitle">Show, hide, and reorder columns in the master task table. Changes apply immediately.</p>
      <div class="card column-manager-section">
        <div class="column-manager-section-title">Coordinator Columns</div>
        <div class="column-manager-list" data-column-section="coordinator">
          ${COORDINATOR_COLUMNS.map(columnManagerRowHtml).join('')}
        </div>
      </div>
      <div class="card column-manager-section">
        <div class="column-manager-section-title">PM Columns</div>
        <div class="column-manager-list" data-column-section="pm">
          ${PM_COLUMNS.map(columnManagerRowHtml).join('')}
        </div>
      </div>
    </div>`;
}

function attachColumnManagerEvents() {
  document.querySelectorAll('[data-toggle-col]').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      columnManagerState.visibility[e.target.dataset.toggleCol] = e.target.checked;
      try {
        await saveMasterColumnVisibility(columnManagerState.visibility);
        showToast('Column visibility updated.', 'success', 1400);
      } catch (err) {
        showToast('Could not save column visibility.', 'error');
      }
    });
  });

  attachDragReorder('[data-column-section="coordinator"]', '.column-manager-row', COORDINATOR_COLUMNS, async () => {
    syncAllMasterColumns();
    try {
      await saveColumnOrder();
      renderColumnManagerSettings();
    } catch (err) {
      showToast('Could not save column order.', 'error');
    }
  }, (idx) => !!COORDINATOR_COLUMNS[idx].alwaysVisible);

  attachDragReorder('[data-column-section="pm"]', '.column-manager-row', PM_COLUMNS, async () => {
    syncAllMasterColumns();
    try {
      await saveColumnOrder();
      renderColumnManagerSettings();
    } catch (err) {
      showToast('Could not save column order.', 'error');
    }
  }, (idx) => !!PM_COLUMNS[idx].alwaysVisible);
}

/* ==========================================================================
   Task Templates — PM only (CLAUDE.md Stage 8.3)
   ========================================================================== */

let taskTemplatesState = { templates: [] };

async function renderTaskTemplatesSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  try {
    const templates = await db.task_templates.orderBy('name').toArray();
    const counts = await Promise.all(templates.map(t => db.task_template_items.where('template_id').equals(t.id).count()));
    taskTemplatesState.templates = templates.map((t, i) => ({ ...t, itemCount: counts[i] }));

    container.innerHTML = taskTemplatesPageHtml();
    attachTaskTemplatesEvents();
  } catch (err) {
    showToast('Could not load task templates.', 'error');
  }
}

function taskTemplatesPageHtml() {
  const templates = taskTemplatesState.templates;
  return `
    <div class="fade-in">
      <div class="tasks-page-header" style="margin-bottom:14px">
        <div>
          <h1>Task Templates</h1>
          <p class="tasks-subtitle">${templates.length} template${templates.length === 1 ? '' : 's'}</p>
        </div>
        <div class="tasks-page-header-actions">
          <button id="new-template-btn" class="btn primary sm">${iconSvg('add', 13)}<span>New Template</span></button>
        </div>
      </div>
      ${templates.length === 0
        ? `<div class="card tasks-table-wrap">
             <div class="empty-state">
               ${iconSvg('layers', 30)}
               <div class="empty-state-title">No templates yet.</div>
               <div class="empty-state-desc">Click New Template to create the first one.</div>
             </div>
           </div>`
        : `<div class="template-card-grid">${templates.map(templateCardHtml).join('')}</div>`}
      <div id="template-modal-root"></div>
    </div>`;
}

function templateCardHtml(t) {
  return `
    <div class="card template-card${t.is_active ? '' : ' inactive-row'}">
      <div class="template-card-header">
        <div class="template-card-name">${escapeHtml(t.name)}${!t.is_active ? ' <span class="inactive-label">(inactive)</span>' : ''}</div>
        <input type="checkbox" class="column-manager-checkbox" data-toggle-template="${t.id}" ${t.is_active ? 'checked' : ''} title="Active">
      </div>
      <div class="template-card-desc">${escapeHtml(t.description || 'No description')}</div>
      <div class="template-card-meta">${t.itemCount} item${t.itemCount === 1 ? '' : 's'}</div>
      <div class="template-card-actions">
        <button class="btn ghost sm" data-action="edit-template" data-id="${t.id}">Edit</button>
        <button class="btn ghost sm" data-action="duplicate-template" data-id="${t.id}">Duplicate</button>
        <button class="btn ghost sm" data-action="delete-template" data-id="${t.id}">Delete</button>
      </div>
    </div>`;
}

function attachTaskTemplatesEvents() {
  document.getElementById('new-template-btn').addEventListener('click', () => openTemplateFormModal(null));

  document.querySelectorAll('[data-toggle-template]').forEach(cb => {
    cb.addEventListener('change', (e) => handleToggleTemplateActive(Number(e.target.dataset.toggleTemplate), e.target.checked));
  });
  document.querySelectorAll('[data-action="edit-template"]').forEach(btn => {
    btn.addEventListener('click', () => openTemplateFormModal(Number(btn.dataset.id)));
  });
  document.querySelectorAll('[data-action="duplicate-template"]').forEach(btn => {
    btn.addEventListener('click', () => handleDuplicateTemplate(Number(btn.dataset.id)));
  });
  document.querySelectorAll('[data-action="delete-template"]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteTemplate(Number(btn.dataset.id)));
  });
}

async function handleToggleTemplateActive(id, isActive) {
  try {
    await db.task_templates.update(id, { is_active: isActive, updated_at: new Date() });
    showToast(isActive ? 'Template activated.' : 'Template deactivated.', 'success');
    renderTaskTemplatesSettings();
  } catch (err) {
    showToast('Could not update the template. Please try again.', 'error');
  }
}

async function handleDuplicateTemplate(id) {
  try {
    const template = await db.task_templates.get(id);
    if (!template) return;

    const items = await db.task_template_items.where('template_id').equals(id).sortBy('sort_order');
    const currentUser = getCurrentUser();
    const now = new Date();

    const newId = await db.task_templates.add({
      name: `${template.name} (copy)`,
      description: template.description || null,
      created_by: currentUser.id,
      created_at: now,
      updated_at: now,
      is_active: true,
      times_applied: 0
    });

    if (items.length > 0) {
      await db.task_template_items.bulkAdd(items.map(item => ({
        template_id: newId,
        line_item_code: item.line_item_code,
        default_qty: item.default_qty,
        sort_order: item.sort_order
      })));
    }

    showToast(`"${template.name} (copy)" created.`, 'success');
    renderTaskTemplatesSettings();
  } catch (err) {
    showToast('Could not duplicate the template. Please try again.', 'error');
  }
}

async function handleDeleteTemplate(id) {
  try {
    const template = await db.task_templates.get(id);
    if (!template) return;

    const usageCount = template.times_applied || 0;

    if (usageCount > 0) {
      const proceed = await confirmDialog({
        title: 'Delete Template',
        message: `"${template.name}" has been used in ${usageCount} past bulk entr${usageCount === 1 ? 'y' : 'ies'}. It will be deactivated and hidden from coordinators instead of deleted.`,
        confirmLabel: 'Deactivate'
      });
      if (!proceed) return;

      await db.task_templates.update(id, { is_active: false, updated_at: new Date() });
      showToast(`"${template.name}" deactivated.`, 'success');
    } else {
      const proceed = await confirmDialog({
        title: 'Delete Template',
        message: `Delete "${template.name}"? This cannot be undone.`,
        confirmLabel: 'Delete'
      });
      if (!proceed) return;

      await db.task_template_items.where('template_id').equals(id).delete();
      await db.task_templates.delete(id);
      showToast(`"${template.name}" deleted.`, 'success');
    }

    renderTaskTemplatesSettings();
  } catch (err) {
    showToast('Could not delete the template. Please try again.', 'error');
  }
}

/* --------------------------------------------------------------------------
   Create / Edit template modal
   -------------------------------------------------------------------------- */

let templateFormState = null;
let templateFormSnapshot = null;

async function openTemplateFormModal(templateId) {
  try {
    const lineItemResult = await getLineItemOptionsForDate(null);

    let name = '';
    let description = '';
    let items = [];

    if (templateId) {
      const template = await db.task_templates.get(templateId);
      const templateItems = await db.task_template_items.where('template_id').equals(templateId).sortBy('sort_order');
      name = template.name;
      description = template.description || '';
      items = templateItems.map(i => ({ line_item_code: i.line_item_code, default_qty: i.default_qty }));
    }

    templateFormState = {
      templateId,
      name,
      description,
      items,
      catalogItems: lineItemResult.items,
      noCatalog: lineItemResult.warning === 'no_catalog',
      search: ''
    };

    renderTemplateFormModal();
  } catch (err) {
    showToast('Could not open the template editor. Please try again.', 'error');
  }
}

function closeTemplateFormModal() {
  const root = document.getElementById('template-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', handleTemplateFormModalEscape);
  templateFormState = null;
  templateFormSnapshot = null;
}

const handleTemplateFormModalEscape = createModalEscapeHandler(
  () => document.getElementById('template-form-card'),
  () => templateFormSnapshot,
  closeTemplateFormModal
);

function templateItemRowHtml(item, idx, catalogItems) {
  const meta = catalogItems.find(c => c.code === item.line_item_code);
  const name = meta ? meta.name : '(not in active catalog)';

  return `
    <div class="template-item-row">
      <span class="dropdown-chip-handle" title="Drag to reorder">${iconSvg('rows', 11)}</span>
      <span class="template-item-name mono">${escapeHtml(item.line_item_code)}</span>
      <span class="template-item-desc">${escapeHtml(name)}</span>
      <label class="template-item-qty-label">Default qty:
        <input type="number" step="0.01" class="input num template-item-qty-input" data-index="${idx}" value="${item.default_qty === null || item.default_qty === undefined ? '' : item.default_qty}">
      </label>
      <button class="dropdown-chip-remove" data-remove-item="${idx}" title="Remove" aria-label="Remove">${iconSvg('close', 10)}</button>
    </div>`;
}

function templateFormModalHtml() {
  const s = templateFormState;
  const isEdit = !!s.templateId;

  return `
    <div class="modal-backdrop scale-in" id="template-form-backdrop">
      <div class="card modal wide" id="template-form-card">
        <div class="modal-header">
          <h2>${isEdit ? 'Edit Template' : 'New Template'}</h2>
          <button class="icon-btn" id="template-form-close" aria-label="Close modal">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <label class="field" for="template-name-input">
            <span class="lbl">Name<span class="req">*</span></span>
            <input id="template-name-input" type="text" class="input" value="${escapeHtml(s.name)}">
            <span class="field-error" id="template-name-error"></span>
          </label>
          <label class="field" for="template-desc-input" style="margin-top:14px">
            <span class="lbl">Description</span>
            <textarea id="template-desc-input" class="input textarea" rows="2">${escapeHtml(s.description)}</textarea>
          </label>

          <div class="template-items-section">
            <div class="lbl" style="margin-bottom:6px">Line Items</div>
            ${s.noCatalog ? `<div class="field-hint-warning" style="margin-bottom:8px">${iconSvg('warn', 12)}<span>No active catalog. Ask PM to upload a catalog first.</span></div>` : ''}
            <div class="template-item-search-row">
              <input type="text" class="input" id="template-item-search" placeholder="Search line items to add…" value="${escapeHtml(s.search)}" autocomplete="off">
              <div class="template-item-search-results hidden" id="template-item-search-results"></div>
            </div>
            <div class="template-items-list" id="template-items-list">
              ${s.items.map((item, idx) => templateItemRowHtml(item, idx, s.catalogItems)).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="template-form-cancel">Cancel</button>
          <button class="btn primary" id="template-form-save">Save Template</button>
        </div>
      </div>
    </div>`;
}

function renderTemplateFormModal() {
  const root = document.getElementById('template-modal-root');
  if (!root) return;
  root.innerHTML = templateFormModalHtml();
  attachTemplateFormModalEvents();
}

function renderTemplateItemSearchResults() {
  const resultsEl = document.getElementById('template-item-search-results');
  if (!resultsEl) return;

  const s = templateFormState;
  const query = s.search.trim().toLowerCase();
  if (!query) { resultsEl.innerHTML = ''; resultsEl.classList.add('hidden'); return; }

  const addedCodes = new Set(s.items.map(i => i.line_item_code));
  const matches = s.catalogItems
    .filter(c => !addedCodes.has(c.code) && (c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)))
    .slice(0, 8);

  resultsEl.classList.remove('hidden');

  if (matches.length === 0) {
    resultsEl.innerHTML = `<div class="template-item-search-empty">No matching line items.</div>`;
    return;
  }

  resultsEl.innerHTML = matches.map(c => `
    <button type="button" class="template-item-search-result" data-add-code="${escapeHtml(c.code)}">
      <span class="mono">${escapeHtml(c.code)}</span> — ${escapeHtml(c.name)} — ${formatMoney(c.price)} EGP
    </button>`).join('');

  resultsEl.querySelectorAll('[data-add-code]').forEach(btn => {
    btn.addEventListener('click', () => handleAddTemplateItem(btn.dataset.addCode));
  });
}

function handleAddTemplateItem(code) {
  templateFormState.items.push({ line_item_code: code, default_qty: null });
  templateFormState.search = '';
  renderTemplateFormModal();
}

function handleRemoveTemplateItem(idx) {
  templateFormState.items.splice(idx, 1);
  renderTemplateFormModal();
}

function attachTemplateFormModalEvents() {
  const modalCard = document.getElementById('template-form-card');
  const isFirstRender = templateFormSnapshot === null;
  if (isFirstRender) {
    templateFormSnapshot = captureFormSnapshot(modalCard);
    autofocusFirstField(modalCard);
  }

  document.getElementById('template-form-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'template-form-backdrop') closeTemplateFormModal();
  });
  document.getElementById('template-form-close').addEventListener('click', closeTemplateFormModal);
  document.getElementById('template-form-cancel').addEventListener('click', closeTemplateFormModal);
  document.getElementById('template-form-save').addEventListener('click', handleSaveTemplate);
  enableEnterToSubmit(modalCard, document.getElementById('template-form-save'));
  document.addEventListener('keydown', handleTemplateFormModalEscape);

  let templateSearchTimer = null;
  document.getElementById('template-item-search').addEventListener('input', (e) => {
    clearTimeout(templateSearchTimer);
    const value = e.target.value;
    templateSearchTimer = setTimeout(() => {
      templateFormState.search = value;
      renderTemplateItemSearchResults();
    }, 300);
  });

  document.querySelectorAll('[data-remove-item]').forEach(btn => {
    btn.addEventListener('click', () => handleRemoveTemplateItem(Number(btn.dataset.removeItem)));
  });

  document.querySelectorAll('.template-item-qty-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.index);
      const value = e.target.value;
      templateFormState.items[idx].default_qty = value === '' ? null : Number(value);
    });
  });

  attachDragReorder('#template-items-list', '.template-item-row', templateFormState.items, () => {
    renderTemplateFormModal();
  });

  renderTemplateItemSearchResults();
}

async function handleSaveTemplate() {
  const s = templateFormState;
  const nameInput = document.getElementById('template-name-input');
  const descInput = document.getElementById('template-desc-input');
  const errorEl = document.getElementById('template-name-error');

  const name = nameInput.value.trim();
  errorEl.textContent = '';
  nameInput.classList.remove('input-error');

  if (!name) {
    nameInput.classList.add('input-error');
    errorEl.textContent = 'Name is required.';
    return;
  }

  const saveBtn = document.getElementById('template-form-save');
  setButtonLoading(saveBtn, true);

  try {
    const currentUser = getCurrentUser();
    const now = new Date();
    let templateId = s.templateId;

    if (templateId) {
      await db.task_templates.update(templateId, { name, description: descInput.value.trim() || null, updated_at: now });
      await db.task_template_items.where('template_id').equals(templateId).delete();
    } else {
      templateId = await db.task_templates.add({
        name,
        description: descInput.value.trim() || null,
        created_by: currentUser.id,
        created_at: now,
        updated_at: now,
        is_active: true,
        times_applied: 0
      });
    }

    if (s.items.length > 0) {
      await db.task_template_items.bulkAdd(s.items.map((item, idx) => ({
        template_id: templateId,
        line_item_code: item.line_item_code,
        default_qty: item.default_qty,
        sort_order: idx
      })));
    }

    showToast(`Template "${name}" saved.`, 'success');
    closeTemplateFormModal();
    renderTaskTemplatesSettings();
  } catch (err) {
    setButtonLoading(saveBtn, false);
    showToast('Could not save the template. Please try again.', 'error');
  }
}

/* ==========================================================================
   My Defaults — coordinators only (CLAUDE.md Stage 8.3)
   ========================================================================== */

function defaultsSelectFieldHtml(key, label, options, value) {
  const allOptions = (value && !options.includes(value)) ? [...options, value] : options;
  return selectFieldHtml(key, label, allOptions, value, false, false);
}

function defaultTemplateSelectHtml(templates, selectedId) {
  const options = templates.map(t => `<option value="${t.id}" ${String(selectedId) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
  const staleOption = (selectedId && !templates.some(t => String(t.id) === String(selectedId)))
    ? `<option value="${escapeHtml(selectedId)}" selected>(no longer available)</option>` : '';

  return `
    <label class="field" for="field-default_template_id">
      <span class="lbl">Default Template</span>
      <select id="field-default_template_id" name="default_template_id" class="select">
        <option value="">— None —</option>
        ${options}
        ${staleOption}
      </select>
    </label>`;
}

async function renderMyDefaultsSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  try {
    const user = getCurrentUser();
    const [defaultsSetting, streamResult, templates, refDataLoaded] = await Promise.all([
      db.app_settings.get(`user_defaults_${user.id}`),
      getActiveStreamNames(null),
      db.task_templates.filter(t => t.is_active).toArray(),
      db.app_settings.get('reference_data_last_loaded')
    ]);

    const defaults = (defaultsSetting && defaultsSetting.value) || {};
    const streamNames = streamResult.items.map(s => s.stream_name);
    const refDataLoadedAt = refDataLoaded ? refDataLoaded.value : null;

    container.innerHTML = myDefaultsPageHtml(defaults, streamNames, templates, refDataLoadedAt);
    attachMyDefaultsEvents();
  } catch (err) {
    showToast('Could not load your defaults.', 'error');
  }
}

function referenceDataCardHtml(refDataLoadedAt) {
  const lastLoadedLabel = refDataLoadedAt ? `Last loaded: ${formatDate(refDataLoadedAt)}` : 'Never loaded';
  return `
    <div class="card" style="padding:18px;margin-bottom:16px">
      <div class="lbl" style="margin-bottom:6px">Reference Data</div>
      <p class="tasks-subtitle" style="margin-bottom:10px">Load the latest catalogs, streams, contractor portions, and templates your PM shared with you.</p>
      <input type="file" id="refdata-file-input" accept=".json" class="hidden">
      <button id="refdata-load-btn" class="btn ghost sm">Load reference data file</button>
      <span style="margin-left:10px;color:var(--ink-2);font-size:12px">${lastLoadedLabel}</span>
    </div>`;
}

function myDefaultsPageHtml(defaults, streamNames, templates, refDataLoadedAt) {
  const d = (key) => defaults[key] || '';

  return `
    <div class="fade-in">
      <h1>My Defaults</h1>
      <p class="tasks-subtitle">Pre-fill these values automatically when you open Bulk Entry.</p>
      ${referenceDataCardHtml(refDataLoadedAt)}
      <div class="card" style="padding:18px">
        <div class="form-section-grid">
          ${defaultsSelectFieldHtml('region', 'Region', REGIONS, d('region'))}
          ${taskFieldHtml('sub_region', 'Sub Region', 'text', d('sub_region'), false, false)}
          ${taskFieldHtml('vendor', 'Vendor', 'text', d('vendor'), false, false)}
          ${defaultsSelectFieldHtml('tx_rf', 'TX/RF', TXRF_OPTIONS, d('tx_rf'))}
          ${defaultsSelectFieldHtml('distance', 'Distance', DISTANCE_BANDS, d('distance'))}
          ${defaultsSelectFieldHtml('contractor', 'Contractor', CONTRACTORS, d('contractor'))}
          ${taskFieldHtml('engineer_name', 'Engineer Name', 'text', d('engineer_name'), false, false)}
          ${taskFieldHtml('vf_task_owner', 'VF Task Owner', 'text', d('vf_task_owner'), false, false)}
          ${defaultsSelectFieldHtml('general_stream', 'General Stream', streamNames, d('general_stream'))}
          ${defaultTemplateSelectHtml(templates, defaults.default_template_id || '')}
        </div>
        <div class="task-form-footer" style="padding-top:14px">
          <button id="clear-defaults-btn" class="btn ghost">Clear all defaults</button>
          <button id="save-defaults-btn" class="btn primary">Save defaults</button>
        </div>
      </div>
    </div>`;
}

function collectMyDefaultsFormData() {
  const data = {};
  ['region', 'sub_region', 'vendor', 'tx_rf', 'distance', 'contractor', 'engineer_name', 'vf_task_owner', 'general_stream', 'default_template_id'].forEach(key => {
    const input = document.getElementById(`field-${key}`);
    data[key] = (input && input.value) ? input.value : null;
  });
  if (data.default_template_id) data.default_template_id = Number(data.default_template_id);
  return data;
}

async function handleSaveMyDefaults() {
  const btn = document.getElementById('save-defaults-btn');
  setButtonLoading(btn, true);
  try {
    const user = getCurrentUser();
    const data = collectMyDefaultsFormData();
    await db.app_settings.put({ key: `user_defaults_${user.id}`, value: data, updated_at: new Date() });
    showToast('Defaults saved.', 'success');
  } catch (err) {
    showToast('Could not save your defaults. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleClearMyDefaults() {
  try {
    const user = getCurrentUser();
    await db.app_settings.put({ key: `user_defaults_${user.id}`, value: {}, updated_at: new Date() });
    showToast('Defaults cleared.', 'success');
    renderMyDefaultsSettings();
  } catch (err) {
    showToast('Could not clear your defaults. Please try again.', 'error');
  }
}

function attachMyDefaultsEvents() {
  document.getElementById('save-defaults-btn').addEventListener('click', handleSaveMyDefaults);
  document.getElementById('clear-defaults-btn').addEventListener('click', handleClearMyDefaults);
  document.getElementById('refdata-load-btn').addEventListener('click', () => {
    document.getElementById('refdata-file-input').click();
  });
  document.getElementById('refdata-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) handleReferenceDataFileSelected(e.target.files[0]);
  });
}

function validateReferenceDataFile(data) {
  if (!data || typeof data !== 'object' || data.type !== 'reference_data_package') {
    return { valid: false, error: 'Invalid file. Ask your PM for the reference data file.' };
  }
  return { valid: true };
}

async function applyReferenceDataPackage(data) {
  const putAll = (table, rows) => (Array.isArray(rows) && rows.length) ? db[table].bulkPut(rows) : Promise.resolve();
  await Promise.all([
    putAll('catalogs', data.catalogs),
    putAll('catalog_items', data.catalog_items),
    putAll('general_streams', data.general_streams),
    putAll('contractor_portions', data.contractor_portions),
    putAll('task_templates', data.task_templates),
    putAll('task_template_items', data.task_template_items)
  ]);
}

async function handleReferenceDataFileSelected(file) {
  if (!file.name.toLowerCase().endsWith('.json')) {
    showToast('Please select a .json file.', 'error');
    return;
  }

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    showToast('Could not parse this file as JSON.', 'error');
    return;
  }

  const validation = validateReferenceDataFile(data);
  if (!validation.valid) {
    showToast(validation.error, 'error');
    return;
  }

  try {
    await applyReferenceDataPackage(data);
    await db.app_settings.put({ key: 'reference_data_last_loaded', value: new Date().toISOString(), updated_at: new Date() });
    showToast('Reference data loaded.', 'success');
    renderMyDefaultsSettings();
  } catch (err) {
    showToast('Could not load reference data. Please try again.', 'error');
  }
}

/* ==========================================================================
   Deleted Tasks — Settings (CLAUDE.md Stage 10.2)
   ========================================================================== */

const DELETED_TASKS_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

let deletedTasksState = { rows: [] };

function daysRemainingInfo(deletedAt) {
  if (!deletedAt) return { expired: true, label: 'Expired' };
  const remainingMs = (new Date(deletedAt).getTime() + DELETED_TASKS_WINDOW_MS) - Date.now();
  if (remainingMs <= 0) return { expired: true, label: 'Expired' };
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return { expired: false, label: `${days} day${days === 1 ? '' : 's'}` };
}

async function renderDeletedTasksSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  try {
    const user = getCurrentUser();
    await loadUsersByIdCache();

    const deleted = await getDeletedTasks(user.id);
    deleted.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    deletedTasksState.rows = deleted;

    container.innerHTML = deletedTasksPageHtml();
    attachDeletedTasksEvents();
  } catch (err) {
    showToast('Could not load deleted tasks.', 'error');
  }
}

function deletedTasksPageHtml() {
  const rows = deletedTasksState.rows;
  return `
    <div class="fade-in">
      <div class="tasks-page-header" style="margin-bottom:14px">
        <div>
          <h1>Deleted Tasks</h1>
          <p class="tasks-subtitle">${rows.length} deleted task${rows.length === 1 ? '' : 's'} · recoverable within 10 days</p>
        </div>
      </div>
      <div class="card">
        ${deletedTasksTableHtml()}
      </div>
    </div>`;
}

function deletedTasksTableHtml() {
  const rows = deletedTasksState.rows;
  if (rows.length === 0) {
    return `
      <div class="empty-state">
        ${iconSvg('trash', 30)}
        <div class="empty-state-title">No deleted tasks.</div>
        <div class="empty-state-desc">Deleted tasks appear here for 10 days before being permanently removed.</div>
      </div>`;
  }

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:170px">Task ID</th>
          <th style="width:120px">Physical Site ID</th>
          <th style="width:160px">Task Name</th>
          <th style="width:140px">Coordinator</th>
          <th style="width:140px">Deleted By</th>
          <th style="width:110px">Deleted At</th>
          <th style="width:110px">Days Remaining</th>
          <th style="width:100px">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(deletedTaskRowHtml).join('')}
      </tbody>
    </table>`;
}

function deletedTaskRowHtml(task) {
  const info = daysRemainingInfo(task.deleted_at);
  const deletedByName = usersByIdCache[task.deleted_by] || '—';

  return `
    <tr class="data-row">
      <td class="mono">${escapeHtml(task.id)}</td>
      <td class="mono">${escapeHtml(task.physical_site_id || '')}</td>
      <td>${escapeHtml(task.task_name || '')}</td>
      <td>${escapeHtml(task.coordinator_name || '')}</td>
      <td>${escapeHtml(deletedByName)}</td>
      <td class="mono" style="color:var(--ink-2)">${task.deleted_at ? formatDate(task.deleted_at) : '—'}</td>
      <td style="${info.expired ? 'color:var(--red);font-weight:600' : ''}">${info.label}</td>
      <td class="actions-cell">
        <button class="btn ghost sm" data-action="recover" data-id="${escapeHtml(task.id)}" ${info.expired ? 'disabled' : ''}>Recover</button>
      </td>
    </tr>`;
}

function attachDeletedTasksEvents() {
  document.querySelectorAll('[data-action="recover"]').forEach(btn => {
    btn.addEventListener('click', () => handleRecoverTask(btn.dataset.id));
  });
}

async function handleRecoverTask(id) {
  try {
    const result = await recoverTask(id);
    if (result && result.error) {
      showToast(result.error, 'error');
      return;
    }
    showToast('Task recovered.', 'success');
    renderDeletedTasksSettings();
  } catch (err) {
    showToast('Could not recover this task. Please try again.', 'error');
  }
}

window.renderSettings = renderSettings;
window.saveContractorPortion = saveContractorPortion;
window.renderImportHistorySettings = renderImportHistorySettings;
window.renderAuditLogSettings = renderAuditLogSettings;
window.renderUserAccountsSettings = renderUserAccountsSettings;
window.renderDropdownListsSettings = renderDropdownListsSettings;
window.renderColumnManagerSettings = renderColumnManagerSettings;
window.renderTaskTemplatesSettings = renderTaskTemplatesSettings;
window.renderMyDefaultsSettings = renderMyDefaultsSettings;
window.renderDeletedTasksSettings = renderDeletedTasksSettings;
