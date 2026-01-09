// npm i express ws
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Guarda sockets por "clientId"
const clients = new Map();

wss.on("connection", (ws, req) => {
  // clientId simples via querystring: ws://localhost:8080/ws?clientId=abc
  const url = new URL(req.url, "http://localhost");
  const clientId = url.searchParams.get("clientId") || "anon";

  clients.set(clientId, ws);
  console.log("WS connected:", clientId);

  ws.on("close", () => {
    clients.delete(clientId);
    console.log("WS closed:", clientId);
  });
});

// Endpoint externo: você faz curl aqui pra mandar comando
app.post("/trigger", (req, res) => {
  const { clientId, action, payload } = req.body;

  const ws = clients.get(clientId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ ok: false, error: "client not connected" });
  }

  ws.send(JSON.stringify({ action, payload }));
  res.json({ ok: true });
});

server.listen(8080, () => console.log("Server on http://localhost:8080"));
