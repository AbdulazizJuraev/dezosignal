/* ============================================================
   DezoSignal — «Bot» bo'limi: Demo (virtual pul bilan avtomatik savdo) va Real (birjaga ulanish — tayyorlanmoqda)
   Hisob shu qurilmada saqlanadi (localStorage: ds_bot). Har 60 soniyada app.js dagi tick() botTick() ni chaqiradi.
   ============================================================ */

const REASON = { target: 'Maqsad', stop: 'Stop-loss', trail: 'Foyda saqlandi', even: 'Zararsiz', signal: 'Sotish signali', manual: 'Qo‘lda' };
const money = x => (x <= -0.005 ? '−' : '') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const smoney = x => (x >= 0.005 ? '+' : '') + money(x);

let bot = store.get('bot', null);
if (!bot || bot.v !== 1) bot = Bot.newAccount();
const botSave = () => store.set('bot', bot);
let botMode = store.get('botMode', 'demo');
let botBusy = false, botAt = 0, botErr = '';

function botPrices() {
  const p = {};
  for (const x of bot.positions) p[x.sym] = x.last;
  return p;
}
function botItems() {
  const out = [];
  for (const mk of bot.settings.markets) {
    const m = MARKETS[mk];
    if (m) for (const it of m.items) out.push({ it, src: m.src });
  }
  // ochiq pozitsiyasi bor, lekin bozori o'chirilgan aktivlar ham kuzatiladi (stopni ushlab turish uchun)
  for (const p of bot.positions) if (!out.some(x => x.it[0] === p.sym)) {
    for (const m of Object.values(MARKETS)) { const it = m.items.find(x => x[0] === p.sym); if (it) out.push({ it, src: m.src }); }
  }
  return out;
}

async function botTick() {
  if (botBusy || (!bot.on && !bot.positions.length)) return;
  botBusy = true; botErr = '';
  const events = [];
  try {
    const tf = bot.settings.tf;
    // narxlar ketma-ket olinadi (bir vaqtda 24 so'rov yubormaymiz), keyin hammasi vaqt tartibida birga hisoblanadi
    const feeds = [];
    for (const { it, src } of botItems()) {
      try {
        const v = await load(it[0], src, tf);          // app.js — keshlangan
        feeds.push({ sym: it[0], tick: it[2], key: `${it[0]}:${tf}`, c: v.candles, ind: v.a.ind });
      } catch (e) { botErr = `${it[2]}: ${e.message}`; }
    }
    events.push(...Bot.run(bot, feeds));
    bot.equityLog.push([Date.now(), Bot.equity(bot, botPrices())]);
    if (bot.equityLog.length > 2000) bot.equityLog.splice(0, bot.equityLog.length - 2000);
    botAt = Date.now();
    botSave();
  } finally { botBusy = false; }
  for (const ev of events) botNotify(ev);
  if (!$('#botView').hidden) renderBot();
}

function botNotify(ev) {
  if (!notifyOn()) return;
  const title = ev.type === 'open' ? `Demo bot: ${ev.tick} sotib oldi` : `Demo bot: ${ev.tick} yopildi (${REASON[ev.reason] || ev.reason})`;
  const body = ev.type === 'open' ? `${fmt(ev.entry)} · ${money(ev.cost)} · stop ${fmt(ev.stop)}` : `${fmt(ev.entry)} → ${fmt(ev.exit)} · ${smoney(ev.pnl)}`;
  try { new Notification(title, { body, icon: 'icon-192.png', tag: 'bot-' + ev.sym + ev.time }); } catch {}
}

/* ---------- ko'rinish ---------- */
function showBot(on) {
  $('#botView').hidden = !on;
  $('#listView').hidden = on;
  $('#detailView').hidden = true;
  $('#tfs').style.visibility = on ? 'hidden' : '';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', on ? b.dataset.view === 'bot' : b.dataset.market === state.market));
  if (on) { renderBot(); botTick(); }
}

