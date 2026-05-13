// Diagnostic v2 — better vision prompt with normalized coords + step-by-step
const fs = require('fs');

const key = fs.readFileSync('.env.local','utf8').match(/OPENAI_API_KEY=(.+)/)?.[1].trim();

async function main() {
  const buf = fs.readFileSync('phase3_scene3_after.png');
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
  const W = 1024, H = 1536;

  const sys = `You are a precise object localization assistant. You output normalized bounding boxes
on a 0-1000 scale. You do NOT estimate in pixels — you output normalized coordinates only.`;

  const userPrompt = `Image is ${W} pixels wide by ${H} pixels tall (portrait orientation).
The image was generated with a GENERIC unbranded placeholder bottle (plain off-white,
no text, no labels, no logos). There may also be other branded bottles visible — IGNORE those.

TASK: Find the PLAIN UNBRANDED placeholder bottle (the one with NO label and NO text).

Reasoning step (think before answering):
1. Describe what you see in the image — list all visible objects.
2. Identify which object is the plain unbranded placeholder bottle (no labels, no text).
3. Determine its location:
   - Which horizontal quadrant: LEFT half (0-500) or RIGHT half (500-1000)?
   - Which vertical third: TOP (0-333), MIDDLE (333-666), or BOTTOM (666-1000)?
4. Estimate the placeholder bottle's bounding box on a NORMALIZED 0-1000 scale.

Output JSON only:
{
  "what_i_see": "1-sentence description of all visible objects",
  "placeholder_id": "which object is the placeholder (e.g., 'the white bottle in right hand')",
  "horizontal": "LEFT" or "RIGHT",
  "vertical": "TOP" or "MIDDLE" or "BOTTOM",
  "x_norm": number (0-1000, left edge of bbox),
  "y_norm": number (0-1000, top edge of bbox),
  "w_norm": number (0-1000, bbox width),
  "h_norm": number (0-1000, bbox height),
  "angle": number (degrees clockwise from upright, 0 if upright)
}

A handheld bottle typically has: w_norm ~80-150, h_norm ~200-330.
If no plain unbranded bottle exists, return: {"placeholder_id": "none", "x_norm": -1, "y_norm": -1, "w_norm": 0, "h_norm": 0, "angle": 0}`;

  console.log('Calling GPT-4o vision (v2 prompt)...');
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]}
      ],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    })
  });

  console.log('latency:', Date.now()-t0, 'ms');
  const data = await res.json();
  const raw = data.choices[0].message.content;
  console.log('\n=== RAW JSON ===');
  console.log(raw);
  const parsed = JSON.parse(raw);

  // Convert normalized 0-1000 to pixels
  const px = {
    x: Math.round(parsed.x_norm * W / 1000),
    y: Math.round(parsed.y_norm * H / 1000),
    width: Math.round(parsed.w_norm * W / 1000),
    height: Math.round(parsed.h_norm * H / 1000),
  };
  console.log('\n=== PIXEL CONVERSION ===');
  console.log('px:', JSON.stringify(px));
  console.log('center px:', px.x + px.width/2, ',', px.y + px.height/2);
  console.log('center as % of image:',
    (((px.x+px.width/2)/W)*100).toFixed(0) + '% from left, ' +
    (((px.y+px.height/2)/H)*100).toFixed(0) + '% from top');
  console.log('coverage:', (px.width*px.height/(W*H)*100).toFixed(1) + '% of image');

  // Draw bbox on image for verification
  const sharp = require('sharp');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${px.x}" y="${px.y}" width="${px.width}" height="${px.height}"
      fill="none" stroke="red" stroke-width="6" />
  </svg>`;
  const composited = await sharp(buf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
  fs.writeFileSync('diag_detector_bbox.png', composited);
  console.log('\nbbox visualization saved: diag_detector_bbox.png');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
