export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("./lib/engine");
    await boot();
    const { startWs } = await import("./lib/ws-server");
    await startWs();
  }
}
