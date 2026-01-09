"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAutomation } from "@/components/automation-provider"
import type {
  Step,
  StepType,
  ConditionalBlock,
  ScrollConfig,
  EvaluateConfig,
  WaitConfig,
  ExtractConfig,
  ScreenshotConfig,
  ValueSourceConfig,
  ServerUploadConfig,
  ConditionConfig,
} from "@/lib/automation-types"
import {
  defaultWaitConfig,
  defaultExtractConfig,
  defaultScreenshotConfig,
  defaultEvaluateConfig,
} from "@/lib/automation-types"
import { applyRequestTemplate } from "@/lib/request-utils"
import {
  Plus,
  Trash2,
  Settings2,
  MousePointer,
  Keyboard,
  Clock,
  Database,
  ChevronDown,
  Code,
  ArrowDownToLine,
  Camera,
  Send,
  Cookie,
  FileCode,
  GripVertical,
  GitBranch,
  MousePointer2,
  RefreshCw,
  X,
  Play,
  Braces,
  Variable,
  ChevronRight,
  ArrowRight,
  PlusCircle,
  Zap,
} from "lucide-react"

type ConditionType =
  | "selectorExists"
  | "selectorNotExists"
  | "elementVisible"
  | "elementHidden"
  | "elementEnabled"
  | "elementDisabled"
  | "textContains"
  | "textEquals"
  | "textNotContains"
  | "urlMatches"
  | "urlEquals"
  | "variableEquals"
  | "variableNotEquals"
  | "variableGreater"
  | "variableLess"
  | "variableEmpty"
  | "variableNotEmpty"
  | "attributeEquals"
  | "attributeContains"
  | "regexMatches"

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

interface StepsTabProps {
  workflowId: string
  initialSelector?: string | null
  onSelectorConsumed?: () => void
}

