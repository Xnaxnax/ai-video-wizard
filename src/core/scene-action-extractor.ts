/**
 * Scene Action Extractor
 * The source of truth for what EXACTLY must happen in a generated image.
 *
 * SceneScript is the law.
 * The image must literally match the scene description — no invented actions,
 * no added products that aren't required, no replaced gestures.
 *
 * GPT-4o extracts a literal action contract from the Russian scene script.
 * The Prompt Builder uses this contract as the primary scene instruction.
 */
import type { ProductProfile } from "@/types";

export type HandState =
  | "empty hands"
  | "holding product"
  | "pointing"
  | "gesturing"
  | "pouring"
  | "spraying"
  | "covering nose"
  | "spreading hands"
  | "thumbs up"
  | "other";

export type BodyPose =
  | "standing"
  | "crouching"
  | "sitting"
  | "leaning"
  | "bending over"
  | "pointing"
  | "other";

export type ProductVisibility =
  | "none"       // No product in this scene
  | "showcase"   // Product held toward camera
  | "application"// Product actively used (pouring, spraying, etc.)
  | "background" // Product visible but not the focus

export interface SceneActionExtract {
  primary_action: string;         // Literal English description of what the person is doing
  required_objects: string[];     // Objects that MUST appear in the image
  forbidden_objects: string[];    // Objects that must NOT appear in the image
  hand_state: HandState;          // What the hands are doing
  body_pose: BodyPose;            // Overall body position
  product_visibility: ProductVisibility;
  literal_scene_check: string;    // One sentence: what must be visible in this image
}

const SYSTEM_PROMPT = `You are a scene literal compliance analyzer for an AI image generation system.
Your job is to read a Russian scene description and extract EXACTLY what must be visible in the image.
You must be strict and literal — only extract what is explicitly described.
Do not invent actions. Do not add objects not mentioned.
Do not substitute one action for another.
Output ONLY valid JSON.`;

function buildExtractorPrompt(
  sceneScript: string,
  brief: string,
  productProfile: ProductProfile | null | undefined
): string {
  const productContext = productProfile
    ? `Product info: ${productProfile.product_type}, ${productProfile.container_form}. Category: ${productProfile.semantic.product_category}.`
    : "No product information.";

  return `Analyze this Russian scene description and extract the LITERAL scene contract.

Scene brief: "${brief}"
Scene script (in Russian): "${sceneScript}"

${productContext}

Rules for product_visibility:
- "none": no product appears in this scene at all
- "showcase": person is explicitly holding or showing the product toward camera
- "application": person is explicitly using the product (pouring into something, spraying, applying)
- "background": product is visible but not the main focus

Rules for forbidden_objects:
- If product_visibility is "none": forbidden_objects MUST include "product bottle", "container", "liquid pouring", "any product"
- If hand_state is "empty hands" or "gesturing" or "pointing": forbidden_objects MUST include "holding bottle", "product in hand"
- If the scene says "pointing at something": forbidden_objects MUST include "pouring", "liquid"
- If the scene says "smelling" or "nose reaction": forbidden_objects MUST include "product", "bottle", "liquid pouring"
- Never add an object to required_objects unless it is explicitly mentioned in sceneScript

Rules for hand_state:
- If the person is reacting (smell, surprise, disgust): hand_state = "covering nose" or "gesturing" or "spreading hands"
- If the person is showing something with a gesture: hand_state = "pointing" or "gesturing"
- If the person explicitly holds the product: hand_state = "holding product"
- If the person is pouring: hand_state = "pouring"
- Default for talking to camera: hand_state = "gesturing"

Return JSON with exactly these fields:
{
  "primary_action": "literal English translation of what the person is doing in this scene (1 sentence, present tense)",
  "required_objects": ["list only objects explicitly mentioned in sceneScript"],
  "forbidden_objects": ["list objects that would contradict this scene or are not mentioned"],
  "hand_state": one of: "empty hands" | "holding product" | "pointing" | "gesturing" | "pouring" | "spraying" | "covering nose" | "spreading hands" | "thumbs up" | "other",
  "body_pose": one of: "standing" | "crouching" | "sitting" | "leaning" | "bending over" | "pointing" | "other",
  "product_visibility": one of: "none" | "showcase" | "application" | "background",
  "literal_scene_check": "The image must show: [one literal sentence describing exactly what must be visible]"
}`;
}

export async function extractSceneAction(
  sceneScript: string,
  brief: string,
  productProfile: ProductProfile | null | undefined
): Promise<SceneActionExtract | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

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
          { role: "user", content: buildExtractorPrompt(sceneScript, brief, productProfile) },
        ],
        temperature: 0.1, // Maximum determinism — this must be literal
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("[SceneExtractor] API error:", err?.error?.message);
      return null;
    }

    const data = await response.json();
    const raw = data.choices[0]?.message?.content;
    if (!raw) return null;

    const extract = JSON.parse(raw) as SceneActionExtract;
    console.log("[SceneExtractor] primary_action:", extract.primary_action);
    console.log("[SceneExtractor] product_visibility:", extract.product_visibility);
    console.log("[SceneExtractor] hand_state:", extract.hand_state);
    console.log("[SceneExtractor] forbidden:", extract.forbidden_objects.slice(0, 3).join(", "));
    console.log("[SceneExtractor] literal_check:", extract.literal_scene_check);
    return extract;
  } catch (e: any) {
    console.error("[SceneExtractor] Failed:", e.message);
    return null;
  }
}

/**
 * Builds the forbidden objects constraint block for the prompt.
 * Strong negative constraints derived from the literal scene.
 */
export function buildForbiddenBlock(extract: SceneActionExtract): string {
  const forbiddenList = extract.forbidden_objects
    .map(obj => `No ${obj} in this image.`)
    .join(" ");

  const handConstraint = (() => {
    switch (extract.hand_state) {
      case "empty hands":
        return "Hands must be empty — no bottle, no container, no product, no liquid, no cup.";
      case "pointing":
        return "One hand points at the target. No bottle in hand. No pouring.";
      case "gesturing":
      case "spreading hands":
        return "Hands are gesturing naturally. No bottle in hand. No product held.";
      case "covering nose":
        return "One or both hands near face/nose. No bottle. No product.";
      case "thumbs up":
        return "One hand shows thumbs up. No bottle. No product unless specified.";
      default:
        return "";
    }
  })();

  return [
    "FORBIDDEN IN THIS IMAGE:",
    forbiddenList,
    handConstraint,
    "Do not add any object not listed in required objects.",
    "Do not invent actions not present in the scene description.",
  ].filter(Boolean).join(" ");
}
