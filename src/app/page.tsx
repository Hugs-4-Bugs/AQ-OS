'use client';

import AuthGate from '@/components/dashboard/auth-gate';
import { Providers } from '@/components/providers';

export default function Home() {
  return (
    <Providers>
      <AuthGate />
    </Providers>
  );
}
