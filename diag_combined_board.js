// PHASE 1 DIAGNOSTIC #2 — combined reference board (production path).
// Same code paths as openai-image.ts: char left + product right + transparent toBuffer padding.
const fs = require('fs');
const sharp = require('sharp');

const key = fs.readFileSync('.env.local','utf8').match(/OPENAI_API_KEY=(.+)/)?.[1].trim();

async function toBufferProd(b64, width=1024, height=1024) {
  const raw = Buffer.from(b64.split(',')[1], 'base64');
  return await sharp(raw)
    .resize(width, height, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } }) // TRANSPARENT — production code
    .png()
    .toBuffer();
}

async function combinedBoardProd(charBuf, prodBuf) {
  const charResized = await sharp(charBuf).resize(512, 1024, { fit:'cover', position:'centre' }).png().toBuffer();
  const prodResized = await sharp(prodBuf).resize(512, 1024, { fit:'contain', background:{r:255,g:255,b:255,alpha:255} }).png().toBuffer();
  return await sharp({ create:{width:1024,height:1024,channels:4,background:{r:255,g:255,b:255,alpha:255}} })
    .composite([
      { input:charResized, left:0, top:0 },
      { input:prodResized, left:512, top:0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const data = JSON.parse(fs.readFileSync('storage.json','utf8'));
  const project = data.projects[data.projects.length - 1][1];

  const charBuf = await toBufferProd(project.characterReferenceImageUrl);
  const prodBuf = await toBufferProd(project.referenceImageUrl);
  const board = await combinedBoardProd(charBuf, prodBuf);

  fs.writeFileSync('diag_combined_board.png', board);
  console.log('=== COMBINED REFERENCE BOARD (production path) ===');
  console.log('size :', board.length, 'bytes');
  console.log('saved: diag_combined_board.png');

  const fd = new globalThis.FormData();
  fd.append('model', 'gpt-image-1.5');
  // Use a realistic production-style prompt
  fd.append('prompt', 'Create an ultra-realistic vertical 9:16 UGC-style photo. CHARACTER (must match reference image exactly): Use the exact same person from the character reference image. Russian man in his 30s wearing grey t-shirt. PRODUCT (must match reference image exactly): Use the exact same product from the product reference image. Tall slim plastic bottle with cap, label intact. Man stands in suburban backyard holding the bottle naturally toward camera. Smartphone UGC realism, natural daylight.');
  fd.append('n', '1');
  fd.append('size', '1024x1536');
  fd.append('quality', 'high');
  fd.append('image', new globalThis.Blob([board], { type:'image/png' }), 'reference.png');

  console.log('\n=== CALLING /v1/images/edits with COMBINED BOARD ===');
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+key },
    body: fd
  });
  console.log('HTTP   :', res.status);
  console.log('reqId  :', res.headers.get('x-request-id'));
  console.log('latency:', Date.now()-t0, 'ms');

  const body = await res.json();
  if (body.error) {
    console.log('ERROR:', JSON.stringify(body.error, null, 2));
    process.exit(1);
  }

  const outBuf = Buffer.from(body.data[0].b64_json, 'base64');
  fs.writeFileSync('diag_combined_output.png', outBuf);
  console.log('\noutput size:', outBuf.length, 'bytes');
  console.log('saved      : diag_combined_output.png');
}

main().catch(e => { console.error('SCRIPT ERROR:', e.message); process.exit(1); });