function posHTML(p) {
  const now = p.last, pnl = p.qty * now * (1 - Bot.FEE) - p.cost, pp = pnl / p.cost;
  const moved = p.stop > p.entry - p.risk + 1e-12;
  return `<article class="bpos ${pnl >= 0 ? 'is-up' : 'is-down'}">
    <div class="c-head"><div><b>${esc(p.tick)}</b><small>${new Date(p.time).toLocaleString('uz')}</small></div>
      <div class="bpos-pnl ${pnl >= 0 ? 'up' : 'down'}"><b class="mono">${smoney(pnl)}</b><small>${pct(pp)}</small></div></div>
    <div class="c-levels">
      <span>Kirish <b class="mono">${fmt(p.entry)}</b></span>
      <span>Hozir <b class="mono">${fmt(now)}</b></span>
      <span>Summa <b class="mono">${money(p.cost)}</b></span>
      <span>Stop${moved ? ' ↑' : ''} <b class="mono down">${fmt(p.stop)}</b></span>
      <span>Maqsad <b class="mono up">${fmt(p.target)}</b></span>
      <span><button class="bbtn sm" type="button" data-close="${esc(p.sym)}">Yopish</button></span>
    </div>
    ${moved ? `<p class="note">Stop ko‘tarilgan: narx qaytib tushsa ham ${p.stop >= p.entry ? 'zarar ko‘rmasdan' : 'kamroq zarar bilan'} chiqadi.</p>` : ''}
  </article>`;
}

