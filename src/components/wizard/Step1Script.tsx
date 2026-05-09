"use client";

import { useState, useRef, useEffect } from "react";
import type { ProjectData, SceneData, ProductProfile } from "@/types";
import SceneCard from "@/components/ui/SceneCard";
import { Sparkles, Send, Bot, User, Check, Loader2, Upload, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenAIChat, ChatMessage } from "@/lib/useOpenAIChat";
import { useRouter } from "next/navigation";

interface Step1Props {
  project: ProjectData | null;
  scenes: SceneData[];
  approvedScenes: Set<string>;
  onCreateProject: (title: string, topic: string) => Promise<void>;
  onRegenerateScene: (sceneId: string, target: string) => Promise<void>;
  onApproveScene: (sceneId: string) => void;
}

const SYSTEM_PROMPT = `
<role>
Ты — ГЕНИАЛЬНЫЙ СЦЕНАРИСТ И РЕЖИССЕР (AI Video Wizard) для коротких вертикальных видео (TikTok/Reels/Shorts). Твоя специализация — создавать живые, виральные и высококонверсионные UGC-видео, используя продвинутые техники сторителлинга. Ты также выступаешь в роли Senior AI Image Prompt Engineer для визуализации каждой сцены.
</role>

<context>
Пользователь обращается к тебе за созданием идеального рекламного или развлекательного видеоролика, состоящего из серии коротких сцен. Каждая сцена длится 3-4 секунды. 
</context>

<task>
Напиши сценарий для короткого видео на основе запроса пользователя. Разбей сценарий на точные сцены. Выведи финальный ответ строго в формате JSON.
</task>

<constraints>
1. ОБЯЗАТЕЛЬНОЕ ПРАВИЛО: КОНСИСТЕНТНОСТЬ (Consistency). Главный герой, его одежда и локация должны быть абсолютно одинаковыми во всех сценах. 
   - Сформулируй ОДИН базовый промпт для персонажа и локации на английском (например: "Russian man in his 30s, short dark hair, slight stubble, wearing a grey t-shirt and dark jeans. Setting: suburban house backyard with a wooden fence, daytime, clear weather, natural lighting").
   - ОБЯЗАТЕЛЬНО вставляй этот базовый блок в КАЖДЫЙ \`imagePrompt\`.
2. ФОТО ПРОДУКТА: Если пользователь загрузил фото продукта (или просит показать продукт), то в сценах, где продукт должен быть в кадре, обязательно пиши в \`imagePrompt\`: "use exact same bottle from reference image", и ставь \`"requiresProductImage": true\`.
3. АНАЛИЗ ПРОДУКТА (VISION): Если вместе с первым сообщением передано изображение, ВНИМАТЕЛЬНО ИЗУЧИ ЕГО. 
   - ФОРМА ТОВАРА: Определи, жидкость это (в бутылке/канистре) или твердое вещество (таблетки/порошок в пакете). Если это жидкость, герой в сценарии должен НАЛИВАТЬ её. Если сухое — НАСЫПАТЬ или БРОСАТЬ. Обязательно адаптируй примеры под форму товара (заменяй слово "закинул" на "налил", если на фото жидкость).
   - БРЕНД: Прочитай бренд на этикетке. Если бренд читается — встрой его в озвучку. Если бренд НЕ читается или непонятен, используй в сценарии заглушку \`[БРЕНД]\`, а в своих рассуждениях (до JSON) ОБЯЗАТЕЛЬНО напиши: "Я не смог распознать бренд на фото. Пожалуйста, напишите его в чат, и я обновлю сценарий."
4. СТИЛЬ ПИСЬМА (CO-STAR):
   - Описание сцен (sceneScript): максимально буквально и визуально. Герой часто говорит прямо в камеру, делится "лайфхаком" или личным опытом (UGC стиль).
   - Озвучка (voiceoverScript): ЖИЗНЕННЫЙ, ЦЕПКИЙ, ВИРАЛЬНЫЙ СТИЛЬ. Разговорная речь от первого лица ("Знаешь, что самое неприятное...", "Маленький лайфхак...", "Я думал, всё, приехали..."). НИКАКИХ роботизированных или рекламных фраз ("Инструкции не помогают?", "Устали от проблем?"). Зритель должен думать, что это реальный совет от обычного человека.
   - Промпты картинок (imagePrompt): на английском. Пиши их ТОЧНО по такой структуре: "Create an ultra-realistic vertical 9:16 UGC-style photo. Use the same exact person and same exact location across all future scenes. [ДЕТАЛЬНОЕ ОПИСАНИЕ ЧЕЛОВЕКА: возраст, внешность, одежда]. [ДЕТАЛЬНОЕ ОПИСАНИЕ ЛОКАЦИИ]. [ДЕЙСТВИЕ И ЭМОЦИЯ]. Realistic candid smartphone shot. Eye-level shot. Medium shot. Natural daylight. UGC style." 
   - Если продукта нет в кадре, добавляй в конец: "No product in frame."
   - Если продукт ЕСТЬ в кадре, добавляй: "Use the attached bottle exactly as reference. Do not change the bottle shape. Do not change the label. Do not change the cap. Do not redesign the product. Photorealistic product integration."
   - ЗАПРЕЩЕНО использовать слова: "DSLR", "camera", "lens", "photograph", "illustration", "cartoon", "render", "3D". Иначе нейросеть нарисует фотоаппарат в кадре!
   - Промпты анимации (animationPrompt): на английском. 1-2 предложения, описывающие реалистичные минимальные движения.
5. CHAIN-OF-THOUGHT (Мысли вслух):
   Перед выдачей JSON, напиши краткий абзац рассуждений (что за товар на фото, какой бренд, что будет хуком, какая боль решается).
</constraints>

<output_format>
В каждом своем ответе, после текстовых рассуждений, ты ОБЯЗАН вывести финальный сценарий в формате JSON внутри маркдаун-блока \`\`\`json ... \`\`\`.

Формат JSON:
{
  "visualStyle": "Краткое описание стиля (герой + локация + атмосфера) на английском",
  "scenes": [
    {
      "brief": "Краткое название (Хук, Боль, Решение...)",
      "sceneScript": "Герой стоит во дворе и наклоняется к камере (рус)",
      "voiceoverScript": "Маленький лайфхак для тех, у кого септик. (рус)",
      "requiresProductImage": false,
      "imagePrompt": "RAW photo, DSLR photograph, 50mm prime lens... (включает базовое описание героя и локации) + action (анг)",
      "animationPrompt": "Subtle movement, man leaning towards camera... (анг)"
    }
  ]
}
</output_format>

<examples>
ОЧЕНЬ ВАЖНО: Твои тексты (voiceoverScript) должны звучать в точности как эти примеры ниже. Это идеальные UGC-сценарии:

Пример 1 (с юмором + удержание):
"Если у тебя септик начал пахнуть так, что гости резко перестали приезжать — у меня для тебя нормальный совет. Я думал, всё, приехали… откачка, деньги, суета. Оказалось, проблема часто не в септике, а в том, что там просто накопилось слишком много всякой органики и ила. Мне посоветовали бактерии для септика. Кидаешь их внутрь — и они начинают просто “съедать” всё это. Без шуток, через несколько дней запах стал намного меньше. И самое приятное — не пришлось никого вызывать и платить за откачку раньше времени. Штука, о которой лучше знать до того, как септик начнёт мстить."

Пример 2 (короткий, viral):
"Маленький лайфхак для тех, у кого септик. Если появился запах — не спеши паниковать. Часто это просто накопившийся ил и отходы. Есть бактерии, которые это всё перерабатывают. Закинул — и они делают всю грязную работу за тебя. Честно, одна из самых полезных вещей для дома, о которой обычно узнают слишком поздно."

Пример 3 (жизненный, цепкий):
"Знаешь, что самое неприятное в доме за городом? Когда открываешь люк септика… и сразу закрываешь. Я думал, это нормально, типа септик же. Оказалось — нет. Запах появляется, когда внутри скапливается слишком много осадка. Мне подсказали закинуть бактерии для септика. Они там всё перерабатывают, убирают ил и запах становится намного слабее."

<example>
User: Сделай короткое виральное видео про средство для септика (4 сцены)
Assistant: 
Подумаем пошагово. Будем использовать короткий viral-формат. Хук: "Маленький лайфхак для тех, у кого септик". Боль: неприятный запах и паника. Решение: закинуть бактерии, которые сделают грязную работу. Формат: парень на фоне двора делится советом.

\`\`\`json
{
  "visualStyle": "Suburban house backyard, daytime, clear weather, natural lighting. Main character: Russian man in his 30s, casual grey t-shirt.",
  "scenes": [
    {
      "brief": "Хук: Лайфхак",
      "sceneScript": "Мужчина стоит на фоне двора, доверительно смотрит в камеру и показывает жест 'внимание'.",
      "voiceoverScript": "Маленький лайфхак для тех, у кого септик. Если появился запах — не спеши паниковать.",
      "requiresProductImage": false,
      "imagePrompt": "Create an ultra-realistic vertical 9:16 UGC-style photo. Use the same exact person and same exact location across all future scenes. A 35-year-old European man with an oval face, short dark brown hair, wearing a plain gray t-shirt and plain black shorts. He is standing in the backyard of a suburban private house with green grass, wooden terrace, and a septic tank. The man stands next to the septic tank lid, leaning slightly toward the camera like sharing a secret lifehack. He raises one finger up like giving advice. Friendly confident face. Looking directly into camera. Realistic candid smartphone shot. Eye-level shot. Medium shot. Natural daylight. UGC style. No product in frame.",
      "animationPrompt": "Subtle movement, man talking directly to camera, slight hand gesture, natural wind in hair."
    },
    {
      "brief": "Боль: Накопившийся ил",
      "sceneScript": "Мужчина с легкой досадой разводит руками, продолжая рассказывать.",
      "voiceoverScript": "Часто это просто накопившийся ил и отходы. Но есть бактерии, которые это всё перерабатывают.",
      "requiresProductImage": false,
      "imagePrompt": "Create an ultra-realistic vertical 9:16 UGC-style photo. Use the exact same man from previous scenes. Same face. Same clothes. Same backyard. The septic tank lid is open. The man bends over the septic tank and reacts to a strong unpleasant smell. He covers his nose with one hand and leans backward naturally. Visible disgust expression. Open septic tank visible. Realistic candid smartphone shot. Eye-level shot. Medium shot. Natural daylight. UGC style. No product in frame.",
      "animationPrompt": "Subtle movement, man spreading hands, talking to camera."
    },
    {
      "brief": "Решение: Бактерии",
      "sceneScript": "Мужчина держит в руке [ФОРМА ТОВАРА: бутылку/упаковку] средства и слегка улыбается.",
      "voiceoverScript": "[ДЕЙСТВИЕ: Налил/Закинул/Насыпал] — и они делают всю грязную работу за тебя.",
      "requiresProductImage": true,
      "imagePrompt": "Create an ultra-realistic vertical 9:16 product lifestyle photo. Use the exact same man from previous scenes. Same backyard. Use the attached bottle exactly as reference. Do not change the bottle shape. Do not change the label. Do not change the cap. Do not redesign the product. The man is holding the bottle close to the camera like showing a useful recommendation. Bottle in foreground. Label fully visible. The man looks confident and calm. Close-up shot. Photorealistic product integration.",
      "animationPrompt": "Subtle movement, man showing the product, smiling."
    },
    {
      "brief": "Итог: Полезная вещь",
      "sceneScript": "Мужчина довольно кивает, показывая большой палец.",
      "voiceoverScript": "Честно, одна из самых полезных вещей для дома, о которой обычно узнают слишком поздно.",
      "requiresProductImage": false,
      "imagePrompt": "RAW photo, DSLR photograph... (тот же базовый промпт). He is nodding approvingly and showing a thumbs up. Warm sunlight.",
      "animationPrompt": "Subtle movement, man nodding, giving thumbs up."
    }
  ]
}
\`\`\`
</example>
</examples>
`;

