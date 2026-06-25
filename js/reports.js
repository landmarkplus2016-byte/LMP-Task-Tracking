const REPORT_COLORS = {
  done: '#16a34a',
  assigned: '#2563eb',
  cancelled: '#dc2626',
  lmp: '#2563eb',
  contractor: '#a78bfa',
  huawei: '#e11d48',
  ericsson: '#0e7490',
  grid: '#eef0f3'
};

if (window.Chart) {
  window.Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
  window.Chart.defaults.color = '#475569';
}

function cssVar(name, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

/* ==========================================================================
   Custom HTML tooltip — matches .card (white bg, 1px border, shadow-lg, radius-sm)
   Chart.js canvas tooltips can't render CSS box-shadow, so we render a real DOM node.
   ========================================================================== */

function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  let el = document.getElementById('chartjs-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chartjs-tooltip';
    el.className = 'chartjs-tooltip';
    document.body.appendChild(el);
  }

  if (tooltip.opacity === 0) {
    el.style.opacity = 0;
    return;
  }

  const titleLines = tooltip.title || [];
  const bodyLines = tooltip.body ? tooltip.body.map(b => b.lines).flat() : [];

  let html = titleLines.map(t => `<div class="chartjs-tooltip-title">${escapeHtml(t)}</div>`).join('');
  html += bodyLines.map((line, i) => {
    const colors = (tooltip.labelColors && tooltip.labelColors[i]) || {};
    return `<div class="chartjs-tooltip-row"><span class="chartjs-tooltip-dot" style="background:${colors.backgroundColor || '#999'}"></span>${escapeHtml(line)}</div>`;
  }).join('');

  el.innerHTML = html;

  const rect = chart.canvas.getBoundingClientRect();
  el.style.opacity = 1;
  el.style.left = `${rect.left + window.scrollX + tooltip.caretX}px`;
  el.style.top = `${rect.top + window.scrollY + tooltip.caretY}px`;
}

function tooltipOptions(callbacks) {
  return { enabled: false, external: externalTooltipHandler, callbacks: callbacks || {} };
}

function reportAxisOptions(extra) {
  return Object.assign({
    grid: { color: REPORT_COLORS.grid, drawBorder: false },
    ticks: { color: cssVar('--ink-3', '#94a3b8'), font: { size: 11 } }
  }, extra || {});
}

function reportLegendOptions(extra) {
  return Object.assign({
    position: 'bottom',
    labels: { color: cssVar('--ink-2', '#475569'), font: { size: 11.5 }, boxWidth: 10, padding: 12 }
  }, extra || {});
}

/* ==========================================================================
   Data helpers
   ========================================================================== */

let reportsCache = [];
let reportCharts = {};

function destroyReportCharts() {
  Object.values(reportCharts).forEach(c => c && c.destroy());
  reportCharts = {};
}

function isDoneNoAcceptance(t) {
  return t.status === 'Done' && !t.acceptance_status;
}

function sumField(tasks, field) {
  return round2(tasks.reduce((sum, t) => sum + (Number(t[field]) || 0), 0));
}

function inReportDateRange(task, filters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  if (!task.done_date) return false;

  const d = new Date(task.done_date).getTime();
  if (filters.dateFrom && d < new Date(filters.dateFrom).getTime()) return false;
  if (filters.dateTo && d > new Date(filters.dateTo).getTime() + (24 * 60 * 60 * 1000 - 1)) return false;
  return true;
}

function getFilteredReportTasks(filters) {
  return reportsCache.filter(t => {
    if (!inReportDateRange(t, filters)) return false;
    if (filters.coordinator && t.coordinator_name !== filters.coordinator) return false;
    if (filters.region && t.region !== filters.region) return false;
    if (filters.vendor && t.vendor !== filters.vendor) return false;
    if (filters.status && t.status !== filters.status) return false;
    return true;
  });
}

function distinctReportValues(field) {
  return Array.from(new Set(reportsCache.map(t => t[field]).filter(Boolean))).sort();
}

