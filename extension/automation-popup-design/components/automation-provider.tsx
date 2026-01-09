"use client"

import { useState, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { AutomationContext, initialWorkflows } from "@/lib/automation-store"
import {
  defaultWaitConfig,
  defaultExtractConfig,
  defaultScreenshotConfig,
  defaultEvaluateConfig,
  defaultTriggerRunPolicy,
} from "@/lib/automation-types"
import type {
  Workflow,
  Step,
  ConditionalBlock,
  Trigger,
  Run,
  WorkflowSettings,
  ScreenshotConfig,
  ScrollConfig,
  EvaluateConfig,
  TriggerType,
  BrowserEventConfig,
  DomConditionConfig,
  ScheduleConfig,
} from "@/lib/automation-types"
import { applyRequestTemplate, resolveValueFromSource, executeRequestWithRetry } from "@/lib/request-utils"
import { useProject, DEFAULT_PROJECT_ID } from "./project-provider"
import { isUrlAllowed } from "@/lib/allowed-sites"

declare const chrome: any

const STORAGE_KEY = "runyx:automation-state"
const RUNNER_LOG_PREFIX = "[runner]"

/**
 * RPC helper: sandbox (iframe) -> ui-bridge -> service worker
 * Requires your ui-bridge.js to forward {__fromSandbox:true, requestId, payload}
 * and SW to handle SANDBOX_RPC.
 */
function sandboxRpc(payload: any): Promise<any> {
  const requestId = crypto.randomUUID()

  window.parent.postMessage({ __fromSandbox: true, requestId, payload }, "*")

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (!msg?.__fromExtension) return
      if (msg.requestId !== requestId) return

      window.removeEventListener("message", handler)
      if (msg.error) reject(new Error(msg.error))
      else resolve(msg.response)
    }

    window.addEventListener("message", handler)
  })
}

export function useAutomation() {
  const context = useContext(AutomationContext)
  if (!context) {
    throw new Error("useAutomation must be used within AutomationProvider")
  }
  return context
}

