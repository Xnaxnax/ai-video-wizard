// Mock-реализации провайдеров для разработки без реальных API
import type {
  ScriptProvider,
  ImageProvider,
  AnimationProvider,
  VoiceProvider,
  MediaProvider,
  GeneratedScene,
  SceneInput,
  VoiceProfile,
} from "./interfaces";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================
// Mock Script Provider (ChatGPT)
// ============================
export class MockScriptProvider implements ScriptProvider {
  name = "mock-chatgpt";

  async generateScenes(topic: string): Promise<{ scenes: GeneratedScene[]; visualStyle: string }> {
    await delay(1500);

    const defaultScenes = [
      "Вступление и представление темы",
      "Основная идея и ключевые моменты",
      "Развитие сюжета и кульминация",
      "Заключение и призыв к действию",
    ];

    return {
      visualStyle: "cinematic, 8k, photorealistic, dramatic lighting",
      scenes: defaultScenes.map((brief, i) => ({
        brief,
        sceneScript: `Сцена ${i + 1}: ${brief}\n\nЭта сцена посвящена теме "${topic}". ${brief} — важный элемент повествования.`,
      })),
    };
  }

  async regenerateSceneScript(scene: SceneInput, projectTopic: string): Promise<string> {
    await delay(1000);
    return `[Перегенерировано] Сцена по теме "${projectTopic}": ${scene.brief}\n\nОбновлённый сценарий с улучшенной подачей. Визуальный ряд становится более динамичным, текст — более выразительным и запоминающимся.`;
  }

  async generateImagePrompt(sceneScript: string, visualStyle?: string, requiresProductImage?: boolean, productAnalysis?: string, sceneBrief?: string, sceneIndex?: number, totalScenes?: number): Promise<string> {
    await delay(800);
    const shortScript = sceneScript.substring(0, 100);
    const style = visualStyle || "Cinematic wide shot, highly detailed, 8K";
    const productLine = requiresProductImage
      ? "Use the attached bottle exactly as reference. Do not change the bottle shape. Do not change the label. Photorealistic product integration."
      : "No product in frame.";
    return `${style}, dramatic lighting: ${shortScript}... ${productLine}`;
  }

  async generateAnimationPrompt(sceneScript: string, imagePrompt: string): Promise<string> {
    await delay(800);
    return `Smooth camera pan with parallax effect, subtle motion on foreground elements, cinematic atmosphere. Based on: ${imagePrompt.substring(0, 80)}...`;
  }

  async generateVoiceoverScript(sceneScript: string): Promise<string> {
    await delay(800);
    // Извлечь суть сцены и сделать текст для озвучки
    const lines = sceneScript.split("\n").filter((l) => l.trim().length > 10);
    return lines.slice(0, 3).join(" ").substring(0, 300);
  }

  async analyzeProductImage(_imageUrl: string): Promise<string> {
    await delay(500);
    return "A white plastic bottle with a blue cap and a green label. Approximately 1 liter, cylindrical shape.";
  }

  async reviseImagePrompt(currentPrompt: string, userFeedback: string): Promise<string> {
    await delay(500);
    return `${currentPrompt} [Revised based on feedback: ${userFeedback.substring(0, 50)}]`;
  }
}


// ============================
// Mock Animation Provider (Grok)
// ============================
export class MockAnimationProvider implements AnimationProvider {
  name = "mock-grok";

  async generateAnimation(imageUrl: string, prompt: string): Promise<{ videoUrl?: string; jobId?: string }> {
    await delay(500);
    const jobId = Date.now().toString();
    console.log(`[MockAnimation] Started job ${jobId}`);
    return { jobId };
  }

  async checkAnimationStatus(jobId: string): Promise<{ status: "PENDING" | "COMPLETED" | "FAILED"; videoUrl?: string; error?: string }> {
    await delay(300);
    const timeElapsed = Date.now() - parseInt(jobId);
    if (timeElapsed > 5000) {
      console.log(`[MockAnimation] Job ${jobId} completed`);
      return { status: "COMPLETED", videoUrl: `/mock/videos/scene-${jobId}.mp4` };
    }
    console.log(`[MockAnimation] Job ${jobId} pending`);
    return { status: "PENDING" };
  }
}

// ============================
// Mock Voice Provider (ElevenLabs)
// ============================
export class MockVoiceProvider implements VoiceProvider {
  name = "mock-elevenlabs";

  getAvailableVoices(): VoiceProfile[] {
    return [
      { id: "young-female", name: "Алиса", description: "Молодая девушка, энергичный голос", gender: "female", age: "young" },
      { id: "adult-female", name: "Марина", description: "Взрослая женщина, уверенный голос", gender: "female", age: "adult" },
      { id: "young-male", name: "Артём", description: "Молодой мужчина, динамичный голос", gender: "male", age: "young" },
      { id: "adult-male", name: "Дмитрий", description: "Взрослый мужчина, глубокий голос", gender: "male", age: "adult" },
    ];
  }

  async synthesizeVoice(text: string, voiceProfileId: string): Promise<string> {
    await delay(2500);
    return `/mock/audio/voice-${voiceProfileId}-${Date.now()}.mp3`;
  }
}

// ============================
// Mock Media Provider (ffmpeg)
// ============================
export class MockMediaProvider implements MediaProvider {
  name = "mock-ffmpeg";

  async overlayAudio(videoUrl: string, audioUrl: string): Promise<string> {
    if (videoUrl === audioUrl) {
      console.log("[MockMediaProvider] Skipping overlay, audio already in video");
      return videoUrl;
    }
    await delay(2000);
    return `/mock/videos/voiced-${Date.now()}.mp4`;
  }

  async stitchVideos(videoUrls: string[]): Promise<string> {
    await delay(4000);
    return `/mock/videos/final-${Date.now()}.mp4`;
  }
}

// Helper
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
