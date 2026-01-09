const iframe = document.getElementById("app");

if (!iframe) {
  console.error("[ui-bridge] iframe #app not found");
}

chrome.runtime.onMessage.addListener((message, sender) => {
  // repassa qualquer msg do SW/contentScript pro sandbox
  iframe.contentWindow.postMessage(
    { __fromExtension: true, push: true, message, sender },
    "*"
  );
});


window.addEventListener("message", async (event) => {
  if (!iframe || event.source !== iframe.contentWindow) return;

  const msg = event.data;
  if (!msg || msg.__fromSandbox !== true) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SANDBOX_RPC",
      payload: msg.payload,
      requestId: msg.requestId,
    });

    iframe.contentWindow.postMessage(
      { __fromExtension: true, requestId: msg.requestId, response },
      "*" // sandbox = origin null, então não dá pra restringir por origin
    );
  } catch (err) {
    iframe.contentWindow.postMessage(
      { __fromExtension: true, requestId: msg.requestId, error: String(err) },
      "*"
    );
  }
});
