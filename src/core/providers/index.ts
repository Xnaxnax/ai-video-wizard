// Фабрика провайдеров — точка входа для получения нужного адаптера
import type {
  ScriptProvider,
  ImageProvider,
  AnimationProvider,
  VoiceProvider,
  MediaProvider,
} from "./interfaces";

import {
  MockScriptProvider,
  MockAnimationProvider,
  MockVoiceProvider,
  MockMediaProvider,
} from "./mock";
import { OpenAIScriptProvider } from "./openai";
import { OpenAIImageProvider } from "./openai-image";
import { KieNanoBananaProvider } from "./kie-nano-banana";

export function getScriptProvider(): ScriptProvider {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIScriptProvider();
  }
  return new MockScriptProvider();
}

// Image provider priority:
//   1. kie.ai Nano Banana Pro (KIE_API_KEY)  — primary, better quality + cheaper
//   2. OpenAI gpt-image-1.5 (OPENAI_API_KEY) — fallback for legacy projects
export function getImageProvider(): ImageProvider {
  if (process.env.KIE_API_KEY) {
    return new KieNanoBananaProvider();
  }
  return new OpenAIImageProvider();
}


import { UseApiAnimationProvider } from "./useapi";

export function getAnimationProvider(): AnimationProvider {
  if (process.env.USEAPI_TOKEN) {
    return new UseApiAnimationProvider();
  }
  return new MockAnimationProvider();
}

export function getVoiceProvider(): VoiceProvider {
  return new MockVoiceProvider();
}

export function getMediaProvider(): MediaProvider {
  return new MockMediaProvider();
}
