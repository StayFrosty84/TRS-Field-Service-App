// Rasterizes public/icons/favicon.svg into the PNG sizes the PWA manifest needs.
// Run once (or whenever the SVG changes) with: npm run icons
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '../public/icons');
const src = resolve(iconsDir, 'favicon.svg');

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180, background: '#0f766e' },
  // Maskable: add ~10% padding so the safe zone isn't clipped by OS masks.
  { name: 'icon-512-maskable.png', size: 512, padding: 0.12 },
];

for (const t of targets) {
  let img;
  if (t.padding) {
    const inner = Math.round(t.size * (1 - t.padding * 2));
    img = sharp({
      create: {
        width: t.size,
        height: t.size,
        channels: 4,
        background: '#0f766e',
      },
    }).composite([{ input: await sharp(src).resize(inner, inner).png().toBuffer() }]);
  } else if (t.background) {
    img = sharp(src).resize(t.size, t.size).flatten({ background: t.background });
  } else {
    img = sharp(src).resize(t.size, t.size);
  }
  await img.png().toFile(resolve(iconsDir, t.name));
  console.log('wrote', t.name);
}
