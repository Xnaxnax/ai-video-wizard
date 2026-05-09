"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectData, SceneData } from "@/types";
import SceneCard from "@/components/ui/SceneCard";
import { Film } from "lucide-react";

interface Step4Props {
  project: ProjectData;
  scenes: SceneData[];
  approvedScenes: Set<string>;
  onRegenerateScene: (sceneId: string, target: string) => Promise<void>;
  onApproveScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, data: Partial<SceneData>) => Promise<void>;
}

export default function Step4Animation({ project, scenes, approvedScenes, onRegenerateScene, onApproveScene }: Step4Props) {
  const [regenIds, setRegenIds] = useState<Set<string>>(new Set());

  const handleRegen = useCallback(async (id: string) => {
    if (regenIds.has(id)) return;
    setRegenIds((p) => new Set(p).add(id));
    try {
      await onRegenerateScene(id, "animation");
    } finally {
      setRegenIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [regenIds, onRegenerateScene]);

  // Автоматический запуск анимации для сцен, где есть фото и промпт, но нет видео и статуса
  useEffect(() => {
    scenes.forEach(s => {
      const isGenerating = s.animationStatus === "PENDING" || regenIds.has(s.id);
      if (s.imageUrl && s.animationPrompt && !s.videoUrl && s.animationStatus !== "FAILED" && !isGenerating) {
        handleRegen(s.id);
      }
    });
  }, [scenes, regenIds, handleRegen]);

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium mb-4">
          <Film size={14} /> Шаг 4 — Анимация сцен
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Видео сцен</h2>
        <p className="text-sm text-muted-foreground">AI анимирует фотографии. Просмотрите и утвердите каждую сцену.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenes.map((s) => {
          const isApproved = approvedScenes.has(s.id);
          const isRegen = regenIds.has(s.id);
          const isPending = s.animationStatus === "PENDING";
          const isFailed = s.animationStatus === "FAILED";

          let status: any = "not_started";
          if (isRegen || isPending) status = "generating";
          else if (isApproved) status = "approved";
          else if (isFailed) status = "failed";
          else if (s.videoUrl) status = "generated";

          return (
            <div key={s.id} className="relative">
              <SceneCard sceneNumber={s.order} title={s.brief || undefined}
                status={status}
                videoUrl={s.videoUrl || undefined} imageUrl={s.imageUrl || undefined}
                onRegenerate={() => handleRegen(s.id)} onApprove={() => onApproveScene(s.id)}
                regenerateLabel={s.videoUrl ? "Переанимировать" : "Анимировать"} 
                isRegenerating={isRegen || isPending}>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground/60 line-clamp-2">{s.animationPrompt}</p>
                  {s.animationError && (
                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 leading-tight">
                      <strong>Ошибка:</strong> {s.animationError}
                    </div>
                  )}
                </div>
              </SceneCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}
