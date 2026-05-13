/**
 * Character Master
 * Manages a stable characterReferenceImageUrl for the project.
 * Generates a master character image once and reuses it for ALL scenes.
 */
import type { ProjectRecord } from "@/lib/store";
import { store } from "@/lib/store";

// In-flight generation lock per project — prevents parallel scenes from each
// triggering their own character reference generation when project.characterReferenceImageUrl is null.
const inFlightCharRef = new Map<string, Promise<string | undefined>>();

/**
 * Returns the stable character reference URL for the project.
 * If it doesn't exist yet, generates a master character image and saves it.
 * Parallel callers for the same project share a single in-flight Promise.
 */
export async function getOrCreateCharacterReference(
  project: ProjectRecord,
  generateImageFn: (prompt: string) => Promise<string>
): Promise<string | undefined> {
  if (project.characterReferenceImageUrl) {
    console.log(`[CharacterMaster] Using existing characterReferenceImageUrl for project ${project.id}`);
    return project.characterReferenceImageUrl;
  }

  const existing = inFlightCharRef.get(project.id);
  if (existing) {
    console.log(`[CharacterMaster] Awaiting in-flight character generation for project ${project.id}`);
    return existing;
  }

  console.log(`[CharacterMaster] No master reference found. Generating master character image for project ${project.id}...`);
  const style = project.visualStyle || "A person standing in a natural outdoor setting";
  const masterPrompt = buildMasterCharacterPrompt(style);

  const promise = (async () => {
    try {
      const imageUrl = await generateImageFn(masterPrompt);
      store.updateProject(project.id, { characterReferenceImageUrl: imageUrl });
      console.log(`[CharacterMaster] Master character image created and saved for project ${project.id}`);
      return imageUrl;
    } catch (e: any) {
      console.error(`[CharacterMaster] Failed to generate master character image:`, e.message);
      return undefined;
    } finally {
      inFlightCharRef.delete(project.id);
    }
  })();

  inFlightCharRef.set(project.id, promise);
  return promise;
}

/**
 * Builds a minimal, clean prompt for the master character reference image.
 * No product, no complex action — just a clear identity reference.
 */
function buildMasterCharacterPrompt(visualStyle: string): string {
  return [
    "Create an ultra-realistic vertical 9:16 character reference photo.",
    `${visualStyle}.`,
    "The person stands facing the camera with a neutral relaxed pose.",
    "Full body visible from head to feet.",
    "Face clearly visible, good lighting, natural expression.",
    "Same clothes as described. Same location as described.",
    "No product in frame. No complex actions. No other people.",
    "Smartphone UGC style, natural daylight, realistic anatomy.",
    "This image is used as a character reference for consistency across all future scenes.",
  ].join(" ");
}
