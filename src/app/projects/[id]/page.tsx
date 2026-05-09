"use client";

import { useState, useCallback, useEffect, use } from "react";
import type { ProjectData, SceneData } from "@/types";
import Sidebar from "@/components/layout/Sidebar";
import StepNavigation from "@/components/layout/StepNavigation";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import Step1Script from "@/components/wizard/Step1Script";
import Step2Images from "@/components/wizard/Step2Images";
import Step3AnimationPrompt from "@/components/wizard/Step3AnimationPrompt";
import Step4Animation from "@/components/wizard/Step4Animation";
import Step7Stitch from "@/components/wizard/Step7Stitch";

function WizardContent({ initialProjectId }: { initialProjectId?: string }) {
    const [project, setProject] = useState<ProjectData | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [approvedScenes, setApprovedScenes] = useState<Set<string>>(new Set());
    const { addToast } = useToast();

    // Load initial project if navigating directly to a project URL
    useEffect(() => {
        if (initialProjectId && !project) {
            fetch(`/api/projects/${initialProjectId}`)
                .then(res => res.json())
                .then(data => {
                    if (!data.error) {
                        setProject(data);
                        // Восстанавливаем утвержденные сцены из БД
                        const approved = new Set(
                            data.scenes
                                .filter((s: any) => s.finalApproved)
                                .map((s: any) => s.id)
                        );
                        setApprovedScenes(approved);
                    }
                })
                .catch(err => console.error("Failed to load project:", err));
        }
    }, [initialProjectId, project]);

    const createProject = useCallback(async (title: string, topic: string) => {
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, topic }),
            });
            if (!res.ok) throw new Error("Failed");
            const data = await res.json();
            setProject(data);
            setApprovedScenes(new Set());
            addToast("Проект создан! Сценарий сгенерирован.", "success");
        } catch {
            addToast("Ошибка при создании проекта", "error");
        }
    }, [addToast]);

    const navigate = useCallback(async (direction: "next" | "back") => {
        if (!project?.id) return;
        setIsNavigating(true);
        try {
            const res = await fetch(`/api/projects/${project.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direction }),
            });
            if (!res.ok) throw new Error("Navigation failed");
            const data = await res.json();
            setProject(data);
            setApprovedScenes(new Set());
            addToast(direction === "next" ? "Переход на следующий этап" : "Возврат на предыдущий этап", "info");
        } catch {
            addToast("Ошибка навигации", "error");
        } finally {
            setIsNavigating(false);
        }
    }, [project, addToast]);

    const regenerateScene = useCallback(async (sceneId: string, target: string) => {
        try {
            let body: any = { target };

            // If target is a JSON string (feedback), parse it
            if (target.startsWith("{")) {
                try {
                    const parsed = JSON.parse(target);
                    body = {
                        target: parsed.action || "image",
                        feedback: parsed.feedback
                    };
                } catch (e) {
                    console.error("Failed to parse target JSON:", e);
                }
            }

            const res = await fetch(`/api/scenes/${sceneId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error("Regeneration failed");
            const updatedScene = await res.json();
            setProject((prev) => {
                if (!prev) return prev;
                return { ...prev, scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...updatedScene } : s)) };
            });
            setApprovedScenes((prev) => { const n = new Set(prev); n.delete(sceneId); return n; });
            addToast("Перегенерация завершена", "success");
        } catch {
            addToast("Ошибка перегенерации", "error");
        }
    }, [addToast]);

    const updateScene = useCallback(async (sceneId: string, data: Partial<SceneData>) => {
        try {
            const res = await fetch(`/api/scenes/${sceneId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Update failed");
            const updatedScene = await res.json();
            setProject((prev) => {
                if (!prev) return prev;
                return { ...prev, scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...updatedScene } : s)) };
            });
        } catch {
            addToast("Ошибка обновления", "error");
        }
    }, [addToast]);

    const approveScene = useCallback((sceneId: string) => {
        setApprovedScenes((prev) => new Set(prev).add(sceneId));
        // Сохраняем статус утверждения на сервере
        updateScene(sceneId, { finalApproved: true });
    }, [updateScene]);

    // Опрос состояния проекта для отслеживания фоновой генерации
    useEffect(() => {
        if (!project?.id || isNavigating) return;

        const generationSteps: string[] = ["IMAGE_GENERATION", "ANIMATION_GENERATION"];
        const needsPolling = generationSteps.includes(project.currentStep);

        if (!needsPolling) return;

        // Проверяем есть ли сцены, которые ещё в процессе (не завершены и не упали)
        const allDone = project.scenes.every(s => {
            if (project.currentStep === "IMAGE_GENERATION") return !!s.imageUrl;
            if (project.currentStep === "ANIMATION_GENERATION") {
                // Сцена завершена если: есть видео, ИЛИ статус FAILED (упало — дальше ждать нет смысла)
                return !!s.videoUrl || s.animationStatus === "FAILED";
            }
            return true;
        });

        // Также проверяем есть ли хоть одна сцена в PENDING статусе
        const hasPending = project.currentStep === "ANIMATION_GENERATION" &&
            project.scenes.some(s => s.animationStatus === "PENDING");

        if (allDone && !hasPending) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/projects/${project.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setProject(data);
                }
            } catch (err) {
                console.error("Polling error:", err);
            }
        }, 5000); // Опрашиваем каждые 5 секунд (видео генерируется 2-10 минут)

        return () => clearInterval(interval);
    }, [project?.id, project?.currentStep, project?.scenes, isNavigating]);

    const allApproved = project ? project.scenes.every((s) => approvedScenes.has(s.id)) : false;

    function renderStep() {
        if (!project) {
            return <Step1Script project={null} scenes={[]} approvedScenes={approvedScenes}
                onCreateProject={createProject} onRegenerateScene={regenerateScene} onApproveScene={approveScene} />;
        }
        const p = { project, scenes: project.scenes, approvedScenes, onRegenerateScene: regenerateScene, onApproveScene: approveScene, onUpdateScene: updateScene };
        switch (project.currentStep) {
            case "SCRIPT_GENERATION": return <Step1Script {...p} onCreateProject={createProject} />;
            case "IMAGE_GENERATION": return <Step2Images {...p} />;
            case "ANIMATION_GENERATION": return <Step4Animation {...p} />;
            case "FINAL_STITCH":
            case "COMPLETED": return <Step7Stitch {...p} />;
            default: return <div>Unknown step: {project.currentStep}</div>;
        }
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar currentStep={project?.currentStep || "SCRIPT_GENERATION"} projectTitle={project?.title || "Новый проект"} />
            <main className="flex-1 ml-[280px] pb-24">
                <div className="max-w-6xl mx-auto px-8 py-8">{renderStep()}</div>
            </main>
            {project && (
                <StepNavigation currentStep={project.currentStep} allScenesApproved={allApproved}
                    onBack={() => navigate("back")} onNext={() => navigate("next")} isLoading={isNavigating} />
            )}
        </div>
    );
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <ToastProvider><WizardContent initialProjectId={id === "new" ? undefined : id} /></ToastProvider>;
}
