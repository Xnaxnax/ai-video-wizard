import { store } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";
import { getAnimationProvider } from "@/core/providers";

// GET /api/projects/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = store.getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Migration: If project is on a deleted step, move it to the closest valid step
    const obsoleteSteps = ["VOICEOVER_SCRIPT", "VOICEOVER_GENERATION"];
    if (obsoleteSteps.includes(project.currentStep)) {
      console.log(`[Migration] Project ${id} is on obsolete step ${project.currentStep}. Moving to FINAL_STITCH.`);
      store.updateProject(id, { currentStep: "FINAL_STITCH" });
      project.currentStep = "FINAL_STITCH";
    }
    
    let scenes = store.getScenesByProject(id);
    
    // Check background animation statuses
    const animationProvider = getAnimationProvider();
    if (animationProvider.checkAnimationStatus) {
      let scenesUpdated = false;
      for (const scene of scenes) {
        // 1. Поллинг обычной анимации
        if (scene.animationStatus === "PENDING" && scene.animationJobId) {
          const statusResult = await animationProvider.checkAnimationStatus(scene.animationJobId);
          
          if (statusResult.status === "COMPLETED" && statusResult.videoUrl) {
            console.log(`[Polling] Animation ${scene.animationJobId} completed. Triggering upscale...`);
            
            let upscaleJobId = null;
            let nextStatus: "UPSCALE_PENDING" | "COMPLETED" = "COMPLETED";
            
            // Пытаемся запустить апскейл, если провайдер поддерживает
            if (animationProvider.upscaleVideo && statusResult.mediaGenerationId) {
              try {
                const upscaleResult = await animationProvider.upscaleVideo(statusResult.mediaGenerationId);
                upscaleJobId = upscaleResult.jobId;
                nextStatus = "UPSCALE_PENDING";
                console.log(`[Polling] Upscale triggered, jobId: ${upscaleJobId}`);
              } catch (upscaleErr) {
                console.error(`[Polling] Failed to trigger upscale:`, upscaleErr);
                // Если апскейл не удался, оставляем как есть (просто COMPLETED)
              }
            }

            store.updateScene(scene.id, { 
              animationStatus: nextStatus, 
              videoUrl: statusResult.videoUrl,
              voicedVideoUrl: statusResult.videoUrl,
              mediaGenerationId: statusResult.mediaGenerationId,
              upscaleJobId: upscaleJobId,
              animationError: null 
            });
            scenesUpdated = true;
          } else if (statusResult.status === "FAILED") {
            store.updateScene(scene.id, { 
              animationStatus: "FAILED", 
              animationError: statusResult.error || "Animation failed" 
            });
            scenesUpdated = true;
          }
        }
        
        // 2. Поллинг апскейла
        else if (scene.animationStatus === "UPSCALE_PENDING" && scene.upscaleJobId) {
          const statusResult = await animationProvider.checkAnimationStatus(scene.upscaleJobId);
          
          if (statusResult.status === "COMPLETED" && statusResult.videoUrl) {
            console.log(`[Polling] Upscale ${scene.upscaleJobId} completed!`);
            store.updateScene(scene.id, { 
              animationStatus: "COMPLETED", 
              videoUrl: statusResult.videoUrl,
              voicedVideoUrl: statusResult.videoUrl,
              animationError: null 
            });
            scenesUpdated = true;
          } else if (statusResult.status === "FAILED") {
            console.warn(`[Polling] Upscale failed for ${scene.id}, keeping original video.`);
            // Если апскейл провалился, мы всё равно считаем анимацию COMPLETED (но с оригинальным видео)
            store.updateScene(scene.id, { 
              animationStatus: "COMPLETED",
              animationError: `Upscale failed: ${statusResult.error || "Unknown error"}. Using original video.`
            });
            scenesUpdated = true;
          }
        }
      }
      if (scenesUpdated) {
        scenes = store.getScenesByProject(id);
      }
    }

    return NextResponse.json({ ...project, scenes });
  } catch (error) {
    console.error("[GET /api/projects/:id]", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

const STEPS = [
  "SCRIPT_GENERATION",
  "IMAGE_GENERATION",
  "ANIMATION_GENERATION",
  "FINAL_STITCH",
  "COMPLETED",
] as const;

// PATCH /api/projects/[id] — Navigate steps or update project
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const project = store.getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (body.direction) {
      const currentIndex = STEPS.indexOf(project.currentStep as any);
      let nextIndex = currentIndex;
      if (body.direction === "next" && currentIndex < STEPS.length - 1) {
        nextIndex = currentIndex + 1;
      } else if (body.direction === "back" && currentIndex > 0) {
        nextIndex = currentIndex - 1;
      }
      const updatedProject = store.updateProject(id, { currentStep: STEPS[nextIndex] });
      const scenes = store.getScenesByProject(id);
      return NextResponse.json({ ...updatedProject, scenes });
    }

    // Generic update
    const updatedProject = store.updateProject(id, body);
    const scenes = store.getScenesByProject(id);
    return NextResponse.json({ ...updatedProject, scenes });
  } catch (error) {
    console.error("[PATCH /api/projects/:id]", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}
