import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Worx Worker Portal', description: 'Consent-first contributor workflow' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