// Persistent Modal Component
function PersistentModal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-[520px] max-w-[calc(100vw-32px)] h-[85vh] max-h-[780px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 overscroll-contain">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border p-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Server Upload Editor Component
function ServerUploadEditor({
  config,
  onChange,
  label,
}: {
  config: ServerUploadConfig
  onChange: (config: ServerUploadConfig) => void
  label: string
}) {
  return (
    <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <Send className="h-3 w-3" />
          {label}
        </Label>
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => onChange({ ...config, enabled: checked })}
          className="scale-75"
        />
      </div>

      {config.enabled && (
        <div className="space-y-2 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Server URL</Label>
            <Input
              placeholder="https://api.example.com/upload"
              value={config.url}
              onChange={(e) => onChange({ ...config, url: e.target.value })}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={config.method} onValueChange={(v) => onChange({ ...config, method: v as "POST" | "PUT" })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Data Field</Label>
              <Input
                placeholder="data"
                value={config.dataField}
                onChange={(e) => onChange({ ...config, dataField: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Headers</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={() => onChange({ ...config, headers: [...config.headers, { key: "", value: "" }] })}
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>
            {config.headers.map((header, i) => (
              <div key={i} className="flex gap-1">
                <Input
                  placeholder="Key"
                  value={header.key}
                  onChange={(e) => {
                    const newHeaders = [...config.headers]
                    newHeaders[i] = { ...newHeaders[i], key: e.target.value }
                    onChange({ ...config, headers: newHeaders })
                  }}
                  className="h-7 text-xs flex-1"
                />
                <Input
                  placeholder="Value"
                  value={header.value}
                  onChange={(e) => {
                    const newHeaders = [...config.headers]
                    newHeaders[i] = { ...newHeaders[i], value: e.target.value }
                    onChange({ ...config, headers: newHeaders })
                  }}
                  className="h-7 text-xs flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onChange({ ...config, headers: config.headers.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Body Template (optional)</Label>
            <Textarea
              placeholder={'{"{{dataField}}": "{{data}}", "timestamp": {{timestamp}}}'}
              value={config.bodyTemplate || ""}
              onChange={(e) => onChange({ ...config, bodyTemplate: e.target.value })}
              className="h-16 text-xs font-mono"
            />
            <p className="text-[9px] text-muted-foreground">
              Use {"{{data}}"} for content, {"{{timestamp}}"} for unix time
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Value Source Editor
function ValueSourceEditor({
  valueSource,
  onChange,
  label,
}: {
  valueSource: ValueSourceConfig
  onChange: (vs: ValueSourceConfig) => void
  label: string
}) {
  return (
    <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
      <div className="flex items-center gap-2 mb-2">
        <Variable className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium">{label}</span>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Value Source</Label>
        <Select
          value={valueSource.type}
          onValueChange={(v) => onChange({ ...valueSource, type: v as "fixed" | "request" })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed Value</SelectItem>
            <SelectItem value="request">From Request</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {valueSource.type === "fixed" ? (
        <div className="space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            placeholder="Enter value or {{vars.name}}"
            value={valueSource.fixedValue || ""}
            onChange={(e) => onChange({ ...valueSource, fixedValue: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Request URL</Label>
            <Input
              placeholder="https://api.example.com/data"
              value={valueSource.requestConfig?.url || ""}
              onChange={(e) =>
                onChange({
                  ...valueSource,
                  requestConfig: { ...valueSource.requestConfig!, url: e.target.value },
                })
              }
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Method</Label>
              <Select
                value={valueSource.requestConfig?.method || "GET"}
                onValueChange={(v) =>
                  onChange({
                    ...valueSource,
                    requestConfig: {
                      ...valueSource.requestConfig!,
                      method: v as "GET" | "POST" | "PUT" | "DELETE",
                    },
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">JSON Path</Label>
              <Input
                placeholder="data.value"
                value={valueSource.requestConfig?.responseJsonPath || ""}
                onChange={(e) =>
                  onChange({
                    ...valueSource,
                    requestConfig: { ...valueSource.requestConfig!, responseJsonPath: e.target.value },
                  })
                }
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Content-Type</Label>
            <Select
              value={valueSource.requestConfig?.contentType || "application/json"}
              onValueChange={(v) =>
                onChange({
                  ...valueSource,
                  requestConfig: { ...valueSource.requestConfig!, contentType: v },
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="application/json">application/json</SelectItem>
                <SelectItem value="text/plain">text/plain</SelectItem>
                <SelectItem value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</SelectItem>
                <SelectItem value="none">(none)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Headers</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={() =>
                  onChange({
                    ...valueSource,
                    requestConfig: {
                      ...valueSource.requestConfig!,
                      headers: [...(valueSource.requestConfig?.headers || []), { key: "", value: "" }],
                    },
                  })
                }
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>
            {(valueSource.requestConfig?.headers || []).map((header, i) => (
              <div key={i} className="flex gap-1">
                <Input
                  placeholder="Key"
                  value={header.key}
                  onChange={(e) => {
                    const newHeaders = [...(valueSource.requestConfig?.headers || [])]
                    newHeaders[i] = { ...newHeaders[i], key: e.target.value }
                    onChange({
                      ...valueSource,
                      requestConfig: { ...valueSource.requestConfig!, headers: newHeaders },
                    })
                  }}
                  className="h-7 text-xs flex-1"
                />
                <Input
                  placeholder="Value"
                  value={header.value}
                  onChange={(e) => {
                    const newHeaders = [...(valueSource.requestConfig?.headers || [])]
                    newHeaders[i] = { ...newHeaders[i], value: e.target.value }
                    onChange({
                      ...valueSource,
                      requestConfig: { ...valueSource.requestConfig!, headers: newHeaders },
                    })
                  }}
                  className="h-7 text-xs flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() =>
                    onChange({
                      ...valueSource,
                      requestConfig: {
                        ...valueSource.requestConfig!,
                        headers: (valueSource.requestConfig?.headers || []).filter((_, idx) => idx !== i),
                      },
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-2 mt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Retry on Condition</Label>
              <Switch
                checked={valueSource.requestConfig?.retry?.enabled || false}
                onCheckedChange={(checked) =>
                  onChange({
                    ...valueSource,
                    requestConfig: {
                      ...valueSource.requestConfig!,
                      retry: { ...valueSource.requestConfig!.retry!, enabled: checked },
                    },
                  })
                }
                className="scale-75"
              />
            </div>

            {valueSource.requestConfig?.retry?.enabled && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Condition Type</Label>
                    <Select
                      value={valueSource.requestConfig.retry.conditionType || "jsonField"}
                      onValueChange={(v) =>
                        onChange({
                          ...valueSource,
                          requestConfig: {
                            ...valueSource.requestConfig!,
                            retry: {
                              ...valueSource.requestConfig!.retry!,
                              conditionType: v as "jsonField" | "statusCode",
                            },
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jsonField">JSON Field</SelectItem>
                        <SelectItem value="statusCode">Status Code</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Max Retries</Label>
                    <Input
                      type="number"
                      value={valueSource.requestConfig.retry.maxRetries || 3}
                      onChange={(e) =>
                        onChange({
                          ...valueSource,
                          requestConfig: {
                            ...valueSource.requestConfig!,
                            retry: {
                              ...valueSource.requestConfig!.retry!,
                              maxRetries: Number.parseInt(e.target.value) || 3,
                            },
                          },
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {valueSource.requestConfig.retry.conditionType === "jsonField" ? (
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">JSON Field</Label>
                      <Input
                        placeholder="status"
                        value={valueSource.requestConfig.retry.jsonField || ""}
                        onChange={(e) =>
                          onChange({
                            ...valueSource,
                            requestConfig: {
                              ...valueSource.requestConfig!,
                              retry: { ...valueSource.requestConfig!.retry!, jsonField: e.target.value },
                            },
                          })
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Operator</Label>
                      <Select
                        value={valueSource.requestConfig.retry.jsonFieldOperator || "notEquals"}
                        onValueChange={(v) =>
                          onChange({
                            ...valueSource,
                            requestConfig: {
                              ...valueSource.requestConfig!,
                              retry: {
                                ...valueSource.requestConfig!.retry!,
                                jsonFieldOperator: v as "equals" | "notEquals" | "contains" | "notContains",
                              },
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">=</SelectItem>
                          <SelectItem value="notEquals">!=</SelectItem>
                          <SelectItem value="contains">contains</SelectItem>
                          <SelectItem value="notContains">!contains</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Value</Label>
                      <Input
                        placeholder="error"
                        value={valueSource.requestConfig.retry.jsonFieldValue || ""}
                        onChange={(e) =>
                          onChange({
                            ...valueSource,
                            requestConfig: {
                              ...valueSource.requestConfig!,
                              retry: { ...valueSource.requestConfig!.retry!, jsonFieldValue: e.target.value },
                            },
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Expected Status Code</Label>
                    <Input
                      type="number"
                      placeholder="200"
                      value={valueSource.requestConfig.retry.expectedStatusCode || ""}
                      onChange={(e) =>
                        onChange({
                          ...valueSource,
                          requestConfig: {
                            ...valueSource.requestConfig!,
                            retry: {
                              ...valueSource.requestConfig!.retry!,
                              expectedStatusCode: Number.parseInt(e.target.value) || 200,
                            },
                          },
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const defaultRequestValueSource = (): NonNullable<ValueSourceConfig["requestConfig"]> => ({
  url: "",
  method: "GET",
  headers: [],
  contentType: "application/json",
  body: "",
  responseJsonPath: "",
  retry: { enabled: false, maxRetries: 3, conditionType: "jsonField" },
})

const createDefaultValueSource = (fixedValue = ""): ValueSourceConfig => ({
  type: "fixed",
  fixedValue,
  requestConfig: defaultRequestValueSource(),
})

const normalizeValueSource = (valueSource?: ValueSourceConfig, fallbackValue = ""): ValueSourceConfig => {
  if (!valueSource) return createDefaultValueSource(fallbackValue)
  const baseRequest = defaultRequestValueSource()
  const mergedRequest = {
    ...baseRequest,
    ...(valueSource.requestConfig || {}),
    retry: { ...baseRequest.retry, ...(valueSource.requestConfig?.retry || {}) },
  }

  if (valueSource.type === "fixed") {
    return {
      type: "fixed",
      fixedValue: valueSource.fixedValue ?? fallbackValue,
      requestConfig: mergedRequest,
    }
  }

  return {
    type: "request",
    requestConfig: mergedRequest,
  }
}

// Wait Config Editor
function WaitConfigEditor({
  config,
  onChange,
  onPickSelector,
  isPicking,
}: {
  config: WaitConfig
  onChange: (config: WaitConfig) => void
  onPickSelector: () => void
  isPicking: boolean
}) {
  const showSelector = config.waitFor !== "urlMatches" && config.waitFor !== "time"
  const showText = ["textContains"].includes(config.waitFor)
  const showAttribute = ["attributeEquals"].includes(config.waitFor)
  const showAdvanced = config.waitFor !== "time"

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Wait For</Label>
        <Select
          value={config.waitFor}
          onValueChange={(v) => onChange({ ...config, waitFor: v as WaitConfig["waitFor"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="time">Time (delay)</SelectItem>
            <SelectItem value="selectorAppears">Selector Appears</SelectItem>
            <SelectItem value="selectorVisible">Selector Visible</SelectItem>
            <SelectItem value="selectorHidden">Selector Hidden</SelectItem>
            <SelectItem value="selectorDisappears">Selector Disappears</SelectItem>
            <SelectItem value="textContains">Text Contains</SelectItem>
            <SelectItem value="attributeEquals">Attribute Equals</SelectItem>
            <SelectItem value="elementEnabled">Element Enabled</SelectItem>
            <SelectItem value="urlMatches">URL Matches</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.waitFor === "time" && (
        <div className="space-y-1">
          <Label className="text-xs">Time (ms)</Label>
          <Input
            type="number"
            placeholder="1000"
            value={config.timeMs || 1000}
            onChange={(e) => onChange({ ...config, timeMs: Number.parseInt(e.target.value) || 1000 })}
            className="h-8 text-xs"
          />
          <p className="text-[9px] text-muted-foreground">Wait for a fixed amount of time before proceeding</p>
        </div>
      )}

      {showSelector && (
        <div className="space-y-1">
          <Label className="text-xs">CSS Selector</Label>
          <div className="flex gap-1">
            <Input
              placeholder="#element or .class"
              value={config.selector || ""}
              onChange={(e) => onChange({ ...config, selector: e.target.value })}
              className="h-8 text-xs font-mono flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-transparent"
              onClick={onPickSelector}
              disabled={isPicking}
            >
              {isPicking ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MousePointer2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {showText && (
        <div className="space-y-1">
          <Label className="text-xs">Text to Match</Label>
          <Input
            placeholder="Expected text..."
            value={config.text || ""}
            onChange={(e) => onChange({ ...config, text: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      )}

      {showAttribute && (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Attribute Name</Label>
            <Input
              placeholder="data-loaded"
              value={config.attributeName || ""}
              onChange={(e) => onChange({ ...config, attributeName: e.target.value })}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Attribute Value</Label>
            <Input
              placeholder="true"
              value={config.attributeValue || ""}
              onChange={(e) => onChange({ ...config, attributeValue: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      {config.waitFor === "urlMatches" && (
        <div className="space-y-1">
          <Label className="text-xs">URL Regex</Label>
          <Input
            placeholder="/dashboard.*"
            value={config.urlRegex || ""}
            onChange={(e) => onChange({ ...config, urlRegex: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
      )}

      {showAdvanced && (
        <div className="space-y-2 border-t border-border pt-2 mt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Strategy</Label>
              <Select
                value={config.strategy}
                onValueChange={(v) => onChange({ ...config, strategy: v as "observer" | "polling" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observer">MutationObserver</SelectItem>
                  <SelectItem value="polling">Polling</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Interval (ms)</Label>
              <Input
                type="number"
                value={config.intervalMs}
                onChange={(e) => onChange({ ...config, intervalMs: Number.parseInt(e.target.value) || 250 })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Stable for (ms)</Label>
              <Input
                type="number"
                value={config.requireStableMs}
                onChange={(e) => onChange({ ...config, requireStableMs: Number.parseInt(e.target.value) || 0 })}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex-1 flex items-end">
              <div className="flex items-center gap-2 h-8">
                <Switch
                  checked={config.invert}
                  onCheckedChange={(checked) => onChange({ ...config, invert: checked })}
                  className="scale-75"
                />
                <Label className="text-xs">Invert condition</Label>
              </div>
            </div>
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5 mt-2 bg-transparent">
        <Play className="h-3 w-3" />
        Test Wait
      </Button>
    </div>
  )
}

// Extract Config Editor
function ExtractConfigEditor({
  config,
  onChange,
  onPickSelector,
  isPicking,
}: {
  config: ExtractConfig
  onChange: (config: ExtractConfig) => void
  onPickSelector: () => void
  isPicking: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">CSS Selector</Label>
        <div className="flex gap-1">
          <Input
            placeholder="#element or .class"
            value={config.selector}
            onChange={(e) => onChange({ ...config, selector: e.target.value })}
            className="h-8 text-xs font-mono flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-transparent"
            onClick={onPickSelector}
            disabled={isPicking}
          >
            {isPicking ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <MousePointer2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Extract What</Label>
          <Select
            value={config.extractWhat}
            onValueChange={(v) => onChange({ ...config, extractWhat: v as ExtractConfig["extractWhat"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">innerText</SelectItem>
              <SelectItem value="textContent">textContent</SelectItem>
              <SelectItem value="html">innerHTML</SelectItem>
              <SelectItem value="value">value</SelectItem>
              <SelectItem value="attribute">attribute</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Multiple</Label>
          <Select
            value={config.multiple}
            onValueChange={(v) => onChange({ ...config, multiple: v as "first" | "all" })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">First Match</SelectItem>
              <SelectItem value="all">All Matches</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {config.extractWhat === "attribute" && (
        <div className="space-y-1">
          <Label className="text-xs">Attribute Name</Label>
          <Input
            placeholder="href, data-id, src..."
            value={config.attributeName || ""}
            onChange={(e) => onChange({ ...config, attributeName: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Output Type</Label>
          <Select
            value={config.outputType}
            onValueChange={(v) => onChange({ ...config, outputType: v as ExtractConfig["outputType"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {config.multiple === "all" && (
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Join With</Label>
            <Input
              placeholder="\n"
              value={config.joinWith}
              onChange={(e) => onChange({ ...config, joinWith: e.target.value })}
              className="h-8 text-xs font-mono"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Regex Filter (optional)</Label>
        <Input
          placeholder="\\d+"
          value={config.regex || ""}
          onChange={(e) => onChange({ ...config, regex: e.target.value })}
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Default Value</Label>
          <Input
            placeholder="fallback"
            value={config.defaultValue}
            onChange={(e) => onChange({ ...config, defaultValue: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Save As (required)</Label>
          <Input
            placeholder="vars.myValue"
            value={config.saveAs}
            onChange={(e) => onChange({ ...config, saveAs: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={config.trim}
            onCheckedChange={(checked) => onChange({ ...config, trim: checked })}
            className="scale-75"
          />
          <Label className="text-xs">Trim whitespace</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={config.failIfEmpty}
            onCheckedChange={(checked) => onChange({ ...config, failIfEmpty: checked })}
            className="scale-75"
          />
          <Label className="text-xs">Fail if empty</Label>
        </div>
      </div>

      <ServerUploadEditor
        config={config.serverUpload || { enabled: false, url: "", method: "POST", headers: [], dataField: "data" }}
        onChange={(serverUpload) => onChange({ ...config, serverUpload })}
        label="Upload to Server"
      />

      <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5 mt-2 bg-transparent">
        <Play className="h-3 w-3" />
        Test Extract
      </Button>
    </div>
  )
}

// Screenshot Config Editor
function ScreenshotConfigEditor({
  config,
  onChange,
  onPickSelector,
  isPicking,
  onCaptureNow,
  isCapturing,
}: {
  config: ScreenshotConfig
  onChange: (config: ScreenshotConfig) => void
  onPickSelector: () => void
  isPicking: boolean
  onCaptureNow?: () => Promise<void> | void
  isCapturing?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Capture Mode</Label>
          <Select
            value={config.captureMode}
            onValueChange={(v) => onChange({ ...config, captureMode: v as ScreenshotConfig["captureMode"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewport">Viewport</SelectItem>
              <SelectItem value="fullPage">Full Page</SelectItem>
              <SelectItem value="element">Element</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Format</Label>
          <Select value={config.format} onValueChange={(v) => onChange({ ...config, format: v as "png" | "jpeg" })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="jpeg">JPEG</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {config.captureMode === "element" && (
        <div className="space-y-1">
          <Label className="text-xs">Element Selector</Label>
          <div className="flex gap-1">
            <Input
              placeholder="#element or .class"
              value={config.selector || ""}
              onChange={(e) => onChange({ ...config, selector: e.target.value })}
              className="h-8 text-xs font-mono flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-transparent"
              onClick={onPickSelector}
              disabled={isPicking}
            >
              {isPicking ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MousePointer2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {config.format === "jpeg" && (
        <div className="space-y-1">
          <Label className="text-xs">Quality ({config.quality}%)</Label>
          <input
            type="range"
            min="10"
            max="100"
            value={config.quality}
            onChange={(e) => onChange({ ...config, quality: Number.parseInt(e.target.value) })}
            className="w-full h-2"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">File Name Template</Label>
        <Input
          placeholder="{{workflow}}_{{step}}_{{timestamp}}"
          value={config.fileNameTemplate}
          onChange={(e) => onChange({ ...config, fileNameTemplate: e.target.value })}
          className="h-8 text-xs font-mono"
        />
        <p className="text-[9px] text-muted-foreground">
          Placeholders: {"{{workflow}}"}, {"{{step}}"}, {"{{timestamp}}"}, {"{{date}}"}
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Save To</Label>
          <Select
            value={config.saveTo}
            onValueChange={(v) => onChange({ ...config, saveTo: v as ScreenshotConfig["saveTo"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="downloads">Downloads</SelectItem>
              <SelectItem value="varsBase64">Variable (Base64)</SelectItem>
              <SelectItem value="runnerArtifacts">Runner Artifacts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {config.saveTo === "varsBase64" && (
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Variable Name</Label>
            <Input
              placeholder="vars.screenshot"
              value={config.saveAs || ""}
              onChange={(e) => onChange({ ...config, saveAs: e.target.value })}
              className="h-8 text-xs font-mono"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Max Width (0 = no limit)</Label>
        <Input
          type="number"
          value={config.maxWidth}
          onChange={(e) => onChange({ ...config, maxWidth: Number.parseInt(e.target.value) || 0 })}
          className="h-8 text-xs"
        />
      </div>

      <ServerUploadEditor
        config={
          config.serverUpload || { enabled: false, url: "", method: "POST", headers: [], dataField: "screenshot" }
        }
        onChange={(serverUpload) => onChange({ ...config, serverUpload })}
        label="Upload to Server"
      />

      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs gap-1.5 mt-2 bg-transparent"
        onClick={onCaptureNow}
        disabled={isCapturing}
      >
        {isCapturing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        {isCapturing ? "Capturing..." : "Capture Now"}
      </Button>
    </div>
  )
}

// Scroll Config Editor
function ScrollConfigEditor({
  config,
  onChange,
  onPickSelector,
  isPicking,
}: {
  config: ScrollConfig
  onChange: (config: ScrollConfig) => void
  onPickSelector: () => void
  isPicking: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Scroll Type</Label>
        <Select
          value={config.scrollType}
          onValueChange={(v) => onChange({ ...config, scrollType: v as ScrollConfig["scrollType"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="toSelector">To Selector (CSS)</SelectItem>
            <SelectItem value="intoView">Into View (scrollIntoView)</SelectItem>
            <SelectItem value="toPosition">To Position (scrollTo)</SelectItem>
            <SelectItem value="byAmount">By Amount (scrollBy)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(config.scrollType === "toSelector" || config.scrollType === "intoView") && (
        <div className="space-y-1">
          <Label className="text-xs">CSS Selector</Label>
          <div className="flex gap-1">
            <Input
              placeholder="#element or .class"
              value={config.selector || ""}
              onChange={(e) => onChange({ ...config, selector: e.target.value })}
              className="h-8 text-xs font-mono flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-transparent"
              onClick={onPickSelector}
              disabled={isPicking}
            >
              {isPicking ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MousePointer2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {(config.scrollType === "toPosition" || config.scrollType === "byAmount") && (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">X</Label>
            <Input
              type="number"
              value={config.x || 0}
              onChange={(e) => onChange({ ...config, x: Number.parseInt(e.target.value) || 0 })}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Y</Label>
            <Input
              type="number"
              value={config.y || 0}
              onChange={(e) => onChange({ ...config, y: Number.parseInt(e.target.value) || 0 })}
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Behavior</Label>
        <Select
          value={config.behavior}
          onValueChange={(v) => onChange({ ...config, behavior: v as "smooth" | "instant" | "auto" })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smooth">Smooth</SelectItem>
            <SelectItem value="instant">Instant</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.scrollType === "intoView" && (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Block</Label>
            <Select
              value={config.block || "center"}
              onValueChange={(v) => onChange({ ...config, block: v as "start" | "center" | "end" | "nearest" })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">Start</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="end">End</SelectItem>
                <SelectItem value="nearest">Nearest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Inline</Label>
            <Select
              value={config.inline || "nearest"}
              onValueChange={(v) => onChange({ ...config, inline: v as "start" | "center" | "end" | "nearest" })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">Start</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="end">End</SelectItem>
                <SelectItem value="nearest">Nearest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}

// Evaluate Config Editor
function EvaluateConfigEditor({
  config,
  onChange,
  variables,
}: {
  config: EvaluateConfig
  onChange: (config: EvaluateConfig) => void
  variables?: Record<string, string>
}) {
  const [testResult, setTestResult] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const templateCtx = {
    vars: variables || {},
    timestamp: Math.floor(Date.now() / 1000),
    timestampMs: Date.now(),
  }

  const resolveTargetTabId = async (cfg: EvaluateConfig) => {
    if (cfg.target === "specificTab") {
      const raw = applyRequestTemplate(cfg.specificTabId || "", templateCtx).trim()
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) {
        throw new Error("Invalid tab id for specific tab")
      }
      return parsed
    }

    if (cfg.target === "anyTabMatchingScope") {
      const regexStr = (cfg.scopeUrlRegex || "").trim()
      if (!regexStr) throw new Error("Scope regex is required for tab matching")
      const res = await sandboxRpc({ type: "tabs.query", scopeUrlRegex: regexStr })
      const tabs = (res as any)?.tabs || []
      const match = tabs.find((t: any) => t?.url && new RegExp(regexStr).test(t.url))
      if (!match?.id) throw new Error("No tab matches the provided scope regex")
      return match.id
    }

    return undefined
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const cfg: EvaluateConfig = {
        ...defaultEvaluateConfig,
        ...config,
        code: applyRequestTemplate(config.code || "", templateCtx),
        args:
          config.mode === "expression"
            ? []
            : (config.args || []).map((a) => ({
                ...a,
                value: applyRequestTemplate(a.value ?? "", templateCtx),
              })),
      }

      const preparedArgs =
        cfg.mode === "expression"
          ? []
          : (cfg.args || []).map((a, idx) => ({
              ...a,
              resolvedValue: (() => {
                switch (a.type) {
                  case "number":
                    return Number(a.value ?? "")
                  case "boolean": {
                    const val = String(a.value ?? "").trim().toLowerCase()
                    if (["true", "1", "yes", "on"].includes(val)) return true
                    if (["false", "0", "no", "off", ""].includes(val)) return false
                    return Boolean(a.value)
                  }
                  case "json":
                    try {
                      return JSON.parse(a.value || "null")
                    } catch {
                      return a.value
                    }
                  case "string":
                  default:
                    return a.value ?? ""
                }
              })(),
            }))

      const targetTabId = await resolveTargetTabId(cfg)
      const resRaw = await sandboxRpc({
        type: "tabs.sendMessage",
        tabId: targetTabId,
        message: {
          type: "automation:run:step",
          step: {
            type: "evaluate",
            config: { ...cfg, args: preparedArgs },
            evaluateConfig: { ...cfg, args: preparedArgs },
            vars: variables || {},
          },
        },
      })
      const res = (resRaw as any)?.res ?? resRaw

      const ok = res?.ok
      const result = (res as any)?.result
      const error = (res as any)?.error
      if (!ok) throw new Error(error || "Evaluation failed")

      setTestResult(JSON.stringify({ ok: true, result }, null, 2))
    } catch (err: any) {
      setTestResult(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2))
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-2">
      <Tabs defaultValue="code" className="w-full">
        <TabsList className="h-7 w-full">
          <TabsTrigger value="code" className="text-xs flex-1">
            Code
          </TabsTrigger>
          {config.mode === "function" && (
            <TabsTrigger value="output" className="text-xs flex-1">
              Output
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="code" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select
                value={config.mode}
                onValueChange={(v) =>
                  onChange({
                    ...config,
                    mode: v as "expression" | "function",
                    args: v === "expression" ? [] : config.args,
                    code:
                      v === "function"
                        ? config.code?.trim()
                          ? config.code
                          : "async function main() {\n  // return value to save\n}\n"
                        : config.code,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expression">Expression</SelectItem>
                  <SelectItem value="function">Function</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Textarea
              value={config.code}
              onChange={(e) => onChange({ ...config, code: e.target.value })}
              className="h-24 text-xs font-mono"
              placeholder={
                config.mode === "expression"
                  ? "document.title\n// you can also use {{vars.token}}"
                  : "async function main(arg1) {\n  return { ok: true, value: {{vars.result}} }\n}"
              }
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Arguments</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                disabled={config.mode === "expression"}
                onClick={() => onChange({ ...config, args: [...config.args, { name: "", type: "string", value: "" }] })}
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>
            {config.args.map((arg, i) => (
              <div key={i} className="flex gap-1">
                <Input
                  placeholder="name"
                  value={arg.name}
                  onChange={(e) => {
                    const newArgs = [...config.args]
                    newArgs[i] = { ...newArgs[i], name: e.target.value }
                    onChange({ ...config, args: newArgs })
                  }}
                  className="h-7 text-xs w-20"
                  disabled={config.mode === "expression"}
                />
                <Select
                  value={arg.type}
                  onValueChange={(v) => {
                    const newArgs = [...config.args]
                    newArgs[i] = { ...newArgs[i], type: v as "string" | "number" | "boolean" | "json" }
                    onChange({ ...config, args: newArgs })
                  }}
                  disabled={config.mode === "expression"}
                >
                  <SelectTrigger className="h-7 text-xs w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="json">json</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="value"
                  value={arg.value}
                  onChange={(e) => {
                    const newArgs = [...config.args]
                    newArgs[i] = { ...newArgs[i], value: e.target.value }
                    onChange({ ...config, args: newArgs })
                  }}
                  className="h-7 text-xs flex-1"
                  title="Supports {{vars.*}} placeholders"
                  placeholder="value or {{vars.result}}"
                  disabled={config.mode === "expression"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onChange({ ...config, args: config.args.filter((_, idx) => idx !== i) })}
                  disabled={config.mode === "expression"}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {config.mode === "expression" && (
              <p className="text-[10px] text-muted-foreground">
                Arguments are disabled in expression mode. Use variables directly in the expression (e.g. {"{{vars.result}}"})
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="context" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Run In</Label>
              <Select
                value={config.runIn}
                onValueChange={(v) => onChange({ ...config, runIn: v as "page" | "background" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Page Context</SelectItem>
                  <SelectItem value="background">Background</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Target</Label>
              <Select
                value={config.target}
                onValueChange={(v) =>
                  onChange({ ...config, target: v as "currentTab" | "specificTab" | "anyTabMatchingScope" })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="currentTab">Current Tab</SelectItem>
                  <SelectItem value="specificTab">Specific Tab</SelectItem>
                  <SelectItem value="anyTabMatchingScope">Any Matching Scope</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.target === "specificTab" && (
            <div className="space-y-1">
              <Label className="text-xs">Tab ID</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="e.g. 123 or {{vars.tabId}}"
                value={config.specificTabId || ""}
                onChange={(e) => onChange({ ...config, specificTabId: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">Uses this tabId instead of the current tab.</p>
            </div>
          )}

          {config.target === "anyTabMatchingScope" && (
            <div className="space-y-1">
              <Label className="text-xs">Scope URL Regex</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder=".*example\\.com.*"
                value={config.scopeUrlRegex || ""}
                onChange={(e) => onChange({ ...config, scopeUrlRegex: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">First tab whose URL matches will be used.</p>
            </div>
          )}
        </TabsContent>

        {config.mode === "function" && (
          <TabsContent value="output" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Expect Type</Label>
              <Select
                value={config.expect}
                onValueChange={(v) =>
                  onChange({ ...config, expect: v as "any" | "string" | "number" | "boolean" | "object" | "array" })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="object">Object</SelectItem>
                  <SelectItem value="array">Array</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Save As</Label>
              <Input
                placeholder="vars.result"
                value={config.saveAs}
                onChange={(e) => onChange({ ...config, saveAs: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.saveOnlyIfOk}
                onCheckedChange={(checked) => onChange({ ...config, saveOnlyIfOk: checked })}
                className="scale-75"
              />
              <Label className="text-xs">Save only if OK</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.failOnFalsy}
                onCheckedChange={(checked) => onChange({ ...config, failOnFalsy: checked })}
                className="scale-75"
              />
              <Label className="text-xs">Fail on falsy</Label>
            </div>
          </div>
          </TabsContent>
        )}
      </Tabs>

      <div className="border-t border-border pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs gap-1.5 bg-transparent"
          onClick={handleTest}
          disabled={isTesting}
        >
          <Play className={`h-3 w-3 ${isTesting ? "animate-spin" : ""}`} />
          {isTesting ? "Testing..." : "Test / Preview"}
        </Button>
        {testResult && (
          <div className="mt-2 p-2 rounded bg-secondary/50 border border-border">
            <pre className="text-[10px] font-mono text-muted-foreground overflow-x-auto">{testResult}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

// Step Item Component for rendering individual steps (reusable for nested steps)
function StepItem({
  step,
  index,
  workflowId,
  indentLevel = 0,
  blockId,
  branch,
  onEdit,
  dragHandlers,
  isLocked,
}: {
  step: Step
  index: number
  workflowId: string
  indentLevel?: number
  blockId?: string
  branch?: "if" | "else"
  onEdit: (step: Step, context?: { blockId: string; branch: "if" | "else" }) => void
  dragHandlers?: {
    onDragStart: (index: number) => void
    onDragOver: (e: React.DragEvent, index: number) => void
    onDrop: (index: number) => void
    onDragEnd: () => void
    isDragging: boolean
    isDragOver: boolean
  }
  isLocked: boolean
}) {
  const { updateStep, deleteStep, updateStepInBlock, deleteStepFromBlock } = useAutomation()

  const truncateText = (text: string, max = 10) => {
    if (text.length <= max) return text
    return text.slice(0, max - 3) + "..."
  }

  const getStepIcon = (type: string) => {
    switch (type) {
      case "click":
        return MousePointer
      case "type":
        return Keyboard
      case "wait":
        return Clock
      case "extract":
        return Database
      case "select":
        return ChevronDown
      case "evaluate":
        return Code
      case "scroll":
        return ArrowDownToLine
      case "screenshot":
        return Camera
      case "goTo":
        return ArrowRight
      case "sendCookies":
        return Cookie
      case "sendPageSource":
        return FileCode
      case "request":
        return Send
      default:
        return MousePointer
    }
  }

  const Icon = getStepIcon(step.type)
  const selectorLabel = step.selector ? truncateText(step.selector, 20) : null
  const goToLabel = step.goToUrl ? truncateText(step.goToUrl, 26) : null

  const handleToggle = (checked: boolean) => {
    if (isLocked) return
    if (blockId && branch) {
      updateStepInBlock(workflowId, blockId, branch, step.id, { enabled: checked })
    } else {
      updateStep(workflowId, step.id, { enabled: checked })
    }
  }

  const handleDelete = () => {
    if (isLocked) return
    if (blockId && branch) {
      deleteStepFromBlock(workflowId, blockId, branch, step.id)
    } else {
      deleteStep(workflowId, step.id)
    }
  }

  return (
    <div
      draggable={!!dragHandlers && !isLocked}
      onDragStart={() => !isLocked && dragHandlers?.onDragStart(index)}
      onDragOver={(e) => !isLocked && dragHandlers?.onDragOver(e, index)}
      onDrop={() => !isLocked && dragHandlers?.onDrop(index)}
      onDragEnd={() => !isLocked && dragHandlers?.onDragEnd()}
      style={{ marginLeft: indentLevel * 16 }}
      className={`flex items-center gap-2 p-2 rounded-md border transition-all ${
        dragHandlers?.isDragging
          ? "opacity-50 border-primary bg-primary/10"
          : dragHandlers?.isDragOver
            ? "border-dashed border-primary bg-primary/5"
            : "border-border bg-card hover:bg-secondary/50"
      } ${!step.enabled ? "opacity-50" : ""} ${dragHandlers ? "cursor-move" : ""}`}
    >
      {dragHandlers && (
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing" />
      )}
      <div className="p-1.5 rounded bg-primary/15 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{step.name}</span>
        </div>
        {selectorLabel && (
          <p className="text-[10px] text-muted-foreground font-mono truncate" title={step.selector}>
            {selectorLabel}
          </p>
        )}
        {!selectorLabel && goToLabel && (
          <p className="text-[10px] text-muted-foreground font-mono truncate" title={step.goToUrl}>
            {goToLabel}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Switch checked={step.enabled} onCheckedChange={handleToggle} className="scale-75" disabled={isLocked} />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(step, blockId && branch ? { blockId, branch } : undefined)}
          disabled={isLocked}
        >
          <Settings2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={isLocked}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// IF/ELSE Block Component
function IfElseBlock({
  block,
  index,
  workflowId,
  onEdit,
  onAddStepToBlock,
  dragHandlers,
  isLocked,
}: {
  block: ConditionalBlock
  index: number
  workflowId: string
  onEdit: (step: Step, context?: { blockId: string; branch: "if" | "else" }) => void
  onAddStepToBlock: (blockId: string, branch: "if" | "else") => void
  dragHandlers?: {
    onDragStart: (index: number) => void
    onDragOver: (e: React.DragEvent, index: number) => void
    onDrop: (index: number) => void
    onDragEnd: () => void
    isDragging: boolean
    isDragOver: boolean
  }
  isLocked: boolean
}) {
  const { updateStep, deleteStep } = useAutomation()
  const [isOpen, setIsOpen] = useState(true)

  const isDragging = dragHandlers?.isDragging ?? false
  const isDragOver = dragHandlers?.isDragOver ?? false

  return (
    <div
      draggable={!isLocked && !!dragHandlers}
      onDragStart={() => !isLocked && dragHandlers?.onDragStart(index)}
      onDragOver={(e) => !isLocked && dragHandlers?.onDragOver(e, index)}
      onDrop={() => !isLocked && dragHandlers?.onDrop(index)}
      onDragEnd={() => !isLocked && dragHandlers?.onDragEnd()}
      className={`rounded-lg border transition-all ${
        isDragging
          ? "opacity-50 border-primary bg-primary/10"
          : isDragOver
            ? "border-dashed border-primary bg-primary/5"
            : "border-amber-500/30 bg-amber-500/5"
      } ${!block.enabled ? "opacity-50" : ""}`}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 p-2 cursor-pointer hover:bg-amber-500/10 rounded-t-lg">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing" />
            <div className="p-1.5 rounded bg-amber-500/15 text-amber-500">
              <GitBranch className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{block.name}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30"
                >
                  IF/ELSE
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                {block.condition.type}: {block.condition.selector || block.condition.variable || block.condition.value}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              <Switch
                checked={block.enabled}
                onCheckedChange={(checked) => !isLocked && updateStep(workflowId, block.id, { enabled: checked })}
                className="scale-75"
                disabled={isLocked}
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteStep(workflowId, block.id)
                }}
                disabled={isLocked}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-2 pb-2 space-y-2">
            {/* IF Branch */}
            <div className="ml-4 border-l-2 border-green-500/30 pl-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-green-500 uppercase">IF (true)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-green-500 hover:text-green-400"
                  onClick={() => onAddStepToBlock(block.id, "if")}
                  disabled={isLocked}
                >
                  <PlusCircle className="h-3 w-3 mr-0.5" />
                  Add Step
                </Button>
              </div>
              <div className="space-y-1">
                {block.ifSteps.length === 0 ? (
                  <div className="p-2 text-[10px] text-muted-foreground text-center border border-dashed border-border rounded">
                    No steps in IF branch
                  </div>
                ) : (
                  block.ifSteps.map((step, i) => (
                    <StepItem
                      key={step.id}
                      step={step}
                      index={i}
                      workflowId={workflowId}
                      blockId={block.id}
                      branch="if"
                      onEdit={(st, _ctx) => onEdit(st, { blockId: block.id, branch: "if" })}
                      isLocked={isLocked}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ELSE Branch */}
            <div className="ml-4 border-l-2 border-red-500/30 pl-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-red-500 uppercase">ELSE (false)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-red-500 hover:text-red-400"
                  onClick={() => onAddStepToBlock(block.id, "else")}
                  disabled={isLocked}
                >
                  <PlusCircle className="h-3 w-3 mr-0.5" />
                  Add Step
                </Button>
              </div>
              <div className="space-y-1">
                {block.elseSteps.length === 0 ? (
                  <div className="p-2 text-[10px] text-muted-foreground text-center border border-dashed border-border rounded">
                    No steps in ELSE branch
                  </div>
                ) : (
                  block.elseSteps.map((step, i) => (
                    <StepItem
                      key={step.id}
                      step={step}
                      index={i}
                      workflowId={workflowId}
                      blockId={block.id}
                      branch="else"
                      onEdit={(st, _ctx) => onEdit(st, { blockId: block.id, branch: "else" })}
                      isLocked={isLocked}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export function StepsTab({ workflowId, initialSelector, onSelectorConsumed }: StepsTabProps) {
  const {
    getWorkflow,
    addStep,
    updateStep,
    updateStepInBlock,
    deleteStep,
    reorderSteps,
    addStepToBlock,
    setVariable,
    deleteVariable,
    isPicking,
    setIsPicking,
    setPickedSelector,
    setOnPickComplete,
    // REMOVED: selectedWorkflowId - use workflowId prop instead for consistency
  } = useAutomation()

  const workflow = getWorkflow(workflowId)
  const steps = workflow?.steps || []
  const variables = workflow?.variables || {}
  const stepsLocked = workflow ? workflow.status !== "paused" : false

  // State for modals
  const [addStepOpen, setAddStepOpen] = useState(false)
  const [addIfElseOpen, setAddIfElseOpen] = useState(false)
  const [editStepOpen, setEditStepOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<Step | null>(null)
  const [editingContext, setEditingContext] = useState<{ blockId: string; branch: "if" | "else" } | null>(null)

  // State for adding step to block
  const [addingToBlock, setAddingToBlock] = useState<{ blockId: string; branch: "if" | "else" } | null>(null)

  // New step form state
  const [newStepType, setNewStepType] = useState<StepType>("click")
  const [newStepName, setNewStepName] = useState("")
  const [newStepSelector, setNewStepSelector] = useState("")
  const [newStepGoToUrl, setNewStepGoToUrl] = useState("")
  const [newStepClickMode, setNewStepClickMode] = useState<"single" | "double">("single")
  const [newStepTimeout, setNewStepTimeout] = useState(5000)
  const [newStepRetries, setNewStepRetries] = useState(1)
  const [newStepOnFailure, setNewStepOnFailure] = useState<"stop" | "skip" | "goto" | "fallback">("stop")
  const [newStepGotoStep, setNewStepGotoStep] = useState("")
  const [newStepFallbackCode, setNewStepFallbackCode] = useState("")

  // Type/Select specific
  const [newStepValueSource, setNewStepValueSource] = useState<ValueSourceConfig>(() => createDefaultValueSource())

  // Request specific
  const [newStepServerUrl, setNewStepServerUrl] = useState("")
  const [newStepRequestMethod, setNewStepRequestMethod] = useState<"GET" | "POST" | "PUT" | "DELETE">("GET")
  const [newStepHeaders, setNewStepHeaders] = useState<{ key: string; value: string }[]>([])
  const [newStepRequestContentType, setNewStepRequestContentType] = useState<string>("application/json")
  const [newStepCookieAll, setNewStepCookieAll] = useState(true)
  const [newStepCookieDomain, setNewStepCookieDomain] = useState("")
  const [newStepCookieNames, setNewStepCookieNames] = useState<string[]>([""])
  const [newStepRequestBody, setNewStepRequestBody] = useState("")
  const [newStepResponsePath, setNewStepResponsePath] = useState("")
  const [newStepSaveToVar, setNewStepSaveToVar] = useState("")

  // Config states
  const [newStepScrollConfig, setNewStepScrollConfig] = useState<ScrollConfig>({
    scrollType: "toSelector",
    behavior: "smooth",
  })
  const [newStepEvaluateConfig, setNewStepEvaluateConfig] = useState<EvaluateConfig>({ ...defaultEvaluateConfig })
  const [newStepWaitConfig, setNewStepWaitConfig] = useState<WaitConfig>({ ...defaultWaitConfig })
  const [newStepExtractConfig, setNewStepExtractConfig] = useState<ExtractConfig>({ ...defaultExtractConfig })
  const [newStepScreenshotConfig, setNewStepScreenshotConfig] = useState<ScreenshotConfig>({
    ...defaultScreenshotConfig,
  })
  const [isPreviewingScreenshot, setIsPreviewingScreenshot] = useState(false)

  // Form state for IF/ELSE
  const [conditionType, setConditionType] = useState<ConditionType>("selectorExists")
  const [conditionSelector, setConditionSelector] = useState("")
  const [conditionText, setConditionText] = useState("") // Added for text conditions
  const [conditionAttr, setConditionAttr] = useState("") // Added for attribute conditions
  const [conditionAttrValue, setConditionAttrValue] = useState("") // Added for attribute conditions
  const [conditionVarName, setConditionVarName] = useState("") // Added for variable conditions
  const [conditionVarValue, setConditionVarValue] = useState("") // Added for variable conditions
  const [conditionUrlPattern, setConditionUrlPattern] = useState("") // Added for URL conditions
  const [conditionRegex, setConditionRegex] = useState("") // Added for regex conditions
  const [ifElseName, setIfElseName] = useState("")

  // Variables state
  const [showVariables, setShowVariables] = useState(false)
  const [newVarKey, setNewVarKey] = useState("")
  const [newVarValue, setNewVarValue] = useState("")

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    if (initialSelector && !stepsLocked) {
      setNewStepSelector(initialSelector)
      setAddStepOpen(true)
      if (onSelectorConsumed) {
        onSelectorConsumed()
      }
    }
  }, [initialSelector, onSelectorConsumed, stepsLocked])

  useEffect(() => {
    if (stepsLocked) {
      setAddStepOpen(false)
      setAddIfElseOpen(false)
      setEditStepOpen(false)
      setAddingToBlock(null)
      setEditingStep(null)
      setEditingContext(null)
      setDraggedIndex(null)
      setDragOverIndex(null)
    }
  }, [stepsLocked])

  useEffect(() => {
    if (
      (newStepType === "sendCookies" || newStepType === "sendPageSource") &&
      (newStepRequestMethod === "GET" || newStepRequestMethod === "DELETE")
    ) {
      setNewStepRequestMethod("POST")
    }
  }, [newStepRequestMethod, newStepType])

  const resetNewStepForm = () => {
    setNewStepType("click")
    setNewStepName("")
    setNewStepSelector("")
    setNewStepGoToUrl("")
    setNewStepClickMode("single")
    setNewStepTimeout(5000)
    setNewStepRetries(1)
    setNewStepOnFailure("stop")
    setNewStepGotoStep("")
    setNewStepFallbackCode("")
    setNewStepValueSource(createDefaultValueSource())
    setNewStepServerUrl("")
    setNewStepRequestMethod("GET")
    setNewStepHeaders([])
    setNewStepRequestContentType("application/json")
    setNewStepCookieAll(true)
    setNewStepCookieDomain("")
    setNewStepCookieNames([""])
    setNewStepRequestBody("")
    setNewStepResponsePath("")
    setNewStepSaveToVar("")
    setNewStepScrollConfig({ scrollType: "toSelector", behavior: "smooth" })
    setNewStepEvaluateConfig({ ...defaultEvaluateConfig })
    setNewStepWaitConfig({ ...defaultWaitConfig })
    setNewStepExtractConfig({ ...defaultExtractConfig })
    setNewStepScreenshotConfig({ ...defaultScreenshotConfig })
    setAddingToBlock(null)
  }

  const resetIfElseForm = () => {
    setConditionType("selectorExists")
    setConditionSelector("")
    setConditionText("")
    setConditionAttr("")
    setConditionAttrValue("")
    setConditionVarName("")
    setConditionVarValue("")
    setConditionUrlPattern("")
    setConditionRegex("")
    setIfElseName("")
  }

  const handleCreateStep = () => {
    if (stepsLocked) return
    const stepId = "step-" + Date.now()

    const defaultStepName =
      newStepType === "goTo" ? "Go To" : newStepType.charAt(0).toUpperCase() + newStepType.slice(1) + " Step"
    const newStep: Step = {
      id: stepId,
      type: newStepType,
      name: newStepName || defaultStepName,
      enabled: true,
      selector: newStepSelector || undefined,
      clickMode: newStepType === "click" ? newStepClickMode : undefined,
      timeout: newStepTimeout,
      retries: newStepRetries,
      onFailure: newStepOnFailure,
      gotoStep: newStepOnFailure === "goto" ? newStepGotoStep || undefined : undefined,
      fallbackCode: newStepOnFailure === "fallback" ? newStepFallbackCode || undefined : undefined,
    }

    // Add type-specific properties
    if (newStepType === "goTo") {
      newStep.goToUrl = newStepGoToUrl.trim()
    }

    if (newStepType === "type" || newStepType === "select") {
      newStep.valueSource = newStepValueSource
      if (newStepValueSource.type === "fixed") {
        newStep.value = newStepValueSource.fixedValue
      }
    }

    if (newStepSaveToVar.trim()) {
      newStep.saveTo = newStepSaveToVar.trim()
    }

    if (newStepType === "request") {
      newStep.serverUrl = newStepServerUrl
      newStep.requestMethod = newStepRequestMethod
      newStep.headers = newStepHeaders
      newStep.requestContentType = newStepRequestContentType === "none" ? undefined : newStepRequestContentType
      newStep.requestBody = newStepRequestBody
      newStep.responseJsonPath = newStepResponsePath
    }

    if (newStepType === "sendCookies") {
      newStep.serverUrl = newStepServerUrl
      newStep.requestMethod = newStepRequestMethod
      newStep.headers = newStepHeaders
      newStep.cookieAll = newStepCookieAll
      if (!newStepCookieAll) {
        const domain = newStepCookieDomain.trim()
        const cookieNames = newStepCookieNames.map((name) => name.trim()).filter(Boolean)
        if (domain) {
          newStep.cookieDomain = domain
        }
        if (cookieNames.length) {
          newStep.cookieNames = cookieNames
        }
      } else {
        newStep.cookieDomain = undefined
        newStep.cookieNames = undefined
      }
    }

    if (newStepType === "sendPageSource") {
      newStep.serverUrl = newStepServerUrl
      newStep.requestMethod = newStepRequestMethod === "PUT" ? "PUT" : "POST"
      newStep.headers = newStepHeaders
    }

    if (newStepType === "scroll") {
      newStep.scrollConfig = newStepScrollConfig
    }

    if (newStepType === "evaluate") {
      newStep.evaluateConfig = newStepEvaluateConfig
    }

    if (newStepType === "wait") {
      newStep.waitConfig = newStepWaitConfig
    }

    if (newStepType === "extract") {
      newStep.extractConfig = newStepExtractConfig
    }

    if (newStepType === "screenshot") {
      newStep.screenshotConfig = newStepScreenshotConfig
    }

    if (addingToBlock) {
      addStepToBlock(workflowId, addingToBlock.blockId, addingToBlock.branch, newStep)
    } else {
      addStep(workflowId, newStep)
    }

    setAddStepOpen(false)
    resetNewStepForm()
  }

  const handleCreateIfElse = () => {
    if (stepsLocked) return
    const blockId = "block-" + Date.now()

    const condConfig: ConditionConfig = {
      type: conditionType,
      selector: conditionSelector,
      text: conditionText,
      attributeName: conditionAttr,
      attributeValue: conditionAttrValue,
      variableName: conditionVarName,
      variableValue: conditionVarValue,
      urlPattern: conditionUrlPattern,
      regexPattern: conditionRegex,
    }

    const newBlock: ConditionalBlock = {
      id: blockId,
      type: "if-else",
      name: ifElseName || "IF/ELSE Block",
      enabled: true,
      condition: condConfig,
      ifSteps: [],
      elseSteps: [],
    }

    addStep(workflowId, newBlock)
    setAddIfElseOpen(false)
    resetIfElseForm()
  }

  const handleEditStep = (step: Step, context?: { blockId: string; branch: "if" | "else" }) => {
    if (stepsLocked) return
    let preparedStep = step
    if (step.type === "type" || step.type === "select") {
      const normalizedValueSource = normalizeValueSource(step.valueSource, step.value ?? "")
      preparedStep = {
        ...step,
        valueSource: normalizedValueSource,
        value: normalizedValueSource.type === "fixed" ? normalizedValueSource.fixedValue ?? "" : undefined,
      }
    }

    setEditingStep(preparedStep)
    setEditingContext(context ?? null)
    setEditStepOpen(true)
  }

  const handleUpdateStep = () => {
    if (stepsLocked) return
    if (editingStep) {
      if (editingContext) {
        updateStepInBlock(workflowId, editingContext.blockId, editingContext.branch, editingStep.id, editingStep)
      } else {
        updateStep(workflowId, editingStep.id, editingStep)
      }
      setEditStepOpen(false)
      setEditingStep(null)
      setEditingContext(null)
    }
  }

  const cancelPicking = useCallback(() => {
    setIsPicking(false)
    setPickedSelector(null)
    setOnPickComplete(null)
  }, [setIsPicking, setOnPickComplete, setPickedSelector])

  const handlePickStepSelector = useCallback(
    (applySelector?: (selector: string) => void) => {
      if (stepsLocked) return
      const apply = applySelector ?? ((selector: string) => setNewStepSelector(selector))

      if (isPicking) {
        cancelPicking()
        return
      }

      setPickedSelector(null)
      setOnPickComplete(() => (selector: string) => {
        apply(selector)
      })
      setIsPicking(true)
    },
    [cancelPicking, isPicking, setIsPicking, setNewStepSelector, setOnPickComplete, setPickedSelector, stepsLocked],
  )

  const handleAddStepToBlock = (blockId: string, branch: "if" | "else") => {
    if (stepsLocked) return
    setAddingToBlock({ blockId, branch })
    setAddStepOpen(true)
  }

  const handleAddVariable = () => {
    if (newVarKey.trim() && newVarValue.trim()) {
      setVariable(workflowId, newVarKey.trim(), newVarValue.trim())
      setNewVarKey("")
      setNewVarValue("")
    }
  }

  // Drag handlers
  const handleDragStart = (index: number) => {
    if (stepsLocked) return
    setDraggedIndex(index)
  }
  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (stepsLocked) return
    e.preventDefault()
    setDragOverIndex(index)
  }
  const handleDrop = (index: number) => {
    if (stepsLocked) return
    if (draggedIndex !== null && draggedIndex !== index) {
      reorderSteps(workflowId, draggedIndex, index)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }
  const handleDragEnd = () => {
    if (stepsLocked) return
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const getStepIcon = (type: string) => {
    switch (type) {
      case "click":
        return MousePointer
      case "type":
        return Keyboard
      case "wait":
        return Clock
      case "extract":
        return Database
      case "select":
        return ChevronDown
      case "evaluate":
        return Code
      case "scroll":
        return ArrowDownToLine
      case "screenshot":
        return Camera
      case "goTo":
        return ArrowRight
      case "sendCookies":
        return Cookie
      case "sendPageSource":
        return FileCode
      case "request":
        return Send
      case "if-else":
        return GitBranch
      default:
        return MousePointer
    }
  }

  // Condition categories for IF/ELSE
  const conditionCategories = [
    {
      label: "Selector",
      options: [
        { value: "selectorExists", label: "Exists" },
        { value: "selectorNotExists", label: "Not Exists" },
        { value: "elementVisible", label: "Visible" },
        { value: "elementHidden", label: "Hidden" },
        { value: "elementEnabled", label: "Enabled" },
        { value: "elementDisabled", label: "Disabled" },
      ],
    },
    {
      label: "Text",
      options: [
        { value: "textContains", label: "Contains" },
        { value: "textEquals", label: "Equals" },
        { value: "textNotContains", label: "Not Contains" },
      ],
    },
    {
      label: "URL",
      options: [
        { value: "urlMatches", label: "Matches" },
        { value: "urlEquals", label: "Equals" },
      ],
    },
    {
      label: "Variable",
      options: [
        { value: "variableEquals", label: "Equals" },
        { value: "variableNotEquals", label: "Not Equals" },
        { value: "variableGreater", label: "Greater Than" },
        { value: "variableLess", label: "Less Than" },
        { value: "variableEmpty", label: "Is Empty" },
        { value: "variableNotEmpty", label: "Not Empty" },
      ],
    },
    {
      label: "Attribute",
      options: [
        { value: "attributeEquals", label: "Equals" },
        { value: "attributeContains", label: "Contains" },
      ],
    },
    { label: "Regex", options: [{ value: "regexMatches", label: "Matches Pattern" }] },
  ]

  const buildScreenshotFileName = useCallback(
    (template: string | undefined, format: "png" | "jpeg") => {
      const wf = getWorkflow(workflowId)
      const now = Date.now()
      const ctx = {
        workflow: wf?.name,
        workflowName: wf?.name,
        workflowId: wf?.id,
        step: "screenshot",
        stepName: "Screenshot",
        date: new Date(now).toISOString().slice(0, 10),
        timestamp: Math.floor(now / 1000),
        timestampMs: now,
      }
      const applied = applyRequestTemplate(template || "", ctx).trim()
      const fallback = `screenshot_${ctx.timestamp}`
      const baseName = applied || fallback
      const sanitized = baseName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/\.+$/, "")
      const ext = format === "jpeg" ? "jpg" : "png"
      return sanitized.toLowerCase().endsWith(`.${ext}`) ? sanitized : `${sanitized}.${ext}`
    },
    [getWorkflow, workflowId],
  )

  const handleScreenshotPreview = useCallback(
    async (cfg: ScreenshotConfig, fallbackSelector?: string) => {
      setIsPreviewingScreenshot(true)
      try {
        const mergedCfg: ScreenshotConfig = {
          ...defaultScreenshotConfig,
          ...cfg,
          selector: cfg.selector || fallbackSelector || cfg.selector,
        }
        const fileName = buildScreenshotFileName(mergedCfg.fileNameTemplate, mergedCfg.format)
        const stepPayload = {
          type: "screenshot",
          config: mergedCfg,
          screenshotConfig: mergedCfg,
          selector: mergedCfg.selector,
        }
        const res = await sandboxRpc({
          type: "tabs.sendMessage",
          message: { type: "automation:run:step", step: stepPayload },
        })
        const shotRes = (res as any)?.res ?? res
        if (!shotRes?.ok || !shotRes.dataUrl) {
          throw new Error(shotRes?.error || "Capture failed")
        }
        await sandboxRpc({ type: "download.dataUrl", dataUrl: shotRes.dataUrl, fileName })
      } catch (err: any) {
        console.error("Screenshot capture failed", err)
      } finally {
        setIsPreviewingScreenshot(false)
      }
    },
    [buildScreenshotFileName],
  )

  const needsSelector = [
    "selectorExists",
    "selectorNotExists",
    "elementVisible",
    "elementHidden",
    "elementEnabled",
    "elementDisabled",
    "textContains",
    "textEquals",
    "textNotContains",
    "attributeEquals",
    "attributeContains",
  ].includes(conditionType)
  const needsValue = [
    "textContains",
    "textEquals",
    "textNotContains",
    "urlMatches",
    "urlEquals",
    "variableEquals",
    "variableNotEquals",
    "variableGreater",
    "variableLess",
    "attributeEquals",
    "attributeContains",
  ].includes(conditionType)
  const needsVariable = [
    "variableEquals",
    "variableNotEquals",
    "variableGreater",
    "variableLess",
    "variableEmpty",
    "variableNotEmpty",
  ].includes(conditionType)
  const needsAttribute = ["attributeEquals", "attributeContains"].includes(conditionType)
  const needsPattern = ["regexMatches"].includes(conditionType)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-card/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{steps.length} Steps</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setShowVariables(!showVariables)}
          >
            <Variable className="h-3 w-3" />
            {Object.keys(variables).length} Vars
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 px-2 bg-transparent"
            onClick={() => setAddStepOpen(true)}
            disabled={stepsLocked}
          >
            <Plus className="h-3 w-3" />
            Add Step
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 px-2 bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
            onClick={() => setAddIfElseOpen(true)}
            disabled={stepsLocked}
          >
            <GitBranch className="h-3 w-3" />
            Add IF/ELSE
          </Button>
        </div>
      </div>

      {stepsLocked && (
        <div className="mx-3 mb-2 p-2 rounded border border-amber-500/30 bg-amber-500/10 text-amber-900 text-[11px]">
          Trigger is ON. Set it to OFF in the header to edit, create, or reorder steps.
        </div>
      )}

      {/* Variables Panel */}
      {showVariables && (
        <div className="p-2 border-b border-border bg-secondary/30 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Braces className="h-3.5 w-3.5" />
              Variables
            </span>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {Object.entries(variables).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1.5 p-1.5 rounded bg-card border border-border">
                <code className="text-[10px] font-mono text-primary flex-1 truncate">{`{{vars.${key}}}`}</code>
                <span className="text-[10px] text-muted-foreground truncate max-w-20">{value}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive"
                  onClick={() => deleteVariable(workflowId, key)}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            <Input
              placeholder="key"
              value={newVarKey}
              onChange={(e) => setNewVarKey(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            <Input
              placeholder="value"
              value={newVarValue}
              onChange={(e) => setNewVarValue(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            <Button size="sm" className="h-7 px-2" onClick={handleAddVariable}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Steps List - Changed to min-h-0 to allow ScrollArea to work properly */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-2">
            {steps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Zap className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No steps yet. Add your first step!</p>
              </div>
            ) : (
              steps.map((step, index) => {
                const isConditional = step.type === "if-else"
                const isDragging = draggedIndex === index
                const isDragOver = dragOverIndex === index

                if (isConditional) {
                  return (
                    <IfElseBlock
                      key={step.id}
                      block={step as ConditionalBlock}
                      index={index}
                      workflowId={workflowId}
                      onEdit={handleEditStep}
                      onAddStepToBlock={handleAddStepToBlock}
                      dragHandlers={
                        stepsLocked
                          ? undefined
                          : {
                              onDragStart: handleDragStart,
                              onDragOver: handleDragOver,
                              onDrop: handleDrop,
                              onDragEnd: handleDragEnd,
                              isDragging,
                              isDragOver,
                            }
                      }
                      isLocked={stepsLocked}
                    />
                  )
                }

                return (
                  <StepItem
                    key={step.id}
                    step={step as Step}
                    index={index}
                    workflowId={workflowId}
                    onEdit={handleEditStep}
                    dragHandlers={
                      stepsLocked
                        ? undefined
                        : {
                            onDragStart: handleDragStart,
                            onDragOver: handleDragOver,
                            onDrop: handleDrop,
                            onDragEnd: handleDragEnd,
                            isDragging,
                            isDragOver,
                          }
                    }
                    isLocked={stepsLocked}
                  />
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Add Step Modal */}
      <PersistentModal
        open={addStepOpen}
        onClose={() => {
          setAddStepOpen(false)
          resetNewStepForm()
        }}
        title={addingToBlock ? `Add Step to ${addingToBlock.branch.toUpperCase()} Branch` : "Add Step"}
        footer={
          <Button className="w-full h-8 text-xs" onClick={handleCreateStep} disabled={stepsLocked}>
            Create Step
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Step Type</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { type: "click", icon: MousePointer, label: "Click" },
                  { type: "type", icon: Keyboard, label: "Type" },
                  { type: "wait", icon: Clock, label: "Wait" },
                  { type: "extract", icon: Database, label: "Extract" },
                  { type: "select", icon: ChevronDown, label: "Select" },
                  { type: "evaluate", icon: Code, label: "Evaluate" },
                  { type: "scroll", icon: ArrowDownToLine, label: "Scroll" },
                  { type: "screenshot", icon: Camera, label: "Screenshot" },
                  { type: "goTo", icon: ArrowRight, label: "Go To" },
                  { type: "request", icon: Send, label: "Request" },
                  { type: "sendCookies", icon: Cookie, label: "Cookies" },
                  { type: "sendPageSource", icon: FileCode, label: "Page Source" },
                ] as const
              ).map(({ type, icon: Icon, label }) => (
                <Button
                  key={type}
                  variant={newStepType === type ? "default" : "outline"}
                  size="sm"
                  className="h-10 flex-col gap-0.5 text-[9px] px-1"
                  onClick={() => setNewStepType(type)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Step Name</Label>
            <Input
              placeholder="Enter step name..."
              value={newStepName}
              onChange={(e) => setNewStepName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Selector field for basic step types */}
          {["click", "type", "select"].includes(newStepType) && (
            <div className="space-y-1">
              <Label className="text-xs">CSS Selector</Label>
              <div className="flex gap-1">
                <Input
                  placeholder="#element or .class"
                  value={newStepSelector}
                  onChange={(e) => setNewStepSelector(e.target.value)}
                  className="h-8 text-xs font-mono flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 bg-transparent"
                  onClick={() => handlePickStepSelector()}
                  disabled={isPicking}
                >
                  {isPicking ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MousePointer2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {newStepType === "goTo" && (
            <div className="space-y-1">
              <Label className="text-xs">Target URL</Label>
              <Input
                placeholder="https://example.com/page"
                value={newStepGoToUrl}
                onChange={(e) => setNewStepGoToUrl(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[9px] text-muted-foreground">
                Templates are supported ({"{{vars.*}}"}, {"{{timestamp}}"}, {"{{url}}"}).
              </p>
            </div>
          )}

          {newStepType === "click" && (
            <div className="space-y-1">
              <Label className="text-xs">Click Mode</Label>
              <Select value={newStepClickMode} onValueChange={(v) => setNewStepClickMode(v as "single" | "double")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single click</SelectItem>
                  <SelectItem value="double">Double click</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {newStepType === "wait" && (
            <WaitConfigEditor
              config={newStepWaitConfig}
              onChange={setNewStepWaitConfig}
              onPickSelector={() =>
                handlePickStepSelector((selector) =>
                  setNewStepWaitConfig((prev) => ({
                    ...prev,
                    selector,
                  })),
                )
              }
              isPicking={isPicking}
            />
          )}

          {newStepType === "extract" && (
            <ExtractConfigEditor
              config={newStepExtractConfig}
              onChange={setNewStepExtractConfig}
              onPickSelector={() =>
                handlePickStepSelector((selector) =>
                  setNewStepExtractConfig((prev) => ({
                    ...prev,
                    selector,
                  })),
                )
              }
              isPicking={isPicking}
            />
          )}

          {newStepType === "screenshot" && (
            <ScreenshotConfigEditor
              config={newStepScreenshotConfig}
              onChange={setNewStepScreenshotConfig}
              onPickSelector={() =>
                handlePickStepSelector((selector) =>
                  setNewStepScreenshotConfig((prev) => ({
                    ...prev,
                    selector,
                  })),
                )
              }
              isPicking={isPicking}
              onCaptureNow={() => handleScreenshotPreview(newStepScreenshotConfig)}
              isCapturing={isPreviewingScreenshot}
            />
          )}

          {newStepType === "scroll" && (
            <ScrollConfigEditor
              config={newStepScrollConfig}
              onChange={setNewStepScrollConfig}
              onPickSelector={() =>
                handlePickStepSelector((selector) =>
                  setNewStepScrollConfig((prev) => ({
                    ...prev,
                    selector,
                  })),
                )
              }
              isPicking={isPicking}
            />
          )}

          {newStepType === "evaluate" && (
            <EvaluateConfigEditor
              config={newStepEvaluateConfig}
              onChange={setNewStepEvaluateConfig}
              variables={variables}
            />
          )}

          {(newStepType === "type" || newStepType === "select") && (
            <ValueSourceEditor
              valueSource={newStepValueSource}
              onChange={setNewStepValueSource}
              label={newStepType === "type" ? "Text to Type" : "Option Value"}
            />
          )}

          {newStepType === "request" && (
            <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Send className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Request Configuration</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Request URL</Label>
                <Input
                  placeholder="https://api.example.com/endpoint"
                  value={newStepServerUrl}
                  onChange={(e) => setNewStepServerUrl(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={newStepRequestMethod}
                    onValueChange={(v) => setNewStepRequestMethod(v as typeof newStepRequestMethod)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Content-Type</Label>
                  <Select
                    value={newStepRequestContentType}
                    onValueChange={(v) => setNewStepRequestContentType(v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                <SelectContent>
                  <SelectItem value="application/json">application/json</SelectItem>
                  <SelectItem value="text/plain">text/plain</SelectItem>
                  <SelectItem value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</SelectItem>
                  <SelectItem value="none">(none)</SelectItem>
                </SelectContent>
              </Select>
            </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Response JSON Path</Label>
                  <Input
                    placeholder="data.result"
                    value={newStepResponsePath}
                    onChange={(e) => setNewStepResponsePath(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">
                Templates work in URL, headers, body and response path (use {"{{vars.token}}"}, {"{{timestamp}}"}, {"{{url}}"}).
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Request Body</Label>
                <Textarea
                  placeholder={`{
  "token": "{{vars.authToken}}",
  "user": "{{vars.userId}}",
  "page": "{{url}}",
  "ts": "{{timestamp}}"
}`}
                  value={newStepRequestBody}
                  onChange={(e) => setNewStepRequestBody(e.target.value)}
                  className="h-24 text-xs font-mono"
                />
                <p className="text-[9px] text-muted-foreground">
                  Supports {"{{vars.*}}"} plus {"{{timestamp}}"} and {"{{url}}"} for dynamic payloads.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Save response to variable (optional)</Label>
                <Input
                  placeholder="result or vars.result"
                  value={newStepSaveToVar}
                  onChange={(e) => setNewStepSaveToVar(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[9px] text-muted-foreground">
                  Response JSON path is applied first; value is stored and available as {"{{vars.yourKey}}"}.
                </p>
              </div>
            </div>
          )}

          {newStepType === "sendCookies" && (
            <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Cookie className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Send Cookies Configuration</span>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Send all cookies</Label>
                <Switch
                  checked={newStepCookieAll}
                  onCheckedChange={(checked) => {
                    setNewStepCookieAll(checked)
                    if (checked) {
                      setNewStepCookieDomain("")
                      setNewStepCookieNames([""])
                    }
                  }}
                  className="scale-75"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Server URL</Label>
                <Input
                  placeholder="https://api.example.com/cookies"
                  value={newStepServerUrl}
                  onChange={(e) => setNewStepServerUrl(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select
                  value={newStepRequestMethod}
                  onValueChange={(v) => setNewStepRequestMethod(v as typeof newStepRequestMethod)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!newStepCookieAll && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Cookie Domain</Label>
                    <Input
                      placeholder=".google.com"
                      value={newStepCookieDomain}
                      onChange={(e) => setNewStepCookieDomain(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <p className="text-[9px] text-muted-foreground">Same domain used when reading cookies</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Cookie Names</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setNewStepCookieNames([...newStepCookieNames, ""])}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {newStepCookieNames.map((name, idx) => (
                      <div key={idx} className="flex gap-1">
                        <Input
                          placeholder=".AspNet.ApplicationCookie"
                          value={name}
                          onChange={(e) => {
                            const names = [...newStepCookieNames]
                            names[idx] = e.target.value
                            setNewStepCookieNames(names)
                          }}
                          className="h-8 text-xs font-mono flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            const names = newStepCookieNames.filter((_, i) => i !== idx)
                            setNewStepCookieNames(names.length ? names : [""])
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {newStepType === "sendPageSource" && (
            <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
              <div className="flex items-center gap-2 mb-1.5">
                <FileCode className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Send Page Source</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Captures the full HTML (with DOCTYPE) of the active tab and posts it to your server.
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Server URL</Label>
                <Input
                  placeholder="https://api.example.com/page-source"
                  value={newStepServerUrl}
                  onChange={(e) => setNewStepServerUrl(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select
                  value={newStepRequestMethod === "PUT" ? "PUT" : "POST"}
                  onValueChange={(v) => setNewStepRequestMethod(v as typeof newStepRequestMethod)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Headers</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setNewStepHeaders([...(newStepHeaders || []), { key: "", value: "" }])}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {(newStepHeaders || []).map((header, idx) => (
                  <div key={idx} className="flex gap-1">
                    <Input
                      placeholder="Authorization"
                      value={header.key}
                      onChange={(e) => {
                        const headers = [...newStepHeaders]
                        headers[idx] = { ...headers[idx], key: e.target.value }
                        setNewStepHeaders(headers)
                      }}
                      className="h-8 text-xs font-mono flex-1"
                    />
                    <Input
                      placeholder="Bearer token..."
                      value={header.value}
                      onChange={(e) => {
                        const headers = [...newStepHeaders]
                        headers[idx] = { ...headers[idx], value: e.target.value }
                        setNewStepHeaders(headers)
                      }}
                      className="h-8 text-xs font-mono flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setNewStepHeaders(newStepHeaders.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {(!newStepHeaders || newStepHeaders.length === 0) && (
                  <p className="text-[9px] text-muted-foreground">Optional: include auth headers for the upload.</p>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground">
                Payload sent as JSON: {"{ html, tabUrl, length, timestamp }"}.
              </p>
            </div>
          )}

          <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
            <Label className="text-xs">On Failure</Label>
            <Select value={newStepOnFailure} onValueChange={(v) => setNewStepOnFailure(v as Step["onFailure"])}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stop">Stop Workflow</SelectItem>
                <SelectItem value="skip">Skip Step</SelectItem>
                <SelectItem value="goto">Go to Step</SelectItem>
                <SelectItem value="fallback">Use Fallback</SelectItem>
              </SelectContent>
            </Select>

            {newStepOnFailure === "goto" && (
              <div className="space-y-1">
                <Label className="text-xs">Jump to Step</Label>
                <Select
                  value={newStepGotoStep}
                  onValueChange={(v) => setNewStepGotoStep(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {steps.map((s) => (
                      <SelectItem key={(s as any).id} value={(s as any).id}>
                        {(s as any).name || (s as any).id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newStepOnFailure === "fallback" && (
              <div className="space-y-1">
                <Label className="text-xs">Fallback Code (runs in page)</Label>
                <Textarea
                  placeholder="// JavaScript to recover when this step fails"
                  value={newStepFallbackCode}
                  onChange={(e) => setNewStepFallbackCode(e.target.value)}
                  className="h-24 text-xs font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </PersistentModal>

      {/* Add IF/ELSE Modal */}
      <PersistentModal
        open={addIfElseOpen}
        onClose={() => setAddIfElseOpen(false)}
        title="Add IF/ELSE Block"
        footer={
          <Button className="w-full h-8 text-xs" onClick={handleCreateIfElse} disabled={stepsLocked}>
            Create IF/ELSE Block
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Block Name</Label>
            <Input
              placeholder="Conditional Block"
              value={ifElseName}
              onChange={(e) => setIfElseName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Condition Type</Label>
            <Select value={conditionType} onValueChange={(v) => setConditionType(v as ConditionType)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {conditionCategories.map((cat) => (
                  <div key={cat.label}>
                    <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">{cat.label}</div>
                    {cat.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsSelector && (
            <div className="space-y-1">
              <Label className="text-xs">CSS Selector</Label>
              <div className="flex gap-1">
                <Input
                  placeholder="#element or .class"
                  value={conditionSelector}
                  onChange={(e) => setConditionSelector(e.target.value)}
                  className="h-8 text-xs font-mono flex-1"
                />
                <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" disabled={isPicking}>
                  <MousePointer2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {needsVariable && (
            <div className="space-y-1">
              <Label className="text-xs">Variable Name</Label>
              <Input
                placeholder="vars.myVariable"
                value={conditionVarName}
                onChange={(e) => setConditionVarName(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {needsAttribute && (
            <div className="space-y-1">
              <Label className="text-xs">Attribute Name</Label>
              <Input
                placeholder="data-loaded"
                value={conditionAttr}
                onChange={(e) => setConditionAttr(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {needsValue && (
            <div className="space-y-1">
              <Label className="text-xs">Value to Compare</Label>
              <Input
                placeholder="Expected value..."
                value={
                  conditionType === "variableEquals" ||
                  conditionType === "variableNotEquals" ||
                  conditionType === "variableGreater" ||
                  conditionType === "variableLess"
                    ? conditionVarValue
                    : conditionType === "urlMatches"
                      ? conditionUrlPattern
                      : conditionType === "regexMatches"
                        ? conditionRegex
                        : conditionText
                }
                onChange={(e) => {
                  if (
                    conditionType === "variableEquals" ||
                    conditionType === "variableNotEquals" ||
                    conditionType === "variableGreater" ||
                    conditionType === "variableLess"
                  ) {
                    setConditionVarValue(e.target.value)
                  } else if (conditionType === "urlMatches") {
                    setConditionUrlPattern(e.target.value)
                  } else if (conditionType === "regexMatches") {
                    setConditionRegex(e.target.value)
                  } else if (
                    conditionType === "textContains" ||
                    conditionType === "textEquals" ||
                    conditionType === "textNotContains"
                  ) {
                    setConditionText(e.target.value)
                  } else if (conditionType === "attributeEquals" || conditionType === "attributeContains") {
                    setConditionAttrValue(e.target.value)
                  }
                }}
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>
      </PersistentModal>

      {/* Edit Step Modal */}
      <PersistentModal
        open={editStepOpen}
        onClose={() => {
          setEditStepOpen(false)
          setEditingStep(null)
          setEditingContext(null)
        }}
        title="Edit Step"
        footer={
          editingStep ? (
            <Button className="w-full h-8 text-xs" onClick={handleUpdateStep} disabled={stepsLocked}>
              Save Changes
            </Button>
          ) : null
        }
      >
        {editingStep && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Step Name</Label>
              <Input
                value={editingStep.name}
                onChange={(e) => setEditingStep({ ...editingStep, name: e.target.value })}
                className="h-8 text-xs"
              />
            </div>

            {editingStep.selector !== undefined && (
              <div className="space-y-1">
                <Label className="text-xs">CSS Selector</Label>
                <Input
                  value={editingStep.selector || ""}
                  onChange={(e) => setEditingStep({ ...editingStep, selector: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {editingStep.type === "goTo" && (
              <div className="space-y-1">
                <Label className="text-xs">Target URL</Label>
                <Input
                  value={editingStep.goToUrl || ""}
                  onChange={(e) => setEditingStep({ ...editingStep, goToUrl: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {editingStep.type === "click" && (
              <div className="space-y-1">
                <Label className="text-xs">Click Mode</Label>
                <Select
                  value={editingStep.clickMode || "single"}
                  onValueChange={(v) => setEditingStep({ ...editingStep, clickMode: v as "single" | "double" })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single click</SelectItem>
                    <SelectItem value="double">Double click</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(editingStep.type === "type" || editingStep.type === "select") && (
              <ValueSourceEditor
                valueSource={normalizeValueSource(editingStep.valueSource, editingStep.value ?? "")}
                onChange={(vs) =>
                  setEditingStep((prev) =>
                    prev
                      ? {
                          ...prev,
                          valueSource: vs,
                          value: vs.type === "fixed" ? vs.fixedValue ?? "" : undefined,
                        }
                      : prev,
                  )
                }
                label={editingStep.type === "type" ? "Text to Type" : "Option Value"}
              />
            )}

            {editingStep.value !== undefined && editingStep.type !== "type" && editingStep.type !== "select" && (
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  value={editingStep.value || ""}
                  onChange={(e) => setEditingStep({ ...editingStep, value: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Timeout (ms)</Label>
                <Input
                  type="number"
                  value={editingStep.timeout}
                  onChange={(e) => setEditingStep({ ...editingStep, timeout: Number.parseInt(e.target.value) || 5000 })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Retries</Label>
                <Input
                  type="number"
                  value={editingStep.retries}
                  onChange={(e) => setEditingStep({ ...editingStep, retries: Number.parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">On Failure</Label>
              <Select
                value={editingStep.onFailure}
                onValueChange={(v) => setEditingStep({ ...editingStep, onFailure: v as Step["onFailure"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop">Stop Workflow</SelectItem>
                  <SelectItem value="skip">Skip Step</SelectItem>
                  <SelectItem value="goto">Go to Step</SelectItem>
                  <SelectItem value="fallback">Use Fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editingStep.onFailure === "goto" && (
              <div className="space-y-1">
                <Label className="text-xs">Jump to Step</Label>
                <Select
                  value={editingStep.gotoStep || ""}
                  onValueChange={(v) => setEditingStep({ ...editingStep, gotoStep: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {steps.map((s) => (
                      <SelectItem key={(s as any).id} value={(s as any).id}>
                        {(s as any).name || (s as any).id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editingStep.onFailure === "fallback" && (
              <div className="space-y-1">
                <Label className="text-xs">Fallback Code (runs in page)</Label>
                <Textarea
                  placeholder="// JavaScript to recover when this step fails"
                  value={editingStep.fallbackCode || ""}
                  onChange={(e) => setEditingStep({ ...editingStep, fallbackCode: e.target.value })}
                  className="h-24 text-xs font-mono"
                />
              </div>
            )}

            {editingStep.type === "evaluate" && (
              <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                <EvaluateConfigEditor
                  config={{ ...defaultEvaluateConfig, ...(editingStep.evaluateConfig || {}) }}
                  onChange={(cfg) => setEditingStep({ ...editingStep, evaluateConfig: cfg })}
                  variables={variables}
                />
              </div>
            )}

            {editingStep.type === "scroll" && (
              <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                <ScrollConfigEditor
                  config={{
                    scrollType: "toSelector",
                    behavior: "smooth",
                    ...editingStep.scrollConfig,
                    selector: editingStep.scrollConfig?.selector || editingStep.selector || "",
                  }}
                  onChange={(cfg) =>
                    setEditingStep({
                      ...editingStep,
                      selector: cfg.selector || editingStep.selector,
                      scrollConfig: cfg,
                    })
                  }
                  onPickSelector={() =>
                    handlePickStepSelector((selector) =>
                      setEditingStep((prev) =>
                        prev
                          ? {
                              ...prev,
                              selector,
                              scrollConfig: { ...(prev.scrollConfig || {}), selector },
                            }
                          : prev,
                      ),
                    )
                  }
                  isPicking={isPicking}
                />
              </div>
            )}

            {editingStep.type === "extract" && (
              <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                <ExtractConfigEditor
                  config={{
                    ...defaultExtractConfig,
                    ...editingStep.extractConfig,
                    selector: editingStep.extractConfig?.selector || editingStep.selector || "",
                  }}
                  onChange={(cfg) => {
                    setEditingStep({
                      ...editingStep,
                      selector: cfg.selector,
                      extractConfig: cfg,
                    })
                  }}
                  onPickSelector={() =>
                    handlePickStepSelector((selector) =>
                      setEditingStep((prev) =>
                        prev
                          ? {
                              ...prev,
                              selector,
                              extractConfig: { ...(prev.extractConfig || {}), selector },
                            }
                          : prev,
                      ),
                    )
                  }
                  isPicking={isPicking}
                />
              </div>
            )}

            {editingStep.type === "screenshot" && (
              <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                <ScreenshotConfigEditor
                  config={{
                    ...defaultScreenshotConfig,
                    ...editingStep.screenshotConfig,
                    selector: editingStep.screenshotConfig?.selector || editingStep.selector || "",
                  }}
                  onChange={(cfg) => {
                    setEditingStep({
                      ...editingStep,
                      selector: cfg.selector || editingStep.selector,
                      screenshotConfig: cfg,
                    })
                  }}
                  onPickSelector={() =>
                    handlePickStepSelector((selector) =>
                      setEditingStep((prev) =>
                        prev
                          ? {
                              ...prev,
                              selector,
                              screenshotConfig: { ...(prev.screenshotConfig || {}), selector },
                            }
                          : prev,
                      ),
                    )
                  }
                  isPicking={isPicking}
                  onCaptureNow={() =>
                    handleScreenshotPreview({
                      ...defaultScreenshotConfig,
                      ...editingStep.screenshotConfig,
                      selector: editingStep.screenshotConfig?.selector || editingStep.selector || "",
                    }, editingStep.selector || editingStep.screenshotConfig?.selector)
                  }
                  isCapturing={isPreviewingScreenshot}
                />
              </div>
            )}

            {editingStep.type === "request" && (
              <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Request URL</Label>
                    <Input
                      value={editingStep.serverUrl || ""}
                      onChange={(e) => setEditingStep({ ...editingStep, serverUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Method</Label>
                    <Select
                      value={editingStep.requestMethod || "GET"}
                      onValueChange={(v) =>
                        setEditingStep({ ...editingStep, requestMethod: v as Step["requestMethod"] })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Response JSON Path</Label>
                  <Input
                    placeholder="data.value"
                    value={editingStep.responseJsonPath || ""}
                    onChange={(e) => setEditingStep({ ...editingStep, responseJsonPath: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Content-Type</Label>
                    <Select
                      value={editingStep.requestContentType || "application/json"}
                      onValueChange={(v) => setEditingStep({ ...editingStep, requestContentType: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="application/json">application/json</SelectItem>
                        <SelectItem value="text/plain">text/plain</SelectItem>
                        <SelectItem value="application/x-www-form-urlencoded">
                          application/x-www-form-urlencoded
                        </SelectItem>
                        <SelectItem value="none">(none)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1" />
                </div>

                <p className="text-[9px] text-muted-foreground">
                  Templates work in URL, headers, body and response path (use {"{{vars.token}}"}, {"{{timestamp}}"}, {"{{url}}"}).
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Headers</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() =>
                        setEditingStep({
                          ...editingStep,
                          headers: [...(editingStep.headers || []), { key: "", value: "" }],
                        })
                      }
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  {(editingStep.headers || []).map((header, idx) => (
                    <div key={idx} className="flex gap-1">
                      <Input
                        placeholder="Key"
                        value={header.key}
                        onChange={(e) => {
                          const headers = [...(editingStep.headers || [])]
                          headers[idx] = { ...headers[idx], key: e.target.value }
                          setEditingStep({ ...editingStep, headers })
                        }}
                        className="h-8 text-xs flex-1"
                      />
                      <Input
                        placeholder="Value"
                        value={header.value}
                        onChange={(e) => {
                          const headers = [...(editingStep.headers || [])]
                          headers[idx] = { ...headers[idx], value: e.target.value }
                          setEditingStep({ ...editingStep, headers })
                        }}
                        className="h-8 text-xs flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          const headers = (editingStep.headers || []).filter((_, i) => i !== idx)
                          setEditingStep({ ...editingStep, headers })
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Request Body</Label>
                  <Textarea
                    placeholder={`{
  "token": "{{vars.authToken}}",
  "user": "{{vars.userId}}",
  "page": "{{url}}",
  "ts": "{{timestamp}}"
}`}
                    value={editingStep.requestBody || ""}
                    onChange={(e) => setEditingStep({ ...editingStep, requestBody: e.target.value })}
                    className="h-24 text-xs font-mono"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Supports {"{{vars.*}}"} plus {"{{timestamp}}"} and {"{{url}}"} for dynamic payloads.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Save response to variable (optional)</Label>
                  <Input
                    placeholder="result or vars.result"
                    value={editingStep.saveTo || ""}
                    onChange={(e) => setEditingStep({ ...editingStep, saveTo: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Response JSON path is applied first; value is stored and available as {"{{vars.yourKey}}"}.
                  </p>
                </div>
              </div>
            )}

            {editingStep.type === "sendPageSource" && (
              <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <FileCode className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">Send Page Source</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Sends the current tab HTML (doctype + documentElement.outerHTML) as JSON to your endpoint.
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Server URL</Label>
                  <Input
                    placeholder="https://api.example.com/page-source"
                    value={editingStep.serverUrl || ""}
                    onChange={(e) => setEditingStep({ ...editingStep, serverUrl: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={editingStep.requestMethod === "PUT" ? "PUT" : "POST"}
                    onValueChange={(v) => setEditingStep({ ...editingStep, requestMethod: v as Step["requestMethod"] })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Headers</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() =>
                        setEditingStep({
                          ...editingStep,
                          headers: [...(editingStep.headers || []), { key: "", value: "" }],
                        })
                      }
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  {(editingStep.headers || []).map((header, idx) => (
                    <div key={idx} className="flex gap-1">
                      <Input
                        placeholder="Key"
                        value={header.key}
                        onChange={(e) => {
                          const headers = [...(editingStep.headers || [])]
                          headers[idx] = { ...headers[idx], key: e.target.value }
                          setEditingStep({ ...editingStep, headers })
                        }}
                        className="h-8 text-xs flex-1"
                      />
                      <Input
                        placeholder="Value"
                        value={header.value}
                        onChange={(e) => {
                          const headers = [...(editingStep.headers || [])]
                          headers[idx] = { ...headers[idx], value: e.target.value }
                          setEditingStep({ ...editingStep, headers })
                        }}
                        className="h-8 text-xs flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          const headers = (editingStep.headers || []).filter((_, i) => i !== idx)
                          setEditingStep({ ...editingStep, headers })
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {(editingStep.headers || []).length === 0 && (
                    <p className="text-[9px] text-muted-foreground">Optional headers for auth or routing.</p>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground">
                  Payload: {"{ html, tabUrl, length, timestamp }"} with JSON content-type.
                </p>
              </div>
            )}

            {editingStep.type === "sendCookies" &&
              (() => {
                const cookieAll =
                  editingStep.cookieAll ??
                  !(editingStep.cookieDomain || (editingStep.cookieNames && editingStep.cookieNames.length))
                const cookieNames =
                  editingStep.cookieNames && editingStep.cookieNames.length > 0 ? editingStep.cookieNames : [""]

                return (
                  <div className="space-y-2 border border-border rounded-md p-3 bg-secondary/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Send all cookies</Label>
                      <Switch
                        checked={cookieAll}
                        onCheckedChange={(checked) =>
                          setEditingStep({
                            ...editingStep,
                            cookieAll: checked,
                            cookieDomain: checked ? undefined : editingStep.cookieDomain,
                            cookieNames: checked ? [] : cookieNames,
                          })
                        }
                        className="scale-75"
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Server URL</Label>
                        <Input
                          value={editingStep.serverUrl || ""}
                          onChange={(e) => setEditingStep({ ...editingStep, serverUrl: e.target.value })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Method</Label>
                        <Select
                          value={editingStep.requestMethod || "POST"}
                          onValueChange={(v) =>
                            setEditingStep({ ...editingStep, requestMethod: v as Step["requestMethod"] })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {!cookieAll && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Cookie Domain</Label>
                          <Input
                            placeholder=".google.com"
                            value={editingStep.cookieDomain || ""}
                            onChange={(e) => setEditingStep({ ...editingStep, cookieDomain: e.target.value })}
                            className="h-8 text-xs font-mono"
                          />
                          <p className="text-[9px] text-muted-foreground">Same domain used when reading cookies</p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Cookie Names</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() =>
                                setEditingStep({
                                  ...editingStep,
                                  cookieNames: [...(editingStep.cookieNames || []), ""],
                                })
                              }
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </div>
                          {cookieNames.map((name, idx) => (
                            <div key={idx} className="flex gap-1">
                              <Input
                                placeholder=".AspNet.ApplicationCookie"
                                value={name}
                                onChange={(e) => {
                                  const names = [...cookieNames]
                                  names[idx] = e.target.value
                                  setEditingStep({ ...editingStep, cookieNames: names })
                                }}
                                className="h-8 text-xs font-mono flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  const names = cookieNames.filter((_, i) => i !== idx)
                                  setEditingStep({ ...editingStep, cookieNames: names.length ? names : [""] })
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

            <div className="flex items-center gap-2">
              <Switch
                checked={editingStep.enabled}
                onCheckedChange={(checked) => setEditingStep({ ...editingStep, enabled: checked })}
              />
              <Label className="text-xs">Enabled</Label>
            </div>
          </div>
        )}
      </PersistentModal>
    </div>
  )
}
