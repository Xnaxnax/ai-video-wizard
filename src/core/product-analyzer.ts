/**
 * Product Analyzer — Physical + Semantic + Geometry
 * Three-layer analysis in a single GPT-4o Vision call:
 * 1. Physical Profile: form, material, size, grip, opening
 * 2. Geometry Profile: shape class, structural features, rigidity, forbidden transformations
 * 3. Semantic Profile: purpose, application target, valid/invalid scenes
 *
 * The geometry layer prevents product mutations (bottle→canister, spray→bottle, packet→box).
 * The semantic layer prevents context errors (septic bacteria used in kitchen).
 */
import type { ProductProfile, SemanticProfile, GeometryProfile } from "@/types";

const SYSTEM_PROMPT = `You are a product analyst for an AI video production system.
You analyze product images and return a two-layer JSON profile:
1. Physical layer: what the product physically looks like
2. Semantic layer: what the product IS, what problem it solves, where and how it's used

The semantic layer is critical. It determines which scenes are valid for this product.
A septic bacteria product must be used near a septic tank — not in a kitchen.
Anti-grease must be used on kitchen surfaces — not near a septic tank.
Jeans must be worn — not poured.

Output ONLY valid JSON. Be specific and accurate.`;

const USER_PROMPT = `Analyze this product image and return a JSON object with THREE layers: physical, semantic, and geometry.

{
  "product_type": one of: "liquid bottle" | "spray bottle" | "powder packet" | "clothing" | "shoes" | "cosmetic jar" | "food item" | "other",
  "container_form": "precise physical shape description in one sentence",
  "size_class": one of: "small handheld" | "medium handheld" | "large container" | "wearable item" | "other",
  "material": one of: "plastic" | "fabric" | "paper" | "glass" | "metal" | "other",
  "cap_or_opening": one of: "screw cap" | "trigger nozzle" | "torn packet opening" | "zipper" | "button" | "no opening" | "other",
  "default_orientation": one of: "upright" | "hanging" | "folded" | "worn" | "other",
  "usage_actions": array of actions the product is used for,
  "grip_logic": "how a human hand holds this product realistically",
  "opening_logic": "exactly where product contents exit from",
  "scale_logic": "how large this appears relative to adult human hand",
  "wrong_transformations": ["mutations specific to THIS product that must be prevented"],

  "geometry": {
    "product_family": one of: "bottle" | "spray bottle" | "pouch" | "packet" | "jar" | "clothing" | "shoes" | "tube" | "box" | "other",
    "shape_class": one of: "slim" | "wide" | "flat" | "cylindrical" | "rectangular" | "flexible" | "wearable",
    "aspect_ratio": {
      "height_class": one of: "short" | "medium" | "tall",
      "width_class": one of: "narrow" | "medium" | "wide"
    },
    "structural_features": {
      "has_handle": true or false (visible handle for carrying),
      "has_trigger": true or false (trigger/pump mechanism),
      "has_cap": true or false (removable cap or lid),
      "has_spout": true or false (spout or nozzle for pouring),
      "has_zipper": true or false,
      "has_sleeves": true or false (only for clothing),
      "has_legs": true or false (only for pants/jeans)
    },
    "material_type": one of: "plastic" | "paper" | "fabric" | "glass" | "metal" | "mixed",
    "rigidity": one of: "rigid" | "semi-rigid" | "flexible",
    "scale_class": one of: "handheld_small" | "handheld_medium" | "wearable_body" | "table_object" | "floor_object",
    "deformation_rules": {
      "can_bend": true or false,
      "can_fold": true or false,
      "can_expand": false
    },
    "forbidden_transformations": [
      "derive these from structural_features — e.g. if has_handle=false: 'do not add handle', if product_family=bottle: 'do not transform into canister or jug', etc."
    ]
  },

  "semantic": {
    "product_category": "specific product category",
    "product_purpose": "what this product does",
    "problem_solved": ["list of problems solved"],
    "application_target": "where/what product is applied to",
    "application_context": "environment where product is used",
    "scene_requirements": ["what MUST appear in every scene with this product"],
    "valid_actions": ["valid scene actions for this product"],
    "invalid_actions": ["actions that make NO SENSE for this product"],
    "location_must_include": ["location elements that must appear in scenes"]
  }
}

Critical geometry rules:
- has_handle: true ONLY if there is a visible carrying handle (not just a grip area)
- has_trigger: true ONLY for spray pumps and trigger sprayers
- product_family must match EXACTLY what is in the image (bottle vs spray bottle vs packet)
- forbidden_transformations MUST include product family cross-contamination prevention
- If shape_class = slim: add "do not widen the product"
- If shape_class = wide: add "do not make the product slim"
- If rigidity = rigid: add "do not deform or bend the product"
- If has_handle = false: add "do not add a carrying handle"
- If has_trigger = false: add "do not add a spray trigger"

Critical semantic rules:
- For septic/drain products: scenes MUST include the actual drain/septic system
- For kitchen products: scenes MUST include kitchen context
- For clothing: valid_actions must be wear/try-on, NOT pour/spray
- invalid_actions must be specific to THIS product`;

