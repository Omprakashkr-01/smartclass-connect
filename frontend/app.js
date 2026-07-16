const API_BASE = 'http://localhost:5000/api';

// State management
let flagsState = [];
let scannedCount = 0;
let resolutionHistory = [];
let currentModalFlagId = null;
let anomalyChart = null;
let dailyLogsState = [];
let studentsState = [];
let currentLanguage = 'en';

// DOM Elements
const scanDateInput = document.getElementById('scan-date');
const btnScan = document.getElementById('btn-scan');
const flagsContainer = document.getElementById('flags-container');
const historyList = document.getElementById('history-list');
const toastContainer = document.getElementById('toast-container');
const navReviewConsole = document.getElementById('nav-review-console');
const navDailyLogs = document.getElementById('nav-daily-logs');
const navStudents = document.getElementById('nav-students');
const viewReviewConsole = document.getElementById('view-review-console');
const viewDailyLogs = document.getElementById('view-daily-logs');
const viewStudents = document.getElementById('view-students');
const modalStudent = document.getElementById('modal-student');

// KPI elements
const kpiScanned = document.getElementById('kpi-scanned');
const kpiAnomalies = document.getElementById('kpi-anomalies');
const kpiPending = document.getElementById('kpi-pending');
const kpiAccuracy = document.getElementById('kpi-accuracy');
const badgePendingCount = document.getElementById('badge-pending-count');

// Modal Elements
const modalResolve = document.getElementById('modal-resolve');
const modalFlagDescription = document.getElementById('modal-flag-description');
const modalStatusSelect = document.getElementById('modal-status-select');
const btnModalSubmit = document.getElementById('btn-modal-submit');

// Init
window.addEventListener('DOMContentLoaded', () => {
  // Set default date picker to current date in input if empty
  if (!scanDateInput.value) {
    scanDateInput.value = '2026-07-13';
  }

  // Event listeners
  btnScan.addEventListener('click', runScan);
  btnModalSubmit.addEventListener('click', submitCustomResolution);

  // View Switching Event Listeners
  navReviewConsole.addEventListener('click', (e) => {
    e.preventDefault();
    navReviewConsole.classList.add('active');
    navDailyLogs.classList.remove('active');
    navStudents.classList.remove('active');
    viewReviewConsole.style.display = 'block';
    viewDailyLogs.style.display = 'none';
    viewStudents.style.display = 'none';
  });
  
  navDailyLogs.addEventListener('click', (e) => {
    e.preventDefault();
    navDailyLogs.classList.add('active');
    navReviewConsole.classList.remove('active');
    navStudents.classList.remove('active');
    viewReviewConsole.style.display = 'none';
    viewDailyLogs.style.display = 'block';
    viewStudents.style.display = 'none';
    fetchDailyLogs();
  });

  navStudents.addEventListener('click', (e) => {
    e.preventDefault();
    navStudents.classList.add('active');
    navReviewConsole.classList.remove('active');
    navDailyLogs.classList.remove('active');
    viewReviewConsole.style.display = 'none';
    viewDailyLogs.style.display = 'none';
    viewStudents.style.display = 'block';
    fetchStudents();
  });

  scanDateInput.addEventListener('change', () => {
    if (viewDailyLogs.style.display === 'block') {
      fetchDailyLogs();
    } else if (viewStudents.style.display === 'block') {
      fetchStudents();
    } else {
      fetchFlags();
    }
  });

  document.getElementById('logs-search').addEventListener('input', renderDailyLogs);
  document.getElementById('students-search').addEventListener('input', renderStudents);
  
  const langSelect = document.getElementById('lang-select');
  const savedLang = localStorage.getItem('preferredLanguage') || 'en';
  if (langSelect) {
    langSelect.value = savedLang;
    langSelect.addEventListener('change', (e) => {
      applyLanguage(e.target.value);
    });
  }

  // Initialize i18next
  i18next.init({
    lng: savedLang,
    resources: i18nResources
  }, function(err, t) {
    if (err) return console.error('i18next init failed:', err);
    // Load initial data and apply default language
    fetchFlags();
    applyLanguage(savedLang);
  });
});

// Toast notifications
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'check-circle';
  if (type === 'error') icon = 'x-circle';
  if (type === 'warning') icon = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Run scanner
async function runScan() {
  const date = scanDateInput.value;
  if (!date) {
    showToast('Please select a valid date.', 'warning');
    return;
  }
  
  // Set loading state on button
  btnScan.disabled = true;
  btnScan.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Scanning...`;
  lucide.createIcons();
  
  flagsContainer.innerHTML = `
    <div class="loading-state">
      <i data-lucide="loader-2" class="spin"></i>
      <p>AI Engine is analyzing logs for ${date}...</p>
    </div>
  `;
  lucide.createIcons();
  
  try {
    const res = await fetch(`${API_BASE}/attendance/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date })
    });
    
    if (!res.ok) throw new Error('Scan failed');
    
    const data = await res.json();
    scannedCount = data.scannedStudentsCount;
    
    showToast(`AI Scan Complete. Found ${data.anomaliesCount} anomalies!`, 'success');
    
    // Refresh flags
    await fetchFlags();
    
  } catch (error) {
    showToast('Failed to trigger scan. Make sure backend is running.', 'error');
    console.error(error);
  } finally {
    btnScan.disabled = false;
    btnScan.innerHTML = `<i data-lucide="scan-line"></i> Run AI Scan`;
    lucide.createIcons();
  }
}

