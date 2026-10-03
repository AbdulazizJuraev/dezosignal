/* ============================================================
   DezoSignal — interfeys: aktivlar ro'yxati, signallar, grafik, tarixiy natija, bildirishnomalar
   Ma'lumot: /api/candles (server.js). Har 60 soniyada yangilanadi.
   ============================================================ */

const MARKETS = {
  crypto: { name: 'Kripto', src: 'binance', items: [
    ['BTCUSDT', 'Bitcoin', 'BTC/USDT'], ['ETHUSDT', 'Ethereum', 'ETH/USDT'], ['BNBUSDT', 'BNB', 'BNB/USDT'], ['SOLUSDT', 'Solana', 'SOL/USDT'],
    ['XRPUSDT', 'XRP', 'XRP/USDT'], ['TONUSDT', 'Toncoin', 'TON/USDT'], ['DOGEUSDT', 'Dogecoin', 'DOGE/USDT'], ['ADAUSDT', 'Cardano', 'ADA/USDT'],
  ] },
  fx: { name: 'Forex va oltin', src: 'yahoo', items: [
    ['GC=F', 'Oltin', 'XAU/USD'], ['SI=F', 'Kumush', 'XAG/USD'], ['EURUSD=X', 'Yevro / Dollar', 'EUR/USD'], ['GBPUSD=X', 'Funt / Dollar', 'GBP/USD'],
    ['USDJPY=X', 'Dollar / Iyena', 'USD/JPY'], ['AUDUSD=X', 'Avstraliya dollari', 'AUD/USD'], ['USDCHF=X', 'Dollar / Frank', 'USD/CHF'], ['CL=F', 'Neft (WTI)', 'WTI'],
  ] },
  stocks: { name: 'Aksiyalar', src: 'yahoo', items: [
    ['AAPL', 'Apple', 'AAPL'], ['NVDA', 'Nvidia', 'NVDA'], ['TSLA', 'Tesla', 'TSLA'], ['MSFT', 'Microsoft', 'MSFT'],
    ['AMZN', 'Amazon', 'AMZN'], ['GOOGL', 'Alphabet (Google)', 'GOOGL'], ['META', 'Meta', 'META'], ['AMD', 'AMD', 'AMD'],
  ] },
};
const TF_NAME = { '15m': '15 daqiqa', '1h': '1 soat', '4h': '4 soat', '1d': '1 kun' };
const REFRESH_MS = 60_000;

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('ds_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ds_' + k, JSON.stringify(v)); } catch {} },
};
const state = {
  market: store.get('market', 'crypto'),
  tf: store.get('tf', '1h'),
  data: {},          // `${sym}:${tf}` -> { candles, a, at }
  open: null,        // ochiq aktiv (grafik)
  timer: 0,
};
if (!MARKETS[state.market]) state.market = 'crypto';
if (!TF_NAME[state.tf]) state.tf = '1h';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(p) {
  if (p == null || !isFinite(p)) return '—';
  const a = Math.abs(p), d = a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 4 : 5;
  return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
// -0.0R emas, 0.0R
const rFmt = (x, d = 1) => { const v = Math.abs(x) < 0.05 * 10 ** (1 - d) ? 0 : x; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + 'R'; };
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m} daq. oldin` : m < 1440 ? `${Math.round(m / 60)} soat oldin` : `${Math.round(m / 1440)} kun oldin`;
};
const sideName = s => s === 'buy' ? 'SOTIB OLISH' : 'SOTISH';

async function load(sym, src, tf) {
  const key = `${sym}:${tf}`, hit = state.data[key];
  if (hit && Date.now() - hit.at < REFRESH_MS - 2000) return hit;
  const candles = await fetchCandles(src, sym, tf);   // js/data.js
  if (candles.length < 230) throw new Error('Ma’lumot yetarli emas');
  const v = { candles, a: Signal.analyze(candles), at: Date.now() };
  state.data[key] = v;
  return v;
}

/* ---------- ro'yxat ---------- */
function badge(a) {
  const s = a && a.active;
  if (!s) return '<span class="badge wait">Kutish</span>';
  if (s.done === 'target') return `<span class="badge done-win">Maqsadga yetdi</span>`;
  if (s.done === 'stop') return `<span class="badge done-loss">Stop ishladi</span>`;
  return `<span class="badge ${s.side}">${sideName(s.side)}</span>`;
}
function dots(n) { return `<span class="dots" title="Qo‘shimcha tasdiqlar: ${n}/4">${[0, 1, 2, 3].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; }

