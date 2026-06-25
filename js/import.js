/* ==========================================================================
   Import — coordinator JSON import flow (CLAUDE.md Stage 5.2)
   ========================================================================== */

const IMPORT_NEVER_DIFF_FIELDS = [
  ...PM_FIELDS,
  'lmp_portion_overridden', 'contractor_portion_overridden',
  'id', 'coordinator_id', 'coordinator_name',
  'created_at', 'created_by', 'updated_at',
  'is_deleted', 'deleted_at', 'deleted_by',
  'is_locked', 'locked_at', 'locked_by', 'lock_reason',
  'managed_by_id'
];

const IMPORT_DATE_FIELDS = new Set(['task_date', 'done_date']);
const IMPORT_HISTORY_KEY = 'import_history';

let importState = null;

function importValuesEqual(field, oldValue, newValue) {
  const a = (oldValue === undefined) ? null : oldValue;
  const b = (newValue === undefined) ? null : newValue;
  const aEmpty = a === null || a === '';
  const bEmpty = b === null || b === '';
  if (aEmpty && bEmpty) return true;
  if (aEmpty !== bEmpty) return false;

  if (IMPORT_DATE_FIELDS.has(field)) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function importFormatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (IMPORT_DATE_FIELDS.has(field)) return formatDate(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function importFormatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function importFieldLabel(field) {
  const meta = COORDINATOR_COLUMNS.find(c => c.key === field);
  return meta ? meta.label : field;
}

function diffImport(incomingTasks, existingTasks) {
  const existingMap = new Map(existingTasks.map(t => [t.id, t]));
  const newTasks = [];
  const changes = [];
  const deletedConflicts = [];
  let unchangedCount = 0;

  incomingTasks.forEach(incoming => {
    const existing = existingMap.get(incoming.id);

    if (!existing) {
      newTasks.push(incoming);
      return;
    }

    if (existing.is_deleted) {
      deletedConflicts.push({ incoming, existing });
      return;
    }

    const fieldChanges = [];
    Object.keys(incoming).forEach(field => {
      if (IMPORT_NEVER_DIFF_FIELDS.includes(field)) return;
      const oldValue = existing[field];
      const newValue = incoming[field];
      if (!importValuesEqual(field, oldValue, newValue)) {
        fieldChanges.push({
          field,
          oldValue: oldValue === undefined ? null : oldValue,
          newValue: newValue === undefined ? null : newValue
        });
      }
    });

    if (fieldChanges.length > 0) {
      changes.push({ taskId: incoming.id, existing, incoming, fieldChanges });
    } else {
      unchangedCount++;
    }
  });

  return { newTasks, changes, deletedConflicts, unchangedCount };
}

function validateImportFile(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['File is not a valid coordinator export.'] };
  }
  if (!data.version) errors.push('Missing "version" field — this does not look like a coordinator export file.');
  if (data.coordinator_id === undefined || data.coordinator_id === null) errors.push('Missing "coordinator_id" field in file header.');
  if (!Array.isArray(data.tasks)) errors.push('Missing or invalid "tasks" array.');
  return { valid: errors.length === 0, errors };
}

async function checkCoordinatorMismatch(data, allMasterTasks) {
  const headerUser = await db.users.get(data.coordinator_id);
  if (!headerUser) {
    return `Coordinator ID ${data.coordinator_id} in this file was not found in your user list.`;
  }

  const mismatched = data.tasks.find(t => {
    const existing = allMasterTasks.find(m => m.id === t.id);
    return existing && existing.coordinator_id !== data.coordinator_id;
  });

  if (mismatched) {
    return `This file is labeled "${data.coordinator_name || headerUser.name}" but contains task ${mismatched.id}, which belongs to a different coordinator in your records.`;
  }

  return null;
}

async function checkDuplicateImport(data) {
  const setting = await db.app_settings.get(IMPORT_HISTORY_KEY);
  const history = (setting && setting.value) || [];
  return history.some(h => h.coordinator_id === data.coordinator_id && h.exported_at === data.exported_at);
}

