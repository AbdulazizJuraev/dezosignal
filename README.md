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
| `public/js/app.js` | Ro'yxat, grafik (TradingView Lightweight Charts), bildirishnomalar, har 60 s yangilash |
| `test.js` | `node test.js` — indikator testlari va haqiqiy ma'lumotda sinov (server ishlab turishi kerak) |

### Strategiya «Trend + Impuls»

1. **Trend:** narx EMA200 dan yuqori — faqat sotib olish, past — faqat sotish.
2. **Kirish:** EMA9 EMA21 ni trend tomonga kesib o'tadi (yopilgan shamda).
3. **Filtr:** RSI 45–70 (sotib olish) / 30–55 (sotish), MACD gistogrammasi shu tomonda.
4. **Stop:** 1,5 × ATR(14), **maqsad:** 3 × ATR — risk/foyda 1:2.
5. **Kuch (0–4):** hajm, EMA200 qiyaligi, RSI oralig'i, narx EMA21 ga nisbatan.

Tarixiy sinov: signaldan keyingi sham ochilishida kirish; bitta shamda stop ham, maqsad ham tegsa — stop deb hisoblanadi.

## Dastur hech qachon

- savdo qilmaydi, birjaga ulanmaydi, API kalit so'ramaydi — faqat ochiq narxlarni o'qiydi.