function cardHTML([sym, name, tick], v, err) {
  if (err) return `<article class="card is-err"><div class="c-head"><div><b>${esc(tick)}</b><small>${esc(name)}</small></div><span class="badge wait">—</span></div><p class="c-err">${esc(err)}</p></article>`;
  if (!v) return `<article class="card is-load"><div class="c-head"><div><b>${esc(tick)}</b><small>${esc(name)}</small></div><span class="sk"></span></div><div class="sk sk-line"></div></article>`;
  const { a, candles } = v, s = a.active, live = s && !s.done;
  const prev = candles[Math.max(0, candles.length - 25)][4], ch = (a.price - prev) / prev;
  const bt = a.bt;
  return `<article class="card${live ? ' is-' + s.side : ''}" data-sym="${esc(sym)}" tabindex="0" role="button">
    <div class="c-head">
      <div><b>${esc(tick)}</b><small>${esc(name)}</small></div>
      ${badge(a)}
    </div>
    <div class="c-price"><span class="mono">${fmt(a.price)}</span><em class="${ch >= 0 ? 'up' : 'down'}">${pct(ch)}</em></div>
    ${live ? `<div class="c-levels">
        <span>Kirish <b class="mono">${fmt(s.entry)}</b></span>
        <span>Stop <b class="mono down">${fmt(s.stop)}</b></span>
        <span>Maqsad <b class="mono up">${fmt(s.target)}</b></span>
      </div>
      <div class="c-meta">${dots(s.strength)}<span>${ago(s.time)}</span></div>` : `
      <div class="c-meta"><span>Trend: <b class="${a.trend > 0 ? 'up' : a.trend < 0 ? 'down' : ''}">${a.trend > 0 ? 'o‘sish' : a.trend < 0 ? 'pasayish' : '—'}</b></span><span>RSI ${a.rsi != null ? a.rsi.toFixed(0) : '—'}</span></div>`}
    <div class="c-bt" title="Shu aktivda oxirgi ${candles.length} shamdagi tarixiy sinov">
      Tarix: ${bt.count} savdo · yutuq ${(bt.winRate * 100).toFixed(0)}% · <b class="${bt.totalR >= 0 ? 'up' : 'down'}">${rFmt(bt.totalR)}</b>
    </div>
  </article>`;
}

let renderSeq = 0;
async function renderList() {
  const seq = ++renderSeq;
  const m = MARKETS[state.market];
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.market === state.market));
  document.querySelectorAll('#tfs button').forEach(b => b.classList.toggle('on', b.dataset.tf === state.tf));
  const list = $('#list');
  const results = new Map();
  const paint = () => {
    if (seq !== renderSeq) return;
    // faol signallar tepada
    const rank = it => { const v = results.get(it[0]); const s = v && v.a && v.a.active; return s && !s.done ? 0 : s ? 1 : 2; };
    const items = [...m.items].sort((x, y) => rank(x) - rank(y));
    list.innerHTML = items.map(it => { const v = results.get(it[0]); return cardHTML(it, v && v.a ? v : null, v && v.err); }).join('');
    const live = [...results.values()].filter(v => v.a && v.a.active && !v.a.active.done);
    $('#summary').innerHTML = `<span>${m.name} · ${TF_NAME[state.tf]}</span><span>${live.length ? `<b>${live.length}</b> ta faol signal` : 'Faol signal yo‘q — kutamiz'}</span>`;
  };
  paint();
  await Promise.all(m.items.map(async it => {
    try { results.set(it[0], await load(it[0], m.src, state.tf)); } catch (e) { results.set(it[0], { err: e.message }); }
    paint();
  }));
  if (seq !== renderSeq) return;
  checkNotify(m, results);
  $('#upd').textContent = `Yangilandi: ${new Date().toLocaleTimeString('uz')}`;
}

