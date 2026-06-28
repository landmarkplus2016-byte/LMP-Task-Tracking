/* ==========================================================================
   Catalog — price catalog upload, storage, lookup (CLAUDE.md Stage 4.1)
   ========================================================================== */

function normalizeCatalogHeader(h) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function defaultCatalogValidFrom(year) {
  return `${year}-04-01`;
}

async function getActiveCatalogForDate(dateValue) {
  const priceDate = dateValue ? new Date(dateValue) : new Date();
  const catalogs = await db.catalogs.toArray();
  if (catalogs.length === 0) return null;

  const eligible = catalogs.filter(c => new Date(c.valid_from) <= priceDate);
  const pool = eligible.length > 0 ? eligible : catalogs;
  return pool.reduce((latest, c) => new Date(c.valid_from) > new Date(latest.valid_from) ? c : latest);
}

function pickActiveCatalog(catalogs, dateValue) {
  if (!catalogs || catalogs.length === 0) return null;
  const priceDate = dateValue ? new Date(dateValue) : new Date();
  const eligible = catalogs.filter(c => new Date(c.valid_from) <= priceDate);
  const pool = eligible.length > 0 ? eligible : catalogs;
  return pool.reduce((latest, c) => new Date(c.valid_from) > new Date(latest.valid_from) ? c : latest);
}

async function getPriceForDate(lineItemCode, doneDate) {
  const catalog = await getActiveCatalogForDate(doneDate);
  if (!catalog) return { price: null, warning: 'no_catalog' };

  const items = await db.catalog_items.where('catalog_id').equals(catalog.id).toArray();
  const item = items.find(i => i.code === lineItemCode && i.is_active);
  if (!item) return { price: null, warning: 'no_catalog' };

  return { price: item.price, catalogYear: catalog.year, catalogId: catalog.id };
}

async function getLineItemOptionsForDate(dateValue) {
  const catalog = await getActiveCatalogForDate(dateValue);
  if (!catalog) return { items: [], warning: 'no_catalog' };

  const items = await db.catalog_items.where('catalog_id').equals(catalog.id).toArray();
  return { items: items.filter(i => i.is_active), catalogId: catalog.id, catalogYear: catalog.year };
}

async function getAllCatalogsSorted() {
  const catalogs = await db.catalogs.toArray();
  return catalogs.sort((a, b) => new Date(b.valid_from) - new Date(a.valid_from));
}

async function loadCatalogsWithMeta() {
  const [catalogs, users] = await Promise.all([getAllCatalogsSorted(), db.users.toArray()]);
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const result = [];
  for (const c of catalogs) {
    const itemCount = await db.catalog_items.where('catalog_id').equals(c.id).count();
    result.push({ ...c, itemCount, uploadedByName: userMap.get(c.created_by) || 'Unknown' });
  }
  return result;
}

async function getCatalogTaskCount(year) {
  const tasks = await db.tasks.toArray();
  return tasks.filter(t => t.catalog_year === year && !t.is_deleted).length;
}

function validateCatalogRows(rows) {
  if (!rows || rows.length === 0) {
    return { valid: false, errors: ['CSV file has no data rows.'], items: [] };
  }

  const headerKeys = Object.keys(rows[0]);
  const findCol = (normalizedTarget) => headerKeys.find(k => normalizeCatalogHeader(k) === normalizedTarget);

  const priceCol = findCol('price');
  const codeCol = findCol('code');
  const nameCol = findCol('name');
  const categoryCol = findCol('category');
  const combinedCol = findCol('codeactivity');

  const missing = [];
  if (!priceCol) missing.push('price');
  if (!combinedCol) {
    if (!codeCol) missing.push('code');
    if (!nameCol) missing.push('name');
  }
  if (missing.length > 0) {
    return { valid: false, errors: [`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`], items: [] };
  }

  const errors = [];
  const items = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 for header row, +1 for 1-based
    let code, name;
    if (combinedCol) {
      const combined = String(row[combinedCol] ?? '').trim();
      const sepIdx = combined.indexOf(' - ');
      code = (sepIdx === -1 ? combined : combined.slice(0, sepIdx)).trim();
      name = (sepIdx === -1 ? '' : combined.slice(sepIdx + 3)).trim();
    } else {
      code = String(row[codeCol] ?? '').trim();
      name = String(row[nameCol] ?? '').trim();
    }
    const category = categoryCol ? String(row[categoryCol] ?? '').trim() : '';
    const priceRaw = row[priceCol];
    const price = Number(String(priceRaw ?? '').replace(/,/g, ''));

    if (!code) {
      errors.push(`Row ${rowNum}: missing code.`);
      return;
    }
    if (!name) {
      errors.push(`Row ${rowNum}: missing name.`);
      return;
    }
    if (priceRaw === undefined || priceRaw === null || String(priceRaw).trim() === '' || isNaN(price) || price < 0) {
      errors.push(`Row ${rowNum}: invalid price "${priceRaw}".`);
      return;
    }

    items.push({ code, name, category, price: round2(price) });
  });

  const seen = new Set();
  const duplicates = new Set();
  items.forEach(i => {
    if (seen.has(i.code)) duplicates.add(i.code);
    seen.add(i.code);
  });
  if (duplicates.size > 0) {
    errors.push(`Duplicate line item code${duplicates.size > 1 ? 's' : ''}: ${Array.from(duplicates).join(', ')}`);
  }

  return { valid: errors.length === 0, errors, items };
}

