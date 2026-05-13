/**
 * Product Compositor — Stage 2 of the universal two-stage pipeline.
 *
 * Stage 1 (gpt-image) renders the scene with a BRIGHT MAGENTA placeholder
 * bottle (RGB ~255,0,255), positioned and oriented for the action.
 *
 * Stage 2 (this file) detects the magenta region pixel-precisely and REPLACES
 * it with the original product PNG, preserving the placeholder's bbox.
 *
 * The magenta color is a UNIQUE COLOR SIGNATURE — it does not occur in natural
 * scenes (no skin, fabric, foliage, sky, or product looks like pure magenta),
 * so a simple color threshold gives pixel-perfect localization without any
 * vision LLM call (vision LLMs are unreliable for pixel-level grounding).
 *
 * The original product PNG is treated as an immutable asset.
 * Allowed transformations: scale, rotate, position. Forbidden: any pixel modification.
 *
 * Universal — works for any interaction type. The model decides where the bottle
 * goes based on the action; the compositor finds it by color.
 */
import sharp from "sharp";

export interface OverlayBox {
  x: number;          // top-left x of the bounding box, in pixels
  y: number;          // top-left y of the bounding box, in pixels
  width: number;      // bounding box width, in pixels
  height: number;     // bounding box height, in pixels
  angle?: number;     // rotation in degrees (clockwise from upright). 0 = upright.
  reasoning?: string;
  pixelCount?: number;
}

// Magenta color signature thresholds (RGB).
// Pure magenta is (255, 0, 255). Allow shading variation while excluding pinks/purples.
const MAGENTA_R_MIN = 170;
const MAGENTA_G_MAX = 110;
const MAGENTA_B_MIN = 170;
// Magenta is balanced R~B; this excludes pure red or pure blue.
const MAGENTA_RB_DIFF_MAX = 90;

// Minimum magenta pixels for a valid detection (~0.13% of a 1024x1536 image).
const MIN_MAGENTA_PIXELS = 2000;

/**
 * Detects the magenta placeholder bottle by pixel-precise color masking.
 * No vision LLM call — purely deterministic Sharp-based detection.
 * Returns the axis-aligned bounding box of the magenta region.
 * Returns null if no magenta region of sufficient size is found.
 */
export async function detectOverlayPosition(
  sceneImageDataUrl: string,
  productHint: string
): Promise<OverlayBox | null> {
  void productHint;

  const sceneBuf = sceneImageDataUrl.startsWith("data:")
    ? Buffer.from(sceneImageDataUrl.split(",")[1], "base64")
    : await fetch(sceneImageDataUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b));

  const { data, info } = await sharp(sceneBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const channels = info.channels;

  let minX = W, minY = H, maxX = -1, maxY = -1;
  let count = 0;

  for (let y = 0; y < H; y++) {
    const rowOffset = y * W * channels;
    for (let x = 0; x < W; x++) {
      const i = rowOffset + x * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        r >= MAGENTA_R_MIN &&
        g <= MAGENTA_G_MAX &&
        b >= MAGENTA_B_MIN &&
        Math.abs(r - b) <= MAGENTA_RB_DIFF_MAX
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (count < MIN_MAGENTA_PIXELS) {
    console.warn(
      `[Compositor] no magenta placeholder detected (${count} magenta px, threshold ${MIN_MAGENTA_PIXELS}). Stage 1 may not have rendered the magenta bottle.`
    );
    return null;
  }

  const parsed: OverlayBox = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    angle: 0,
    pixelCount: count,
    reasoning: `${count} magenta pixels detected; bbox is the axis-aligned bounding box of the magenta region`,
  };

  parsed.x = Math.max(0, Math.min(Math.round(parsed.x), W - 1));
  parsed.y = Math.max(0, Math.min(Math.round(parsed.y), H - 1));
  parsed.width = Math.min(Math.round(parsed.width), W - parsed.x);
  parsed.height = Math.min(Math.round(parsed.height), H - parsed.y);
  parsed.angle = typeof parsed.angle === "number" ? parsed.angle : 0;

  console.log(
    `[Compositor] placeholder detected: x=${parsed.x} y=${parsed.y} w=${parsed.width} h=${parsed.height} angle=${parsed.angle}° (${parsed.reasoning ?? ""})`
  );
  return parsed;
}

/**
 * Erases the magenta placeholder region from the scene by replacing magenta
 * pixels with a sampled background color (averaged from the pixels just
 * outside the bbox border). This ensures no magenta bleeds around the
 * transparent product after compositing.
 */
async function eraseMagentaRegion(
  sceneBuf: Buffer,
  bbox: OverlayBox
): Promise<Buffer> {
  const { data, info } = await sharp(sceneBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const CH = 4;

  // Sample background color from a ring of pixels just outside the bbox.
  const OFFSET = 12;
  const sampleCandidates: Array<[number, number]> = [
    [bbox.x - OFFSET, bbox.y + Math.round(bbox.height / 2)],
    [bbox.x + bbox.width + OFFSET, bbox.y + Math.round(bbox.height / 2)],
    [bbox.x + Math.round(bbox.width / 2), bbox.y - OFFSET],
    [bbox.x + Math.round(bbox.width / 2), bbox.y + bbox.height + OFFSET],
    [bbox.x - OFFSET, bbox.y - OFFSET],
    [bbox.x + bbox.width + OFFSET, bbox.y - OFFSET],
    [bbox.x - OFFSET, bbox.y + bbox.height + OFFSET],
    [bbox.x + bbox.width + OFFSET, bbox.y + bbox.height + OFFSET],
  ].filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H) as Array<[number, number]>;

  let rSum = 0, gSum = 0, bSum = 0;
  for (const [sx, sy] of sampleCandidates) {
    const i = (sy * W + sx) * CH;
    rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
  }
  const n = Math.max(1, sampleCandidates.length);
  const fillR = Math.round(rSum / n);
  const fillG = Math.round(gSum / n);
  const fillB = Math.round(bSum / n);

  // Replace every magenta pixel in the bbox with the sampled background color.
  const bx2 = Math.min(W, bbox.x + bbox.width);
  const by2 = Math.min(H, bbox.y + bbox.height);
  for (let y = Math.max(0, bbox.y); y < by2; y++) {
    for (let x = Math.max(0, bbox.x); x < bx2; x++) {
      const i = (y * W + x) * CH;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r >= MAGENTA_R_MIN && g <= MAGENTA_G_MAX && b >= MAGENTA_B_MIN && Math.abs(r - b) <= MAGENTA_RB_DIFF_MAX) {
        data[i] = fillR; data[i + 1] = fillG; data[i + 2] = fillB; data[i + 3] = 255;
      }
    }
  }

  console.log(`[Compositor] magenta erased in bbox, filled with sampled bg color rgb(${fillR},${fillG},${fillB})`);

  return await sharp(Buffer.from(data), {
    raw: { width: W, height: H, channels: CH },
  }).png().toBuffer();
}

