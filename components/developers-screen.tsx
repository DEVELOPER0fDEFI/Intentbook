export function DevelopersScreen() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Public read API</h1>
        <p className="mt-2 text-sm text-muted">
          Other apps can read the book without a key. Writes accept a NEP-413 signed token_diff. GET responses do not include signatures.
        </p>
      </div>
      <pre className="nums overflow-auto rounded-lg border border-line bg-panel p-4 text-xs leading-6">{`curl http://127.0.0.1:43123/api/v1/book?pair=BTC-USDC
curl http://127.0.0.1:43123/api/v1/trades?pair=BTC-USDC
curl http://127.0.0.1:43123/api/v1/ticker
curl http://127.0.0.1:43123/api/v1/health`}</pre>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2">Method</th>
            <th>Path</th>
            <th>What you get</th>
          </tr>
        </thead>
        <tbody className="nums">
          {[
            ["GET", "/api/v1/book?pair=BTC-USDC", "Bids, asks, mid, spread"],
            ["GET", "/api/v1/trades?pair=BTC-USDC", "Matches and simulate_intents bodies"],
            ["GET", "/api/v1/ticker", "All four mids and samples"],
            ["GET", "/api/v1/orders?account=", "Orders for one implicit account"],
            ["GET", "/api/v1/health", "Fee, salt, auth probe"],
            ["GET", "/api/v1/stream", "Server-sent book events"],
            ["POST", "/api/v1/orders/preview", "Unsigned token_diff to sign"],
            ["POST", "/api/v1/orders", "Signed payload, then simulate"],
            ["POST", "/api/v1/orders/cancel", "Soft cancel"],
            ["POST", "/api/v1/deposit-quote", "1Click dry quote"],
            ["GET", "/api/v1/status?depositAddress=", "1Click status"],
          ].map(([method, path, what]) => (
            <tr key={path} className="border-t border-line">
              <td className="py-2 pr-3 text-lime">{method}</td>
              <td className="pr-3">{path}</td>
              <td className="font-sans text-muted">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted">
        Read routes send Access-Control-Allow-Origin: *. A browser on another origin can fetch the book. Settlement stays a signed intent
        batch, not a custodial transfer.
      </p>
    </div>
  );
}