function computeKpis(tasks) {
  const total = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'Done');
  const doneCount = doneTasks.length;
  const pctComplete = total ? round2((doneCount / total) * 100) : 0;
  const totalValueDone = sumField(doneTasks, 'new_total_price');
  const pendingInvoicing = sumField(tasks.filter(isDoneNoAcceptance), 'new_total_price');
  return { total, doneCount, pctComplete, totalValueDone, pendingInvoicing };
}

function computeFinancial(tasks) {
  const doneTasks = tasks.filter(t => t.status === 'Done');
  const invoicedValue = sumField(doneTasks.filter(t => t.vf_invoice_no), 'new_total_price');
  const pendingInvoicing = sumField(tasks.filter(isDoneNoAcceptance), 'new_total_price');
  const lmpTotal = sumField(doneTasks, 'lmp_portion');
  const contractorTotal = sumField(doneTasks, 'contractor_portion');
  return { invoicedValue, pendingInvoicing, lmpTotal, contractorTotal };
}

function computeDataQuality(tasks) {
  const missingPrice = tasks.filter(t => t.price_snapshot === null || t.price_snapshot === undefined).length;
  const doneNoAcceptance = tasks.filter(isDoneNoAcceptance).length;
  return { missingPrice, doneNoAcceptance };
}

function groupByStatusCounts(tasks) {
  const counts = { Done: 0, Assigned: 0, Cancelled: 0 };
  tasks.forEach(t => { if (Object.prototype.hasOwnProperty.call(counts, t.status)) counts[t.status]++; });
  return counts;
}

function last12MonthsMeta() {
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      year: d.getFullYear(),
      month: d.getMonth()
    });
  }
  return months;
}

function monthlyCompletionTrend(tasks) {
  const months = last12MonthsMeta();
  const doneTasks = tasks.filter(t => t.status === 'Done' && t.done_date);
  const counts = months.map(m => doneTasks.filter(t => {
    const d = new Date(t.done_date);
    return d.getFullYear() === m.year && d.getMonth() === m.month;
  }).length);
  return { labels: months.map(m => m.label), counts };
}

function monthlyInvoicingTrend(tasks) {
  const months = last12MonthsMeta();
  const invoiced = tasks.filter(t => t.vf_invoice_submission_date);
  const values = months.map(m => sumField(invoiced.filter(t => {
    const d = new Date(t.vf_invoice_submission_date);
    return d.getFullYear() === m.year && d.getMonth() === m.month;
  }), 'new_total_price'));
  return { labels: months.map(m => m.label), values };
}

function groupByCoordinator(tasks) {
  const map = new Map();
  tasks.forEach(t => {
    const name = t.coordinator_name || 'Unknown';
    if (!map.has(name)) map.set(name, { count: 0, value: 0 });
    const entry = map.get(name);
    entry.count++;
    entry.value += (t.new_total_price || 0);
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, count: v.count, value: round2(v.value) }))
    .sort((a, b) => b.count - a.count);
}

function groupByRegion(tasks) {
  return REGIONS.map(region => {
    const rows = tasks.filter(t => t.region === region);
    return { name: region, count: rows.length, value: sumField(rows, 'new_total_price') };
  });
}

function huaweiVsEricsson(tasks) {
  const huawei = tasks.filter(t => (t.vendor || '').toLowerCase() === 'huawei');
  const ericsson = tasks.filter(t => (t.vendor || '').toLowerCase() === 'ericsson');
  return {
    huawei: { count: huawei.length, value: sumField(huawei, 'new_total_price') },
    ericsson: { count: ericsson.length, value: sumField(ericsson, 'new_total_price') }
  };
}

/* ==========================================================================
   HTML builders
   ========================================================================== */

function kpiCardHtml(label, value, footer, icon, color) {
  return `
    <div class="card kpi-card">
      <div class="kpi-card-header">
        <span class="kpi-label">${escapeHtml(label)}</span>
        <span class="kpi-icon" style="background:${color}14;color:${color}">${iconSvg(icon, 15)}</span>
      </div>
      <div class="kpi-value mono">${escapeHtml(value)}</div>
      <div class="kpi-footer">${escapeHtml(footer)}</div>
    </div>`;
}

