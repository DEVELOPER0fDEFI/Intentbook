import { EngineError } from "./engine";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });
}

export function options(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export async function run(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await fn());
  } catch (error) {
    if (error instanceof EngineError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : "unknown error";
    return json({ error: message }, 500);
  }
}
