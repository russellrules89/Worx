import "server-only"
import { CdpClient } from "@coinbase/cdp-sdk"
import { encodeFunctionData, formatUnits, isAddress, type Address } from "viem"

/**
 * Payout economics and on-chain constants.
 *
 * DATA is an internal reward-points balance. Cash-out redeems DATA at a fixed
 * rate for real USDC already funded in the Base treasury via a Coinbase
 * Developer Platform (CDP) server wallet.
 */
export const DATA_PER_USD = 100 // 100 DATA = $1.00
export const AUTO_PAYOUT_THRESHOLD = 1000 // auto-pay once balance reaches 1,000 DATA (~$10)
export const PAYOUT_INCREMENT = 100 // only pay whole-dollar chunks; keep the sub-dollar remainder
export const PLATFORM_FEE_BPS = 2000 // 20% owner share (basis points); workers receive the remaining 80%

/** Owner share (in DATA) withheld from a gross worker cash-out. */
export function feeFromData(grossData: number): number {
  return Math.floor((grossData * PLATFORM_FEE_BPS) / 10000)
}

/** Net DATA the worker receives as USDC after the owner share. */
export function netFromData(grossData: number): number {
  return grossData - feeFromData(grossData)
}

// Native USDC on Base (6 decimals).
const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
const USDC_DECIMALS = 6
const TREASURY_ACCOUNT_NAME = "cortex-treasury"
const NETWORK = "base" as const

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

/** Whether the CDP treasury credentials are configured. */
export function payoutsConfigured() {
  return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET)
}

/** Validates an EVM wallet address. */
export function isValidPayoutAddress(address: string): address is Address {
  return isAddress(address)
}

/** Converts a DATA amount to a USDC decimal string (for display/storage). */
export function dataToUsdc(dataAmount: number): string {
  return (dataAmount / DATA_PER_USD).toFixed(2)
}

/**
 * Given a balance, returns the DATA amount that should be auto-paid:
 * the largest whole-dollar (100 DATA) chunk once the threshold is reached,
 * or 0 if below threshold.
 */
export function payableAmount(balance: number): number {
  if (balance < AUTO_PAYOUT_THRESHOLD) return 0
  return balance - (balance % PAYOUT_INCREMENT)
}

export type PayoutSendResult = { txHash: string }

/**
 * Core USDC sender: broadcasts an ERC-20 transfer of `usdcUnits` (6-decimal
 * atomic units) from the treasury to `toAddress` on Base via CDP's managed
 * endpoint. Throws on failure so callers can refund/mark failed.
 */
async function sendUsdcUnits(
  toAddress: Address,
  usdcUnits: bigint,
  idempotencyKey: string,
): Promise<PayoutSendResult> {
  if (!payoutsConfigured()) {
    throw new Error("CDP treasury credentials are not configured")
  }

  const cdp = new CdpClient()
  const treasury = await cdp.evm.getOrCreateAccount({ name: TREASURY_ACCOUNT_NAME })

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [toAddress, usdcUnits],
  })

  const { transactionHash } = await cdp.evm.sendTransaction({
    address: treasury.address as Address,
    network: NETWORK,
    transaction: {
      to: USDC_ADDRESS,
      data,
      value: BigInt(0),
    },
    // Keyed on the row id so an accidental retry of the same logical
    // transfer cannot broadcast the transaction twice.
    idempotencyKey,
  })

  return { txHash: transactionHash }
}

/** DATA amount -> USDC atomic units (6 decimals). */
function dataToUsdcUnits(dataAmount: number): bigint {
  return (BigInt(dataAmount) * BigInt(10 ** USDC_DECIMALS)) / BigInt(DATA_PER_USD)
}

/** USDC decimal-dollar string -> USDC atomic units (6 decimals). */
function usdcDollarsToUnits(dollars: string): bigint {
  const [whole, frac = ""] = dollars.trim().split(".")
  const fracPadded = (frac + "000000").slice(0, USDC_DECIMALS)
  return BigInt(whole || "0") * BigInt(10 ** USDC_DECIMALS) + BigInt(fracPadded || "0")
}

/**
 * Sends a worker's NET payout: `netDataAmount` is the DATA the worker keeps
 * after the platform fee. Converts to USDC and transfers to the worker.
 */
export async function sendUsdcPayout(
  toAddress: Address,
  netDataAmount: number,
  idempotencyKey: string,
): Promise<PayoutSendResult> {
  return sendUsdcUnits(toAddress, dataToUsdcUnits(netDataAmount), idempotencyKey)
}

/** Sends `dollars` of treasury USDC profit to the owner's wallet. */
export async function sendOwnerWithdrawal(
  toAddress: Address,
  dollars: string,
  idempotencyKey: string,
): Promise<PayoutSendResult> {
  const units = usdcDollarsToUnits(dollars)
  if (units <= BigInt(0)) throw new Error("Withdrawal amount must be greater than 0")
  return sendUsdcUnits(toAddress, units, idempotencyKey)
}

/** Returns the treasury wallet address (for funding / display). */
export async function getTreasuryAddress(): Promise<string | null> {
  if (!payoutsConfigured()) return null
  const cdp = new CdpClient()
  const treasury = await cdp.evm.getOrCreateAccount({ name: TREASURY_ACCOUNT_NAME })
  return treasury.address
}

export type TreasuryBalance = {
  address: string
  usdc: string // decimal dollars, e.g. "125.500000"
  eth: string // decimal ETH (for gas), e.g. "0.0123"
}

/** Reads the treasury's on-chain USDC and ETH balances. */
export async function getTreasuryBalance(): Promise<TreasuryBalance | null> {
  if (!payoutsConfigured()) return null
  const cdp = new CdpClient()
  const treasury = await cdp.evm.getOrCreateAccount({ name: TREASURY_ACCOUNT_NAME })

  let usdc = "0"
  let eth = "0"
  try {
    const { balances } = await cdp.evm.listTokenBalances({
      address: treasury.address as Address,
      network: NETWORK,
    })
    for (const b of balances) {
      const addr = b.token.contractAddress.toLowerCase()
      if (addr === USDC_ADDRESS.toLowerCase()) {
        usdc = formatUnits(b.amount.amount, b.amount.decimals)
      } else if (addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        eth = formatUnits(b.amount.amount, b.amount.decimals)
      }
    }
  } catch {
    // Leave zeros if the balance read fails (e.g. brand-new wallet).
  }

  return { address: treasury.address, usdc, eth }
}
