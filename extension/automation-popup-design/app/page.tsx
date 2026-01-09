import { AutomationProvider } from "@/components/automation-provider"
import { ProjectProvider } from "@/components/project-provider"
import { AppContainer } from "@/components/app-container"

export default function Page() {
  return (
    <ProjectProvider>
      <AutomationProvider>
        <AppContainer />
      </AutomationProvider>
    </ProjectProvider>
  )
}
