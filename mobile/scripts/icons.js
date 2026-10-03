/* Ilova belgisi va ochilish ekrani: public/icon.svg asosida (sharp — DezoMax mobile papkasidan) */
const sharp = require(process.env.SHARP || 'sharp');
const fs = require('fs'), path = require('path');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const full = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'icon.svg'));
// adaptiv belgi: faqat grafik chizig'i, xavfsiz zona ichida (108 dan 66)
const fg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(22 22) scale(1)">
  <path d="M10 46 L24 32 L34 40 L54 18" fill="none" stroke="#22c55e" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M43 18 H54 V29" fill="none" stroke="#22c55e" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="10" y="54" width="44" height="4.5" rx="2.2" fill="#fff" opacity=".25"/></g></svg>`);
const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
(async () => {
  for (const [d, k] of Object.entries(D)) {
    const dir = path.join(RES, 'mipmap-' + d);
    await sharp(full, { density: 600 }).resize(48 * k, 48 * k).png().toFile(path.join(dir, 'ic_launcher.png'));
    const r = 48 * k, mask = Buffer.from(`<svg width="${r}" height="${r}"><circle cx="${r / 2}" cy="${r / 2}" r="${r / 2}"/></svg>`);
    await sharp(full, { density: 600 }).resize(r, r).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    await sharp(fg, { density: 600 }).resize(108 * k, 108 * k).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14244a</color>\n</resources>\n');
  // ochilish ekrani: qora fon, o'rtada belgi
  for (const dir of fs.readdirSync(RES).filter(x => x.startsWith('drawable'))) {
    const f = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const { width, height } = await sharp(f).metadata();
    const s = Math.round(Math.min(width, height) * 0.22);
    const icon = await sharp(full, { density: 600 }).resize(s, s).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: '#0a0d12' } }).composite([{ input: icon, gravity: 'center' }]).png().toFile(f + '.tmp');
    fs.renameSync(f + '.tmp', f);
  }
  console.log('belgilar tayyor');
})();
