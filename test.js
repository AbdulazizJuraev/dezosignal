/* node test.js — indikatorlar to'g'riligi va haqiqiy ma'lumotda tarixiy sinov (internet kerak) */
const S = require('./public/js/signal.js');
const assert = require('assert');
// EMA: o'zgarmas qatorda o'zi
assert.deepStrictEqual(S.ema([2, 2, 2, 2], 2).slice(1), [2, 2, 2]);
// RSI: faqat o'sish — 100
assert.strictEqual(S.rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14)[15], 100);
// SMA
assert.deepStrictEqual(S.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
console.log('indikatorlar: OK');

(async () => {
  for (const [src, sym] of [['binance', 'BTCUSDT'], ['binance', 'ETHUSDT'], ['yahoo', 'EURUSD=X'], ['yahoo', 'GC=F'], ['yahoo', 'AAPL']]) {
    for (const tf of ['1h', '4h', '1d']) {
      const r = await fetch(`http://localhost:${process.env.PORT || 5588}/api/candles?src=${src}&symbol=${encodeURIComponent(sym)}&tf=${tf}`);
      const j = await r.json();
      if (!r.ok) { console.log(sym, tf, 'XATO', j.error); continue; }
      const a = S.analyze(j.candles);
      const b = a.bt;
      console.log(`${sym.padEnd(9)} ${tf.padEnd(3)} ${String(j.candles.length).padStart(4)} sham | savdolar ${String(b.count).padStart(3)} | yutuq ${(b.winRate * 100).toFixed(0).padStart(3)}% | jami ${b.totalR.toFixed(1).padStart(6)}R | PF ${b.profitFactor === Infinity ? '∞' : b.profitFactor.toFixed(2)} | maxDD ${b.maxDD.toFixed(1)}R | hozir: ${a.active ? a.active.side + (a.active.done ? ' (' + a.active.done + ')' : '') : '—'}`);
    }
  }
})();
