// PHASE 1 DIAGNOSTIC — does /images/edits preserve the product?
// Take real product PNG from storage, send to edits with strong "preserve" prompt,
// hash both, compare.
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const path = require('path');

const key = fs.readFileSync('.env.local','utf8').match(/OPENAI_API_KEY=(.+)/)?.[1].trim();

async function main() {
  const data = JSON.parse(fs.readFileSync('storage.json','utf8'));
  const project = data.projects[data.projects.length - 1][1];
  const productB64 = project.referenceImageUrl.split(',')[1];
  const productBuf = Buffer.from(productB64, 'base64');

  // Pad product to 1024x1024 with WHITE (matches what generateWithEdits does for product_only)
  const productOnly = await sharp(productBuf)
    .resize(1024, 1024, { fit: 'contain', background: { r:255, g:255, b:255, alpha:255 } })
    .png()
    .toBuffer();

  const inputHash = crypto.createHash('sha256').update(productOnly).digest('hex');
  const inputMeta = await sharp(productOnly).metadata();

  fs.writeFileSync('diag_input_product.png', productOnly);
  console.log('=== INPUT REFERENCE ===');
  console.log('size  :', productOnly.length, 'bytes');
  console.log('dims  :', inputMeta.width+'x'+inputMeta.height);
  console.log('sha256:', inputHash.substring(0,16) + '...');
  console.log('saved : diag_input_product.png');

  const fd = new globalThis.FormData();
  fd.append('model', 'gpt-image-1.5');
  fd.append('prompt', 'A man holding this exact same product bottle in a backyard. Preserve product label and shape exactly.');
  fd.append('n', '1');
  fd.append('size', '1024x1536');
  fd.append('quality', 'high');
  fd.append('image', new globalThis.Blob([productOnly], { type:'image/png' }), 'reference.png');

  console.log('\n=== CALLING /v1/images/edits ===');
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+key },
    body: fd
  });
  const dt = Date.now() - t0;
  const reqId = res.headers.get('x-request-id');
  console.log('HTTP   :', res.status);
  console.log('reqId  :', reqId);
  console.log('latency:', dt+'ms');

  const body = await res.json();
  if (body.error) {
    console.log('ERROR:', JSON.stringify(body.error, null, 2));
    process.exit(1);
  }

  const outBuf = Buffer.from(body.data[0].b64_json, 'base64');
  const outHash = crypto.createHash('sha256').update(outBuf).digest('hex');
  const outMeta = await sharp(outBuf).metadata();
  fs.writeFileSync('diag_output_edits.png', outBuf);

  console.log('\n=== OUTPUT ===');
  console.log('size  :', outBuf.length, 'bytes');
  console.log('dims  :', outMeta.width+'x'+outMeta.height);
  console.log('sha256:', outHash.substring(0,16) + '...');
  console.log('saved : diag_output_edits.png');

  // Crop the central region (where bottle should appear) and compare with input bottle region
  // Output is portrait 1024x1536, bottle likely in upper-center area
  const inputCrop = await sharp(productOnly)
    .extract({ left: 256, top: 256, width: 512, height: 512 })
    .png()
    .toBuffer();
  const outputCrop = await sharp(outBuf)
    .extract({ left: 256, top: 512, width: 512, height: 512 })
    .png()
    .toBuffer();

  fs.writeFileSync('diag_input_crop.png', inputCrop);
  fs.writeFileSync('diag_output_crop.png', outputCrop);

  // Perceptual: downsample both to 16x16 grayscale, compare bytes
  const inHash16 = await sharp(inputCrop).resize(16,16).grayscale().raw().toBuffer();
  const outHash16 = await sharp(outputCrop).resize(16,16).grayscale().raw().toBuffer();

  let diff = 0;
  for (let i = 0; i < 256; i++) diff += Math.abs(inHash16[i] - outHash16[i]);
  const avgDiff = diff / 256;

  console.log('\n=== HASH DIFF (16x16 grayscale L1, central crop) ===');
  console.log('input  perceptual hash (first 8):', Buffer.from(inHash16).toString('hex').substring(0,16));
  console.log('output perceptual hash (first 8):', Buffer.from(outHash16).toString('hex').substring(0,16));
  console.log('avg pixel diff:', avgDiff.toFixed(2), '/ 255');
  console.log('verdict:', avgDiff < 10 ? 'NEAR-IDENTICAL (preserved)' : avgDiff < 40 ? 'SIMILAR' : 'CLEARLY DIFFERENT (regenerated)');
}

main().catch(e => { console.error('SCRIPT ERROR:', e.message); process.exit(1); });
