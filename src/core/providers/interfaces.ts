// Общие интерфейсы для AI-провайдеров

export interface SceneInput {
  brief: string;
  sceneScript?: string;
  imagePrompt?: string;
  imageUrl?: string;
  animationPrompt?: string;
  videoUrl?: string;
  voiceoverScript?: string;
  voiceProfile?: string;
  sceneIndex?: number;   // 1-based index (e.g., 1 of 4)
  totalScenes?: number;  // total number of scenes in the project
}

export interface GeneratedScene {
  brief: string;
  sceneScript: string;
}

// === Script Provider ===
export interface ScriptProvider {
  name: string;
  generateScenes(topic: string): Promise<{ scenes: GeneratedScene[]; visualStyle: string }>;
  regenerateSceneScript(scene: SceneInput, projectTopic: string): Promise<string>;
  generateImagePrompt(sceneScript: string, visualStyle?: string, requiresProductImage?: boolean, productAnalysis?: string, sceneBrief?: string, sceneIndex?: number, totalScenes?: number): Promise<string>;
  generateAnimationPrompt(sceneScript: string, imagePrompt: string): Promise<string>;
  generateVoiceoverScript(sceneScript: string): Promise<string>;
  analyzeProductImage(imageUrl: string): Promise<string>;
  reviseImagePrompt(currentPrompt: string, userFeedback: string): Promise<string>;
}

export interface ImageProvider {
  name: string;
  generateImage(prompt: string, referenceImageUrl?: string, characterSeedUrl?: string): Promise<string>;
}

// === Animation Provider ===
export interface AnimationProvider {
  name: string;
  generateAnimation(imageUrl: string, prompt: string, options?: { productReferenceUrl?: string }): Promise<{ videoUrl?: string; jobId?: string }>;
  checkAnimationStatus?(jobId: string): Promise<{ status: "PENDING" | "COMPLETED" | "FAILED"; videoUrl?: string; mediaGenerationId?: string; error?: string }>;
  upscaleVideo?(mediaGenerationId: string): Promise<{ jobId: string }>;
}

// === Voice Provider ===
export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  gender: "male" | "female";
  age: "young" | "adult";
}

export interface VoiceProvider {
  name: string;
  getAvailableVoices(): VoiceProfile[];
  synthesizeVoice(text: string, voiceProfileId: string): Promise<string>; // returns URL/path to audio
}

// === Media Provider (ffmpeg) ===
export interface MediaProvider {
  name: string;
  overlayAudio(videoUrl: string, audioUrl: string): Promise<string>; // returns URL/path
  stitchVideos(videoUrls: string[]): Promise<string>; // returns URL/path to final video
}
