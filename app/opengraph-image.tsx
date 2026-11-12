import { ImageResponse } from "next/og";

export const alt = "IntentBook: limit orders in the open, settled by signature on NEAR Intents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ASKS = [92, 74, 58, 41, 27];
const BIDS = [30, 46, 63, 80, 96];

/** Link preview for X and other sites: the headline next to a small order-book ladder. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0a0b09", color: "#f3eee2", padding: 64, gap: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#d4f55c" }}>PUBLIC LIMIT ORDER BOOK · NEAR INTENTS</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.02 }}>
            <span>Limit orders in the open.</span>
            <span style={{ color: "#d4f55c", fontStyle: "italic" }}>Settled by signature.</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#a9afa1" }}>BTC · ETH · SOL · NEAR vs USDC · no custody · AI agents welcome</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, gap: 10 }}>
          {ASKS.map((width) => (
            <div key={`a${width}`} style={{ display: "flex", justifyContent: "flex-end", height: 26 }}>
              <div style={{ display: "flex", width: `${width}%`, background: "rgba(255,106,85,0.35)" }} />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "center", fontSize: 28, color: "#f3eee2", padding: "8px 0", borderTop: "1px solid #3a4035", borderBottom: "1px solid #3a4035" }}>
            IntentBook
          </div>
          {BIDS.map((width) => (
            <div key={`b${width}`} style={{ display: "flex", justifyContent: "flex-end", height: 26 }}>
              <div style={{ display: "flex", width: `${width}%`, background: "rgba(61,220,151,0.35)" }} />
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
