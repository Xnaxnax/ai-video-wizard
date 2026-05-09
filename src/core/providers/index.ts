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

// В будущем здесь подключаются реальные провайдеры
// import { OpenAIScriptProvider } from "./openai";
// import { NanoBananaImageProvider } from "./nanobanana";

export function getScriptProvider(): ScriptProvider {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIScriptProvider();
  }
  return new MockScriptProvider();
}

export function getImageProvider(): ImageProvider {
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
