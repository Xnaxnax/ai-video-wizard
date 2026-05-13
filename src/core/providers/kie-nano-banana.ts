/**
 * KIE.ai Nano Banana Pro (Gemini 3 Pro Image) provider.
 *
 * Replaces gpt-image-1.5 for Stage 1 scene generation.
 * - Better character consistency (native multi-reference, up to 8 images)
 * - Better prompt adherence (built-in reasoning pass)
 * - Better color accuracy for the magenta placeholder bottle
 * - ~3x cheaper than gpt-image-1.5 ($0.09/image vs $0.13-0.25)
 *
 * API flow (async):
 *   1. POST /api/v1/jobs/createTask  → { taskId }
 *   2. Poll GET /api/v1/jobs/recordInfo?taskId=… until state=success
 *   3. Fetch resultUrls[0] and return as data: URL (compatible with the rest of the pipeline)
 *
 * Reference images (characterSeedUrl) must be HTTP URLs. If the seed is a
 * data: URL, it is uploaded to kie.ai's base64 endpoint first.
 */
import type { ImageProvider } from "./interfaces";

const CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const POLL_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const BASE64_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
const MODEL = "nano-banana-pro";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 240_000; // 4 min — Nano Banana Pro typical 30-90s incl. reasoning pass

export class KieNanoBananaProvider implements ImageProvider {
  name = "kie-nano-banana-pro";
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.KIE_API_KEY;
  }

  async generateImage(
    prompt: string,
    productImageUrl?: string,
    characterSeedUrl?: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("KIE_API_KEY is not set.");
    }

    if (productImageUrl) {
      console.warn(
        "[KieNanoBanana] productImageUrl is IGNORED — Stage 2 product-compositor handles product overlay."
      );
    }

    const imageInput: string[] = [];
    if (characterSeedUrl) {
      const url = await this.ensureHttpUrl(characterSeedUrl, "character-seed.png");
      imageInput.push(url);
    }

    const taskId = await this.createTask(prompt, imageInput);
    console.log(`[KieNanoBanana] taskId=${taskId} created, polling...`);

    const resultUrl = await this.pollUntilDone(taskId);
    console.log(`[KieNanoBanana] task ${taskId} succeeded, fetching result image...`);

    return await this.fetchAsDataUrl(resultUrl);
  }

  // ─── kie.ai HTTP helpers ─────────────────────────────────────────────────

  private async createTask(prompt: string, imageInput: string[]): Promise<string> {
    const body = {
      model: MODEL,
      input: {
        prompt,
        aspect_ratio: "9:16",
        resolution: "1K",
        output_format: "png",
        ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
      },
    };

    console.log(
      `[KieNanoBanana] createTask model=${MODEL} ar=9:16 res=1K refs=${imageInput.length} promptLen=${prompt.length}`
    );

    const res = await fetch(CREATE_TASK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`[KieNanoBanana] createTask HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data?.taskId) {
      throw new Error(`[KieNanoBanana] createTask failed: ${JSON.stringify(json)}`);
    }
    return json.data.taskId as string;
  }

  private async pollUntilDone(taskId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt++;
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const res = await fetch(`${POLL_URL}?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        console.warn(`[KieNanoBanana] poll attempt ${attempt} HTTP ${res.status}, retrying...`);
        continue;
      }

      const json = await res.json();
      const state: string = json.data?.state ?? "unknown";

      if (state === "success") {
        const resultJson = json.data?.resultJson;
        if (!resultJson) {
          throw new Error(`[KieNanoBanana] success but no resultJson: ${JSON.stringify(json)}`);
        }
        const parsed = typeof resultJson === "string" ? JSON.parse(resultJson) : resultJson;
        const url = parsed?.resultUrls?.[0];
        if (!url) {
          throw new Error(`[KieNanoBanana] resultUrls empty: ${JSON.stringify(parsed)}`);
        }
        return url as string;
      }

      if (state === "fail") {
        const failMsg = json.data?.failMsg ?? "(no failMsg)";
        throw new Error(`[KieNanoBanana] task ${taskId} FAILED: ${failMsg}`);
      }

      if (attempt % 4 === 0) {
        console.log(`[KieNanoBanana] poll attempt ${attempt}, state=${state}`);
      }
    }

    throw new Error(`[KieNanoBanana] task ${taskId} timed out after ${POLL_TIMEOUT_MS}ms`);
  }

  /**
   * Ensures the given image is reachable by kie.ai as an HTTP URL.
   * If it's already an http(s) URL, returns it as-is.
   * If it's a data: URL, uploads it to kie.ai base64 endpoint and returns the downloadUrl.
   */
  private async ensureHttpUrl(urlOrDataUrl: string, fileName: string): Promise<string> {
    if (urlOrDataUrl.startsWith("http://") || urlOrDataUrl.startsWith("https://")) {
      return urlOrDataUrl;
    }
    if (!urlOrDataUrl.startsWith("data:")) {
      throw new Error(`[KieNanoBanana] unsupported image source: ${urlOrDataUrl.substring(0, 40)}…`);
    }

    console.log(`[KieNanoBanana] uploading data: URL to kie.ai (size=${urlOrDataUrl.length} chars)`);
    const res = await fetch(BASE64_UPLOAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        base64Data: urlOrDataUrl,
        uploadPath: "images/character-refs",
        fileName,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`[KieNanoBanana] base64 upload HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();
    const downloadUrl = json?.data?.downloadUrl ?? json?.downloadUrl;
    if (!downloadUrl) {
      throw new Error(`[KieNanoBanana] base64 upload returned no downloadUrl: ${JSON.stringify(json)}`);
    }
    console.log(`[KieNanoBanana] uploaded → ${downloadUrl}`);
    return downloadUrl as string;
  }

  private async fetchAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`[KieNanoBanana] failed to fetch result image HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
}