export function AutomationProvider({ children }: { children: ReactNode }) {
  const { projects, selectedProjectId, addWorkflowToProject, removeWorkflowFromProject } = useProject()
  const [workflowsByProject, setWorkflowsByProject] = useState<Record<string, Workflow[]>>({
    [DEFAULT_PROJECT_ID]: initialWorkflows,
  })
  const [selectedWorkflowByProject, setSelectedWorkflowByProject] = useState<Record<string, string>>({
    [DEFAULT_PROJECT_ID]: initialWorkflows[0]?.id ?? "",
  })
  const [isPicking, setIsPicking] = useState(false)
  const [pickedSelector, setPickedSelector] = useState<string | null>(null)
  const [onPickComplete, setOnPickComplete] = useState<((selector: string) => void) | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isRunnerActive, setIsRunnerActive] = useState(false)
  const activeRunsRef = useRef<Map<string, { workflowId: string; stopFlag: { current: boolean } }>>(new Map())
  const [lastKnownTab, setLastKnownTab] = useState<{ id?: number; url?: string }>({})
  const browserRunOnceRef = useRef<Set<string>>(new Set())
  const browserLastFiredRef = useRef<Map<string, number>>(new Map())
  const wsConnectionsRef = useRef<Map<string, WebSocket>>(new Map())
  const wsMetaRef = useRef<Map<string, { endpoint: string; reconnectTimer?: ReturnType<typeof setTimeout> }>>(
    new Map(),
  )
  const wsDedupeRef = useRef<Map<string, number>>(new Map())
  const [wsRestartTick, setWsRestartTick] = useState(0)
  const activeProjectId = selectedProjectId ?? DEFAULT_PROJECT_ID
  const workflows = workflowsByProject[activeProjectId] ?? []
  const selectedWorkflowId = selectedWorkflowByProject[activeProjectId] ?? workflows[0]?.id ?? ""

  const ensureProjectBucket = useCallback((projectId: string) => {
    setWorkflowsByProject((prev) => (prev[projectId] ? prev : { ...prev, [projectId]: [] }))
    setSelectedWorkflowByProject((prev) => (prev[projectId] ? prev : { ...prev, [projectId]: "" }))
  }, [])

  const findProjectForWorkflow = useCallback(
    (workflowId: string) => {
      return projects.find((p) => p.workflowIds.includes(workflowId))?.id ?? activeProjectId
    },
    [projects, activeProjectId],
  )

  const updateWorkflowsForProject = useCallback((projectId: string, updater: (current: Workflow[]) => Workflow[]) => {
    setWorkflowsByProject((prev) => {
      const current = prev[projectId] ?? []
      const updated = updater(current)
      return { ...prev, [projectId]: updated }
    })
  }, [])

  const mutateWorkflow = useCallback(
    (workflowId: string, mutate: (workflow: Workflow) => Workflow) => {
      const projectId = findProjectForWorkflow(workflowId)
      updateWorkflowsForProject(projectId, (current) => current.map((w) => (w.id === workflowId ? mutate(w) : w)))
    },
    [findProjectForWorkflow, updateWorkflowsForProject],
  )

  const isWorkflowActive = useCallback((workflow: Workflow) => workflow.status !== "paused", [])

  const buildRunStepsSnapshot = useCallback((workflow: Workflow) => {
    return workflow.steps.map((s) => ({
      id: typeof s === "object" && "id" in s ? (s as any).id : crypto.randomUUID(),
      name: typeof s === "object" && "name" in s ? (s as any).name : "Step",
      status: "pending" as const,
      duration: "-",
    }))
  }, [])

  const setWorkflowsForProject = useCallback(
    (projectId: string, newWorkflows: Workflow[]) => {
      updateWorkflowsForProject(projectId, () => newWorkflows)
      setSelectedWorkflowByProject((prev) => ({ ...prev, [projectId]: newWorkflows[0]?.id ?? "" }))
    },
    [updateWorkflowsForProject],
  )

  const getWorkflowsForProject = useCallback((projectId: string) => workflowsByProject[projectId] ?? [], [workflowsByProject])

  /**
   * Receive "push" messages coming from ui-bridge.js which forwards chrome.runtime.onMessage.
   * Expects: { __fromExtension:true, push:true, message:{type,...}, sender }
   */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (!msg?.__fromExtension || !msg.push) return

      if (msg.message?.type === "automation:pick:done") {
        const selector = msg.message.selector as string
        setPickedSelector(selector)
        onPickComplete?.(selector)
        setOnPickComplete(null)
        setIsPicking(false)
      }

      if (msg.message?.type === "automation:pick:cancel") {
        setPickedSelector(null)
        setOnPickComplete(null)
        setIsPicking(false)
      }
    }

    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [onPickComplete])

  /**
   * Start picking on the active tab by sending a message to contentScript.js.
   * (Content script must listen for {type:"picker:start"} and then send automation:pick:done/cancel)
   */
  useEffect(() => {
    if (!isPicking) return

    ;(async () => {
      try {
        const q = await sandboxRpc({
          type: "tabs.query",
          query: { active: true, lastFocusedWindow: true },
        })

        const tabId = q?.tabs?.[0]?.id ?? lastKnownTab.id
        const tabUrl = q?.tabs?.[0]?.url ?? lastKnownTab.url
        if (tabId) {
          setLastKnownTab({ id: tabId, url: tabUrl })
        }
        if (!tabId) {
          setIsPicking(false)
          setOnPickComplete(null)
          return
        }

        await sandboxRpc({
          type: "tabs.sendMessage",
          tabId,
          message: { type: "picker:start" },
        })
      } catch (e) {
        console.error("[picker] failed to start", e)
        setIsPicking(false)
        setOnPickComplete(null)
      }
    })()
  }, [isPicking, lastKnownTab])

  // Garante que sempre haja um bucket para o projeto ativo apos hidratar
  useEffect(() => {
    if (!hydrated) return
    ensureProjectBucket(activeProjectId)
  }, [activeProjectId, ensureProjectBucket, hydrated])

  // Hidrata estado salvo do chrome.storage.local (via SW)
  useEffect(() => {
    ;(async () => {
      try {
        const res = await sandboxRpc({ type: "storage.get", keys: [STORAGE_KEY] })
        const saved = res?.data?.[STORAGE_KEY]
        if (saved?.workflowsByProject && typeof saved.workflowsByProject === "object") {
          setWorkflowsByProject((prev) => ({ ...prev, ...saved.workflowsByProject }))
        }
        if (saved?.selectedWorkflowByProject && typeof saved.selectedWorkflowByProject === "object") {
          setSelectedWorkflowByProject((prev) => ({ ...prev, ...saved.selectedWorkflowByProject }))
        }
        if (typeof saved?.isRunnerActive === "boolean") {
          setIsRunnerActive(saved.isRunnerActive)
        }
      } catch (err) {
        console.warn("[storage] failed to load automation state", err)
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  // Garante que sempre haja um workflow selecionado apos hidratar/alterar projeto
  useEffect(() => {
    if (!hydrated) return
    const projectWorkflows = workflowsByProject[activeProjectId] ?? []
    const currentSelection = selectedWorkflowByProject[activeProjectId]
    const exists = currentSelection ? projectWorkflows.some((w) => w.id === currentSelection) : false
    const fallback = projectWorkflows[0]?.id ?? ""
    if (!exists && fallback !== currentSelection) {
      setSelectedWorkflowByProject((prev) => ({ ...prev, [activeProjectId]: fallback }))
    }
  }, [hydrated, activeProjectId, selectedWorkflowByProject, workflowsByProject])

  // Persiste automaticamente quando workflows ou seleǹǭo mudam
  useEffect(() => {
    if (!hydrated) return
    const payload = {
      [STORAGE_KEY]: {
        workflowsByProject,
        selectedWorkflowByProject,
        isRunnerActive,
      },
    }
    sandboxRpc({ type: "storage.set", data: payload }).catch((err) =>
      console.warn("[storage] failed to persist automation state", err),
    )
  }, [hydrated, isRunnerActive, selectedWorkflowByProject, workflowsByProject])

  const setSelectedWorkflowId = useCallback(
    (id: string) => {
      setSelectedWorkflowByProject((prev) => ({ ...prev, [activeProjectId]: id }))
    },
    [activeProjectId],
  )

  const getWorkflow = useCallback(
    (id: string) => {
      const projectId = findProjectForWorkflow(id)
      const bucket = workflowsByProject[projectId] ?? []
      return bucket.find((w) => w.id === id)
    },
    [findProjectForWorkflow, workflowsByProject],
  )

  const updateWorkflow = useCallback(
    (id: string, updates: Partial<Workflow>) => {
      mutateWorkflow(id, (w) => ({ ...w, ...updates, updatedAt: Date.now() }))
    },
    [mutateWorkflow],
  )

  const addWorkflow = useCallback(
    (workflow: Workflow) => {
      updateWorkflowsForProject(activeProjectId, (prev) => {
        if (prev.some((w) => w.id === workflow.id)) return prev
        return [...prev, workflow]
      })
      setSelectedWorkflowByProject((prev) => ({ ...prev, [activeProjectId]: workflow.id }))
      addWorkflowToProject(activeProjectId, workflow.id)
    },
    [activeProjectId, addWorkflowToProject, updateWorkflowsForProject],
  )

  const deleteWorkflow = useCallback(
    (id: string) => {
      const projectId = findProjectForWorkflow(id)
      let fallback = ""
      updateWorkflowsForProject(projectId, (prev) => {
        const next = prev.filter((w) => w.id !== id)
        fallback = next[0]?.id ?? ""
        return next
      })
      setSelectedWorkflowByProject((prev) => {
        if (prev[projectId] === id) {
          return { ...prev, [projectId]: fallback }
        }
        return prev
      })
      removeWorkflowFromProject(projectId, id)
    },
    [findProjectForWorkflow, removeWorkflowFromProject, updateWorkflowsForProject],
  )

  const addStep = useCallback(
    (workflowId: string, step: Step | ConditionalBlock) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        return {
          ...w,
          steps: [...w.steps, step],
          updatedAt: Date.now(),
        }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const updateStep = useCallback(
    (workflowId: string, stepId: string, updates: Partial<Step | ConditionalBlock>) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        return {
          ...w,
          steps: w.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
          updatedAt: Date.now(),
        }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const deleteStep = useCallback(
    (workflowId: string, stepId: string) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        return {
          ...w,
          steps: w.steps.filter((s) => s.id !== stepId),
          updatedAt: Date.now(),
        }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const reorderSteps = useCallback(
    (workflowId: string, fromIndex: number, toIndex: number) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        const newSteps = [...w.steps]
        const [removed] = newSteps.splice(fromIndex, 1)
        newSteps.splice(toIndex, 0, removed)
        return { ...w, steps: newSteps, updatedAt: Date.now() }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const addTrigger = useCallback(
    (workflowId: string, trigger: Trigger) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        return {
          ...w,
          triggers: [...w.triggers, trigger],
          updatedAt: Date.now(),
        }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const updateTrigger = useCallback(
    (workflowId: string, triggerId: string, updates: Partial<Trigger>) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        return {
          ...w,
          triggers: w.triggers.map((t) => (t.id === triggerId ? { ...t, ...updates } : t)),
          updatedAt: Date.now(),
        }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const deleteTrigger = useCallback(
    (workflowId: string, triggerId: string) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        return {
          ...w,
          triggers: w.triggers.filter((t) => t.id !== triggerId),
          updatedAt: Date.now(),
        }
      })
    },
    [isWorkflowActive, mutateWorkflow],
  )

  const addRun = useCallback(
    (workflowId: string, run: Run) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        runs: [run, ...w.runs],
        // NOTE: keep this as the source of truth for replay. When integrating the real runner,
        // persist the complete step timeline here so replay can re-use it even after updates.
        runCount: w.runCount + 1,
        lastRun: "Just now",
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const updateRun = useCallback(
    (workflowId: string, runId: string, updates: Partial<Run>) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        runs: w.runs.map((r) => (r.id === runId ? { ...r, ...updates } : r)),
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const deleteRun = useCallback(
    (workflowId: string, runId: string) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        runs: w.runs.filter((r) => r.id !== runId),
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const clearRuns = useCallback(
    (workflowId: string) => {
      mutateWorkflow(workflowId, (w) => ({ ...w, runs: [], updatedAt: Date.now() }))
    },
    [mutateWorkflow],
  )

  const updateSettings = useCallback(
    (workflowId: string, settings: Partial<WorkflowSettings>) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        settings: { ...w.settings, ...settings },
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const restartWebsocket = useCallback((workflowId: string) => {
    const existing = wsConnectionsRef.current.get(workflowId)
    if (existing) {
      try {
        existing.close()
      } catch (err) {
        console.warn("[ws] failed to close existing connection", err)
      }
      wsConnectionsRef.current.delete(workflowId)
    }
    const meta = wsMetaRef.current.get(workflowId)
    if (meta?.reconnectTimer) {
      clearTimeout(meta.reconnectTimer)
    }
    wsMetaRef.current.delete(workflowId)
    updateSettings(workflowId, { wsConnected: false, wsConnectRequested: true })
    setWsRestartTick((t) => t + 1)
  }, [])

  const addAllowedSite = useCallback(
    (workflowId: string, site: { host: string; favicon: string }) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        settings: { ...w.settings, allowedSites: [...w.settings.allowedSites, site] },
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const removeAllowedSite = useCallback(
    (workflowId: string, host: string) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        settings: { ...w.settings, allowedSites: w.settings.allowedSites.filter((s) => s.host !== host) },
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const addStepToBlock = useCallback(
    (workflowId: string, blockId: string, branch: "if" | "else", step: Step) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        const newSteps = w.steps.map((s) => {
          if (s.id === blockId && s.type === "if-else") {
            const block = s as ConditionalBlock
            return branch === "if"
              ? { ...block, ifSteps: [...block.ifSteps, step] }
              : { ...block, elseSteps: [...block.elseSteps, step] }
          }
          return s
        })
        return { ...w, steps: newSteps, updatedAt: Date.now() }
      })
    },
    [mutateWorkflow],
  )

  const deleteStepFromBlock = useCallback(
    (workflowId: string, blockId: string, branch: "if" | "else", stepId: string) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        const newSteps = w.steps.map((s) => {
          if (s.id === blockId && s.type === "if-else") {
            const block = s as ConditionalBlock
            return branch === "if"
              ? { ...block, ifSteps: block.ifSteps.filter((st) => st.id !== stepId) }
              : { ...block, elseSteps: block.elseSteps.filter((st) => st.id !== stepId) }
          }
          return s
        })
        return { ...w, steps: newSteps, updatedAt: Date.now() }
      })
    },
    [mutateWorkflow],
  )

  const updateStepInBlock = useCallback(
    (workflowId: string, blockId: string, branch: "if" | "else", stepId: string, updates: Partial<Step>) => {
      mutateWorkflow(workflowId, (w) => {
        if (isWorkflowActive(w)) return w
        const newSteps = w.steps.map((s) => {
          if (s.id === blockId && s.type === "if-else") {
            const block = s as ConditionalBlock
            return branch === "if"
              ? { ...block, ifSteps: block.ifSteps.map((st) => (st.id === stepId ? { ...st, ...updates } : st)) }
              : { ...block, elseSteps: block.elseSteps.map((st) => (st.id === stepId ? { ...st, ...updates } : st)) }
          }
          return s
        })
        return { ...w, steps: newSteps, updatedAt: Date.now() }
      })
    },
    [mutateWorkflow],
  )

  const setVariable = useCallback(
    (workflowId: string, key: string, value: string) => {
      mutateWorkflow(workflowId, (w) => ({
        ...w,
        variables: { ...w.variables, [key]: value },
        updatedAt: Date.now(),
      }))
    },
    [mutateWorkflow],
  )

  const deleteVariable = useCallback(
    (workflowId: string, key: string) => {
      mutateWorkflow(workflowId, (w) => {
        const newVars = { ...w.variables }
        delete newVars[key]
        return { ...w, variables: newVars, updatedAt: Date.now() }
      })
    },
    [mutateWorkflow],
  )

  const startRunner = useCallback(() => {
    setIsRunnerActive(true)
  }, [])

  const stopRunner = useCallback(() => {
    setIsRunnerActive(activeRunsRef.current.size > 0)
  }, [])

  const requestStopRunner = useCallback(() => {
    activeRunsRef.current.forEach((entry) => {
      entry.stopFlag.current = true
    })
    setIsRunnerActive(activeRunsRef.current.size > 0)
  }, [])

  const runWorkflow = useCallback(
    async (workflowId: string, opts?: { trigger?: Run["trigger"]; context?: Partial<Run["context"]> }) => {
      const wf = getWorkflow(workflowId)
      if (!wf) return

      const triggerSource: Run["trigger"] = opts?.trigger ?? "manual"
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const stopFlag = { current: false }
      activeRunsRef.current.set(runId, { workflowId, stopFlag })
      setIsRunnerActive(true)

      const maxGlobalRetries = Math.max(0, wf.settings?.maxRetries ?? 0)
      const baseRuntimeVars = { ...(wf.variables || {}) }
      let tabId: number | undefined = opts?.context?.tabId
      let tabUrl: string | undefined = opts?.context?.url
      let runtimeVars = { ...baseRuntimeVars }

      const normalizeVarName = (key?: string) => {
        if (!key) return ""
        return key.trim().replace(/^vars\./i, "")
      }

      const buildTemplateContext = (stepObj?: Step) => {
        const now = Date.now()
        const iso = new Date(now).toISOString()
        return {
          vars: runtimeVars,
          workflowId: wf.id,
          workflowName: wf.name,
          workflow: wf.name,
          date: iso.slice(0, 10),
          stepName: stepObj?.name,
          step: stepObj?.name || stepObj?.id,
          stepId: stepObj?.id,
          url: tabUrl ?? lastKnownTab.url,
          timestamp: Math.floor(now / 1000),
          timestampMs: now,
          isoTimestamp: iso,
        }
      }

      const buildScreenshotFileName = (template: string | undefined, format: "png" | "jpeg", ctx: Record<string, any>) => {
        const applied = applyRequestTemplate(template || "", ctx).trim()
        const fallback = `screenshot_${ctx.timestamp || Math.floor(Date.now() / 1000)}`
        const baseName = applied || fallback
        const sanitized = baseName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/\.+$/, "")
        const ext = format === "jpeg" ? "jpg" : "png"
        const withExt = sanitized.toLowerCase().endsWith(`.${ext}`) ? sanitized : `${sanitized}.${ext}`
        return withExt
      }

      const uploadScreenshotToServer = async (
        cfg: ScreenshotConfig,
        shot: { dataUrl: string; base64: string; fileName: string; width?: number; height?: number },
        ctx: Record<string, any>,
      ) => {
        if (!cfg.serverUpload?.enabled) return
        const serverCfg = cfg.serverUpload
        const url = applyRequestTemplate(serverCfg.url, ctx).trim()
        if (!url) throw new Error("Upload URL is required")

        const dataField = serverCfg.dataField || "screenshot"
        const headers = (serverCfg.headers || []).reduce<Record<string, string>>((acc, h) => {
          const key = applyRequestTemplate(h.key, ctx).trim()
          if (!key) return acc
          acc[key] = applyRequestTemplate(h.value, ctx)
          return acc
        }, {})
        const hasContentType = Object.keys(headers).some((h) => h.toLowerCase() === "content-type")

        const uploadCtx = {
          ...ctx,
          dataField,
          data: shot.base64,
          dataUrl: shot.dataUrl,
          fileName: shot.fileName,
          format: cfg.format,
          width: shot.width,
          height: shot.height,
        }

        let body: string
        if (serverCfg.bodyTemplate) {
          body = applyRequestTemplate(serverCfg.bodyTemplate, uploadCtx)
        } else {
          body = JSON.stringify({
            [dataField]: shot.base64,
            fileName: shot.fileName,
            format: cfg.format,
            width: shot.width,
            height: shot.height,
            timestamp: ctx.timestampMs ?? Date.now(),
          })
        }

        const resp = await fetch(url, {
          method: serverCfg.method || "POST",
          headers: {
            ...(hasContentType ? {} : { "Content-Type": "application/json" }),
            ...headers,
          },
          body,
        })

        if (!resp.ok) {
          let respText = ""
          try {
            respText = await resp.text()
          } catch {
            /* ignore */
          }
          const suffix = respText ? `: ${respText}` : ""
          throw new Error(`Upload failed with status ${resp.status}${suffix}`)
        }
      }

      type StepActionResult = { action: "continue" | "jump" | "stop"; nextIndex?: number }

      try {
      const startedAt = Date.now()
      let runnerStarted = false
      let runCreated = false

      const executeRun = async (attempt: number): Promise<Run["status"]> => {
        let runStatus: Run["status"] = "running"
        let runError: string | undefined

      try {
        if (!tabId || !tabUrl) {
          const q = await sandboxRpc({
            type: "tabs.query",
            query: { active: true, lastFocusedWindow: true },
          })
          tabId = tabId ?? q?.tabs?.[0]?.id
          tabUrl = tabUrl ?? q?.tabs?.[0]?.url
        }
        setLastKnownTab({ id: tabId, url: tabUrl })
      } catch (err) {
        console.warn(RUNNER_LOG_PREFIX, "failed to query tabs", err)
      }

        let stepsState = buildRunStepsSnapshot(wf)

        const allowedCheck = isUrlAllowed(tabUrl ?? lastKnownTab.url, wf.settings?.allowedSites)
        if (!allowedCheck.allowed) {
          const reason = allowedCheck.reason || "Current site is not in the allowed list."
          console.warn(RUNNER_LOG_PREFIX, "blocked by allowedSites", { reason, target: allowedCheck.target })
          if (runCreated) {
            const endedAt = Date.now()
            updateRun(workflowId, runId, {
              status: "failed",
              steps: stepsState,
              endTime: endedAt,
              duration: `${((endedAt - startedAt) / 1000).toFixed(2)}s`,
              error: reason,
            })
          } else if (typeof window !== "undefined") {
            alert(reason)
          }
          return "failed"
        }

        if (!runnerStarted) {
          startRunner()
          runnerStarted = true
        }

        if (!runCreated) {
          const baseRun: Run = {
            id: runId,
            workflowId: wf.id,
            status: "running",
            trigger: triggerSource,
            startTime: startedAt,
            steps: stepsState,
            context: {
              url: tabUrl ?? opts?.context?.url,
              tabId: tabId ?? opts?.context?.tabId,
              variables: runtimeVars,
            },
            artifacts: [],
          }
          addRun(workflowId, baseRun)
          runCreated = true
        } else {
          updateRun(workflowId, runId, {
            status: "running",
            steps: stepsState,
            error: undefined,
            context: {
              url: tabUrl ?? opts?.context?.url,
              tabId: tabId ?? opts?.context?.tabId,
              variables: runtimeVars,
            },
          })
        }

      const updateStepStatus = (stepId: string, status: Run["steps"][number]["status"], duration?: string, error?: string) => {
        stepsState = stepsState.map((s) => {
          if (s.id !== stepId) return s
          return { ...s, status, duration: duration ?? s.duration, error }
        })
        updateRun(workflowId, runId, { steps: stepsState })
        if (error && !runError) {
          runError = error
        }
      }

      const markCancelled = () => {
        stepsState = stepsState.map((s) =>
          s.status === "pending" || s.status === "running" ? { ...s, status: "skipped", error: "Cancelled" } : s,
        )
        runStatus = "cancelled"
        updateRun(workflowId, runId, { steps: stepsState })
      }

      const sendStepToContent = async (stepPayload: any, opts?: { targetTabId?: number }) => {
        let targetTabId = opts?.targetTabId ?? tabId ?? lastKnownTab.id
        if (!targetTabId) {
          throw new Error("No tab available to run this step. Click the extension icon on the target page first.")
        }
        const res = await sandboxRpc({
          type: "tabs.sendMessage",
          tabId: targetTabId,
          message: { type: "automation:run:step", step: stepPayload },
        })
        // Unwrap the inner response from contentScript (res.res)
        return res?.res ?? res
      }

      const waitForTabNavigation = (
        targetTabId: number,
        expectedUrl: string,
        timeoutMs: number,
        initialUrl?: string,
      ) => {
        return new Promise<string>((resolve, reject) => {
          const startedAt = Date.now()
          const matchesExpectedUrl = (candidate: string) => {
            if (!candidate) return false
            if (candidate === expectedUrl) return true
            if (candidate.startsWith(expectedUrl)) return true
            try {
              const expected = new URL(expectedUrl)
              const actual = new URL(candidate)
              if (expected.origin === actual.origin && actual.pathname.startsWith(expected.pathname)) {
                return true
              }
            } catch {
              /* ignore parse errors */
            }
            return false
          }

          const cleanup = (
            handler: (event: MessageEvent) => void,
            timer: ReturnType<typeof setTimeout>,
            poller: ReturnType<typeof setInterval>,
          ) => {
            window.removeEventListener("message", handler)
            clearTimeout(timer)
            clearInterval(poller)
          }

          const handler = (event: MessageEvent) => {
            const msg = event.data
            if (!msg?.__fromExtension || !msg.push) return
            if (msg.message?.type !== "automation:browserEvent") return
            const payload = msg.message
            if (payload.tabId !== targetTabId) return
            if (payload.event !== "navigation:completed" && payload.event !== "tabs:updated") return
            if (!payload.url) return
            const urlChanged = initialUrl ? payload.url !== initialUrl : true
            if (!matchesExpectedUrl(payload.url) && !urlChanged) return

            cleanup(handler, timer, poller)
            resolve(payload.url)
          }

          const timer = setTimeout(() => {
            cleanup(handler, timer, poller)
            const waited = Date.now() - startedAt
            reject(new Error(`Navigation timed out after ${waited}ms`))
          }, Math.max(1000, timeoutMs))

          const poller = setInterval(() => {
            ;(async () => {
              try {
                const res = await sandboxRpc({ type: "tabs.query", query: {} })
                const tabs = (res as any)?.tabs || []
                const targetTab = tabs.find((t: any) => t?.id === targetTabId)
                const currentUrl = targetTab?.url
                if (!currentUrl) return
                const urlChanged = initialUrl ? currentUrl !== initialUrl : true
                if (matchesExpectedUrl(currentUrl) || urlChanged) {
                  cleanup(handler, timer, poller)
                  resolve(currentUrl)
                }
              } catch {
                /* ignore polling errors */
              }
            })()
          }, 350)

          window.addEventListener("message", handler)
        })
      }

      const performAtomicStep = async (
        stepObj: Step,
        finishDuration: () => string,
        handleFailure: (message: string) => Promise<StepActionResult>,
        updateStatus: (status: Run["steps"][number]["status"], duration?: string, error?: string) => void,
        nextIndexOnSuccess: number,
      ): Promise<StepActionResult> => {
        if (stepObj.type === "goTo") {
          const ctx = buildTemplateContext(stepObj)
          const resolvedUrl = applyRequestTemplate(stepObj.goToUrl || "", ctx).trim()
          if (!resolvedUrl) {
            return handleFailure("Target URL is required")
          }

          const allowedCheck = isUrlAllowed(resolvedUrl, wf.settings?.allowedSites)
          if (!allowedCheck.allowed) {
            return handleFailure(allowedCheck.reason || "Target URL is not in the allowed list.")
          }

          const targetTabId = tabId ?? lastKnownTab.id
          if (!targetTabId) {
            return handleFailure("No tab available to navigate. Click the extension icon on the target page first.")
          }

          const navigationPromise = waitForTabNavigation(
            targetTabId,
            resolvedUrl,
            typeof stepObj.timeout === "number" ? stepObj.timeout : 15000,
            tabUrl,
          )

          await sandboxRpc({
            type: "tabs.update",
            tabId: targetTabId,
            updateProperties: { url: resolvedUrl },
          })

          const navigatedUrl = await navigationPromise
          tabUrl = navigatedUrl || resolvedUrl
          setLastKnownTab({ id: targetTabId, url: tabUrl })
          updateStatus("success", finishDuration())
          return { action: "continue", nextIndex: nextIndexOnSuccess }
        }

        if (stepObj.type === "click") {
          const selector = (stepObj as any).selector
          if (!selector) {
            return handleFailure("Missing selector")
          }

          const stepRes = await sendStepToContent({
            type: "click",
            selector,
            clickMode: (stepObj as any).clickMode,
            timeout: (stepObj as any).timeout,
          })
          if (stepRes?.ok) {
            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }
          return handleFailure(stepRes?.error || "Click failed")
        }

        if (stepObj.type === "wait") {
          const waitConfig = {
            ...defaultWaitConfig,
            ...stepObj.waitConfig,
            selector: stepObj.waitConfig?.selector ?? stepObj.selector,
          }
          const stepRes = await sendStepToContent({
            type: "wait",
            waitConfig,
            timeout: stepObj.timeout ?? waitConfig.timeMs ?? 5000,
          })
          if (stepRes?.ok) {
            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }
          return handleFailure(stepRes?.error || "Wait failed")
        }

        if (stepObj.type === "type") {
          if (!stepObj.selector) {
            return handleFailure("Missing selector")
          }

          const valueToType = stepObj.valueSource
            ? await resolveValueFromSource(stepObj.valueSource, buildTemplateContext(stepObj))
            : stepObj.value ?? ""
          const stepRes = await sendStepToContent({
            type: "type",
            selector: stepObj.selector,
            value: valueToType ?? "",
          })
          if (stepRes?.ok) {
            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }
          return handleFailure(stepRes?.error || "Type failed")
        }

        if (stepObj.type === "select") {
          if (!stepObj.selector) {
            return handleFailure("Missing selector")
          }

          let optionValue = stepObj.value ?? ""
          try {
            optionValue = stepObj.valueSource
              ? await resolveValueFromSource(stepObj.valueSource, buildTemplateContext(stepObj))
              : stepObj.value ?? ""
          } catch (err: any) {
            return handleFailure(err?.message || String(err))
          }

          const stepRes = await sendStepToContent({
            type: "select",
            selector: stepObj.selector,
            value: optionValue ?? "",
            timeout: stepObj.timeout ?? 5000,
          })

          if (stepRes?.ok) {
            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }
          return handleFailure(stepRes?.error || "Select failed")
        }

        if (stepObj.type === "scroll") {
          const cfg: ScrollConfig = {
            scrollType: "toSelector",
            behavior: "smooth",
            ...stepObj.scrollConfig,
            selector: stepObj.scrollConfig?.selector || stepObj.selector,
          }

          const needsSelector = cfg.scrollType === "toSelector" || cfg.scrollType === "intoView"
          if (needsSelector && !cfg.selector) {
            return handleFailure("Selector is required for this scroll type")
          }

          const stepRes = await sendStepToContent({
            type: "scroll",
            config: cfg,
            scrollConfig: cfg,
            selector: cfg.selector,
            timeout: stepObj.timeout ?? 5000,
          })

          if (stepRes?.ok) {
            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }

          return handleFailure(stepRes?.error || "Scroll failed")
        }

        if (stepObj.type === "evaluate") {
          type PreparedArg = EvaluateConfig["args"][number] & { resolvedValue: any }
          const cfg: EvaluateConfig = {
            ...defaultEvaluateConfig,
            ...(stepObj.evaluateConfig || {}),
          }
          const ctx = buildTemplateContext(stepObj)
          const code = applyRequestTemplate(cfg.code || "", ctx).trim()

          if (!code) {
            return handleFailure("Code is required for evaluate")
          }

          const resolveEvaluateTargetTabId = async () => {
            if (cfg.target === "specificTab") {
              const raw = applyRequestTemplate(cfg.specificTabId || "", ctx).trim()
              const parsed = Number(raw)
              if (!Number.isFinite(parsed)) throw new Error("Invalid tab id for evaluate")
              return parsed
            }
            if (cfg.target === "anyTabMatchingScope") {
              const regexStr = (cfg.scopeUrlRegex || "").trim()
              if (!regexStr) throw new Error("Scope regex is required for tab matching")
              const q = await sandboxRpc({ type: "tabs.query", scopeUrlRegex: regexStr })
              const tabs = (q as any)?.tabs || []
              const match = tabs.find((t: any) => t?.url && new RegExp(regexStr).test(t.url))
              if (!match?.id) throw new Error("No tab matches the provided scope regex")
              return match.id
            }
            return undefined
          }

          const parseArgValue = (arg: EvaluateConfig["args"][number], idx: number) => {
            const rawValue = applyRequestTemplate(arg.value ?? "", ctx)
            const name = arg.name?.trim() || `arg${idx + 1}`
            try {
              switch (arg.type) {
                case "number": {
                  const num = Number(rawValue)
                  if (!Number.isFinite(num)) throw new Error("Expected a number")
                  return { name, rawValue, value: num }
                }
                case "boolean": {
                  const val = String(rawValue).trim().toLowerCase()
                  if (["true", "1", "yes", "on"].includes(val)) return { name, rawValue, value: true }
                  if (["false", "0", "no", "off", ""].includes(val)) return { name, rawValue, value: false }
                  return { name, rawValue, value: Boolean(rawValue) }
                }
                case "json": {
                  return { name, rawValue, value: JSON.parse(rawValue || "null") }
                }
                case "string":
                default:
                  return { name, rawValue, value: rawValue }
              }
            } catch (err: any) {
              const msg = err?.message || String(err)
              throw new Error(`Argument "${name}" is invalid: ${msg}`)
            }
          }

          const preparedArgs: PreparedArg[] = []
          if (cfg.mode !== "expression") {
            for (const [idx, arg] of (cfg.args || []).entries()) {
              const parsed = parseArgValue(arg, idx)
              preparedArgs.push({
                ...arg,
                name: parsed.name,
                value: parsed.rawValue,
                resolvedValue: parsed.value,
              })
            }
          }

          const validateResult = (value: any): { ok: boolean; error?: string } => {
            if (cfg.expect === "string" && typeof value !== "string") {
              return { ok: false, error: "Expected a string result" }
            }
            if (cfg.expect === "number" && !(typeof value === "number" && Number.isFinite(value))) {
              return { ok: false, error: "Expected a number result" }
            }
            if (cfg.expect === "boolean" && typeof value !== "boolean") {
              return { ok: false, error: "Expected a boolean result" }
            }
            if (cfg.expect === "object" && (value === null || Array.isArray(value) || typeof value !== "object")) {
              return { ok: false, error: "Expected an object result" }
            }
            if (cfg.expect === "array" && !Array.isArray(value)) {
              return { ok: false, error: "Expected an array result" }
            }
            if (cfg.failOnFalsy && !value) {
              return { ok: false, error: "Result is falsy" }
            }
            return { ok: true }
          }

          const runInBackground = async () => {
            const argNames = preparedArgs.map((a, idx) => a.name?.trim() || `arg${idx + 1}`)
            const argValues = preparedArgs.map((a) => a.resolvedValue)
            try {
              let result: any
              if (cfg.mode === "function") {
                let candidateFn: any
                try {
                  candidateFn = new Function(`return (${code});`)()
                } catch {
                  candidateFn = null
                }
                const fn =
                  typeof candidateFn === "function" ? candidateFn : new Function(...argNames, code)
                result = await Promise.resolve(fn(...argValues))
              } else {
                const exprFn = new Function(...argNames, `return (${code});`)
                result = await Promise.resolve(exprFn(...argValues))
              }
              const validation = validateResult(result)
              if (!validation.ok) {
                return { ok: false, error: validation.error, result }
              }
              return { ok: true, result }
            } catch (err: any) {
              return { ok: false, error: err?.message || String(err) }
            }
          }

          const evaluatePayload = { ...cfg, code, args: preparedArgs }
          let targetTabId: number | undefined
          try {
            targetTabId = await resolveEvaluateTargetTabId()
          } catch (err: any) {
            return handleFailure(err?.message || String(err))
          }

          const stepRes = await sendStepToContent(
            {
              type: "evaluate",
              config: evaluatePayload,
              evaluateConfig: evaluatePayload,
              vars: runtimeVars,
            },
            { targetTabId },
          )

          let ok = !!stepRes?.ok
          const resultValue = (stepRes as any)?.result
          let errorMessage = (stepRes as any)?.error || "Evaluate failed"
          if (ok) {
            const validation = validateResult(resultValue)
            if (!validation.ok) {
              ok = false
              errorMessage = validation.error || errorMessage
            }
          }

          const saveKey = normalizeVarName(cfg.saveAs || (stepObj as any).saveTo)
          const shouldSave = saveKey && (ok || !cfg.saveOnlyIfOk)
          if (shouldSave) {
            const serialized =
              typeof resultValue === "string" ? resultValue : JSON.stringify(resultValue ?? "")
            setVariable(workflowId, saveKey, serialized)
            runtimeVars = { ...runtimeVars, [saveKey]: serialized }
          }

          if (ok) {
            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }

          return handleFailure(errorMessage)
        }

        if (stepObj.type === "request") {
          const ctx = buildTemplateContext(stepObj)
          const url = applyRequestTemplate(stepObj.serverUrl, ctx).trim()
          if (!url) {
            return handleFailure("Request URL is required")
          }

          try {
            const result = await executeRequestWithRetry({
              url,
              method: stepObj.requestMethod || "GET",
              contentType: applyRequestTemplate(stepObj.requestContentType, ctx),
              headers: (stepObj.headers || [])
                .map((h) => ({
                  key: applyRequestTemplate(h.key, ctx).trim(),
                  value: applyRequestTemplate(h.value, ctx),
                }))
                .filter((h) => h.key),
              body: applyRequestTemplate(stepObj.requestBody, ctx),
              responseJsonPath: applyRequestTemplate(stepObj.responseJsonPath, ctx),
              retry: { enabled: false, maxRetries: 0, conditionType: "jsonField" },
            })

            if (result.status >= 400) {
              return handleFailure(`Request failed with status ${result.status}`)
            }

            if (stepObj.saveTo) {
              const varKey = normalizeVarName(stepObj.saveTo)
              if (varKey) {
                const valueToSave = result.extracted ?? result.json ?? result.text ?? ""
                const serialized =
                  typeof valueToSave === "string" ? valueToSave : JSON.stringify(valueToSave ?? "")
                setVariable(workflowId, varKey, serialized)
                runtimeVars = { ...runtimeVars, [varKey]: serialized }
              }
            }

            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          } catch (err: any) {
            return handleFailure(err?.message || String(err))
          }
        }

        if (stepObj.type === "sendCookies") {
          const ctx = buildTemplateContext(stepObj)
          const url = applyRequestTemplate(stepObj.serverUrl, ctx).trim()
          if (!url) {
            return handleFailure("Server URL is required")
          }

          const headers = (stepObj.headers || [])
            .map((h) => ({
              key: applyRequestTemplate(h.key, ctx).trim(),
              value: applyRequestTemplate(h.value, ctx),
            }))
            .filter((h) => h.key)

          const cookieAll = stepObj.cookieAll !== false
          const cookieDomain = stepObj.cookieDomain || undefined
          const cookieNames = (stepObj.cookieNames || []).filter(Boolean)

          try {
            const resp = await sandboxRpc({
              type: "cookies.sendToServer",
              serverUrl: url,
              method: stepObj.requestMethod || "POST",
              headers,
              cookieAll,
              cookieDomain,
              cookieNames,
              tabId,
              tabUrl,
            })

            if (resp?.ok) {
              updateStatus("success", finishDuration())
              return { action: "continue", nextIndex: nextIndexOnSuccess }
            }

            const errorMsg = resp?.error || `Cookie send failed (status ${resp?.status ?? "?"})`
            return handleFailure(errorMsg)
          } catch (err: any) {
            return handleFailure(err?.message || String(err))
          }
        }

        if (stepObj.type === "sendPageSource") {
          const ctx = buildTemplateContext(stepObj)
          const url = applyRequestTemplate(stepObj.serverUrl, ctx).trim()
          if (!url) {
            return handleFailure("Server URL is required")
          }

          const headers = (stepObj.headers || [])
            .map((h) => ({
              key: applyRequestTemplate(h.key, ctx).trim(),
              value: applyRequestTemplate(h.value, ctx),
            }))
            .filter((h) => h.key)

          const method = stepObj.requestMethod && ["POST", "PUT"].includes(stepObj.requestMethod) ? stepObj.requestMethod : "POST"

          try {
            const resp = await sandboxRpc({
              type: "pageSource.sendToServer",
              serverUrl: url,
              method,
              headers,
              tabId,
              tabUrl,
            })

            if (resp?.ok) {
              updateStatus("success", finishDuration())
              return { action: "continue", nextIndex: nextIndexOnSuccess }
            }

            const errorMsg = resp?.error || `Page source send failed (status ${resp?.status ?? "?"})`
            return handleFailure(errorMsg)
          } catch (err: any) {
            return handleFailure(err?.message || String(err))
          }
        }

        if (stepObj.type === "extract") {
          const cfg = {
            ...defaultExtractConfig,
            ...(stepObj.extractConfig || {}),
            selector: stepObj.extractConfig?.selector || stepObj.selector || "",
          }

          if (!cfg.selector) {
            return handleFailure("Selector is required for extract")
          }

          const stepRes = await sendStepToContent({
            type: "extract",
            config: cfg,
            selector: cfg.selector,
            timeout: stepObj.timeout ?? 5000,
          })

          if (stepRes?.ok) {
            const saveKey = normalizeVarName(cfg.saveAs || stepObj.saveTo)
            if (saveKey) {
              const valueToSave =
                stepRes.value !== undefined
                  ? stepRes.value
                  : stepRes.values !== undefined
                    ? stepRes.values
                    : stepRes.rawValues !== undefined
                      ? stepRes.rawValues
                      : ""
              const serialized =
                typeof valueToSave === "string" ? valueToSave : JSON.stringify(valueToSave ?? "", null, 2)
              setVariable(workflowId, saveKey, serialized)
              runtimeVars = { ...runtimeVars, [saveKey]: serialized }
            }

            updateStatus("success", finishDuration())
            return { action: "continue", nextIndex: nextIndexOnSuccess }
          }

          return handleFailure(stepRes?.error || "Extract failed")
        }

        if (stepObj.type === "screenshot") {
          const cfg: ScreenshotConfig = {
            ...defaultScreenshotConfig,
            ...(stepObj.screenshotConfig || {}),
            selector: stepObj.screenshotConfig?.selector || stepObj.selector || "",
          }

          const ctx = { ...buildTemplateContext(stepObj), fileNameTemplate: cfg.fileNameTemplate }
          const fileName = buildScreenshotFileName(cfg.fileNameTemplate, cfg.format, ctx)
          const failScreenshot = async (message: string) => {
            if (cfg.onFail === "continue") {
              updateStatus("skipped", finishDuration(), message || "Screenshot skipped")
              return { action: "continue", nextIndex: nextIndexOnSuccess }
            }
            return handleFailure(message)
          }

          const stepRes = await sendStepToContent({
            type: "screenshot",
            config: cfg,
            screenshotConfig: cfg,
            selector: cfg.selector,
            fileName,
          })

          if (!stepRes?.ok || !stepRes.dataUrl) {
            return failScreenshot(stepRes?.error || "Screenshot failed")
          }

          const dataUrl: string = stepRes.dataUrl
          const base64 = stepRes.base64 || (typeof dataUrl === "string" && dataUrl.includes(",") ? dataUrl.split(",")[1] : "")

          try {
            await uploadScreenshotToServer(
              cfg,
              { dataUrl, base64, fileName, width: stepRes.width, height: stepRes.height },
              { ...ctx, fileName },
            )
          } catch (err: any) {
            return failScreenshot(err?.message || String(err))
          }

          try {
            if (cfg.saveTo === "downloads") {
              await sandboxRpc({ type: "download.dataUrl", dataUrl, fileName })
            } else if (cfg.saveTo === "varsBase64") {
              const varKey = normalizeVarName(cfg.saveAs || stepObj.saveTo || "screenshot")
              if (varKey) {
                setVariable(workflowId, varKey, base64)
                runtimeVars = { ...runtimeVars, [varKey]: base64 }
              }
            } else if (cfg.saveTo === "runnerArtifacts") {
              const wfSnapshot = getWorkflow(workflowId)
              const run = wfSnapshot?.runs.find((r) => r.id === runId)
              const artifacts = run?.artifacts || []
              const artifact = {
                id: `${runId}-screenshot-${Date.now()}`,
                type: "screenshot" as const,
                name: fileName,
                dataUrl,
                createdAt: Date.now(),
                width: stepRes.width,
                height: stepRes.height,
              }
              updateRun(workflowId, runId, { artifacts: [...artifacts, artifact] })
            }
          } catch (err: any) {
            return failScreenshot(err?.message || String(err))
          }

          updateStatus("success", finishDuration())
          return { action: "continue", nextIndex: nextIndexOnSuccess }
        }

        updateStatus("skipped", finishDuration(), "Not implemented yet")
        return { action: "continue", nextIndex: nextIndexOnSuccess }
      }

      const runBranchSteps = async (
        blockId: string,
        stepsToRun: Step[],
        branchLabel: "IF" | "ELSE",
      ): Promise<{ status: "success" | "failed" | "cancelled"; error?: string }> => {
        const branchIndexMap = new Map<string, number>()
        stepsToRun.forEach((s, i) => {
          const sid = (s as any).id || `${blockId}-${branchLabel}-${i}`
          branchIndexMap.set(sid, i)
        })

        let branchIdx = 0
        const maxBranchIterations = stepsToRun.length * 5 || 5
        let lastBranchError: string | undefined

        while (branchIdx < stepsToRun.length && branchIdx < maxBranchIterations) {
          if (stopFlag.current) {
            return { status: "cancelled" }
          }

          const branchStep = stepsToRun[branchIdx]
          const branchStepId = (branchStep as any).id || `${blockId}-${branchLabel}-${branchIdx}`
          const branchStart = Date.now()
          const finishBranchDuration = () => `${((Date.now() - branchStart) / 1000).toFixed(2)}s`
          const branchEntryId = `${blockId}:${branchStepId}:${branchLabel}`

          const updateBranchStatus = (
            status: Run["steps"][number]["status"],
            duration?: string,
            error?: string,
          ) => {
            const entry = { id: branchEntryId, name: `${branchLabel} > ${branchStep.name}`, status, duration, error }
            const existingIdx = stepsState.findIndex((s) => s.id === branchEntryId)
            if (existingIdx >= 0) {
              stepsState = stepsState.map((s, idx) => (idx === existingIdx ? { ...s, ...entry } : s))
            } else {
              stepsState = [...stepsState, { ...entry, duration: duration ?? "-" }]
            }
            updateRun(workflowId, runId, { steps: stepsState })
            if (error && !runError) {
              runError = error
            }
            if (error) {
              lastBranchError = error
            }
          }

          if ((branchStep as any).enabled === false) {
            updateBranchStatus("skipped", finishBranchDuration(), "Disabled")
            branchIdx += 1
            continue
          }

          const handleBranchFailure = async (message: string): Promise<StepActionResult> => {
            const onFailure = (branchStep as any).onFailure || "stop"
            const gotoStepId = (branchStep as any).gotoStep
            const fallbackCode = (branchStep as any).fallbackCode

            if (onFailure === "skip") {
              updateBranchStatus("skipped", finishBranchDuration(), message || "Skipped")
              return { action: "continue", nextIndex: branchIdx + 1 }
            }

            if (onFailure === "goto") {
              const targetIdx = gotoStepId ? branchIndexMap.get(gotoStepId) : undefined
              if (targetIdx === undefined || targetIdx === branchIdx) {
                updateBranchStatus("failed", finishBranchDuration(), message || "Goto target not found")
                return { action: "stop" }
              }
              updateBranchStatus("skipped", finishBranchDuration(), message || "Jumping to another step")
              return { action: "jump", nextIndex: targetIdx }
            }

            if (onFailure === "fallback") {
              if (!fallbackCode) {
                updateBranchStatus("failed", finishBranchDuration(), message || "Fallback code missing")
                return { action: "stop" }
              }
              try {
                const fallbackRes = await sendStepToContent({ type: "fallback", code: fallbackCode })
                if (fallbackRes?.ok) {
                  updateBranchStatus("success", finishBranchDuration(), "Fallback executed")
                  return { action: "continue", nextIndex: branchIdx + 1 }
                }
                updateBranchStatus("failed", finishBranchDuration(), fallbackRes?.error || "Fallback failed")
                return { action: "stop" }
              } catch (fallbackErr: any) {
                updateBranchStatus("failed", finishBranchDuration(), String(fallbackErr))
                return { action: "stop" }
              }
            }

            updateBranchStatus("failed", finishBranchDuration(), message || "Step failed")
            return { action: "stop" }
          }

          updateBranchStatus("running", "-")
          const branchResult = await performAtomicStep(
            branchStep,
            finishBranchDuration,
            handleBranchFailure,
            updateBranchStatus,
            branchIdx + 1,
          )

          if (branchResult.action === "jump" && typeof branchResult.nextIndex === "number") {
            branchIdx = branchResult.nextIndex
            continue
          }
          if (branchResult.action === "continue") {
            branchIdx = branchResult.nextIndex ?? branchIdx + 1
            continue
          }

          return { status: "failed", error: lastBranchError }
        }

        return { status: "success", error: lastBranchError }
      }

      const stepsList = wf.steps
      const stepIndexMap = new Map<string, number>()
      stepsList.forEach((s, idx) => {
        const sid = (s as any).id || `step-${idx}`
        stepIndexMap.set(sid, idx)
      })

      let idx = 0
      const maxIterations = stepsList.length * 5 // guard against runaway goto loops

      while (idx < stepsList.length && idx < maxIterations) {
        if (stopFlag.current) {
          markCancelled()
          break
        }

        const step = stepsList[idx]
        const stepId = (step as any).id || `step-${idx}`
        const stepStart = Date.now()

        const finishDuration = () => `${((Date.now() - stepStart) / 1000).toFixed(2)}s`

        if ((step as any).enabled === false) {
          updateStepStatus(stepId, "skipped", finishDuration(), "Disabled")
          idx += 1
          continue
        }

        const handleFailure = async (message: string) => {
          const onFailure = (step as any).onFailure || "stop"
          const gotoStepId = (step as any).gotoStep
          const fallbackCode = (step as any).fallbackCode

          if (onFailure === "skip") {
            updateStepStatus(stepId, "skipped", finishDuration(), message || "Skipped")
            return { action: "continue", nextIndex: idx + 1 }
          }

          if (onFailure === "goto") {
            const targetIdx = gotoStepId ? stepIndexMap.get(gotoStepId) : undefined
            if (targetIdx === undefined) {
              updateStepStatus(stepId, "failed", finishDuration(), message || "Goto target not found")
              runStatus = "failed"
              return { action: "stop" as const }
            }
            if (targetIdx === idx) {
              updateStepStatus(stepId, "failed", finishDuration(), "Goto target is the same step; aborting")
              runStatus = "failed"
              return { action: "stop" as const }
            }
            updateStepStatus(stepId, "skipped", finishDuration(), message || "Jumping to another step")
            return { action: "jump" as const, nextIndex: targetIdx }
          }

          if (onFailure === "fallback") {
            if (!fallbackCode) {
              updateStepStatus(stepId, "failed", finishDuration(), message || "Fallback code missing")
              runStatus = "failed"
              return { action: "stop" as const }
            }
            try {
              const fallbackRes = await sendStepToContent({ type: "fallback", code: fallbackCode })
              if (fallbackRes?.ok) {
                updateStepStatus(stepId, "success", finishDuration(), "Fallback executed")
                return { action: "continue", nextIndex: idx + 1 }
              }
              updateStepStatus(
                stepId,
                "failed",
                finishDuration(),
                fallbackRes?.error || "Fallback failed",
              )
              runStatus = "failed"
              return { action: "stop" as const }
            } catch (fallbackErr: any) {
              updateStepStatus(stepId, "failed", finishDuration(), String(fallbackErr))
              runStatus = "failed"
              return { action: "stop" as const }
            }
          }

          // stop workflow
          updateStepStatus(stepId, "failed", finishDuration(), message || "Step failed")
          runStatus = "failed"
          return { action: "stop" as const }
        }

        try {
          updateStepStatus(stepId, "running", "-", undefined)

          if ((step as any).type === "if-else") {
            const block = step as ConditionalBlock
            const conditionRes = await sendStepToContent({ type: "condition:check", condition: block.condition })
            if (!conditionRes?.ok) {
              const action = await handleFailure(conditionRes?.error || "Condition evaluation failed")
              if (action.action === "jump" && typeof action.nextIndex === "number") idx = action.nextIndex
              else if (action.action === "continue") idx += 1
              else break
              continue
            }

            const branchPasses = !!conditionRes.result
            const branchLabel = branchPasses ? "IF" : "ELSE"
            const branchSteps = branchPasses ? block.ifSteps : block.elseSteps
            const branchResult = await runBranchSteps(block.id, branchSteps, branchLabel)

            if (branchResult.status === "cancelled") {
              markCancelled()
              break
            }

            if (branchResult.status === "failed") {
              const errorMessage = branchResult.error || `${branchLabel} branch failed`
              updateStepStatus(stepId, "failed", finishDuration(), errorMessage)
              runStatus = "failed"
              if (!runError) runError = errorMessage
              break
            }

            updateStepStatus(stepId, "success", finishDuration(), `${branchLabel} branch executed`)
            idx += 1
            continue
          }

          const stepResult = await performAtomicStep(
            step as Step,
            finishDuration,
            handleFailure,
            (status, duration, error) => updateStepStatus(stepId, status, duration, error),
            idx + 1,
          )

          if (stepResult.action === "jump" && typeof stepResult.nextIndex === "number") {
            idx = stepResult.nextIndex
          } else if (stepResult.action === "continue") {
            idx = stepResult.nextIndex ?? idx + 1
          } else {
            break
          }
        } catch (err) {
          const action = await handleFailure(String(err))
          if (action.action === "jump") idx = action.nextIndex!
          else if (action.action === "continue") idx += 1
          else break
        }

        if (stopFlag.current) {
          markCancelled()
          break
        }
      }

      const endedAt = Date.now()
      if (stopFlag.current) {
        runStatus = "cancelled"
      } else if (runStatus !== "failed") {
        runStatus = "success"
      }
      updateRun(workflowId, runId, {
        status: runStatus,
        endTime: endedAt,
        duration: `${((endedAt - startedAt) / 1000).toFixed(2)}s`,
        error: runError,
      })
      return runStatus
    }

      let attempt = 0
      let finalStatus: Run["status"] = "failed"
      while (attempt === 0 || (finalStatus === "failed" && attempt <= maxGlobalRetries && !stopFlag.current)) {
        runtimeVars = { ...baseRuntimeVars }
        finalStatus = await executeRun(attempt)
        attempt += 1
        if (finalStatus === "failed" && attempt <= maxGlobalRetries && !stopFlag.current) {
          console.warn(`${RUNNER_LOG_PREFIX} retrying attempt ${attempt}/${maxGlobalRetries}`)
          continue
        }
        if (finalStatus !== "failed" || attempt > maxGlobalRetries || stopFlag.current) {
          break
        }
      }

      if (runnerStarted) {
        stopRunner()
      }
    } finally {
      activeRunsRef.current.delete(runId)
      setIsRunnerActive(activeRunsRef.current.size > 0)
    }
    },
    [addRun, buildRunStepsSnapshot, getWorkflow, lastKnownTab, setVariable, startRunner, stopRunner, updateRun],
  )

  const mapTriggerToRunSource = useCallback((type: TriggerType): Run["trigger"] => {
    switch (type) {
      case "browserEvent":
        return "browser"
      case "domCondition":
        return "dom"
      case "schedule":
        return "schedule"
      case "webhookWs":
        return "websocket"
      default:
        return "manual"
    }
  }, [])

  const countActiveRunsForWorkflow = useCallback((workflowId: string) => {
    let count = 0
    activeRunsRef.current.forEach((entry) => {
      if (entry.workflowId === workflowId && !entry.stopFlag.current) {
        count += 1
      }
    })
    return count
  }, [])

  const cancelRunsForWorkflow = useCallback((workflowId: string) => {
    activeRunsRef.current.forEach((entry) => {
      if (entry.workflowId === workflowId) {
        entry.stopFlag.current = true
      }
    })
  }, [])

  const handleTriggerEvent = useCallback(
    (workflowId: string, trigger: Trigger, context?: Partial<Run["context"]>) => {
      const wf = getWorkflow(workflowId)
      if (!wf) return
      if (wf.status === "paused") return

      const policy = wf.settings?.triggerPolicy || defaultTriggerRunPolicy
      const activeCount = countActiveRunsForWorkflow(workflowId)
      const parallelLimit = Math.max(1, policy.parallelLimit || defaultTriggerRunPolicy.parallelLimit)

      if (policy.mode === "single" && activeCount > 0) {
        return
      }

      if (policy.mode === "restart" && activeCount > 0) {
        cancelRunsForWorkflow(workflowId)
      }

      if (policy.mode === "parallel" && activeCount >= parallelLimit) {
        return
      }

      updateTrigger(workflowId, trigger.id, { lastEvent: new Date().toLocaleTimeString() })
      void runWorkflow(workflowId, { trigger: mapTriggerToRunSource(trigger.type), context })
    },
    [cancelRunsForWorkflow, countActiveRunsForWorkflow, getWorkflow, mapTriggerToRunSource, runWorkflow, updateTrigger],
  )

  const handleWsMessage = useCallback(
    async (workflowId: string, rawData: MessageEvent["data"]) => {
      const wf = getWorkflow(workflowId)
      if (!wf) {
        console.debug("[ws] skip (workflow not found)", { workflowId })
        return
      }
      const connectedTriggers = (wf.triggers || []).filter((t) => t.type === "webhookWs" && t.enabled)
      if (connectedTriggers.length === 0) {
        console.debug("[ws] skip (no enabled ws triggers)", { workflowId })
        return
      }

      let text = ""
      if (typeof rawData === "string") {
        text = rawData
      } else if (rawData instanceof Blob) {
        text = await rawData.text()
      } else if (rawData instanceof ArrayBuffer) {
        text = new TextDecoder().decode(rawData)
      } else {
        text = String(rawData ?? "")
      }

      text = text.trim()
      if (!text) {
        console.debug("[ws] skip (empty message)", { workflowId })
        return
      }

      let eventName = text
      let channel: string | undefined
      let token: string | undefined

      try {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed.event === "string") {
          eventName = parsed.event
          channel = typeof parsed.channel === "string" ? parsed.channel : undefined
          token = typeof parsed.token === "string" ? parsed.token : undefined
        }
      } catch {
        // ignore parse errors; fallback to plain text
      }

      if (!eventName) return
      console.log("[ws] message received", { workflowId, raw: text, eventName, channel, token: token ? "***" : "" })

      const now = Date.now()

      connectedTriggers.forEach((trigger) => {
        const cfg = trigger.config as WebhookWsConfig
        const cfgChannel = (cfg.channel || "").trim()
        const incomingChannel = (channel || "").trim()
        const channelMatch = !cfgChannel || cfgChannel === incomingChannel || (cfgChannel === "default" && !incomingChannel)
        const tokenMatch = !cfg.authToken || cfg.authToken === (token || "")
        const eventMatch = (cfg.eventName || "").trim() === eventName
        const windowMs = Number(cfg.dedupeWindowMs) || 0
        const last = wsDedupeRef.current.get(trigger.id) || 0
        const deduped = windowMs > 0 && now - last < windowMs

        console.log("[ws] incoming", {
          workflowId,
          triggerId: trigger.id,
          triggerName: trigger.name,
          eventName,
          cfgEvent: cfg.eventName,
          cfgChannel,
          incomingChannel,
          channelMatch,
          tokenMatch,
          deduped,
        })

        if (!eventMatch || !channelMatch || !tokenMatch || deduped) {
          console.log("[ws] skip trigger", {
            triggerId: trigger.id,
            reason: !eventMatch
              ? "event"
              : !channelMatch
                ? "channel"
                : !tokenMatch
                  ? "token"
                  : "dedupe",
          })
          return
        }

        wsDedupeRef.current.set(trigger.id, now)
        console.log("[ws] firing trigger", { workflowId, triggerId: trigger.id, triggerName: trigger.name })
        handleTriggerEvent(workflowId, trigger, {})
      })
    },
    [getWorkflow, handleTriggerEvent],
  )

  useEffect(() => {
    if (!hydrated) return

    const shouldConnectWorkflow = (wf: Workflow) => {
      const endpoint = (wf.settings?.wsEndpoint || "").trim()
      if (!endpoint || endpoint === "wss://your-server.com/ws") return false
      const hasWsTrigger = (wf.triggers || []).some((t) => t.type === "webhookWs" && t.enabled)
      const userRequested = wf.settings?.wsConnectRequested
      const allowWhilePaused = Boolean(userRequested)
      return Boolean(endpoint && (wf.status !== "paused" || allowWhilePaused) && (hasWsTrigger || userRequested))
    }

    const scheduleReconnect = (workflowId: string, endpoint: string) => {
      const existingMeta = wsMetaRef.current.get(workflowId)
      if (existingMeta?.reconnectTimer) return

      const t = setTimeout(() => {
        wsMetaRef.current.delete(workflowId)
        wsConnectionsRef.current.delete(workflowId)
        setWsRestartTick((tick) => tick + 1)
      }, 2000)

      wsMetaRef.current.set(workflowId, { endpoint, reconnectTimer: t })
    }

    const connectWorkflow = (wf: Workflow) => {
      const endpoint = wf.settings?.wsEndpoint
      if (!endpoint) return

      const existing = wsConnectionsRef.current.get(wf.id)
      const meta = wsMetaRef.current.get(wf.id)
      if (
        existing &&
        meta?.endpoint === endpoint &&
        existing.readyState !== WebSocket.CLOSING &&
        existing.readyState !== WebSocket.CLOSED
      ) {
        return
      }

      if (existing) {
        try {
          existing.close()
        } catch (err) {
          console.warn("[ws] failed to close stale connection", err)
        }
        wsConnectionsRef.current.delete(wf.id)
      }

      if (meta?.reconnectTimer) {
        clearTimeout(meta.reconnectTimer)
      }

      try {
        const ws = new WebSocket(endpoint)
        wsMetaRef.current.set(wf.id, { endpoint })
        updateSettings(wf.id, { wsConnected: false })

        ws.onopen = () => {
          updateSettings(wf.id, { wsConnected: true, wsConnectRequested: true })
        }

        ws.onclose = () => {
          updateSettings(wf.id, { wsConnected: false, wsConnectRequested: true })
          scheduleReconnect(wf.id, endpoint)
        }

        ws.onerror = () => {
          updateSettings(wf.id, { wsConnected: false, wsConnectRequested: true })
        }

        ws.onmessage = (evt) => {
          void handleWsMessage(wf.id, evt.data)
        }

        wsConnectionsRef.current.set(wf.id, ws)
      } catch (err) {
        console.warn("[ws] failed to connect", err)
        updateSettings(wf.id, { wsConnected: false })
        scheduleReconnect(wf.id, endpoint)
      }
    }

    workflows.forEach((wf) => {
      if (shouldConnectWorkflow(wf)) {
        connectWorkflow(wf)
      } else {
        const existing = wsConnectionsRef.current.get(wf.id)
        if (existing) {
          try {
            existing.close()
          } catch (err) {
            console.warn("[ws] failed to close unused connection", err)
          }
          wsConnectionsRef.current.delete(wf.id)
        }
        const meta = wsMetaRef.current.get(wf.id)
        if (meta?.reconnectTimer) {
          clearTimeout(meta.reconnectTimer)
        }
        wsMetaRef.current.delete(wf.id)
        if (wf.settings?.wsConnected) {
          updateSettings(wf.id, { wsConnected: false })
        }
      }
    })
  }, [handleWsMessage, hydrated, updateSettings, workflows, wsRestartTick])

  useEffect(() => {
    return () => {
      wsConnectionsRef.current.forEach((ws) => {
        try {
          ws.close()
        } catch (err) {
          console.warn("[ws] failed to close on cleanup", err)
        }
      })
      wsConnectionsRef.current.clear()
      wsMetaRef.current.forEach((meta) => {
        if (meta.reconnectTimer) {
          clearTimeout(meta.reconnectTimer)
        }
      })
      wsMetaRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return

    const browserEntries = workflows
      .flatMap((wf) =>
        (wf.triggers || [])
          .filter((t) => t.type === "browserEvent" && t.enabled && wf.status !== "paused")
          .map((t) => ({ workflowId: wf.id, trigger: t })),
      )

    if (browserEntries.length === 0) return

    const matchesUrl = (cfg: BrowserEventConfig, url: string) => {
      try {
        if (cfg.urlMatchType === "hostEquals") {
            const parsed = new URL(url)
            const targetHost =
              (() => {
                try {
                  return new URL(cfg.urlValue).host || cfg.urlValue
                } catch {
                  return cfg.urlValue
                }
              })()
                ?.trim()
                .toLowerCase()
            return parsed.host.toLowerCase() === targetHost
        }
        if (cfg.urlMatchType === "contains") {
            const needle = (cfg.urlValue || "").trim()
            return needle ? url.includes(needle) : false
        }
        if (cfg.urlMatchType === "regex") {
            const pattern = (cfg.urlValue || "").trim()
            if (!pattern) return false
            const re = new RegExp(pattern)
            return re.test(url)
        }
      } catch (err) {
        console.warn("[trigger:browser] match failed", err)
      }
      return false
    }

    const ensureTabActive = async (tabId: number | undefined, reportedActive?: boolean) => {
      if (reportedActive !== undefined) return reportedActive
      if (!tabId) return false
      try {
        const res = await sandboxRpc({ type: "tabs.query", query: { active: true, lastFocusedWindow: true } })
        const tabs = (res as any)?.tabs || []
        return tabs.some((t: any) => t.id === tabId && t.active)
      } catch {
        return false
      }
    }

    const maybeFire = async (payload: { event: BrowserEventConfig["event"]; tabId?: number; url?: string; active?: boolean }) => {
      const { event, tabId, url, active } = payload
      if (!url) return
      const now = Date.now()
      for (const entry of browserEntries) {
        const trigger = entry.trigger
        const cfg = trigger.config as BrowserEventConfig
        if (cfg.event !== event) continue
        if (!matchesUrl(cfg, url)) continue

        if (cfg.onlyIfTabActive) {
          const tabIsActive = await ensureTabActive(tabId, active)
          if (!tabIsActive) continue
        }

        const last = browserLastFiredRef.current.get(trigger.id) || 0
        if (cfg.debounceMs && now - last < cfg.debounceMs) continue
        if (cfg.runOncePerSession && browserRunOnceRef.current.has(trigger.id)) continue

        browserLastFiredRef.current.set(trigger.id, now)
        if (cfg.runOncePerSession) {
          browserRunOnceRef.current.add(trigger.id)
        }

        handleTriggerEvent(entry.workflowId, trigger, { url, tabId })
      }
    }

    const handler = (event: MessageEvent) => {
      const msg = event.data
      if (!msg?.__fromExtension || !msg.push) return
      if (msg.message?.type !== "automation:browserEvent") return
      const payload = msg.message
      void maybeFire({
        event: payload.event,
        tabId: payload.tabId,
        url: payload.url,
        active: payload.active,
      })
    }

    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [handleTriggerEvent, hydrated, workflows])

  const scheduleState = useMemo(() => {
    const entries = workflows
      .flatMap((wf) =>
        (wf.triggers || [])
          .filter((t) => t.type === "schedule" && t.enabled && wf.status !== "paused")
          .map((t) => ({ workflowId: wf.id, trigger: t })),
      )
    const signature = JSON.stringify(
      entries.map((entry) => {
        const cfg = entry.trigger.config as ScheduleConfig & { cronExpression?: string }
        return {
          workflowId: entry.workflowId,
          triggerId: entry.trigger.id,
          enabled: entry.trigger.enabled,
          mode: cfg.mode,
          everyMinutes: cfg.everyMinutes,
          everyMs: cfg.everyMs,
          dailyTime: cfg.dailyTime,
          timezone: cfg.timezone,
          jitterMs: cfg.jitterMs,
          cronExpression: cfg.cronExpression || "",
        }
      }),
    )
    return { entries, signature }
  }, [workflows])

  useEffect(() => {
    if (!hydrated) return

    const timers: ReturnType<typeof setTimeout>[] = []
    const active = scheduleState.entries

    const parseDailyTime = (time: string, timezone: ScheduleConfig["timezone"]) => {
      const [hourStr, minuteStr] = time.split(":")
      const hour = Number(hourStr)
      const minute = Number(minuteStr)
      const now = new Date()
      const next = new Date(now)
      if (timezone === "UTC") {
        next.setUTCHours(hour, minute, 0, 0)
      } else {
        next.setHours(hour, minute, 0, 0)
      }
      if (next.getTime() <= now.getTime()) {
        if (timezone === "UTC") {
          next.setUTCDate(next.getUTCDate() + 1)
        } else {
          next.setDate(next.getDate() + 1)
        }
      }
      return next.getTime() - now.getTime()
    }

    const matchesCronExpression = (expr: string, date: Date, timezone: ScheduleConfig["timezone"]) => {
      const parts = expr.trim().split(/\s+/)
      if (parts.length < 5) return false
      const [minField, hourField, domField, monthField, dowField] = parts

      const minute = timezone === "UTC" ? date.getUTCMinutes() : date.getMinutes()
      const hour = timezone === "UTC" ? date.getUTCHours() : date.getHours()
      const day = timezone === "UTC" ? date.getUTCDate() : date.getDate()
      const month = (timezone === "UTC" ? date.getUTCMonth() : date.getMonth()) + 1
      const dow = timezone === "UTC" ? date.getUTCDay() : date.getDay()

      const matchField = (field: string, value: number) => {
        if (field === "*") return true
        if (field.startsWith("*/")) {
          const step = Number(field.slice(2))
          return step > 0 && value % step === 0
        }
        const options = field.split(",")
        return options.some((token) => {
          if (token.includes("-")) {
            const [start, end] = token.split("-").map(Number)
            if (Number.isFinite(start) && Number.isFinite(end)) {
              return value >= start && value <= end
            }
          }
          const num = Number(token)
          return Number.isFinite(num) && num === value
        })
      }

      return (
        matchField(minField, minute) &&
        matchField(hourField, hour) &&
        matchField(domField, day) &&
        matchField(monthField, month) &&
        matchField(dowField, dow)
      )
    }

    const scheduleNext = (entry: { workflowId: string; trigger: Trigger }) => {
      const cfg = entry.trigger.config as ScheduleConfig
      const jitter = Math.max(0, cfg.jitterMs || 0)
      let delay = 0

      if (cfg.mode === "everyMinutes") {
        delay = Math.max(60000, (cfg.everyMinutes || 1) * 60 * 1000)
      } else if (cfg.mode === "everyMs") {
        delay = Math.max(10, cfg.everyMs || 0)
      } else if (cfg.mode === "dailyAt") {
        delay = parseDailyTime(cfg.dailyTime || "09:00", cfg.timezone || "local")
      } else {
        // cron-like: check every minute
        delay = 60000
      }

      const jitterOffset = jitter ? Math.floor(Math.random() * jitter) : 0
      const timer = setTimeout(async () => {
        const now = new Date()
        if (cfg.mode === "cronLike") {
          if (cfg.cronExpression && matchesCronExpression(cfg.cronExpression, now, cfg.timezone || "local")) {
            handleTriggerEvent(entry.workflowId, entry.trigger, {})
          }
        } else {
          handleTriggerEvent(entry.workflowId, entry.trigger, {})
        }
        scheduleNext(entry)
      }, delay + jitterOffset)

      timers.push(timer)
    }

    active.forEach(scheduleNext)

    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [handleTriggerEvent, hydrated, scheduleState.signature])

  useEffect(() => {
    if (!hydrated) return

    const active = workflows
      .flatMap((wf) =>
        (wf.triggers || [])
          .filter((t) => t.type === "domCondition" && t.enabled && wf.status !== "paused")
          .map((t) => ({ workflowId: wf.id, trigger: t })),
      )

    if (active.length === 0) return

    const cancelled = new Set<string>()
    const timers: ReturnType<typeof setTimeout>[] = []

    const buildWaitConfig = (cfg: DomConditionConfig) => {
      const base = {
        selector: cfg.selector,
        text: cfg.text,
        attributeName: cfg.attributeName,
        attributeValue: cfg.attributeValue,
        intervalMs: 250,
        strategy: "observer" as const,
        requireStableMs: 0,
        invert: false,
        textScope: "insideSelector" as const,
      }

      switch (cfg.condition) {
        case "selectorAppears":
          return { ...base, waitFor: "selectorAppears" as const }
        case "selectorDisappears":
          return { ...base, waitFor: "selectorDisappears" as const }
        case "textContains":
          return { ...base, waitFor: "textContains" as const }
        case "attributeEquals":
          return { ...base, waitFor: "attributeEquals" as const }
        case "elementEnabled":
          return { ...base, waitFor: "elementEnabled" as const }
        default:
          return { ...base, waitFor: "selectorAppears" as const }
      }
    }

    const resolveTabId = async (cfg: DomConditionConfig) => {
      try {
        if (cfg.targetTabScope === "anyTabMatchingScope" && cfg.scopeUrlRegex) {
          const res = await sandboxRpc({ type: "tabs.query", scopeUrlRegex: cfg.scopeUrlRegex })
          const tabs = (res as any)?.tabs || []
          return tabs[0]?.id
        }
        const q = await sandboxRpc({
          type: "tabs.query",
          query: { active: true, lastFocusedWindow: true },
        })
        return q?.tabs?.[0]?.id
      } catch (err) {
        console.warn("[trigger:dom] failed to resolve tab", err)
        return undefined
      }
    }

    const watchTrigger = (workflowId: string, trigger: Trigger) => {
      const cfg = trigger.config as DomConditionConfig

      const loop = async () => {
        if (cancelled.has(trigger.id)) return
        const targetTabId = await resolveTabId(cfg)
        if (!targetTabId) {
          const retry = setTimeout(loop, 1500)
          timers.push(retry)
          return
        }

        const waitConfig = buildWaitConfig(cfg)
        try {
          const res = await sandboxRpc({
            type: "tabs.sendMessage",
            tabId: targetTabId,
            message: {
              type: "automation:domCondition:wait",
              config: waitConfig,
              timeoutMs: cfg.timeoutMs || 10000,
            },
          })

          const ok = (res as any)?.ok ?? (res as any)?.res?.ok
          if (ok && !cancelled.has(trigger.id)) {
            handleTriggerEvent(workflowId, trigger, { tabId: targetTabId })
            if (cfg.fireMode === "everyTime") {
              const delay = Math.max(0, cfg.cooldownMs || 0)
              const t = setTimeout(loop, delay)
              timers.push(t)
            }
            return
          }
        } catch (err) {
          console.warn("[trigger:dom] watch failed", err)
        }

        if (!cancelled.has(trigger.id)) {
          const retryDelay = Math.max(500, cfg.cooldownMs || 500)
          const t = setTimeout(loop, retryDelay)
          timers.push(t)
        }
      }

      loop()
    }

    active.forEach((entry) => watchTrigger(entry.workflowId, entry.trigger))

    return () => {
      active.forEach((entry) => cancelled.add(entry.trigger.id))
      timers.forEach((t) => clearTimeout(t))
    }
  }, [handleTriggerEvent, hydrated, workflows])


  return (
    <AutomationContext.Provider
      value={{
        workflows,
        selectedWorkflowId,
        setSelectedWorkflowId,
        getWorkflow,
        updateWorkflow,
        addWorkflow,
        deleteWorkflow,
        addStep,
        updateStep,
        deleteStep,
        reorderSteps,
        addStepToBlock,
        deleteStepFromBlock,
        updateStepInBlock,
        setVariable,
        deleteVariable,
        addTrigger,
        updateTrigger,
        deleteTrigger,
        addRun,
        updateRun,
        deleteRun,
        clearRuns,
        updateSettings,
        addAllowedSite,
        removeAllowedSite,
        restartWebsocket,
        isPicking,
        setIsPicking,
        pickedSelector,
        setPickedSelector,
        onPickComplete,
        setOnPickComplete,
        lastKnownTab,
        setLastKnownTab,
        getWorkflowsForProject,
        setWorkflowsForProject,
        isRunnerActive,
        startRunner,
        stopRunner,
        requestStopRunner,
        runWorkflow,
      }}
    >
      {children}
    </AutomationContext.Provider>
  )
}
