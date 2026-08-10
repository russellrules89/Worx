import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDatabase } from '@/lib/db';
export const runtime = 'nodejs';
const input = z.object({ submission_id: z.string().uuid(), storage_reference: z.string().trim().min(1).max(500), content_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/) });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'A valid submission, storage reference, and SHA-256 digest are required' }, { status: 400 });
  try {
    const db = requireDatabase(); const data = parsed.data;
    const submissions = await db`SELECT id, consent FROM submissions WHERE id = ${data.submission_id} AND status = 'pending_review'`;
    if (!submissions.length) return NextResponse.json({ success: false, error: 'A pending submission is required' }, { status: 409 });
    const policy = (submissions[0].consent as { policy_version?: string }).policy_version ?? 'unknown';
    const records = await db`INSERT INTO contribution_records (submission_id, storage_reference, content_sha256, consent_policy_version) VALUES (${data.submission_id}, ${data.storage_reference}, ${data.content_sha256.toLowerCase()}, ${policy}) RETURNING id, submission_id, storage_reference, content_sha256, status, created_at`;
    return NextResponse.json({ success: true, data_mode: 'preview', contribution: records[0], note: 'This API records a private storage reference and integrity hash only; it never accepts contribution bytes.' }, { status: 201 });
  } catch (error) { const message = error instanceof Error && error.message.includes('unique') ? 'A contribution reference is already registered for this submission' : 'Database unavailable'; return NextResponse.json({ success: false, error: message }, { status: 503 }); }
}
