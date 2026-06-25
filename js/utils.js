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

function generateTaskId(prefix) {
  return null;
}

function validateJobCode(jobCode, physicalSiteId, allTasks, currentTaskId) {
  return { valid: true };
}

function formatDate(date) {
  return '';
}

function formatMoney(amount) {
  return '';
}

function parseCSV(text) {
  return [];
}

window.hashPassword = hashPassword;
window.escapeHtml = escapeHtml;
window.generateTaskId = generateTaskId;
window.validateJobCode = validateJobCode;
window.formatDate = formatDate;
window.formatMoney = formatMoney;
window.parseCSV = parseCSV;
