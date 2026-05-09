/**
 * Quality Checker
 * After image generation, runs a GPT-4o Vision check to verify:
 * - Same person, clothes, location
 * - Correct product category and scale
 * - No extra limbs, no extra people
 * - Correct action physics
 * - No buried person, no impossible placement
 *
 * If failed, returns issues for repairPrompt() and triggers regeneration.
 */
import type { ProductProfile, PhysicsPlan } from "@/types";

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-10
  issues: string[];
  repairNote: string; // injected at top of repaired prompt
}

interface QualityCheckContext {
  visualStyle: string;
  requiresProductImage: boolean;
  productProfile?: ProductProfile | null;
  physicsPlan?: PhysicsPlan | null;
}

const SYSTEM_PROMPT = `You are a quality control inspector for AI-generated images used in video production.
Your job is to check whether the generated image matches the required specifications.
Be strict but fair. Output ONLY valid JSON.`;

function buildQualityCheckPrompt(
  imageUrl: string,
  originalPrompt: string,
  ctx: QualityCheckContext
): object {
  const productSection = ctx.requiresProductImage && ctx.productProfile
    ? `
Product requirements:
- Type: ${ctx.productProfile.product_type}
- Form: ${ctx.productProfile.container_form}
- Size class: ${ctx.productProfile.size_class}
- Scale: ${ctx.productProfile.scale_logic}
- Known mutations to avoid: ${(ctx.productProfile.wrong_transformations ?? []).join("; ")}`
    : "No product in this scene.";

  const physicsSection = ctx.physicsPlan
    ? `
Required physics:
- Human pose: ${ctx.physicsPlan.human_pose}
- Ground contact: ${ctx.physicsPlan.ground_contact}
- Action: ${ctx.physicsPlan.product_interaction}
- Impossible states: ${(ctx.physicsPlan.impossible_states ?? []).join("; ")}`
    : "";

  const userText = `Check this generated image against requirements.

Visual style required: ${ctx.visualStyle}
${productSection}
${physicsSection}

Return JSON:
{
  "same_person": true/false (same face, age, hairstyle, clothes as described),
  "same_location": true/false (same background/setting),
  "correct_product_category": true/false (or null if no product),
  "correct_product_scale": true/false (or null if no product, false if oversized/tiny),
  "correct_action_physics": true/false (physics match required pose/action),
  "no_extra_people": true/false,
  "no_extra_limbs": true/false,
  "no_buried_person": true/false (person clearly above ground),
  "no_impossible_placement": true/false,
  "product_not_transformed": true/false (or null if no product),
  "issues": ["list of specific problems found, empty if passed"],
  "score": 0-10 (10 = perfect match),
  "repair_note": "if score < 7: specific instruction for regeneration focusing on the main failures"
}`;

  return [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
  ];
}

/**
 * Runs a quality check on a generated image.
 * Returns QualityCheckResult with pass/fail and repair instructions.
 */
export async function checkImageQuality(
  imageUrl: string,
  originalPrompt: string,
  ctx: QualityCheckContext
): Promise<QualityCheckResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[QualityChecker] OPENAI_API_KEY not set, skipping check");
    return { passed: true, score: 10, issues: [], repairNote: "" };
  }

  // Skip quality check for base64 images that are very large (would exceed token limits)
  if (imageUrl.startsWith("data:") && imageUrl.length > 5_000_000) {
    console.warn("[QualityChecker] Image too large for quality check, skipping");
    return { passed: true, score: 10, issues: [], repairNote: "" };
  }

  try {
    console.log("[QualityChecker] Running visual quality check...");

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
            content: buildQualityCheckPrompt(imageUrl, originalPrompt, ctx),
          },
        ],
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("[QualityChecker] API error:", err?.error?.message);
      return { passed: true, score: 10, issues: [], repairNote: "" }; // Don't block on checker failure
    }

    const data = await response.json();
    const raw = data.choices[0]?.message?.content;
    if (!raw) {
      return { passed: true, score: 10, issues: [], repairNote: "" };
    }

    const result = JSON.parse(raw);
    const score: number = result.score ?? 10;
    const issues: string[] = result.issues ?? [];
    const repairNote: string = result.repair_note ?? "";

    // Determine failing criteria
    const failingChecks: string[] = [];
    if (result.same_person === false) failingChecks.push("person_changed");
    if (result.same_location === false) failingChecks.push("location_changed");
    if (result.correct_product_category === false) failingChecks.push("product_category_wrong");
    if (result.correct_product_scale === false) failingChecks.push("product_oversized_or_wrong_scale");
    if (result.correct_action_physics === false) failingChecks.push("action_physics_wrong");
    if (result.no_extra_people === false) failingChecks.push("extra_people");
    if (result.no_extra_limbs === false) failingChecks.push("extra_limbs");
    if (result.no_buried_person === false) failingChecks.push("person_buried_in_ground");
    if (result.no_impossible_placement === false) failingChecks.push("impossible_object_placement");
    if (result.product_not_transformed === false) failingChecks.push("product_transformed");

    const allIssues = [...issues, ...failingChecks];
    const passed = score >= 7 && failingChecks.length === 0;

    console.log(`[QualityChecker] Score: ${score}/10. Passed: ${passed}. Issues: ${allIssues.join(", ") || "none"}`);

    return { passed, score, issues: allIssues, repairNote };
  } catch (e: any) {
    console.error("[QualityChecker] Failed:", e.message);
    return { passed: true, score: 10, issues: [], repairNote: "" };
  }
}

/**
 * Builds a repair prompt prefix based on quality check failures.
 * Prepended to the original prompt before regeneration.
 */
export function buildQualityRepairPrefix(result: QualityCheckResult): string {
  if (result.passed || result.issues.length === 0) return "";

  const fixes = [
    `PREVIOUS GENERATION FAILED QUALITY CHECK (score: ${result.score}/10).`,
    `Issues found: ${result.issues.join(", ")}.`,
  ];

  if (result.repairNote) {
    fixes.push(`Fix specifically: ${result.repairNote}`);
  }

  // Add targeted fix instructions for known failure modes
  if (result.issues.includes("person_changed")) {
    fixes.push("CRITICAL: The person changed. Use ONLY the character reference image. Do not create a new person.");
  }
  if (result.issues.includes("product_category_wrong") || result.issues.includes("product_transformed")) {
    fixes.push("CRITICAL: Product was transformed. Use ONLY the product reference image. Keep exact same product type, shape and size.");
  }
  if (result.issues.includes("product_oversized_or_wrong_scale")) {
    fixes.push("CRITICAL: Product scale was wrong. Product must appear at realistic handheld scale next to human body.");
  }
  if (result.issues.includes("person_buried_in_ground")) {
    fixes.push("CRITICAL: Person appeared buried. Person must stand with BOTH FEET clearly visible ABOVE GROUND.");
  }
  if (result.issues.includes("action_physics_wrong")) {
    fixes.push("CRITICAL: Physics were wrong. Follow the Physics lock instructions exactly.");
  }
  if (result.issues.includes("extra_limbs")) {
    fixes.push("CRITICAL: Extra limbs detected. Generate realistic human anatomy with correct number of limbs.");
  }

  return fixes.join(" ");
}
