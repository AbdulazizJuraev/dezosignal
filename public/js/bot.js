/* ============================================================
   DezoSignal — avtomatik savdo boti (DEMO: virtual pul, haqiqiy narxlar)
   Brauzerda ham, Node'da ham ishlaydi (test.js).

   Qoidalar (spot — faqat sotib olish, qarzga/leverage yo'q):
     Kirish:   yopilgan shamda SOTIB OLISH signali (signal.js) → keyingi sham ochilishida (yoki hozirgi narxda) olamiz
     Hajm:     har savdoda depozitning riskPct % i xavfda (kirish − stop masofasi bo'yicha), bitta pozitsiya ≤ depozit / maxPos
     Chiqish:  stop-loss (1,5 ATR) · maqsad (3 ATR) · SOTISH signali chiqsa — darhol
     Himoya:   narx +1R ga chiqsa — stop kirish narxiga (zararsiz) ko'chadi;
               +1,5R dan keyin stop eng yuqori narxdan 1,5 ATR pastda ergashib boradi (pasayish boshlansa — foydani olib chiqadi)
     Komissiya: har tomonga 0,1% (Binance spot)
   Ilova yopiq bo'lsa ham: ochilganda o'tib ketgan shamlar ketma-ket hisoblanadi (bot 24/7 ishlagandek).
   ============================================================ */

