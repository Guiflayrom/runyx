"use client"

import { useProject } from "./project-provider"
import { ProjectSelector } from "./project-selector"
import { AutomationStudio } from "./automation-studio"

export function AppContainer() {
  const { selectedProjectId, hydrated } = useProject()

  if (!hydrated) {
    return <div className="h-screen w-screen bg-background" />
  }

  if (!selectedProjectId) {
    return <ProjectSelector />
  }

  return (
    <div className="h-screen w-screen bg-background">
      <AutomationStudio />
    </div>
  )
}
