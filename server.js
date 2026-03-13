/* ============================================
   The Stealth Ticker - Proxy Server
   Proxies Yahoo Finance API to bypass CORS
   ============================================ */

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3456;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Proxy endpoint for Yahoo Finance chart data
app.get('/api/chart/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const interval = req.query.interval || '5m';
  const range = req.query.range || '1d';

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance API returned ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(`[Proxy Error] ${err.message}`);
    res.status(502).json({ error: 'Failed to fetch from Yahoo Finance', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ✦ The Stealth Ticker`);
  console.log(`  ─────────────────────`);
  console.log(`  Server running at http://localhost:${PORT}`);
  console.log(`  Press Ctrl+C to stop\n`);
});
