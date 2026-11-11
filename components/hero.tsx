export function Hero() {
  return (
    <section className="mb-6 rounded-xl border border-line bg-panel px-4 py-6 sm:px-6">
      <p className="text-xs uppercase tracking-[0.16em] text-lime">Public book for NEAR Intents</p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">A visible limit order book for BTC, ETH, SOL, and NEAR.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Custodial books and private 1Click limits hide the price. IntentBook shows the depth, matches crossing orders off chain, and settles them
        as signed token_diff payloads on intents.near. Judges can use the demo key. Everyone else can connect a NEAR wallet or MetaMask.
      </p>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-lg border border-line px-3 py-2">Maker fee 0. Taker fee 8 bps.</li>
        <li className="rounded-lg border border-line px-3 py-2">Dry-run by default. Live mode simulates first.</li>
        <li className="rounded-lg border border-line px-3 py-2">Funds stay in your Intents account until you withdraw.</li>
      </ul>
    </section>
  );
}
