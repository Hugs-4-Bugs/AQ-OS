'use client';

import { useState, useEffect } from 'react';

interface PaymentProviderStatus {
  stripe: {
    available: boolean;
    mode: 'test' | 'live' | null;
    publishableKey: string | null;
  };
  razorpay: {
    available: boolean;
    mode: 'test' | 'live' | null;
    keyId: string | null;
  };
  anyAvailable: boolean;
  loading: boolean;
}

const DEFAULT_STATUS: PaymentProviderStatus = {
  stripe: { available: false, mode: null, publishableKey: null },
  razorpay: { available: false, mode: null, keyId: null },
  anyAvailable: false,
  loading: true,
};

/**
 * Hook to check which payment providers (Stripe / Razorpay) are configured.
 * Fetches from the public /api/payments/provider-status endpoint once on mount.
 */
export function usePaymentProviders() {
  const [status, setStatus] = useState<PaymentProviderStatus>(DEFAULT_STATUS);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/payments/provider-status');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setStatus({ ...data, loading: false });
        } else if (!cancelled) {
          setStatus(prev => ({ ...prev, loading: false }));
        }
      } catch {
        if (!cancelled) {
          setStatus(prev => ({ ...prev, loading: false }));
        }
      }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  return status;
}
