import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { subscribe } from "./engine";

export function attachWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url || "/").split("?")[0];
    if (pathname !== "/api/v1/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
  wss.on("connection", (socket, req) => {
    const pair = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("pair");
    socket.send(JSON.stringify({ type: "hello", ts: Date.now(), pair, path: "/api/v1/ws" }));
    const stop = subscribe((event) => {
      if (pair && event.pair && event.pair !== pair) return;
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    socket.on("close", () => stop());
  });
}
