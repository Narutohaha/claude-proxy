class ClaudeProxyUI {
  constructor() {
    this.currentView = 'dashboard';
    this.currentRequest = null;
    this.viewMode = 'parsed';
    this.customModels = [];
    this.autoRefresh = true;
    this.refreshInterval = null;
    this.dashboardInitialized = false;
    this.requestsInitialized = false;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadCustomModels();
    await this.loadDashboard();
    this.startAutoRefresh();
  }

  bindEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView(item.dataset.view);
      });
    });

    document.getElementById('refresh-btn')?.addEventListener('click', () => this.refresh());
    document.getElementById('clear-btn')?.addEventListener('click', () => this.clearData());
    document.getElementById('auto-refresh-toggle')?.addEventListener('click', () => this.toggleAutoRefresh());

    document.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal());
    document.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      if (this.autoRefresh && !document.getElementById('modal')?.classList.contains('hidden') === false) {
        this.refresh(true); // silent refresh
      }
    }, 3000);
  }

  toggleAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;
    const btn = document.getElementById('auto-refresh-toggle');
    if (btn) {
      btn.classList.toggle('active', this.autoRefresh);
      btn.textContent = this.autoRefresh ? '⏱️ Auto' : '⏸️ Paused';
    }
  }

  async clearData() {
    if (!confirm('确定要清空所有请求记录吗？此操作不可恢复。')) return;

    try {
      const response = await fetch('/api/clear', { method: 'POST' });
      if (response.ok) {
        this.refresh();
        alert('数据已清空');
      } else {
        alert('清空失败');
      }
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('清空失败');
    }
  }

  async loadCustomModels() {
    try {
      const response = await fetch('/v1/models');
      if (response.ok) {
        const data = await response.json();
        this.customModels = data.data || [];
      }
    } catch (error) {
      console.error('Failed to load custom models:', error);
    }
  }

  switchView(view) {
    this.currentView = view;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    document.getElementById('page-title').textContent = view === 'dashboard' ? 'Dashboard' : 'Requests';
    // 重置视图初始化状态，允许重新渲染
    if (view === 'dashboard') {
      this.requestsInitialized = false;
    } else {
      this.dashboardInitialized = false;
    }
    this.refresh();
  }

  async refresh(silent = false) {
    if (this.currentView === 'dashboard') {
      await this.loadDashboard(silent);
    } else {
      await this.loadRequests(silent);
    }
  }

  async loadDashboard(silent = false) {
    // 首次加载时渲染页面结构
    if (!this.dashboardInitialized) {
      const content = document.getElementById('content');
      if (!content) {
        console.error('Content element not found');
        return;
      }

      const modelsHtml = this.customModels.length > 0 ? `
        <div class="models-section">
          <h3 style="margin-bottom: 12px; font-size: 16px;">📋 Available Custom Models</h3>
          <div class="models-grid">
            ${this.customModels.map(m => `
              <div class="model-card">
                <div class="model-name">${m.id}</div>
                <div class="model-info">
                  <span class="model-provider">${m.owned_by}</span>
                  <span class="model-actual">${m.actual_model}</span>
                </div>
                ${m.description ? `<div class="model-desc">${m.description}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';

      content.innerHTML = `
        ${modelsHtml}
        <div class="stats-grid" id="stats-grid">
          <div class="stat-card"><h3>Total Requests</h3><div class="value" id="stat-requests">-</div></div>
          <div class="stat-card"><h3>Total Tokens</h3><div class="value" id="stat-tokens">-</div></div>
          <div class="stat-card"><h3>Avg Latency</h3><div class="value" id="stat-latency">-</div></div>
          <div class="stat-card"><h3>Providers</h3><div class="value" id="stat-providers">-</div></div>
        </div>
        <div class="charts-grid">
          <div class="chart-card"><h3>Requests by Model</h3><div class="chart-container"><canvas id="model-chart"></canvas></div></div>
          <div class="chart-card"><h3>Daily Requests</h3><div class="chart-container"><canvas id="daily-chart"></canvas></div></div>
        </div>
        <div class="requests-table-wrapper">
          <div class="table-header"><h3>Recent Requests</h3></div>
          <table class="requests-table">
            <thead><tr><th>Time</th><th>Model</th><th>Provider</th><th>Tokens</th><th>Latency</th><th>Status</th></tr></thead>
            <tbody id="recent-requests"></tbody>
          </table>
        </div>
      `;
      this.dashboardInitialized = true;
    }

    try {
      const stats = await this.fetch('/api/stats');
      const requests = await this.fetch('/api/requests?limit=10');

      // 平滑更新统计数据
      this.updateStatValue('stat-requests', this.formatNumber(stats.total_requests));
      this.updateStatValue('stat-tokens', this.formatNumber(stats.total_tokens));
      this.updateStatValue('stat-latency', `${stats.avg_latency_ms}ms`);
      this.updateStatValue('stat-providers', Object.keys(stats.provider_breakdown).length.toString());

      this.renderPieChart('model-chart', stats.model_breakdown);
      this.renderLineChart('daily-chart', stats.daily_requests);
      this.renderRequestRows('recent-requests', requests);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      // 数据加载失败但页面结构已经渲染，保持页面不变，下次刷新会重试
    }
  }

  updateStatValue(id, value) {
    const el = document.getElementById(id);
    if (el && el.textContent !== value) {
      el.textContent = value;
    }
  }

  async loadRequests(silent = false) {
    // 首次加载时渲染页面结构
    if (!this.requestsInitialized) {
      const content = document.getElementById('content');
      content.innerHTML = `
        <div class="requests-table-wrapper">
          <div class="table-header">
            <h3>All Requests</h3>
            <div class="filters">
              <select class="filter-select" id="model-filter"><option value="">All Models</option></select>
            </div>
          </div>
          <table class="requests-table">
            <thead><tr><th>Time</th><th>Model</th><th>Provider</th><th>Tokens</th><th>Latency</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="all-requests"></tbody>
          </table>
        </div>
      `;
      this.requestsInitialized = true;
    }

    try {
      const requests = await this.fetch('/api/requests?limit=100');
      this.renderRequestRows('all-requests', requests, true);

      // 只在首次加载时更新过滤器选项
      const modelFilter = document.getElementById('model-filter');
      const models = [...new Set(requests.map(r => r.model))];
      const currentOptions = Array.from(modelFilter.options).map(o => o.value);
      if (JSON.stringify(currentOptions.slice(1).sort()) !== JSON.stringify(models.sort())) {
        modelFilter.innerHTML = '<option value="">All Models</option>';
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelFilter.appendChild(option);
        });
      }

      // 移除旧的事件监听器并添加新的
      modelFilter.onchange = () => this.filterRequests(modelFilter.value);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  }

  renderRequestRows(elementId, requests, showActions = false) {
    const tbody = document.getElementById(elementId);
    if (!tbody) return;

    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${showActions ? 7 : 6}" style="text-align: center; color: var(--text-muted);">No requests yet</td></tr>`;
      return;
    }

    // 检查数据是否变化
    const currentIds = Array.from(tbody.querySelectorAll('tr')).map(tr => tr.dataset.id);
    const newIds = requests.map(r => r.id);

    if (JSON.stringify(currentIds) === JSON.stringify(newIds)) {
      // 数据没变化，不重新渲染
      return;
    }

    tbody.innerHTML = requests.map(r => `
      <tr data-id="${r.id}">
        <td>${this.formatTime(r.timestamp)}</td>
        <td><code style="font-size: 12px;">${r.model}</code></td>
        <td>${r.provider || '-'}</td>
        <td>${r.input_tokens + r.output_tokens}</td>
        <td>${r.duration_ms}ms</td>
        <td><span class="status-badge ${r.error ? 'error' : 'success'}">${r.error ? 'Error' : 'OK'}</span></td>
        ${showActions ? `<td><button class="btn btn-small" onclick="ui.showDetail('${r.id}')">Detail</button></td>` : ''}
      </tr>
    `).join('');
  }

  async showDetail(id) {
    try {
      this.currentRequest = await this.fetch(`/api/requests/${id}`);
      this.viewMode = 'parsed';
      this.renderModal();
    } catch (error) {
      console.error('Failed to load request detail:', error);
    }
  }

  renderModal() {
    const modal = document.getElementById('modal');
    const modalBody = modal.querySelector('.modal-body');
    const request = this.currentRequest;

    modalBody.innerHTML = `
      <div class="view-toggle">
        <button class="view-toggle-btn ${this.viewMode === 'parsed' ? 'active' : ''}" onclick="ui.setViewMode('parsed')">Parsed View</button>
        <button class="view-toggle-btn ${this.viewMode === 'raw' ? 'active' : ''}" onclick="ui.setViewMode('raw')">Raw JSON</button>
      </div>
      ${this.viewMode === 'parsed' ? this.renderParsedView(request) : this.renderRawView(request)}
    `;

    modal.classList.remove('hidden');
  }

  renderParsedView(request) {
    let messages = [], tools = [], thinking = null;
    try { messages = JSON.parse(request.messages_json || '[]'); } catch {}
    try { tools = JSON.parse(request.tools_json || '[]'); } catch {}
    try { thinking = JSON.parse(request.thinking_json || 'null'); } catch {}

    return `
      <div class="meta-grid">
        <div class="meta-item"><label>Model</label><div class="value">${request.model}</div></div>
        <div class="meta-item"><label>Provider</label><div class="value">${request.provider || '-'}</div></div>
        <div class="meta-item"><label>Routed Model</label><div class="value">${request.routed_model || '-'}</div></div>
        <div class="meta-item"><label>Max Tokens</label><div class="value">${request.max_tokens || '-'}</div></div>
        <div class="meta-item"><label>Input Tokens</label><div class="value">${request.input_tokens}</div></div>
        <div class="meta-item"><label>Output Tokens</label><div class="value">${request.output_tokens}</div></div>
        <div class="meta-item"><label>Duration</label><div class="value">${request.duration_ms}ms</div></div>
        <div class="meta-item"><label>Status</label><div class="value">${request.error ? 'Error' : 'Success'}</div></div>
      </div>
      ${thinking ? `<div class="section"><h4>Extended Thinking</h4><div class="code-block">${JSON.stringify(thinking, null, 2)}</div></div>` : ''}
      <div class="section"><h4>Messages (${messages.length})</h4><div class="code-block">${JSON.stringify(messages, null, 2)}</div></div>
      ${tools.length > 0 ? `<div class="section"><h4>Tools (${tools.length})</h4><div class="code-block">${JSON.stringify(tools.map(t => ({name: t.name, description: t.description})), null, 2)}</div></div>` : ''}
      <div class="section"><h4>Response</h4><div class="code-block" style="max-height: 300px; overflow-y: auto;">${this.escapeHtml(request.response_content || request.error || 'No content')}</div></div>
    `;
  }

  renderRawView(request) {
    return `
      <div class="section"><h4>Request JSON</h4><div class="code-block" style="max-height: 400px; overflow-y: auto;">${this.escapeHtml(this.formatJson(request.raw_request))}</div></div>
      <div class="section"><h4>Response JSON</h4><div class="code-block" style="max-height: 400px; overflow-y: auto;">${this.escapeHtml(this.formatJson(request.raw_response))}</div></div>
    `;
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.renderModal();
  }

  closeModal() {
    document.getElementById('modal')?.classList.add('hidden');
  }

  async filterRequests(model) {
    const url = model ? `/api/requests?limit=100&model=${encodeURIComponent(model)}` : '/api/requests?limit=100';
    const requests = await this.fetch(url);
    this.renderRequestRows('all-requests', requests, true);
  }

  async fetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  formatJson(str) {
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  renderPieChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data) return;

    const labels = Object.keys(data);
    if (labels.length === 0) return;

    // 检查数据是否变化
    const existingChart = Chart.getChart(canvas);
    const newData = Object.values(data);

    if (existingChart) {
      const oldData = existingChart.data.datasets[0].data;
      const oldLabels = existingChart.data.labels;

      // 只有数据变化时才更新
      if (JSON.stringify(oldData) !== JSON.stringify(newData) ||
          JSON.stringify(oldLabels) !== JSON.stringify(labels)) {
        existingChart.data.labels = labels;
        existingChart.data.datasets[0].data = newData;
        existingChart.update('none'); // 无动画更新
      }
      return;
    }

    const colors = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#10b981', '#34d399', '#6ee7b7', '#f59e0b', '#fbbf24', '#fcd34d'];

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: newData, backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { position: 'right', labels: { color: '#8b8b9e', font: { size: 11 } } } },
      },
    });
  }

  renderLineChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data) return;

    if (data.length === 0) return;

    const labels = data.map(d => d.date).reverse();
    const values = data.map(d => d.requests).reverse();

    const existingChart = Chart.getChart(canvas);

    if (existingChart) {
      const oldLabels = existingChart.data.labels;
      const oldValues = existingChart.data.datasets[0].data;

      // 只有数据变化时才更新
      if (JSON.stringify(oldLabels) !== JSON.stringify(labels) ||
          JSON.stringify(oldValues) !== JSON.stringify(values)) {
        existingChart.data.labels = labels;
        existingChart.data.datasets[0].data = values;
        existingChart.update('none');
      }
      return;
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Requests',
          data: values,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b8b9e' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b8b9e' } },
        },
      },
    });
  }
}

const ui = new ClaudeProxyUI();
