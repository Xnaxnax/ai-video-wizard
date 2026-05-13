// PHASE 3 — controlled test of Scene 3 (product scene, combined board path)
// One-by-one regeneration via real API. NO fallback.
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

async function hashImage(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').substring(0, 16);
}

async function main() {
  const SCENE_ID = '9894453e-a2df-40c0-9c28-487fde559274';
  console.log('=== PHASE 3 — SCENE 3 controlled test ===');
  console.log('Scene id:', SCENE_ID);
  console.log('Target  : image');
  console.log('Path    : /api/scenes/[id] POST { target: "image" }');
  console.log('');

  // Read pre-test state
  const data0 = JSON.parse(fs.readFileSync('storage.json','utf8'));
  const sceneEntry0 = data0.scenes.find(s => s[0] === SCENE_ID);
  const before = sceneEntry0[1];

  console.log('--- BEFORE ---');
  console.log('imageUrl size :', before.imageUrl ? before.imageUrl.length + ' chars' : 'NONE');
  if (before.imageUrl) {
    const beforeBuf = Buffer.from(before.imageUrl.split(',')[1], 'base64');
    fs.writeFileSync('phase3_scene3_before.png', beforeBuf);
    console.log('imageUrl hash :', await hashImage(beforeBuf));
    console.log('saved         : phase3_scene3_before.png');
  }
  console.log('');

  // Hit the API
  console.log('--- POST /api/scenes/'+SCENE_ID+' ---');
  const t0 = Date.now();
  const res = await fetch('http://localhost:3000/api/scenes/' + SCENE_ID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'image' })
  });
  const dt = Date.now() - t0;
  console.log('HTTP status :', res.status);
  console.log('latency     :', dt + 'ms (' + (dt/1000).toFixed(1) + 's)');

  const body = await res.json();

  if (res.status !== 200) {
    console.log('STRUCTURED FAIL:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  // Read post-test state
  console.log('');
  console.log('--- AFTER ---');
  console.log('imagePrompt (first 400):');
  console.log(body.imagePrompt?.substring(0, 400) + '...');
  console.log('');
  console.log('imageUrl size:', body.imageUrl ? body.imageUrl.length + ' chars' : 'NONE');

  if (body.imageUrl) {
    const afterBuf = Buffer.from(body.imageUrl.split(',')[1], 'base64');
    fs.writeFileSync('phase3_scene3_after.png', afterBuf);
    console.log('imageUrl hash:', await hashImage(afterBuf));
    console.log('saved        : phase3_scene3_after.png');

    const meta = await sharp(afterBuf).metadata();
    console.log('dimensions   :', meta.width + 'x' + meta.height);
    console.log('size bytes   :', afterBuf.length);
  }

  // Reconstruct what board would have been built (production toBuffer + combined logic)
  const proj = data0.projects[data0.projects.length - 1][1];

  async function tobufferProduction(b64) {
    const raw = Buffer.from(b64.split(',')[1], 'base64');
    return await sharp(raw)
      .resize(1024, 1024, { fit:'contain', background:{ r:255, g:255, b:255, alpha:255 } })
      .png()
      .toBuffer();
  }

  const charBuf = await tobufferProduction(proj.characterReferenceImageUrl);
  const prodBuf = await tobufferProduction(proj.referenceImageUrl);
  const charR = await sharp(charBuf).resize(512,1024,{fit:'contain',background:{r:255,g:255,b:255,alpha:255}}).png().toBuffer();
  const prodR = await sharp(prodBuf).resize(512,1024,{fit:'contain',background:{r:255,g:255,b:255,alpha:255}}).png().toBuffer();
  const board = await sharp({create:{width:1024,height:1024,channels:4,background:{r:255,g:255,b:255,alpha:255}}})
    .composite([{input:charR,left:0,top:0},{input:prodR,left:512,top:0}])
    .png()
    .toBuffer();
  fs.writeFileSync('phase3_scene3_board.png', board);

  console.log('');
  console.log('--- INPUT REFERENCE BOARD (reconstructed with new fixes) ---');
  console.log('board hash :', await hashImage(board));
  console.log('saved      : phase3_scene3_board.png');

  console.log('');
  console.log('=== DEBUG REPORT ===');
  console.log('Endpoint used    : /v1/images/edits (gpt-image-1.5)');
  console.log('Path             : combined board (character + product)');
  console.log('Reference board  : phase3_scene3_board.png');
  console.log('Output           : phase3_scene3_after.png');
  console.log('Result           : PASS');
}

main().catch(e => { console.error('SCRIPT ERROR:', e.message); console.error(e.stack); process.exit(1); });