function buildDefaultChecks(diff) {
  const newTasks = {};
  diff.newTasks.forEach(t => { newTasks[t.id] = true; });

  const changes = {};
  diff.changes.forEach(group => {
    changes[group.taskId] = {};
    group.fieldChanges.forEach(fc => {
      changes[group.taskId][fc.field] = !group.existing.is_locked;
    });
  });

  const deletedConflicts = {};
  diff.deletedConflicts.forEach(dc => { deletedConflicts[dc.incoming.id] = false; });

  return { newTasks, changes, deletedConflicts };
}

async function handleFileSelected(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.json')) {
    showToast('Please select a .json file.', 'error');
    return;
  }

  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch (e) {
    showToast('Could not parse this file as JSON.', 'error');
    return;
  }

  const validation = validateImportFile(data);
  if (!validation.valid) {
    showToast(validation.errors[0], 'error');
    return;
  }

  const allMasterTasks = await db.tasks.toArray();

  const mismatchMessage = await checkCoordinatorMismatch(data, allMasterTasks);
  if (mismatchMessage) {
    const proceed = window.confirm(`${mismatchMessage}\n\nContinue importing anyway?`);
    if (!proceed) return;
  }

  const isDuplicate = await checkDuplicateImport(data);
  const diff = diffImport(data.tasks, allMasterTasks);

  importState = {
    header: data,
    filename: file.name,
    diff,
    isDuplicate,
    checks: buildDefaultChecks(diff)
  };

  renderImport();
}

/* ==========================================================================
   Drop zone
   ========================================================================== */

function importDropZoneHtml() {
  return `
    <div class="fade-in import-page">
      <h1>Import Coordinator File</h1>
      <p class="tasks-subtitle">Import a JSON file exported by a coordinator to merge their tasks into the master list.</p>
      <div id="import-dropzone" class="import-dropzone">
        ${iconSvg('import', 34)}
        <div class="import-dropzone-title">Drop coordinator JSON file here</div>
        <div class="import-dropzone-sub">or <button type="button" id="import-browse-btn" class="import-browse-link">browse</button></div>
        <input type="file" id="import-file-input" accept=".json" class="hidden">
      </div>
    </div>`;
}

function attachDropZoneEvents() {
  const zone = document.getElementById('import-dropzone');
  const input = document.getElementById('import-file-input');
  const browseBtn = document.getElementById('import-browse-btn');

  browseBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFileSelected(e.target.files[0]));

  ['dragenter', 'dragover'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('drag-active');
    });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('drag-active');
    });
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-active');
    handleFileSelected(e.dataTransfer.files[0]);
  });
}

/* ==========================================================================
   Review screen
   ========================================================================== */

function importSummaryChipsHtml() {
  const diff = importState.diff;
  return `
    <div class="import-chips-row">
      <span class="import-chip new">${diff.newTasks.length} new task${diff.newTasks.length === 1 ? '' : 's'}</span>
      <span class="import-chip changed">${diff.changes.length} change${diff.changes.length === 1 ? '' : 's'}</span>
      <span class="import-chip unchanged">${diff.unchangedCount} unchanged</span>
    </div>`;
}

