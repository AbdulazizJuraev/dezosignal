/* ============================================================
   DezoSignal — server: public/ papkani beradi + narx ma'lumotlari uchun proksi
   ------------------------------------------------------------
   GET /api/candles?src=binance|yahoo&symbol=BTCUSDT&tf=15m|1h|4h|1d
     → { symbol, tf, candles: [[vaqt(ms), open, high, low, close, volume], ...] }
   Binance — ochiq API (kalitsiz). Yahoo — forex, oltin, aksiyalar (brauzer to'g'ridan-to'g'ri ololmaydi — CORS).
   Javoblar 30 soniya keshlanadi. Hech qanday savdo qilinmaydi — faqat narx o'qiladi.

   Ishga tushirish:  node server.js            (PORT=5588)
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5588;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const cache = new Map();   // key -> { at, data }
const TTL = 30_000;

const BINANCE_TF = { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
// Yahoo'da 4 soatlik yo'q — 1 soatlikdan yig'iladi
const YAHOO_TF = { '15m': ['15m', '60d'], '1h': ['60m', '730d'], '4h': ['60m', '730d'], '1d': ['1d', '10y'] };

async function binance(symbol, tf) {
  const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${BINANCE_TF[tf]}&limit=1000`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error('Binance ' + r.status), { status: 502 });
  return (await r.json()).map(k => [k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]);
}

async function yahoo(symbol, tf) {
  const [interval, range] = YAHOO_TF[tf];
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error('Yahoo ' + r.status), { status: 502 });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res || !res.timestamp) throw Object.assign(new Error('Ma’lumot topilmadi'), { status: 404 });
  const q = res.indicators.quote[0];
  let out = [];
  res.timestamp.forEach((t, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some(v => v == null)) return;   // bo'sh (hali yopilmagan) shamlar
    out.push([t * 1000, q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i] || 0]);
  });
  if (tf === '4h') out = group(out, 4 * 3600_000);
  return out.slice(-1000);
}

// soatlik shamlarni 4 soatlik qilib yig'ish
function group(rows, ms) {
  const out = [];
  for (const c of rows) {
    const t = Math.floor(c[0] / ms) * ms, last = out[out.length - 1];
    if (last && last[0] === t) { last[2] = Math.max(last[2], c[2]); last[3] = Math.min(last[3], c[3]); last[4] = c[4]; last[5] += c[5]; }
    else out.push([t, c[1], c[2], c[3], c[4], c[5]]);
  }
  return out;
}

async function candles(q) {
  const src = q.get('src'), symbol = String(q.get('symbol') || ''), tf = q.get('tf') || '1h';
  if (!BINANCE_TF[tf]) throw Object.assign(new Error('tf: 15m, 1h, 4h yoki 1d'), { status: 400 });
  if (!/^[A-Z0-9=.^-]{1,20}$/i.test(symbol)) throw Object.assign(new Error('symbol noto‘g‘ri'), { status: 400 });
  const key = `${src}:${symbol}:${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const rows = src === 'binance' ? await binance(symbol.toUpperCase(), tf)
    : src === 'yahoo' ? await yahoo(symbol, tf)
    : (() => { throw Object.assign(new Error('src: binance yoki yahoo'), { status: 400 }); })();
  const data = { symbol, tf, candles: rows };
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/candles') {
    try {
      const data = await candles(url.searchParams);
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'public, max-age=20', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(e.status || 502, { 'Content-Type': TYPES['.json'], 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Topilmadi'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`DezoSignal: http://localhost:${PORT}`));
