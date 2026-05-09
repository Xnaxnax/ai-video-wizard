import type { ImageProvider } from "./interfaces";
import sharp from "sharp";

// Model priority: try the best available, fall back automatically
const IMAGE_MODELS = ["gpt-image-1.5", "gpt-image-1"] as const;

export class OpenAIImageProvider implements ImageProvider {
  name = "openai-gpt-image";
  private apiKey: string | undefined;
  /** Tracks which model actually works (avoids retrying failed models) */
  private workingModel: string | null = null;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Generate an image.
   * @param prompt - The final assembled image prompt
   * @param productImageUrl - Product reference image (URL/base64)
   * @param characterSeedUrl - Character master reference image (URL/base64)
   *
   * Reference strategy:
   * - Both product + character → Combined Reference Board (character left, product right)
   * - Only character → character as reference
   * - Only product → product as reference
   * - Neither → standalone generation
   */
  async generateImage(
    prompt: string,
    productImageUrl?: string,
    characterSeedUrl?: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }

    try {
      if (characterSeedUrl || productImageUrl) {
        return await this.generateWithEdits(prompt, characterSeedUrl, productImageUrl);
      }
      return await this.generateStandalone(prompt);
    } catch (error) {
      console.error("[OpenAIImageProvider]", error);
      throw error;
    }
  }

  /**
   * Convert a base64 data URL or http(s) URL into a PNG Buffer at target dimensions.
   */
  private async toBuffer(urlOrBase64: string, width = 1024, height = 1024): Promise<Buffer> {
    let rawBuffer: Buffer;

    if (urlOrBase64.startsWith("data:")) {
      const [, data] = urlOrBase64.split(",");
      rawBuffer = Buffer.from(data, "base64");
    } else {
      const res = await fetch(urlOrBase64);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      rawBuffer = Buffer.from(await res.arrayBuffer());
    }

    return await sharp(rawBuffer)
      .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  /**
   * Creates a Combined Reference Board: character on the left half, product on the right half.
   * Total size: 1024x1024 (required by OpenAI Edits API).
   * This ensures BOTH character and product are always in the reference when needed.
   */
  private async createCombinedReferenceBoard(
    characterBuf: Buffer,
    productBuf: Buffer
  ): Promise<Buffer> {
    // Resize each to half width, full height
    const halfW = 512;
    const fullH = 1024;

    const charResized = await sharp(characterBuf)
      .resize(halfW, fullH, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();

    const productResized = await sharp(productBuf)
      .resize(halfW, fullH, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 255 } })
      .png()
      .toBuffer();

    // Composite: character on left (x=0), product on right (x=512)
    const combined = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 255 },
      },
    })
      .composite([
        { input: charResized, left: 0, top: 0 },
        { input: productResized, left: halfW, top: 0 },
      ])
      .png()
      .toBuffer();

    console.log("[OpenAIImageProvider] Combined Reference Board created (char left, product right, 1024x1024)");
    return combined;
  }

  /**
   * Uses /v1/images/edits with one or two reference images.
   * When both character and product are present, creates a Combined Reference Board.
   */
  private async generateWithEdits(
    prompt: string,
    characterSeedUrl?: string,
    productImageUrl?: string
  ): Promise<string> {
    let referenceBuffer: Buffer | null = null;
    let referenceDescription = "";

    if (characterSeedUrl && productImageUrl) {
      // === BOTH references available: create Combined Reference Board ===
      try {
        const charBuf = await this.toBuffer(characterSeedUrl, 512, 1024);
        const prodBuf = await this.toBuffer(productImageUrl, 512, 1024);
        referenceBuffer = await this.createCombinedReferenceBoard(charBuf, prodBuf);
        referenceDescription = "combined_board (character + product)";
      } catch (e) {
        console.warn("[OpenAIImageProvider] Combined board failed, trying product only:", (e as Error).message);
        // Fallback: try product alone
        try {
          referenceBuffer = await this.toBuffer(productImageUrl);
          referenceDescription = "product_only (combined board failed)";
        } catch {
          referenceBuffer = null;
        }
      }
    } else if (characterSeedUrl) {
      // === Only character reference ===
      try {
        referenceBuffer = await this.toBuffer(characterSeedUrl);
        referenceDescription = "character_only";
      } catch (e) {
        console.warn("[OpenAIImageProvider] Character seed load failed:", (e as Error).message);
      }
    } else if (productImageUrl) {
      // === Only product reference ===
      try {
        referenceBuffer = await this.toBuffer(productImageUrl);
        referenceDescription = "product_only";
      } catch (e) {
        console.warn("[OpenAIImageProvider] Product image load failed:", (e as Error).message);
      }
    }

    // If no reference could be loaded, fall back to standalone
    if (!referenceBuffer) {
      console.warn("[OpenAIImageProvider] No reference images loaded, falling back to standalone");
      return this.generateStandalone(prompt);
    }

    const model = this.workingModel || IMAGE_MODELS[0];

    // Log before sending
    console.log(`[OpenAIImageProvider] /images/edits`);
    console.log(`[OpenAIImageProvider] model: ${model}, size: 1024x1024`);
    console.log(`[OpenAIImageProvider] reference: ${referenceDescription}`);
    console.log(`[OpenAIImageProvider] prompt (first 300): ${prompt.substring(0, 300)}`);

    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");

    const blob = new Blob([new Uint8Array(referenceBuffer)], { type: "image/png" });
    formData.append("image", blob, "reference.png");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      console.warn(`[OpenAIImageProvider] /images/edits failed (${model}):`, err?.error?.message);
      // Fallback to standalone on edits failure
      return await this.generateStandalone(prompt);
    }

    this.workingModel = model;
    const data = await response.json();
    const resultUrl = data.data?.[0]?.url || `data:image/png;base64,${data.data?.[0]?.b64_json}`;
    console.log(`[OpenAIImageProvider] Image generated via /images/edits`);
    return resultUrl || this.generateStandalone(prompt);
  }

  private async generateStandalone(prompt: string): Promise<string> {
    const modelsToTry = this.workingModel
      ? [this.workingModel]
      : [...IMAGE_MODELS];

    for (const model of modelsToTry) {
      console.log(`[OpenAIImageProvider] /images/generations`);
      console.log(`[OpenAIImageProvider] model: ${model}, size: 1024x1536, quality: high`);
      console.log(`[OpenAIImageProvider] prompt (first 300): ${prompt.substring(0, 300)}`);

      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: "1024x1536",
          quality: "high",
        }),
      });

      if (!response.ok) {
        let errDetail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          errDetail = errBody?.error?.message || JSON.stringify(errBody);
        } catch {}

        if (
          errDetail.includes("verified") ||
          errDetail.includes("does not exist") ||
          errDetail.includes("access")
        ) {
          console.warn(`[OpenAIImageProvider] Model ${model} not available: ${errDetail}`);
          continue;
        }

        console.error(`[OpenAIImageProvider] Standalone failed with ${model}: ${errDetail}`);
        throw new Error(`Standalone generation failed: ${errDetail}`);
      }

      this.workingModel = model;
      console.log(`[OpenAIImageProvider] Image generated via /images/generations with ${model}`);

      const data = await response.json();
      return data.data?.[0]?.url || `data:image/png;base64,${data.data?.[0]?.b64_json}`;
    }

    throw new Error("All image models failed. Check your OpenAI organization verification status.");
  }
}
