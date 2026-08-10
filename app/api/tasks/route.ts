import { NextResponse } from 'next/server';
import { getTasks } from '@/lib/portal';
export const runtime = 'nodejs';
export async function GET() { try { return NextResponse.json({ data_mode: 'preview', tasks: await getTasks() }); } catch { return NextResponse.json({ error: 'Database unavailable' }, { status: 503 }); } }
