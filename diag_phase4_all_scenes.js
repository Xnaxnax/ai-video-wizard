// PHASE 4 — controlled test of all 4 scenes with new two-stage pipeline.
// Stage 1: scene generation (empty hand, no branded product)
// Stage 2: product-compositor overlays original PNG (if scene needs product)

const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const SCENES = [
  { idx: 1, id: 'a373925c-2ce1-4f50-9560-994734d1e0b1', label: 'Hook' },
  { idx: 2, id: 'ed5dd7ca-e470-4d03-a26c-590911f86001', label: 'Pain' },
  { idx: 3, id: '9894453e-a2df-40c0-9c28-487fde559274', label: 'Solution' },
  { idx: 4, id: '1b0d16bf-62cb-48d7-94d3-e768dc540a57', label: 'CTA' },
];

async function hashImage(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').substring(0, 16);
}

async function runScene(scene) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`SCENE ${scene.idx} — ${scene.label}`);
  console.log(`Scene id: ${scene.id}`);
  console.log('═══════════════════════════════════════════════════════');

  const t0 = Date.now();
  const res = await fetch('http://localhost:3000/api/scenes/' + scene.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'image' })
  });
  const dt = Date.now() - t0;
  console.log('HTTP status :', res.status);
  console.log('latency     :', (dt/1000).toFixed(1) + 's');

  const body = await res.json();

  if (res.status !== 200) {
    console.log('STRUCTURED FAIL:', JSON.stringify(body, null, 2));
    return { scene, status: 'FAIL', error: body };
  }

  console.log('imagePrompt (first 200):');
  console.log('  ', body.imagePrompt?.substring(0, 200) + '...');
  console.log('imageUrl size:', body.imageUrl ? body.imageUrl.length + ' chars' : 'NONE');

  if (body.imageUrl) {
    const afterBuf = Buffer.from(body.imageUrl.split(',')[1], 'base64');
    const outPath = `phase4_scene${scene.idx}_after.png`;
    fs.writeFileSync(outPath, afterBuf);
    const h = await hashImage(afterBuf);
    const meta = await sharp(afterBuf).metadata();
    console.log('imageUrl hash:', h);
    console.log('saved        :', outPath);
    console.log('dimensions   :', meta.width + 'x' + meta.height);
    console.log('size bytes   :', afterBuf.length);
  }

  return { scene, status: 'PASS', latencyMs: dt };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('PHASE 4 — TWO-STAGE PIPELINE CONTROLLED TEST');
  console.log('Stage 1: scene + empty hand (no branded product)');
  console.log('Stage 2: product-compositor overlays original PNG');
  console.log('═══════════════════════════════════════════════════════');

  const results = [];
  for (const scene of SCENES) {
    try {
      const r = await runScene(scene);
      results.push(r);
    } catch (e) {
      console.error(`SCENE ${scene.idx} CRASH:`, e.message);
      results.push({ scene, status: 'CRASH', error: e.message });
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('=== SUMMARY ===');
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results) {
    const dt = r.latencyMs ? `${(r.latencyMs/1000).toFixed(1)}s` : '—';
    console.log(`Scene ${r.scene.idx} (${r.scene.label}): ${r.status} (${dt})`);
  }
}

main().catch(e => { console.error('SCRIPT ERROR:', e.message); console.error(e.stack); process.exit(1); });
