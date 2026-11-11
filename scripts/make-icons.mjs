// Renders the raster icons and the share image from SVG into /public.
// Run with: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const pub = new URL('../public/', import.meta.url);
const icon = await readFile(new URL('favicon.svg', pub), 'utf8');
// Home-screen icons get their corners rounded by the OS, so use a full square.
const square = icon.replace('rx="14"', 'rx="0"');

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 72 * (size / 64) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

// favicon.ico holding PNG images (16, 32, 48).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(icon, s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
await writeFile(new URL('favicon.ico', pub), Buffer.concat([header, ...images]));

await writeFile(new URL('apple-touch-icon.png', pub), await png(square, 180));
await writeFile(new URL('icon-192.png', pub), await png(square, 192));
await writeFile(new URL('icon-512.png', pub), await png(square, 512));

// Share image (Open Graph), 1200 x 630.
const cx = 880, cy = 315, R = 230;
const pt = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
const spokes = Array.from({ length: 12 }, (_, i) => {
  const [x, y] = pt(i * 30, R);
  return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
}).join('');
const [sx, sy] = pt(58, R);
const [wx, wy] = pt(-10, R);
const track = (deg, r, label) => {
  const [x, y] = pt(deg, r);
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <ellipse rx="26" ry="15" transform="rotate(${deg})" fill="#3ee68c" fill-opacity=".08" stroke="#3ee68c" stroke-opacity=".6"/>
    <path d="M0-7 7 0 0 7-7 0z" fill="none" stroke="#b6ffd6" stroke-width="2"/>
    <text x="18" y="-16" font-size="16" fill="#3ee68c">${label}</text>
  </g>`;
};
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Menlo, 'DejaVu Sans Mono', monospace">
  <defs>
    <radialGradient id="bg" cx="73%" cy="50%" r="70%">
      <stop offset="0" stop-color="#0a2116"/><stop offset="1" stop-color="#040806"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#3ee68c" stroke-opacity=".06"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <g fill="none" stroke="#3ee68c">
    <g stroke-opacity=".14">${spokes}</g>
    <circle cx="${cx}" cy="${cy}" r="${R * 0.25}" stroke-opacity=".25" stroke-dasharray="2 6"/>
    <circle cx="${cx}" cy="${cy}" r="${R * 0.5}" stroke-opacity=".25" stroke-dasharray="2 6"/>
    <circle cx="${cx}" cy="${cy}" r="${R * 0.75}" stroke-opacity=".25" stroke-dasharray="2 6"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="2.5" stroke-opacity=".8"/>
  </g>
  <path d="M${cx} ${cy}L${wx.toFixed(1)} ${wy.toFixed(1)}A${R} ${R} 0 0 1 ${sx.toFixed(1)} ${sy.toFixed(1)}Z" fill="#3ee68c" fill-opacity=".16"/>
  <line x1="${cx}" y1="${cy}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#b6ffd6" stroke-width="3"/>
  ${track(205, R * 0.62, 'T01')}
  ${track(118, R * 0.45, 'T02')}
  ${track(318, R * 0.7, 'T03')}
  <circle cx="${cx}" cy="${cy}" r="5" fill="#b6ffd6"/>
  <text x="80" y="250" font-size="20" letter-spacing="3" fill="#3ee68c" fill-opacity=".7">M.SC. STUDENT · AEROSPACE ENGINEERING</text>
  <text x="78" y="330" font-size="76" font-weight="bold" letter-spacing="3" fill="#b6ffd6">OLE</text>
  <text x="78" y="410" font-size="76" font-weight="bold" letter-spacing="3" fill="#b6ffd6">MEIFORTH</text>
  <text x="80" y="470" font-size="24" fill="#3ee68c">Test Data Analysis and State Estimation</text>
  <text x="80" y="560" font-size="22" letter-spacing="3" fill="#3ee68c" fill-opacity=".7">OLEMEIF.DE</text>
</svg>`;
await writeFile(new URL('og.png', pub), await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());

console.log('Icons and share image written to public/');
