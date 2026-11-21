// Génère les icônes de l'application (PNG) sans dépendance : un carré bleu encre avec le symbole ∧.
// Usage : node scripts/make-icons.mjs  (les fichiers vont dans public/icons/)
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const BG = [0x28, 0x4b, 0x7a];
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** scale : taille du symbole relative à l'icône ; radius : arrondi du fond (0 = carré plein, pour « maskable »). */
function icon(size, { scale = 1, radius = 0.22 } = {}) {
  const s = size;
  const c = s / 2;
  const w = 0.42 * s * scale; // demi-largeur du ∧
  const hgt = 0.46 * s * scale;
  const top = [c, c - hgt / 2];
  const left = [c - w / 2, c + hgt / 2];
  const right = [c + w / 2, c + hgt / 2];
  const stroke = 0.075 * s * scale;
  const r = radius * s;
  return png(s, (x, y) => {
    // Fond arrondi (anti-crénelé).
    const qx = Math.max(Math.abs(x - c) - (c - r), 0);
    const qy = Math.max(Math.abs(y - c) - (c - r), 0);
    const dBg = Math.hypot(qx, qy) - r;
    const aBg = radius ? Math.max(0, Math.min(1, 0.5 - dBg)) : 1;
    const d = Math.min(distSeg(x, y, ...left, ...top), distSeg(x, y, ...top, ...right));
    const aFg = Math.max(0, Math.min(1, stroke / 2 + 0.5 - d));
    const mix = (i) => Math.round(BG[i] * (1 - aFg) + FG[i] * aFg);
    return [mix(0), mix(1), mix(2), Math.round(255 * aBg)];
  });
}

writeFileSync(join(out, 'icon-192.png'), icon(192));
writeFileSync(join(out, 'icon-512.png'), icon(512));
// Icône « maskable » : fond plein, symbole dans la zone sûre (80 % centrale).
writeFileSync(join(out, 'icon-maskable-512.png'), icon(512, { scale: 0.72, radius: 0 }));
// iOS applique lui-même l'arrondi : fond plein.
writeFileSync(join(out, 'apple-touch-icon.png'), icon(180, { scale: 0.85, radius: 0 }));
writeFileSync(join(out, 'favicon-32.png'), icon(32, { radius: 0.2 }));
console.log('Icônes écrites dans public/icons/');
