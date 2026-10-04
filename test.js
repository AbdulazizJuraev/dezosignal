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

// Demo bot: qo'lda ochilgan pozitsiya stopga tegsa yopiladi, pul to'g'ri qaytadi
globalThis.Signal = S;
const B = require('./public/js/bot.js');
{
  const a = B.newAccount({ start: 1000, riskPct: 1, maxPos: 2 });
  const p = B.open(a, { sym: 'X', tick: 'X', entry: 100, time: 0, atr: 2 }, []);   // risk 3, stop 97, maqsad 106
  assert.ok(p && Math.abs(p.stop - 97) < 1e-9 && Math.abs(p.target - 106) < 1e-9);
  assert.ok(p.cost <= 500 * (1 + B.FEE) + 1e-6);                                   // ≤ depozit / maxPos
  const flat = Array.from({ length: 260 }, (_, i) => [i + 1, 100, 100.5, 99.5, 100, 1]);
  flat.push([300, 98, 98, 96, 96, 1], [301, 96, 96, 96, 96, 1]);                   // pasayish → stop
  a.cursor.k = 259;
  B.run(a, [{ sym: 'X', tick: 'X', key: 'k', c: flat, ind: S.indicators(flat) }]);
  assert.strictEqual(a.positions.length, 0);
  assert.strictEqual(a.trades[0].reason, 'stop');
  assert.ok(Math.abs(a.trades[0].pnl - -10 * 0.03 * 100 / 3) < 1.5);              // ~1% risk (+komissiya)
  assert.ok(Math.abs(a.cash + 0 - (1000 + a.trades[0].pnl)) < 1e-6);
}
console.log('demo bot: OK');

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
