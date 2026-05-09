import type { AnimationProvider } from "./interfaces";

/**
 * Провайдер анимации через useapi.net (Google Flow / Veo 3.1)
 */
export class UseApiAnimationProvider implements AnimationProvider {
  name = "useapi-flow";

  private token: string;
  private email: string;
  private voice: string;
  private baseUrl = "https://api.useapi.net/v1/google-flow";

  constructor() {
    this.token = process.env.USEAPI_TOKEN || "";
    this.email = process.env.USEAPI_EMAIL || "";
    this.voice = process.env.GOOGLE_FLOW_VOICE || "zephyr"; // Дефолтный голос

    if (!this.token || !this.email) {
      console.warn("UseApiAnimationProvider: USEAPI_TOKEN or USEAPI_EMAIL is missing.");
    }
  }

  async generateAnimation(
    imageUrl: string, 
    prompt: string, 
    options?: { productReferenceUrl?: string }
  ): Promise<{ videoUrl?: string; jobId?: string }> {
    console.log(`[UseApi] Starting animation process for: ${imageUrl}`);

    try {
      // 1. Сначала загружаем изображение в ассеты useapi (это надежнее, чем прямая ссылка)
      console.log(`[UseApi] Uploading image to assets...`);
      const assetId = await this.uploadAsset(imageUrl);
      console.log(`[UseApi] Asset uploaded, ID: ${assetId}`);

      // [FORCED REBUILD 2026-05-08 15:56]
      let productAssetId = null;
      if (options?.productReferenceUrl) {
        try {
          productAssetId = await this.uploadAsset(options.productReferenceUrl);
          console.log(`[UseApi] Product reference asset uploaded, ID: ${productAssetId}`);
        } catch (err) {
          console.warn(`[UseApi] Failed to upload product reference image, continuing without it:`, err);
        }
      }

      const requestBody: any = {
        email: this.email,
        prompt: prompt,
        referenceImage_1: assetId, // Base scene image
        voice: this.voice,
        model: "veo-3.1-fast",
        aspectRatio: "portrait",
        duration: 8,
        async: true,
        captchaRetry: true,
      };

      if (productAssetId) {
        requestBody.referenceImage_2 = productAssetId; // Product consistency reference
      }

      console.log(`[UseApi] POST /videos request body (keys):`, Object.keys(requestBody));

      // 2. Создаем задачу на генерацию видео (с ручными повторами при ошибке капчи)
      let response;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        response = await fetch(`${this.baseUrl}/videos`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) break;

        const errorData = await response.json();
        const isCaptchaError = JSON.stringify(errorData).includes("reCAPTCHA") || response.status === 403;

        if (isCaptchaError && attempts < maxAttempts) {
          console.warn(`[UseApi] Captcha error (attempt ${attempts}/${maxAttempts}), retrying in 5s...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        console.error(`[UseApi] Videos error response:`, JSON.stringify(errorData));
        
        // Пишем в файл для отладки
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(process.cwd(), 'error_debug.log');
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] UseApi ERROR: ${JSON.stringify(errorData)}\n`);

        throw new Error(`UseApi API error: ${JSON.stringify(errorData.error?.message || JSON.stringify(errorData))}`);
      }

      if (!response || !response.ok) {
        throw new Error("Failed to get successful response from UseApi after retries");
      }

      const jobData = await response.json();
      console.log(`[UseApi] Videos response:`, JSON.stringify(jobData));
      const jobId = jobData.jobid || jobData.jobId || jobData.job_id || jobData.id;

      if (!jobId) {
        throw new Error(`UseApi failed to return jobid. Response: ${JSON.stringify(jobData)}`);
      }

      console.log(`[UseApi] Job created: ${jobId}. Returning jobId for background polling.`);
      
      // Возвращаем jobId вместо того, чтобы ждать здесь 15 минут
      return { jobId };
    } catch (error) {
      console.error("[UseApi] Error in animation pipeline:", error);
      throw error;
    }
  }