function dataTableHtml(headers, rows) {
  if (rows.length === 0) {
    return `<div class="empty-state-desc" style="padding:10px 0">No data for current filters.</div>`;
  }
  return `
    <table class="data-table">
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr class="data-row">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

function chartCardHtml(title, canvasId, tableId, headers, rows, extraClass) {
  return `
    <div class="card chart-card${extraClass ? ' ' + extraClass : ''}">
      <div class="chart-card-header">
        <span class="chart-card-title">${escapeHtml(title)}</span>
        <button class="btn ghost sm view-data-toggle" data-target="${tableId}"><span>View data</span>${iconSvg('chevDown', 12)}</button>
      </div>
      <div class="chart-card-canvas-wrap"><canvas id="${canvasId}"></canvas></div>
      <div class="chart-data-table-wrap hidden" id="${tableId}">${dataTableHtml(headers, rows)}</div>
    </div>`;
}

function dqRowHtml(label, count, quickFilter) {
  return `
    <div class="dq-row" data-quick-filter="${quickFilter}">
      <span class="dq-row-label">${escapeHtml(label)}</span>
      <span class="dq-row-right">
        <span class="badge" style="color:var(--amber);background:var(--amber-bg)">${count}</span>
        ${iconSvg('chevRight', 14)}
      </span>
    </div>`;
}

/* ==========================================================================
   Chart builders
   ========================================================================== */

function renderStatusDonutChart(counts) {
  const canvas = document.getElementById('chart-status');
  if (!canvas) return;
  reportCharts.status = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Done', 'Assigned', 'Cancelled'],
      datasets: [{ data: [counts.Done, counts.Assigned, counts.Cancelled], backgroundColor: [REPORT_COLORS.done, REPORT_COLORS.assigned, REPORT_COLORS.cancelled], borderWidth: 0 }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: reportLegendOptions(), tooltip: tooltipOptions() }
    }
  });
}

function renderMonthlyTrendChart(trend) {
  const canvas = document.getElementById('chart-monthly-trend');
  if (!canvas) return;
  const accent = cssVar('--accent', '#2563eb');
  reportCharts.monthlyTrend = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: trend.labels,
      datasets: [{
        label: 'Done Tasks',
        data: trend.counts,
        borderColor: accent,
        backgroundColor: `${accent}2e`,
        fill: true,
        tension: 0.35,
        pointRadius: 2.4,
        pointBackgroundColor: accent
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { x: reportAxisOptions(), y: reportAxisOptions({ beginAtZero: true }) },
      plugins: { legend: { display: false }, tooltip: tooltipOptions() }
    }
  });
}

function renderGroupedBarChart(canvasId, names, counts, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const accent = cssVar('--accent', '#2563eb');
  return new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [
        { label: 'Count', data: counts, backgroundColor: accent, yAxisID: 'y' },
        { label: 'Value (EGP)', data: values, backgroundColor: REPORT_COLORS.contractor, yAxisID: 'y1' }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: reportAxisOptions({ grid: { display: false } }),
        y: reportAxisOptions({ position: 'left', beginAtZero: true }),
        y1: reportAxisOptions({ position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } })
      },
      plugins: { legend: reportLegendOptions(), tooltip: tooltipOptions() }
    }
  });
}

function renderVendorPieChart(split) {
  const canvas = document.getElementById('chart-vendor');
  if (!canvas) return;
  reportCharts.vendor = new window.Chart(canvas, {
    type: 'pie',
    data: {
      labels: ['Huawei', 'Ericsson'],
      datasets: [{ data: [split.huawei.count, split.ericsson.count], backgroundColor: [REPORT_COLORS.huawei, REPORT_COLORS.ericsson] }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: reportLegendOptions(),
        tooltip: tooltipOptions({
          label(ctx) {
            const data = ctx.label === 'Huawei' ? split.huawei : split.ericsson;
            return `${ctx.label}: ${data.count} task${data.count === 1 ? '' : 's'} · ${formatMoney(data.value) || 0} EGP`;
          }
        })
      }
    }
  });
}

function renderInvoicingTrendChart(trend) {
  const canvas = document.getElementById('chart-invoicing-trend');
  if (!canvas) return;
  const accent = cssVar('--accent', '#2563eb');
  reportCharts.invoicingTrend = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: trend.labels,
      datasets: [{
        label: 'Invoiced (EGP)',
        data: trend.values,
        borderColor: accent,
        backgroundColor: `${accent}2e`,
        fill: true,
        tension: 0.35,
        pointRadius: 2.4,
        pointBackgroundColor: accent
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { x: reportAxisOptions(), y: reportAxisOptions({ beginAtZero: true }) },
      plugins: { legend: { display: false }, tooltip: tooltipOptions() }
    }
  });
}

function renderLmpContractorChart(financial) {
  const canvas = document.getElementById('chart-lmp-contractor');
  if (!canvas) return;
  reportCharts.lmpContractor = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Done Tasks'],
      datasets: [
        { label: 'LMP Portion', data: [financial.lmpTotal], backgroundColor: REPORT_COLORS.lmp },
        { label: 'Contractor Portion', data: [financial.contractorTotal], backgroundColor: REPORT_COLORS.contractor }
      ]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        x: reportAxisOptions({ stacked: true, beginAtZero: true }),
        y: reportAxisOptions({ stacked: true, grid: { display: false } })
      },
      plugins: { legend: reportLegendOptions(), tooltip: tooltipOptions() }
    }
  });
}

/* ==========================================================================
   Page shell + filters
   ========================================================================== */

function reportsHeaderHtml(filteredCount) {
  return `
    <div class="tasks-page-header" style="margin-bottom:14px">
      <div>
        <h1>Reports</h1>
        <p class="tasks-subtitle">${filteredCount} task${filteredCount === 1 ? '' : 's'} in current view</p>
      </div>
      <div class="tasks-page-header-actions">
        <button id="reports-export-btn" class="btn ghost sm">${iconSvg('download', 14)}<span>Export to Excel</span></button>
      </div>
    </div>`;
}

function reportsFiltersBarHtml(isPM, coordinators, vendors) {
  return `
    <div class="tasks-filters-bar reports-filters-bar">
      <input id="rpt-filter-date-from" type="date" class="input tasks-filter" title="From date (Done Date)">
      <input id="rpt-filter-date-to" type="date" class="input tasks-filter" title="To date (Done Date)">
      ${isPM ? `
      <select id="rpt-filter-coordinator" class="select tasks-filter">
        <option value="">All Coordinators</option>
        ${coordinators.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>` : ''}
      <select id="rpt-filter-region" class="select tasks-filter">
        <option value="">All Regions</option>
        ${REGIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
      <select id="rpt-filter-vendor" class="select tasks-filter">
        <option value="">All Vendors</option>
        ${vendors.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
      </select>
      <select id="rpt-filter-status" class="select tasks-filter">
        <option value="">All Status</option>
        ${STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <div class="reports-filters-actions">
        <button id="rpt-apply-btn" class="btn primary sm">Apply Filters</button>
        <button id="rpt-reset-btn" class="btn ghost sm">Reset</button>
      </div>
    </div>`;
}

function readReportFilters() {
  const coordinatorEl = document.getElementById('rpt-filter-coordinator');
  return {
    dateFrom: document.getElementById('rpt-filter-date-from').value || '',
    dateTo: document.getElementById('rpt-filter-date-to').value || '',
    coordinator: coordinatorEl ? coordinatorEl.value : '',
    region: document.getElementById('rpt-filter-region').value || '',
    vendor: document.getElementById('rpt-filter-vendor').value || '',
    status: document.getElementById('rpt-filter-status').value || ''
  };
}

function reportsBodyHtml(tasks, isPM) {
  const kpis = computeKpis(tasks);
  const statusCounts = groupByStatusCounts(tasks);
  const trend = monthlyCompletionTrend(tasks);
  const coordinatorGroups = groupByCoordinator(tasks);
  const regionGroups = groupByRegion(tasks);
  const vendorSplit = huaweiVsEricsson(tasks);
  const financial = computeFinancial(tasks);
  const invoicingTrend = monthlyInvoicingTrend(tasks);
  const dataQuality = computeDataQuality(tasks);

  const coordinatorRows = coordinatorGroups.map(c => [escapeHtml(c.name), String(c.count), formatMoney(c.value) || '0']);
  const regionRows = regionGroups.map(r => [escapeHtml(r.name), String(r.count), formatMoney(r.value) || '0']);
  const vendorRows = [
    ['Huawei', String(vendorSplit.huawei.count), formatMoney(vendorSplit.huawei.value) || '0'],
    ['Ericsson', String(vendorSplit.ericsson.count), formatMoney(vendorSplit.ericsson.value) || '0']
  ];

  const row3ChartsHtml = (isPM
    ? chartCardHtml('Tasks by Coordinator', 'chart-coordinator', 'chart-data-coordinator', ['Coordinator', 'Count', 'Value (EGP)'], coordinatorRows)
    : '') +
    chartCardHtml('Tasks by Region', 'chart-region', 'chart-data-region', ['Region', 'Count', 'Value (EGP)'], regionRows) +
    chartCardHtml('Huawei vs Ericsson', 'chart-vendor', 'chart-data-vendor', ['Vendor', 'Count', 'Value (EGP)'], vendorRows);

  return `
    <div class="kpi-grid">
      ${kpiCardHtml('Total Tasks', String(kpis.total), `${kpis.total} task${kpis.total === 1 ? '' : 's'} in view`, 'tasks', cssVar('--accent', '#2563eb'))}
      ${kpiCardHtml('Done Tasks', String(kpis.doneCount), `${kpis.pctComplete}% complete`, 'check', REPORT_COLORS.done)}
      ${kpiCardHtml('Total Value (Done)', `${formatMoney(kpis.totalValueDone) || 0} EGP`, 'Done tasks value', 'calc', cssVar('--accent', '#2563eb'))}
      ${kpiCardHtml('Pending Invoicing', `${formatMoney(kpis.pendingInvoicing) || 0} EGP`, 'Done, no acceptance status', 'warn', cssVar('--amber', '#b45309'))}
    </div>

    <div class="chart-grid-2">
      ${chartCardHtml('Tasks by Status', 'chart-status', 'chart-data-status', ['Status', 'Count'], [['Done', String(statusCounts.Done)], ['Assigned', String(statusCounts.Assigned)], ['Cancelled', String(statusCounts.Cancelled)]])}
      ${chartCardHtml('Monthly Completion Trend', 'chart-monthly-trend', 'chart-data-trend', ['Month', 'Done Tasks'], trend.labels.map((l, i) => [l, String(trend.counts[i])]))}
    </div>

    <div class="${isPM ? 'chart-grid-3' : 'chart-grid-2'}">
      ${row3ChartsHtml}
    </div>

    <div class="reports-section-title">Financial</div>
    <div class="kpi-grid kpi-grid-2">
      ${kpiCardHtml('Total Invoiced Value', `${formatMoney(financial.invoicedValue) || 0} EGP`, 'VF Invoice # filled', 'calc', cssVar('--accent', '#2563eb'))}
      ${kpiCardHtml('Total Pending Invoicing', `${formatMoney(financial.pendingInvoicing) || 0} EGP`, 'Done, no acceptance status', 'warn', cssVar('--amber', '#b45309'))}
    </div>
    <div class="chart-grid-2">
      ${chartCardHtml('Monthly Invoicing Trend', 'chart-invoicing-trend', 'chart-data-invoicing', ['Month', 'Invoiced (EGP)'], invoicingTrend.labels.map((l, i) => [l, formatMoney(invoicingTrend.values[i]) || '0']))}
      ${chartCardHtml('LMP vs Contractor Portions', 'chart-lmp-contractor', 'chart-data-lmp', ['Portion', 'Value (EGP)'], [['LMP Portion', formatMoney(financial.lmpTotal) || '0'], ['Contractor Portion', formatMoney(financial.contractorTotal) || '0']])}
    </div>

    ${isPM ? `
    <div class="reports-section-title">Data Quality</div>
    <div class="card data-quality-card">
      ${dqRowHtml('Tasks with missing price', dataQuality.missingPrice, 'missing_price')}
      ${dqRowHtml('Done but no acceptance status', dataQuality.doneNoAcceptance, 'done_no_acceptance')}
    </div>` : ''}`;
}

/* ==========================================================================
   Render orchestration
   ========================================================================== */

function attachViewDataToggles() {
  document.querySelectorAll('.view-data-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      target.classList.toggle('hidden');
      btn.classList.toggle('active');
    });
  });
}

function attachDataQualityLinks() {
  document.querySelectorAll('.dq-row').forEach(row => {
    row.addEventListener('click', () => {
      masterTableState.quickFilter = row.dataset.quickFilter;
      navigateTo('#tasks');
    });
  });
}

function renderReportCharts(tasks, isPM) {
  destroyReportCharts();

  renderStatusDonutChart(groupByStatusCounts(tasks));
  renderMonthlyTrendChart(monthlyCompletionTrend(tasks));

  if (isPM) {
    const coordinatorGroups = groupByCoordinator(tasks);
    reportCharts.coordinator = renderGroupedBarChart('chart-coordinator', coordinatorGroups.map(c => c.name), coordinatorGroups.map(c => c.count), coordinatorGroups.map(c => c.value));
  }

  const regionGroups = groupByRegion(tasks);
  reportCharts.region = renderGroupedBarChart('chart-region', regionGroups.map(r => r.name), regionGroups.map(r => r.count), regionGroups.map(r => r.value));

  renderVendorPieChart(huaweiVsEricsson(tasks));
  renderInvoicingTrendChart(monthlyInvoicingTrend(tasks));
  renderLmpContractorChart(computeFinancial(tasks));
}

function refreshReportsBody(isPM) {
  const filters = readReportFilters();
  const tasks = getFilteredReportTasks(filters);

  const headerSubtitle = document.querySelector('.tasks-subtitle');
  if (headerSubtitle) headerSubtitle.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} in current view`;

  const body = document.getElementById('reports-body');
  body.innerHTML = reportsBodyHtml(tasks, isPM);

  attachViewDataToggles();
  if (isPM) attachDataQualityLinks();
  renderReportCharts(tasks, isPM);
}

function resetReportFilters(isPM) {
  document.getElementById('rpt-filter-date-from').value = '';
  document.getElementById('rpt-filter-date-to').value = '';
  if (isPM) document.getElementById('rpt-filter-coordinator').value = '';
  document.getElementById('rpt-filter-region').value = '';
  document.getElementById('rpt-filter-vendor').value = '';
  document.getElementById('rpt-filter-status').value = '';
  refreshReportsBody(isPM);
}

function triggerReportsExport() {
  exportMasterExcel(readReportFilters());
}

async function renderReports() {
  const user = getCurrentUser();
  if (!user || !MASTER_ROLES.includes(user.role)) return;

  const isPM = user.role === 'project_manager';
  reportsCache = await getAllTasks();

  const coordinators = distinctReportValues('coordinator_name');
  const vendors = distinctReportValues('vendor');

  const container = document.getElementById('page-content');
  container.innerHTML = `
    <div class="fade-in reports-page">
      ${reportsHeaderHtml(reportsCache.length)}
      ${reportsFiltersBarHtml(isPM, coordinators, vendors)}
      <div id="reports-body"></div>
    </div>`;

  document.getElementById('reports-export-btn').addEventListener('click', triggerReportsExport);
  document.getElementById('rpt-apply-btn').addEventListener('click', () => refreshReportsBody(isPM));
  document.getElementById('rpt-reset-btn').addEventListener('click', () => resetReportFilters(isPM));

  refreshReportsBody(isPM);
}

window.renderReports = renderReports;
