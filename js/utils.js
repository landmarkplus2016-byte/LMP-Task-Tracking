async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format: PREFIX-YYMMDDHHMMSS-seq — seq is a per-coordinator per-day counter in app_settings. IDs never change once generated.
async function generateTaskId(prefix) {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '') +
                   now.toTimeString().slice(0, 8).replace(/:/g, '');
  const today = now.toISOString().slice(0, 10);
  const seqKey = `seq_${prefix}_${today}`;
  const current = await db.app_settings.get(seqKey);
  const seq = current ? parseInt(current.value) + 1 : 1;
  await db.app_settings.put({ key: seqKey, value: String(seq), updated_at: new Date() });
  return `${prefix}-${datePart}-${seq}`;
}

function validateJobCode(jobCode, physicalSiteId, allTasks, currentTaskId) {
  const conflict = allTasks.find(t =>
    t.job_code === jobCode &&
    t.physical_site_id !== physicalSiteId &&
    t.id !== currentTaskId
  );
  if (conflict) {
    return { valid: false, error: `Job code ${jobCode} is already used for site ${conflict.physical_site_id}.` };
  }
  return { valid: true };
}

const REQUIRED_FIELDS = [
  { key: 'job_code', label: 'Job Code' },
  { key: 'tx_rf', label: 'TX/RF' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'physical_site_id', label: 'Physical Site ID' },
  { key: 'region', label: 'Region' },
  { key: 'distance', label: 'Distance' },
  { key: 'absolute_quantity', label: 'Absolute Quantity' },
  { key: 'actual_quantity', label: 'Actual Quantity' },
  { key: 'task_name', label: 'Task Name' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'engineer_name', label: "Engineer's Name" },
  { key: 'line_item_code', label: 'Line Item' },
  { key: 'status', label: 'Status' },
  { key: 'general_stream', label: 'General Stream' }
];

function validateRequiredFields(formData) {
  const errors = {};
  for (const field of REQUIRED_FIELDS) {
    const value = formData[field.key];
    const isEmpty = value === null || value === undefined ||
      (typeof value === 'string' && value.trim() === '');
    if (isEmpty) {
      errors[field.key] = `${field.label} is required.`;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateISO(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === '' || isNaN(amount)) return null;
  return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parseCSV(csvString) {
  const result = window.Papa.parse(csvString, { header: true, skipEmptyLines: true });
  return { data: result.data, errors: result.errors };
}

const TOAST_ICONS = { success: 'check', error: 'close', warning: 'warn', info: 'check' };

function showToast(message, type, duration) {
  const toastType = type || 'info';
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${toastType} scale-in`;
  toast.innerHTML = `
    <span class="toast-icon">${iconSvg(TOAST_ICONS[toastType] || 'check', 16)}</span>
    <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration || 3200);
}

window.hashPassword = hashPassword;
window.escapeHtml = escapeHtml;
window.generateTaskId = generateTaskId;
window.validateJobCode = validateJobCode;
window.validateRequiredFields = validateRequiredFields;
window.formatDate = formatDate;
window.formatDateISO = formatDateISO;
window.formatMoney = formatMoney;
window.parseCSV = parseCSV;
window.showToast = showToast;
