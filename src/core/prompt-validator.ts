/**
 * Prompt Validator
 * Validates the final image prompt before sending to OpenAI Image API.
 * If validation fails, runs repairPrompt() to fix missing constraints.
 * Universal: checks common requirements + product/action-specific rules.
 */
import type { ProductProfile, PhysicsPlan } from "@/types";
import type { SceneActionExtract } from "@/core/scene-action-extractor";

export interface ValidationContext {
  requiresProductImage: boolean;
  actionType?: string;
  hasGroundObject?: boolean;
  sceneActionExtract?: SceneActionExtract | null; // Literal scene contract
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates the prompt for all required sections.
 */
export function validatePrompt(
  prompt: string,
  context: ValidationContext
): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const p = prompt.toLowerCase();

  // === Always required ===
  if (!hasCharacterLock(p)) missing.push("character_lock");
  if (!hasLocationLock(p)) missing.push("location_lock");
  if (!hasCameraInstruction(p)) missing.push("camera_instruction");
  if (!hasNegativeConstraints(p)) missing.push("negative_constraints");
  if (!hasAnatomyInstruction(p)) missing.push("anatomy_instruction");

  // === Product scene requirements ===
  if (context.requiresProductImage) {
    if (!hasProductLock(p)) missing.push("product_lock");
    if (!hasScaleLogic(p)) missing.push("product_scale_logic");
    if (!hasProductCategoryPreservation(p)) missing.push("product_category_preservation");

    // Action-specific checks
    const action = context.actionType || inferActionType(p);

    if (action === "pour" || action === "powder_pour") {
      if (!hasOpeningInstruction(p)) missing.push("pour_opening_instruction");
      if (!hasPourPhysics(p)) missing.push("pour_physics");
    }

    if (action === "spray") {
      if (!p.includes("nozzle")) missing.push("spray_nozzle_instruction");
    }
  }

  // === Ground object requirements ===
  if (context.hasGroundObject || hasGroundObjectMention(p)) {
    if (!hasGroundContactInstruction(p)) {
      warnings.push("ground_contact_instruction_weak");
    }
    if (!hasBurialPrevention(p)) missing.push("burial_prevention");
  }

  // === Literal scene compliance (SceneScript is the law) ===
  const extract = context.sceneActionExtract;
  if (extract) {
    // 1. Check product visibility compliance
    if (extract.product_visibility === "none") {
      // No product should appear in the prompt
      if (hasProductLock(p)) {
        missing.push("product_injected_in_no_product_scene");
      }
    }

    // 2. Check forbidden objects are not present in required/action blocks
    const forbiddenInPrompt = extract.forbidden_objects.filter(obj => {
      // Only flag if the forbidden object appears in a "required" or "action" context
      const objL = obj.toLowerCase();
      return (
        p.includes(`required in frame: ${objL}`) ||
        p.includes(`primary action: ${objL}`) ||
        p.includes(`use the exact same ${objL}`)
      );
    });
    if (forbiddenInPrompt.length > 0) {
      missing.push(`forbidden_objects_in_prompt: ${forbiddenInPrompt.join(", ")}`);
    }

    // 3. Check primary_action is present in prompt
    const actionKeywords = extract.primary_action
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);
    const actionPresent = actionKeywords.slice(0, 3).some(kw => p.includes(kw));
    if (!actionPresent) {
      warnings.push("primary_action_not_clearly_stated");
    }

