"use client";

import dynamic from "next/dynamic";

// Загружаем страницу проекта напрямую как главную для MVP
const ProjectPage = dynamic(() => import("@/app/projects/[id]/page"), { ssr: false });

export default function Home() {
  const mockParams = Promise.resolve({ id: "new" });
  return <ProjectPage params={mockParams} />;
}
