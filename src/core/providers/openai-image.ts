import type { ImageProvider } from "./interfaces";
import sharp from "sharp";

const IMAGE_MODEL = "gpt-image-1.5";

export class OpenAIImageProvider implements ImageProvider {
  name = "openai-gpt-image";
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async generateImage(
    prompt: string,
    productImageUrl?: string,
    characterSeedUrl?: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }

    if (productImageUrl) {
      console.warn(
        "[OpenAIImageProvider] productImageUrl is IGNORED — Stage 2 product-compositor handles product overlay. Stage 1 must not render branded product."
      );
    }

    if (characterSeedUrl) {
      return await this.generateWithEdits(prompt, characterSeedUrl);
    }
    return await this.generateStandalone(prompt);
  }

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
      .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 255 } })
      .png()
      .toBuffer();
  }

  private async generateWithEdits(
    prompt: string,
    characterSeedUrl: string
  ): Promise<string> {
    const referenceBuffer = await this.toBuffer(characterSeedUrl);
    const referenceDescription = "character_only (Stage 2 compositor handles product overlay)";

    console.log(`[OpenAIImageProvider] /images/edits`);
    console.log(`[OpenAIImageProvider] model: ${IMAGE_MODEL}, size: 1024x1536, quality: high`);
    console.log(`[OpenAIImageProvider] reference: ${referenceDescription}`);
    console.log(`[OpenAIImageProvider] prompt (first 300): ${prompt.substring(0, 300)}`);

    const formData = new FormData();
    formData.append("model", IMAGE_MODEL);
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1536");
    formData.append("quality", "high");

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
      const err = await response.json().catch(() => ({}));
      const msg = (err as any)?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`[openai /images/edits] ${IMAGE_MODEL}: ${msg}`);
    }

    const data = await response.json();
    const url = data.data?.[0]?.url;
    const b64 = data.data?.[0]?.b64_json;

    if (!url && !b64) {
      throw new Error("[openai /images/edits] No image data in response");
    }

    console.log(`[OpenAIImageProvider] Image generated via /images/edits (${referenceDescription})`);
    return url ?? `data:image/png;base64,${b64}`;
  }

  private async generateStandalone(prompt: string): Promise<string> {
    console.log(`[OpenAIImageProvider] /images/generations`);
    console.log(`[OpenAIImageProvider] model: ${IMAGE_MODEL}, size: 1024x1536, quality: high`);
    console.log(`[OpenAIImageProvider] prompt (first 300): ${prompt.substring(0, 300)}`);

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
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
        errDetail = (errBody as any)?.error?.message ?? JSON.stringify(errBody);
      } catch {}
      throw new Error(`[openai /images/generations] ${IMAGE_MODEL}: ${errDetail}`);
    }

    const data = await response.json();
    const url = data.data?.[0]?.url;
    const b64 = data.data?.[0]?.b64_json;

    if (!url && !b64) {
      throw new Error("[openai /images/generations] No image data in response");
    }

    console.log(`[OpenAIImageProvider] Image generated via /images/generations`);
    return url ?? `data:image/png;base64,${b64}`;
  }
}
