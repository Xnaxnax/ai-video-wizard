import { store } from "@/lib/store";
import { createProjectSchema } from "@/lib/validations";
import { getScriptProvider } from "@/core/providers";
import { analyzeProductImage, getFallbackProductProfile } from "@/core/product-analyzer";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects
export async function GET() {
  try {
    const projects = store.getAllProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error("[GET /api/projects]", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// POST /api/projects — Создать проект и сгенерировать сценарий
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, topic, scenes, scriptChatHistory, visualStyle, referenceImageUrl } = body;

    if (!topic || !scenes) {
      return NextResponse.json({ error: "Missing topic or scenes" }, { status: 400 });
    }

    const project = store.createProject({
      title: title || topic,
      topic,
      status: "GENERATING",
      currentStep: "SCRIPT_GENERATION",
      referenceImageUrl,
    });

    if (scriptChatHistory) {
      store.updateProject(project.id, { scriptChatHistory });
    }

    // === Use pre-analyzed productProfile from client if available, otherwise analyze ===
    const { productProfile: clientProductProfile } = body;
    if (clientProductProfile) {
      // Client already analyzed the product — use it directly
      store.updateProject(project.id, { productProfile: clientProductProfile });
      console.log(`[POST /api/projects] Using pre-analyzed productProfile: ${clientProductProfile.semantic?.product_category || clientProductProfile.product_type}`);
    } else if (referenceImageUrl) {
      console.log("[POST /api/projects] No pre-analyzed profile, analyzing product image...");
      const productProfile = await analyzeProductImage(referenceImageUrl);
      if (productProfile) {
        store.updateProject(project.id, { productProfile });
        console.log("[POST /api/projects] productProfile saved:", productProfile.product_type);
      } else {
        console.warn("[POST /api/projects] Product analysis failed, using fallback profile");
        store.updateProject(project.id, { productProfile: getFallbackProductProfile() });
      }
    }

    // Сохраняем переданные сцены
    for (let i = 0; i < scenes.length; i++) {
      store.createScene({
        projectId: project.id,
        order: i + 1,
        brief: scenes[i].brief,
        sceneScript: scenes[i].sceneScript,
        requiresProductImage: scenes[i].requiresProductImage,
      });
      // Optionally update the other fields if they were generated
      const createdScene = store.getScenesByProject(project.id)[i];
      if (createdScene) {
         store.updateScene(createdScene.id, {
           voiceoverScript: scenes[i].voiceoverScript,
           imagePrompt: scenes[i].imagePrompt,
           animationPrompt: scenes[i].animationPrompt
         });
      }
    }

    // Обновляем статус проекта
    const updatedProject = store.updateProject(project.id, { status: "ACTIVE", visualStyle: visualStyle || "Default style" });

    return NextResponse.json(updatedProject, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
