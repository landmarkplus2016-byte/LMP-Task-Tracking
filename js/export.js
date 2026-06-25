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

  COORDINATOR_EXCEL_COLUMNS.forEach((col, colIdx) => {
    const headerCell = ws[window.XLSX.utils.encode_cell({ r: 0, c: colIdx })];
    if (headerCell) {
      headerCell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E6E8EC' } } };
    }
  });

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

  ws['!cols'] = COORDINATOR_EXCEL_COLUMNS.map((col, idx) => {
    const maxLen = rows.reduce((max, row) => Math.max(max, String(row[idx] ?? '').length), col.label.length);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });

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

window.exportCoordinatorJSON = exportCoordinatorJSON;
window.exportCoordinatorExcel = exportCoordinatorExcel;
window.exportCoordinatorTasks = exportCoordinatorJSON;