function diffCatalogItems(newItems, previousItems) {
  const prevMap = new Map((previousItems || []).map(i => [i.code, i]));
  const newMap = new Map(newItems.map(i => [i.code, i]));

  const added = newItems.filter(i => !prevMap.has(i.code));
  const removed = (previousItems || []).filter(i => !newMap.has(i.code));
  const changed = newItems
    .filter(i => prevMap.has(i.code) && prevMap.get(i.code).price !== i.price)
    .map(i => ({ code: i.code, name: i.name, oldPrice: prevMap.get(i.code).price, newPrice: i.price }));

  return { added, removed, changed };
}

async function saveCatalog({ year, validFrom, items }) {
  const currentUser = getCurrentUser();

  const catalogId = await db.transaction('rw', db.catalogs, db.catalog_items, db.audit_log, async () => {
    const id = await db.catalogs.add({
      year,
      valid_from: new Date(validFrom),
      valid_to: null,
      created_by: currentUser.id,
      uploaded_at: new Date(),
      notes: null
    });
    await db.catalog_items.bulkAdd(items.map(item => ({ ...item, catalog_id: id, is_active: true })));
    await writeAuditLog({ user_id: currentUser.id, action: 'catalog_uploaded', field_name: 'year', new_value: year });
    return id;
  });

  return await db.catalogs.get(catalogId);
}

async function deleteCatalog(id) {
  const currentUser = getCurrentUser();

  await db.transaction('rw', db.catalogs, db.catalog_items, db.audit_log, async () => {
    await db.catalog_items.where('catalog_id').equals(id).delete();
    await db.catalogs.delete(id);
    await writeAuditLog({ user_id: currentUser.id, action: 'catalog_deleted', field_name: 'catalog_id', old_value: id });
  });
}

/* ==========================================================================
   Settings — Price Catalog page
   ========================================================================== */

let catalogPageState = { catalogs: [], expandedId: null, expandedItems: [], containerId: 'page-content' };
let uploadModalState = null;
let catalogModalFormSnapshot = null;

async function renderCatalogSettings(containerId) {
  const user = getCurrentUser();
  if (!user) return;

  catalogPageState.containerId = containerId || 'page-content';
  const container = document.getElementById(catalogPageState.containerId);
  if (!container) return;

  container.innerHTML = tableSkeletonHtml(4);

  try {
    catalogPageState.catalogs = await loadCatalogsWithMeta();
  } catch (err) {
    showToast('Could not load the price catalog.', 'error');
    return;
  }
  catalogPageState.expandedId = null;
  catalogPageState.expandedItems = [];

  const canManage = user.role === 'project_manager';
  container.innerHTML = catalogSettingsPageHtml(canManage);
  attachCatalogSettingsEvents(canManage);
}

function catalogSettingsPageHtml(canManage) {
  return `
    <div class="fade-in tasks-page">
      <div class="tasks-page-header">
        <div>
          <h1>Price Catalog</h1>
          <p class="tasks-subtitle">${catalogPageState.catalogs.length} catalog${catalogPageState.catalogs.length === 1 ? '' : 's'} uploaded</p>
        </div>
        ${canManage ? `
        <div class="tasks-page-header-actions">
          <button id="upload-catalog-btn" class="btn primary">${iconSvg('add', 15)}<span>Upload New Catalog</span></button>
        </div>` : ''}
      </div>
      <div id="catalog-list-section">${catalogListHtml(canManage)}</div>
      <div id="catalog-modal-root"></div>
    </div>`;
}

function catalogListHtml(canManage) {
  const catalogs = catalogPageState.catalogs;

  if (catalogs.length === 0) {
    return `
      <div class="card tasks-table-wrap">
        <div class="empty-state">
          ${iconSvg('database', 30)}
          <div class="empty-state-title">No catalogs uploaded yet.</div>
          <div class="empty-state-desc">${canManage ? 'Click "Upload New Catalog" to add the first price list.' : 'Ask the PM to upload a price catalog.'}</div>
        </div>
      </div>`;
  }

  const activeCatalog = pickActiveCatalog(catalogs, new Date());

  return `
    <div class="card tasks-table-wrap">
      <table class="data-table catalog-table">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th style="width:80px">Year</th>
            <th style="width:120px">Valid From</th>
            <th style="width:90px" class="num-col">Items</th>
            <th style="width:160px">Uploaded By</th>
            <th style="width:140px">Uploaded</th>
            <th style="width:90px">Status</th>
            ${canManage ? '<th style="width:60px">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${catalogs.map(c => catalogRowHtml(c, activeCatalog && activeCatalog.id === c.id, canManage)).join('')}
        </tbody>
      </table>
    </div>`;
}