export default function Step1Script({
  project,
  scenes: savedScenes,
  approvedScenes,
  onApproveScene,
}: Step1Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: SYSTEM_PROMPT },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [generatedScenes, setGeneratedScenes] = useState<any[]>([]);
  const [visualStyle, setVisualStyle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState("Новый проект AI");
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [productProfile, setProductProfile] = useState<ProductProfile | null>(null);
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const { send, loading } = useOpenAIChat();
  const router = useRouter();

  // Scroll to bottom of chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const extractJsonFromContent = (content: string) => {
    try {
      const match = content.match(/\`\`\`json\s([\s\S]*?)\`\`\`/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (parsed.scenes) {
          setGeneratedScenes(parsed.scenes);
        }
        if (parsed.visualStyle) {
          setVisualStyle(parsed.visualStyle);
        }
      }
    } catch (e) {
      console.error("Failed to parse JSON from response", e);
    }
  };

  /**
   * Analyzes the uploaded product image and injects semantic profile into SYSTEM_PROMPT.
   * Called immediately when product image is selected — before any chat messages.
   */
  const handleProductImageUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageUrl = reader.result as string;
      setReferenceImageUrl(imageUrl);
      setIsAnalyzingProduct(true);

      try {
        // Analyze product immediately
        const res = await fetch("/api/product-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl }),
        });

        if (res.ok) {
          const profile: ProductProfile = await res.json();
          setProductProfile(profile);

          // Build semantic context to inject into system prompt
          const semanticContext = buildSemanticContext(profile);

          // Inject semantic context into SYSTEM_PROMPT dynamically
          setMessages([
            {
              role: "system",
              content: SYSTEM_PROMPT + "\n\n" + semanticContext,
            },
          ]);

          console.log("[Step1] Product analyzed:", profile.semantic.product_category);
        } else {
          console.warn("[Step1] Product analysis failed, using base SYSTEM_PROMPT");
        }
      } catch (e) {
        console.warn("[Step1] Product analysis error:", e);
      } finally {
        setIsAnalyzingProduct(false);
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * Builds a semantic context block to inject into SYSTEM_PROMPT.
   * This tells the AI exactly what the product IS and what scenes are valid.
   */
  function buildSemanticContext(profile: ProductProfile): string {
    const s = profile.semantic;
    return `
=== PRODUCT SEMANTIC CONTEXT (MANDATORY — read carefully before generating scenes) ===
Product category: ${s.product_category}
Product purpose: ${s.product_purpose}
Problems solved: ${(s.problem_solved ?? []).join(", ")}
Application target: ${s.application_target}
Application context: ${s.application_context}

REQUIRED in every scene that uses this product:
${(s.scene_requirements ?? []).map(r => `- ${r}`).join("\n")}

VALID scene actions for this product:
${(s.valid_actions ?? []).map(a => `- ${a}`).join("\n")}

FORBIDDEN scene actions (never generate these for this product):
${(s.invalid_actions ?? []).map(a => `❌ ${a}`).join("\n")}

Location must include: ${(s.location_must_include ?? []).join(", ")}

CRITICAL: This is a ${s.product_category} product. Do NOT generate generic liquid scenes.
Do NOT generate: holding bottle randomly, pouring into hand, smelling air without context.
GENERATE: scenes that show the actual problem and product solution in the correct context (${s.application_context}).
=== END SEMANTIC CONTEXT ===`;
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading) return;

    // Check if we've already sent the image in the current conversation
    const imageAlreadySent = messages.some(m =>
      Array.isArray(m.content) && m.content.some((c: any) => c.type === "image_url")
    );

    let content: any = inputValue;
    if (referenceImageUrl && !imageAlreadySent) {
      content = [
        { type: "text", text: inputValue },
        { type: "image_url", image_url: { url: referenceImageUrl } }
      ];
    }

    const newMsg: ChatMessage = { role: "user", content };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInputValue("");

    try {
      const result = await send(updatedMessages, { model: "gpt-4o" });
      const assistantMessage = result.choices[0].message;
      setMessages([...updatedMessages, assistantMessage]);
      extractJsonFromContent(typeof assistantMessage.content === 'string' ? assistantMessage.content : JSON.stringify(assistantMessage.content));
    } catch (error: any) {
      console.error(error);
      const errorText = error?.message || "Неизвестная ошибка";
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `⚠️ **Ошибка API:** ${errorText}\n\nВозможные причины:\n- Исчерпан лимит API ключа OpenAI (ошибка 429)\n- Проблемы с сетью\n- Неверный API ключ\n\nПроверьте баланс на platform.openai.com и попробуйте снова.`,
      };
      setMessages([...updatedMessages, errorMsg]);
    }
  };

  const handleSaveProject = async () => {
    if (generatedScenes.length === 0) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          topic: messages.filter(m => m.role === 'user').map(m => m.content).join(" "),
          scenes: generatedScenes,
          scriptChatHistory: messages,
          visualStyle,
          referenceImageUrl,
          // Pass pre-analyzed productProfile so server doesn't need to re-analyze
          ...(productProfile ? { productProfile } : {}),
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const newProject = await res.json();

      // Auto-advance to next step to trigger generation
      await fetch(`/api/projects/${newProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "next" }),
      });

      // Redirect to the newly created project
      router.push(`/projects/${newProject.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // === Если проект уже создан, показываем только сцены (read-only mode для шага 1) ===
  if (project) {
    return (
      <div>
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-4">
            <Sparkles size={14} /> Шаг 1 — Сценарий
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Утвержденный сценарий</h2>
          <p className="text-sm text-muted-foreground">Вы уже сгенерировали и утвердили этот сценарий.</p>
        </div>

        <div className="grid gap-4">
          {savedScenes.map((scene) => (
            <SceneCard
              key={scene.id}
              sceneNumber={scene.order}
              title={scene.brief || undefined}
              status={approvedScenes.has(scene.id) ? "approved" : "generated"}
              onApprove={() => onApproveScene(scene.id)}
            >
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">{scene.sceneScript}</p>
                {scene.voiceoverScript && (
                  <p className="text-sm text-muted-foreground">🗣️ {scene.voiceoverScript}</p>
                )}
              </div>
            </SceneCard>
          ))}
        </div>
      </div>
    );
  }

  // === Интерфейс чата для нового проекта ===
  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="text-center mb-6 shrink-0">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-4">
          <Bot size={14} /> Чат с AI-Режиссером
        </div>
        <div className="flex justify-between items-end mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Создание сценария</h1>
            <p className="text-muted-foreground text-sm">
              Напишите тему видео и загрузите фото продукта (бутылки). AI предложит сценарий и сам поймет, где продукт должен быть в кадре.
            </p>
          </div>

          {/* Reference Image Upload */}
          <div className="flex flex-col items-end">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProductImageUpload(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] rounded-xl text-sm text-gray-300 transition-colors"
            >
            {referenceImageUrl ? (
              isAnalyzingProduct ? (
                <><Loader2 size={16} className="animate-spin text-yellow-400" /> Анализ продукта...</>
              ) : (
                <><Check size={16} className="text-green-400" /> {productProfile ? productProfile.semantic.product_category : "Продукт загружен"}</>
              )
            ) : "Загрузить фото продукта"}
            </button>
            {referenceImageUrl && (
              <div className="mt-2 w-16 h-16 rounded-lg overflow-hidden border border-white/[0.1]">
                <img src={referenceImageUrl} alt="Reference" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area (Split into Chat and Scenes Preview) */}
      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">

        {/* Chat Section */}
        <div className="flex-1 flex flex-col bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.filter(m => m.role !== "system").map((msg, i) => (
              <div key={i} className={cn("flex gap-3 max-w-[85%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", msg.role === "user" ? "bg-blue-600" : "bg-purple-600")}>
                  {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={cn("px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed",
                  msg.role === "user" ? "bg-blue-600 text-white" : "bg-white/[0.05] text-gray-200"
                )}>
                  {/* Remove JSON block from display */}
                  {(typeof msg.content === 'string' ? msg.content : msg.content.find((c: any) => c.type === 'text')?.text || "").replace(/\`\`\`json[\s\S]*?\`\`\`/, "").trim()}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                  <Bot size={16} />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white/[0.05] flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className="p-4 border-t border-white/[0.05] bg-black/20">
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Опишите ваше видео (например: Сделай видео про септик)..."
                className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none h-[52px]"
                rows={1}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || loading}
                className="h-[52px] w-[52px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center text-white transition-colors"
              >
                <Send size={20} className={cn(inputValue.trim() && !loading ? "ml-1" : "")} />
              </button>
            </div>
          </div>
        </div>

        {/* Live Scenes Preview */}
        {generatedScenes.length > 0 && (
          <div className="w-[400px] flex flex-col bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/[0.05] bg-white/[0.02] flex justify-between items-center">
              <h3 className="font-semibold text-white">Текущий сценарий</h3>
              <span className="text-xs text-muted-foreground">{generatedScenes.length} сцен</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {generatedScenes.map((scene, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs font-bold text-blue-400">Сцена {i + 1}: {scene.brief}</div>
                    {scene.requiresProductImage && (
                      <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <ImageIcon size={10} />
                        Нужен продукт
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-300 mb-3">{scene.sceneScript}</div>
                  {scene.voiceoverScript && (
                    <div className="bg-white/[0.02] rounded-lg p-2 text-sm text-gray-400 border border-white/[0.05]">
                      🗣️ "{scene.voiceoverScript}"
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/[0.05] bg-black/20">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название проекта"
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white mb-3"
              />
              <button
                onClick={handleSaveProject}
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Утвердить и продолжить
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
