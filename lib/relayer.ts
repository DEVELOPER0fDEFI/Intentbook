import { INTENTS_CONTRACT } from "./assets";
import { liveRequested, relayerConfigured } from "./live";
import type { SignedIntent } from "./types";

/**
 * Broadcast execute_intents. Callers must already have a broadcast decision.
 * This function refuses unless INTENTBOOK_LIVE=1 and the relayer env is set.
 */
export async function broadcastExecute(signed: SignedIntent[]): Promise<{ txHash: string }> {
  if (!liveRequested()) throw new Error("Refusing to broadcast because dry-run is on");
  if (!relayerConfigured()) throw new Error("Refusing to broadcast because the relayer key is not set");
  const accountId = process.env.NEAR_RELAYER_ACCOUNT as string;
  const privateKey = process.env.NEAR_RELAYER_PRIVATE_KEY as string;
  const near = await import("near-api-js");
  const keyStore = new near.keyStores.InMemoryKeyStore();
  await keyStore.setKey("mainnet", accountId, near.KeyPair.fromString(privateKey as never));
  const connection = await near.connect({
    networkId: "mainnet",
    nodeUrl: process.env.NEAR_RPC_URL || "https://rpc.fastnear.com",
    keyStore,
  });
  const account = await connection.account(accountId);
  const gas = BigInt(process.env.INTENTBOOK_EXECUTE_GAS || "300000000000000");
  const outcome = await account.functionCall({
    contractId: process.env.INTENTS_CONTRACT || INTENTS_CONTRACT,
    methodName: "execute_intents",
    args: { signed },
    gas,
    attachedDeposit: 0n,
  });
  const hash =
    (outcome as { transaction?: { hash?: string } }).transaction?.hash ||
    (outcome as { transaction_outcome?: { id?: string } }).transaction_outcome?.id ||
    "";
  if (!hash) throw new Error("execute_intents returned no transaction hash");
  return { txHash: hash };
}
