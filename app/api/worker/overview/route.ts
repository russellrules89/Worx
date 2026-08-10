import { NextResponse } from 'next/server';
import { getOverview } from '@/lib/portal';
export const runtime = 'nodejs';
export async function GET() { try { return NextResponse.json(await getOverview()); } catch { return NextResponse.json({ error: 'Database unavailable' }, { status: 503 }); } }
