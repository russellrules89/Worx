import { requireDatabase } from '@/lib/db';

export const consentPolicyVersion = process.env.CONSENT_POLICY_VERSION ?? '2026-08-preview';
export const settlementEnabled = process.env.BASE_SEPOLIA_SETTLEMENT_ENABLED === 'true' && /^0x[0-9a-fA-F]{40}$/.test(process.env.TOKEN_CONTRACT_ADDRESS ?? '');

export function settlementStatus() {
  return {
    enabled: settlementEnabled,
    environment: settlementEnabled ? 'base-sepolia' : 'not_configured',
    network: settlementEnabled ? 'base-sepolia' : null,
    chain_id: settlementEnabled ? '84532' : null,
    contract: settlementEnabled ? process.env.TOKEN_CONTRACT_ADDRESS : null,
    standard: 'ERC-20',
    cashout: { available: false, minimum_work: 100, reason: 'ERC-20 transfers are not fiat cash-out. A licensed redemption or off-ramp provider, KYC/AML, sanctions screening, tax handling, and reserve policy must be configured first.' },
    oracle_required: true,
  };
}

export async function getTasks() {
  const db = requireDatabase();
  return db`SELECT id, client_name, title, instructions, reward_work, status, kind, required_submissions, submitted_count, funding_usdc, voucher_sponsor, future_contract_id, provenance, created_at FROM tasks WHERE status = 'open' ORDER BY created_at DESC`;
}

export async function getOverview() {
  const db = requireDatabase();
  const submissions = await db`SELECT id, status, final_reward_work FROM submissions ORDER BY created_at DESC LIMIT 20`;
  return {
    data_mode: 'preview',
    contributions: submissions.map((item) => ({ id: item.id, type: 'Contribution', status: item.status === 'approved' ? 'Approved' : 'Awaiting validation', reward: item.status === 'approved' ? `${item.final_reward_work} WWP` : 'Not calculated' })),
    reward_policy: 'Rewards are recorded only after server-side review. No payment or cash-out is created by this portal.',
    settlement: settlementStatus(),
  };
}