/**
 * Removes the white background from a product PNG using BFS flood-fill from
 * all edge pixels. Only pixels that are:
 *   (a) "white enough" (R,G,B > WHITE_THRESH) AND
 *   (b) reachable from the image border without crossing non-white pixels
 * are set to alpha=0. White areas INSIDE the bottle (label, cap) are preserved.
 *
 * Result is cached on disk as product_transparent_<hash8>.png so this runs
 * only once per unique product image.
 */
async function removeWhiteBackground(productBuf: Buffer): Promise<Buffer> {
  const path = await import("path");
  const fs = await import("fs");
  const crypto = await import("crypto");

  const hash8 = crypto.createHash("sha256").update(productBuf).digest("hex").substring(0, 8);
  const cachePath = path.join(process.cwd(), `product_transparent_${hash8}.png`);
  if (fs.existsSync(cachePath)) {
    console.log(`[Compositor] using cached transparent product: ${cachePath}`);
    return fs.readFileSync(cachePath);
  }

  const WHITE_THRESH = 230;

  const { data, info } = await sharp(productBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const CH = 4; // RGBA
  const isWhite = (idx: number) =>
    data[idx] >= WHITE_THRESH &&
    data[idx + 1] >= WHITE_THRESH &&
    data[idx + 2] >= WHITE_THRESH;

  // BFS from all edge pixels that are white enough.
  const visited = new Uint8Array(W * H);
  const queue: number[] = [];

  const enqueue = (pxIdx: number) => {
    if (visited[pxIdx]) return;
    const byteIdx = pxIdx * CH;
    if (!isWhite(byteIdx)) return;
    visited[pxIdx] = 1;
    queue.push(pxIdx);
  };

  for (let x = 0; x < W; x++) { enqueue(x); enqueue((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { enqueue(y * W); enqueue(y * W + W - 1); }

  let qi = 0;
  while (qi < queue.length) {
    const pxIdx = queue[qi++];
    const y = Math.floor(pxIdx / W);
    const x = pxIdx % W;
    if (x > 0)     enqueue(pxIdx - 1);
    if (x < W - 1) enqueue(pxIdx + 1);
    if (y > 0)     enqueue(pxIdx - W);
    if (y < H - 1) enqueue(pxIdx + W);
  }

  // Set background pixels to fully transparent.
  for (let pxIdx = 0; pxIdx < W * H; pxIdx++) {
    if (visited[pxIdx]) {
      data[pxIdx * CH + 3] = 0;
    }
  }

  const result = await sharp(Buffer.from(data), {
    raw: { width: W, height: H, channels: CH },
  })
    .png()
    .toBuffer();

  fs.writeFileSync(cachePath, result);
  console.log(`[Compositor] background removed and cached: ${cachePath} (${W}x${H})`);
  return result;
}

/**
 * Replaces the magenta placeholder in the scene with the original product PNG.
 *
 * Pipeline:
 * 1. Remove white background from product PNG (BFS flood-fill, cached on disk).
 * 2. Rotate product to match placeholder angle (if non-zero).
 * 3. Resize product aspect-preserving to fit inside expanded bbox.
 *    Transparent background — NO white canvas, NO flatten.
 * 4. Apply soft-edge feather mask (dest-in) so bottle edges blend naturally.
 * 5. Composite feathered transparent bottle over scene.
 *
 * Result: only bottle pixels are composited — no white rectangle artifact.
 */
export async function composeProductOnImage(
  sceneImageDataUrl: string,
  productImageUrlOrDataUrl: string,
  position: OverlayBox
): Promise<string> {
  const sceneBuf = sceneImageDataUrl.startsWith("data:")
    ? Buffer.from(sceneImageDataUrl.split(",")[1], "base64")
    : await fetch(sceneImageDataUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b));

  let rawProductBuf: Buffer;
  if (productImageUrlOrDataUrl.startsWith("data:")) {
    rawProductBuf = Buffer.from(productImageUrlOrDataUrl.split(",")[1], "base64");
  } else {
    const res = await fetch(productImageUrlOrDataUrl);
    if (!res.ok) throw new Error(`[Compositor] failed to fetch product: HTTP ${res.status}`);
    rawProductBuf = Buffer.from(await res.arrayBuffer());
  }

  // Step 1: ensure product has transparent background (remove white bg if needed).
  const productBuf = await removeWhiteBackground(rawProductBuf);

  const angle = position.angle ?? 0;

  // Step 2: rotate if needed — transparent background, alpha preserved.
  let prepared: Buffer;
  if (Math.abs(angle) > 0.5) {
    prepared = await sharp(productBuf)
      .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } else {
    prepared = productBuf;
  }

  // Expand bbox by EXPAND px to guarantee full magenta fringe coverage.
  const EXPAND = 4;
  const sceneMeta = await sharp(sceneBuf).metadata();
  const imgW = sceneMeta.width!;
  const imgH = sceneMeta.height!;
  const bx = Math.max(0, position.x - EXPAND);
  const by = Math.max(0, position.y - EXPAND);
  const bw = Math.min(position.width + EXPAND * 2, imgW - bx);
  const bh = Math.min(position.height + EXPAND * 2, imgH - by);

  // Step 3: resize product to fit inside expanded bbox, aspect-preserving.
  // background is TRANSPARENT — no white canvas, no flatten.
  const resized = await sharp(prepared)
    .resize({
      width: bw,
      height: bh,
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const rW = resizedMeta.width!;
  const rH = resizedMeta.height!;
  const offsetX = bx + Math.round((bw - rW) / 2);
  const offsetY = by + Math.round((bh - rH) / 2);

  // Step 4: apply a soft feather mask to the bottle edges so they blend
  // into the scene (eliminates hard-cut boundary).
  const FEATHER = 5;
  const innerW = Math.max(1, rW - FEATHER * 2);
  const innerH = Math.max(1, rH - FEATHER * 2);
  const featherMask = await sharp({
    create: {
      width: innerW,
      height: innerH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .extend({
      top: FEATHER, bottom: FEATHER, left: FEATHER, right: FEATHER,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(FEATHER * 0.5)
    .png()
    .toBuffer();

  // dest-in: multiply existing alpha of product with the feather mask alpha.
  const feathered = await sharp(resized)
    .composite([{ input: featherMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Step 5: erase the magenta placeholder region from the scene.
  // Fill with sampled surrounding background color so no magenta halos are
  // visible around the product, even in areas the product doesn't cover.
  const cleanScene = await eraseMagentaRegion(sceneBuf, position);

  // Step 6: composite transparent bottle over the clean (magenta-free) scene.
  const composed = await sharp(cleanScene)
    .composite([{ input: feathered, left: Math.max(0, offsetX), top: Math.max(0, offsetY) }])
    .png()
    .toBuffer();

  console.log(
    `[Compositor] transparent product composited at (${offsetX}, ${offsetY}) size ${rW}x${rH} angle=${angle}°`
  );
  return `data:image/png;base64,${composed.toString("base64")}`;
}