/* ---------- batafsil: grafik + tarix ---------- */
let chart = null;
function closeDetail() {
  state.open = null;
  if (chart) { chart.remove(); chart = null; }
  $('#detailView').hidden = true; $('#listView').hidden = false;
  if (location.hash) history.replaceState(null, '', location.pathname);
}

async function openDetail(sym, refresh = false) {
  const m = MARKETS[state.market], it = m.items.find(x => x[0] === sym);
  if (!it) return;
  state.open = sym;
  const box = $('#detailView');
  $('#listView').hidden = true; box.hidden = false;
  if (!refresh) window.scrollTo(0, 0);
  if (!refresh) box.innerHTML = '<div class="sk sk-chart"></div>';
  let v;
  try { v = await load(sym, m.src, state.tf); } catch (e) { box.innerHTML = `<p class="c-err">${esc(e.message)}</p>`; return; }
  if (state.open !== sym) return;
  const { a, candles } = v, s = a.active, bt = a.bt, [, name, tick] = it;
  const pf = bt.profitFactor === Infinity ? '∞' : bt.profitFactor.toFixed(2);
  const lastTrades = bt.trades.slice(-10).reverse();
  box.innerHTML = `
    <div class="d-head">
      <button class="icon-btn" id="back" type="button" aria-label="Orqaga"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div><h1>${esc(tick)} <small>${esc(name)}</small></h1><span class="mono d-price">${fmt(a.price)}</span></div>
      ${badge(a)}
    </div>
    <div class="chart" id="chart"></div>
    <div class="legend"><span><i style="background:#f5b942"></i>EMA21</span><span><i style="background:#7c8cff"></i>EMA200</span><span><i class="tri up"></i>sotib olish</span><span><i class="tri down"></i>sotish</span></div>
    ${s ? `<section class="panel sig ${s.done ? '' : 'is-' + s.side}">
      <h2>${s.done ? 'Oxirgi signal' : 'Faol signal'}: ${sideName(s.side)} ${dots(s.strength)}</h2>
      <div class="lv"><span>Kirish</span><b class="mono">${fmt(s.entry)}</b></div>
      <div class="lv"><span>Stop-loss</span><b class="mono down">${fmt(s.stop)}</b></div>
      <div class="lv"><span>Maqsad (1:2)</span><b class="mono up">${fmt(s.target)}</b></div>
      <div class="lv"><span>Vaqti</span><b>${new Date(s.time).toLocaleString('uz')} · ${ago(s.time)}</b></div>
      ${s.done ? `<p class="note">${s.done === 'target' ? 'Narx maqsadga yetdi — signal yopildi.' : 'Narx stopga tegdi — signal yopildi.'}</p>` : ''}
      <ul class="checks">
        <li class="${s.checks[0] ? 'ok' : ''}">Hajm o‘rtachadan 20% yuqori</li>
        <li class="${s.checks[1] ? 'ok' : ''}">Katta trend (EMA200) shu tomonga qiyalangan</li>
        <li class="${s.checks[2] ? 'ok' : ''}">RSI sog‘lom oraliqda (${s.rsi.toFixed(0)})</li>
        <li class="${s.checks[3] ? 'ok' : ''}">Narx EMA21 ning to‘g‘ri tomonida</li>
      </ul>
    </section>` : `<section class="panel"><h2>Hozir signal yo‘q</h2><p class="note">Trend: ${a.trend > 0 ? 'o‘sish (narx EMA200 dan yuqori) — faqat SOTIB OLISH signali kutiladi' : a.trend < 0 ? 'pasayish (narx EMA200 dan past) — faqat SOTISH signali kutiladi' : 'aniqlanmadi'}. RSI: ${a.rsi != null ? a.rsi.toFixed(0) : '—'}.</p></section>`}
    <section class="panel">
      <h2>Tarixiy natija <small>${candles.length} ta ${TF_NAME[state.tf]}lik sham</small></h2>
      <div class="stats">
        <div><span>Savdolar</span><b>${bt.count}</b></div>
        <div><span>Yutuq</span><b>${(bt.winRate * 100).toFixed(0)}%</b></div>
        <div><span>Jami</span><b class="${bt.totalR >= 0 ? 'up' : 'down'}">${rFmt(bt.totalR)}</b></div>
        <div><span>Profit faktor</span><b>${pf}</b></div>
        <div><span>Eng katta tushish</span><b class="down">−${bt.maxDD.toFixed(1)}R</b></div>
        <div><span>O‘rtacha</span><b>${rFmt(bt.avgR, 2)}</b></div>
      </div>
      <p class="note">1R — stopgacha bo‘lgan masofa (bitta savdodagi risk). Masalan, har savdoda depozitning 1% ini xavfga qo‘ysangiz, +5R ≈ +5%. ${bt.count < 20 ? '<b>Savdolar soni kam — natija tasodifiy bo‘lishi mumkin.</b>' : ''} ${bt.totalR < 0 ? '<b>Bu aktivda shu vaqt oralig‘ida strategiya zarar ko‘rsatgan.</b>' : ''}</p>
      ${lastTrades.length ? `<table class="trades"><thead><tr><th>Sana</th><th>Tomon</th><th>Kirish</th><th>Chiqish</th><th>Natija</th></tr></thead><tbody>
        ${lastTrades.map(t => `<tr><td>${new Date(candles[t.i][0]).toLocaleDateString('uz')}</td><td class="${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? 'Sotib olish' : 'Sotish'}</td><td class="mono">${fmt(t.entry)}</td><td class="mono">${fmt(t.exit)}</td><td class="${t.r >= 0 ? 'up' : 'down'}">${rFmt(t.r)}</td></tr>`).join('')}
      </tbody></table>` : ''}
    </section>
    <section class="panel rules">
      <h2>Signal qanday chiqadi</h2>
      <ol>
        <li><b>Trend:</b> narx EMA200 dan yuqori bo‘lsa — faqat sotib olish, past bo‘lsa — faqat sotish.</li>
        <li><b>Kirish:</b> EMA9 EMA21 ni trend tomonga kesib o‘tadi (sham yopilgandan keyin).</li>
        <li><b>Filtr:</b> RSI 45–70 (sotib olish) yoki 30–55 (sotish), MACD shu tomonda.</li>
        <li><b>Stop:</b> 1,5 × ATR, <b>maqsad:</b> 3 × ATR — risk/foyda 1:2.</li>
      </ol>
    </section>`;
  $('#back').addEventListener('click', closeDetail);
  drawChart(candles, a);
}

