import { NextResponse } from 'next/server';
import { consentPolicyVersion, settlementStatus } from '@/lib/portal';
export const runtime = 'nodejs';
export function GET() { return NextResponse.json({ data_mode: 'preview', consent: { required: true, policy_version: consentPolicyVersion, purpose: 'Validate task contributions and calculate off-chain reward eligibility.', retention: 'A retention policy and storage provider must be configured before file uploads are accepted.' }, identity_verification: { enabled: false, provider: null, note: 'No identity document or biometric data is collected.' }, uploads: { enabled: false, note: 'File uploads are disabled until private storage, malware scanning, and retention controls are configured.' }, settlement: settlementStatus() }); }
