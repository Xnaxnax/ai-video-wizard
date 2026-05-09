import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const match = envContent.match(/OPENAI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

console.log('API Key starts with:', apiKey.substring(0, 20) + '...');
console.log('Connecting to OpenAI...');

const start = Date.now();

try {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(120_000)
  });
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Response in ${elapsed}s, status: ${res.status}`);
  
  const data = await res.json();
  
  if (data.error) {
    console.log('API ERROR:', JSON.stringify(data.error, null, 2));
  } else {
    console.log('SUCCESS! Models available:', data.data?.length);
  }
} catch (e) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`FAILED after ${elapsed}s:`, e.message);
}