  private async uploadAsset(imageUrl: string): Promise<string> {
    let imageBuffer: Buffer | ArrayBuffer;
    let contentType: string = "image/jpeg";

    if (imageUrl.startsWith("data:")) {
      console.log(`[UseApi] Detected base64 image data.`);
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error("Invalid base64 image data format");
      }
      contentType = match[1];
      const base64Data = match[2];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // Download the image from URL
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) {
        throw new Error(`Failed to download image for upload: ${imageUrl}`);
      }
      contentType = imgResponse.headers.get("content-type") || "image/jpeg";
      imageBuffer = await imgResponse.arrayBuffer();
    }

    // Upload as binary to UseApi assets
    const response = await fetch(`${this.baseUrl}/assets/${this.email}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": contentType,
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Asset upload failed: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`[UseApi] Asset upload response:`, JSON.stringify(data));
    // По документации: mediaGenerationId.mediaGenerationId содержит полный reference ID
    // в формате "user:...-email:...-image:..." — именно это нужно передавать в startImage
    const id = data?.mediaGenerationId?.mediaGenerationId;
    if (!id) {
      throw new Error(`Asset upload did not return mediaGenerationId. Response: ${JSON.stringify(data)}`);
    }

    console.log(`[UseApi] Asset ID extracted: ${id}`);
    return id;
  }

  async checkAnimationStatus(jobId: string): Promise<{ status: "PENDING" | "COMPLETED" | "FAILED"; videoUrl?: string; mediaGenerationId?: string; error?: string }> {
    const logPrefix = `[UseApi][Job:${jobId}]`;
    try {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
        headers: {
          "Authorization": `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        console.warn(`${logPrefix} Check status error: HTTP ${response.status}`);
        // 410 Gone — джоб истёк или удалён, помечаем как FAILED
        if (response.status === 410) {
          return { status: "FAILED", error: "Job has expired or was removed (410 Gone)" };
        }
        // Другие HTTP ошибки (например 502/503) считаем временными и оставляем PENDING
        return { status: "PENDING" };
      }

      const jobStatus = await response.json();
      const status = jobStatus.status; // 'created' | 'started' | 'completed' | 'failed'
      console.log(`${logPrefix} Status from API: ${status}`);

      if (status === "completed") {
        console.log(`${logPrefix} Job completed successfully. Extracting video URL...`);
        
        // По документации и тестам, URL может быть в разных местах
        // 1. В response.media[0].videoUrl (новый формат)
        // 2. В response.operations[0].operation.metadata.video.fifeUrl
        // 3. В response.operations[0].video.uri
        
        let videoUrl: string | undefined;

        // Пытаемся найти в media (самый прямой путь в новом API)
        const media = jobStatus.response?.media || jobStatus.media;
        let mediaGenerationId: string | undefined;

        if (Array.isArray(media) && media.length > 0) {
          videoUrl = media[0].videoUrl || media[0].video?.uri || media[0].url;
          mediaGenerationId = media[0].mediaGenerationId;
          if (videoUrl) console.log(`${logPrefix} Found video URL in media[0]: ${videoUrl}`);
          if (mediaGenerationId) console.log(`${logPrefix} Found mediaGenerationId: ${mediaGenerationId}`);
        }

        // Пытаемся найти в operations
        if (!videoUrl) {
          const operations = jobStatus.response?.operations || jobStatus.operations;
          if (Array.isArray(operations) && operations.length > 0) {
            for (const op of operations) {
              // Путь через metadata (Veo 3.1 Lite)
              videoUrl = op.operation?.metadata?.video?.fifeUrl 
                      || op.operation?.metadata?.video?.uri
                      || op.video?.uri 
                      || op.video?.fifeUrl 
                      || op.video?.url
                      || op.videoUrl;
              if (videoUrl) {
                console.log(`${logPrefix} Found video URL in operations: ${videoUrl}`);
                break;
              }
            }
          }
        }

        // Если не нашли в operations, ищем в корне ответа
        if (!videoUrl) {
          videoUrl = jobStatus.response?.video?.uri 
                  || jobStatus.video?.uri 
                  || jobStatus.response?.videoUrl 
                  || jobStatus.videoUrl;
          if (videoUrl) console.log(`${logPrefix} Found video URL in response root: ${videoUrl}`);
        }

        if (!videoUrl) {
          console.error(`${logPrefix} Completed but no video URL found. Full response structure:`, JSON.stringify(jobStatus, null, 2));
          return { status: "FAILED", error: "No video URL found in completed job response." };
        }

        console.log(`${logPrefix} Video URL found: ${videoUrl}`);
        return { status: "COMPLETED", videoUrl, mediaGenerationId };
      }

      if (status === "failed") {
        console.error(`${logPrefix} Job failed reported by API. Analyzing error...`);
        // Детальная ошибка может быть глубоко в структуре
        const detail = jobStatus.response?.error?.message 
                    || jobStatus.response?.statusDetail 
                    || jobStatus.error?.message
                    || jobStatus.error 
                    || "Unknown API error";
        
        console.error(`${logPrefix} Failure detail: ${detail}`);
        return { status: "FAILED", error: detail };
      }

      // 'created' | 'started' | 'progress' — всё ещё в процессе
      return { status: "PENDING" };
    } catch (pollError: any) {
      console.error(`${logPrefix} Exception during status check:`, pollError);
      // При сетевых исключениях возвращаем PENDING, чтобы попробовать позже
      return { status: "PENDING", error: pollError.message };
    }
  }

  async upscaleVideo(mediaGenerationId: string): Promise<{ jobId: string }> {
    console.log(`[UseApi] Triggering upscale for: ${mediaGenerationId}`);
    const response = await fetch(`${this.baseUrl}/videos/upscale`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mediaGenerationId: mediaGenerationId,
        resolution: "1080p", // Standard high-res upscale
        async: true,
        captchaRetry: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[UseApi] Upscale error response:`, JSON.stringify(errorData));
      throw new Error(`UseApi Upscale error: ${JSON.stringify(errorData)}`);
    }

    const jobData = await response.json();
    const jobId = jobData.jobid || jobData.jobId || jobData.job_id || jobData.id;
    return { jobId };
  }
}
