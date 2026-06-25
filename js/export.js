const COORDINATOR_EXCEL_COLUMNS = [
  { key: 'id', label: 'ID #' },
  { key: 'job_code', label: 'Job Code' },
  { key: 'tx_rf', label: 'TX/RF' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'physical_site_id', label: 'Physical Site ID' },
  { key: 'logical_site_id', label: 'Logical Site ID' },
  { key: 'site_option', label: 'Site Option' },
  { key: 'facing', label: 'Facing' },
  { key: 'region', label: 'Region' },
  { key: 'sub_region', label: 'Sub Region' },
  { key: 'distance', label: 'Distance' },
  { key: 'absolute_quantity', label: 'Absolute Quantity', type: 'number' },
  { key: 'actual_quantity', label: 'Actual Quantity', type: 'number' },
  { key: 'main_task', label: 'Main Task' },
  { key: 'task_name', label: 'Task Name' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'engineer_name', label: "Engineer's Name" },
  { key: 'line_item_code', label: 'Line Item' },
  { key: 'new_price', label: 'New Price', type: 'number' },
  { key: 'new_total_price', label: 'New Total Price (EGP)', type: 'number' },
  { key: 'status', label: 'Status' },
  { key: 'task_date', label: 'Task Date', type: 'date' },
  { key: 'done_date', label: 'Done Date', type: 'date' },
  { key: 'vf_task_owner', label: 'VF Task Owner' },
  { key: 'prq', label: 'PRQ' },
  { key: 'pc', label: 'PC' },
  { key: 'general_stream', label: 'General Stream' },
  { key: 'comments', label: 'Comments' }
];

const STATUS_FILL_COLORS = { Done: 'E8F6ED', Assigned: 'E7EFFD', Cancelled: 'FDEAEA' };

function sanitizeTaskForExport(task) {
  const clean = {};
  for (const key of Object.keys(task)) {
    if (PM_FIELDS.includes(key)) continue;
    clean[key] = task[key];
  }
  return clean;
}