function importNewTasksSectionHtml() {
  const diff = importState.diff;
  return `
    <div class="card import-section">
      <div class="import-section-title">New Tasks <span class="import-section-count">${diff.newTasks.length}</span></div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th style="width:160px">ID</th>
            <th>Site</th>
            <th>Task</th>
            <th style="width:90px">Line Item</th>
            <th style="width:100px">Status</th>
            <th style="width:100px" class="num-col">Total</th>
          </tr>
        </thead>
        <tbody>
          ${diff.newTasks.map(t => `
            <tr class="data-row">
              <td><input type="checkbox" class="import-row-checkbox" data-section="newTasks" data-id="${escapeHtml(t.id)}" ${importState.checks.newTasks[t.id] ? 'checked' : ''}></td>
              <td class="mono">${escapeHtml(t.id)}</td>
              <td class="mono">${escapeHtml(t.physical_site_id || '')}</td>
              <td>${escapeHtml(t.task_name || '')}</td>
              <td class="mono">${escapeHtml(t.line_item_code || '')}</td>
              <td>${statusBadgeHtml(t.status)}</td>
              <td class="num-col num">${formatMoney(t.new_total_price) ?? '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function importChangeGroupHtml(group) {
  const locked = !!group.existing.is_locked;
  return `
    <div class="import-change-group">
      <div class="import-change-group-header">
        <span class="mono">${escapeHtml(group.taskId)}</span>
        <span class="import-change-group-site">${escapeHtml(group.existing.physical_site_id || '')}</span>
      </div>
      ${locked ? `<div class="import-locked-strip">${iconSvg('lock', 13)}<span>Task is locked — coordinator field changes will be ignored</span></div>` : ''}
      <div class="import-change-rows">
        ${group.fieldChanges.map(fc => `
          <label class="import-change-row${locked ? ' disabled' : ''}">
            <input type="checkbox" class="import-row-checkbox" data-section="changes" data-task="${escapeHtml(group.taskId)}" data-field="${fc.field}"
              ${(!locked && importState.checks.changes[group.taskId][fc.field]) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <span class="import-change-field">${escapeHtml(importFieldLabel(fc.field))}</span>
            <span class="import-change-value">${escapeHtml(importFormatValue(fc.field, fc.oldValue))}</span>
            ${iconSvg('arrowRight', 13)}
            <span class="import-change-value new">${escapeHtml(importFormatValue(fc.field, fc.newValue))}</span>
          </label>`).join('')}
      </div>
    </div>`;
}

function importChangesSectionHtml() {
  const diff = importState.diff;
  return `
    <div class="card import-section">
      <div class="import-section-title">Changes <span class="import-section-count">${diff.changes.length}</span></div>
      ${diff.changes.map(importChangeGroupHtml).join('')}
    </div>`;
}

function importDeletedConflictsSectionHtml() {
  const diff = importState.diff;
  return `
    <div class="card import-section">
      <div class="import-section-title">Deleted in Master <span class="import-section-count">${diff.deletedConflicts.length}</span></div>
      ${diff.deletedConflicts.map(dc => `
        <label class="import-change-row">
          <input type="checkbox" class="import-row-checkbox" data-section="deletedConflicts" data-id="${escapeHtml(dc.incoming.id)}" ${importState.checks.deletedConflicts[dc.incoming.id] ? 'checked' : ''}>
          <span class="mono">${escapeHtml(dc.incoming.id)}</span>
          <span>${escapeHtml(dc.incoming.physical_site_id || '')}</span>
          <span class="import-conflict-msg">Task was deleted in master. Restore and apply?</span>
        </label>`).join('')}
    </div>`;
}

function importReviewHtml() {
  const header = importState.header;
  const diff = importState.diff;
  const nothingToImport = diff.newTasks.length === 0 && diff.changes.length === 0 && diff.deletedConflicts.length === 0;

  return `
    <div class="fade-in import-page">
      <h1>Review Import</h1>
      <div class="card import-summary-card">
        <div class="import-summary-row">
          <div>
            <div class="import-summary-coordinator">${escapeHtml(header.coordinator_name || 'Unknown coordinator')}</div>
            <div class="import-summary-meta">Exported ${importFormatDateTime(header.exported_at)} · ${escapeHtml(importState.filename)}</div>
          </div>
          <button id="import-discard-file-btn" class="btn ghost sm">${iconSvg('close', 13)}<span>Discard file</span></button>
        </div>
        ${importSummaryChipsHtml()}
        ${importState.isDuplicate ? `<div class="import-warning-banner">${iconSvg('warn', 14)}<span>Appears already imported — a file from this coordinator with the same export timestamp was imported before.</span></div>` : ''}
        ${diff.deletedConflicts.length > 0 ? `<div class="import-warning-banner">${iconSvg('warn', 14)}<span>${diff.deletedConflicts.length} task${diff.deletedConflicts.length === 1 ? '' : 's'} in this file ${diff.deletedConflicts.length === 1 ? 'was' : 'were'} deleted in the master list. Review below.</span></div>` : ''}
      </div>

      ${!nothingToImport ? `
      <div class="import-bulk-controls">
        <button id="import-accept-all-btn" class="btn ghost sm">Accept All</button>
        <button id="import-discard-all-btn" class="btn ghost sm">Discard All</button>
      </div>` : ''}

      ${diff.newTasks.length > 0 ? importNewTasksSectionHtml() : ''}
      ${diff.changes.length > 0 ? importChangesSectionHtml() : ''}
      ${diff.deletedConflicts.length > 0 ? importDeletedConflictsSectionHtml() : ''}

      ${nothingToImport ? `
        <div class="card tasks-table-wrap">
          <div class="empty-state">
            ${iconSvg('check', 30)}
            <div class="empty-state-title">Nothing to import.</div>
            <div class="empty-state-desc">All ${diff.unchangedCount} task${diff.unchangedCount === 1 ? '' : 's'} already match the master list.</div>
          </div>
        </div>` : ''}

      <div class="import-footer">
        <button id="import-cancel-btn" class="btn ghost">Cancel</button>
        <button id="import-confirm-btn" class="btn primary" ${nothingToImport ? 'disabled' : ''}>Confirm Import</button>
      </div>
    </div>`;
}

function attachReviewEvents() {
  document.getElementById('import-discard-file-btn').addEventListener('click', handleCancelImport);
  document.getElementById('import-cancel-btn').addEventListener('click', handleCancelImport);
  document.getElementById('import-confirm-btn').addEventListener('click', handleConfirmImport);

  const acceptAllBtn = document.getElementById('import-accept-all-btn');
  const discardAllBtn = document.getElementById('import-discard-all-btn');
  if (acceptAllBtn) acceptAllBtn.addEventListener('click', () => setAllChecks(true));
  if (discardAllBtn) discardAllBtn.addEventListener('click', () => setAllChecks(false));

  document.querySelectorAll('.import-row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const section = e.target.dataset.section;
      if (section === 'newTasks' || section === 'deletedConflicts') {
        importState.checks[section][e.target.dataset.id] = e.target.checked;
      } else if (section === 'changes') {
        importState.checks.changes[e.target.dataset.task][e.target.dataset.field] = e.target.checked;
      }
    });
  });
}