function catalogRowHtml(catalog, isActive, canManage) {
  const expanded = catalogPageState.expandedId === catalog.id;
  const colspan = canManage ? 8 : 7;

  const statusCell = isActive
    ? `<span class="badge status-done"><span class="badge-dot"></span>Active</span>`
    : `<span style="color:var(--ink-3)">—</span>`;

  const row = `
    <tr class="data-row catalog-row" data-catalog-id="${catalog.id}">
      <td><span class="catalog-expand-icon${expanded ? ' expanded' : ''}">${iconSvg('chevRight', 14)}</span></td>
      <td class="mono">${catalog.year}</td>
      <td class="mono">${formatDate(catalog.valid_from)}</td>
      <td class="num-col num">${catalog.itemCount}</td>
      <td>${escapeHtml(catalog.uploadedByName)}</td>
      <td class="mono">${formatDate(catalog.uploaded_at)}</td>
      <td>${statusCell}</td>
      ${canManage ? `<td class="actions-cell"><button class="icon-btn sm-icon-btn" data-action="delete-catalog" data-id="${catalog.id}" title="Delete catalog" aria-label="Delete catalog">${iconSvg('trash', 14)}</button></td>` : ''}
    </tr>`;

  const expandedRow = expanded
    ? `<tr class="catalog-items-row"><td colspan="${colspan}">${catalogItemsTableHtml(catalogPageState.expandedItems)}</td></tr>`
    : '';

  return row + expandedRow;
}

