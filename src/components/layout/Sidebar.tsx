"use client";

import type { ProjectStep } from "@/types";
import { STEP_ORDER, STEP_META, getStepStatus, type StepStatus } from "@/core/state-machine";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Check, Lock } from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  currentStep: ProjectStep;
  projectTitle: string;
}

function StepIcon({ status, icon }: { status: StepStatus; icon: string }) {
  if (status === "completed") {
    return (
      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
        <Check size={16} strokeWidth={3} />
      </div>
    );
  }
  if (status === "current") {
    return (
      <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-lg animate-pulse shadow-lg shadow-blue-500/10">
        {icon}
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground/50">
      <Lock size={14} />
    </div>
  );
}

export default function Sidebar({ currentStep, projectTitle }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Не показываем COMPLETED в sidebar
  const visibleSteps = STEP_ORDER.filter((s) => s !== "COMPLETED");

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300 ease-in-out",
        "bg-gradient-to-b from-[#0c1222] to-[#080f1a] border-r border-white/[0.06]",
        collapsed ? "w-[72px]" : "w-[280px]"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                AI
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-white truncate">Video Wizard</h1>
                <p className="text-[11px] text-muted-foreground truncate">{projectTitle}</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold mx-auto">
              AI
            </div>
          )}
        </div>
      </div>

      {/* Steps */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {visibleSteps.map((step, idx) => {
            const meta = STEP_META[step];
            const status = getStepStatus(step, currentStep);
            const isLast = idx === visibleSteps.length - 1;

            return (
              <div key={step} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      "absolute left-[18px] top-[44px] w-[2px] h-[12px]",
                      collapsed && "left-[35px]",
                      status === "completed"
                        ? "bg-emerald-500/30"
                        : status === "current"
                        ? "bg-blue-500/20"
                        : "bg-white/[0.06]"
                    )}
                  />
                )}

                <div
                  className={cn(
                    "flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-200",
                    status === "current" &&
                      "bg-blue-500/[0.08] border border-blue-500/20",
                    status === "completed" &&
                      "opacity-70",
                    status === "locked" &&
                      "opacity-40 cursor-not-allowed"
                  )}
                >
                  <StepIcon status={status} icon={meta.icon} />

                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          status === "current" && "text-white",
                          status === "completed" && "text-muted-foreground",
                          status === "locked" && "text-muted-foreground/60"
                        )}
                      >
                        {meta.shortLabel}
                      </p>
                      {status === "current" && (
                        <p className="text-[11px] text-blue-400/70 truncate mt-0.5">
                          {meta.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Toggle */}
      <div className="p-3 border-t border-white/[0.06]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors text-xs"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </aside>
  );
}