function drawChart(candles, a) {
  const el = $('#chart');
  if (chart) chart.remove();
  chart = LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: '#8b95a7', fontFamily: 'Inter, sans-serif' },
    grid: { vertLines: { color: 'rgba(255,255,255,.04)' }, horzLines: { color: 'rgba(255,255,255,.04)' } },
    rightPriceScale: { borderColor: 'rgba(255,255,255,.08)' },
    timeScale: { borderColor: 'rgba(255,255,255,.08)', timeVisible: state.tf !== '1d' },
    crosshair: { mode: 0 },
    localization: { locale: 'uz-UZ' },
  });
  const t = c => Math.floor(c[0] / 1000);
  const cs = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
  cs.setData(candles.map(c => ({ time: t(c), open: c[1], high: c[2], low: c[3], close: c[4] })));
  const line = (arr, color) => {
    const s = chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData(candles.map((c, i) => arr[i] == null ? null : { time: t(c), value: arr[i] }).filter(Boolean));
  };
  line(a.ind.ema21, '#f5b942');
  line(a.ind.ema200, '#7c8cff');
  // tarixiy signallar — belgilar
  const marks = [];
  for (let i = 201; i < candles.length - 1; i++) {
    const s = Signal.signalAt(candles, a.ind, i);
    if (s) marks.push(s.side === 'buy'
      ? { time: t(candles[i]), position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'B' }
      : { time: t(candles[i]), position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'S' });
  }
  cs.setMarkers(marks);
  const s = a.active;
  if (s && !s.done) {
    cs.createPriceLine({ price: s.entry, color: '#cbd5e1', lineStyle: 2, lineWidth: 1, title: 'Kirish' });
    cs.createPriceLine({ price: s.stop, color: '#ef4444', lineStyle: 2, lineWidth: 1, title: 'Stop' });
    cs.createPriceLine({ price: s.target, color: '#22c55e', lineStyle: 2, lineWidth: 1, title: 'Maqsad' });
  }
  const n = candles.length;
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 3 });
}

