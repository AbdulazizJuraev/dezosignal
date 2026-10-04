# DezoSignal

Kripto, forex, oltin va aksiyalar uchun texnik tahlil signallari. Veb sayt va telefonga o'rnatiladigan ilova (PWA).

> **Moliyaviy maslahat emas.** Signal — matematik qoida natijasi, foyda kafolatlanmaydi. Har bir aktivning tarixiy natijasi
> dasturda ochiq ko'rsatiladi (ko'p aktivlarda strategiya zarar ham ko'rsatgan).

## Ishga tushirish

```bash
node server.js
```

Brauzerda: http://localhost:5588 (Node 18+; qo'shimcha paket kerak emas).

## Qanday ishlaydi

| Fayl | Vazifasi |
|---|---|
| `server.js` | `public/` ni beradi + `/api/candles` — Binance (kripto) va Yahoo (forex, oltin, aksiyalar) narxlari, 30 s kesh |
| `public/js/signal.js` | EMA, RSI, ATR, MACD; signal qoidalari; tarixiy sinov (backtest) |
| `public/js/bot.js`, `bot-ui.js` | «Bot» bo'limi: Demo — virtual pul bilan avtomatik savdo (kirish, stop, maqsad, ergashuvchi stop, komissiya); Real — hali ulanmagan |
| `public/js/app.js` | Ro'yxat, grafik (TradingView Lightweight Charts), bildirishnomalar, har 60 s yangilash |
| `test.js` | `node test.js` — indikator testlari va haqiqiy ma'lumotda sinov (server ishlab turishi kerak) |

### Strategiya «Trend + Impuls»

1. **Trend:** narx EMA200 dan yuqori — faqat sotib olish, past — faqat sotish.
2. **Kirish:** EMA9 EMA21 ni trend tomonga kesib o'tadi (yopilgan shamda).
3. **Filtr:** RSI 45–70 (sotib olish) / 30–55 (sotish), MACD gistogrammasi shu tomonda.
4. **Stop:** 1,5 × ATR(14), **maqsad:** 3 × ATR — risk/foyda 1:2.
5. **Kuch (0–4):** hajm, EMA200 qiyaligi, RSI oralig'i, narx EMA21 ga nisbatan.

Tarixiy sinov: signaldan keyingi sham ochilishida kirish; bitta shamda stop ham, maqsad ham tegsa — stop deb hisoblanadi.

### Demo bot

- Faqat spot (sotib olish): SOTIB OLISH signalida kiradi; stop-loss, maqsad (1:2) yoki SOTISH signalida chiqadi.
- Hajm: har savdoda depozitning N % i xavfda (sozlanadi, standart 1%); bitta savdo ≤ depozit / maks. savdolar soni.
- Narx +1R o'ssa stop zararsiz nuqtaga ko'chadi, +1,5R dan keyin eng yuqori narxdan 1,5 ATR pastda ergashadi.
- Komissiya 0,1% har tomonga. Hisob qurilmada (localStorage) saqlanadi; ilova ochilganda o'tib ketgan shamlar vaqt tartibida hisoblanadi.

## Dastur hech qachon

- savdo qilmaydi, birjaga ulanmaydi, API kalit so'ramaydi — faqat ochiq narxlarni o'qiydi.
