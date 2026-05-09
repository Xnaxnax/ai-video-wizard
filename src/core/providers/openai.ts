import type { ScriptProvider, GeneratedScene, SceneInput } from "./interfaces";
import type { ChatMessage } from "@/lib/useOpenAIChat";
import type { ProductProfile, PhysicsPlan } from "@/types";

export class OpenAIScriptProvider implements ScriptProvider {
  name = "openai-chatgpt";

  private async callOpenAI(messages: ChatMessage[], useJson = false, temperature = 0.7) {
    let lastError: any = null;
    for (let i = 0; i < 3; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages,
            temperature,
            response_format: useJson ? { type: "json_object" } : undefined,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || "OpenAI error");
        }

        return response.json();
      } catch (error: any) {
        lastError = error;
        console.warn(`[OpenAI] Attempt ${i + 1} failed:`, error.message);
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    throw lastError;
  }

  async generateScenes(topic: string): Promise<{ scenes: GeneratedScene[]; visualStyle: string }> {
    const prompt = `
<role>
You are a professional Video Director and Script Writer (AI Video Wizard).
</role>

<context>
The user needs a short UGC-style video (10-15 seconds) split into exactly 3-4 scenes.
Topic: "${topic}"
</context>

<task>
Create a realistic short video script and return ONLY valid JSON.
</task>

<constraints>
1. Scene Title (brief): Short scene title IN RUSSIAN (e.g. "Мужчина у выгребной ямы").
2. Visual Description (sceneScript): 1-2 sentence vivid literal visual description IN RUSSIAN of EXACTLY ONE moment.
   - Be specific about location, action.
3. Visual Style (visualStyle): IN ENGLISH.
   - Describe a CONSISTENT main character (e.g., "A 35-year-old European man with short dark brown hair, light stubble, wearing a plain grey t-shirt and black shorts").
   - Describe a CONSISTENT location (e.g., "Backyard of a suburban house with a wooden fence and green grass").
   - MUST include: "RAW photo, DSLR, 50mm lens, photorealistic, ultra-detailed, 9:16 vertical".
4. NO DASHES: Do not use dashes ("—" or "-"). Use commas instead.
</constraints>

<output_format>
{
  "visualStyle": "...",
  "scenes": [
    { "brief": "...", "sceneScript": "..." }
  ]
}
</output_format>
    `;

    const data = await this.callOpenAI([
      { role: "system", content: "You are a professional video director and script writer. Output only valid JSON." },
      { role: "user", content: prompt },
    ], true);

    try {
      const content = JSON.parse(data.choices[0].message.content);
      return {
        scenes: content.scenes || [],
        visualStyle: content.visualStyle || "RAW photo, DSLR, 50mm lens, photorealistic, ultra-detailed",
      };
    } catch (e) {
      console.error("Failed to parse OpenAI response as JSON", e);
      return { scenes: [], visualStyle: "RAW photo, DSLR, 50mm lens, photorealistic" };
    }
  }

  async regenerateSceneScript(scene: SceneInput, projectTopic: string): Promise<string> {
    const scenePosition = scene.sceneIndex && scene.totalScenes
      ? `This is scene ${scene.sceneIndex} of ${scene.totalScenes}.`
      : "";

    const prompt = `
<role>
You are a professional video director writing realistic scene descriptions.
</role>

<context>
Topic: "${projectTopic}".
${scenePosition}
Scene title: "${scene.brief}"
Current description: "${scene.sceneScript || "None"}"
</context>

<task>
Rewrite the visual description for this ONE scene.
</task>

<constraints>
- Describe ONLY what the camera sees in this single moment.
- Be specific: exact location, objects visible, character's action.
- Use realistic everyday settings.
- NO story summaries, NO mention of what happens in other scenes.
- Maximum 2 short sentences.
- Write in RUSSIAN.
- NO DASHES: Do not use dashes ("—" or "-").
</constraints>

<output_format>
Output ONLY the text. No markdown, no explanations.
</output_format>
    `;

    const data = await this.callOpenAI([
      { role: "system", content: "You are a professional video director writing realistic scene descriptions." },
      { role: "user", content: prompt },
    ]);

    return data.choices[0].message.content.trim();
  }

  /**
   * Generates ONLY the scene-specific creative action (Block F in the prompt pipeline).
   * Does NOT generate character/product/physics locks — those are added by PromptBuilder.
   * Output: 1-3 sentences describing what specifically happens in this scene.
   */
  async generateSceneAction(
    sceneScript: string,
    physicsPlan: PhysicsPlan | null | undefined,
    productProfile: ProductProfile | null | undefined
  ): Promise<string> {
    const actionContext = physicsPlan
      ? `Action type: ${physicsPlan.product_interaction || "showcase"}. Human pose: ${physicsPlan.human_pose || "standing"}.`
      : "";

    const productContext = productProfile
      ? `Product type: ${productProfile.product_type}. Usage actions: ${(productProfile.usage_actions ?? []).join(", ")}.`
      : "No product in this scene.";

    const prompt = `
<role>
You are a scene action writer for an AI video production system.
Your ONLY job is to write 1-3 sentences describing the specific action happening in one scene.
You do NOT write character descriptions, location descriptions, camera instructions, or constraints.
Those are handled elsewhere. Write ONLY the creative action.
</role>

<context>
Scene description (in Russian): "${sceneScript}"
${actionContext}
${productContext}
</context>

<task>
Write 1-3 short English sentences describing ONLY what the person is physically doing in this scene.
Be literal and specific. Describe the action, body position, and any object interaction.
Do NOT write "a man is" or "a woman is" — just describe the action directly.
Do NOT include camera, lighting, or style instructions.
Do NOT include character appearance or location description.
Do NOT include negative rules.
</task>

<output_format>
Output ONLY the action description in English. No markdown, no explanations. Maximum 3 sentences.
</output_format>
    `;

    const data = await this.callOpenAI([
      { role: "system", content: "You are a scene action writer. Output only the specific physical action happening in the scene. No character descriptions, no constraints, no camera instructions." },
      { role: "user", content: prompt },
    ], false, 0.4);

    return data.choices[0].message.content.trim();
  }

  /**
   * @deprecated Use generateSceneAction() + PromptBuilder instead.
   * Kept for backward compatibility with existing scenes that have imagePrompt stored.
   */
  async generateImagePrompt(
    sceneScript: string,
    visualStyle?: string,
    requiresProductImage?: boolean,
    productAnalysis?: string,
    sceneBrief?: string,
    sceneIndex?: number,
    totalScenes?: number
  ): Promise<string> {
    const style = visualStyle || "A person in a casual outfit standing in a natural outdoor setting.";

    let productInstruction: string;
    let photoType: string;
    if (requiresProductImage) {
      photoType = "product lifestyle photo or action photo";
      productInstruction = `Include the product from the reference image.
   - Brand label must be sharp and legible.
   - Keep exact same product design, shape, and label.
   - End the prompt with: "Photorealistic product integration."
   ${productAnalysis ? `Product Details: ${productAnalysis}` : ""}`;
    } else {
      photoType = "action photo";
      productInstruction = "NO PRODUCT in this scene. Focus on the character and environment.";
    }

    const sceneContext = sceneBrief
      ? `Scene title: "${sceneBrief}" (scene ${sceneIndex || "?"} of ${totalScenes || "?"})`
      : "";

    const prompt = `
<role>
You are a highly precise AI image prompt engineer. Your job is to translate Russian scene descriptions
into EXACT, literal, and highly structured English prompts for a photorealistic image generator.
</role>

<context>
${sceneContext}
Scene description (in Russian): "${sceneScript}"
Base Style/Character/Location: "${style}"
</context>

<task>
Create a highly detailed image prompt that explicitly describes the physical logic of the environment.
DO NOT hallucinate extra objects. DO NOT add complex actions not mentioned in the scene.
</task>

<constraints>
1. Format: Start with "Create an ultra-realistic vertical 9:16 ${photoType}."
2. Consistency: Always include "Use the exact same person from the character reference image. Same face. Same clothes. Same location."
3. Logic: Describe all object placements physically accurately.
4. Product: ${productInstruction}
5. No Hallucinations: Do not add extra objects or people.
6. End with negative rules: No extra people. No extra limbs. No different person. No changed product.
</constraints>

<output_format>
Output ONLY the prompt text in ENGLISH as a single continuous paragraph. No explanations.
</output_format>
    `;

    const data = await this.callOpenAI([
      { role: "system", content: "You are an expert AI image prompt engineer. You output strict, highly detailed, literal prompts." },
      { role: "user", content: prompt },
    ], false, 0.4);

    return data.choices[0].message.content.trim();
  }

  async reviseImagePrompt(currentPrompt: string, userFeedback: string): Promise<string> {
    const prompt = `
<role>
You are an expert AI image prompt engineer. Your job is to revise an existing English image generation prompt based on user feedback.
</role>

<task>
1. Read the CURRENT PROMPT.
2. Read the USER FEEDBACK (which may be in Russian or English).
3. Update the CURRENT PROMPT to satisfy the user's feedback, while keeping all other details exactly the same.
4. Output ONLY the updated English prompt as a single paragraph. No explanations.
</task>

<current_prompt>
${currentPrompt}
</current_prompt>

<user_feedback>
${userFeedback}
</user_feedback>
`;

    const data = await this.callOpenAI([
      { role: "system", content: "You are an expert AI image prompt engineer. Output ONLY the revised English prompt." },
      { role: "user", content: prompt },
    ], false, 0.4);

    return data.choices[0].message.content.trim();
  }

  async generateAnimationPrompt(sceneScript: string, imagePrompt: string): Promise<string> {
    const prompt = `
<role>
You are an expert director for AI video animation (Google Flow / Veo). Your job is to create a highly structured animation prompt that includes lip-sync instructions and speech text in Russian.
</role>

<context>
Action/Scene Description: "${sceneScript}"
Base Image Prompt/Visuals: "${imagePrompt}"
</context>

<task>
Create an animation prompt exactly following the format of the successful examples below.
Choose the MOST appropriate example pattern based on the action in the scene.
</task>

<successful_examples>
Example 1 (Introduction/Talking):
"Speak in Russian. Language Russian Russia. Native Russian pronunciation.
Animate this exact image with subtle realistic motion. Preserve identity.
The man speaks naturally to camera with realistic Russian lip sync.
Speech: [Short 1-sentence Russian phrase matching the scene]
Animation: Subtle mouth articulation. Natural blinking. Small natural head nod. Raised finger makes small emphasis gesture. Slight lean toward camera. Light breathing movement.
Add minimal handheld smartphone micro movement. Keep background static. Natural realistic speaking motion only."

Example 2 (Smell/Reaction):
"Speak in Russian. Language Russian Russia. Native Russian pronunciation.
Animate this exact image with realistic lip sync and subtle motion. Preserve identity.
The man speaks naturally in Russian.
Speech: [Short 1-sentence Russian phrase about the smell]
Animation: Natural lip sync. Hand covering nose moves slightly. Eyes squint naturally. Small backward recoil from smell. Natural blinking. Light breathing.
Add subtle handheld camera realism. Keep background static."

Example 3 (Inspection/Action):
"Speak in Russian. Language Russian Russia. Native Russian pronunciation.
Animate this exact image. Preserve identity.
Speech: [Short 1-sentence Russian phrase about what he sees]
Animation: Natural Russian lip sync. Small head movement downward. Natural blinking.
Minimal handheld camera movement. Keep environment static."

Example 4 (Product Presentation):
"Speak in Russian. Language Russian Russia. Native Russian pronunciation.
Animate this exact image with realistic speech sync and product consistency. Preserve exact product bottle and brand label.
Speech: [Short 1-sentence Russian phrase about the product]
Animation: Natural lip sync. Product moves slightly closer to camera. Small wrist rotation to show label. Subtle head nod. Natural blinking.
Product and brand logo MUST remain perfectly sharp, static, and unchanged. ZERO label distortion. ZERO text morphing. Minimal handheld camera movement."

Example 5 (Product Pouring Action):
"Speak in Russian. Language Russian Russia. Native Russian pronunciation.
Animate this exact image with realistic speech sync and pouring animation. Preserve exact product.
Speech: [Short 1-sentence Russian phrase about pouring]
Animation: Natural lip sync. Liquid continuously pours from product. Product slowly tilts downward. Liquid stream remains smooth and realistic. Small realistic splash and ripples. Natural blinking.
Product and brand label MUST stay perfectly frozen and sharp. No text warping during movement. Minimal handheld camera movement."
</successful_examples>

<constraints>
1. Always include "Speak in Russian. Language Russian Russia. Native Russian pronunciation."
2. Always include "Animate this exact image... Preserve identity."
3. Speech: Generate 1 short, natural Russian sentence.
   - NO DASHES ("—" or "-").
   - NO QUOTES.
   - NO BRACKETS.
   - Output ONLY the plain text.
4. Output: ONLY the final prompt text. No meta-talk.
</constraints>
`;

    const data = await this.callOpenAI([
      { role: "system", content: "You are an expert director for AI video animation." },
      { role: "user", content: prompt },
    ], false, 0.4);

    return data.choices[0].message.content.trim();
  }

  async generateVoiceoverScript(sceneScript: string): Promise<string> {
    const prompt = `
<role>
You are a professional voiceover writer for short UGC social media videos.
</role>

<context>
Scene: "${sceneScript}"
</context>

<task>
Write a short voiceover line for this video scene.
</task>

<constraints>
- Maximum 1 short sentence (3-4 seconds of speech).
- Natural spoken Russian, not formal.
- Only the words to be spoken — no stage directions, no quotes.
- Write in RUSSIAN.
- NO DASHES: Do not use dashes ("—" or "-").
</constraints>

<output_format>
Output ONLY the voiceover text. No markdown, no explanations.
</output_format>
    `;

    const data = await this.callOpenAI([
      { role: "system", content: "You are a professional voiceover writer for short social media videos." },
      { role: "user", content: prompt },
    ]);

    return data.choices[0].message.content.trim();
  }

  /**
   * @deprecated Use analyzeProductImage from product-analyzer.ts instead.
   * Returns plain text description (legacy). New code uses ProductProfile JSON.
   */
  async analyzeProductImage(imageUrl: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a product photography expert. Analyze the product and describe it in extreme visual detail for an AI image generator.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Describe this product EXTREMELY visually for an AI image generator so it can reproduce it exactly. Be concise but precise. Include:
1. Container type (bottle/jar/pack/tube) and exact shape
2. Container color and material
3. Cap/lid style and color
4. Brand name and product name EXACTLY as written
5. Label colors and main design elements
6. Approximate size
Write as ONE paragraph in English. Start with the container shape.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.error("[analyzeProductImage] GPT-4o Vision failed");
      return "";
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
}
