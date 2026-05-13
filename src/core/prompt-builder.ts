/**
 * Prompt Builder
 * Assembles the final image prompt in a fixed, code-controlled order.
 *
 * New order (SceneScript is the law):
 * A. Base instruction
 * B. Character lock
 * C. Location lock
 * D. Scene literal action (from SceneActionExtract — primary source of truth)
 * E. Required objects
 * F. Product lock — ONLY if product_visibility is "showcase" or "application"
 * G. Physics lock
 * H. Forbidden objects (from SceneActionExtract + product wrong_transformations)
 * I. Camera
 * J. Hard negative constraints
 *
 * GPT generates ONLY the primary_action context (via generateSceneAction or SceneActionExtract).
 * All locks, forbidden objects, and constraints are added by code.
 */
import type { ProductProfile, PhysicsPlan } from "@/types";
import type { SceneActionExtract } from "@/core/scene-action-extractor";
import { buildForbiddenBlock } from "@/core/scene-action-extractor";

export interface PromptBuildInput {
  visualStyle: string;
  locationDescription?: string;
  productProfile?: ProductProfile | null;
  physicsPlan?: PhysicsPlan | null;
  sceneActionExtract?: SceneActionExtract | null; // Preferred: literal scene contract
  sceneAction?: string;                           // Fallback: plain text action
  requiresProductImage: boolean;
}

/**
 * Builds the final image prompt in fixed A→J order.
 * Uses SceneActionExtract as source of truth when available.
 */
export function buildImagePrompt(input: PromptBuildInput): string {
  const {
    visualStyle,
    locationDescription,
    productProfile,
    physicsPlan,
    sceneActionExtract,
    sceneAction,
    requiresProductImage,
  } = input;

  const blocks: string[] = [];

  // === A. Base instruction ===
  blocks.push("Create an ultra-realistic vertical 9:16 UGC-style photo.");

  // === B. Character lock ===
  blocks.push(buildCharacterLock(visualStyle));

  // === C. Location lock ===
  blocks.push(buildLocationLock(locationDescription, physicsPlan, sceneActionExtract));

  // === D. Scene literal action (source of truth from SceneActionExtract) ===
  if (sceneActionExtract) {
    blocks.push(buildLiteralActionBlock(sceneActionExtract));
  } else if (sceneAction && sceneAction.trim()) {
    blocks.push(`Scene action: ${sceneAction.trim()}`);
  }

  // === E. Required objects ===
  if (sceneActionExtract?.required_objects?.length) {
    const objects = sceneActionExtract.required_objects
      .filter(o => o.toLowerCase() !== "man" && o.toLowerCase() !== "person")
      .join(", ");
    if (objects) {
      blocks.push(`Required in frame: ${objects}.`);
    }
  }

  // === F. Placeholder product (Stage 2 compositor will REPLACE it with original PNG) ===
  const productVisible = sceneActionExtract
    ? sceneActionExtract.product_visibility !== "none"
    : requiresProductImage;

  if (productVisible) {
    blocks.push(buildPlaceholderProductBlock(
      physicsPlan,
      sceneActionExtract,
    ));
  }

  // === G. Physics lock ===
  if (physicsPlan) {
    blocks.push(buildPhysicsLock(physicsPlan, productVisible));
  }

  // === H. Forbidden objects (from SceneActionExtract) ===
  if (sceneActionExtract) {
    blocks.push(buildForbiddenBlock(sceneActionExtract));
  }

  // === I. Camera ===
  blocks.push(buildCameraBlock());

  // === J. Hard negative constraints ===
  blocks.push(buildNegativeConstraints(productProfile, productVisible));

  return blocks.join(" ");
}

// ─── Block builders ──────────────────────────────────────────────────────────

function buildCharacterLock(visualStyle: string): string {
  return [
    "CHARACTER (must match reference image exactly):",
    `Use the exact same person from the character reference image.`,
    `${visualStyle}.`,
    "Same face identity, same age, same hairstyle, same body type, same clothes.",
    "Do not change face, ethnicity, age, body type, hairstyle, or clothes.",
  ].join(" ");
}

function buildLocationLock(
  locationDescription?: string,
  physicsPlan?: PhysicsPlan | null,
  extract?: SceneActionExtract | null
): string {
  const base = locationDescription
    ? `LOCATION: Use the same location: ${locationDescription}.`
    : "LOCATION: Use the same location as described in the visual style.";

  const groundRule = physicsPlan?.ground_contact
    ? `${physicsPlan.ground_contact}.`
    : "Person stands with both feet fully visible on the ground, above ground, not buried.";

  const objectRule = physicsPlan?.object_position
    ? `${physicsPlan.object_position}.`
    : "";

  // Inject location_must_include from semantic profile (passed via enrichedLocation)
  return [base, groundRule, objectRule].filter(Boolean).join(" ");
}

function buildLiteralActionBlock(extract: SceneActionExtract): string {
  const parts = [
    `SCENE (literal \u2014 follow exactly):`,
    extract.literal_scene_check,
    `Primary action: ${extract.primary_action}.`,
    `Body pose: ${extract.body_pose}.`,
    `Hand state: ${extract.hand_state}.`,
  ];

  return parts.filter(Boolean).join(" ");
}

