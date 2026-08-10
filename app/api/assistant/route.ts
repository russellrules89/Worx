import { NextResponse } from 'next/server';
import { z } from 'zod';
import { settlementStatus } from '@/lib/portal';
export const runtime = 'nodejs';
const input = z.object({ message: z.string().trim().min(1).max(500) });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'message must contain 1 to 500 characters' }, { status: 400 });
  const text = parsed.data.message.toLowerCase(); const settlement = settlementStatus();
  let reply: string; let action = 'help';
  if (/(wallet|connect|metamask)/.test(text)) { reply = 'Use Connect wallet in the header, then approve the connection. Connecting a wallet does not create a payment or cash-out.'; action = 'wallet'; }
  else if (/(earn|reward|paid|payment)/.test(text)) { reply = 'Choose a contribution, accept the current consent terms, and submit it. Rewards are recorded only after server-side review.'; action = 'tasks'; }
  else if (/(cash|withdraw|redeem|erc|crypto|token)/.test(text)) { reply = settlement.cashout.reason; action = 'settlement'; }
  else if (/(voice|record|audio)/.test(text)) { reply = 'Voice contributions require consent and server-side quality checks. Uploads remain unavailable until private storage, scanning, and retention controls are configured.'; action = 'tasks'; }
  else if (/(consent|privacy|data)/.test(text)) { reply = 'Only submit data requested by the task. Current consent is required, and uploads remain unavailable until private storage, scanning, and retention controls are configured.'; action = 'consent'; }
  else reply = 'I can help you find tasks, explain consent, connect a wallet, understand rewards, or check settlement status.';
  return NextResponse.json({ success: true, assistant: 'Worx guide', mode: 'guided', reply, action, settlement });
}
