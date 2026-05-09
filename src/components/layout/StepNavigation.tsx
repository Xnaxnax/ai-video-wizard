"use client";

import type { ProjectStep } from "@/types";
import { canGoBack, canAdvance, STEP_META, getNextStep } from "@/core/state-machine";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenAIChat, ChatMessage } from "@/lib/useOpenAIChat";
import { useState } from "react";

interface StepNavigationProps {
  currentStep: ProjectStep;
  allScenesApproved: boolean;
  onBack: () => void;
  onNext: () => void;
  isLoading?: boolean;
}

export default function StepNavigation({
  currentStep,
  allScenesApproved,
  onBack,
  onNext,
  isLoading = false,
}: StepNavigationProps) {
  const { send, loading, error } = useOpenAIChat();
  const [script, setScript] = useState<string>('');
  const showBack = canGoBack(currentStep);
  const showNext = canAdvance(currentStep);
  const nextStep = getNextStep(currentStep);

  const currentMeta = STEP_META[currentStep] || { label: "Unknown", shortLabel: "??", description: "", icon: "" };
  const nextMeta = nextStep ? STEP_META[nextStep] : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.06] bg-[#080f1a]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col">
        <div className="flex items-center justify-between">
          {/* Back button */}
          <div>
            {showBack && (
              <button
                onClick={onBack}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  "text-muted-foreground hover:text-white hover:bg-white/5",
                  "border border-white/10 hover:border-white/20",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <ArrowLeft size={16} />
                Назад
              </button>
            )}
          </div>

          {/* Status */}
          <div className="text-xs text-muted-foreground">
            {currentMeta.label}
            {!allScenesApproved && showNext && (
              <span className="ml-2 text-amber-400/80">• Утвердите все сцены</span>
            )}
          </div>

          {/* Next button */}
          <div>
            {showNext && (
              <button
                onClick={onNext}
                disabled={!allScenesApproved || isLoading}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  allScenesApproved
                    ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.02]"
                    : "bg-white/5 text-muted-foreground/50 cursor-not-allowed border border-white/5",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                )}
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    {nextMeta ? `Далее: ${nextMeta.shortLabel}` : "Завершить"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Generate Script Button */}
        <div className="mt-4 flex items-center space-x-4">
          <button
            onClick={async () => {
              const messages: ChatMessage[] = [
                { role: 'system', content: 'You are an assistant that creates concise video scripts.' },
                { role: 'user', content: 'Generate a short script for a 30‑second AI video about "smart home automation".' }
              ];
              try {
                const data = await send(messages, { model: 'gpt-4o-mini', temperature: 0.8 });
                const generated = data.choices[0].message.content;
                setScript(typeof generated === 'string' ? generated : JSON.stringify(generated));
              } catch {
              }
            }}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded hover:opacity-90 transition"
          >
            {loading ? 'Generating...' : 'Generate Script'}
          </button>
          {error && <span className="text-red-300">Error: {error}</span>}
        </div>
        {script && (
          <pre className="mt-4 p-4 bg-white/10 rounded overflow-x-auto whitespace-pre-wrap text-sm">
            {script}
          </pre>
        )}
      </div>
    </div>
  );
}
