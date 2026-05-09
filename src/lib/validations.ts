import { z } from "zod";

// ====== Project ======
export const createProjectSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  topic: z.string().min(1, "Тема обязательна"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// ====== Scene Actions ======
export const regenerateSceneSchema = z.object({
  target: z.enum([
    "script",
    "imagePrompt",
    "image",
    "animationPrompt",
    "animation",
    "voiceoverScript",
    "voice",
  ]),
});

export type RegenerateSceneInput = z.infer<typeof regenerateSceneSchema>;

export const updateSceneSchema = z.object({
  sceneScript: z.string().optional(),
  imagePrompt: z.string().optional(),
  animationPrompt: z.string().optional(),
  animationJobId: z.string().nullable().optional(),
  animationStatus: z.enum(["PENDING", "COMPLETED", "FAILED"]).nullable().optional(),
  voiceoverScript: z.string().optional(),
  voiceProfile: z.string().optional(),
  finalApproved: z.boolean().optional(),
  videoUrl: z.string().nullable().optional(),
});

export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;

// ====== Step Navigation ======
export const stepNavigationSchema = z.object({
  direction: z.enum(["next", "back"]),
});

export type StepNavigationInput = z.infer<typeof stepNavigationSchema>;

// ====== Batch Job ======
export const batchJobSchema = z.object({
  stepType: z.string(),
});

export type BatchJobInput = z.infer<typeof batchJobSchema>;
