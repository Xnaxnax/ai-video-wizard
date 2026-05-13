const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

const MAGENTA_R_MIN = 170, MAGENTA_G_MAX = 110, MAGENTA_B_MIN = 170, MAGENTA_RB_DIFF_MAX = 90;

async function detectMagenta(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W * ch;
    for (let x = 0; x < W; x++) {
      const i = row + x * ch;
      const r = data[i], g = data[i+1], b = data[i+2];
      if (r >= MAGENTA_R_MIN && g <= MAGENTA_G_MAX && b >= MAGENTA_B_MIN && Math.abs(r-b) <= MAGENTA_RB_DIFF_MAX) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < 2000) { console.log('magenta px:', count, '— below threshold'); return null; }
  const pos = { x: minX, y: minY, width: maxX-minX+1, height: maxY-minY+1, angle: 0 };
  console.log('magenta detected:', JSON.stringify(pos), '| pixels:', count);
  return pos;
}

async function eraseMagentaRegion(sceneBuf, bbox) {
  const { data, info } = await sharp(sceneBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, CH = 4;
  const OFFSET = 12;
  const samples = [
    [bbox.x - OFFSET, bbox.y + Math.round(bbox.height/2)],
    [bbox.x + bbox.width + OFFSET, bbox.y + Math.round(bbox.height/2)],
    [bbox.x + Math.round(bbox.width/2), bbox.y - OFFSET],
    [bbox.x + Math.round(bbox.width/2), bbox.y + bbox.height + OFFSET],
    [bbox.x - OFFSET, bbox.y - OFFSET],
    [bbox.x + bbox.width + OFFSET, bbox.y - OFFSET],
    [bbox.x - OFFSET, bbox.y + bbox.height + OFFSET],
    [bbox.x + bbox.width + OFFSET, bbox.y + bbox.height + OFFSET],
  ].filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H);

  let rSum = 0, gSum = 0, bSum = 0;
  for (const [sx, sy] of samples) {
    const i = (sy * W + sx) * CH;
    rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
  }
  const n = Math.max(1, samples.length);
  const fR = Math.round(rSum/n), fG = Math.round(gSum/n), fB = Math.round(bSum/n);
  console.log('fill color: rgb(' + fR + ',' + fG + ',' + fB + ')');

  const bx2 = Math.min(W, bbox.x + bbox.width);
  const by2 = Math.min(H, bbox.y + bbox.height);
  for (let y = Math.max(0, bbox.y); y < by2; y++) {
    for (let x = Math.max(0, bbox.x); x < bx2; x++) {
      const i = (y * W + x) * CH;
      const r = data[i], g = data[i+1], b = data[i+2];
      if (r >= MAGENTA_R_MIN && g <= MAGENTA_G_MAX && b >= MAGENTA_B_MIN && Math.abs(r-b) <= MAGENTA_RB_DIFF_MAX) {
        data[i] = fR; data[i+1] = fG; data[i+2] = fB; data[i+3] = 255;
      }
    }
  }
  return await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
}

async function removeWhiteBackground(productBuf) {
  const cachePath = `product_transparent_${crypto.createHash('sha256').update(productBuf).digest('hex').substring(0,8)}.png`;
  if (fs.existsSync(cachePath)) { console.log('using cached:', cachePath); return fs.readFileSync(cachePath); }
  const WHITE_THRESH = 230;
  const { data, info } = await sharp(productBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, CH = 4;
  const isWhite = (i) => data[i] >= WHITE_THRESH && data[i+1] >= WHITE_THRESH && data[i+2] >= WHITE_THRESH;
  const visited = new Uint8Array(W * H);
  const queue = [];
  const enqueue = (px) => { if (visited[px] || !isWhite(px*CH)) return; visited[px]=1; queue.push(px); };
  for (let x = 0; x < W; x++) { enqueue(x); enqueue((H-1)*W+x); }
  for (let y = 0; y < H; y++) { enqueue(y*W); enqueue(y*W+W-1); }
  let qi = 0;
  while (qi < queue.length) {
    const px = queue[qi++]; const y = Math.floor(px/W), x = px%W;
    if (x > 0) enqueue(px-1); if (x < W-1) enqueue(px+1);
    if (y > 0) enqueue(px-W); if (y < H-1) enqueue(px+W);
  }
  for (let px = 0; px < W*H; px++) { if (visited[px]) data[px*CH+3] = 0; }
  const result = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
  fs.writeFileSync(cachePath, result);
  console.log('background removed, cached:', cachePath);
  return result;
}

async function compose(sceneBuf, rawProductBuf, position) {
  const productBuf = await removeWhiteBackground(rawProductBuf);
  const angle = position.angle ?? 0;
  let prepared = productBuf;
  if (Math.abs(angle) > 0.5) {
    prepared = await sharp(productBuf).rotate(angle, { background: {r:0,g:0,b:0,alpha:0} }).png().toBuffer();
  }
  const EXPAND = 4;
  const meta = await sharp(sceneBuf).metadata();
  const bx = Math.max(0, position.x - EXPAND);
  const by = Math.max(0, position.y - EXPAND);
  const bw = Math.min(position.width + EXPAND*2, meta.width - bx);
  const bh = Math.min(position.height + EXPAND*2, meta.height - by);

  const resized = await sharp(prepared)
    .resize({ width: bw, height: bh, fit: 'inside', background: {r:0,g:0,b:0,alpha:0} })
    .png().toBuffer();

  const rm = await sharp(resized).metadata();
  const rW = rm.width, rH = rm.height;
  const offsetX = bx + Math.round((bw - rW) / 2);
  const offsetY = by + Math.round((bh - rH) / 2);
  console.log('product size:', rW+'x'+rH, 'offset:', offsetX, offsetY);

  const FEATHER = 5;
  const innerW = Math.max(1, rW - FEATHER*2), innerH = Math.max(1, rH - FEATHER*2);
  const featherMask = await sharp({
    create: { width: innerW, height: innerH, channels: 4, background: {r:255,g:255,b:255,alpha:255} }
  })
    .extend({ top: FEATHER, bottom: FEATHER, left: FEATHER, right: FEATHER, background: {r:0,g:0,b:0,alpha:0} })
    .blur(FEATHER * 0.5).png().toBuffer();

  const feathered = await sharp(resized)
    .composite([{ input: featherMask, blend: 'dest-in' }]).png().toBuffer();

  const cleanScene = await eraseMagentaRegion(sceneBuf, position);

  const composed = await sharp(cleanScene)
    .composite([{ input: feathered, left: Math.max(0, offsetX), top: Math.max(0, offsetY) }])
    .png().toBuffer();

  return composed;
}

async function main() {
  const stage1 = fs.readFileSync('debug_stage1_output.png');
  const product = fs.readFileSync('original_product.png');
  console.log('=== LOCAL COMPOSITOR TEST ===');
  const pos = await detectMagenta(stage1);
  if (!pos) { console.error('No magenta found'); process.exit(1); }
  const result = await compose(stage1, product, pos);
  fs.writeFileSync('test_reference_board.png', result);
  console.log('saved: test_reference_board.png', result.length, 'bytes');
}

main().catch(e => { console.error('ERROR:', e.message, '\n', e.stack); process.exit(1); });