// Fetch flags
async function fetchFlags() {
  try {
    const res = await fetch(`${API_BASE}/flags`);
    if (!res.ok) throw new Error('Failed to fetch flags');
    
    const flags = await res.json();
    flagsState = flags;
    
    renderFlags();
    updateKPIs();
    updateChart();
    
  } catch (error) {
    flagsContainer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="server-off"></i>
        <p>Could not connect to the reconciliation service.<br>Please start the backend server.</p>
      </div>
    `;
    lucide.createIcons();
    console.error(error);
  }
}

// Update KPI Stats
function updateKPIs() {
  const unresolved = flagsState.filter(f => f.status === 'Pending');
  const resolvedCount = flagsState.filter(f => f.status === 'Resolved').length;
  const ignoredCount = flagsState.filter(f => f.status === 'Ignored').length;
  const totalAnomalies = flagsState.length;
  
  // Estimate scanned count from database state if zero
  const displayScanned = scannedCount || Math.max(5, flagsState.length + 3);
  
  kpiScanned.textContent = displayScanned;
  kpiAnomalies.textContent = totalAnomalies;
  kpiPending.textContent = unresolved.length;
  badgePendingCount.textContent = `${unresolved.length} Pending`;
  
  // Accuracy metric
  let accuracy = 100;
  if (displayScanned > 0) {
    accuracy = Math.round(((displayScanned - unresolved.length) / displayScanned) * 100);
  }
  kpiAccuracy.textContent = `${Math.max(0, accuracy)}%`;
}

// Render flagged cards
function renderFlags() {
  const pendingFlags = flagsState.filter(f => f.status === 'Pending');
  
  if (pendingFlags.length === 0) {
    flagsContainer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="sparkles" style="color: var(--color-success)"></i>
        <p>All clear! No pending anomalies requiring review.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  flagsContainer.innerHTML = '';
  
  pendingFlags.forEach(flag => {
    const card = document.createElement('div');
    card.className = 'flag-card';
    
    // Header status badge
    const badgeType = flag.issueType === 'missing' ? 'badge-missing' : 'badge-duplicate';
    
    // Details content
    let detailsHtml = '';
    if (flag.issueType === 'duplicate') {
      const records = flag.details?.records || [];
      detailsHtml = `
        <div class="flag-details border-duplicate">
          <p>${flag.details.message}</p>
          <div class="duplicate-list">
            ${records.map(r => {
              const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `
                <div class="duplicate-item">
                  <span>Log ID: <code>${r._id}</code></span>
                  <span>Status: <span class="badge-status status-${r.status.toLowerCase()}">${r.status}</span></span>
                  <span>Checked-in: ${time}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      detailsHtml = `
        <div class="flag-details border-missing">
          <p>${flag.details.message}</p>
        </div>
      `;
    }
    
    // AI Suggestion Box
    let aiBoxHtml = '';
    if (flag.aiSuggestion) {
      aiBoxHtml = `
        <div class="ai-recommendation-box">
          <div class="ai-icon">
            <i data-lucide="sparkles"></i>
          </div>
          <div class="ai-content">
            <span class="ai-title">AI Suggestion</span>
            <span class="ai-action">${flag.aiSuggestion.recommendedAction}</span>
            <span class="ai-reasoning">${flag.aiSuggestion.explanation}</span>
          </div>
        </div>
      `;
    }
    
    // Actions Group
    let actionsHtml = '';
    if (flag.aiSuggestion && flag.aiSuggestion.options) {
      flag.aiSuggestion.options.forEach(opt => {
        let btnClass = 'btn-action-resolve';
        if (opt.action === 'clarify' || opt.action === 'ignore') {
          btnClass = 'btn-action-ignore';
        }
        
        // Define click handler based on option action type
        let onClickStr = '';
        if (opt.action === 'resolve_status') {
          onClickStr = `resolveFlag('${flag._id}', 'resolve_status', '${opt.value}', '${opt.label}')`;
        } else if (opt.action === 'keep_record') {
          onClickStr = `resolveFlag('${flag._id}', 'keep_record', '${opt.value}', '${opt.label}')`;
        } else if (opt.action === 'clarify') {
          onClickStr = `openCustomResolveModal('${flag._id}', '${flag.name}')`;
        } else if (opt.action === 'delete_all') {
          onClickStr = `resolveFlag('${flag._id}', 'delete_all', null, 'Delete All Logs')`;
        }
        
        actionsHtml += `
          <button class="btn ${btnClass}" onclick="${onClickStr}">
            ${opt.label}
          </button>
        `;
      });
    }
    
    // Ignore manual action
    actionsHtml += `
      <button class="btn btn-action-ignore" onclick="resolveFlag('${flag._id}', 'ignore', null, 'Ignore Flag')">
        Ignore
      </button>
    `;
    
    card.innerHTML = `
      <div class="flag-card-header">
        <div class="student-meta">
          <h4>${flag.name}</h4>
          <span>Student ID: ${flag.studentId} | Date: ${flag.date}</span>
        </div>
        <span class="badge ${badgeType}">${flag.issueType}</span>
      </div>
      
      ${detailsHtml}
      ${aiBoxHtml}
      
      <div class="flag-actions">
        ${actionsHtml}
      </div>
    `;
    
    flagsContainer.appendChild(card);
  });
  
  lucide.createIcons();
}

// Resolve issue API caller
async function resolveFlag(flagId, action, value, actionLabel) {
  try {
    const res = await fetch(`${API_BASE}/flags/${flagId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value })
    });
    
    if (!res.ok) throw new Error('Resolution submission failed');
    
    const data = await res.json();
    showToast(data.message, 'success');
    
    // Add to resolution history list
    const resolvedFlag = flagsState.find(f => f._id === flagId);
    logResolutionHistory(resolvedFlag, actionLabel);
    
    // Refresh list
    await fetchFlags();
    
  } catch (error) {
    showToast('Failed to resolve flag.', 'error');
    console.error(error);
  }
}

