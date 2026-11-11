import { INTENTS_CONTRACT } from "./assets";

export const ONCHAIN_CANCEL_NOTE =
  "Soft cancel removes the order from this book and records the nonce so this process will not accept it again. The Verifier burns a nonce only when execute_intents commits it. There is no separate invalidate method. A nonce burn is an empty intent signed with the same nonce, simulated first, and broadcast only when INTENTBOOK_LIVE=1 and the relayer is configured. Dry-run does not broadcast it.";

export function nearDepositCall(input: { tokenContract: string; amount: string; owner?: string }) {
  if (!/^\d+$/.test(input.amount) || input.amount === "0") {
    throw new Error("Deposit amount must be a positive integer in token atoms");
  }
  return {
    receiverId: input.tokenContract,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: INTENTS_CONTRACT,
      amount: input.amount,
      msg: input.owner ?? "",
    },
    gas: "100000000000000",
    deposit: "1",
    note: "This call is signed by the user's NEAR wallet. The server does not sign or send it. Do not send native NEAR to intents.near. Wrap NEAR first.",
  };
}

export function withdrawIntent(input: {
  tokenId: string;
  receiverId: string;
  amount: string;
  memo?: string;
}): { intent: "ft_withdraw"; token: string; receiver_id: string; amount: string; memo?: string } {
  const token = input.tokenId.replace(/^nep141:/, "");
  if (!token || token.includes(":")) throw new Error("Withdraw token id is missing");
  if (!/^\d+$/.test(input.amount) || input.amount === "0") throw new Error("Withdraw amount must be a positive integer");
  return {
    intent: "ft_withdraw",
    token,
    receiver_id: input.receiverId,
    amount: input.amount,
    memo: input.memo,
  };
}

export function nearblocksTx(hash: string): string {
  return `https://nearblocks.io/txns/${hash}`;
}

export function statusTone(status: string | undefined): "ok" | "wait" | "bad" | "unknown" {
  if (!status) return "unknown";
  if (status === "SUCCESS") return "ok";
  if (status === "REFUNDED" || status === "FAILED") return "bad";
  if (status === "PENDING_DEPOSIT" || status === "KNOWN_DEPOSIT_TX" || status === "PROCESSING" || status === "INCOMPLETE_DEPOSIT") {
    return "wait";
  }
  return "unknown";
}