/**
 * Builds the Stage 1 instruction for a GENERIC PLACEHOLDER BOTTLE.
 *
 * Stage 1 renders an unbranded placeholder positioned and oriented naturally
 * for the action. Stage 2 (product-compositor) will REPLACE the placeholder
 * with the original product PNG using the placeholder's bbox + rotation.
 *
 * Universal — works for any interaction type (showcase, pouring, holding,
 * pointing, sitting with bottle, walking, two-hand-hold, side-hold, etc.).
 * The model derives the natural pose from the action description.
 */
function buildPlaceholderProductBlock(
  physicsPlan?: PhysicsPlan | null,
  sceneActionExtract?: SceneActionExtract | null,
): string {
  const action = sceneActionExtract?.primary_action ?? "interacting with the bottle";
  const handState = sceneActionExtract?.hand_state ?? "holding product";
  const bodyPose = sceneActionExtract?.body_pose ?? "standing";
  const orientation = physicsPlan?.product_orientation ?? "naturally oriented in the grip";
  const interaction = physicsPlan?.product_interaction ?? "";

  const interactionHint = interaction
    ? `Interaction type: ${interaction}. The bottle pose must match this interaction.`
    : "";

  return [
    "PLACEHOLDER PRODUCT (Stage 2 compositor REPLACES this with the original product PNG):",
    `Render a placeholder bottle in the scene, positioned and oriented for the action: ${action}.`,
    `Body pose: ${bodyPose}. Hand state: ${handState}. Bottle orientation: ${orientation}.`,
    interactionHint,
    "The placeholder bottle MUST be:",
    "- A simple cylindrical bottle with a cap.",
    "- COLORED IN BRIGHT PURE MAGENTA (RGB 255,0,255 — vivid hot pink/fuchsia). The ENTIRE bottle including the cap must be uniformly bright magenta. This unusual color is REQUIRED so the compositor can detect and replace it.",
    "- Realistic proportions for a small handheld bottle (approximately 250 ml — tall slim form, height ~2.5x width).",
    "- ABSOLUTELY NO text, NO labels, NO logos, NO brand names, NO writing of any kind on the bottle.",
    "- A single solid uniform magenta surface — no decals, no stickers, no patterns, no gradients, no shading variations on the bottle's color.",
    "Hand grip: realistic fingers wrapping naturally around the bottle, contact points visible, no floating.",
    "Bottle scale: clearly proportional to the human hand and the frame — clearly resolvable, not tiny.",
    "Bottle position: naturally placed for the action so the composition reads correctly.",
    "Lighting on the bottle must match the scene lighting (same direction and intensity), but the bottle's BASE color must remain bright magenta everywhere — no white highlights desaturating it to pink, no shadows turning it black; keep the magenta saturation strong throughout.",
    "Important: ONLY the bottle is magenta. Do NOT paint anything else in the scene magenta. The character, clothes, background, and all other objects must keep their natural colors.",
  ].filter(Boolean).join(" ");
}

function buildPhysicsLock(physicsPlan: PhysicsPlan, productVisible: boolean): string {
  // productVisible no longer implies product-orientation instruction —
  // Stage 1 does not render the product. Stage 2 compositor overlays it.
  void productVisible;

  const parts: string[] = ["PHYSICS:"];

  if ((physicsPlan.action_physics ?? []).length > 0) {
    parts.push((physicsPlan.action_physics ?? []).join(" "));
  }

  if (physicsPlan.human_pose) {
    parts.push(`Human pose: ${physicsPlan.human_pose}.`);
  }

  return parts.join(" ");
}

function buildCameraBlock(): string {
  return [
    "CAMERA: Smartphone UGC realism.",
    "Natural daylight.",
    "Realistic human anatomy.",
    "Realistic hands with correct number of fingers.",
    "Vertical 9:16 composition.",
    "Sharp focus on subject.",
  ].join(" ");
}

function buildNegativeConstraints(
  productProfile: ProductProfile | null | undefined,
  productVisible: boolean
): string {
  void productProfile;

  const constraints = [
    "STRICT RULES \u2014 do not violate:",
    "No extra people in frame.",
    "No extra or missing limbs.",
    "No different person, face, age, or ethnicity than the character reference.",
    "No different clothes or hairstyle.",
    "No changed location or background.",
    "No floating objects.",
    "No impossible human body placement.",
    "No person buried in ground or merged with ground.",
    "No unrealistic gravity or spatial arrangements.",
    "Do not add objects not listed in required objects.",
    "Do not invent actions not present in the scene description.",
  ];

  if (productVisible) {
    constraints.push(
      "The bottle in this image is a GENERIC PLACEHOLDER \u2014 render it WITHOUT any text, labels, logos, brand names, decals, stickers, patterns, or readable writing of any kind.",
      "The placeholder bottle must be a solid uniform-color surface (off-white or light grey).",
      "Do NOT recreate, imagine, or invent any branded product label or text.",
    );
  } else {
    constraints.push(
      "No bottles, containers, products, or product-like objects in hands.",
      "No liquid pouring, spraying, or applying.",
    );
  }

  return constraints.join(" ");
}
