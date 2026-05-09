"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, Check, AlertCircle, Loader2, Play, Volume2 } from "lucide-react";

export type SceneCardStatus = "not_started" | "generating" | "generated" | "approved" | "failed";

interface SceneCardProps {
  sceneNumber: number;
  title?: string;
  status: SceneCardStatus;
  children: React.ReactNode;
  onRegenerate?: (feedback?: string) => void;
  onApprove?: () => void;
  regenerateLabel?: string;
  isRegenerating?: boolean;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  productOverlayUrl?: string;
}

function StatusBadge({ status }: { status: SceneCardStatus }) {
  const config: Record<SceneCardStatus, { label: string; className: string; icon: React.ReactNode }> = {
    not_started: {
      label: "Ожидает",
      className: "bg-white/5 text-muted-foreground border-white/10",
      icon: null,
    },
    generating: {
      label: "Генерация...",
      className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    generated: {
      label: "Готово",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      icon: null,
    },
    approved: {
      label: "Утверждено",
      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: <Check size={12} />,
    },
    failed: {
      label: "Ошибка",
      className: "bg-red-500/10 text-red-400 border-red-500/20",
      icon: <AlertCircle size={12} />,
    },
  };

  const c = config[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border", c.className)}>
      {c.icon}
      {c.label}
    </span>
  );
}

export default function SceneCard({
  sceneNumber,
  title,
  status,
  children,
  onRegenerate,
  onApprove,
  regenerateLabel = "Перегенерировать",
  isRegenerating = false,
  imageUrl,
  videoUrl,
  audioUrl,
  productOverlayUrl,
}: SceneCardProps) {
  const [feedback, setFeedback] = React.useState("");

  return (
    <div
      className={cn(
        "relative group rounded-2xl border transition-all duration-300",
        "bg-gradient-to-b from-white/[0.04] to-transparent",
        status === "approved"
          ? "border-emerald-500/20 shadow-lg shadow-emerald-500/5"
          : status === "generating"
          ? "border-blue-500/20 shadow-lg shadow-blue-500/5"
          : status === "failed"
          ? "border-red-500/20"
          : "border-white/[0.08] hover:border-white/[0.15]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.06] text-xs font-bold text-muted-foreground">
            {sceneNumber}
          </span>
          {title && (
            <h3 className="text-sm font-semibold text-white truncate max-w-[200px]">
              {title}
            </h3>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Media preview */}
      {(imageUrl || videoUrl) && (
        <div className="px-5 pt-4">
          <div className="relative rounded-xl overflow-hidden bg-black/20 aspect-[9/16] max-w-[280px] mx-auto border border-white/5">
            {videoUrl ? (
              <video
                src={videoUrl}
                poster={imageUrl}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={`Сцена ${sceneNumber}`}
                className="w-full h-full object-cover"
              />
            ) : null}
            
            {/* Digital Product Overlay */}
            {productOverlayUrl && (
              <div className="absolute bottom-4 right-[-10px] w-2/5 aspect-[1/1.5] rounded-xl overflow-hidden shadow-2xl shadow-black/50 border-4 border-white/10 rotate-[-5deg] bg-black/40 backdrop-blur-sm animate-in fade-in slide-in-from-right-8 duration-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={productOverlayUrl} 
                  alt="Product Overlay" 
                  className="w-full h-full object-contain p-1"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audio indicator */}
      {audioUrl && (
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <Volume2 size={14} className="text-blue-400" />
            <div className="flex-1 h-1 rounded-full bg-white/10">
              <div className="w-1/3 h-full rounded-full bg-blue-500/50" />
            </div>
            <span className="text-[11px] text-muted-foreground">0:00</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-5 py-4">{children}</div>

      {/* Actions */}
      {(onRegenerate || onApprove) && (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {onRegenerate && status !== "not_started" && (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <textarea
                placeholder="Что исправить? (например: 'открой люк', 'сделай бутылку меньше')"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full bg-transparent border-none text-[11px] text-white placeholder:text-muted-foreground/40 focus:ring-0 resize-none min-h-[40px] p-0"
              />
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-[10px] text-muted-foreground/40 italic">
                  Напишите пожелание и нажмите кнопку ниже
                </span>
                <button
                  onClick={() => {
                    onRegenerate(feedback);
                    setFeedback("");
                  }}
                  disabled={isRegenerating || status === "generating"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200",
                    "bg-white/5 text-white hover:bg-white/10 border border-white/10",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <RefreshCw size={10} className={isRegenerating ? "animate-spin" : ""} />
                  Исправить по описанию
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {onRegenerate && (
              <button
                onClick={() => onRegenerate()}
                disabled={isRegenerating || status === "generating"}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200",
                  "border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 hover:border-white/20",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <RefreshCw size={12} className={isRegenerating && !feedback ? "animate-spin" : ""} />
                {regenerateLabel}
              </button>
            )}
            {onApprove && status !== "approved" && status !== "generating" && status !== "not_started" && (
              <button
                onClick={onApprove}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200",
                  "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400",
                  "hover:bg-emerald-500/20 hover:border-emerald-500/30 ml-auto"
                )}
              >
                <Check size={12} />
                Утвердить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
