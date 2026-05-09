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

  // === F. Product lock — ONLY if product_visibility demands it ===
  const productVisible = sceneActionExtract
    ? (sceneActionExtract.product_visibility === "showcase" || sceneActionExtract.product_visibility === "application")
    : requiresProductImage;

  if (productVisible && productProfile) {
    blocks.push(buildProductLock(
      productProfile,
      physicsPlan,
      sceneActionExtract?.product_visibility
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

function buildProductLock(
  productProfile: ProductProfile,
  physicsPlan?: PhysicsPlan | null,
  productVisibility?: string | null
): string {
  const actionMode =
    productVisibility === "application"
      ? (physicsPlan?.product_interaction || "pour")
      : "showcase";

  const geo = productProfile.geometry;

  // === Build dynamic shape description from geometry (NO hardcode) ===
  const shapeDesc = buildGeometryDescription(productProfile);

  const baseRules = [
    `PRODUCT (must match reference image exactly):`,
    `Use the exact same product from the product reference image.`,
    `This product is: ${shapeDesc}`,
    `Keep exact same product family (${geo?.product_family || productProfile.product_type}).`,
    `Keep same shape class (${geo?.shape_class || "as seen in reference"}).`,
    `Keep same material (${productProfile.material}).`,
    `Keep same label area and main design.`,
    `${productProfile.scale_logic}.`,
  ];

  // Structural feature constraints from geometry
  if (geo) {
    if (!geo.structural_features.has_handle) {
      baseRules.push("No carrying handle — this product has no handle.");
    }
    if (!geo.structural_features.has_trigger) {
      baseRules.push("No spray trigger — this product has no trigger mechanism.");
    }
    if (geo.rigidity === "rigid") {
      baseRules.push("Product shape is rigid — do not bend, deform, or distort it.");
    }
    if (geo.rigidity === "flexible") {
      baseRules.push("Product is flexible — natural folds only, do not make it rigid.");
    }
    if (geo.structural_features.has_trigger) {
      baseRules.push("Preserve the spray trigger mechanism.");
    }
  }

  const actionRules = buildProductActionRules(actionMode, productProfile);

  // Geometry-derived forbidden transformations
  const geoForbidden = (geo?.forbidden_transformations ?? [])
    .map(r => r.charAt(0).toUpperCase() + r.slice(1) + ".")
    .join(" ");

  // Physical wrong_transformations from product profile
  const physForbidden = (productProfile.wrong_transformations ?? [])
    .map(r => r.charAt(0).toUpperCase() + r.slice(1) + ".")
    .join(" ");

  return [...baseRules, actionRules, geoForbidden, physForbidden].filter(Boolean).join(" ");
}

/**
 * Builds a human-readable product shape description from geometry profile.
 * No hardcode — everything comes from the analyzed geometry.
 */
function buildGeometryDescription(productProfile: ProductProfile): string {
  const geo = productProfile.geometry;
  if (!geo) return productProfile.container_form;

  const parts: string[] = [];

  // Size from aspect ratio
  if (geo.aspect_ratio) {
    const h = geo.aspect_ratio.height_class; // short | medium | tall
    const w = geo.aspect_ratio.width_class;  // narrow | medium | wide
    parts.push(`${h} ${w} ${geo.product_family}`);
  } else {
    parts.push(geo.product_family);
  }

  // Shape class modifier
  if (geo.shape_class !== "other") {
    parts.push(`(${geo.shape_class} shape)`);
  }

  // Material
  parts.push(`made of ${geo.material_type}`);

  // Key structural features
  const features: string[] = [];
  if (geo.structural_features.has_trigger) features.push("with trigger sprayer");
  if (geo.structural_features.has_spout) features.push("with spout/opening");
  if (geo.structural_features.has_cap) features.push("with cap");
  if (geo.structural_features.has_zipper) features.push("with zipper");
  if (geo.structural_features.has_sleeves) features.push("with sleeves");
  if (geo.structural_features.has_legs) features.push("with legs/pants");
  if (features.length) parts.push(features.join(", "));

  return parts.join(" ");
}


function buildProductActionRules(
  actionMode: string,
  productProfile: ProductProfile
): string {
  switch (actionMode) {
    case "showcase":
      return [
        `Product is held upright or naturally toward camera.`,
        `${productProfile.grip_logic}.`,
        "Label area clearly visible.",
      ].join(" ");

    case "pour":
      return [
        `Product is tilted naturally for pouring.`,
        `${productProfile.opening_logic}.`,
        `${productProfile.grip_logic}.`,
        "Cap is removed or opening is active.",
        "Liquid or powder exits ONLY from the correct opening, not from the cap, side, or corner.",
        "Product scale stays proportional and realistic.",
        "Label may be partially visible but not redesigned.",
      ].join(" ");

    case "spray":
      return [
        `Product nozzle points toward the intended target.`,
        "Finger is on trigger.",
        `${productProfile.opening_logic}.`,
        `${productProfile.grip_logic}.`,
        "Spray exits ONLY from the nozzle.",
        "Bottle remains realistic handheld size.",
      ].join(" ");

    case "powder_pour":
      return [
        `Packet or container is open or torn.`,
        `${productProfile.opening_logic}.`,
        "Powder exits ONLY from the opening.",
        "Do not transform packet into a bottle or box.",
      ].join(" ");

    case "wear":
      return [
        "Clothing or wearable item is worn on the human body.",
        "Garment conforms to body shape naturally.",
        "Do not transform clothing into another garment type.",
      ].join(" ");

    default:
      return [
        `Product is held naturally in hand.`,
        `${productProfile.grip_logic}.`,
        "Product scale is realistic relative to human hand.",
      ].join(" ");
  }
}

function buildPhysicsLock(physicsPlan: PhysicsPlan, productVisible: boolean): string {
  const parts: string[] = ["PHYSICS:"];

  if ((physicsPlan.action_physics ?? []).length > 0) {
    parts.push((physicsPlan.action_physics ?? []).join(" "));
  }

  if (physicsPlan.human_pose) {
    parts.push(`Human pose: ${physicsPlan.human_pose}.`);
  }

  if (productVisible && physicsPlan.product_orientation) {
    parts.push(`Product orientation: ${physicsPlan.product_orientation}.`);
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

  if (productVisible && productProfile) {
    constraints.push(
      "No product category change.",
      "No product scale distortion or oversized product.",
      "No added handles unless visible in reference.",
      "No label redesign or label text change.",
      "No transformation of product into different container type.",
      "No liquid, powder, or spray from wrong part of product.",
      "No liquid from closed cap.",
      ...(productProfile.wrong_transformations ?? []).map(t => `No ${t.replace(/^do not /i, "")}.`),
    );
  }

  if (!productVisible) {
    constraints.push(
      "No product bottle or container in this scene.",
      "No liquid pouring in this scene.",
      "No product-like objects in hands unless specified.",
    );
  }

  return constraints.join(" ");
}