/* ---------- bildirishnomalar: yangi faol signal chiqsa ---------- */
function notifyOn() { return 'Notification' in window && Notification.permission === 'granted' && store.get('notify', false); }
function paintNotifyBtn() { $('#notifyBtn').classList.toggle('on', notifyOn()); }
$('#notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Bu brauzer bildirishnomalarni qo‘llamaydi.');
  if (notifyOn()) { store.set('notify', false); paintNotifyBtn(); return; }
  const p = await Notification.requestPermission();
  store.set('notify', p === 'granted');
  paintNotifyBtn();
  if (p === 'granted') new Notification('DezoSignal', { body: 'Bildirishnomalar yoqildi. Dastur ochiq turganda yangi signal chiqsa xabar beraman.', icon: 'icon-192.png' });
});

function checkNotify(m, results) {
  const seen = store.get('seen', {});
  let changed = false;
  for (const [sym, name, tick] of m.items) {
    const v = results.get(sym), s = v && v.a && v.a.active;
    if (!s || s.done) continue;
    const key = `${sym}:${state.tf}:${s.time}`;
    if (seen[key]) continue;
    seen[key] = Date.now(); changed = true;
    if (notifyOn() && s.age <= 1) {
      try { new Notification(`${tick}: ${sideName(s.side)} (${TF_NAME[state.tf]})`, { body: `Kirish ${fmt(s.entry)} · Stop ${fmt(s.stop)} · Maqsad ${fmt(s.target)}`, icon: 'icon-192.png', tag: key }); } catch {}
    }
  }
  if (changed) {
    for (const k of Object.keys(seen)) if (Date.now() - seen[k] > 14 * 864e5) delete seen[k];
    store.set('seen', seen);
  }
}

/* ---------- boshqaruv ---------- */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.market = b.dataset.market; store.set('market', state.market);
  closeDetail(); renderList();
});
$('#tfs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.tf = b.dataset.tf; store.set('tf', state.tf);
  const open = state.open;
  renderList();
  if (open) openDetail(open);
});
$('#list').addEventListener('click', e => { const c = e.target.closest('.card[data-sym]'); if (c) { history.pushState(null, '', '#' + c.dataset.sym); openDetail(c.dataset.sym); } });
$('#list').addEventListener('keydown', e => { if (e.key === 'Enter') { const c = e.target.closest('.card[data-sym]'); if (c) openDetail(c.dataset.sym); } });
addEventListener('popstate', () => { if (!location.hash) closeDetail(); });

function tick() {
  clearTimeout(state.timer);
  renderList().finally(() => { state.timer = setTimeout(tick, REFRESH_MS); });
  if (state.open) openDetail(state.open, true);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

paintNotifyBtn();
tick();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
