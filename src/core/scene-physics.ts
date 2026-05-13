/**
 * Scene Physics Planner
 * Uses GPT-4o to analyze a scene and produce a PhysicsPlan JSON.
 * Universal: works for any product category and action type.
 * Temperature 0.2 — highly deterministic.
 */
import type { PhysicsPlan, ProductProfile } from "@/types";

const SYSTEM_PROMPT = `You are a physics and spatial logic planner for AI-generated images.
Your job is to determine the exact physical state of a scene: human pose, object placement, 
product interaction, and what is physically impossible in this scene.
Output ONLY valid JSON with no markdown, no explanation.`;

function buildPhysicsPlannerPrompt(
  sceneScript: string,
  productProfile: ProductProfile | null | undefined,
  locationDescription: string
): string {
  const productSection = productProfile
    ? `Product in this scene:
- Type: ${productProfile.product_type}
- Form: ${productProfile.container_form}
- Size: ${productProfile.size_class}
- Cap/Opening: ${productProfile.cap_or_opening}
- Grip: ${productProfile.grip_logic}
- Opening logic: ${productProfile.opening_logic}
- Scale: ${productProfile.scale_logic}`
    : "No product in this scene.";

  return `Analyze this scene and return a PhysicsPlan JSON.

Scene description: "${sceneScript}"

Location: ${locationDescription || "outdoor setting"}

${productSection}

Return JSON with exactly these fields:
{
  "human_pose": "exact pose description (e.g. standing upright, crouching beside object, holding product at chest height)",
  "ground_contact": "how human feet/body contact ground (e.g. 'both feet flat on grass, fully above ground')",
  "object_position": "where the main environmental object is (e.g. 'septic lid is flush with ground surface, only flat circular cover visible')",
  "product_interaction": one of: "showcase" | "pour" | "spray" | "wear" | "hold" | "open" | "powder_pour" | "none",
  "product_orientation": "exact orientation of product during this action (e.g. 'bottle tilted 45 degrees downward, opening pointing into hole')",
  "action_physics": array of 2-5 precise physical statements about how the action works (e.g. "liquid exits only from open top spout", "cap must be removed before liquid can flow"),
  "impossible_states": array of 3-6 physical impossibilities to prevent (e.g. "person buried in ground", "liquid pouring from closed cap", "product larger than human torso")
}

Rules:
- If product_interaction is "pour": liquid MUST exit from the correct opening, cap MUST be removed
- If product_interaction is "spray": spray MUST exit from nozzle only, finger MUST be on trigger
- If product_interaction is "powder_pour": packet MUST be torn, powder exits from tear
- If product_interaction is "wear": clothing MUST conform to body, must NOT become another object
- If product_interaction is "none": omit product_orientation, set action_physics to general human movement only
- impossible_states must include product-specific mutations from the product's wrong_transformations${
  productProfile ? `\n  Known wrong transformations: ${(productProfile.wrong_transformations ?? []).join("; ")}` : ""
}`;
}

export async function planScenePhysics(
  sceneScript: string,
  productProfile: ProductProfile | null | undefined,
  locationDescription: string
): Promise<PhysicsPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ScenePhysics] OPENAI_API_KEY not set");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPhysicsPlannerPrompt(sceneScript, productProfile, locationDescription) },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("[ScenePhysics] API error:", err?.error?.message);
      return null;
    }

    const data = await response.json();
    const raw = data.choices[0]?.message?.content;
    if (!raw) return null;

    const plan = JSON.parse(raw) as PhysicsPlan;
    console.log("[ScenePhysics] Physics plan:", JSON.stringify(plan));
    return plan;
  } catch (e: any) {
    console.error("[ScenePhysics] Failed:", e.message);
    return null;
  }
}

/**
 * Fallback physics plan when API fails.
 */
export function getFallbackPhysicsPlan(requiresProduct: boolean): PhysicsPlan {
  return {
    human_pose: "standing upright",
    ground_contact: "both feet flat on ground, person fully above ground",
    object_position: "on or flush with ground surface",
    product_interaction: requiresProduct ? "showcase" : "none",
    product_orientation: requiresProduct ? "upright, facing camera" : "",
    action_physics: requiresProduct
      ? ["product held naturally in hand", "label facing camera", "product at realistic scale"]
      : ["person stands naturally", "arms at sides"],
    impossible_states: [
      "person buried in ground",
      "floating objects",
      "product oversized",
      "wrong product category",
      "extra limbs",
      "extra people",
    ],
  };
}