function demoHTML() {
  const st = Bot.stats(bot, botPrices()), s = bot.settings;
  const inPos = bot.positions.reduce((a, p) => a + p.qty * p.last, 0);
  const mk = s.markets.map(k => MARKETS[k] ? MARKETS[k].name : k).join(', ') || '—';
  return `
    <section class="panel beq">
      <div class="beq-top">
        <div><span class="lbl">Demo hisob</span><b class="mono beq-val">${money(st.equity)}</b>
          <em class="${st.pnl >= 0 ? 'up' : 'down'}">${smoney(st.pnl)} (${pct(st.pnlPct)})</em></div>
        <button class="bbtn ${bot.on ? 'stop' : 'go'}" type="button" id="botToggle">${bot.on ? 'To‘xtatish' : 'Botni ishga tushirish'}</button>
      </div>
      <div class="stats">
        <div><span>Bo‘sh pul</span><b class="mono">${money(bot.cash)}</b></div>
        <div><span>Savdoda</span><b class="mono">${money(inPos)}</b></div>
        <div><span>24 soatda</span><b class="mono ${st.today >= 0 ? 'up' : 'down'}">${smoney(st.today)}</b></div>
        <div><span>Savdolar</span><b>${st.count}</b></div>
        <div><span>Yutuq</span><b>${st.count ? (st.winRate * 100).toFixed(0) + '%' : '—'}</b></div>
        <div><span>Risk / savdo</span><b>${s.riskPct}%</b></div>
      </div>
      <p class="note bstatus"><i class="dot ${bot.on ? 'on' : ''}"></i>${bot.on
        ? `Bot ishlayapti · ${mk} · ${TF_NAME[s.tf]}lik shamlar${botAt ? ` · tekshirildi ${new Date(botAt).toLocaleTimeString('uz')}` : ''}`
        : bot.positions.length ? 'Bot to‘xtatilgan: yangi savdo ochmaydi, ochiqlarini stop/maqsadgacha kuzatadi.' : 'Bot to‘xtatilgan.'}
        ${botErr ? `<br><span class="down">${esc(botErr)}</span>` : ''}</p>
    </section>

    <h3 class="bh">Ochiq savdolar <small>${bot.positions.length}/${s.maxPos}</small></h3>
    ${bot.positions.length ? `<div class="list">${bot.positions.map(posHTML).join('')}</div>`
      : `<p class="empty">${bot.on ? 'Hozir ochiq savdo yo‘q — bot sotib olish signalini kutyapti. Signal kam chiqadi (har aktivda haftasiga 1–2 marta), bu normal.' : 'Botni ishga tushiring — u signal chiqqanda o‘zi sotib oladi.'}</p>`}

    <h3 class="bh">Tarix <small>${bot.trades.length} ta</small></h3>
    ${bot.trades.length ? `<div class="panel tight"><table class="trades btrades"><thead><tr><th>Sana</th><th>Aktiv</th><th>Kirish → Chiqish</th><th>Natija</th><th>Sabab</th></tr></thead><tbody>
      ${[...bot.trades].sort((p, q) => q.time - p.time).slice(0, 50).map(t => `<tr><td>${new Date(t.time).toLocaleDateString('uz')}</td><td>${esc(t.tick)}</td><td class="mono">${fmt(t.entry)} → ${fmt(t.exit)}</td><td class="${t.pnl >= 0 ? 'up' : 'down'}">${smoney(t.pnl)}</td><td>${REASON[t.reason] || t.reason}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Hali yopilgan savdo yo‘q.</p>'}

    <details class="panel bset" ${bot.trades.length || bot.on ? '' : 'open'}>
      <summary>Sozlamalar</summary>
      <form id="botForm">
        <label>Boshlang‘ich pul ($)<input name="start" type="number" min="10" step="10" value="${s.start}"></label>
        <label>Har savdoda risk (%)<input name="riskPct" type="number" min="0.1" max="5" step="0.1" value="${s.riskPct}"><small>Stopga tegsa depozitning shuncha foizi yo‘qoladi. 0,5–2% tavsiya etiladi.</small></label>
        <label>Bir vaqtda maksimal savdo<input name="maxPos" type="number" min="1" max="8" step="1" value="${s.maxPos}"></label>
        <label>Shamlar<select name="tf">${['15m', '1h', '4h', '1d'].map(k => `<option value="${k}"${k === s.tf ? ' selected' : ''}>${TF_NAME[k]}</option>`).join('')}</select></label>
        <label>Minimal signal kuchi (0–4)<input name="minStrength" type="number" min="0" max="4" step="1" value="${s.minStrength}"></label>
        <fieldset><legend>Bozorlar</legend>${Object.entries(MARKETS).map(([k, m]) => `<label class="chk"><input type="checkbox" name="mk" value="${k}"${s.markets.includes(k) ? ' checked' : ''}> ${m.name}</label>`).join('')}</fieldset>
        <label class="chk"><input type="checkbox" name="trail"${s.trail ? ' checked' : ''}> Narx tushishni boshlasa foydani saqlab chiqish (ergashuvchi stop)</label>
        <div class="brow"><button class="bbtn" type="submit">Saqlash</button><button class="bbtn ghost" type="button" id="botReset">Demoni qaytadan boshlash</button></div>
        <p class="note">Boshlang‘ich pul faqat «qaytadan boshlash»da qo‘llanadi.</p>
      </form>
    </details>

    <section class="panel rules">
      <h2>Bot qanday ishlaydi</h2>
      <ol>
        <li><b>Kirish:</b> «Signallar»dagi SOTIB OLISH signali chiqsa (sham yopilgandan keyin) — o‘zi sotib oladi.</li>
        <li><b>Summa:</b> stopga tegsa depozitning ${s.riskPct}% idan ko‘p yo‘qotilmaydigan qilib hisoblaydi.</li>
        <li><b>Chiqish:</b> maqsadga yetsa (1:2) — foydani oladi; stopga tegsa — zararni kesadi; SOTISH signali chiqsa — darhol chiqadi.</li>
        <li><b>Pasayishni sezsa:</b> narx +1R o‘sgach stop kirish narxiga ko‘chadi, keyin narx ortidan ergashadi — narx qaytib tusha boshlasa foyda bilan chiqadi.</li>
        <li><b>Komissiya</b> (0,1%) hisobga olinadi. Faqat spot: qarz/leverage yo‘q, «short» yo‘q.</li>
        <li>Ilova yopiq bo‘lsa ham hisob yo‘qolmaydi: ochilganda o‘tib ketgan shamlar ketma-ket hisoblanadi.</li>
      </ol>
      <p class="note"><b>Demo — virtual pul.</b> Haqiqiy pul tikishdan oldin kamida 3–4 hafta demo natijasini kuzating. Tarixiy sinovda bu strategiya ko‘p aktivlarda deyarli nolga yaqin natija bergan — kafolat yo‘q.</p>
    </section>`;
}

function realHTML() {
  return `
    <section class="panel">
      <h2>Real savdo <span class="badge wait">Ulanmagan</span></h2>
      <p class="note" style="margin-top:0">Real bo‘limda bot sizning birja hisobingizda <b>haqiqiy pul</b> bilan xuddi Demo’dagi qoidalar bo‘yicha savdo qiladi.
        Hali ulanmagan — quyidagilar tayyor bo‘lishi kerak:</p>
      <ul class="checks">
        <li>Birjada hisob (masalan Binance) va undan <b>API kalit</b> — faqat «savdo» ruxsati, <b>pul yechish o‘chirilgan</b>, IP bilan cheklangan.</li>
        <li>Bot 24/7 ishlashi uchun <b>server</b> (telefon uxlab qoladi). Kalit faqat serverda turadi — ilovada ham, GitHub’da ham emas.</li>
        <li>Himoya: kunlik zarar chegarasi, maksimal summa, «hammasini yopish» tugmasi.</li>
        <li>Avval Demo’da kamida 3–4 hafta ijobiy natija.</li>
      </ul>
      <p class="note">Joriy demo: <b class="${Bot.stats(bot, botPrices()).pnl >= 0 ? 'up' : 'down'}">${smoney(Bot.stats(bot, botPrices()).pnl)}</b>, ${bot.trades.length} ta savdo.</p>
    </section>`;
}

function renderBot() {
  const box = $('#botView');
  const open = box.querySelector('.bset')?.open;
  box.innerHTML = `
    <div class="seg" id="botSeg"><button data-mode="demo" class="${botMode === 'demo' ? 'on' : ''}">Demo</button><button data-mode="real" class="${botMode === 'real' ? 'on' : ''}">Real</button></div>
    ${botMode === 'demo' ? demoHTML() : realHTML()}`;
  if (open != null && box.querySelector('.bset')) box.querySelector('.bset').open = open;
}

$('#botView').addEventListener('click', e => {
  const seg = e.target.closest('#botSeg button');
  if (seg) { botMode = seg.dataset.mode; store.set('botMode', botMode); renderBot(); return; }
  if (e.target.closest('#botToggle')) {
    bot.on = !bot.on; botSave(); renderBot();
    if (bot.on) botTick();
    return;
  }
  const cl = e.target.closest('[data-close]');
  if (cl) {
    const p = bot.positions.find(x => x.sym === cl.dataset.close);
    if (p && confirm(`${p.tick} hozirgi narxda (${fmt(p.last)}) yopilsinmi?`)) { Bot.closeManual(bot, p.sym, p.last); botSave(); renderBot(); }
    return;
  }
  if (e.target.closest('#botReset')) {
    if (!confirm('Demo hisob, ochiq savdolar va tarix o‘chirilib, qaytadan boshlansinmi?')) return;
    const f = $('#botForm');
    const start = Math.max(10, +f.start.value || 1000);
    bot = Bot.newAccount({ ...bot.settings, start }); botSave(); renderBot();
  }
});
$('#botView').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, n = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
  const markets = [...f.querySelectorAll('[name=mk]:checked')].map(x => x.value);
  Object.assign(bot.settings, {
    riskPct: n(f.riskPct.value, 0.1, 5, 1), maxPos: Math.round(n(f.maxPos.value, 1, 8, 3)), tf: TF_NAME[f.tf.value] ? f.tf.value : '1h',
    minStrength: Math.round(n(f.minStrength.value, 0, 4, 0)), markets: markets.length ? markets : ['crypto'], trail: f.trail.checked,
  });
  botSave(); renderBot(); botTick();
});

window.botTick = botTick;
window.showBot = showBot;
if (store.get('view', 'list') === 'bot') showBot(true);
