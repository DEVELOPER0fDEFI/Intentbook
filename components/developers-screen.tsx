export function DevelopersScreen() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Public API</h1>
        <p className="mt-2 text-sm text-muted">
          Other apps share this book. Reads need no key. Placing or cancelling an order requires a signature checked on the server. The OpenAPI file is at /openapi.json. WebSocket events are on port 43124. SSE is /api/v1/stream.
        </p>
      </div>
      <pre className="nums overflow-auto rounded-lg border border-line bg-panel p-4 text-xs leading-6">{`curl http://127.0.0.1:43123/api/v1/book?pair=BTC-USDC
curl http://127.0.0.1:43123/api/v1/trades?pair=BTC-USDC
curl http://127.0.0.1:43123/api/v1/ticker
curl http://127.0.0.1:43123/api/v1/health
curl http://127.0.0.1:43123/api/v1/compare?pair=BTC-USDC&side=BUY&qty=0.0001
curl http://127.0.0.1:43123/api/v1/quote/best?pair=BTC-USDC&side=BUY&qty=0.0001
curl http://127.0.0.1:43123/openapi.json`}</pre>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
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
            ["GET", "/api/v1/depth?pair=BTC-USDC&group=1", "Grouped depth"],
            ["GET", "/api/v1/candles?pair=BTC-USDC&interval=1m", "1m, 5m, 1h, 1d candles"],
            ["GET", "/api/v1/compare", "Book price versus 1Click"],
            ["GET", "/api/v1/quote/best", "Winner across book, 1Click, Rhea"],
            ["GET", "/api/v1/accounts/{account}", "Orders, fills, balances"],
            ["GET", "/api/v1/stream?pair=BTC-USDC", "SSE book, trades, ticker"],
            ["GET", "ws://127.0.0.1:43124?pair=BTC-USDC", "WebSocket pair stream"],
            ["POST", "/api/v1/orders/preview", "Unsigned token_diff to sign"],
            ["POST", "/api/v1/orders", "Signed payload, then simulate"],
            ["POST", "/api/v1/orders/cancel", "Signed cancel, or session cancel"],
            ["POST", "/api/v1/webhooks", "HMAC fill webhook"],
            ["GET", "/api/v1/referrers?id=", "Referrer fee share"],
            ["POST", "/api/v1/deposit-quote", "1Click quote, dry by default"],
            ["POST", "/api/v1/near-deposit", "Unsigned ft_transfer_call template"],
            ["POST", "/api/v1/withdraw/preview", "Unsigned ft_withdraw"],
            ["POST", "/api/v1/withdraw", "Simulate, then live gate"],
            ["POST", "/api/v1/orders/burn-preview", "Empty intent for the order nonce"],
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
      </div>
      <pre className="nums overflow-auto rounded-lg border border-line bg-panel p-4 text-xs leading-6">{`<script src="http://127.0.0.1:43123/widget.js" data-referrer="your-app" data-origin="http://127.0.0.1:43123"></script>`}</pre>
      <p className="text-sm text-muted">
        Read routes send Access-Control-Allow-Origin: *. A browser on another origin can fetch the book. Settlement stays a signed intent
        batch, not a custodial transfer.
      </p>
    </div>
  );
}
