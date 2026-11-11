import { subscribe } from "./engine";

let started = false;

export async function startWs() {
  if (started || process.env.INTENTBOOK_WS === "0") return;
  started = true;
  const { WebSocketServer } = await import("ws");
  const port = Number(process.env.INTENTBOOK_WS_PORT || 43124);
  const wss = new WebSocketServer({ port });
  wss.on("connection", (socket, req) => {
    const pair = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("pair");
    socket.send(JSON.stringify({ type: "hello", ts: Date.now(), pair }));
    const stop = subscribe((event) => {
      if (pair && event.pair && event.pair !== pair) return;
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    socket.on("close", stop);
  });
  wss.on("error", () => {
    started = false;
  });
}