    // 4. Check hand_state constraint
    if (extract.hand_state === "empty hands" && (p.includes("holding product") || p.includes("product in hand"))) {
      missing.push("hand_state_violation_product_in_empty_hands_scene");
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

// ─── Repair ──────────────────────────────────────────────────────────────────

/**
 * Repairs a prompt that failed validation by appending missing constraint blocks.
 * Does NOT rewrite the whole prompt — only adds missing sections.
 */
export async function repairPrompt(
  prompt: string,
  missing: string[],
  physicsPlan: PhysicsPlan | null | undefined,
  productProfile: ProductProfile | null | undefined,
  visualStyle: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || missing.length === 0) return prompt;

  const missingList = missing.map(m => `- ${m.replace(/_/g, " ")}`).join("\n");

  const physicsContext = physicsPlan
    ? `Physics plan: ${JSON.stringify(physicsPlan)}`
    : "";

  const productContext = productProfile
    ? `Product profile: ${JSON.stringify(productProfile)}`
    : "";

  const repairSystemPrompt = `You are an AI image prompt repair specialist.
Your job is to fix an image generation prompt by adding ONLY the missing constraint sections.
Do NOT rewrite the entire prompt creatively.
Do NOT remove existing content.
Only append short, precise constraint additions to fix the listed issues.
Output ONLY the complete fixed prompt text, no explanations.`;

  const repairUserPrompt = `Original prompt:
"${prompt}"

Visual style: ${visualStyle}

${physicsContext}
${productContext}

Missing constraints that must be added:
${missingList}

Instructions:
- Keep all existing content intact
- Append only what is necessary to satisfy the missing constraints
- Use positive physical descriptions first, then short negative rules
- Output the complete fixed prompt as a single paragraph`;

  try {
    console.log("[PromptValidator] Repairing prompt. Missing:", missing.join(", "));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: repairSystemPrompt },
          { role: "user", content: repairUserPrompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      console.error("[PromptValidator] Repair API error");
      return prompt; // Return original if repair fails
    }

    const data = await response.json();
    const repaired = data.choices[0]?.message?.content?.trim();
    if (!repaired) return prompt;

    console.log("[PromptValidator] Prompt repaired successfully");
    return repaired;
  } catch (e: any) {
    console.error("[PromptValidator] Repair failed:", e.message);
    return prompt;
  }
}

// ─── Checkers ────────────────────────────────────────────────────────────────

function hasCharacterLock(p: string): boolean {
  return (
    p.includes("same person") ||
    p.includes("same face") ||
    p.includes("character reference") ||
    p.includes("exact same person") ||
    p.includes("same man") ||
    p.includes("same woman")
  );
}

function hasLocationLock(p: string): boolean {
  return (
    p.includes("same location") ||
    p.includes("same backyard") ||
    p.includes("same place") ||
    p.includes("same background") ||
    p.includes("location:")
  );
}

function hasCameraInstruction(p: string): boolean {
  return (
    p.includes("9:16") ||
    p.includes("vertical") ||
    p.includes("camera") ||
    p.includes("ugc")
  );
}

function hasNegativeConstraints(p: string): boolean {
  return (
    p.includes("no extra people") ||
    p.includes("strict rules") ||
    p.includes("do not violate") ||
    p.includes("no extra") ||
    p.includes("no different person")
  );
}

function hasAnatomyInstruction(p: string): boolean {
  return (
    p.includes("realistic anatomy") ||
    p.includes("realistic hands") ||
    p.includes("correct number of fingers") ||
    p.includes("realistic human")
  );
}

function hasProductLock(p: string): boolean {
  return (
    p.includes("product reference") ||
    p.includes("same product") ||
    p.includes("exact same product") ||
    p.includes("product (must match")
  );
}

function hasScaleLogic(p: string): boolean {
  return (
    p.includes("scale") ||
    p.includes("proportional") ||
    p.includes("realistic size") ||
    p.includes("hand scale")
  );
}

function hasProductCategoryPreservation(p: string): boolean {
  return (
    p.includes("product category") ||
    p.includes("same product category") ||
    p.includes("same main shape")
  );
}

function hasOpeningInstruction(p: string): boolean {
  return (
    p.includes("opening") ||
    p.includes("cap removed") ||
    p.includes("cap is removed") ||
    p.includes("open top") ||
    p.includes("torn") ||
    p.includes("opening visible")
  );
}

function hasPourPhysics(p: string): boolean {
  return (
    (p.includes("liquid") || p.includes("powder") || p.includes("flow")) &&
    (p.includes("only from") || p.includes("exits from") || p.includes("pours from"))
  );
}

function hasGroundContactInstruction(p: string): boolean {
  return (
    p.includes("above ground") ||
    p.includes("on ground") ||
    p.includes("feet") ||
    p.includes("fully visible on") ||
    p.includes("ground contact")
  );
}

function hasBurialPrevention(p: string): boolean {
  return (
    p.includes("not buried") ||
    p.includes("above ground") ||
    p.includes("no person buried") ||
    p.includes("not merged with ground")
  );
}

function hasGroundObjectMention(p: string): boolean {
  return (
    p.includes("septic") ||
    p.includes("manhole") ||
    p.includes("flush with ground") ||
    p.includes("buried in ground") ||
    p.includes("underground")
  );
}

function inferActionType(p: string): string {
  if (p.includes("pour") || p.includes("pouring")) return "pour";
  if (p.includes("spray") || p.includes("spraying")) return "spray";
  if (p.includes("powder") || p.includes("powder pour")) return "powder_pour";
  if (p.includes("wear") || p.includes("wearing") || p.includes("dressed")) return "wear";
  return "showcase";
}
