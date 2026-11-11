export const ONECLICK_PUBLIC_FEE_BPS = 25;
export const ONECLICK_PARTNER_FEE_BPS = 20;
export const ONECLICK_MIN_KEEP_BPS = 20;

export interface AppFee {
  recipient: string;
  fee: number;
}

export interface FeeSchedule {
  hasJwt: boolean;
  protocolBps: number;
  appFeeBps: number;
  recipientBps: number;
  oneclickKeepsBps: number;
  userPaysBps: number;
  rules: string;
}

export const ONECLICK_FEE_RULES =
  "No partner key: 1Click charges 0.25% (25 bps). With a partner JWT: 0.20% (20 bps). appFees are split 50/50, and 1Click keeps at least 20 bps.";

export function configuredAppFees(env: NodeJS.ProcessEnv = process.env): AppFee[] {
  if (!env.ONECLICK_JWT?.trim()) return [];
  const recipient = (env.ONECLICK_APP_FEE_RECIPIENT || "").trim();
  const raw = Number(env.ONECLICK_APP_FEE_BPS ?? "0");
  if (!recipient || !Number.isFinite(raw) || raw <= 0) return [];
  return [{ recipient, fee: Math.floor(raw) }];
}

/**
 * 1Click fee model used for quotes and the trade page.
 * The protocol fee is 25 bps without a JWT and 20 bps with one.
 * The requested app fee is split in half. The recipient gets the floor half.
 * 1Click keeps the protocol fee plus the other half, and never less than 20 bps.
 */
export function oneclickFeeSchedule(input: { appFeeBps: number; hasJwt: boolean }): FeeSchedule {
  const protocolBps = input.hasJwt ? ONECLICK_PARTNER_FEE_BPS : ONECLICK_PUBLIC_FEE_BPS;
  const appFeeBps = Math.max(0, Math.floor(input.appFeeBps));
  const recipientBps = Math.floor(appFeeBps / 2);
  const oneclickFromSplit = appFeeBps - recipientBps;
  const oneclickKeepsBps = Math.max(ONECLICK_MIN_KEEP_BPS, protocolBps + oneclickFromSplit);
  return {
    hasJwt: input.hasJwt,
    protocolBps,
    appFeeBps,
    recipientBps,
    oneclickKeepsBps,
    userPaysBps: oneclickKeepsBps + recipientBps,
    rules: ONECLICK_FEE_RULES,
  };
}

export function activeFeeSchedule(env: NodeJS.ProcessEnv = process.env): FeeSchedule {
  const fees = configuredAppFees(env);
  return oneclickFeeSchedule({
    appFeeBps: fees[0]?.fee ?? 0,
    hasJwt: Boolean(env.ONECLICK_JWT),
  });
}
