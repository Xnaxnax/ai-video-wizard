import fs from 'fs';
import path from 'path';
import type { ProductProfile } from '@/types';

// Путь к файлу базы данных в корне проекта
const STORAGE_PATH = path.join(process.cwd(), 'storage.json');

export interface ProjectRecord {
  id: string;
  title: string;
  topic: string;
  status: string;
  currentStep: string;
  visualStyle?: string;
  referenceImageUrl?: string;
  productAnalysis?: string;
  productProfile?: ProductProfile;
  characterReferenceImageUrl?: string;
  scriptChatHistory?: { role: "user" | "assistant" | "system"; content: string }[];
  scenes: SceneRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneRecord {
  id: string;
  projectId: string;
  order: number;
  brief: string | null;
  sceneScript: string | null;
  imagePrompt: string | null;
  imageUrl: string | null;
  animationPrompt: string | null;
  videoUrl: string | null;
  animationJobId?: string | null;
  animationStatus?: "PENDING" | "UPSCALE_PENDING" | "COMPLETED" | "FAILED" | null;
  animationError?: string | null;
  mediaGenerationId?: string | null;
  upscaleJobId?: string | null;
  voiceoverScript: string | null;
  voiceProfile: string | null;
  voiceAudioUrl: string | null;
  voicedVideoUrl: string | null;
  requiresProductImage: boolean;
  finalApproved: boolean;
  physicsPlan?: string | null;
  promptLog?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class PersistentStore {
  private projects: Map<string, ProjectRecord> = new Map();
  private scenes: Map<string, SceneRecord> = new Map();

  constructor() {
    this.load();
  }

  private save() {
    try {
      const data = {
        projects: Array.from(this.projects.entries()),
        scenes: Array.from(this.scenes.entries()),
      };
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error("[Store] Failed to save storage:", error);
    }
  }

  private load() {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.projects) && Array.isArray(data.scenes)) {
          this.projects = new Map(data.projects);
          this.scenes = new Map(data.scenes);
          console.log(`[Store] Loaded ${this.projects.size} projects and ${this.scenes.size} scenes.`);
        } else {
          console.error("[Store] Invalid storage data format");
        }
      }
    } catch (error) {
      console.error("[Store] Failed to load storage:", error);
    }
  }

  // === Projects ===
  createProject(data: { title: string; topic: string; status?: string; currentStep?: string; referenceImageUrl?: string; productAnalysis?: string; productProfile?: ProductProfile; characterReferenceImageUrl?: string }): ProjectRecord {
    const id = crypto.randomUUID();
    const now = new Date();
    const project: ProjectRecord = {
      id,
      title: data.title,
      topic: data.topic,
      status: data.status || "DRAFT",
      currentStep: data.currentStep || "SCRIPT_GENERATION",
      visualStyle: "",
      referenceImageUrl: data.referenceImageUrl,
      productAnalysis: data.productAnalysis || "",
      productProfile: data.productProfile,
      characterReferenceImageUrl: data.characterReferenceImageUrl,
      scriptChatHistory: [],
      scenes: [],
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    this.save();
    return project;
  }

  getProject(id: string): ProjectRecord | null {
    const project = this.projects.get(id);
    if (!project) return null;
    project.scenes = this.getScenesByProject(id);
    return project;
  }

  getAllProjects(): ProjectRecord[] {
    return Array.from(this.projects.values()).map((p) => ({
      ...p,
      scenes: this.getScenesByProject(p.id),
    }));
  }

  updateProject(id: string, data: Partial<ProjectRecord>): ProjectRecord | null {
    const project = this.projects.get(id);
    if (!project) return null;
    const updated = { ...project, ...data, updatedAt: new Date() };
    updated.scenes = this.getScenesByProject(id);
    this.projects.set(id, updated);
    this.save();
    return updated;
  }

  // === Scenes ===
  createScene(data: {
    projectId: string;
    order: number;
    brief?: string | null;
    sceneScript?: string | null;
    requiresProductImage?: boolean;
  }): SceneRecord {
    const id = crypto.randomUUID();
    const now = new Date();
    const scene: SceneRecord = {
      id,
      projectId: data.projectId,
      order: data.order,
      brief: data.brief || null,
      sceneScript: data.sceneScript || null,
      imagePrompt: null,
      imageUrl: null,
      animationPrompt: null,
      animationStatus: null,
      animationJobId: null,
      mediaGenerationId: null,
      upscaleJobId: null,
      videoUrl: null,
      voiceoverScript: null,
      voiceProfile: null,
      voiceAudioUrl: null,
      voicedVideoUrl: null,
      requiresProductImage: !!data.requiresProductImage,
      finalApproved: false,
      createdAt: now,
      updatedAt: now,
    };
    this.scenes.set(id, scene);
    this.save();
    return scene;
  }

  getScene(id: string): (SceneRecord & { project: ProjectRecord }) | null {
    const scene = this.scenes.get(id);
    if (!scene) return null;
    const project = this.projects.get(scene.projectId);
    if (!project) return null;
    return { ...scene, project: { ...project, scenes: [] } };
  }

  getScenesByProject(projectId: string): SceneRecord[] {
    return Array.from(this.scenes.values())
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.order - b.order);
  }

  updateScene(id: string, data: Partial<SceneRecord>): SceneRecord | null {
    const scene = this.scenes.get(id);
    if (!scene) return null;
    const updated = { ...scene, ...data, updatedAt: new Date() };
    this.scenes.set(id, updated);
    this.save();
    return updated;
  }
}

// Singleton
const globalForStore = globalThis as unknown as { store: PersistentStore | undefined };
export const store = globalForStore.store ?? new PersistentStore();
if (process.env.NODE_ENV !== "production") globalForStore.store = store;
