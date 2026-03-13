/* ============================================
   The Stealth Ticker - Application Logic
   Digital clock + stealth candlestick chart
   ============================================ */

(function () {
  'use strict';

  // ── Configuration ──────────────────────────
  const CONFIG = {
    PROXY_BASE: '/api/chart',
    MOCK_INITIAL_PRICE: 3500,
    MOCK_VOLATILITY: 0.003,
    MOCK_CANDLE_COUNT: 60,
    DEFAULT_INTERVAL: 30,  // seconds
  };

  const COLOR_MAP = {
    cyan:    { up: 'rgba(56, 189, 248, 0.9)',  down: 'rgba(56, 130, 180, 0.7)',  wick: 'rgba(56, 189, 248, 0.5)' },
    green:   { up: 'rgba(63, 185, 80, 0.9)',   down: 'rgba(248, 81, 73, 0.9)',   wick: 'rgba(139, 148, 158, 0.4)' },
    amber:   { up: 'rgba(227, 179, 65, 0.9)',  down: 'rgba(180, 100, 50, 0.7)',  wick: 'rgba(227, 179, 65, 0.5)' },
    magenta: { up: 'rgba(219, 97, 162, 0.9)',  down: 'rgba(140, 60, 110, 0.7)',  wick: 'rgba(219, 97, 162, 0.5)' },
    white:   { up: 'rgba(230, 237, 243, 0.8)', down: 'rgba(110, 118, 129, 0.7)', wick: 'rgba(230, 237, 243, 0.4)' },
  };

  // ── State ──────────────────────────────────
  let state = {
    ticker: '7203.T',
    color: 'green',
    opacity: 18,
    updateInterval: 30,
    ohlcData: [],
    lastPrice: null,
    dataSource: 'mock',  // 'live' or 'mock'
  };

  // ── DOM Elements ───────────────────────────
  const els = {
    timeDisplay:     document.getElementById('time-display'),
    dateDisplay:     document.getElementById('date-display'),
    tickerHint:      document.getElementById('ticker-hint'),
    chartCanvas:     document.getElementById('stealth-chart'),
    dataSource:      document.getElementById('data-source'),
    settingsTrigger: document.getElementById('settings-trigger'),
    settingsPanel:   document.getElementById('settings-panel'),
    settingsClose:   document.getElementById('settings-close'),
    settingsOverlay: document.getElementById('settings-overlay'),
    tickerInput:     document.getElementById('ticker-input'),
    chartColor:      document.getElementById('chart-color'),
    chartOpacity:    document.getElementById('chart-opacity'),
    opacityValue:    document.getElementById('opacity-value'),
    updateInterval:  document.getElementById('update-interval'),
    applyBtn:        document.getElementById('apply-settings'),
  };

  let chart = null;
  let dataInterval = null;

  // ── Clock ──────────────────────────────────
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    els.timeDisplay.textContent = `${h}:${m}:${s}`;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    els.dateDisplay.textContent =
      `${days[now.getDay()]}  ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  // ── Yahoo Finance Data Fetching ────────────
  async function fetchYahooData(symbol) {
    try {
      const url = `${CONFIG.PROXY_BASE}/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const result = json.chart?.result?.[0];
      if (!result) throw new Error('No data in response');

      const timestamps = result.timestamp;
      const quote = result.indicators?.quote?.[0];
      if (!timestamps || !quote) throw new Error('Missing OHLC data');

      const ohlcData = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = quote.open[i];
        const h = quote.high[i];
        const l = quote.low[i];
        const c = quote.close[i];
        if (o == null || h == null || l == null || c == null) continue;

        ohlcData.push({
          x: timestamps[i] * 1000,  // ms
          o: parseFloat(o.toFixed(2)),
          h: parseFloat(h.toFixed(2)),
          l: parseFloat(l.toFixed(2)),
          c: parseFloat(c.toFixed(2)),
        });
      }

      if (ohlcData.length === 0) throw new Error('No valid candles');

      return ohlcData;
    } catch (err) {
      console.warn(`[StealthTicker] API fetch failed: ${err.message}`);
      return null;
    }
  }

  // ── Mock OHLC Data Generator ───────────────
  function generateMockOHLC() {
    const data = [];
    let price = CONFIG.MOCK_INITIAL_PRICE + (Math.random() - 0.5) * 400;
    const now = Date.now();
    const candleWidth = 5 * 60 * 1000; // 5 min per candle

    for (let i = CONFIG.MOCK_CANDLE_COUNT; i >= 0; i--) {
      const open = price;
      const change1 = price * (Math.random() - 0.48) * CONFIG.MOCK_VOLATILITY * 4;
      const change2 = price * (Math.random() - 0.48) * CONFIG.MOCK_VOLATILITY * 4;
      const change3 = price * (Math.random() - 0.48) * CONFIG.MOCK_VOLATILITY * 4;

      const close = open + change1 + change2;
      const high = Math.max(open, close) + Math.abs(change3);
      const low = Math.min(open, close) - Math.abs(change3) * 0.8;

      data.push({
        x: now - i * candleWidth,
        o: parseFloat(open.toFixed(2)),
        h: parseFloat(high.toFixed(2)),
        l: parseFloat(Math.max(1, low).toFixed(2)),
        c: parseFloat(close.toFixed(2)),
      });

      price = close;
    }

    return data;
  }

  function appendMockCandle() {
    if (state.ohlcData.length === 0) return;

    const lastCandle = state.ohlcData[state.ohlcData.length - 1];
    const price = lastCandle.c;
    const change1 = price * (Math.random() - 0.48) * CONFIG.MOCK_VOLATILITY * 3;
    const change2 = price * (Math.random() - 0.48) * CONFIG.MOCK_VOLATILITY * 3;

    const open = price;
    const close = open + change1;
    const high = Math.max(open, close) + Math.abs(change2);
    const low = Math.min(open, close) - Math.abs(change2) * 0.7;

    // Update the last candle or add a new one
    const now = Date.now();
    const candleWidth = 5 * 60 * 1000;
    const lastTime = lastCandle.x;

    if (now - lastTime < candleWidth) {
      // Update existing candle
      lastCandle.c = parseFloat(close.toFixed(2));
      lastCandle.h = parseFloat(Math.max(lastCandle.h, high).toFixed(2));
      lastCandle.l = parseFloat(Math.min(lastCandle.l, Math.max(1, low)).toFixed(2));
    } else {
      // New candle
      state.ohlcData.push({
        x: now,
        o: parseFloat(open.toFixed(2)),
        h: parseFloat(high.toFixed(2)),
        l: parseFloat(Math.max(1, low).toFixed(2)),
        c: parseFloat(close.toFixed(2)),
      });

      // Keep window size
      if (state.ohlcData.length > CONFIG.MOCK_CANDLE_COUNT + 10) {
        state.ohlcData.shift();
      }
    }
  }

  // ── Chart ──────────────────────────────────
  function createChart() {
    const ctx = els.chartCanvas.getContext('2d');
    const colors = COLOR_MAP[state.color] || COLOR_MAP.green;

    chart = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [{
          data: state.ohlcData,
          color: {
            up: colors.up,
            down: colors.down,
            unchanged: colors.up,
          },
          borderColor: {
            up: colors.up,
            down: colors.down,
            unchanged: colors.wick,
          },
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 400,
          easing: 'easeInOutQuart',
        },
        interaction: {
          mode: null,
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            type: 'timeseries',
            display: false,
            grid: { display: false },
            ticks: { display: false },
          },
          y: {
            display: false,
            grid: { display: false },
            ticks: { display: false },
          },
        },
        layout: {
          padding: {
            top: 60,
            bottom: 60,
            left: 20,
            right: 20,
          }
        }
      }
    });
  }

  function refreshChartData() {
    if (!chart) return;

    const colors = COLOR_MAP[state.color] || COLOR_MAP.green;
    chart.data.datasets[0].data = state.ohlcData;
    chart.data.datasets[0].color = {
      up: colors.up,
      down: colors.down,
      unchanged: colors.up,
    };
    chart.data.datasets[0].borderColor = {
      up: colors.up,
      down: colors.down,
      unchanged: colors.wick,
    };
    chart.update('none');
  }

  function applyOpacity() {
    els.chartCanvas.style.opacity = (state.opacity / 100).toString();
  }

  function updateDataSourceIndicator() {
    if (state.dataSource === 'live') {
      els.dataSource.textContent = '● LIVE';
      els.dataSource.className = 'live';
    } else {
      els.dataSource.textContent = '○ MOCK';
      els.dataSource.className = 'mock';
    }
  }

  function updateTickerHint() {
    if (state.ohlcData.length === 0) {
      els.tickerHint.textContent = `${state.ticker}  ---`;
      return;
    }
    const last = state.ohlcData[state.ohlcData.length - 1];
    const first = state.ohlcData[0];
    const change = ((last.c - first.o) / first.o * 100).toFixed(2);
    const sign = change >= 0 ? '+' : '';
    state.lastPrice = last.c;
    els.tickerHint.textContent = `${state.ticker}  ${last.c.toFixed(1)}  (${sign}${change}%)`;
  }

  // ── Data Loading ───────────────────────────
  async function loadData() {
    const liveData = await fetchYahooData(state.ticker);

    if (liveData && liveData.length > 0) {
      state.ohlcData = liveData;
      state.dataSource = 'live';
    } else {
      // Fallback to mock
      if (state.dataSource !== 'mock' || state.ohlcData.length === 0) {
        state.ohlcData = generateMockOHLC();
      } else {
        appendMockCandle();
      }
      state.dataSource = 'mock';
    }

    refreshChartData();
    updateTickerHint();
    updateDataSourceIndicator();
  }

  async function resetAndLoad() {
    state.ohlcData = [];
    state.dataSource = 'mock';

    if (chart) {
      chart.destroy();
      chart = null;
    }

    const liveData = await fetchYahooData(state.ticker);
    if (liveData && liveData.length > 0) {
      state.ohlcData = liveData;
      state.dataSource = 'live';
    } else {
      state.ohlcData = generateMockOHLC();
      state.dataSource = 'mock';
    }

    createChart();
    applyOpacity();
    updateTickerHint();
    updateDataSourceIndicator();
  }

  // ── Settings Panel ─────────────────────────
  function openSettings() {
    els.settingsPanel.classList.add('open');
    els.settingsOverlay.classList.add('active');
    document.body.classList.add('settings-open');

    els.tickerInput.value = state.ticker;
    els.chartColor.value = state.color;
    els.chartOpacity.value = state.opacity;
    els.opacityValue.textContent = state.opacity + '%';
    els.updateInterval.value = state.updateInterval;
  }

  function closeSettings() {
    els.settingsPanel.classList.remove('open');
    els.settingsOverlay.classList.remove('active');
    document.body.classList.remove('settings-open');
  }

  function applySettings() {
    const newTicker = els.tickerInput.value.trim().toUpperCase() || '7203.T';
    const tickerChanged = newTicker !== state.ticker;

    state.ticker = newTicker;
    state.color = els.chartColor.value;
    state.opacity = parseInt(els.chartOpacity.value, 10);
    state.updateInterval = parseInt(els.updateInterval.value, 10);

    saveState();

    // Restart data interval with new timing
    startDataInterval();

    if (tickerChanged) {
      resetAndLoad();
    } else {
      refreshChartData();
      applyOpacity();
    }

    closeSettings();
  }

  // ── Data Interval ──────────────────────────
  function startDataInterval() {
    if (dataInterval) clearInterval(dataInterval);
    dataInterval = setInterval(loadData, state.updateInterval * 1000);
  }

  // ── Persistence ────────────────────────────
  function saveState() {
    const data = {
      ticker: state.ticker,
      color: state.color,
      opacity: state.opacity,
      updateInterval: state.updateInterval,
    };
    try {
      localStorage.setItem('stealth-ticker-v2', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem('stealth-ticker-v2');
      if (raw) {
        const data = JSON.parse(raw);
        state.ticker = data.ticker || '7203.T';
        state.color = data.color || 'green';
        state.opacity = data.opacity != null ? data.opacity : 18;
        state.updateInterval = data.updateInterval || 30;
      }
    } catch (e) { /* ignore */ }
  }

  // ── Events ─────────────────────────────────
  function bindEvents() {
    els.settingsTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings();
    });

    els.settingsClose.addEventListener('click', closeSettings);
    els.settingsOverlay.addEventListener('click', closeSettings);
    els.applyBtn.addEventListener('click', applySettings);

    els.chartOpacity.addEventListener('input', () => {
      els.opacityValue.textContent = els.chartOpacity.value + '%';
    });

    // Ticker quick-select tags
    document.querySelectorAll('.ticker-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        els.tickerInput.value = tag.dataset.ticker;
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSettings();
    });

    els.tickerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applySettings();
    });
  }

  // ── Initialization ─────────────────────────
  async function init() {
    loadSavedState();

    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Load data and create chart
    await resetAndLoad();

    // Start periodic updates
    startDataInterval();

    // Bind UI events
    bindEvents();
  }

  // ── Start ──────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
