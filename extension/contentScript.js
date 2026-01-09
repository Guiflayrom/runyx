console.log("[Runyx] content script loaded on", location.href);

(() => {
  if (window.__runyxContentInstalled) return;
  window.__runyxContentInstalled = true;

  let picking = false;
  let overlay = null;
  let lastEl = null;

  const escapeCss = (value) => {
    try {
      if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    } catch {}
    return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  };

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
    return true;
  };

  const generateSelector = (el) => {
    if (!(el instanceof HTMLElement)) return "";

    // 1) id
    if (el.id) return `#${escapeCss(el.id)}`;

    // 2) data-testid / data-test / data-cy
    const dt =
      el.getAttribute("data-testid") ||
      el.getAttribute("data-test") ||
      el.getAttribute("data-cy");
    if (dt) return `[data-testid="${escapeCss(dt)}"]`;

    // 3) name
    const name = el.getAttribute("name");
    if (name) return `${el.tagName.toLowerCase()}[name="${escapeCss(name)}"]`;

    // 4) classes (até 2)
    const cls = typeof el.className === "string" ? el.className.trim() : "";
    if (cls) {
      const classes = cls.split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) {
        const sel = "." + classes.map(escapeCss).join(".");
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch {}
      }
    }

    // 5) path curto
    const parts = [];
    let cur = el;
    let depth = 0;

    while (cur && cur !== document.body && depth < 5) {
      let part = cur.tagName.toLowerCase();

      if (cur.id) {
        part = `#${escapeCss(cur.id)}`;
        parts.unshift(part);
        break;
      }

      const parent = cur.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === cur.tagName
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(cur) + 1;
          part += `:nth-of-type(${index})`; // melhor que nth-child aqui
        }
      }

      parts.unshift(part);
      cur = parent;
      depth++;
    }

    return parts.join(" > ");
  };

  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.setAttribute("data-runyx-picker-overlay", "true");
    overlay.style.position = "fixed";
    overlay.style.zIndex = "2147483647";
    overlay.style.pointerEvents = "none";
    overlay.style.border = "2px solid #3b82f6";
    overlay.style.borderRadius = "6px";
    overlay.style.background = "rgba(59,130,246,0.08)";
    overlay.style.boxSizing = "border-box";
    document.documentElement.appendChild(overlay);
    return overlay;
  };

  const positionOverlay = (el) => {
    if (!el || !overlay) return;
    const rect = el.getBoundingClientRect();
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
    overlay.style.display = "block";
  };

  const hideOverlay = () => {
    if (overlay) overlay.style.display = "none";
  };

  const getBestTargetFromEvent = (event) => {
    // suporta shadow DOM
    const path = event.composedPath ? event.composedPath() : [];
    const fromPath = path.find((n) => n instanceof HTMLElement);
    const base = fromPath || event.target;

    if (!(base instanceof HTMLElement)) return null;

    // não pegar o overlay
    if (base.closest?.('[data-runyx-picker-overlay="true"]')) return null;

    return base;
  };

  const onMove = (event) => {
    if (!picking) return;
    const el = getBestTargetFromEvent(event);
    if (!el || !isVisible(el)) return;

    lastEl = el;
    ensureOverlay();
    positionOverlay(el);
  };

  const onClick = (event) => {
    if (!picking) return;

    event.preventDefault();
    event.stopPropagation();

    const el = getBestTargetFromEvent(event) || lastEl;
    if (!el) return;

    const selector = generateSelector(el);

    chrome.runtime.sendMessage({
      type: "automation:pick:done",
      selector,
    });

    stopPicking();
  };

  const onKeyDown = (event) => {
    if (!picking) return;
    if (event.key === "Escape") {
      chrome.runtime.sendMessage({ type: "automation:pick:cancel" });
      stopPicking();
    }
  };

  const startPicking = () => {
    if (picking) return;
    picking = true;
    document.documentElement.style.cursor = "crosshair";

    ensureOverlay();
    hideOverlay();

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  };

  const stopPicking = () => {
    if (!picking) return;
    picking = false;

    document.documentElement.style.cursor = "";
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);

    hideOverlay();
    lastEl = null;
  };

  const selectOption = (el, rawValue) => {
    if (!(el instanceof HTMLSelectElement)) throw new Error("Element is not a select element");
    const value = rawValue == null ? "" : String(rawValue);
    const option = Array.from(el.options).find((o) => o.value === value || o.text === value);
    if (option) {
      el.focus?.();
      el.value = option.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    throw new Error("Option not found for select");
  };

  const typeIntoElement = (el, text) => {
    if (!el) throw new Error("Element not found");

    const value = text == null ? "" : String(text);

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (el instanceof HTMLSelectElement) {
      selectOption(el, value);
      return;
    }

    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // Fallback: try setting value property
    if ("value" in el) {
      try {
        el.focus?.();
      } catch {}
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    throw new Error("Element is not typeable");
  };

  const waitForCondition = (config, timeoutMs = 5000) => {
    return new Promise((resolve, reject) => {
      const requiresSelector = [
        "selectorAppears",
        "selectorVisible",
        "selectorHidden",
        "selectorDisappears",
        "textContains",
        "attributeEquals",
        "elementEnabled",
      ].includes(config.waitFor);

      if (requiresSelector && !config.selector) {
        reject(new Error("Selector is required for this wait condition"));
        return;
      }

      if (config.waitFor === "textContains" && !config.text) {
        reject(new Error("Text is required for textContains wait"));
        return;
      }

      if (config.waitFor === "attributeEquals" && !config.attributeName) {
        reject(new Error("Attribute name is required for attributeEquals wait"));
        return;
      }

      if (config.waitFor === "urlMatches" && !config.urlRegex) {
        reject(new Error("URL regex is required for urlMatches wait"));
        return;
      }

      if (config.waitFor === "time") {
        setTimeout(() => resolve(true), config.timeMs ?? timeoutMs);
        return;
      }

      let urlRegex = null;
      if (config.waitFor === "urlMatches") {
        try {
          urlRegex = new RegExp(config.urlRegex);
        } catch (err) {
          reject(new Error("Invalid URL regex"));
          return;
        }
      }

      let done = false;
      let stableSince = null;
      const intervalMs = Math.max(config.intervalMs || 250, 50);
      const requireStableMs = Math.max(config.requireStableMs || 0, 0);

      const cleanup = () => {
        done = true;
        clearTimeout(timeoutId);
        clearInterval(pollingId);
        observer?.disconnect();
        window.removeEventListener("hashchange", checkCondition);
        window.removeEventListener("popstate", checkCondition);
      };

      const succeed = () => {
        if (done) return;
        cleanup();
        resolve(true);
      };

      const fail = (message) => {
        if (done) return;
        cleanup();
        reject(new Error(message));
      };

      const evaluate = () => {
        switch (config.waitFor) {
          case "selectorAppears":
            return !!document.querySelector(config.selector);
          case "selectorVisible": {
            const el = config.selector ? document.querySelector(config.selector) : null;
            return el instanceof HTMLElement ? isVisible(el) : false;
          }
          case "selectorHidden": {
            const el = config.selector ? document.querySelector(config.selector) : null;
            return el instanceof HTMLElement ? !isVisible(el) : false;
          }
          case "selectorDisappears":
            return !document.querySelector(config.selector);
          case "textContains": {
            if (config.textScope === "insideSelector") {
              const el = config.selector ? document.querySelector(config.selector) : null;
              const text = el ? el.textContent || "" : "";
              return text.includes(config.text);
            }
            const bodyText = document.body ? document.body.innerText || "" : "";
            return bodyText.includes(config.text);
          }
          case "attributeEquals": {
            const el = config.selector ? document.querySelector(config.selector) : null;
            if (!(el instanceof HTMLElement)) return false;
            const attrValue = el.getAttribute(config.attributeName);
            return attrValue === (config.attributeValue ?? "");
          }
          case "elementEnabled": {
            const el = config.selector ? document.querySelector(config.selector) : null;
            if (!(el instanceof HTMLElement)) return false;
            const isDisabled = (el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement
              ? el.disabled
              : el.getAttribute("disabled") !== null);
            return !isDisabled;
          }
          case "urlMatches":
            return urlRegex ? urlRegex.test(location.href) : false;
          default:
            return false;
        }
      };

      const checkCondition = () => {
        const current = evaluate();
        const result = config.invert ? !current : current;

        if (result) {
          if (requireStableMs > 0) {
            if (stableSince === null) stableSince = performance.now();
            if (performance.now() - stableSince >= requireStableMs) {
              succeed();
            }
          } else {
            succeed();
          }
        } else {
          stableSince = null;
        }
      };

      const timeoutId = setTimeout(() => fail("Timeout waiting for condition"), timeoutMs);
      let pollingId = null;
      let observer = null;

      checkCondition();
      if (done) return;

      if (config.strategy === "polling") {
        pollingId = setInterval(checkCondition, intervalMs);
      } else {
        observer = new MutationObserver(checkCondition);
        observer.observe(document.documentElement || document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        window.addEventListener("hashchange", checkCondition);
        window.addEventListener("popstate", checkCondition);
      }
    });
  };

  const evaluateIfElseCondition = (condition) => {
    const type = condition?.type;
    const selector = condition?.selector;
    const text = condition?.text;
    const attributeName = condition?.attributeName;
    const attributeValue = condition?.attributeValue;
    const urlPattern = condition?.urlPattern;
    const regexPattern = condition?.regexPattern;

    switch (type) {
      case "selectorExists":
        if (!selector) throw new Error("Selector is required");
        return !!document.querySelector(selector);
      case "selectorNotExists":
        if (!selector) throw new Error("Selector is required");
        return !document.querySelector(selector);
      case "elementVisible": {
        if (!selector) throw new Error("Selector is required");
        const el = document.querySelector(selector);
        return el instanceof HTMLElement ? isVisible(el) : false;
      }
      case "elementHidden": {
        if (!selector) throw new Error("Selector is required");
        const el = document.querySelector(selector);
        return el instanceof HTMLElement ? !isVisible(el) : true;
      }
      case "elementEnabled": {
        if (!selector) throw new Error("Selector is required");
        const el = document.querySelector(selector);
        if (!(el instanceof HTMLElement)) return false;
        const disabled =
          el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement
            ? el.disabled
            : el.getAttribute("disabled") !== null;
        return !disabled;
      }
      case "elementDisabled": {
        if (!selector) throw new Error("Selector is required");
        const el = document.querySelector(selector);
        if (!(el instanceof HTMLElement)) return false;
        const disabled =
          el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement
            ? el.disabled
            : el.getAttribute("disabled") !== null;
        return disabled;
      }
      case "textContains": {
        if (!selector) throw new Error("Selector is required");
        if (!text) throw new Error("Text is required");
        const el = document.querySelector(selector);
        const content = el ? el.textContent || "" : "";
        return content.includes(text);
      }
      case "textEquals": {
        if (!selector) throw new Error("Selector is required");
        if (text === undefined || text === null) throw new Error("Text is required");
        const el = document.querySelector(selector);
        const content = el ? (el.textContent || "").trim() : "";
        return content === text;
      }
      case "textNotContains": {
        if (!selector) throw new Error("Selector is required");
        if (!text) throw new Error("Text is required");
        const el = document.querySelector(selector);
        const content = el ? el.textContent || "" : "";
        return !content.includes(text);
      }
      case "attributeEquals": {
        if (!selector) throw new Error("Selector is required");
        if (!attributeName) throw new Error("Attribute name is required");
        const el = document.querySelector(selector);
        if (!(el instanceof HTMLElement)) return false;
        const value = el.getAttribute(attributeName);
        return value === (attributeValue ?? "");
      }
      case "attributeContains": {
        if (!selector) throw new Error("Selector is required");
        if (!attributeName) throw new Error("Attribute name is required");
        const el = document.querySelector(selector);
        if (!(el instanceof HTMLElement)) return false;
        const value = el.getAttribute(attributeName) || "";
        if (attributeValue === undefined || attributeValue === null) return false;
        return value.includes(attributeValue);
      }
      case "urlMatches": {
        if (!urlPattern) throw new Error("URL pattern is required");
        const regex = new RegExp(urlPattern);
        return regex.test(location.href);
      }
      case "urlEquals":
        if (!urlPattern) throw new Error("URL value is required");
        return location.href === urlPattern;
      case "regexMatches": {
        if (!regexPattern) throw new Error("Regex pattern is required");
        const regex = new RegExp(regexPattern);
        const bodyText = document.body ? document.body.innerText || "" : "";
        return regex.test(bodyText);
      }
    default:
      throw new Error("Unsupported condition type");
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const loadImageFromDataUrl = (dataUrl) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });

  const clampQuality = (quality) => {
    if (typeof quality !== "number") return 90;
    return Math.max(10, Math.min(100, Math.round(quality)));
  };

  const toDataUrl = (canvas, format, quality) =>
    canvas.toDataURL(
      `image/${format === "jpeg" ? "jpeg" : "png"}`,
      format === "jpeg" ? Math.max(0.1, Math.min(1, (quality || 90) / 100)) : undefined,
    );

  let lastCaptureTs = 0;
  let captureLock = Promise.resolve();
  const CAPTURE_MIN_DELAY_MS = 1200; // stay under chrome quota
  const enforceCaptureRateLimit = async () => {
    const now = Date.now();
    const sinceLast = now - lastCaptureTs;
    if (sinceLast < CAPTURE_MIN_DELAY_MS) {
      await sleep(CAPTURE_MIN_DELAY_MS - sinceLast);
    }
    lastCaptureTs = Date.now();
  };

  const withCaptureLock = (fn) => {
    captureLock = captureLock.then(fn, fn);
    return captureLock;
  };

  const requestViewportCapture = async (format, quality) => {
    const attempt = async () => {
      await enforceCaptureRateLimit();
      const res = await chrome.runtime.sendMessage({
        type: "runyx:capture-visible",
        format,
        quality,
      });
      if (!res?.ok || !res.dataUrl) {
        throw new Error(res?.error || "Failed to capture viewport");
      }
      return {
        dataUrl: res.dataUrl,
        cssWidth: window.innerWidth,
        cssHeight: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      };
    };

    return withCaptureLock(async () => {
      try {
        return await attempt();
      } catch (err) {
        const msg = err?.message || String(err);
        if (msg.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND") || msg.includes("quota")) {
          await sleep(CAPTURE_MIN_DELAY_MS + 200);
          return attempt();
        }
        throw err;
      }
    });
  };

  const resizeShotIfNeeded = async (shot, maxWidth, format, quality) => {
    if (!maxWidth || maxWidth <= 0 || shot.cssWidth <= maxWidth) {
      return shot;
    }

    const scale = maxWidth / shot.cssWidth;
    const targetCssWidth = maxWidth;
    const targetCssHeight = Math.max(1, Math.round(shot.cssHeight * scale));
    const baseDpr = shot.dpr || window.devicePixelRatio || 1;

    const img = await loadImageFromDataUrl(shot.dataUrl);
    const inferredDpr = img.width && shot.cssWidth ? img.width / shot.cssWidth : baseDpr;
    const dpr = Number.isFinite(inferredDpr) && inferredDpr > 0 ? inferredDpr : baseDpr;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(targetCssWidth * dpr));
    canvas.height = Math.max(1, Math.round(targetCssHeight * dpr));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return {
      dataUrl: toDataUrl(canvas, format, quality),
      cssWidth: targetCssWidth,
      cssHeight: targetCssHeight,
      dpr,
    };
  };

  const captureFullPageImage = async (format, quality) => {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
      window.innerWidth,
    );
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
      window.innerHeight,
    );
    const viewportHeight = window.innerHeight;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");

    const originalScroll = { x: window.scrollX, y: window.scrollY };

    let y = 0;
    while (y < height) {
      window.scrollTo(0, y);
      await sleep(CAPTURE_MIN_DELAY_MS);

      const capture = await requestViewportCapture(format, quality);
      const img = await loadImageFromDataUrl(capture.dataUrl);
      const visibleHeight = Math.min(viewportHeight, height - y);
      const sourceHeight = Math.min(img.height, Math.round(visibleHeight * capture.dpr));
      const destY = Math.round(y * capture.dpr);

      ctx.drawImage(img, 0, 0, img.width, sourceHeight, 0, destY, img.width, sourceHeight);
      y += viewportHeight;
    }

    window.scrollTo(originalScroll.x, originalScroll.y);

    return {
      dataUrl: toDataUrl(canvas, format, quality),
      cssWidth: width,
      cssHeight: height,
      dpr,
    };
  };

  const captureElementImage = async (selector, format, quality) => {
    if (!selector) throw new Error("Selector is required for element capture");
    await waitForCondition({ waitFor: "selectorAppears", selector, intervalMs: 200, strategy: "observer" }, 5000);
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) throw new Error("Element not found");
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) throw new Error("Element has no size to capture");

    const fullShot = await captureFullPageImage(format, quality);
    const img = await loadImageFromDataUrl(fullShot.dataUrl);
    const dpr = fullShot.dpr || window.devicePixelRatio || 1;
    const absX = rect.left + window.scrollX;
    const absY = rect.top + window.scrollY;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      img,
      Math.round(absX * dpr),
      Math.round(absY * dpr),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return {
      dataUrl: toDataUrl(canvas, format, quality),
      cssWidth: rect.width,
      cssHeight: rect.height,
      dpr,
    };
  };

  const captureScreenshot = async (config) => {
    const format = config.format === "jpeg" ? "jpeg" : "png";
    const quality = clampQuality(config.quality);

    let shot;
    if (config.captureMode === "fullPage") {
      shot = await captureFullPageImage(format, quality);
    } else if (config.captureMode === "element") {
      shot = await captureElementImage(config.selector, format, quality);
    } else {
      shot = await requestViewportCapture(format, quality);
    }

    const resized = await resizeShotIfNeeded(shot, config.maxWidth, format, quality);
    const base64 = resized.dataUrl.split(",")[1] || "";
    return { ...resized, base64, format };
  };

  // Ouve comandos vindos do SW/panel
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "picker:start") startPicking();
    if (msg?.type === "picker:stop") stopPicking();

    const evaluateLockKey = "__runyxEvalRunning";
    const lastEvalKey = "__runyxEvalLast";

    if (msg?.type === "automation:getPageSource") {
      try {
        const doc = document;
        const dt = doc.doctype;
        const doctype = dt
          ? `<!DOCTYPE ${dt.name || "html"}${dt.publicId ? ` PUBLIC \"${dt.publicId}\"` : ""}${dt.systemId ? ` \"${dt.systemId}\"` : ""}>`
          : "";
        const html = `${doctype}${doc.documentElement?.outerHTML || ""}`;
        sendResponse?.({ ok: true, html });
      } catch (err) {
        sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    if (msg?.type === "automation:domCondition:wait") {
      const waitCfg = msg.config || {};
      const timeoutMs = typeof msg.timeoutMs === "number" ? msg.timeoutMs : waitCfg.timeMs || 10000;
      waitForCondition(waitCfg, timeoutMs)
        .then(() => sendResponse?.({ ok: true }))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse?.({ ok: false, error: message });
        });
      return true;
    }

    if (msg?.type === "automation:run:step") {
      const step = msg.step || {};
      if (step.type === "condition:check") {
        try {
          const result = evaluateIfElseCondition(step.condition || {});
          sendResponse?.({ ok: true, result });
        } catch (err) {
          sendResponse?.({ ok: false, error: String(err) });
        }
        return true;
      }
      if (step.type === "click") {
        const selector = step.selector;
        const timeoutMs = typeof step.timeout === "number" ? step.timeout : 5000;
        const clickMode = step.clickMode === "double" ? "double" : "single";
        if (!selector) {
          sendResponse?.({ ok: false, error: "Selector not found" });
          return true;
        }

        waitForCondition({ waitFor: "selectorAppears", selector, intervalMs: 200, strategy: "observer" }, timeoutMs)
          .then(() => {
            try {
              const el = document.querySelector(selector);
              if (!el) {
                sendResponse?.({ ok: false, error: "Selector not found" });
                return;
              }
              if (el instanceof HTMLElement) {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
              }
              if (clickMode === "double") {
                el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
              } else {
                el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
              }
              sendResponse?.({ ok: true });
            } catch (err) {
              sendResponse?.({ ok: false, error: String(err) });
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            const errorMessage = msg === "Timeout waiting for condition" ? "Selector not found" : msg;
            sendResponse?.({ ok: false, error: errorMessage });
          });
        return true;
      }

      if (step.type === "type") {
        try {
          const selector = step.selector;
          const timeoutMs = typeof step.timeout === "number" ? step.timeout : 5000;
          const value = step.value ?? "";
          if (!selector) {
            sendResponse?.({ ok: false, error: "Selector not found" });
            return true;
          }

          waitForCondition({ waitFor: "selectorAppears", selector, intervalMs: 200, strategy: "observer" }, timeoutMs)
            .then(() => {
              try {
                const el = document.querySelector(selector);
                if (!el) {
                  sendResponse?.({ ok: false, error: "Selector not found" });
                  return;
                }
                if (el instanceof HTMLElement) {
                  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                }

                typeIntoElement(el, value);
                sendResponse?.({ ok: true });
              } catch (err) {
                sendResponse?.({ ok: false, error: String(err) });
              }
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              const errorMessage = msg === "Timeout waiting for condition" ? "Selector not found" : msg;
              sendResponse?.({ ok: false, error: errorMessage });
            });
        } catch (err) {
          sendResponse?.({ ok: false, error: String(err) });
        }
        return true;
      }

      if (step.type === "select") {
        try {
          const selector = step.selector;
          const timeoutMs = typeof step.timeout === "number" ? step.timeout : 5000;
          const value = step.value ?? "";
          if (!selector) {
            sendResponse?.({ ok: false, error: "Selector not found" });
            return true;
          }

          waitForCondition({ waitFor: "selectorAppears", selector, intervalMs: 200, strategy: "observer" }, timeoutMs)
            .then(() => {
              try {
                const el = document.querySelector(selector);
                if (!(el instanceof HTMLSelectElement)) {
                  sendResponse?.({ ok: false, error: "Element is not a select" });
                  return;
                }
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                selectOption(el, value);
                sendResponse?.({ ok: true });
              } catch (err) {
                sendResponse?.({ ok: false, error: String(err) });
              }
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              const errorMessage = msg === "Timeout waiting for condition" ? "Selector not found" : msg;
              sendResponse?.({ ok: false, error: errorMessage });
            });
        } catch (err) {
          sendResponse?.({ ok: false, error: String(err) });
        }
        return true;
      }

      if (step.type === "wait") {
        const waitConfig = {
          intervalMs: 250,
          requireStableMs: 0,
          invert: false,
          textScope: "any",
          strategy: "observer",
          ...step.waitConfig,
        };
        const timeout = step.timeout || waitConfig.timeMs || 5000;

        waitForCondition(waitConfig, timeout)
          .then(() => sendResponse?.({ ok: true }))
          .catch((err) => sendResponse?.({ ok: false, error: String(err) }));
        return true;
      }

      if (step.type === "scroll") {
        const cfg = {
          scrollType: "toSelector",
          behavior: "smooth",
          ...(step.config || step.scrollConfig || {}),
        };
        const timeoutMs = typeof step.timeout === "number" ? step.timeout : 5000;
        const selector = cfg.selector || step.selector;
        const behavior = cfg.behavior || "smooth";
        const toNumber = (val, fallback = 0) => {
          const num = typeof val === "number" ? val : Number(val);
          return Number.isFinite(num) ? num : fallback;
        };

        const runScroll = async () => {
          switch (cfg.scrollType) {
            case "toSelector": {
              if (!selector) throw new Error("Selector is required for scroll");
              await waitForCondition(
                { waitFor: "selectorAppears", selector, intervalMs: 200, strategy: "observer" },
                timeoutMs,
              );
              const el = document.querySelector(selector);
              if (!(el instanceof HTMLElement)) throw new Error("Selector not found");
              const rect = el.getBoundingClientRect();
              const targetX = rect.left + window.scrollX;
              const targetY = rect.top + window.scrollY;
              window.scrollTo({ left: targetX, top: targetY, behavior });
              return true;
            }
            case "intoView": {
              if (!selector) throw new Error("Selector is required for scroll");
              await waitForCondition(
                { waitFor: "selectorAppears", selector, intervalMs: 200, strategy: "observer" },
                timeoutMs,
              );
              const el = document.querySelector(selector);
              if (!(el instanceof HTMLElement)) throw new Error("Selector not found");
              el.scrollIntoView({
                behavior,
                block: cfg.block || "center",
                inline: cfg.inline || "nearest",
              });
              return true;
            }
            case "toPosition": {
              const x = toNumber(cfg.x, 0);
              const y = toNumber(cfg.y, 0);
              window.scrollTo({ left: x, top: y, behavior });
              return true;
            }
            case "byAmount": {
              const x = toNumber(cfg.x, 0);
              const y = toNumber(cfg.y, 0);
              window.scrollBy({ left: x, top: y, behavior });
              return true;
            }
            default:
              throw new Error("Unsupported scroll type");
          }
        };

        (async () => {
          try {
            await runScroll();
            sendResponse?.({ ok: true });
          } catch (err) {
            sendResponse?.({ ok: false, error: String(err) });
          }
        })();
        return true;
      }

      if (step.type === "extract") {
        try {
          const cfg = {
            selector: "",
            extractWhat: "text",
            attributeName: "",
            multiple: "first",
            joinWith: "\n",
            outputType: "auto",
            trim: true,
            defaultValue: "",
            failIfEmpty: false,
            regex: "",
            ...(step.config || step.extractConfig || {}),
          };

          const selector = cfg.selector;
          if (!selector) {
            sendResponse?.({ ok: false, error: "Selector is required" });
            return true;
          }

          if (cfg.extractWhat === "attribute" && !cfg.attributeName) {
            sendResponse?.({ ok: false, error: "Attribute name is required for attribute extraction" });
            return true;
          }

          let regex = null;
          if (cfg.regex) {
            try {
              regex = new RegExp(cfg.regex);
            } catch (err) {
              sendResponse?.({ ok: false, error: "Invalid regex" });
              return true;
            }
          }

          const elements = Array.from(document.querySelectorAll(selector));
          const rawValues = [];

          const getValue = (el) => {
            if (!(el instanceof HTMLElement)) return "";
            switch (cfg.extractWhat) {
              case "text":
                return el.innerText ?? "";
              case "textContent":
                return el.textContent ?? "";
              case "html":
                return el.innerHTML ?? "";
              case "value":
                return el.value ?? el.getAttribute?.("value") ?? "";
              case "attribute":
                return cfg.attributeName ? el.getAttribute(cfg.attributeName) ?? "" : "";
              default:
                return "";
            }
          };

          for (const el of elements) {
            let value = getValue(el);
            if (cfg.trim && typeof value === "string") {
              value = value.trim();
            }
            if (regex) {
              const m = regex.exec(value);
              if (!m) {
                continue; // filter out non-matching values
              }
              value = m[1] ?? m[0];
            }
            rawValues.push(value);
            if (cfg.multiple === "first") break;
          }

          const applyDefaultIfNeeded = (values) => {
            if (values.length > 0) return values;
            if (cfg.defaultValue !== undefined && cfg.defaultValue !== null && cfg.defaultValue !== "") {
              return [cfg.defaultValue];
            }
            return values;
          };

          const pickedValues = applyDefaultIfNeeded(rawValues);

          const isEmpty =
            pickedValues.length === 0 ||
            pickedValues.every((v) => (v === undefined || v === null ? true : String(v).trim() === ""));

          if (cfg.failIfEmpty && isEmpty) {
            sendResponse?.({ ok: false, error: "Extracted value is empty" });
            return true;
          }

          const castValue = (val) => {
            const str = val == null ? "" : String(val);
            switch (cfg.outputType) {
              case "number": {
                const n = Number(str);
                if (Number.isNaN(n)) throw new Error("Failed to convert value to number");
                return n;
              }
              case "boolean": {
                if (str.toLowerCase() === "true") return true;
                if (str.toLowerCase() === "false") return false;
                return Boolean(str);
              }
              case "json": {
                try {
                  return JSON.parse(str);
                } catch {
                  throw new Error("Failed to parse JSON value");
                }
              }
              case "string":
                return str;
              case "auto":
              default: {
                if (str.toLowerCase() === "true") return true;
                if (str.toLowerCase() === "false") return false;
                const n = Number(str);
                if (!Number.isNaN(n) && str.trim() !== "") return n;
                if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
                  try {
                    return JSON.parse(str);
                  } catch {
                    /* ignore */
                  }
                }
                return str;
              }
            }
          };

          let convertedValues = [];
          try {
            convertedValues = pickedValues.map((v) => castValue(v));
          } catch (err) {
            sendResponse?.({ ok: false, error: String(err) });
            return true;
          }

          let finalValue;
          if (cfg.multiple === "all") {
            if (cfg.outputType === "json") {
              finalValue = convertedValues;
            } else {
              const toJoin = convertedValues.map((v) =>
                typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v),
              );
              finalValue = toJoin.join(cfg.joinWith ?? "\n");
            }
          } else {
            finalValue = convertedValues[0] ?? "";
          }

          sendResponse?.({
            ok: true,
            value: finalValue,
            values: convertedValues,
            rawValues,
            usedDefault: rawValues.length === 0 && pickedValues.length > 0,
          });
        } catch (err) {
          sendResponse?.({ ok: false, error: String(err) });
        }
        return true;
      }

      if (step.type === "screenshot") {
        const cfg = {
          captureMode: "viewport",
          format: "png",
          quality: 90,
          includeTimestamp: true,
          fileNameTemplate: "{{workflow}}_{{step}}_{{timestamp}}",
          saveTo: "downloads",
          maxWidth: 0,
          onFail: "continue",
          ...(step.config || step.screenshotConfig || {}),
        };

        const selector = cfg.selector || step.selector || "";
        if (cfg.captureMode === "element" && !selector) {
          sendResponse?.({ ok: false, error: "Selector is required for element screenshot" });
          return true;
        }

        (async () => {
          try {
            const shot = await captureScreenshot({ ...cfg, selector });
            sendResponse?.({
              ok: true,
              dataUrl: shot.dataUrl,
              base64: shot.base64,
              width: shot.cssWidth,
              height: shot.cssHeight,
              format: shot.format,
            });
          } catch (err) {
            sendResponse?.({ ok: false, error: String(err) });
          }
        })();
        return true;
      }

      if (step.type === "evaluate") {
        // Avoid running evaluate in nested frames to prevent duplicate executions/alerts
        if (window !== window.top) {
          return undefined;
        }
        const now = Date.now();
        if ((window)[lastEvalKey] && (window)[lastEvalKey].id === step.id && now - (window)[lastEvalKey].ts < 300) {
          sendResponse?.({ ok: false, error: "Evaluation throttled" });
          return true;
        }
        if ((window)[evaluateLockKey]) {
          sendResponse?.({ ok: false, error: "Evaluation already running" });
          return true;
        }
        (window)[evaluateLockKey] = true;
        (window)[lastEvalKey] = { id: step.id, ts: now };
        const cfg = {
          runIn: "page",
          target: "currentTab",
          mode: "expression",
          code: "",
          args: [],
          expect: "any",
          saveAs: "",
          saveOnlyIfOk: false,
          failOnFalsy: false,
          ...(step.config || step.evaluateConfig || {}),
        };
        const injectedVars = step.vars || {};

        const code = (cfg.code || "").trim();
        if (!code) {
          sendResponse?.({ ok: false, error: "Code is required" });
          return true;
        }

        const parseArgValue = (arg, idx) => {
          const name = (arg?.name || "").trim() || `arg${idx + 1}`;
          const value = "resolvedValue" in arg ? arg.resolvedValue : arg?.value;
          const raw = value === undefined ? "" : value;
          try {
            switch (arg.type) {
              case "number": {
                const num = Number(raw);
                if (!Number.isFinite(num)) throw new Error("Expected a number");
                return { name, value: num };
              }
              case "boolean": {
                const val = String(raw).trim().toLowerCase();
                if (["true", "1", "yes", "on"].includes(val)) return { name, value: true };
                if (["false", "0", "no", "off", ""].includes(val)) return { name, value: false };
                return { name, value: Boolean(raw) };
              }
              case "json":
                return { name, value: JSON.parse(raw || "null") };
              case "string":
              default:
                return { name, value: raw };
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Argument "${name}" is invalid: ${msg}`);
          }
        };

        const validateResult = (value) => {
          if (cfg.expect === "string" && typeof value !== "string") {
            return { ok: false, error: "Expected a string result" };
          }
          if (cfg.expect === "number" && !(typeof value === "number" && Number.isFinite(value))) {
            return { ok: false, error: "Expected a number result" };
          }
          if (cfg.expect === "boolean" && typeof value !== "boolean") {
            return { ok: false, error: "Expected a boolean result" };
          }
          if (cfg.expect === "object" && (value === null || Array.isArray(value) || typeof value !== "object")) {
            return { ok: false, error: "Expected an object result" };
          }
          if (cfg.expect === "array" && !Array.isArray(value)) {
            return { ok: false, error: "Expected an array result" };
          }
          if (cfg.failOnFalsy && !value) {
            return { ok: false, error: "Result is falsy" };
          }
          return { ok: true };
        };

        const evaluateSafely = async (payload) => {
          // Always run in extension sandbox page to avoid site CSP and unsafe-eval blocks
          return await evaluateInSandboxPage(payload);
        };

        const evaluateInSandboxPage = (payload) =>
          new Promise((resolve, reject) => {
            const evalId = `eval-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.sandbox = "allow-scripts allow-same-origin allow-modals";
            iframe.src = chrome.runtime.getURL("eval-sandbox.html");
            let settled = false;

            const cleanup = () => {
              window.removeEventListener("message", onMessage, false);
              iframe.remove();
            };

            const onMessage = (event) => {
              const data = event.data || {};
              if (!data.__runyxEval || data.id !== evalId) return;
              if (event.source !== iframe.contentWindow) return;
              if (data.log !== undefined) {
                console.log(data.log);
                return;
              }
              if (settled) return;
              settled = true;
              cleanup();
              if (data.ok) resolve(data.result);
              else reject(new Error(data.error || "Evaluation failed"));
            };

            window.addEventListener("message", onMessage, false);

            iframe.onload = () => {
              try {
                iframe.contentWindow.postMessage(
                  { __runyxEval: true, id: evalId, vars: injectedVars, ...payload },
                  "*",
                );
              } catch (err) {
                cleanup();
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            };

            iframe.onerror = (err) => {
              cleanup();
              reject(err instanceof Error ? err : new Error("Sandbox load failed"));
            };

            document.documentElement.appendChild(iframe);
          });

        (async () => {
          try {
            const parsedArgs =
              cfg.mode === "expression" ? [] : (cfg.args || []).map((arg, idx) => parseArgValue(arg, idx));
            const result = await evaluateSafely({ mode: cfg.mode, code, parsedArgs });

            const validation = validateResult(result);
            if (!validation.ok) {
              sendResponse?.({ ok: false, error: validation.error || "Evaluation failed", result });
              return;
            }

            sendResponse?.({ ok: true, result });
          } catch (err) {
            sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
          setTimeout(() => {
            (window)[evaluateLockKey] = false;
          }, 150);
        })();
        return true;
      }

      if (step.type === "fallback") {
        const code = step.code || "";
        const run = async () => {
          // Executa no contexto da página
          const fn = new Function(`return (async () => { ${code} })();`);
          return await fn();
        };
        run()
          .then((res) => sendResponse?.({ ok: true, result: res }))
          .catch((err) => sendResponse?.({ ok: false, error: String(err) }));
        return true;
      }

      // TODO: handle additional step types (select, request, cookies)
      sendResponse?.({ ok: false, error: "Step type not implemented" });
      return true;
    }

    return undefined;
  });

  // Debug opcional:
  // chrome.runtime.sendMessage({ type: "content:ready" });
})();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "runyx:ping") {
    sendResponse({ ok: true });
  }
});