// Log into resolution table
function logResolutionHistory(flag, actionLabel) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  resolutionHistory.unshift({
    name: flag.name,
    studentId: flag.studentId,
    issueType: flag.issueType,
    resolution: actionLabel,
    time: timestamp
  });
  
  renderHistory();
}

// Render history table
function renderHistory() {
  if (resolutionHistory.length === 0) {
    historyList.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">No resolutions logged in this session yet.</td>
      </tr>
    `;
    return;
  }
  
  historyList.innerHTML = '';
  
  resolutionHistory.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong style="color: var(--text-primary)">${item.name}</strong><br>
        <span style="font-size: 11px; color: var(--text-muted)">${item.studentId}</span>
      </td>
      <td>
        <span class="badge ${item.issueType === 'missing' ? 'badge-missing' : 'badge-duplicate'}">${item.issueType}</span>
      </td>
      <td>
        <span class="badge-status status-present" style="background: rgba(99, 102, 241, 0.1); color: #a5b4fc">
          ${item.resolution}
        </span>
      </td>
      <td>${item.time}</td>
    `;
    historyList.appendChild(tr);
  });
}

// Open manual modal
function openCustomResolveModal(flagId, studentName) {
  currentModalFlagId = flagId;
  modalFlagDescription.textContent = `Input custom corrected attendance status for ${studentName}:`;
  modalResolve.classList.add('active');
}

// Close manual modal
function closeModal() {
  modalResolve.classList.remove('active');
  currentModalFlagId = null;
}

// Submit manual custom resolution
async function submitCustomResolution() {
  if (!currentModalFlagId) return;
  
  const status = modalStatusSelect.value;
  closeModal();
  
  await resolveFlag(currentModalFlagId, 'resolve_status', status, `Marked as ${status} (Custom)`);
}

// Update Donut Chart representation
function updateChart() {
  const pending = flagsState.filter(f => f.status === 'Pending').length;
  const resolved = flagsState.filter(f => f.status === 'Resolved').length;
  const ignored = flagsState.filter(f => f.status === 'Ignored').length;
  const total = flagsState.length;

  document.getElementById('chart-legend').textContent = `${total} Total Issue${total !== 1 ? 's' : ''}`;

  const canvasEl = document.getElementById('anomalyChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  
  if (anomalyChart) {
    anomalyChart.destroy();
  }

  // Draw empty/all-clear state if there are no flags
  const hasData = total > 0;
  const chartData = hasData ? [pending, resolved, ignored] : [0, 1, 0];
  const chartLabels = hasData ? ['Pending', 'Resolved', 'Ignored'] : ['No Issues', 'All Clear', ''];
  const chartColors = hasData 
    ? ['#f59e0b', '#10b981', '#64748b'] 
    : ['rgba(0,0,0,0)', 'rgba(16, 185, 129, 0.15)', 'rgba(0,0,0,0)'];
  const chartBorders = hasData
    ? ['#f59e0b', '#10b981', '#64748b']
    : ['rgba(0,0,0,0)', '#10b981', 'rgba(0,0,0,0)'];

  // Ensure Chart.js is loaded
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js is not loaded yet.');
    return;
  }

  anomalyChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
        borderColor: chartBorders,
        borderWidth: 1,
        hoverOffset: hasData ? 4 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: hasData,
          callbacks: {
            label: function(context) {
              const value = context.raw;
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return ` ${context.label}: ${value} (${pct}%)`;
            }
          }
        }
      },
      cutout: '72%',
      animation: {
        animateScale: true,
        animateRotate: true
      }
    }
  });
}