function setAllChecks(value) {
  Object.keys(importState.checks.newTasks).forEach(id => { importState.checks.newTasks[id] = value; });

  importState.diff.changes.forEach(group => {
    if (group.existing.is_locked) return;
    Object.keys(importState.checks.changes[group.taskId]).forEach(field => {
      importState.checks.changes[group.taskId][field] = value;
    });
  });

  Object.keys(importState.checks.deletedConflicts).forEach(id => { importState.checks.deletedConflicts[id] = value; });

  renderImport();
}

function handleCancelImport() {
  importState = null;
  renderImport();
}

/* ==========================================================================
   Confirm import — apply checked items to db
   ========================================================================== */

function sanitizeIncomingTask(task) {
  const clean = {};
  Object.keys(task).forEach(key => {
    if (PM_FIELDS.includes(key)) return;
    clean[key] = task[key];
  });
  clean.is_deleted = false;
  clean.deleted_at = null;
  clean.deleted_by = null;
  clean.is_locked = false;
  clean.locked_at = null;
  clean.locked_by = null;
  clean.lock_reason = null;
  return clean;
}

function generateImportId() {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function handleConfirmImport() {
  const currentUser = getCurrentUser();
  const diff = importState.diff;
  const filename = importState.filename;
  const importStartedAt = new Date();

  let addedCount = 0;
  let changesApplied = 0;
  let changesDiscarded = 0;
  let skippedLockedCount = 0;

  const tasksToAdd = diff.newTasks.filter(t => importState.checks.newTasks[t.id]).map(sanitizeIncomingTask);

  if (tasksToAdd.length > 0) {
    await db.tasks.bulkAdd(tasksToAdd);
    for (const t of tasksToAdd) {
      await writeAuditLog({ task_id: t.id, user_id: currentUser.id, action: 'import_applied', source_file: filename });
    }
    addedCount = tasksToAdd.length;
  }

  for (const group of diff.changes) {
    const fresh = await db.tasks.get(group.taskId);
    if (!fresh) continue;

    if (fresh.is_locked) {
      skippedLockedCount++;
      changesDiscarded += group.fieldChanges.length;
      continue;
    }

    const checkedFields = group.fieldChanges.filter(fc => importState.checks.changes[group.taskId][fc.field]);
    changesDiscarded += group.fieldChanges.length - checkedFields.length;
    if (checkedFields.length === 0) continue;

    const updatePayload = {};
    checkedFields.forEach(fc => { updatePayload[fc.field] = fc.newValue; });
    await db.tasks.update(group.taskId, { ...updatePayload, updated_at: new Date() });

    for (const fc of checkedFields) {
      await writeAuditLog({
        task_id: group.taskId, user_id: currentUser.id, action: 'import_applied',
        field_name: fc.field, old_value: fc.oldValue, new_value: fc.newValue, source_file: filename
      });
      changesApplied++;
    }
  }

  for (const dc of diff.deletedConflicts) {
    if (!importState.checks.deletedConflicts[dc.incoming.id]) {
      changesDiscarded++;
      continue;
    }
    await recoverTask(dc.incoming.id);
    const cleanIncoming = sanitizeIncomingTask(dc.incoming);
    await db.tasks.update(dc.incoming.id, { ...cleanIncoming, updated_at: new Date() });
    await writeAuditLog({ task_id: dc.incoming.id, user_id: currentUser.id, action: 'import_applied', source_file: filename });
    changesApplied++;
  }

  const importFinishedAt = new Date();

  const historySetting = await db.app_settings.get(IMPORT_HISTORY_KEY);
  const historyValue = (historySetting && historySetting.value) || [];
  historyValue.push({
    import_id: generateImportId(),
    date: importStartedAt.toISOString(),
    date_end: importFinishedAt.toISOString(),
    coordinator_id: importState.header.coordinator_id,
    coordinator_name: importState.header.coordinator_name,
    exported_at: importState.header.exported_at,
    filename,
    new_count: addedCount,
    changes_applied: changesApplied,
    changes_discarded: changesDiscarded,
    imported_by: currentUser.name
  });
  await db.app_settings.put({ key: IMPORT_HISTORY_KEY, value: historyValue, updated_at: new Date() });

  const skippedNote = skippedLockedCount > 0 ? ` ${skippedLockedCount} task${skippedLockedCount === 1 ? '' : 's'} skipped (locked).` : '';
  showToast(`Import complete. ${addedCount} task${addedCount === 1 ? '' : 's'} added, ${changesApplied} change${changesApplied === 1 ? '' : 's'} applied.${skippedNote}`, 'success');

  importState = null;
  renderImport();
}

/* ==========================================================================
   Import history — read access for Settings (CLAUDE.md Stage 5.3)
   ========================================================================== */

async function getImportHistory() {
  const setting = await db.app_settings.get(IMPORT_HISTORY_KEY);
  const history = (setting && setting.value) || [];
  return history.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getImportSessionAuditEntries(entry) {
  const matches = await db.audit_log.where('source_file').equals(entry.filename).toArray();
  const start = new Date(entry.date).getTime() - 1000;
  const end = new Date(entry.date_end || entry.date).getTime() + 1000;

  return matches
    .filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= start && t <= end;
    })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/* ==========================================================================
   Route entry point
   ========================================================================== */

function renderImport() {
  const container = document.getElementById('page-content');
  if (!container) return;

  if (!importState) {
    container.innerHTML = importDropZoneHtml();
    attachDropZoneEvents();
  } else {
    container.innerHTML = importReviewHtml();
    attachReviewEvents();
  }
}

window.renderImport = renderImport;
window.getImportHistory = getImportHistory;
window.getImportSessionAuditEntries = getImportSessionAuditEntries;
window.diffImport = diffImport;
