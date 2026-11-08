// Genera les icones de la PWA a partir d'un SVG (node scripts/generate-icons.mjs)
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const ACCENT = "#E8473B";
const glyph = (scale = 1) => {
  // Full de calendari amb una marca de verificació
  const s = scale, o = (512 - 512 * s) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})">
    <rect x="96" y="112" width="320" height="300" rx="56" fill="#fff"/>
    <rect x="96" y="112" width="320" height="78" rx="39" fill="#fff"/>
    <rect x="166" y="80" width="28" height="70" rx="14" fill="#fff"/>
    <rect x="318" y="80" width="28" height="70" rx="14" fill="#fff"/>
    <rect x="96" y="176" width="320" height="10" fill="${ACCENT}" opacity=".18"/>
    <path d="M182 300l52 52 98-112" fill="none" stroke="${ACCENT}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
};
const icon = (rounded = true, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${rounded ? `<rect width="512" height="512" rx="112" fill="${ACCENT}"/>` : `<rect width="512" height="512" fill="${ACCENT}"/>`}
  ${glyph(scale)}
</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M150 270l70 70 140-160" fill="none" stroke="#fff" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon.svg", icon(true));
const out = async (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${file}`);
await out(icon(true), 192, "icon-192.png");
await out(icon(true), 512, "icon-512.png");
await out(icon(false, 0.78), 512, "maskable-512.png");
await out(icon(false), 180, "apple-touch-icon.png");
await out(badge, 72, "badge-72.png");
await sharp(Buffer.from(icon(true))).resize(48, 48).png().toFile("src/app/icon.png");
console.log("icones generades");
