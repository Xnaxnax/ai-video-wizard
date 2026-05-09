// State Machine для управления шагами проекта
import type { ProjectStep } from "@/types";

export const STEP_ORDER: ProjectStep[] = [
  "SCRIPT_GENERATION",
  "IMAGE_GENERATION",
  "ANIMATION_GENERATION",
  "FINAL_STITCH",
  "COMPLETED",
];

export const STEP_META: Record<ProjectStep, { label: string; shortLabel: string; description: string; icon: string }> = {
  SCRIPT_GENERATION: {
    label: "Генерация сценария",
    shortLabel: "Сценарий",
    description: "Создайте тему и получите сценарий по сценам",
    icon: "📝",
  },
  IMAGE_GENERATION: {
    label: "Генерация фото",
    shortLabel: "Фото",
    description: "Генерация изображений для каждой сцены",
    icon: "🖼️",
  },
  ANIMATION_PROMPT: {
    label: "Промпты анимации",
    shortLabel: "Промпты",
    description: "Подготовка промптов для анимации сцен (устарело)",
    icon: "✨",
  },
  ANIMATION_GENERATION: {
    label: "Анимация сцен",
    shortLabel: "Анимация",
    description: "Создание видео с озвучкой",
    icon: "🎬",
  },
  FINAL_STITCH: {
    label: "Сборка видео",
    shortLabel: "Сборка",
    description: "Склейка финального видео",
    icon: "🎞️",
  },
  COMPLETED: {
    label: "Готово",
    shortLabel: "Готово",
    description: "Проект завершён",
    icon: "✅",
  },
};

export function getStepIndex(step: ProjectStep): number {
  if (step === ("ANIMATION_PROMPT" as any)) return STEP_ORDER.indexOf("IMAGE_GENERATION");
  return STEP_ORDER.indexOf(step);
}

export function getNextStep(current: ProjectStep): ProjectStep | null {
  const idx = getStepIndex(current);
  if (idx < 0 || idx >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[idx + 1];
}

export function getPreviousStep(current: ProjectStep): ProjectStep | null {
  const idx = getStepIndex(current);
  if (idx <= 0) return null;
  return STEP_ORDER[idx - 1];
}

export function canAdvance(current: ProjectStep): boolean {
  return current !== "COMPLETED";
}

export function canGoBack(current: ProjectStep): boolean {
  return getStepIndex(current) > 0;
}

export type StepStatus = "completed" | "current" | "upcoming" | "locked";

export function getStepStatus(step: ProjectStep, currentStep: ProjectStep): StepStatus {
  const stepIdx = getStepIndex(step);
  const currentIdx = getStepIndex(currentStep);
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "current";
  return "locked";
}
