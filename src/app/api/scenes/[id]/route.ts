import { store } from "@/lib/store";
import { updateSceneSchema, regenerateSceneSchema } from "@/lib/validations";
import { getScriptProvider, getImageProvider, getAnimationProvider, getVoiceProvider } from "@/core/providers";
import { analyzeProductImage, getFallbackProductProfile, isActionValidForProduct } from "@/core/product-analyzer";
import { planScenePhysics, getFallbackPhysicsPlan } from "@/core/scene-physics";
import { buildImagePrompt } from "@/core/prompt-builder";
import { validatePrompt, repairPrompt } from "@/core/prompt-validator";
import { getOrCreateCharacterReference } from "@/core/character-master";
import { extractSceneAction } from "@/core/scene-action-extractor";
import { detectOverlayPosition, composeProductOnImage } from "@/core/product-compositor";
import { NextRequest, NextResponse } from "next/server";
import type { SceneData } from "@/types";
import type { OpenAIScriptProvider } from "@/core/providers/openai";

// PATCH /api/scenes/[id] — Обновить данные сцены
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = updateSceneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const scene = store.updateScene(id, parsed.data);
    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }
    return NextResponse.json(scene);
  } catch (error) {
    console.error("[PATCH /api/scenes/:id]", error);
    return NextResponse.json({ error: "Failed to update scene" }, { status: 500 });
  }
}

