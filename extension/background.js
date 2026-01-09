let lastHostTabId = null;
const LAST_TAB_KEY = "runyx:lastHostTabId";
const PROJECTS_KEY = "runyx:projects";
const AUTOMATION_KEY = "runyx:automation-state";
const IMPORT_PATH = "local/import.json";

async function importProjectFile() {
  try {
    const url = chrome.runtime.getURL(IMPORT_PATH);
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return;

    const payload = await resp.json();
    if (!payload || typeof payload !== "object") return;

    const project = payload.project;
    const workflows = Array.isArray(payload.workflows) ? payload.workflows : null;
    if (!project || typeof project.id !== "string" || !workflows) return;

    const projectId = project.id;
    const safeWorkflows = workflows.filter((wf) => wf && typeof wf.id === "string");
    const workflowIds = Array.isArray(project.workflowIds) ? project.workflowIds : safeWorkflows.map((wf) => wf.id);
    const selectedWorkflowId = safeWorkflows[0]?.id || "";

    const data = {
      [PROJECTS_KEY]: {
        projects: [{ ...project, workflowIds }],
        selectedProjectId: projectId,
      },
      [AUTOMATION_KEY]: {
        workflowsByProject: { [projectId]: safeWorkflows },
        selectedWorkflowByProject: { [projectId]: selectedWorkflowId },
        isRunnerActive: false,
      },
    };

    await chrome.storage.local.set(data);
  } catch (err) {
    console.warn("[SW] import file failed", err);
  }
}

importProjectFile();
const broadcastBrowserEvent = async (eventName, tabId, url, isActive) => {
  if (!url) return;
  let active = isActive;
  try {
    if (active === undefined && tabId) {
      const tab = await chrome.tabs.get(tabId);
      active = !!tab?.active;
    }
  } catch (err) {
    console.warn("[SW] failed to read tab active state", err);
  }

  try {
    await chrome.runtime.sendMessage({
      type: "automation:browserEvent",
      event: eventName,
      tabId,
      url,
      active,
    });
  } catch (err) {
    // UI might not be open; ignore "Receiving end does not exist"
    const msg = err?.message || "";
    if (!msg.includes("Receiving end does not exist")) {
      console.warn("[SW] broadcastBrowserEvent failed", err);
    }
  }
};

async function loadLastHostTabId() {
  if (lastHostTabId) return lastHostTabId;
  try {
    const data = await chrome.storage.local.get([LAST_TAB_KEY]);
    const stored = data?.[LAST_TAB_KEY];
    if (typeof stored === "number") {
      lastHostTabId = stored;
    }
  } catch (err) {
    console.warn("[SW] failed to load lastHostTabId", err);
  }
  return lastHostTabId;
}

// Garante que clicar no ícone abra o side panel automaticamente
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("[SW] setPanelBehavior failed", err));
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;

  lastHostTabId = tab.id; // <- tab do site onde o usuário clicou na extensão

  (async () => {
    try {
      if (chrome.sidePanel?.setOptions) {
        await chrome.sidePanel.setOptions({ tabId: tab.id, path: "ui.html" });
      }
    } catch (err) {
      console.warn("[SW] sidePanel.setOptions failed", err);
    }

    // Persistência pode acontecer depois sem depender do gesto
    try {
      await chrome.storage.local.set({ [LAST_TAB_KEY]: tab.id });
    } catch (err) {
      console.warn("[SW] failed to persist lastHostTabId", err);
    }
  })();
});

// Browser event triggers (tabs/webNavigation) -> forward to UI sandbox
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo?.url || tab?.url;
  if (!url) return;
  void broadcastBrowserEvent("tabs:updated", tabId, url, tab?.active);
});

chrome.tabs.onActivated.addListener((info) => {
  const tabId = info?.tabId;
  if (!tabId) return;
  chrome.tabs
    .get(tabId)
    .then((tab) => {
      if (tab?.url) {
        void broadcastBrowserEvent("tabs:activated", tab.id, tab.url, true);
      }
    })
    .catch((err) => console.warn("[SW] tabs.get failed for onActivated", err));
});

if (chrome.webNavigation?.onCompleted) {
  chrome.webNavigation.onCompleted.addListener((details) => {
    if (details?.url) {
      void broadcastBrowserEvent("navigation:completed", details.tabId, details.url);
    }
  });
}

