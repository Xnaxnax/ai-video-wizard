"use client";

import { useState } from "react";
import type { ProjectData, SceneData } from "@/types";
import { Download, RefreshCw, Loader2, CheckCircle2, Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step7Props {
  project: ProjectData;
  scenes: SceneData[];
  approvedScenes: Set<string>;
  onRegenerateScene: (sceneId: string, target: string) => Promise<void>;
  onApproveScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, data: Partial<SceneData>) => Promise<void>;
}

export default function Step7Stitch({ project, scenes }: Step7Props) {
  const [isStitching, setIsStitching] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Проверка готовности всех видео
  const pendingScenes = scenes.filter(s => s.animationStatus === "PENDING" || !s.videoUrl);
  const failedScenes = scenes.filter(s => s.animationStatus === "FAILED");
  const allReady = pendingScenes.length === 0 && failedScenes.length === 0;

  const handleStitch = async () => {
    if (!allReady) return;
    setIsStitching(true);
    setProgress(0);
    // ... остальная логика склейки
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) { clearInterval(interval); return 95; }
        return p + Math.random() * 15;
      });
    }, 500);

    try {
      await new Promise((r) => setTimeout(r, 4000));
      clearInterval(interval);
      setProgress(100);
      setFinalVideoUrl(`/mock/videos/final-${project.id}.mp4`);
    } catch {
      clearInterval(interval);
    } finally {
      setIsStitching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
          <Film size={14} /> Шаг 7 — Финальная сборка
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Сборка итогового видео</h2>
        <p className="text-sm text-muted-foreground">
          {allReady 
            ? "Все сцены готовы! Склейте их в одно финальное видео."
            : "Дождитесь завершения анимации всех сцен перед сборкой."}
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Сводка проекта</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <span className="text-muted-foreground/60 text-xs">Проект</span>
            <p className="text-white font-medium">{project.title}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground/60 text-xs">Сцен</span>
            <p className="text-white font-medium">{scenes.length}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground/60 text-xs">Тема</span>
            <p className="text-white/80">{project.topic}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground/60 text-xs">Статус</span>
            <p className={cn("font-medium", allReady ? "text-emerald-400" : "text-amber-400")}>
              {allReady ? "Готов к сборке" : `Ожидание (${pendingScenes.length} в процессе)`}
            </p>
          </div>
        </div>
      </div>

      {/* Scenes list with status */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Готовность сцен</h3>
        <div className="space-y-2">
          {scenes.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
              <span className="w-6 h-6 rounded bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                {s.order}
              </span>
              <span className="text-sm text-white/80 flex-1 truncate">{s.brief}</span>
              {s.videoUrl && s.animationStatus === "COMPLETED" ? (
                <CheckCircle2 size={14} className="text-emerald-400" />
              ) : s.animationStatus === "FAILED" ? (
                <div className="flex items-center gap-1 text-red-400 text-[10px]">
                  <Loader2 size={12} className="text-red-400" /> Ошибка
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-400 text-[10px]">
                  <Loader2 size={12} className="animate-spin" /> В процессе
                </div>
              )}
            </div>
          ))}
        </div>
        {failedScenes.length > 0 && (
          <p className="text-xs text-red-400 mt-3 flex items-center gap-1">
            ⚠️ {failedScenes.length} сцен(ы) не удалось анимировать. Попробуйте перегенерировать их на шаге 4.
          </p>
        )}
      </div>

      {/* Stitch controls */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6">
        {!finalVideoUrl && !isStitching && (
          <button 
            onClick={handleStitch}
            disabled={!allReady}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-sm transition-all",
              allReady 
                ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-xl shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.01]" 
                : "bg-white/5 text-muted-foreground cursor-not-allowed border border-white/10"
            )}>
            🎬 Склеить финальное видео
          </button>
        )}

        {isStitching && (
          <div className="text-center space-y-4">
            <Loader2 size={32} className="animate-spin text-blue-400 mx-auto" />
            <p className="text-sm text-white">Сборка видео...</p>
            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
                style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
          </div>
        )}

        {finalVideoUrl && (
          <div className="space-y-4">
            <div className="aspect-video rounded-xl bg-black/30 border border-white/[0.06] flex items-center justify-center">
              <div className="text-center">
                <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-white font-medium">Видео собрано!</p>
                <p className="text-xs text-muted-foreground mt-1">{finalVideoUrl}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <a href={finalVideoUrl} download
                className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium",
                  "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all")}>
                <Download size={16} /> Скачать видео
              </a>
              <button onClick={() => { setFinalVideoUrl(null); handleStitch(); }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 transition-all">
                <RefreshCw size={16} /> Пересобрать
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
