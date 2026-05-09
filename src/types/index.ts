// Типы, разделяемые между клиентом и сервером (без зависимости от Prisma)

// === Product Geometry ===
export interface GeometryProfile {
  product_family: "bottle" | "spray bottle" | "pouch" | "packet" | "jar" | "clothing" | "shoes" | "tube" | "box" | "other";
  shape_class: "slim" | "wide" | "flat" | "cylindrical" | "rectangular" | "flexible" | "wearable";
  aspect_ratio: {
    height_class: "short" | "medium" | "tall";
    width_class: "narrow" | "medium" | "wide";
  };
  structural_features: {
    has_handle: boolean;
    has_trigger: boolean;
    has_cap: boolean;
    has_spout: boolean;
    has_zipper: boolean;
    has_sleeves: boolean;
    has_legs: boolean;
  };
  material_type: "plastic" | "paper" | "fabric" | "glass" | "metal" | "mixed";
  rigidity: "rigid" | "semi-rigid" | "flexible";
  scale_class: "handheld_small" | "handheld_medium" | "wearable_body" | "table_object" | "floor_object";
  deformation_rules: {
    can_bend: boolean;
    can_fold: boolean;
    can_expand: boolean;
  };
  forbidden_transformations: string[]; // Derived from structural features — never hardcode these manually
}

// === Product Analyzer ===
export interface SemanticProfile {
  product_category: string;
  product_purpose: string;
  problem_solved: string[];
  application_target: string;
  application_context: string;
  scene_requirements: string[];
  valid_actions: string[];
  invalid_actions: string[];
  location_must_include: string[];
}

export interface ProductProfile {
  product_type: "liquid bottle" | "spray bottle" | "powder packet" | "clothing" | "shoes" | "cosmetic jar" | "food item" | "other";
  container_form: string;
  size_class: "small handheld" | "medium handheld" | "large container" | "wearable item" | "other";
  material: "plastic" | "fabric" | "paper" | "glass" | "metal" | "other";
  cap_or_opening: "screw cap" | "trigger nozzle" | "torn packet opening" | "zipper" | "button" | "no opening" | "other";
  default_orientation: "upright" | "hanging" | "folded" | "worn" | "other";
  usage_actions: string[];
  grip_logic: string;
  opening_logic: string;
  scale_logic: string;
  wrong_transformations: string[];
  semantic: SemanticProfile;
  geometry: GeometryProfile; // structural geometry — drives dynamic product lock
}

// === Scene Physics ===
export interface PhysicsPlan {
  human_pose: string;
  ground_contact: string;
  object_position: string;
  product_interaction: "showcase" | "pour" | "spray" | "wear" | "hold" | "open" | "powder_pour" | "none";
  product_orientation: string;
  action_physics: string[];
  impossible_states: string[];
}

export type ProjectStep =
    | "SCRIPT_GENERATION"
    | "IMAGE_GENERATION"
    | "ANIMATION_GENERATION"
    | "FINAL_STITCH"
    | "COMPLETED";

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface SceneData {
    id: string;
    projectId: string;
    order: number;
    brief: string | null;
    sceneScript: string | null;
    imagePrompt: string | null;
    imageUrl: string | null;
    animationPrompt: string | null;
    animationJobId?: string | null;
    animationStatus?: "PENDING" | "UPSCALE_PENDING" | "COMPLETED" | "FAILED" | null;
    animationError?: string | null;
    mediaGenerationId?: string | null;
    upscaleJobId?: string | null;
    videoUrl: string | null;
    voiceoverScript: string | null;
    voiceProfile: string | null;
    voiceAudioUrl: string | null;
    voicedVideoUrl: string | null;
    requiresProductImage?: boolean;
    finalApproved: boolean;
    physicsPlan?: string;
    promptLog?: string;
}

export interface ProjectData {
    id: string;
    title: string;
    topic: string;
    status: string;
    currentStep: ProjectStep;
    visualStyle?: string;
    referenceImageUrl?: string;
    productProfile?: ProductProfile;
    characterReferenceImageUrl?: string;
    scriptChatHistory?: { role: "user" | "assistant" | "system"; content: string }[];
    scenes: SceneData[];
}