function sanitizeFilenamePart(text) {
  return String(text || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportCoordinatorJSON() {
  const currentUser = getCurrentUser();
  const tasks = await getMyTasks(currentUser.id);
  const cleanTasks = tasks.map(sanitizeTaskForExport);

  const payload = {
    exported_at: new Date().toISOString(),
    coordinator_id: currentUser.id,
    coordinator_name: currentUser.name,
    prefix: currentUser.prefix,
    version: '1.0',
    tasks: cleanTasks
  };

  const filename = `${sanitizeFilenamePart(currentUser.prefix)}_tasks_${formatDateISO(new Date())}.json`;
  downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');

  await writeAuditLog({ user_id: currentUser.id, action: 'export_created' });

  showToast(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'}. Send this file to your PM.`, 'success');
}

function autoFitColWidths(header, rows) {
  return header.map((h, idx) => {
    const maxLen = rows.reduce((max, row) => Math.max(max, String(row[idx] ?? '').length), String(h).length);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
}

function styleHeaderRow(ws, colCount, amberFlags) {
  for (let c = 0; c < colCount; c++) {
    const cell = ws[window.XLSX.utils.encode_cell({ r: 0, c })];
    if (!cell) continue;
    const isAmber = !!(amberFlags && amberFlags[c]);
    cell.s = { font: { bold: true }, fill: { fgColor: { rgb: isAmber ? 'FEF3C7' : 'E6E8EC' } } };
  }
}

function buildCoordinatorSheetData(tasks) {
  const header = COORDINATOR_EXCEL_COLUMNS.map(c => c.label);
  const rows = tasks.map(t => COORDINATOR_EXCEL_COLUMNS.map(c => {
    const val = t[c.key];
    if (c.type === 'date') return val ? formatDate(val) : '';
    if (c.type === 'number') return (val === null || val === undefined || val === '') ? null : Number(val);
    return (val === null || val === undefined) ? '' : val;
  }));
  return { header, rows };
}

function buildCoordinatorSheet(tasks) {
  const { header, rows } = buildCoordinatorSheetData(tasks);
  const ws = window.XLSX.utils.aoa_to_sheet([header, ...rows]);

  styleHeaderRow(ws, COORDINATOR_EXCEL_COLUMNS.length);

  rows.forEach((row, rowIdx) => {
    const task = tasks[rowIdx];
    COORDINATOR_EXCEL_COLUMNS.forEach((col, colIdx) => {
      const cell = ws[window.XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx })];
      if (!cell) return;
      if (col.type === 'number') cell.z = '0.00';
      if (col.key === 'status') {
        const fg = STATUS_FILL_COLORS[task.status];
        if (fg) cell.s = { fill: { fgColor: { rgb: fg } } };
      }
    });
  });

  ws['!cols'] = autoFitColWidths(header, rows);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  return ws;
}

async function exportCoordinatorExcel() {
  const currentUser = getCurrentUser();
  const tasks = await getMyTasks(currentUser.id);

  const ws = buildCoordinatorSheet(tasks);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'My Tasks');

  const filename = `${sanitizeFilenamePart(currentUser.name)}_tasks_${formatDateISO(new Date())}.xlsx`;
  window.XLSX.writeFile(wb, filename, { cellStyles: true });

  await writeAuditLog({ user_id: currentUser.id, action: 'export_created' });

  showToast(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'} to Excel.`, 'success');
}

/* ==========================================================================
   Master Excel export — PM / AM / CCM (CLAUDE.md Stage 9.2)
   ========================================================================== */

const STATUS_TEXT_COLORS = { Done: '16A34A', Assigned: '2563EB', Cancelled: 'DC2626' };

function filterTasksForExport(tasks, filters) {
  const f = filters || {};
  return tasks.filter(t => {
    if (f.dateFrom || f.dateTo) {
      if (!t.done_date) return false;
      const d = new Date(t.done_date).getTime();
      if (f.dateFrom && d < new Date(f.dateFrom).getTime()) return false;
      if (f.dateTo && d > new Date(f.dateTo).getTime() + (24 * 60 * 60 * 1000 - 1)) return false;
    }
    if (f.search) {
      const q = f.search.trim().toLowerCase();
      const hay = `${t.physical_site_id || ''} ${t.job_code || ''} ${t.task_name || ''} ${t.engineer_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status && t.status !== f.status) return false;
    if (f.region && t.region !== f.region) return false;
    if (f.vendor && t.vendor !== f.vendor) return false;
    if (f.coordinator && t.coordinator_name !== f.coordinator) return false;
    if (f.acceptanceStatus && t.acceptance_status !== f.acceptanceStatus) return false;
    if (f.txrf && t.tx_rf !== f.txrf) return false;
    if (f.quickFilter === 'missing_price' && (t.price_snapshot !== null && t.price_snapshot !== undefined)) return false;
    if (f.quickFilter === 'locked' && !t.is_locked) return false;
    if (f.quickFilter === 'done_no_acceptance' && !(t.status === 'Done' && !t.acceptance_status)) return false;
    return true;
  });
}

function masterExcelColumnDefs() {
  return ALL_MASTER_COLUMNS.map(col => ({
    key: col.key,
    label: col.label,
    kind: (col.type === 'money' || col.type === 'num') ? 'number' : (col.type === 'date' ? 'date' : (col.type === 'badge' ? 'status' : 'text')),
    isPm: PM_FIELDS.includes(col.key)
  }));
}

function buildMasterAllTasksSheet(tasks) {
  const colDefs = masterExcelColumnDefs();
  const header = colDefs.map(c => c.label);
  const rows = tasks.map(t => colDefs.map(col => {
    const val = t[col.key];
    if (col.kind === 'date') return val ? formatDate(val) : '';
    if (col.kind === 'number') return (val === null || val === undefined || val === '') ? null : Number(val);
    return (val === null || val === undefined) ? '' : val;
  }));

  const ws = window.XLSX.utils.aoa_to_sheet([header, ...rows]);
  styleHeaderRow(ws, colDefs.length, colDefs.map(c => c.isPm));

  rows.forEach((row, rowIdx) => {
    const task = tasks[rowIdx];
    colDefs.forEach((col, colIdx) => {
      const cell = ws[window.XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx })];
      if (!cell) return;
      if (col.kind === 'number') cell.z = '0.00';
      if (col.kind === 'status') {
        const fontColor = STATUS_TEXT_COLORS[task.status];
        if (fontColor) cell.s = { font: { color: { rgb: fontColor } } };
      }
    });
  });

  ws['!cols'] = autoFitColWidths(header, rows);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  return ws;
}

function computeMasterSummary(tasks) {
  const doneTasks = tasks.filter(t => t.status === 'Done');
  const total = tasks.length;
  const doneCount = doneTasks.length;
  const pctComplete = total ? round2((doneCount / total) * 100) : 0;
  const totalValueDone = round2(doneTasks.reduce((s, t) => s + (t.new_total_price || 0), 0));
  const pendingInvoicing = round2(tasks.filter(t => t.status === 'Done' && !t.acceptance_status).reduce((s, t) => s + (t.new_total_price || 0), 0));
  const invoicedValue = round2(doneTasks.filter(t => t.vf_invoice_no).reduce((s, t) => s + (t.new_total_price || 0), 0));
  const lmpTotal = round2(doneTasks.reduce((s, t) => s + (t.lmp_portion || 0), 0));
  const contractorTotal = round2(doneTasks.reduce((s, t) => s + (t.contractor_portion || 0), 0));
  return { total, doneCount, pctComplete, totalValueDone, pendingInvoicing, invoicedValue, lmpTotal, contractorTotal };
}

function computeCoordinatorBreakdown(tasks) {
  const map = new Map();
  tasks.forEach(t => {
    const name = t.coordinator_name || 'Unknown';
    if (!map.has(name)) map.set(name, { count: 0, doneCount: 0, value: 0 });
    const entry = map.get(name);
    entry.count++;
    if (t.status === 'Done') entry.doneCount++;
    entry.value += (t.new_total_price || 0);
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, count: v.count, doneCount: v.doneCount, value: round2(v.value) }))
    .sort((a, b) => b.count - a.count);
}

function buildSummarySheet(tasks) {
  const summary = computeMasterSummary(tasks);
  const breakdown = computeCoordinatorBreakdown(tasks);

  const summaryMetricRows = [
    ['Total Tasks', summary.total],
    ['Done Tasks', summary.doneCount],
    ['% Complete', summary.pctComplete],
    ['Total Value — Done (EGP)', summary.totalValueDone],
    ['Pending Invoicing (EGP)', summary.pendingInvoicing],
    ['Total Invoiced (EGP)', summary.invoicedValue],
    ['LMP Portion Total (EGP)', summary.lmpTotal],
    ['Contractor Portion Total (EGP)', summary.contractorTotal]
  ];

  const titleRowIndex = 1 + summaryMetricRows.length + 1;
  const breakdownHeaderRowIndex = titleRowIndex + 1;
  const breakdownDataStartRowIndex = breakdownHeaderRowIndex + 1;

  const aoa = [
    ['Metric', 'Value'],
    ...summaryMetricRows,
    [],
    ['Per-Coordinator Breakdown'],
    ['Coordinator', 'Task Count', 'Done Count', 'Total Value (EGP)'],
    ...breakdown.map(b => [b.name, b.count, b.doneCount, b.value])
  ];

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);

  styleHeaderRow(ws, 2);
  for (let c = 0; c < 4; c++) {
    const cell = ws[window.XLSX.utils.encode_cell({ r: breakdownHeaderRowIndex, c })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E6E8EC' } } };
  }
  const titleCell = ws[window.XLSX.utils.encode_cell({ r: titleRowIndex, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true } };

  for (let r = 1; r <= summaryMetricRows.length; r++) {
    const cell = ws[window.XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && typeof cell.v === 'number') cell.z = '0.00';
  }
  breakdown.forEach((b, i) => {
    const cell = ws[window.XLSX.utils.encode_cell({ r: breakdownDataStartRowIndex + i, c: 3 })];
    if (cell) cell.z = '0.00';
  });

  ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  return ws;
}

async function buildAuditLogSheet() {
  const [entries, users, tasks] = await Promise.all([db.audit_log.toArray(), db.users.toArray(), db.tasks.toArray()]);
  const usersById = Object.fromEntries(users.map(u => [u.id, u.name]));
  const siteIdByTaskId = Object.fromEntries(tasks.map(t => [t.id, t.physical_site_id]));
  const sorted = entries.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const header = ['Timestamp', 'Task ID', 'Site ID', 'User', 'Action', 'Field', 'Old Value', 'New Value', 'Source File'];
  const rows = sorted.map(e => [
    importFormatDateTime(e.timestamp),
    e.task_id || '',
    siteIdByTaskId[e.task_id] || '',
    usersById[e.user_id] || '',
    auditActionLabel(e.action),
    auditFieldLabel(e.field_name),
    e.field_name ? auditFormatValue(e.field_name, e.old_value) : '',
    e.field_name ? auditFormatValue(e.field_name, e.new_value) : '',
    e.source_file || ''
  ]);

  const ws = window.XLSX.utils.aoa_to_sheet([header, ...rows]);
  styleHeaderRow(ws, header.length);
  ws['!cols'] = autoFitColWidths(header, rows);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  return ws;
}

async function runMasterExcelExport(filters, includeAuditLog) {
  const currentUser = getCurrentUser();
  const allTasks = await getAllTasks();
  const tasks = filterTasksForExport(allTasks, filters);

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, buildMasterAllTasksSheet(tasks), 'All Tasks');
  window.XLSX.utils.book_append_sheet(wb, buildSummarySheet(tasks), 'Summary');
  if (includeAuditLog) {
    window.XLSX.utils.book_append_sheet(wb, await buildAuditLogSheet(), 'Audit Log');
  }

  const filename = `project_tracker_export_${formatDateISO(new Date())}.xlsx`;
  window.XLSX.writeFile(wb, filename, { cellStyles: true });

  await writeAuditLog({ user_id: currentUser.id, action: 'export_created' });
  showToast(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'} to Excel.`, 'success');
}

function openMasterExportModal(filters) {
  const root = document.createElement('div');
  document.body.appendChild(root);

  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    root.remove();
    document.removeEventListener('keydown', escHandler);
  };

  root.innerHTML = `
    <div class="modal-backdrop scale-in" id="export-modal-backdrop">
      <div class="card modal" id="export-modal-card">
        <div class="modal-header">
          <h2>Export to Excel</h2>
          <button class="icon-btn" id="export-modal-close">${iconSvg('close', 16)}</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--ink-2);margin:0 0 14px">"All Tasks" and "Summary" sheets are always included, using the filters currently applied.</p>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="export-include-audit" style="width:15px;height:15px;accent-color:var(--accent)">
            <span class="lbl" style="margin:0">Include Audit Log sheet</span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="export-modal-cancel">Cancel</button>
          <button class="btn primary" id="export-modal-confirm">${iconSvg('download', 14)}<span>Export</span></button>
        </div>
      </div>
    </div>`;

  document.getElementById('export-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'export-modal-backdrop') close(); });
  document.getElementById('export-modal-close').addEventListener('click', close);
  document.getElementById('export-modal-cancel').addEventListener('click', close);
  document.getElementById('export-modal-confirm').addEventListener('click', async () => {
    const includeAuditLog = document.getElementById('export-include-audit').checked;
    close();
    await runMasterExcelExport(filters, includeAuditLog);
  });
  document.addEventListener('keydown', escHandler);
}

function exportMasterExcel(filters) {
  openMasterExportModal(filters || {});
}

window.exportCoordinatorJSON = exportCoordinatorJSON;
window.exportCoordinatorExcel = exportCoordinatorExcel;
window.exportCoordinatorTasks = exportCoordinatorJSON;
window.exportMasterExcel = exportMasterExcel;