export async function analyzeProductImage(imageUrl: string): Promise<ProductProfile | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ProductAnalyzer] OPENAI_API_KEY not set");
    return null;
  }

  const imageContent = {
    type: "image_url" as const,
    image_url: { url: imageUrl, detail: "high" as const },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT },
              imageContent,
            ],
          },
        ],
        max_tokens: 900,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("[ProductAnalyzer] API error:", err?.error?.message);
      return null;
    }

    const data = await response.json();
    const raw = data.choices[0]?.message?.content;
    if (!raw) return null;

    const profile = JSON.parse(raw) as ProductProfile;

    // Ensure all three layers exist
    if (!profile.semantic) {
      console.warn("[ProductAnalyzer] Missing semantic layer, using fallback");
      profile.semantic = getFallbackSemanticProfile();
    }
    if (!profile.geometry) {
      console.warn("[ProductAnalyzer] Missing geometry layer, using fallback");
      profile.geometry = getFallbackGeometryProfile(profile.product_type);
    }

    console.log("[ProductAnalyzer] Physical:", profile.product_type, "|", profile.container_form);
    console.log("[ProductAnalyzer] Geometry:",
      `family=${profile.geometry.product_family}`,
      `shape=${profile.geometry.shape_class}`,
      `handle=${profile.geometry.structural_features.has_handle}`,
      `trigger=${profile.geometry.structural_features.has_trigger}`,
      `rigidity=${profile.geometry.rigidity}`
    );
    console.log("[ProductAnalyzer] Semantic:", profile.semantic.product_category, "→", profile.semantic.application_target);
    console.log("[ProductAnalyzer] Geo forbidden:", profile.geometry.forbidden_transformations.slice(0,3).join("; "));

    return profile;
  } catch (e: any) {
    console.error("[ProductAnalyzer] Failed:", e.message);
    return null;
  }
}

/**
 * Validates whether a scene action is semantically valid for the given product.
 * Called before scene generation to reject invalid scenes.
 */
export function isActionValidForProduct(
  sceneScript: string,
  semantic: SemanticProfile
): { valid: boolean; reason: string } {
  const scriptLower = sceneScript.toLowerCase();

  // Check against invalid actions
  for (const invalidAction of (semantic.invalid_actions ?? [])) {
    const keywords = invalidAction.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
    const matchCount = keywords.filter(k => scriptLower.includes(k)).length;
    if (matchCount >= 2) {
      return {
        valid: false,
        reason: `Scene contains invalid action for ${semantic.product_category}: "${invalidAction}"`,
      };
    }
  }

  return { valid: true, reason: "" };
}

/**
 * Builds a semantic context string to inject into generateScenes prompt.
 * Tells the script generator exactly what kinds of scenes are required.
 */