// Fetch Daily Attendance Logs
async function fetchDailyLogs() {
  const date = scanDateInput.value;
  if (!date) return;
  
  const listEl = document.getElementById('daily-logs-list');
  listEl.innerHTML = `
    <tr>
      <td colspan="7" class="empty-state" style="padding: 48px; text-align: center; color: var(--text-muted);">
        <i data-lucide="loader-2" class="spin" style="width: 24px; height: 24px; margin-bottom: 12px; display: inline-block;"></i>
        <p>Loading daily logs for ${date}...</p>
      </td>
    </tr>
  `;
  lucide.createIcons();
  
  try {
    const res = await fetch(`${API_BASE}/attendance?date=${date}`);
    if (!res.ok) throw new Error('Failed to fetch daily logs');
    const logs = await res.json();
    dailyLogsState = logs;
    renderDailyLogs();
  } catch (err) {
    listEl.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state" style="padding: 48px; text-align: center; color: var(--color-error);">
          <i data-lucide="server-off" style="width: 24px; height: 24px; margin-bottom: 12px; display: inline-block; color: var(--color-danger)"></i>
          <p>Could not load daily logs. Make sure backend is running.</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    console.error(err);
  }
}

// Render Daily Attendance Logs Table
function renderDailyLogs() {
  const listEl = document.getElementById('daily-logs-list');
  if (!listEl) return;
  
  const searchQuery = document.getElementById('logs-search').value.toLowerCase().trim();
  
  let filteredLogs = dailyLogsState;
  if (searchQuery) {
    filteredLogs = dailyLogsState.filter(log => 
      log.name.toLowerCase().includes(searchQuery) || 
      log.studentId.toLowerCase().includes(searchQuery) ||
      log.status.toLowerCase().includes(searchQuery)
    );
  }
  
  if (filteredLogs.length === 0) {
    let emptyMsg = i18next.t('empty-logs-msg');
    listEl.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state" style="padding: 48px; text-align: center; color: var(--text-muted);">
          <i data-lucide="info" style="width: 24px; height: 24px; margin-bottom: 12px; display: inline-block; color: var(--text-muted);"></i>
          <p>${emptyMsg}</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }
  
  listEl.innerHTML = '';
  
  filteredLogs.forEach(log => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    
    const timeStr = log.timestamp 
      ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A';
      
    const badgeClass = `status-${log.status.toLowerCase()}`;
    
    // WhatsApp Badge and Button status using i18next
    let waBadge = '';
    let waButtonText = i18next.t('whatsapp-btn-send');
    let waIcon = 'message-square-plus';
    
    if (log.whatsappStatus === 'Sent') {
      const waTime = log.whatsappSentAt 
        ? new Date(log.whatsappSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      const label = i18next.t('whatsapp-sent-label');
      waBadge = `<span class="badge-status status-present" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success); display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="check-check" style="width: 12px; height: 12px;"></i> ${label} (${waTime})</span>`;
      waButtonText = i18next.t('whatsapp-btn-resend');
      waIcon = 'refresh-cw';
    } else if (log.whatsappStatus === 'Failed') {
      const label = i18next.t('whatsapp-failed-label');
      waBadge = `<span class="badge-status status-absent" style="background: rgba(239, 68, 68, 0.1); color: var(--color-danger); display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> ${label}</span>`;
      waButtonText = i18next.t('whatsapp-btn-retry');
      waIcon = 'alert-octagon';
    } else {
      const label = i18next.t('whatsapp-not-sent-label');
      waBadge = `<span class="badge-status" style="background: rgba(100, 116, 139, 0.15); color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="clock" style="width: 12px; height: 12px;"></i> ${label}</span>`;
      waButtonText = i18next.t('whatsapp-btn-send');
    }
    
    let btnStyle = `display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; outline: none;`;
    if (log.whatsappStatus === 'Sent') {
      btnStyle += `background: rgba(16, 185, 129, 0.08); color: var(--color-success); border: 1px solid rgba(16, 185, 129, 0.2);`;
    } else {
      btnStyle += `background: #10b981; color: white; border: 1px solid #10b981;`;
    }
    
    tr.innerHTML = `
      <td style="padding: 14px 18px;">
        <strong style="color: var(--text-primary); font-size: 14px;">${log.name}</strong><br>
        <span style="font-size: 11px; color: var(--text-muted);">ID: ${log.studentId}</span>
      </td>
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;">${log.grade}</td>
      <td style="padding: 14px 18px;">
        <span class="badge-status ${badgeClass}">${log.status}</span>
      </td>
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;">${timeStr}</td>
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;">${log.parentPhone}</td>
      <td style="padding: 14px 18px;">${waBadge}</td>
      <td style="padding: 14px 18px; text-align: right;">
        <button class="btn" style="${btnStyle}" onclick="sendWhatsApp('${log._id}', '${log.name.replace(/'/g, "\\'")}')" id="btn-wa-${log._id}">
          <i data-lucide="${waIcon}" style="width: 14px; height: 14px;"></i>
          <span>${waButtonText}</span>
        </button>
      </td>
    `;
    listEl.appendChild(tr);
  });
  
  lucide.createIcons();
}

