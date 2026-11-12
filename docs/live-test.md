# One real trade on mainnet, for about $1

NEAR Intents has no testnet, so the hackathon rules ask for "mainnet, separate dev accounts, tiny amounts" (Q-007). This is the smallest real trade the book can settle: you sell 0.1 NEAR (about $0.34) into the market maker's bid, and the batch is broadcast with `execute_intents`.

Prices below use NEAR at $3.38 (12 Nov 2026). You do every transfer and signature yourself. Nobody else ever needs your keys.

## What you need

- The current IntentBook code deployed on Railway.
- A NEAR wallet (Meteor, HOT, MyNearWallet or HERE) holding about 0.35 NEAR.

## Steps

1. **Make the hot key.** Run `npx tsx scripts/live-keys.ts` in the repo. It writes `.env.live`, which git ignores, and prints one 64-character account id. That account is the relayer, the operator and the market maker. Never paste the contents of `.env.live` into a chat.
2. **Give it gas.** From your wallet, send **0.05 NEAR** to that account id. This creates the account and pays for `execute_intents`.
3. **Get a little USDC.** In your wallet's swap (or app.rhea.finance), swap about **0.12 NEAR to USDC**. It must be native USDC on NEAR (`17208628…36133a1`).
4. **Fund the market maker's bid.** Connect your NEAR wallet on IntentBook, then go to **Funds → Deposit**. Pick **USDC**, enter **0.38**, set **Credit to account** to the hot account id, and confirm in the wallet.
5. **Cover closure dust.** On the same form, pick **NEAR**, enter **0.002**, credit the hot account again, and confirm. The operator pays a 1-pip protocol closure in the base token, and this covers it.
6. **Fund yourself.** Pick **NEAR**, enter **0.11**, and leave **Credit to account** empty. The wallet wraps and deposits in one transaction.
7. **Register your key.** Go to **Connect → Register key on intents.near** and confirm. Named NEAR accounts need this before `execute_intents` accepts their signature.
8. **Arm live mode.** In Railway → Variables, add the six lines from `.env.live`, then redeploy. Open `/api/v1/health` and check that `liveExecution` is `armed` and `keySource` shows `env` for both keys.
9. **Trade.** On **Trade**, choose **NEAR**, **Sell**, **Market**, quantity **0.1**, then **Sign & sell**. The receipt should show **Settled** with a NearBlocks transaction link. Record this for the demo video.
10. **Disarm.** In Railway, set `INTENTBOOK_LIVE=0` and redeploy.

## What it costs

| Item | NEAR |
| --- | --- |
| Gas for the hot account | 0.05 |
| Swapped into USDC (0.38 USDC) | about 0.12 |
| Closure dust | 0.002 |
| Your 0.1 NEAR to sell, plus wrap storage | about 0.112 |
| Wallet gas for 4 transactions | under 0.01 |
| **Total** | **about 0.29 NEAR, roughly $1** |

Most of it comes back. After the trade, about 0.33 USDC sits in your own Intents account (**Funds → Withdraw**), and the hot account holds the 0.1 wNEAR.

## Risks while live mode is on

- Anyone on the public site can trade against the funded maker. The most it can lose is what you deposited for it, about $0.40. Turn live mode off after recording.
- Every match is simulated first. A batch that would fail is refused, not broadcast. Orders above 5 lots or 50 USDC are refused.
- The hot key sits in Railway's environment. Use it only for this test and keep only cents in it.
