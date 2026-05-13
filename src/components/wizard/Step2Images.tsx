"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectData, SceneData } from "@/types";
import SceneCard from "@/components/ui/SceneCard";
import { ImageIcon } from "lucide-react";

// Module-level lock — survives React Strict Mode unmount/remount cycles.
// Once a scene id is here, auto-start will never fire for it again during this page load.
const sceneInitLock = new Set<string>();

interface Step2Props {
  project: ProjectData;
  scenes: SceneData[];
  approvedScenes: Set<string>;
  onRegenerateScene: (sceneId: string, target: string) => Promise<void>;
  onApproveScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, data: Partial<SceneData>) => Promise<void>;
}

export default function Step2Images({
  project,
  scenes,
  approvedScenes,
  onRegenerateScene,
  onApproveScene,
}: Step2Props) {
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  const handleRegenerate = useCallback(async (sceneId: string, feedback?: string) => {
    if (regeneratingIds.has(sceneId)) return;
    setRegeneratingIds((prev) => new Set(prev).add(sceneId));
    try {
      await onRegenerateScene(sceneId, feedback ? JSON.stringify({ action: "image", feedback }) : "image");
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  }, [regeneratingIds, onRegenerateScene]);

  // Auto-start generation once per scene per page load.
  // sceneInitLock is module-level — survives Strict Mode unmount/remount.
  // Manual button clicks bypass this lock (call handleRegenerate directly from onClick).
  useEffect(() => {
    scenes.forEach(s => {
      if (!s.imageUrl && !sceneInitLock.has(s.id)) {
        sceneInitLock.add(s.id);
        handleRegenerate(s.id);
      }
    });
  }, [scenes, handleRegenerate]);

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
          <ImageIcon size={14} />
          Шаг 2 — Генерация фото
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Фотографии сцен</h2>
        <p className="text-sm text-muted-foreground">
          AI сгенерировал фотографии для каждой сцены. Перегенерируйте те, что не нравятся.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenes.map((scene) => {
          const isApproved = approvedScenes.has(scene.id);
          const isRegen = regeneratingIds.has(scene.id);

          return (
            <SceneCard
              key={scene.id}
              sceneNumber={scene.order}
              title={scene.brief || undefined}
              status={isApproved ? "approved" : isRegen ? "generating" : scene.imageUrl ? "generated" : "not_started"}
              imageUrl={scene.imageUrl || undefined}
              onRegenerate={() => handleRegenerate(scene.id)}
              onApprove={() => onApproveScene(scene.id)}
              regenerateLabel="Перегенерировать фото"
              isRegenerating={isRegen}
            >
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground/70 line-clamp-2">
                  {scene.sceneScript?.substring(0, 120)}...
                </p>
                
                {scene.voiceoverScript && (
                  <div className="relative p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 group-hover:border-violet-500/20 transition-colors">
                    <div className="absolute -top-2 left-3 px-1.5 py-0.5 rounded-md bg-violet-500 text-[9px] font-bold text-white uppercase tracking-wider">
                      Фраза
                    </div>
                    <p className="text-[13px] text-violet-100 font-medium leading-relaxed italic">
                      "{scene.voiceoverScript}"
                    </p>
                  </div>
                )}

                {scene.imagePrompt && (
                  <details className="mt-2">
                    <summary className="text-[11px] text-blue-400/60 cursor-pointer hover:text-blue-400 transition-colors">
                      Показать промпт для фото
                    </summary>
                    <p className="mt-1 text-[11px] text-muted-foreground/50 leading-relaxed">
                      {scene.imagePrompt}
                    </p>
                  </details>
                )}
              </div>
            </SceneCard>
          );
        })}
      </div>
    </div>
  );
}