// Send WhatsApp Notification simulation
async function sendWhatsApp(recordId, studentName) {
  const btn = document.getElementById(`btn-wa-${recordId}`);
  if (!btn) return;
  
  const origContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width: 14px; height: 14px; display: inline-block;"></i> Sending...`;
  lucide.createIcons();
  
  try {
    const res = await fetch(`${API_BASE}/attendance/${recordId}/whatsapp`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('WhatsApp delivery failed');
    
    const data = await res.json();
    showToast(data.message, 'success');
    await fetchDailyLogs();
  } catch (err) {
    showToast(`Failed to send WhatsApp notification for ${studentName}.`, 'error');
    console.error(err);
    btn.disabled = false;
    btn.innerHTML = origContent;
    lucide.createIcons();
  }
}

// Fetch enrolled students
async function fetchStudents() {
  const listEl = document.getElementById('students-list');
  listEl.innerHTML = `
    <tr>
      <td colspan="6" class="empty-state" style="padding: 48px; text-align: center; color: var(--text-muted);">
        <i data-lucide="loader-2" class="spin" style="width: 24px; height: 24px; margin-bottom: 12px; display: inline-block;"></i>
        <p>Loading enrolled students...</p>
      </td>
    </tr>
  `;
  lucide.createIcons();
  
  try {
    const res = await fetch(`${API_BASE}/students`);
    if (!res.ok) throw new Error('Failed to fetch students');
    const students = await res.json();
    studentsState = students;
    renderStudents();
  } catch (err) {
    listEl.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state" style="padding: 48px; text-align: center; color: var(--color-error);">
          <i data-lucide="server-off" style="width: 24px; height: 24px; margin-bottom: 12px; display: inline-block; color: var(--color-danger)"></i>
          <p>Could not load students. Make sure backend is running.</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    console.error(err);
  }
}

// Render Students Table
function renderStudents() {
  const listEl = document.getElementById('students-list');
  if (!listEl) return;
  
  const searchQuery = document.getElementById('students-search').value.toLowerCase().trim();
  
  let filteredStudents = studentsState;
  if (searchQuery) {
    filteredStudents = studentsState.filter(s => 
      s.name.toLowerCase().includes(searchQuery) || 
      s.studentId.toLowerCase().includes(searchQuery) ||
      s.grade.toLowerCase().includes(searchQuery) ||
      s.email.toLowerCase().includes(searchQuery)
    );
  }
  
  if (filteredStudents.length === 0) {
    let emptyMsg = i18next.t('empty-students-msg');
    listEl.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state" style="padding: 48px; text-align: center; color: var(--text-muted);">
          <i data-lucide="info" style="width: 24px; height: 24px; margin-bottom: 12px; display: inline-block; color: var(--text-muted);"></i>
          <p>${emptyMsg}</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }
  
  listEl.innerHTML = '';
  
  filteredStudents.forEach(s => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    
    const editLabel = i18next.t('btn-edit-student');
    const deleteLabel = i18next.t('btn-delete-student');
    
    tr.innerHTML = `
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;"><code>${s.studentId}</code></td>
      <td style="padding: 14px 18px;">
        <strong style="color: var(--text-primary); font-size: 14px;">${s.name}</strong>
      </td>
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;">${s.grade}</td>
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;">${s.email}</td>
      <td style="padding: 14px 18px; color: var(--text-secondary); font-size: 13px;">${s.parentPhone}</td>
      <td style="padding: 14px 18px; text-align: right;">
        <button class="btn btn-action-resolve" style="padding: 6px 12px; font-size: 12px; font-weight: 600; margin-right: 6px; display: inline-flex; align-items: center; gap: 4px;" onclick="editStudent('${s._id}')">
          <i data-lucide="edit" style="width: 12px; height: 12px;"></i>
          <span>${editLabel}</span>
        </button>
        <button class="btn btn-action-ignore" style="padding: 6px 12px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" onclick="deleteStudent('${s._id}')">
          <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
          <span>${deleteLabel}</span>
        </button>
      </td>
    `;
    listEl.appendChild(tr);
  });
  
  lucide.createIcons();
}

// Student Management Modal handlers
function openStudentModal(id = null) {
  const modalTitle = document.getElementById('lbl-modal-student-title');
  const idInput = document.getElementById('student-id-input');
  const nameInput = document.getElementById('student-name-input');
  const gradeInput = document.getElementById('student-grade-input');
  const emailInput = document.getElementById('student-email-input');
  const phoneInput = document.getElementById('student-phone-input');
  const dbIdInput = document.getElementById('student-db-id');
  
  if (id) {
    const student = studentsState.find(s => s._id === id);
    if (!student) return;
    
    modalTitle.textContent = i18next.t('lbl-modal-student-title-edit');
    idInput.value = student.studentId;
    idInput.disabled = true;
    nameInput.value = student.name;
    gradeInput.value = student.grade;
    emailInput.value = student.email;
    phoneInput.value = student.parentPhone;
    dbIdInput.value = student._id;
  } else {
    modalTitle.textContent = i18next.t('lbl-modal-student-title-add');
    idInput.value = '';
    idInput.disabled = false;
    nameInput.value = '';
    gradeInput.value = '10th Grade';
    emailInput.value = '';
    phoneInput.value = '';
    dbIdInput.value = '';
  }
  
  modalStudent.classList.add('active');
}

