import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDatabase } from '@/lib/db';
import { consentPolicyVersion } from '@/lib/portal';
export const runtime = 'nodejs';
const input = z.object({ task_id: z.string().uuid(), worker_name: z.string().trim().min(1).max(80), wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(), consent: z.literal(true) });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'A valid task, worker name, and consent are required' }, { status: 400 });
  try {
    const db = requireDatabase(); const data = parsed.data;
    const tasks = await db`SELECT id FROM tasks WHERE id = ${data.task_id} AND status = 'open'`;
    if (!tasks.length) return NextResponse.json({ success: false, error: 'Open task not found' }, { status: 404 });
    const consent = JSON.stringify({ accepted: true, policy_version: consentPolicyVersion, accepted_at: new Date().toISOString() });
    const rows = await db`INSERT INTO submissions (task_id, worker_name, wallet_address, consent) VALUES (${data.task_id}, ${data.worker_name}, ${data.wallet_address ?? null}, ${consent}::jsonb) RETURNING id, task_id, worker_name, wallet_address, consent, status, created_at`;
    await db`UPDATE tasks SET submitted_count = submitted_count + 1 WHERE id = ${data.task_id}`;
    return NextResponse.json({ success: true, data_mode: 'preview', submission: rows[0], note: 'Submission is pending server-side review. No reward or payment has been created.' }, { status: 201 });
  } catch { return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 }); }
}
export async function GET() { try { const db = requireDatabase(); const rows = await db`SELECT id, task_id, status, final_reward_work, created_at, reviewed_at FROM submissions ORDER BY created_at DESC`; return NextResponse.json({ data_mode: 'preview', submissions: rows }); } catch { return NextResponse.json({ error: 'Database unavailable' }, { status: 503 }); } }