// Helper: garante que content script existe (injeta se faltar)
async function ensureContentScript(tabId) {
  try {
    // ping: se responder, já está injetado
    await chrome.tabs.sendMessage(tabId, { type: "runyx:ping" });
    return true;
  } catch (e) {
    // "Receiving end does not exist" -> injeta
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["contentScript.js"],
      });
      console.log("[SW] injected contentScript.js into tab", tabId);
      return true;
    } catch (injErr) {
      console.error("[SW] failed to inject content script", injErr);
      return false;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SANDBOX_RPC") {
    console.log("[SW onMessage]", message, "sender:", sender);
  }

  if (message?.type === "runyx:capture-visible") {
    (async () => {
      try {
        const format = message.format === "jpeg" ? "jpeg" : "png";
        const quality =
          typeof message.quality === "number" && format === "jpeg"
            ? Math.max(10, Math.min(100, Math.round(message.quality)))
            : undefined;

        let targetTabId = message.tabId ?? lastHostTabId;
        if (!targetTabId) {
          targetTabId = await loadLastHostTabId();
        }
        if (!targetTabId) {
          sendResponse({ ok: false, error: "No tabId available for screenshot." });
          return;
        }

        const tabInfo = await chrome.tabs.get(targetTabId);
        const windowId = tabInfo?.windowId;
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format, quality });

        if (!dataUrl) {
          const errMsg = chrome.runtime.lastError?.message || "Capture failed";
          sendResponse({ ok: false, error: errMsg });
          return;
        }

        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (message?.type !== "SANDBOX_RPC") return;

  (async () => {
    try {
      const payload = message.payload;

      // tabs.query -> suporta scopeUrlRegex, query custom ou fallback para lastHostTabId
      if (payload?.type === "tabs.query") {
        try {
          let tabs = [];
          if (payload.scopeUrlRegex) {
            const all = await chrome.tabs.query({});
            const re = new RegExp(payload.scopeUrlRegex);
            tabs = all.filter((t) => t.url && re.test(t.url));
          } else if (payload.query && typeof payload.query === "object") {
            tabs = await chrome.tabs.query(payload.query);
          } else {
            if (!lastHostTabId) {
              await loadLastHostTabId();
            }
            if (lastHostTabId) {
              const tab = await chrome.tabs.get(lastHostTabId);
              tabs = tab ? [tab] : [];
            }
          }

          if (!tabs || tabs.length === 0) {
            sendResponse({ ok: false, error: "No tab found", tabs: [] });
            return;
          }

          sendResponse({ ok: true, tabs });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        return;
      }

      // tabs.sendMessage -> garante content script e envia
      if (payload?.type === "tabs.sendMessage") {
        let tabId = payload.tabId ?? lastHostTabId;
        if (!tabId) {
          tabId = await loadLastHostTabId();
        }
        if (!tabId) {
          sendResponse({ ok: false, error: "No tabId available." });
          return;
        }

        const ok = await ensureContentScript(tabId);
        if (!ok) {
          sendResponse({ ok: false, error: "Content script not available and injection failed." });
          return;
        }

        const res = await chrome.tabs.sendMessage(tabId, payload.message);
        sendResponse({ ok: true, res });
        return;
      }

      // tabs.update -> navega o tab para uma nova URL
      if (payload?.type === "tabs.update") {
        let tabId = payload.tabId ?? lastHostTabId;
        if (!tabId) {
          tabId = await loadLastHostTabId();
        }
        if (!tabId) {
          sendResponse({ ok: false, error: "No tabId available." });
          return;
        }

        const updateProps = payload.updateProperties || {};
        const updatedTab = await chrome.tabs.update(tabId, updateProps);
        sendResponse({ ok: true, tab: updatedTab });
        return;
      }

      // storage.get -> pega valores do chrome.storage.local
      if (payload?.type === "storage.get") {
        const keys = payload.keys ?? null; // null = get all
        const data = await chrome.storage.local.get(keys);
        sendResponse({ ok: true, data });
        return;
      }

      // storage.set -> grava no chrome.storage.local
      if (payload?.type === "storage.set") {
        const data = payload.data;
        if (!data || typeof data !== "object") {
          sendResponse({ ok: false, error: "storage.set expects an object in payload.data" });
          return;
        }
        await chrome.storage.local.set(data);
        sendResponse({ ok: true });
        return;
      }

      // storage.remove -> remove chaves
      if (payload?.type === "storage.remove") {
        const keys = payload.keys;
        if (!keys) {
          sendResponse({ ok: false, error: "storage.remove expects payload.keys" });
          return;
        }
        await chrome.storage.local.remove(keys);
        sendResponse({ ok: true });
        return;
      }

      // storage.clear -> limpa tudo
      if (payload?.type === "storage.clear") {
        await chrome.storage.local.clear();
        sendResponse({ ok: true });
        return;
      }

      // cookies.sendToServer -> coleta cookies e envia para um endpoint
      if (payload?.type === "cookies.sendToServer") {
        try {
          let targetTabId = payload.tabId ?? lastHostTabId;
          if (!targetTabId) {
            targetTabId = await loadLastHostTabId();
          }
          if (!targetTabId) {
            sendResponse({ ok: false, error: "No tabId available for cookies." });
            return;
          }

          const tabInfo = await chrome.tabs.get(targetTabId);
          const tabUrl = payload.tabUrl || tabInfo?.url;

          const cookieAll = payload.cookieAll !== false;
          const cookieDomain = payload.cookieDomain || (tabUrl ? new URL(tabUrl).hostname : undefined);
          const cookieNames = Array.isArray(payload.cookieNames) ? payload.cookieNames.filter(Boolean) : [];

          let cookies = [];
          try {
            const getAllFilters = {};
            if (cookieDomain) getAllFilters.domain = cookieDomain;
            if (tabUrl) getAllFilters.url = tabUrl;
            cookies = await chrome.cookies.getAll(getAllFilters);
          } catch (cookieErr) {
            console.warn("[SW cookies] getAll failed", cookieErr);
          }

          if (!cookieAll && cookieNames.length) {
            const nameSet = new Set(cookieNames);
            cookies = cookies.filter((c) => nameSet.has(c.name));
          }

          const headers = {};
          (payload.headers || []).forEach((h) => {
            if (h?.key) headers[h.key] = h.value ?? "";
          });

          const serverUrl = payload.serverUrl;
          if (!serverUrl) {
            sendResponse({ ok: false, error: "Missing serverUrl for cookies." });
            return;
          }

          const body = JSON.stringify({
            cookieAll,
            cookieDomain,
            cookieNames,
            tabUrl,
            cookies,
          });

          const resp = await fetch(serverUrl, {
            method: payload.method || "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body,
          });

          let respJson = null;
          let respText = null;
          try {
            respJson = await resp.clone().json();
          } catch {
            try {
              respText = await resp.text();
            } catch {
              /* ignore */
            }
          }

          sendResponse({
            ok: resp.ok,
            status: resp.status,
            statusText: resp.statusText,
            json: respJson,
            text: respText,
            sent: { cookieAll, cookieDomain, cookieNames, count: cookies.length },
          });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        return;
      }

      // pageSource.sendToServer -> captura o HTML completo da página e envia para o servidor
      if (payload?.type === "pageSource.sendToServer") {
        try {
          let targetTabId = payload.tabId ?? lastHostTabId;
          if (!targetTabId) {
            targetTabId = await loadLastHostTabId();
          }
          if (!targetTabId) {
            sendResponse({ ok: false, error: "No tabId available for page source." });
            return;
          }

          const hasCs = await ensureContentScript(targetTabId);
          if (!hasCs) {
            sendResponse({ ok: false, error: "Content script not available and injection failed." });
            return;
          }

          const tabInfo = await chrome.tabs.get(targetTabId);
          const tabUrl = payload.tabUrl || tabInfo?.url;

          let sourceHtml = "";
          try {
            const sourceRes = await chrome.tabs.sendMessage(targetTabId, { type: "automation:getPageSource" });
            if (!sourceRes?.ok || typeof sourceRes.html !== "string") {
              sendResponse({ ok: false, error: sourceRes?.error || "Failed to read page source." });
              return;
            }
            sourceHtml = sourceRes.html;
          } catch (err) {
            sendResponse({ ok: false, error: String(err) || "Failed to read page source." });
            return;
          }

          const headers = {};
          (payload.headers || []).forEach((h) => {
            if (h?.key) headers[h.key] = h.value ?? "";
          });

          const serverUrl = payload.serverUrl;
          if (!serverUrl) {
            sendResponse({ ok: false, error: "Missing serverUrl for page source." });
            return;
          }

          const body = JSON.stringify({
            tabUrl,
            html: sourceHtml,
            length: sourceHtml.length,
            timestamp: Date.now(),
          });

          const resp = await fetch(serverUrl, {
            method: payload.method || "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body,
          });

          let respJson = null;
          let respText = null;
          try {
            respJson = await resp.clone().json();
          } catch {
            try {
              respText = await resp.text();
            } catch {
              /* ignore */
            }
          }

          sendResponse({
            ok: resp.ok,
            status: resp.status,
            statusText: resp.statusText,
            json: respJson,
            text: respText,
            sent: { length: sourceHtml.length, tabUrl },
          });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
        return;
      }

      // downloads.download -> inicia download de um arquivo gerado no sandbox
      if (payload?.type === "download.workflow") {
        const fileName = payload.fileName || "workflow.json";
        const content = payload.content;
        if (typeof content !== "string") {
          sendResponse({ ok: false, error: "download.workflow expects payload.content string" });
          return;
        }
        const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(content)}`;
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: fileName,
          saveAs: false,
          conflictAction: "overwrite",
        });
        sendResponse({ ok: true, downloadId });
        return;
      }

      if (payload?.type === "download.dataUrl") {
        const fileName = payload.fileName || "screenshot.png";
        const dataUrl = payload.dataUrl;
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
          sendResponse({ ok: false, error: "download.dataUrl expects a data URL string" });
          return;
        }
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: fileName,
          saveAs: false,
          conflictAction: "overwrite",
        });
        sendResponse({ ok: true, downloadId });
        return;
      }

      sendResponse({ ok: false, error: "Unknown SANDBOX_RPC payload.type" });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true;
});