export function buildSemanticSceneContext(semantic: SemanticProfile): string {
  return `
PRODUCT SEMANTIC CONTEXT (mandatory — all scenes must respect this):
Product category: ${semantic.product_category}
Purpose: ${semantic.product_purpose}
Problems solved: ${(semantic.problem_solved ?? []).join(", ")}
Application target: ${semantic.application_target}
Location/context: ${semantic.application_context}

REQUIRED in scenes: ${(semantic.scene_requirements ?? []).join("; ")}
VALID scene actions: ${(semantic.valid_actions ?? []).join("; ")}
FORBIDDEN scene actions (never use): ${(semantic.invalid_actions ?? []).join("; ")}
Location must include: ${(semantic.location_must_include ?? []).join(", ")}

Every scene MUST make contextual sense for a ${semantic.product_category} product.
Generic liquid scenes (holding bottle, pouring into hand, smelling random air) are FORBIDDEN.
`.trim();
}

/**
 * Fallback physical profile when image analysis fails.
 */
export function getFallbackProductProfile(): ProductProfile {
  return {
    product_type: "other",
    container_form: "handheld product",
    size_class: "small handheld",
    material: "other",
    cap_or_opening: "other",
    default_orientation: "upright",
    usage_actions: ["showcase", "hold"],
    grip_logic: "held naturally in one hand",
    opening_logic: "product contents exit from the opening or top",
    scale_logic: "fits comfortably in one adult hand",
    wrong_transformations: [
      "do not change product category",
      "do not change basic shape",
      "do not enlarge product beyond realistic hand scale",
      "do not alter label or main design",
    ],
    semantic: getFallbackSemanticProfile(),
    geometry: getFallbackGeometryProfile("other"),
  };
}

function getFallbackSemanticProfile(): SemanticProfile {
  return {
    product_category: "household product",
    product_purpose: "general use",
    problem_solved: ["household problem"],
    application_target: "intended surface or system",
    application_context: "home environment",
    scene_requirements: ["product must be shown in relevant context"],
    valid_actions: ["showcase", "hold", "show product"],
    invalid_actions: ["drink", "eat", "use on wrong surface"],
    location_must_include: [],
  };
}

/**
 * Fallback geometry when image analysis fails or geometry layer is missing.
 * Built from product_type to give at least basic structural protection.
 */
export function getFallbackGeometryProfile(productType: string): GeometryProfile {
  const isClothing = productType === "clothing" || productType === "shoes";
  const isSpray = productType === "spray bottle";
  const isPacket = productType === "powder packet";

  return {
    product_family: isClothing ? "clothing" : isSpray ? "spray bottle" : isPacket ? "packet" : "bottle",
    shape_class: isClothing ? "wearable" : isPacket ? "flexible" : "slim",
    aspect_ratio: {
      height_class: isClothing ? "medium" : "tall",
      width_class: isClothing ? "medium" : "narrow",
    },
    structural_features: {
      has_handle: false,
      has_trigger: isSpray,
      has_cap: !isClothing && !isPacket,
      has_spout: !isClothing,
      has_zipper: false,
      has_sleeves: productType === "clothing",
      has_legs: false,
    },
    material_type: isClothing ? "fabric" : isPacket ? "paper" : "plastic",
    rigidity: isClothing || isPacket ? "flexible" : "rigid",
    scale_class: isClothing ? "wearable_body" : "handheld_medium",
    deformation_rules: {
      can_bend: isClothing || isPacket,
      can_fold: isClothing || isPacket,
      can_expand: false,
    },
    forbidden_transformations: [
      "do not transform into a different product family",
      "do not add a carrying handle",
      ...(isSpray ? [] : ["do not add a spray trigger"]),
      ...(isClothing ? ["do not transform clothing into another garment type"] : []),
      ...(isPacket ? ["do not transform packet into a bottle or box"] : []),
    ],
  };
}
