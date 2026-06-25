/* ==========================================================================
   Settings — shell nav + Contractor Portions (CLAUDE.md Stage 4.2)
   ========================================================================== */

const SETTINGS_SECTIONS = [
  { key: 'price-catalog', label: 'Price Catalog', roles: null },
  { key: 'general-stream', label: 'General Stream', roles: ['project_manager'] },
  { key: 'contractor-portions', label: 'Contractor Portions', roles: ['project_manager'] },
  { key: 'sync', label: 'Sync & Shared Folder', roles: MASTER_ROLES },
  { key: 'import-history', label: 'Import History', roles: ['project_manager'] }
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
  if (key === 'price-catalog') {
    renderCatalogSettings('settings-content');
  } else if (key === 'general-stream') {
    renderGeneralStreamSettings('settings-content');
  } else if (key === 'contractor-portions') {
    renderContractorPortionsSettings();
  } else if (key === 'sync') {
    renderSyncSettings();
  } else if (key === 'import-history') {
    renderImportHistorySettings();
  }
}

/* ==========================================================================
   Contractor Portions
   ========================================================================== */

let portionsPageState = { expanded: {} };
let portionModalState = null;

function getCurrentPortionRule(sortedRulesDesc, dateValue) {
  const ruleDate = dateValue ? new Date(dateValue) : new Date();
  const eligible = sortedRulesDesc.filter(r => new Date(r.valid_from) <= ruleDate);
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, r) => new Date(r.valid_from) > new Date(latest.valid_from) ? r : latest);
}

async function renderContractorPortionsSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  const allRules = await db.contractor_portions.toArray();
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

function handlePortionModalEscape(e) {
  if (e.key === 'Escape') closeUpdatePortionModal();
}

function updatePortionModalHtml() {
  const s = portionModalState;

  return `
    <div class="modal-backdrop scale-in" id="portion-modal-backdrop">
      <div class="card modal" id="portion-modal-card">
        <div class="modal-header">
          <h2>Update Portion — ${escapeHtml(s.contractorName)}</h2>
          <button class="icon-btn" id="portion-modal-close" title="Close">${iconSvg('close', 16)}</button>
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

  await saveContractorPortion({
    contractor_name: portionModalState.contractorName,
    lmp_pct: lmpPct,
    valid_from: validFrom,
    notes: notesInput.value.trim() || null
  });

  showToast(`Portion rule saved for ${portionModalState.contractorName}.`, 'success');
  closeUpdatePortionModal();
  await renderContractorPortionsSettings();
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

  importHistoryPageState.history = await getImportHistory();
  importHistoryPageState.expandedId = null;
  importHistoryPageState.entries = {};

  container.innerHTML = importHistoryPageHtml();
  attachImportHistoryEvents();
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
              <td>${l.field_name ? `${escapeHtml(importFormatValue(l.field_name, l.old_value))} → ${escapeHtml(importFormatValue(l.field_name, l.new_value))}` : '—'}</td>
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
        importHistoryPageState.entries[importId] = await getImportSessionAuditEntries(entry);
      }
    }
  }

  const container = document.getElementById('settings-content');
  if (container) {
    container.innerHTML = importHistoryPageHtml();
    attachImportHistoryEvents();
  }
}

window.renderSettings = renderSettings;
window.saveContractorPortion = saveContractorPortion;
window.renderImportHistorySettings = renderImportHistorySettings;
