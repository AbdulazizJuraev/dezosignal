/* ============================================================
   DezoSignal — indikatorlar, signal qoidalari va tarixiy sinov (backtest)
   Brauzerda ham, Node'da ham ishlaydi (test.js).

   STRATEGIYA «Trend + Impuls» (oddiy va tekshiriladigan qoidalar):
     Trend:   narx EMA200 dan yuqori → faqat SOTIB OLISH, past → faqat SOTISH
     Kirish:  EMA9 EMA21 ni trend tomonga kesib o'tadi (yopilgan shamda)
     Filtr:   RSI(14) 45–70 (sotib olish) / 30–55 (sotish) — haddan oshgan bozorga kirmaymiz
              MACD gistogrammasi signal tomonida
     Stop:    1.5 × ATR(14)      Maqsad: 3 × ATR (risk/foyda 1:2)
   Kuch (0–4 tasdiq): hajm o'rtachadan yuqori, EMA200 qiyaligi, RSI 50–65 / 35–50, narx EMA21 ning to'g'ri tomonida.
   Bu — matematik qoida, kafolat emas. Tarixiy natija ham har bir aktiv uchun ko'rsatiladi.
   ============================================================ */

(function (root) {
  const C = { T: 0, O: 1, H: 2, L: 3, CL: 4, V: 5 };

  function ema(values, period) {
    const out = new Array(values.length).fill(null), k = 2 / (period + 1);
    let prev = null, sum = 0;
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) { sum += values[i]; continue; }
      if (i === period - 1) { sum += values[i]; prev = sum / period; }
      else prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  // Wilder RSI
  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    let gain = 0, loss = 0;
    for (let i = 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
      if (i <= period) { gain += g; loss += l; if (i === period) { gain /= period; loss /= period; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); } continue; }
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }

  // Wilder ATR
  function atr(c, period = 14) {
    const out = new Array(c.length).fill(null);
    let prev = null, sum = 0;
    for (let i = 0; i < c.length; i++) {
      const tr = i === 0 ? c[i][C.H] - c[i][C.L]
        : Math.max(c[i][C.H] - c[i][C.L], Math.abs(c[i][C.H] - c[i - 1][C.CL]), Math.abs(c[i][C.L] - c[i - 1][C.CL]));
      if (i < period) { sum += tr; if (i === period - 1) { prev = sum / period; out[i] = prev; } continue; }
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
    return out;
  }

  function macdHist(closes) {
    const f = ema(closes, 12), s = ema(closes, 26);
    const line = closes.map((_, i) => f[i] != null && s[i] != null ? f[i] - s[i] : null);
    const start = line.findIndex(v => v != null);
    const sig = new Array(closes.length).fill(null);
    if (start >= 0) ema(line.slice(start), 9).forEach((v, j) => { sig[start + j] = v; });
    return line.map((v, i) => v != null && sig[i] != null ? v - sig[i] : null);
  }

  function indicators(c) {
    const closes = c.map(x => x[C.CL]), vols = c.map(x => x[C.V] || 0);
    return { ema9: ema(closes, 9), ema21: ema(closes, 21), ema200: ema(closes, 200), rsi: rsi(closes), atr: atr(c), hist: macdHist(closes), volAvg: sma(vols, 20) };
  }

  // i-shamda (yopilgan) signal bormi: { side: 'buy'|'sell', strength, entry, stop, target } yoki null
  function signalAt(c, ind, i) {
    if (i < 201) return null;
    const { ema9, ema21, ema200, rsi: r, atr: a, hist, volAvg } = ind;
    if ([ema9[i], ema21[i], ema9[i - 1], ema21[i - 1], ema200[i], r[i], a[i], hist[i]].some(v => v == null)) return null;
    const close = c[i][C.CL];
    const up = ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i];
    const down = ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i];
    let side = null;
    if (up && close > ema200[i] && r[i] >= 45 && r[i] <= 70 && hist[i] > 0) side = 'buy';
    if (down && close < ema200[i] && r[i] >= 30 && r[i] <= 55 && hist[i] < 0) side = 'sell';
    if (!side) return null;
    const buy = side === 'buy';
    const checks = [
      volAvg[i] ? (c[i][C.V] || 0) > volAvg[i] * 1.2 : false,                 // hajm kuchli
      ema200[i - 10] != null && (buy ? ema200[i] > ema200[i - 10] : ema200[i] < ema200[i - 10]),   // katta trend qiyaligi
      buy ? r[i] >= 50 && r[i] <= 65 : r[i] >= 35 && r[i] <= 50,                // impuls «sog'lom» oraliqda
      buy ? close > ema21[i] : close < ema21[i],
    ];
    return {
      side, i, time: c[i][C.T], entry: close,
      stop: buy ? close - 1.5 * a[i] : close + 1.5 * a[i],
      target: buy ? close + 3 * a[i] : close - 3 * a[i],
      strength: checks.filter(Boolean).length,          // 0–4 qo'shimcha tasdiq
      checks,
      rsi: r[i],
    };
  }

  /* Tarixiy sinov: signal → keyingi sham ochilishida kirish; stop yoki maqsadga tegguncha.
     Bitta shamda ikkalasiga ham tegsa — stop (ehtiyotkor hisob). Qarama-qarshi signal — yopilish narxida chiqish.
     Natija R da (1R = stopgacha bo'lgan masofa). */
  function backtest(c, ind) {
    const trades = [];
    let pos = null;
    for (let i = 201; i < c.length - 1; i++) {
      if (pos) {
        const h = c[i][C.H], l = c[i][C.L], buy = pos.side === 'buy';
        const hitStop = buy ? l <= pos.stop : h >= pos.stop;
        const hitTarget = buy ? h >= pos.target : l <= pos.target;
        if (hitStop || hitTarget) {
          const exit = hitStop ? pos.stop : pos.target;
          trades.push({ ...pos, exitI: i, exit, r: rOf(pos, exit), win: !hitStop });
          pos = null;
        }
      }
      const s = signalAt(c, ind, i);
      if (s && pos && s.side !== pos.side) {        // qarama-qarshi signal — chiqamiz
        const exit = c[i][C.CL];
        trades.push({ ...pos, exitI: i, exit, r: rOf(pos, exit), win: rOf(pos, exit) > 0 });
        pos = null;
      }
      if (s && !pos) {
        const entry = c[i + 1][C.O], risk = Math.abs(s.entry - s.stop);
        pos = { side: s.side, i: i + 1, entry, stop: s.side === 'buy' ? entry - risk : entry + risk, target: s.side === 'buy' ? entry + 2 * risk : entry - 2 * risk, risk };
      }
    }
    const wins = trades.filter(t => t.win), totalR = trades.reduce((s, t) => s + t.r, 0);
    const grossWin = trades.filter(t => t.r > 0).reduce((s, t) => s + t.r, 0), grossLoss = -trades.filter(t => t.r < 0).reduce((s, t) => s + t.r, 0);
    let peak = 0, eq = 0, dd = 0;
    for (const t of trades) { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    return {
      trades, open: pos,
      count: trades.length,
      winRate: trades.length ? wins.length / trades.length : 0,
      totalR, avgR: trades.length ? totalR / trades.length : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
      maxDD: dd,
    };
  }
  const rOf = (pos, exit) => (pos.side === 'buy' ? exit - pos.entry : pos.entry - exit) / pos.risk;

  /* Aktivning hozirgi holati: oxirgi YOPILGAN shamgacha.
     Faol signal — oxirgi 5 sham ichida chiqqan va hali stop/maqsadga tegmagan. */
  function analyze(c) {
    const ind = indicators(c);
    const last = c.length - 2;                  // oxirgi sham hali yopilmagan
    const bt = backtest(c.slice(0, -1), indicators(c.slice(0, -1)));
    let active = null;
    for (let i = last; i >= Math.max(201, last - 4); i--) {
      const s = signalAt(c, ind, i);
      if (!s) continue;
      const buy = s.side === 'buy';
      let done = null;
      for (let j = i + 1; j < c.length; j++) {
        if (buy ? c[j][C.L] <= s.stop : c[j][C.H] >= s.stop) { done = 'stop'; break; }
        if (buy ? c[j][C.H] >= s.target : c[j][C.L] <= s.target) { done = 'target'; break; }
      }
      active = { ...s, done, age: last - i };
      break;
    }
    const price = c[c.length - 1][C.CL];
    const trend = ind.ema200[last] == null ? 0 : c[last][C.CL] > ind.ema200[last] ? 1 : -1;
    return { ind, bt, active, price, trend, rsi: ind.rsi[last], last };
  }

  const api = { ema, sma, rsi, atr, macdHist, indicators, signalAt, backtest, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Signal = api;
})(typeof window !== 'undefined' ? window : globalThis);