(function (root) {
  const S = root.Signal || (typeof require !== 'undefined' ? require('./signal.js') : null);
  const T = 0, O = 1, H = 2, L = 3, CL = 4;
  const FEE = 0.001;

  const DEFAULTS = { start: 1000, riskPct: 1, maxPos: 3, tf: '1h', markets: ['crypto'], minStrength: 0, trail: true };

  function newAccount(settings) {
    const st = { ...DEFAULTS, ...(settings || {}) };
    return { v: 1, on: false, settings: st, cash: st.start, positions: [], trades: [], cursor: {}, log: [], created: Date.now(), equityLog: [] };
  }

  const posValue = (p, price) => p.qty * price;
  function equity(acct, prices) {
    return acct.cash + acct.positions.reduce((s, p) => s + posValue(p, (prices && prices[p.sym]) || p.last || p.entry), 0);
  }

  function log(acct, ev, out) {
    acct.log.unshift(ev);
    if (acct.log.length > 200) acct.log.length = 200;
    if (out) out.push(ev);
  }

  function closePos(acct, p, price, time, reason, out) {
    const gross = p.qty * price, fee = gross * FEE;
    acct.cash += gross - fee;
    const pnl = gross - fee - p.cost;                      // p.cost — kirishdagi to'lov (komissiya bilan)
    const t = { sym: p.sym, tick: p.tick, entry: p.entry, exit: price, qty: p.qty, openTime: p.time, time, reason, pnl, pnlPct: pnl / p.cost, r: (price - p.entry) / p.risk };
    acct.trades.unshift(t);
    if (acct.trades.length > 500) acct.trades.length = 500;
    acct.positions = acct.positions.filter(x => x !== p);
    log(acct, { type: 'close', ...t }, out);
    return t;
  }

  // Bitta sham bo'yicha ochiq pozitsiyani tekshirish: avval stop (ehtiyotkor), keyin maqsad
  function checkExit(acct, p, c, out) {
    if (c[L] <= p.stop) {
      const price = Math.min(p.stop, c[O]);              // narx stopdan pastda ochilsa (uzilish) — ochilish narxida
      return closePos(acct, p, price, c[T], p.stop > p.be * 1.0005 ? 'trail' : p.stop >= p.be ? 'even' : 'stop', out);
    }
    if (c[H] >= p.target) return closePos(acct, p, Math.max(p.target, c[O]), c[T], 'target', out);
    return null;
  }

  // Yopilgan sham tugagach stopni ko'tarish (zararsiz → ergashuvchi)
  function trail(acct, p, c, atrNow) {
    if (!acct.settings.trail) return;
    p.high = Math.max(p.high, c[H]);
    const gain = (p.high - p.entry) / p.risk;
    let ns = p.stop;
    if (gain >= 1) ns = Math.max(ns, p.be);
    if (gain >= 1.5 && atrNow) ns = Math.max(ns, p.high - 1.5 * atrNow);
    if (ns > p.stop) p.stop = ns;
  }

  /* Botni yurgizish. feeds: [{ sym, tick, key, c, ind }] — c: shamlar (oxirgisi hali yopilmagan), ind: S.indicators(c).
     Bir nechta aktivning shamlari VAQT TARTIBIDA birga hisoblanadi (ilova uzoq yopiq turgan bo'lsa ham to'g'ri navbat, pul va limit).
     Har bir vaqtda: avval chiqishlar, keyin kirishlar. Qaytaradi: yangi hodisalar ro'yxati. */
  function run(acct, feeds) {
    const out = [], st = acct.settings;
    const fs = feeds.filter(f => f.c.length - 2 >= 202).map(f => {
      const last = f.c.length - 1, lastClosed = last - 1, cur = acct.cursor[f.key];
      let from;
      if (cur == null) { acct.cursor[f.key] = f.c[lastClosed][T]; from = lastClosed + 1; }   // yangi aktiv — tarixga qaytmaymiz
      else { from = f.c.findIndex(x => x[T] > cur); if (from < 0) from = last; from = Math.max(from, 202); }
      return { ...f, last, lastClosed, i: from };
    });
    for (;;) {
      let t = Infinity;
      for (const f of fs) if (f.i <= f.lastClosed) t = Math.min(t, f.c[f.i][T]);
      if (t === Infinity) break;
      const now = fs.filter(f => f.i <= f.lastClosed && f.c[f.i][T] === t);
      for (const f of now) {                                 // 1) chiqishlar
        const c = f.c, i = f.i;
        let p = acct.positions.find(x => x.sym === f.sym);
        if (p && c[i][T] >= p.time) {
          // sham o'rtasida kirilgan bo'lsa — shu shamning kirishdan OLDINGI past/yuqori nuqtalari hisobga olinmaydi
          const bar = p.mid === c[i][T] ? [c[i][T], c[i][CL], c[i][CL], c[i][CL], c[i][CL]] : c[i];
          if (checkExit(acct, p, bar, out)) p = null;
          else { trail(acct, p, bar, f.ind.atr[i]); p.last = c[i][CL]; }
        }
        f.sig = S.signalAt(c, f.ind, i);
        if (p && f.sig && f.sig.side === 'sell') closePos(acct, p, c[i][CL], c[i][T], 'signal', out);
      }
      for (const f of now) {                                 // 2) kirishlar
        const c = f.c, i = f.i, s = f.sig;
        if (acct.on && s && s.side === 'buy' && s.strength >= st.minStrength && acct.positions.length < st.maxPos && !acct.positions.some(x => x.sym === f.sym)) {
          const mid = i + 1 === f.last;                     // keyingi sham hali yopilmagan — hozirgi narxda kiramiz
          const p = open(acct, { sym: f.sym, tick: f.tick, entry: mid ? c[f.last][CL] : c[i + 1][O], time: c[i + 1][T], atr: f.ind.atr[i] }, out);
          if (p && mid) p.mid = c[f.last][T];
        }
        acct.cursor[f.key] = c[i][T];
        f.i++;
      }
    }
    // hali yopilmagan sham: faqat stop/maqsad (narx tushib ketsa — sham yopilishini kutmasdan chiqamiz)
    for (const f of fs) {
      const p = acct.positions.find(x => x.sym === f.sym), c = f.c[f.last];
      if (!p) continue;
      p.last = c[CL];
      if (c[T] < p.time) continue;
      // pozitsiya shu shamda ochilgan bo'lsa — shamning oldingi past/yuqori nuqtalari hisobga olinmaydi, faqat joriy narx
      checkExit(acct, p, p.mid === c[T] ? [c[T], c[CL], c[CL], c[CL], c[CL]] : c, out);
    }
    return out;
  }
  const step = (acct, info, c, ind) => run(acct, [{ ...info, c, ind }]);

  function open(acct, { sym, tick, entry, time, atr }, out) {
    const st = acct.settings;
    const risk = 1.5 * atr;
    if (!(risk > 0) || !(entry > 0)) return null;
    const eq = equity(acct);
    let qty = (eq * st.riskPct / 100) / risk;
    const maxCost = Math.min(acct.cash / (1 + FEE), eq / st.maxPos);
    if (qty * entry > maxCost) qty = maxCost / entry;
    if (qty * entry < 5) return null;                      // juda kichik — birja ham qabul qilmaydi (min ~5$)
    const cost = qty * entry * (1 + FEE);
    acct.cash -= cost;
    const be = entry * (1 + FEE) / (1 - FEE) * 1.0002;     // zararsiz nuqta: ikki tomonlama komissiya qoplanadi
    const p = { sym, tick, entry, qty, cost, time, risk, be, stop: entry - risk, target: entry + 2 * risk, high: entry, last: entry };
    acct.positions.push(p);
    log(acct, { type: 'open', sym, tick, entry, qty, cost, time, stop: p.stop, target: p.target }, out);
    return p;
  }

  // Qo'lda yopish (foydalanuvchi tugmasi)
  function closeManual(acct, sym, price) {
    const p = acct.positions.find(x => x.sym === sym);
    return p ? closePos(acct, p, price, Date.now(), 'manual', []) : null;
  }

  function stats(acct, prices) {
    const eq = equity(acct, prices), tr = acct.trades;
    const wins = tr.filter(t => t.pnl > 0);
    const day = Date.now() - 864e5;
    return {
      equity: eq, pnl: eq - acct.settings.start, pnlPct: (eq - acct.settings.start) / acct.settings.start,
      count: tr.length, winRate: tr.length ? wins.length / tr.length : 0,
      today: tr.filter(t => t.time >= day).reduce((s, t) => s + t.pnl, 0),
    };
  }

  const api = { DEFAULTS, FEE, newAccount, run, step, open, closeManual, equity, stats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bot = api;
})(typeof window !== 'undefined' ? window : globalThis);