function catalogItemsTableHtml(items) {
  if (items.length === 0) {
    return `<div class="catalog-items-wrap"><span style="color:var(--ink-3);font-size:13px">No line items in this catalog.</span></div>`;
  }

  return `
    <div class="catalog-items-wrap">
      <table class="data-table catalog-items-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Category</th>
            <th class="num-col">Price (EGP)</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td class="mono">${escapeHtml(i.code)}</td>
              <td>${escapeHtml(i.name)}</td>
              <td>${escapeHtml(i.category || '')}</td>
              <td class="num-col num">${formatMoney(i.price)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function attachCatalogSettingsEvents(canManage) {
  if (canManage) {
    document.getElementById('upload-catalog-btn')?.addEventListener('click', openUploadCatalogModal);
  }
  attachCatalogListEvents(canManage);
}

function attachCatalogListEvents(canManage) {
  const section = document.getElementById('catalog-list-section');
  if (!section) return;

  section.querySelectorAll('.catalog-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete-catalog"]')) return;
      toggleCatalogExpand(Number(row.dataset.catalogId), canManage);
    });
  });

  if (canManage) {
    section.querySelectorAll('[data-action="delete-catalog"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteCatalog(Number(btn.dataset.id));
      });
    });
  }
}

async function toggleCatalogExpand(id, canManage) {
  if (catalogPageState.expandedId === id) {
    catalogPageState.expandedId = null;
    catalogPageState.expandedItems = [];
  } else {
    try {
      catalogPageState.expandedItems = await db.catalog_items.where('catalog_id').equals(id).toArray();
      catalogPageState.expandedId = id;
    } catch (err) {
      showToast('Could not load catalog items.', 'error');
      return;
    }
  }

  const section = document.getElementById('catalog-list-section');
  if (section) {
    section.innerHTML = catalogListHtml(canManage);
    attachCatalogListEvents(canManage);
  }
}

async function handleDeleteCatalog(id) {
  const catalog = catalogPageState.catalogs.find(c => c.id === id);
  if (!catalog) return;

  const btn = document.querySelector(`[data-action="delete-catalog"][data-id="${id}"]`);

  try {
    const affected = await getCatalogTaskCount(catalog.year);
    if (affected > 0) {
      showToast(`Cannot delete — ${affected} task${affected === 1 ? '' : 's'} reference the ${catalog.year} catalog.`, 'warning');
      return;
    }

    if (!window.confirm(`Delete the ${catalog.year} catalog (${catalog.itemCount} item${catalog.itemCount === 1 ? '' : 's'})? This cannot be undone.`)) {
      return;
    }

    setButtonLoading(btn, true);
    await deleteCatalog(id);
    showToast('Catalog deleted.', 'success');
    await renderCatalogSettings(catalogPageState.containerId);
  } catch (err) {
    showToast('Could not delete catalog.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

/* ==========================================================================
   Upload modal
   ========================================================================== */

function openUploadCatalogModal() {
  const year = new Date().getFullYear();
  uploadModalState = {
    year,
    validFrom: defaultCatalogValidFrom(year),
    validFromTouched: false,
    fileName: '',
    items: [],
    errors: [],
    previousItems: [],
    diff: null,
    parsed: false
  };
  renderUploadModal();
}

function closeUploadCatalogModal() {
  const root = document.getElementById('catalog-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', handleCatalogModalEscape);
  uploadModalState = null;
}

const handleCatalogModalEscape = createModalEscapeHandler(
  () => document.getElementById('catalog-modal-card'),
  () => catalogModalFormSnapshot,
  closeUploadCatalogModal
);

function uploadModalHtml() {
  const s = uploadModalState;

  return `
    <div class="modal-backdrop scale-in" id="catalog-modal-backdrop">
      <div class="card modal wide" id="catalog-modal-card">
        <div class="modal-header">
          <h2>Upload New Catalog</h2>
          <button class="icon-btn" id="catalog-modal-close" title="Close" aria-label="Close">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-section-grid" style="margin-bottom:16px">
            <label class="field" for="catalog-year-input">
              <span class="lbl">Year<span class="req">*</span></span>
              <input id="catalog-year-input" type="number" class="input num" value="${s.year}">
            </label>
            <label class="field" for="catalog-validfrom-input">
              <span class="lbl">Valid From<span class="req">*</span></span>
              <input id="catalog-validfrom-input" type="date" class="input" value="${s.validFrom}">
            </label>
          </div>
          <label class="field" for="catalog-file-input">
            <span class="lbl">CSV File<span class="req">*</span></span>
            <input id="catalog-file-input" type="file" accept=".csv" class="input">
          </label>
          <div id="catalog-upload-errors" class="calc-warnings hidden" style="margin-top:14px"></div>
          <div id="catalog-upload-preview"></div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="catalog-modal-cancel">Cancel</button>
          <button class="btn primary" id="catalog-modal-confirm" disabled>Confirm</button>
        </div>
      </div>
    </div>`;
}

function renderUploadModal() {
  const root = document.getElementById('catalog-modal-root');
  if (!root) return;
  root.innerHTML = uploadModalHtml();
  attachUploadModalEvents();
}

function attachUploadModalEvents() {
  const modalCard = document.getElementById('catalog-modal-card');
  catalogModalFormSnapshot = captureFormSnapshot(modalCard);
  autofocusFirstField(modalCard);

  document.getElementById('catalog-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'catalog-modal-backdrop') closeUploadCatalogModal();
  });
  document.getElementById('catalog-modal-close').addEventListener('click', closeUploadCatalogModal);
  document.getElementById('catalog-modal-cancel').addEventListener('click', closeUploadCatalogModal);
  document.getElementById('catalog-modal-confirm').addEventListener('click', handleConfirmUpload);
  document.getElementById('catalog-year-input').addEventListener('input', handleCatalogYearInput);
  document.getElementById('catalog-validfrom-input').addEventListener('input', () => {
    uploadModalState.validFromTouched = true;
  });
  document.getElementById('catalog-file-input').addEventListener('change', handleCatalogFileSelect);

  enableEnterToSubmit(modalCard, document.getElementById('catalog-modal-confirm'));
  document.addEventListener('keydown', handleCatalogModalEscape);
}

function handleCatalogYearInput(e) {
  const year = Number(e.target.value);
  uploadModalState.year = year;

  if (!uploadModalState.validFromTouched && year) {
    uploadModalState.validFrom = defaultCatalogValidFrom(year);
    const validFromInput = document.getElementById('catalog-validfrom-input');
    if (validFromInput) validFromInput.value = uploadModalState.validFrom;
  }
}

async function handleCatalogFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  uploadModalState.fileName = file.name;
  const text = await file.text();
  const { data, errors: parseErrors } = parseCSV(text);

  const validation = validateCatalogRows(data);
  uploadModalState.items = validation.items;
  uploadModalState.errors = validation.errors.concat(parseErrors.map(pe => pe.message));
  uploadModalState.parsed = true;

  const previousCatalog = catalogPageState.catalogs[0];
  uploadModalState.previousItems = previousCatalog
    ? await db.catalog_items.where('catalog_id').equals(previousCatalog.id).toArray()
    : [];

  uploadModalState.diff = diffCatalogItems(uploadModalState.items, uploadModalState.previousItems);

  renderUploadPreviewSection();
  updateCatalogConfirmButtonState();
}

function catalogDiffBadgeHtml(code) {
  const diff = uploadModalState.diff;
  if (!diff) return '';

  if (diff.added.some(i => i.code === code)) {
    return `<span class="badge catalog-diff-new">NEW</span>`;
  }
  const changedItem = diff.changed.find(c => c.code === code);
  if (changedItem) {
    return `<span class="badge catalog-diff-changed">${formatMoney(changedItem.oldPrice)} → ${formatMoney(changedItem.newPrice)}</span>`;
  }
  return '';
}

function catalogUploadPreviewHtml() {
  const diff = uploadModalState.diff || { added: [], removed: [], changed: [] };

  return `
    <div class="catalog-upload-summary">
      <span class="catalog-diff-chip new">${diff.added.length} new</span>
      <span class="catalog-diff-chip removed">${diff.removed.length} removed</span>
      <span class="catalog-diff-chip changed">${diff.changed.length} price changed</span>
      <span class="catalog-diff-chip">${uploadModalState.items.length} total items</span>
    </div>
    <div class="tasks-table-wrap catalog-preview-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Category</th>
            <th class="num-col">Price</th>
            <th style="width:150px">Diff</th>
          </tr>
        </thead>
        <tbody>
          ${uploadModalState.items.map(i => `
            <tr>
              <td class="mono">${escapeHtml(i.code)}</td>
              <td>${escapeHtml(i.name)}</td>
              <td>${escapeHtml(i.category || '')}</td>
              <td class="num-col num">${formatMoney(i.price)}</td>
              <td>${catalogDiffBadgeHtml(i.code)}</td>
            </tr>`).join('')}
          ${diff.removed.map(i => `
            <tr class="catalog-diff-removed-row">
              <td class="mono">${escapeHtml(i.code)}</td>
              <td>${escapeHtml(i.name)}</td>
              <td>${escapeHtml(i.category || '')}</td>
              <td class="num-col num">${formatMoney(i.price)}</td>
              <td><span class="badge catalog-diff-removed">REMOVED</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderUploadPreviewSection() {
  const errorsEl = document.getElementById('catalog-upload-errors');
  const previewEl = document.getElementById('catalog-upload-preview');
  if (!errorsEl || !previewEl) return;

  if (uploadModalState.errors.length > 0) {
    errorsEl.classList.remove('hidden');
    const shown = uploadModalState.errors.slice(0, 12);
    const remaining = uploadModalState.errors.length - shown.length;
    errorsEl.innerHTML = shown.map(msg =>
      `<div class="calc-warning">${iconSvg('warn', 14)}<span>${escapeHtml(msg)}</span></div>`
    ).join('') + (remaining > 0 ? `<div class="calc-warning">${iconSvg('warn', 14)}<span>+ ${remaining} more error${remaining === 1 ? '' : 's'}</span></div>` : '');
  } else {
    errorsEl.classList.add('hidden');
    errorsEl.innerHTML = '';
  }

  previewEl.innerHTML = uploadModalState.items.length > 0 ? catalogUploadPreviewHtml() : '';
}

function updateCatalogConfirmButtonState() {
  const btn = document.getElementById('catalog-modal-confirm');
  if (!btn) return;
  const valid = uploadModalState.parsed && uploadModalState.errors.length === 0 && uploadModalState.items.length > 0;
  btn.disabled = !valid;
}

async function handleConfirmUpload() {
  const year = Number(document.getElementById('catalog-year-input').value);
  const validFrom = document.getElementById('catalog-validfrom-input').value;

  if (!year || year < 2000 || year > 2100) {
    showToast('Enter a valid year.', 'error');
    return;
  }
  if (!validFrom) {
    showToast('Enter a valid "Valid From" date.', 'error');
    return;
  }
  if (!uploadModalState.parsed || uploadModalState.items.length === 0 || uploadModalState.errors.length > 0) {
    showToast('Fix validation errors before saving.', 'error');
    return;
  }

  const btn = document.getElementById('catalog-modal-confirm');
  try {
    setButtonLoading(btn, true);
    await saveCatalog({ year, validFrom, items: uploadModalState.items });
    showToast(`Catalog for ${year} uploaded — ${uploadModalState.items.length} items.`, 'success');
    closeUploadCatalogModal();
    await renderCatalogSettings(catalogPageState.containerId);
  } catch (err) {
    showToast('Could not save the price catalog. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

/* ==========================================================================
   General Stream — CSV upload, storage, lookup (CLAUDE.md Stage 4.2)
   ========================================================================== */

async function getAllStreamGenerations() {
  const rows = await db.general_streams.toArray();
  const groups = new Map();

  rows.forEach(r => {
    const key = new Date(r.valid_from).toISOString();
    if (!groups.has(key)) groups.set(key, { year: r.year, valid_from: r.valid_from, items: [] });
    groups.get(key).items.push(r);
  });

  return Array.from(groups.values()).sort((a, b) => new Date(b.valid_from) - new Date(a.valid_from));
}

async function getActiveStreamGeneration(dateValue) {
  const generations = await getAllStreamGenerations();
  if (generations.length === 0) return null;

  const priceDate = dateValue ? new Date(dateValue) : new Date();
  const eligible = generations.filter(g => new Date(g.valid_from) <= priceDate);
  const pool = eligible.length > 0 ? eligible : generations;
  return pool.reduce((latest, g) => new Date(g.valid_from) > new Date(latest.valid_from) ? g : latest);
}

async function getActiveStreamNames(dateValue) {
  const generation = await getActiveStreamGeneration(dateValue);
  if (!generation) return { items: [], warning: 'no_stream_list' };
  return { items: generation.items.filter(i => i.is_active), warning: null };
}

function validateStreamRows(rows) {
  if (!rows || rows.length === 0) {
    return { valid: false, errors: ['CSV file has no data rows.'], items: [] };
  }

  const headerKeys = Object.keys(rows[0]);
  const match = headerKeys.find(k => k.trim().toLowerCase() === 'stream_name');
  if (!match) {
    return { valid: false, errors: ['Missing required column: stream_name'], items: [] };
  }

  const errors = [];
  const items = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const name = String(row[match] ?? '').trim();
    if (!name) {
      errors.push(`Row ${rowNum}: missing stream_name.`);
      return;
    }
    items.push({ stream_name: name });
  });

  const seen = new Set();
  const duplicates = new Set();
  items.forEach(i => {
    if (seen.has(i.stream_name)) duplicates.add(i.stream_name);
    seen.add(i.stream_name);
  });
  if (duplicates.size > 0) {
    errors.push(`Duplicate stream name${duplicates.size > 1 ? 's' : ''}: ${Array.from(duplicates).join(', ')}`);
  }

  return { valid: errors.length === 0, errors, items };
}

function diffStreamItems(newItems, previousItems) {
  const prevSet = new Set((previousItems || []).map(i => i.stream_name));
  const newSet = new Set(newItems.map(i => i.stream_name));

  const added = newItems.filter(i => !prevSet.has(i.stream_name));
  const removed = (previousItems || []).filter(i => !newSet.has(i.stream_name));

  return { added, removed };
}

async function saveStreamGeneration({ year, validFrom, items }) {
  const currentUser = getCurrentUser();

  await db.transaction('rw', db.general_streams, db.audit_log, async () => {
    await db.general_streams.bulkAdd(items.map(item => ({
      year,
      valid_from: new Date(validFrom),
      stream_name: item.stream_name,
      is_active: true
    })));
    await writeAuditLog({ user_id: currentUser.id, action: 'stream_list_uploaded', field_name: 'year', new_value: year });
  });
}

/* ==========================================================================
   Settings — General Stream page
   ========================================================================== */

let streamPageState = { generations: [], expandedKey: null, containerId: 'page-content' };
let streamUploadModalState = null;
let streamModalFormSnapshot = null;

function streamGenerationKey(g) {
  return new Date(g.valid_from).toISOString();
}

async function renderGeneralStreamSettings(containerId) {
  const user = getCurrentUser();
  if (!user) return;

  streamPageState.containerId = containerId || 'page-content';
  const container = document.getElementById(streamPageState.containerId);
  if (!container) return;

  container.innerHTML = tableSkeletonHtml(4);

  try {
    streamPageState.generations = await getAllStreamGenerations();
  } catch (err) {
    showToast('Could not load the general stream list.', 'error');
    return;
  }
  streamPageState.expandedKey = null;

  const canManage = user.role === 'project_manager';
  container.innerHTML = streamSettingsPageHtml(canManage);
  attachStreamSettingsEvents(canManage);
}

function streamSettingsPageHtml(canManage) {
  return `
    <div class="fade-in tasks-page">
      <div class="tasks-page-header">
        <div>
          <h1>General Stream</h1>
          <p class="tasks-subtitle">${streamPageState.generations.length} list${streamPageState.generations.length === 1 ? '' : 's'} uploaded</p>
        </div>
        ${canManage ? `
        <div class="tasks-page-header-actions">
          <button id="upload-stream-btn" class="btn primary">${iconSvg('add', 15)}<span>Upload New List</span></button>
        </div>` : ''}
      </div>
      <div id="stream-list-section">${streamListHtml(canManage)}</div>
      <div id="stream-modal-root"></div>
    </div>`;
}

function streamListHtml(canManage) {
  const generations = streamPageState.generations;

  if (generations.length === 0) {
    return `
      <div class="card tasks-table-wrap">
        <div class="empty-state">
          ${iconSvg('layers', 30)}
          <div class="empty-state-title">No general stream lists uploaded yet.</div>
          <div class="empty-state-desc">${canManage ? 'Click "Upload New List" to add the first stream list.' : 'Ask the PM to upload a general stream list.'}</div>
        </div>
      </div>`;
  }

  const activeGeneration = generations.length
    ? getActiveStreamGenerationSync(generations, new Date())
    : null;

  return `
    <div class="card tasks-table-wrap">
      <table class="data-table catalog-table">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th style="width:80px">Year</th>
            <th style="width:120px">Valid From</th>
            <th style="width:90px" class="num-col">Streams</th>
            <th style="width:90px">Status</th>
          </tr>
        </thead>
        <tbody>
          ${generations.map(g => streamRowHtml(g, activeGeneration && streamGenerationKey(activeGeneration) === streamGenerationKey(g))).join('')}
        </tbody>
      </table>
    </div>`;
}

function getActiveStreamGenerationSync(generations, dateValue) {
  const priceDate = dateValue ? new Date(dateValue) : new Date();
  const eligible = generations.filter(g => new Date(g.valid_from) <= priceDate);
  const pool = eligible.length > 0 ? eligible : generations;
  return pool.reduce((latest, g) => new Date(g.valid_from) > new Date(latest.valid_from) ? g : latest);
}

function streamRowHtml(generation, isActive) {
  const key = streamGenerationKey(generation);
  const expanded = streamPageState.expandedKey === key;

  const statusCell = isActive
    ? `<span class="badge status-done"><span class="badge-dot"></span>Active</span>`
    : `<span style="color:var(--ink-3)">—</span>`;

  const row = `
    <tr class="data-row catalog-row" data-stream-key="${escapeHtml(key)}">
      <td><span class="catalog-expand-icon${expanded ? ' expanded' : ''}">${iconSvg('chevRight', 14)}</span></td>
      <td class="mono">${generation.year}</td>
      <td class="mono">${formatDate(generation.valid_from)}</td>
      <td class="num-col num">${generation.items.length}</td>
      <td>${statusCell}</td>
    </tr>`;

  const expandedRow = expanded
    ? `<tr class="catalog-items-row"><td colspan="5">${streamItemsListHtml(generation.items)}</td></tr>`
    : '';

  return row + expandedRow;
}

function streamItemsListHtml(items) {
  if (items.length === 0) {
    return `<div class="catalog-items-wrap"><span style="color:var(--ink-3);font-size:13px">No stream names in this list.</span></div>`;
  }

  return `
    <div class="catalog-items-wrap">
      <div class="stream-chip-list">
        ${items.map(i => `<span class="stream-chip">${escapeHtml(i.stream_name)}</span>`).join('')}
      </div>
    </div>`;
}

function attachStreamSettingsEvents(canManage) {
  if (canManage) {
    document.getElementById('upload-stream-btn')?.addEventListener('click', openUploadStreamModal);
  }
  attachStreamListEvents();
}

function attachStreamListEvents() {
  const section = document.getElementById('stream-list-section');
  if (!section) return;

  section.querySelectorAll('.catalog-row').forEach(row => {
    row.addEventListener('click', () => toggleStreamExpand(row.dataset.streamKey));
  });
}

function toggleStreamExpand(key) {
  streamPageState.expandedKey = streamPageState.expandedKey === key ? null : key;

  const user = getCurrentUser();
  const canManage = user.role === 'project_manager';
  const section = document.getElementById('stream-list-section');
  if (section) {
    section.innerHTML = streamListHtml(canManage);
    attachStreamListEvents();
  }
}

/* ==========================================================================
   Upload stream modal
   ========================================================================== */

function openUploadStreamModal() {
  const year = new Date().getFullYear();
  streamUploadModalState = {
    year,
    validFrom: defaultCatalogValidFrom(year),
    validFromTouched: false,
    fileName: '',
    items: [],
    errors: [],
    previousItems: [],
    diff: null,
    parsed: false
  };
  renderStreamUploadModal();
}

function closeUploadStreamModal() {
  const root = document.getElementById('stream-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', handleStreamModalEscape);
  streamUploadModalState = null;
}

const handleStreamModalEscape = createModalEscapeHandler(
  () => document.getElementById('stream-modal-card'),
  () => streamModalFormSnapshot,
  closeUploadStreamModal
);

function streamUploadModalHtml() {
  const s = streamUploadModalState;

  return `
    <div class="modal-backdrop scale-in" id="stream-modal-backdrop">
      <div class="card modal wide" id="stream-modal-card">
        <div class="modal-header">
          <h2>Upload New Stream List</h2>
          <button class="icon-btn" id="stream-modal-close" title="Close" aria-label="Close">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-section-grid" style="margin-bottom:16px">
            <label class="field" for="stream-year-input">
              <span class="lbl">Year<span class="req">*</span></span>
              <input id="stream-year-input" type="number" class="input num" value="${s.year}">
            </label>
            <label class="field" for="stream-validfrom-input">
              <span class="lbl">Valid From<span class="req">*</span></span>
              <input id="stream-validfrom-input" type="date" class="input" value="${s.validFrom}">
            </label>
          </div>
          <label class="field" for="stream-file-input">
            <span class="lbl">CSV File<span class="req">*</span></span>
            <input id="stream-file-input" type="file" accept=".csv" class="input">
          </label>
          <div id="stream-upload-errors" class="calc-warnings hidden" style="margin-top:14px"></div>
          <div id="stream-upload-preview"></div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="stream-modal-cancel">Cancel</button>
          <button class="btn primary" id="stream-modal-confirm" disabled>Confirm</button>
        </div>
      </div>
    </div>`;
}

function renderStreamUploadModal() {
  const root = document.getElementById('stream-modal-root');
  if (!root) return;
  root.innerHTML = streamUploadModalHtml();
  attachStreamUploadModalEvents();
}

function attachStreamUploadModalEvents() {
  const modalCard = document.getElementById('stream-modal-card');
  streamModalFormSnapshot = captureFormSnapshot(modalCard);
  autofocusFirstField(modalCard);

  document.getElementById('stream-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'stream-modal-backdrop') closeUploadStreamModal();
  });
  document.getElementById('stream-modal-close').addEventListener('click', closeUploadStreamModal);
  document.getElementById('stream-modal-cancel').addEventListener('click', closeUploadStreamModal);
  document.getElementById('stream-modal-confirm').addEventListener('click', handleConfirmStreamUpload);
  document.getElementById('stream-year-input').addEventListener('input', handleStreamYearInput);
  document.getElementById('stream-validfrom-input').addEventListener('input', () => {
    streamUploadModalState.validFromTouched = true;
  });
  document.getElementById('stream-file-input').addEventListener('change', handleStreamFileSelect);

  enableEnterToSubmit(modalCard, document.getElementById('stream-modal-confirm'));
  document.addEventListener('keydown', handleStreamModalEscape);
}

function handleStreamYearInput(e) {
  const year = Number(e.target.value);
  streamUploadModalState.year = year;

  if (!streamUploadModalState.validFromTouched && year) {
    streamUploadModalState.validFrom = defaultCatalogValidFrom(year);
    const validFromInput = document.getElementById('stream-validfrom-input');
    if (validFromInput) validFromInput.value = streamUploadModalState.validFrom;
  }
}

async function handleStreamFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  streamUploadModalState.fileName = file.name;
  const text = await file.text();
  const { data, errors: parseErrors } = parseCSV(text);

  const validation = validateStreamRows(data);
  streamUploadModalState.items = validation.items;
  streamUploadModalState.errors = validation.errors.concat(parseErrors.map(pe => pe.message));
  streamUploadModalState.parsed = true;

  const previousGeneration = streamPageState.generations[0];
  streamUploadModalState.previousItems = previousGeneration ? previousGeneration.items : [];
  streamUploadModalState.diff = diffStreamItems(streamUploadModalState.items, streamUploadModalState.previousItems);

  renderStreamUploadPreviewSection();
  updateStreamConfirmButtonState();
}

function streamDiffBadgeHtml(name) {
  const diff = streamUploadModalState.diff;
  if (!diff) return '';
  if (diff.added.some(i => i.stream_name === name)) {
    return `<span class="badge catalog-diff-new">NEW</span>`;
  }
  return '';
}

function streamUploadPreviewHtml() {
  const diff = streamUploadModalState.diff || { added: [], removed: [] };

  return `
    <div class="catalog-upload-summary">
      <span class="catalog-diff-chip new">${diff.added.length} new</span>
      <span class="catalog-diff-chip removed">${diff.removed.length} removed</span>
      <span class="catalog-diff-chip">${streamUploadModalState.items.length} total streams</span>
    </div>
    <div class="tasks-table-wrap catalog-preview-table-wrap">
      <table class="data-table">
        <thead><tr><th>Stream Name</th><th style="width:100px">Diff</th></tr></thead>
        <tbody>
          ${streamUploadModalState.items.map(i => `
            <tr>
              <td>${escapeHtml(i.stream_name)}</td>
              <td>${streamDiffBadgeHtml(i.stream_name)}</td>
            </tr>`).join('')}
          ${diff.removed.map(i => `
            <tr class="catalog-diff-removed-row">
              <td>${escapeHtml(i.stream_name)}</td>
              <td><span class="badge catalog-diff-removed">REMOVED</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderStreamUploadPreviewSection() {
  const errorsEl = document.getElementById('stream-upload-errors');
  const previewEl = document.getElementById('stream-upload-preview');
  if (!errorsEl || !previewEl) return;

  if (streamUploadModalState.errors.length > 0) {
    errorsEl.classList.remove('hidden');
    const shown = streamUploadModalState.errors.slice(0, 12);
    const remaining = streamUploadModalState.errors.length - shown.length;
    errorsEl.innerHTML = shown.map(msg =>
      `<div class="calc-warning">${iconSvg('warn', 14)}<span>${escapeHtml(msg)}</span></div>`
    ).join('') + (remaining > 0 ? `<div class="calc-warning">${iconSvg('warn', 14)}<span>+ ${remaining} more error${remaining === 1 ? '' : 's'}</span></div>` : '');
  } else {
    errorsEl.classList.add('hidden');
    errorsEl.innerHTML = '';
  }

  previewEl.innerHTML = streamUploadModalState.items.length > 0 ? streamUploadPreviewHtml() : '';
}

function updateStreamConfirmButtonState() {
  const btn = document.getElementById('stream-modal-confirm');
  if (!btn) return;
  const valid = streamUploadModalState.parsed && streamUploadModalState.errors.length === 0 && streamUploadModalState.items.length > 0;
  btn.disabled = !valid;
}

async function handleConfirmStreamUpload() {
  const year = Number(document.getElementById('stream-year-input').value);
  const validFrom = document.getElementById('stream-validfrom-input').value;

  if (!year || year < 2000 || year > 2100) {
    showToast('Enter a valid year.', 'error');
    return;
  }
  if (!validFrom) {
    showToast('Enter a valid "Valid From" date.', 'error');
    return;
  }
  if (!streamUploadModalState.parsed || streamUploadModalState.items.length === 0 || streamUploadModalState.errors.length > 0) {
    showToast('Fix validation errors before saving.', 'error');
    return;
  }

  const btn = document.getElementById('stream-modal-confirm');
  try {
    setButtonLoading(btn, true);
    await saveStreamGeneration({ year, validFrom, items: streamUploadModalState.items });
    showToast(`Stream list for ${year} uploaded — ${streamUploadModalState.items.length} streams.`, 'success');
    closeUploadStreamModal();
    await renderGeneralStreamSettings(streamPageState.containerId);
  } catch (err) {
    showToast('Could not save the general stream list. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

window.getActiveCatalogForDate = getActiveCatalogForDate;
window.getPriceForDate = getPriceForDate;
window.getLineItemOptionsForDate = getLineItemOptionsForDate;
window.getAllCatalogsSorted = getAllCatalogsSorted;
window.getCatalogTaskCount = getCatalogTaskCount;
window.validateCatalogRows = validateCatalogRows;
window.diffCatalogItems = diffCatalogItems;
window.saveCatalog = saveCatalog;
window.deleteCatalog = deleteCatalog;
window.renderCatalogSettings = renderCatalogSettings;

window.getActiveStreamGeneration = getActiveStreamGeneration;
window.getActiveStreamNames = getActiveStreamNames;
window.getAllStreamGenerations = getAllStreamGenerations;
window.validateStreamRows = validateStreamRows;
window.diffStreamItems = diffStreamItems;
window.saveStreamGeneration = saveStreamGeneration;
window.renderGeneralStreamSettings = renderGeneralStreamSettings;
