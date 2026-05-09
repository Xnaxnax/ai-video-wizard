"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectData, SceneData } from "@/types";
import SceneCard from "@/components/ui/SceneCard";
import { Wand2 } from "lucide-react";

interface Step3Props {
  project: ProjectData;
  scenes: SceneData[];
  approvedScenes: Set<string>;
  onRegenerateScene: (sceneId: string, target: string) => Promise<void>;
  onApproveScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, data: Partial<SceneData>) => Promise<void>;
}

export default function Step3AnimationPrompt({ scenes, approvedScenes, onRegenerateScene, onApproveScene }: Step3Props) {
  const [regenIds, setRegenIds] = useState<Set<string>>(new Set());

  const handleRegen = useCallback(async (id: string) => {
    if (regenIds.has(id)) return;
    setRegenIds((p) => new Set(p).add(id));
    try {
      await onRegenerateScene(id, "animationPrompt");
    } finally {
      setRegenIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [regenIds, onRegenerateScene]);

  // Auto-trigger regeneration if empty
  useEffect(() => {
    scenes.forEach(s => {
      const isGenerating = regenIds.has(s.id);
      if (!s.animationPrompt && s.imageUrl && !approvedScenes.has(s.id) && !isGenerating) {
        handleRegen(s.id);
      }
    });
  }, [scenes, approvedScenes, regenIds, handleRegen]);

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-4">
          <Wand2 size={14} /> Шаг 3 — Промпты анимации
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Промпты для анимации</h2>
        <p className="text-sm text-muted-foreground">Проверьте промпты для анимации каждой сцены.</p>
      </div>
      <div className="grid gap-4">
        {scenes.map((s) => (
          <SceneCard key={s.id} sceneNumber={s.order} title={s.brief || undefined}
            status={approvedScenes.has(s.id) ? "approved" : (regenIds.has(s.id) || !s.animationPrompt) ? "generating" : "generated"}
            imageUrl={s.imageUrl || undefined} onRegenerate={() => handleRegen(s.id)} onApprove={() => onApproveScene(s.id)}
            regenerateLabel="Перегенерировать промпт" isRegenerating={regenIds.has(s.id)}>
            <div className="space-y-2">
              <div className="text-[13px] text-white/90 bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06] font-mono leading-relaxed whitespace-pre-wrap">
                {s.animationPrompt || "Генерация..."}
              </div>
              <p className="text-xs text-muted-foreground/50 px-1">{s.sceneScript?.substring(0, 120)}</p>
            </div>
          </SceneCard>
        ))}
      </div>
    </div>
  );
}
