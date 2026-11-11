import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { ensureSqliteDir } from "./lib/store";
import { attachWs } from "./lib/ws-server";

const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 43123);
const dev = process.env.NODE_ENV !== "production";

ensureSqliteDir();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsed = parse(req.url || "/", true);
    void handle(req, res, parsed);
  });
  attachWs(server);
  server.listen(port, hostname, () => {
    console.log(`IntentBook listening on http://${hostname}:${port}`);
  });
});