function closeStudentModal() {
  modalStudent.classList.remove('active');
}

async function submitStudentForm() {
  const idInput = document.getElementById('student-id-input');
  const nameInput = document.getElementById('student-name-input');
  const gradeInput = document.getElementById('student-grade-input');
  const emailInput = document.getElementById('student-email-input');
  const phoneInput = document.getElementById('student-phone-input');
  const dbId = document.getElementById('student-db-id').value;
  
  const studentId = idInput.value.trim();
  const name = nameInput.value.trim();
  const grade = gradeInput.value.trim();
  const email = emailInput.value.trim();
  const parentPhone = phoneInput.value.trim();
  
  if (!studentId || !name || !grade || !email || !parentPhone) {
    const alertMsg = i18next.t('alert-fill-fields');
    showToast(alertMsg, 'warning');
    return;
  }
  
  const payload = { studentId, name, grade, email, parentPhone };
  
  try {
    let res;
    if (dbId) {
      res = await fetch(`${API_BASE}/students/${dbId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Request failed');
    }
    
    const data = await res.json();
    showToast(data.message, 'success');
    closeStudentModal();
    await fetchStudents();
  } catch (err) {
    showToast(err.message, 'error');
    console.error(err);
  }
}

async function deleteStudent(id) {
  const confirmText = i18next.t('confirm-delete-student');
  if (!confirm(confirmText)) return;
  
  try {
    const res = await fetch(`${API_BASE}/students/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Deletion failed');
    
    const data = await res.json();
    showToast(data.message, 'success');
    await fetchStudents();
  } catch (err) {
    showToast('Failed to delete student.', 'error');
    console.error(err);
  }
}

// Translations Data Map for i18next
const i18nResources = {
  en: {
    translation: {
      "nav-txt-review": "Review Console",
      "nav-txt-students": "Students",
      "nav-txt-daily": "Daily Logs",
      "nav-txt-settings": "Settings",
      "lbl-lang": "Language / भाषा",
      "lbl-reconcile-date": "Reconciliation Date",
      "lbl-run-scan": "Run AI Scan",
      "header-title-h2": "Daily Reconciliation",
      "header-title-p": "Scan records, identify inconsistencies, and resolve flags using AI recommendations.",
      "lbl-kpi-scanned": "Students Scanned",
      "lbl-kpi-anomalies": "Anomalies Detected",
      "lbl-kpi-pending": "Pending Reviews",
      "lbl-kpi-accuracy": "Data Accuracy Rating",
      "lbl-flags-queue-title": "Flagged Issues Queue",
      "lbl-resolution-log-title": "Resolution Log",
      "lbl-anomaly-summary-title": "Anomaly Status Summary",
      "th-student": "Student",
      "th-issue": "Issue",
      "th-resolution": "Resolution",
      "th-resolved-at": "Resolved At",
      "lbl-daily-logs-title": "Attendance Daily Logs",
      "lbl-daily-logs-subtitle": "View completed check-ins and send WhatsApp alerts to parents.",
      "th-dl-info": "Student Info",
      "th-dl-grade": "Grade",
      "th-dl-status": "Status",
      "th-dl-time": "Check-in Time",
      "th-dl-phone": "Parent Phone",
      "th-dl-wa": "WhatsApp Status",
      "th-dl-actions": "Actions",
      "lbl-students-title": "Student Management",
      "lbl-students-subtitle": "Manage enrolled students, their details, and contact numbers.",
      "lbl-btn-add-student": "Add Student",
      "th-stud-id": "Student ID",
      "th-stud-name": "Name",
      "th-stud-grade": "Grade",
      "th-stud-email": "Email",
      "th-stud-phone": "Parent Phone",
      "th-stud-actions": "Actions",
      "lbl-modal-student-title-add": "Add New Student",
      "lbl-modal-student-title-edit": "Edit Student Details",
      "lbl-input-id": "Student ID",
      "lbl-input-name": "Student Name",
      "lbl-input-grade": "Grade",
      "lbl-input-email": "Email Address",
      "lbl-input-phone": "Parent Phone Number",
      "lbl-btn-cancel": "Cancel",
      "btn-student-submit": "Save Student",
      
      "whatsapp-sent-label": "Sent",
      "whatsapp-failed-label": "Failed",
      "whatsapp-not-sent-label": "Not Sent",
      "whatsapp-btn-send": "Send WhatsApp",
      "whatsapp-btn-resend": "Resend",
      "whatsapp-btn-retry": "Retry",
      
      "btn-edit-student": "Edit",
      "btn-delete-student": "Delete",
      
      "confirm-delete-student": "Are you sure you want to delete this student?",
      "alert-fill-fields": "Please fill out all fields.",
      
      "empty-logs-msg": "No attendance logs found matching filters.",
      "empty-students-msg": "No students found matching filters."
    }
  },
  hi: {
    translation: {
      "nav-txt-review": "समीक्षा डैशबोर्ड",
      "nav-txt-students": "छात्र सूची",
      "nav-txt-daily": "दैनिक उपस्थिति",
      "nav-txt-settings": "सेटिंग्स",
      "lbl-lang": "भाषा / Language",
      "lbl-reconcile-date": "मिलान तिथि",
      "lbl-run-scan": "एआई स्कैन चलाएं",
      "header-title-h2": "दैनिक मिलान",
      "header-title-p": "रिकॉर्ड स्कैन करें, विसंगतियों की पहचान करें और समाधान करें।",
      "lbl-kpi-scanned": "स्कैन किए गए छात्र",
      "lbl-kpi-anomalies": "विसंगतियाँ मिलीं",
      "lbl-kpi-pending": "लंबित समीक्षाएँ",
      "lbl-kpi-accuracy": "डेटा सटीकता दर",
      "lbl-flags-queue-title": "चिह्नित मुकदमों की कतार",
      "lbl-resolution-log-title": "समाधान इतिहास लॉग",
      "lbl-anomaly-summary-title": "विसंगति स्थिति सारांश",
      "th-student": "छात्र",
      "th-issue": "विसंगति",
      "th-resolution": "समाधान",
      "th-resolved-at": "समय पर ठीक किया",
      "lbl-daily-logs-title": "दैनिक उपस्थिति लॉग",
      "lbl-daily-logs-subtitle": "उपस्थिति जांचें और अभिभावकों को व्हाट्सएप संदेश भेजें।",
      "th-dl-info": "छात्र की जानकारी",
      "th-dl-grade": "कक्षा (ग्रेड)",
      "th-dl-status": "स्थिति",
      "th-dl-time": "चेक-इन समय",
      "th-dl-phone": "अभिभावक का फोन",
      "th-dl-wa": "व्हाट्सएप स्थिति",
      "th-dl-actions": "कार्रवाई",
      "lbl-students-title": "छात्र प्रबंधन",
      "lbl-students-subtitle": "नामांकित छात्रों के विवरण और संपर्क नंबरों का प्रबंधन करें।",
      "lbl-btn-add-student": "नया छात्र जोड़ें",
      "th-stud-id": "छात्र आईडी",
      "th-stud-name": "नाम",
      "th-stud-grade": "कक्षा",
      "th-stud-email": "ईमेल",
      "th-stud-phone": "अभिभावक का फोन",
      "th-stud-actions": "कार्रवाई",
      "lbl-modal-student-title-add": "नया छात्र जोड़ें",
      "lbl-modal-student-title-edit": "छात्र विवरण संपादित करें",
      "lbl-input-id": "छात्र आईडी",
      "lbl-input-name": "छात्र का नाम",
      "lbl-input-grade": "कक्षा / ग्रेड",
      "lbl-input-email": "ईमेल पता",
      "lbl-input-phone": "अभिभावक का फोन नंबर",
      "lbl-btn-cancel": "रद्द करें",
      "btn-student-submit": "छात्र सहेजें",
      
      "whatsapp-sent-label": "भेजा गया",
      "whatsapp-failed-label": "असफल",
      "whatsapp-not-sent-label": "नहीं भेजा गया",
      "whatsapp-btn-send": "व्हाट्सएप भेजें",
      "whatsapp-btn-resend": "पुनः भेजें",
      "whatsapp-btn-retry": "पुनः प्रयास करें",
      
      "btn-edit-student": "संपादित करें",
      "btn-delete-student": "हटाएं",
      
      "confirm-delete-student": "क्या आप वाकई इस छात्र को हटाना चाहते हैं?",
      "alert-fill-fields": "कृपया सभी फ़ील्ड भरें।",
      
      "empty-logs-msg": "कोई उपस्थिति लॉग नहीं मिला।",
      "empty-students-msg": "कोई छात्र नहीं मिला।"
    }
  },
  bho: {
    translation: {
      "nav-txt-review": "जाँच कंसोल",
      "nav-txt-students": "विद्यार्थी लोग",
      "nav-txt-daily": "रोज के हाजिरी",
      "nav-txt-settings": "सेटिंग",
      "lbl-lang": "भाषा / Language",
      "lbl-reconcile-date": "मिलान के तारीख",
      "lbl-run-scan": "एआई स्कैन करीं",
      "header-title-h2": "रोज के मिलान",
      "header-title-p": "रिकॉर्ड स्कैन करीं, गड़बड़ी पहचानीं आ एआई के सलाह से ठीक करीं।",
      "lbl-kpi-scanned": "जंचल गइल विद्यार्थी",
      "lbl-kpi-anomalies": "गड़बड़ी मिलल",
      "lbl-kpi-pending": "बाचल जाँच",
      "lbl-kpi-accuracy": "डेटा के सटीकता दर",
      "lbl-flags-queue-title": "गड़बड़ी वाला कतार",
      "lbl-resolution-log-title": "ठीक कइल रिकॉर्ड",
      "lbl-anomaly-summary-title": "गड़बड़ी के हाल-चाल",
      "th-student": "विद्यार्थी",
      "th-issue": "गड़बड़ी",
      "th-resolution": "समाधान",
      "th-resolved-at": "ठीक कइल समय",
      "lbl-daily-logs-title": "रोज के हाजिरी रिकॉर्ड",
      "lbl-daily-logs-subtitle": "चेक-इन देखल जाव आ अभिभावकन के व्हाट्सएप अलर्ट भेजल जाव।",
      "th-dl-info": "विद्यार्थी के जानकारी",
      "th-dl-grade": "क्लास",
      "th-dl-status": "स्थिति / हाल",
      "th-dl-time": "चेक-इन समय",
      "th-dl-phone": "अभिभावक के फोन",
      "th-dl-wa": "व्हाट्सएप के हाल",
      "th-dl-actions": "काम (एक्शन)",
      "lbl-students-title": "विद्यार्थी लोगन के देखरेख",
      "lbl-students-subtitle": "नामांकित विद्यार्थी लोग, उनकर जानकारी आ फोन नंबर के देखरेख करीं।",
      "lbl-btn-add-student": "नया विद्यार्थी जोड़ीं",
      "th-stud-id": "विद्यार्थी आईडी",
      "th-stud-name": "नाम",
      "th-stud-grade": "क्लास",
      "th-stud-email": "ईमेल",
      "th-stud-phone": "अभिभावक के फोन",
      "th-stud-actions": "काम (एक्शन)",
      "lbl-modal-student-title-add": "नया विद्यार्थी जोड़ीं",
      "lbl-modal-student-title-edit": "जानकारी सुधारीं",
      "lbl-input-id": "विद्यार्थी आईडी",
      "lbl-input-name": "विद्यार्थी के नाम",
      "lbl-input-grade": "क्लास",
      "lbl-input-email": "ईमेल पता",
      "lbl-input-phone": "अभिभावक के फोन नंबर",
      "lbl-btn-cancel": "छोड़ीं",
      "btn-student-submit": "विद्यार्थी के सहेजीं",
      
      "whatsapp-sent-label": "भेज देहल गइल",
      "whatsapp-failed-label": "फेल हो गइल",
      "whatsapp-not-sent-label": "ना भेजल गइल",
      "whatsapp-btn-send": "व्हाट्सएप भेजीं",
      "whatsapp-btn-resend": "दोबारा भेजीं",
      "whatsapp-btn-retry": "फिर से कोशिश करीं",
      
      "btn-edit-student": "सुधारीं",
      "btn-delete-student": "हटाईं",
      
      "confirm-delete-student": "का आप एह विद्यार्थी के हटावे के चाहत बानी?",
      "alert-fill-fields": "कृपा करके सभ जानकारी भरीं।",
      
      "empty-logs-msg": "गड़बड़ी वाला रिकॉर्ड ना मिलल।",
      "empty-students-msg": "कोई विद्यार्थी ना मिलल।"
    }
  }
};

// Translate UI elements dynamically using i18next
function applyLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('preferredLanguage', lang);
  i18next.changeLanguage(lang, (err, t) => {
    if (err) return console.error(err);
    
    // Translate static elements using keys
    const keys = Object.keys(i18nResources.en.translation);
    keys.forEach(key => {
      const el = document.getElementById(key);
      if (el) {
        const icon = el.querySelector('i[data-lucide]');
        if (icon) {
          el.innerHTML = '';
          el.appendChild(icon);
          el.appendChild(document.createTextNode(' ' + i18next.t(key)));
        } else {
          el.textContent = i18next.t(key);
        }
      }
    });
    
    // Update search inputs placeholders
    const logsSearch = document.getElementById('logs-search');
    if (logsSearch) logsSearch.placeholder = i18next.t('logs-search-placeholder');
    
    const studSearch = document.getElementById('students-search');
    if (studSearch) studSearch.placeholder = i18next.t('students-search-placeholder');
    
    // Re-render tabular content
    renderDailyLogs();
    renderStudents();
  });
}

// Bind to window to allow HTML onclick access
window.sendWhatsApp = sendWhatsApp;
window.filterLogs = renderDailyLogs;
window.fetchDailyLogs = fetchDailyLogs;
window.fetchStudents = fetchStudents;
window.renderStudents = renderStudents;
window.openStudentModal = openStudentModal;
window.closeStudentModal = closeStudentModal;
window.submitStudentForm = submitStudentForm;
window.editStudent = openStudentModal;
window.deleteStudent = deleteStudent;
window.applyLanguage = applyLanguage;
