/* ============================================================
   DezoSignal — narx ma'lumotlari: [[vaqt(ms), open, high, low, close, volume], ...]
   - Kripto: Binance ochiq API — brauzerdan to'g'ridan-to'g'ri (kalitsiz)
   - Forex, oltin, aksiyalar: Yahoo. Brauzer to'g'ridan-to'g'ri ololmaydi (CORS):
       ilovada (APK) — telefonning o'zi oladi (CapacitorHttp), saytda — DezoMax serveri orqali (/api/candles)
   - Kompyuterda (localhost) — server.js orqali
   ============================================================ */

const DS_PROXY = 'https://pay.2-29-60-133.sslip.io';
const DS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DS_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const DS_YAHOO_TF = { '15m': ['15m', '60d'], '1h': ['60m', '730d'], '4h': ['60m', '730d'], '1d': ['1d', '10y'] };

async function dsJson(url, opts) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  let j = null;
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error((j && j.error) || `Xato ${r.status}`);
  return j;
}

async function dsBinance(sym, tf) {
  const q = `symbol=${sym}&interval=${tf}&limit=1000`;
  let rows;
  try { rows = await dsJson(`https://api.binance.com/api/v3/klines?${q}`); }
  catch { rows = await dsJson(`https://data-api.binance.vision/api/v3/klines?${q}`); }   // zaxira manzil
  return rows.map(k => [k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]);
}

function dsGroup(rows, ms) {
  const out = [];
  for (const c of rows) {
    const t = Math.floor(c[0] / ms) * ms, last = out[out.length - 1];
    if (last && last[0] === t) { last[2] = Math.max(last[2], c[2]); last[3] = Math.min(last[3], c[3]); last[4] = c[4]; last[5] += c[5]; }
    else out.push([t, c[1], c[2], c[3], c[4], c[5]]);
  }
  return out;
}

async function dsYahooDirect(sym, tf) {
  const [interval, range] = DS_YAHOO_TF[tf];
  const j = await dsJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`);
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) throw new Error('Ma’lumot topilmadi');
  const q = res.indicators.quote[0];
  let rows = [];
  res.timestamp.forEach((t, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some(v => v == null)) return;
    rows.push([t * 1000, q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i] || 0]);
  });
  if (tf === '4h') rows = dsGroup(rows, 4 * 3600_000);
  return rows.slice(-1000);
}

async function fetchCandles(src, sym, tf) {
  if (DS_LOCAL) return (await dsJson(`api/candles?src=${src}&symbol=${encodeURIComponent(sym)}&tf=${tf}`)).candles;
  if (src === 'binance') return dsBinance(sym, tf);
  if (DS_APP) { try { return await dsYahooDirect(sym, tf); } catch { /* serverga o'tamiz */ } }
  return (await dsJson(`${DS_PROXY}/api/candles?symbol=${encodeURIComponent(sym)}&tf=${tf}`)).candles;
}
