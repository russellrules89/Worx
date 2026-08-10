import { NextResponse } from 'next/server';
import Stripe from 'stripe';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; const key = process.env.STRIPE_SECRET_KEY; const signature = request.headers.get('stripe-signature');
  if (!secret || !key) return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
  if (!signature) return NextResponse.json({ error: 'Missing Stripe-Signature header' }, { status: 400 });
  try { new Stripe(key).webhooks.constructEvent(await request.text(), signature, secret); return NextResponse.json({ received: true }); } catch { return NextResponse.json({ error: 'Invalid Stripe webhook signature' }, { status: 400 }); }
}
