// Generates icon16.png, icon48.png, icon128.png
// Flat design: white background, solid yellow hexagon, dark P letter.
// No gradients, no transparency, no shadows.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG encoder (built-in modules only) ────────────────────────────────────────

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([lenBuf, t, data, crcBuf]);
}

function encodePNG(w, h, rgb) {
  // rgb is Uint8Array of RGB triples (no alpha needed — all pixels opaque)
  const raw = Buffer.allocUnsafe(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3, d = y * (1 + w * 3) + 1 + x * 3;
      raw[d] = rgb[s]; raw[d+1] = rgb[s+1]; raw[d+2] = rgb[s+2];
    }
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB (no alpha)
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function makeCanvas(size) {
  // Flat RGB array, pre-filled white
  const buf = new Uint8Array(size * size * 3).fill(255);

  function set(x, y, r, g, b) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 3;
    buf[i] = r; buf[i+1] = g; buf[i+2] = b;
  }

  // Scanline-fill a convex polygon
  function fillPoly(pts, r, g, b) {
    const n = pts.length;
    const minY = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(...pts.map(p => p[1]))));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi <= y && yj > y) || (yj <= y && yi > y))
          xs.push(xi + (y - yi) / (yj - yi) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let x = Math.ceil(xs[0]); x <= Math.floor(xs[1]); x++)
        set(x, y, r, g, b);
    }
  }

  function fillRect(x0, y0, w, h, r, g, b) {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++)
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++)
        set(x, y, r, g, b);
  }

  return { buf, set, fillPoly, fillRect };
}

// ── Icon ───────────────────────────────────────────────────────────────────────

const YELLOW = [240, 192, 48];  // #F0C030
const INK    = [40,  25,  0];   // near-black brown

function drawIcon(size) {
  const cv = makeCanvas(size);
  const cx = size / 2, cy = size / 2;

  // ── Hexagon (flat yellow, pointy-top) ────────────────────────────────────
  const R = size * 0.44;
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  cv.fillPoly(hex, ...YELLOW);

  // ── Letter P ─────────────────────────────────────────────────────────────
  // All dimensions as fractions of `size`.
  // The P is centred inside the hex.
  const lh  = size * 0.44;           // total letter height
  const ly  = (size - lh) / 2;      // top y
  const sw  = Math.max(2, lh * 0.22); // stroke width
  const bh  = lh * 0.52;            // bowl height (top portion)
  const br  = bh / 2;               // bowl outer radius
  const bir = Math.max(0, br - sw); // bowl inner radius (hollow)

  // Horizontal position: slightly left of centre so P looks centred optically
  const lx  = cx - lh * 0.25;       // stem left edge
  const bcx = lx + sw;              // bowl centre x (right edge of stem)
  const bcy = ly + br;              // bowl centre y

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;

      // Stem (full height)
      const inStem = px > lx && px < lx + sw && py > ly && py < ly + lh;

      // Bowl arc (outer ring, right half only)
      const dx = px - bcx, dy = py - bcy, d = Math.sqrt(dx * dx + dy * dy);
      const inBowl = d <= br && d >= bir && dx >= 0;

      // Top connector (horizontal bar joining stem top to bowl top)
      const inTopBar = py > ly && py < ly + sw && px > lx && px < bcx + br * 0.92;

      // Bottom connector (horizontal bar joining stem to bowl bottom)
      const inBotBar = py > ly + bh - sw && py < ly + bh && px > lx && px < bcx + br * 0.92;

      if (inStem || inBowl || inTopBar || inBotBar)
        cv.set(x, y, ...INK);
    }
  }

  return encodePNG(size, size, cv.buf);
}

// ── Write ──────────────────────────────────────────────────────────────────────

const dir = __dirname;
for (const size of [16, 48, 128]) {
  const out = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(out, drawIcon(size));
  console.log(`✓  icon${size}.png`);
}
console.log('Done.');