// POST /api/scenes/[id] — Перегенерация конкретного аспекта
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = regenerateSceneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const sceneWithProject = store.getScene(id);
    if (!sceneWithProject) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const { target } = parsed.data;
    const scriptProvider = getScriptProvider();
    const imageProvider = getImageProvider();
    const animationProvider = getAnimationProvider();
    const voiceProvider = getVoiceProvider();

    let updateData: Partial<SceneData> = {};

    switch (target) {
      case "script": {
        const allScenes = store.getScenesByProject(sceneWithProject.projectId);
        const sceneIndex = allScenes.findIndex(s => s.id === id) + 1;
        const totalScenes = allScenes.length;

        const newScript = await scriptProvider.regenerateSceneScript(
          {
            brief: sceneWithProject.brief || "",
            sceneScript: sceneWithProject.sceneScript || undefined,
            sceneIndex,
            totalScenes,
          },
          sceneWithProject.project.topic
        );
        updateData = { sceneScript: newScript };
        break;
      }

      case "imagePrompt": {
        // Legacy: regenerate only imagePrompt (still uses new pipeline for consistency)
        if (!sceneWithProject.sceneScript) {
          return NextResponse.json({ error: "No scene script" }, { status: 400 });
        }
        const proj = store.getProject(sceneWithProject.projectId);
        const productProfile = proj?.productProfile || null;
        const visualStyle = proj?.visualStyle || "";
        const locationDescription = extractLocationFromStyle(visualStyle);

        const physicsPlan = await planScenePhysics(
          sceneWithProject.sceneScript,
          productProfile,
          locationDescription
        ) || getFallbackPhysicsPlan(!!sceneWithProject.requiresProductImage);

        const sceneAction = await (scriptProvider as unknown as OpenAIScriptProvider).generateSceneAction(
          sceneWithProject.sceneScript,
          physicsPlan,
          productProfile
        );

        const imagePrompt = buildImagePrompt({
          visualStyle,
          locationDescription,
          productProfile,
          physicsPlan,
          sceneAction,
          requiresProductImage: !!sceneWithProject.requiresProductImage,
        });

        updateData = {
          imagePrompt,
          physicsPlan: JSON.stringify(physicsPlan),
        };
        break;
      }

      case "image": {
        // === NEW PIPELINE ===
        // Clear previous results
        updateData = {
          imageUrl: null,
          animationPrompt: null,
          videoUrl: null,
          animationJobId: null,
          animationStatus: null,
        };

        const projectData = store.getProject(sceneWithProject.projectId);
        if (!projectData) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const visualStyle = projectData.visualStyle || "";
        const locationDescription = extractLocationFromStyle(visualStyle);
        const productProfile = projectData.productProfile || null;

        // --- Step 1: Ensure product profile exists ---
        let resolvedProductProfile = productProfile;
        if (!resolvedProductProfile && projectData.referenceImageUrl && sceneWithProject.requiresProductImage) {
          console.log("[Pipeline] No productProfile found, analyzing product image...");
          resolvedProductProfile = await analyzeProductImage(projectData.referenceImageUrl);
          if (resolvedProductProfile) {
            store.updateProject(projectData.id, { productProfile: resolvedProductProfile });
            console.log("[Pipeline] productProfile saved to project");
          } else {
            resolvedProductProfile = getFallbackProductProfile();
            console.warn("[Pipeline] Using fallback productProfile");
          }
        }

        // --- Step 2: Get stable character reference ---
        const characterSeedUrl = await getOrCreateCharacterReference(
          projectData,
          (prompt) => imageProvider.generateImage(prompt)
        );

        // --- Step 3: Scene Physics Plan ---
        const sceneScript = sceneWithProject.sceneScript || "";
        let physicsPlan = await planScenePhysics(
          sceneScript,
          resolvedProductProfile,
          locationDescription
        );
        if (!physicsPlan) {
          physicsPlan = getFallbackPhysicsPlan(!!sceneWithProject.requiresProductImage);
          console.warn("[Pipeline] Using fallback physicsPlan");
        }
        console.log("[Pipeline] physicsPlan:", JSON.stringify(physicsPlan));

        // --- Step 3b: Scene Action Extractor (SceneScript is the law) ---
        const sceneActionExtract = await extractSceneAction(
          sceneScript,
          sceneWithProject.brief || "",
          resolvedProductProfile
        );
        if (sceneActionExtract) {
          console.log("[Pipeline] SceneExtract:", sceneActionExtract.literal_scene_check);
          console.log("[Pipeline] product_visibility:", sceneActionExtract.product_visibility);
          console.log("[Pipeline] hand_state:", sceneActionExtract.hand_state);
        } else {
          console.warn("[Pipeline] SceneActionExtractor failed, proceeding without it");
        }

        // --- Step 3c: Semantic action validation ---
        let semanticCorrectionNote = "";
        if (resolvedProductProfile?.semantic) {
          const semanticCheck = isActionValidForProduct(sceneScript, resolvedProductProfile.semantic);
          if (!semanticCheck.valid) {
            console.warn(`[Pipeline] Semantic mismatch: ${semanticCheck.reason}`);
            semanticCorrectionNote = [
              `SEMANTIC CORRECTION: ${semanticCheck.reason}`,
              `Valid actions: ${resolvedProductProfile.semantic.valid_actions.join(", ")}.`,
              `Required context: ${resolvedProductProfile.semantic.application_context}.`,
              `Do NOT use invalid action. Generate a valid alternative action instead.`,
            ].join(" ");
          }
        }

        // Enrich location with semantic location_must_include
        let enrichedLocation = locationDescription;
        if (resolvedProductProfile?.semantic?.location_must_include?.length) {
          enrichedLocation = [
            locationDescription,
            `Must include in scene: ${resolvedProductProfile.semantic.location_must_include.join(", ")}.`,
          ].join(" ");
        }

        // --- Step 4: Generate scene action (GPT — ONLY block F) ---
        let prompt: string;
        let sceneAction: string;

        if (body.feedback && sceneWithProject.imagePrompt) {
          // User feedback path — revise existing prompt
          prompt = await scriptProvider.reviseImagePrompt(sceneWithProject.imagePrompt, body.feedback);
          sceneAction = ""; // revision replaces the whole prompt
        } else {
          // Combine sceneScript with semantic correction note if needed
          const enrichedSceneScript = semanticCorrectionNote
            ? `${sceneScript}\n\n[SEMANTIC CORRECTION]: ${semanticCorrectionNote}`
            : sceneScript;

          if (sceneActionExtract) {
            sceneAction = "";
            console.log("[Pipeline] sceneAction skipped — extract is source of truth");
          } else {
            sceneAction = await (scriptProvider as unknown as OpenAIScriptProvider).generateSceneAction(
              enrichedSceneScript,
              physicsPlan,
              resolvedProductProfile
            );
            console.log("[Pipeline] sceneAction (fallback, no extract):", sceneAction);
          }

          // --- Step 5: Assemble prompt using SceneActionExtract as source of truth ---
          prompt = buildImagePrompt({
            visualStyle,
            locationDescription: enrichedLocation,
            productProfile: resolvedProductProfile,
            physicsPlan,
            sceneActionExtract,    // PRIMARY: literal scene contract
            sceneAction,           // FALLBACK: used only if extract is null
            requiresProductImage: !!sceneWithProject.requiresProductImage,
          });
        }

        // --- Step 6: Validate prompt (includes literal scene compliance) ---
        const validation = validatePrompt(prompt, {
          requiresProductImage: !!sceneWithProject.requiresProductImage,
          actionType: physicsPlan.product_interaction,
          hasGroundObject: hasGroundObjectInScript(sceneScript),
          sceneActionExtract,
        });
        console.log("[Pipeline] Validator result:", JSON.stringify(validation));

        if (!validation.valid) {
          console.warn("[Pipeline] Prompt validation failed. Repairing...", validation.missing);
          prompt = await repairPrompt(
            prompt,
            validation.missing,
            physicsPlan,
            resolvedProductProfile,
            visualStyle
          );
          // Re-validate after repair
          const revalidation = validatePrompt(prompt, {
            requiresProductImage: !!sceneWithProject.requiresProductImage,
            actionType: physicsPlan.product_interaction,
          });
          console.log("[Pipeline] Post-repair validator:", JSON.stringify(revalidation));
        }

        // --- Step 7: Log final state before sending to API ---
        console.log("[Pipeline] === FINAL PROMPT ===");
        console.log(prompt);
        console.log("[Pipeline] productProfile:", JSON.stringify(resolvedProductProfile));
        console.log("[Pipeline] characterRef:", characterSeedUrl ? "present" : "none");
        console.log("[Pipeline] productRef: NOT passed to Stage 1 (Stage 2 compositor handles product)");

        // --- Step 8: Stage 1 — Generate scene with EMPTY hand (no branded product) ---
        let imageUrl = await imageProvider.generateImage(prompt, undefined, characterSeedUrl);

        // DEBUG: save Stage 1 intermediate for magenta inspection
        if (process.env.NODE_ENV !== "production" && imageUrl.startsWith("data:")) {
          const _fs = require("fs");
          _fs.writeFileSync(
            require("path").join(process.cwd(), "debug_stage1_output.png"),
            Buffer.from(imageUrl.split(",")[1], "base64")
          );
          console.log("[Pipeline][DEBUG] Stage 1 image saved to debug_stage1_output.png");
        }

        // --- Step 9b: Stage 2 — Product Compositor (overlay original product PNG) ---
        const needsProductOverlay = (() => {
          if (sceneActionExtract) {
            return sceneActionExtract.product_visibility !== "none";
          }
          return !!sceneWithProject.requiresProductImage;
        })();

        let productCompositorApplied = false;
        if (needsProductOverlay) {
          if (!projectData.referenceImageUrl) {
            throw new Error(
              "[Stage 2 Compositor] FAILED: scene requires product overlay but project.referenceImageUrl is missing."
            );
          }
          console.log("[Pipeline] === STAGE 2: PRODUCT COMPOSITOR ===");
          const productHint = (() => {
            const geo = resolvedProductProfile?.geometry;
            if (geo) {
              const size = geo.aspect_ratio
                ? `${geo.aspect_ratio.height_class} ${geo.aspect_ratio.width_class} `
                : "";
              return `${size}${geo.product_family} (${geo.shape_class}) made of ${geo.material_type}`;
            }
            return resolvedProductProfile?.container_form || "product bottle";
          })();
          const position = await detectOverlayPosition(imageUrl, productHint);
          if (!position) {
            throw new Error(
              "[Stage 2 Compositor] FAILED: could not detect placeholder bottle. Stage 1 did not produce a usable placeholder."
            );
          }
          imageUrl = await composeProductOnImage(imageUrl, projectData.referenceImageUrl, position);
          productCompositorApplied = true;
          console.log("[Pipeline] Stage 2 compositor applied. productCompositorApplied=true");
        }

        if (needsProductOverlay && !productCompositorApplied) {
          throw new Error(
            "[Stage 2 Compositor] FAILED: scene requires product but compositor did not run."
          );
        }

        // --- Step 10: Generate animation prompt ---
        const animationPrompt = await scriptProvider.generateAnimationPrompt(sceneScript, prompt);

        // Extract Speech from animation prompt for voiceover
        let voiceoverScript: string | undefined;
        const speechMatch = animationPrompt.match(/Speech:\s*([\s\S]*?)(?=\n|Animation:|$)/i);
        if (speechMatch?.[1]) {
          voiceoverScript = speechMatch[1].trim().replace(/[\[\]"'«»]/g, "");
        }

        updateData = {
          ...updateData,
          imagePrompt: prompt,
          imageUrl,
          animationPrompt,
          physicsPlan: JSON.stringify(physicsPlan),
          promptLog: prompt,
          ...(voiceoverScript ? { voiceoverScript } : {}),
        };
        break;
      }

      case "animationPrompt": {
        if (!sceneWithProject.sceneScript || !sceneWithProject.imagePrompt) {
          return NextResponse.json({ error: "Missing data" }, { status: 400 });
        }
        const animationPrompt = await scriptProvider.generateAnimationPrompt(
          sceneWithProject.sceneScript,
          sceneWithProject.imagePrompt
        );

        let voiceoverScript: string | undefined;
        const speechMatch = animationPrompt.match(/Speech:\s*([\s\S]*?)(?=\n|Animation:|$)/i);
        if (speechMatch?.[1]) {
          voiceoverScript = speechMatch[1].trim().replace(/[\[\]"'«»]/g, "");
        }

        updateData = {
          animationPrompt,
          ...(voiceoverScript ? { voiceoverScript } : {}),
        };
        break;
      }

      case "animation": {
        if (!sceneWithProject.imageUrl || !sceneWithProject.animationPrompt) {
          return NextResponse.json({ error: "Missing data" }, { status: 400 });
        }

        updateData = {
          videoUrl: null,
          voicedVideoUrl: null,
          animationJobId: null,
          animationStatus: "PENDING",
          animationError: null,
        };

        const projectForAnim = store.getProject(sceneWithProject.projectId);
        const result = await animationProvider.generateAnimation(
          sceneWithProject.imageUrl,
          sceneWithProject.animationPrompt,
          { productReferenceUrl: projectForAnim?.referenceImageUrl || undefined }
        );

        if (result.jobId) {
          updateData = { ...updateData, animationJobId: result.jobId, animationStatus: "PENDING" };
        } else if (result.videoUrl) {
          updateData = { ...updateData, videoUrl: result.videoUrl, animationStatus: "COMPLETED" };
        }
        break;
      }

      case "voiceoverScript": {
        if (!sceneWithProject.sceneScript) {
          return NextResponse.json({ error: "No script" }, { status: 400 });
        }
        updateData = {
          voiceoverScript: await scriptProvider.generateVoiceoverScript(sceneWithProject.sceneScript),
        };
        break;
      }

      case "voice": {
        if (!sceneWithProject.voiceoverScript || !sceneWithProject.voiceProfile) {
          return NextResponse.json({ error: "Missing voice data" }, { status: 400 });
        }
        updateData = {
          voiceAudioUrl: await voiceProvider.synthesizeVoice(
            sceneWithProject.voiceoverScript,
            sceneWithProject.voiceProfile
          ),
        };
        break;
      }
    }

    const updated = store.updateScene(id, updateData);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[POST /api/scenes/:id] ERROR:", error.message || error);
    if (error.stack) console.error(error.stack);

    const fs = require("fs");
    const path = require("path");
    const logPath = path.join(process.cwd(), "error_debug.log");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ROUTE ERROR: ${error.message}\n${error.stack}\n`);

    return NextResponse.json({ error: "Failed to regenerate", details: error.message }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a location description from the visual style string.
 * Looks for common location patterns.
 */
function extractLocationFromStyle(visualStyle: string): string {
  // Try to extract location part (typically after character description)
  const locationMatch = visualStyle.match(
    /(?:in |at |near |by )?(backyard|suburban house|indoor|outdoor|kitchen|garden|street|yard|office|field|park|[A-Za-z\s]+ house)[^.;,]*/i
  );
  return locationMatch ? locationMatch[0].trim() : visualStyle;
}

/**
 * Check if the scene script mentions a ground object (septic tank, manhole, drain, etc.)
 */
function hasGroundObjectInScript(sceneScript: string): boolean {
  const lower = sceneScript.toLowerCase();
  return (
    lower.includes("септик") ||
    lower.includes("люк") ||
    lower.includes("яма") ||
    lower.includes("septic") ||
    lower.includes("manhole") ||
    lower.includes("buried") ||
    lower.includes("underground") ||
    lower.includes("drain")
  );
}
