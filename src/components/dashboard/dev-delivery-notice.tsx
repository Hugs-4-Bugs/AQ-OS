'use client';

import { AlertTriangle, ClipboardPaste, Mail, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DevDeliveryPayload } from '@/lib/dev-auth';

/**
 * Parse a `devDelivery` field out of an auth API response. Returns
 * undefined for anything that does not match the expected shape, so it is
 * safe to call with arbitrary parsed JSON (e.g. production responses that
 * never include the field).
 */
export function parseDevDelivery(data: unknown): DevDeliveryPayload | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = (data as { devDelivery?: unknown }).devDelivery;
  if (!d || typeof d !== 'object') return undefined;
  const obj = d as Record<string, unknown>;
  if (obj.type !== 'otp' && obj.type !== 'magic-link') return undefined;
  if (typeof obj.code !== 'string' && typeof obj.url !== 'string') return undefined;
  return {
    type: obj.type,
    code: typeof obj.code === 'string' ? obj.code : undefined,
    url: typeof obj.url === 'string' ? obj.url : undefined,
    note: typeof obj.note === 'string' ? obj.note : undefined,
  };
}

/**
 * Dev-mode delivery panel.
 *
 * Shown in auth pages when the server could not send an email (no SMTP /
 * Resend provider configured) but the dev-only auth delivery is enabled —
 * the generated code / link is surfaced in-place so the user can continue.
 * NEVER rendered in production (the API never returns `devDelivery` there).
 */
export function DevDeliveryNotice({
  delivery,
  onFillCode,
  fillLabel = 'Fill code',
  className = '',
}: {
  delivery: DevDeliveryPayload | undefined;
  /** Called when the user clicks "Fill code" (OTP flows). Optional. */
  onFillCode?: (code: string) => void;
  fillLabel?: string;
  className?: string;
}) {
  if (!delivery) return null;
  return (
    <div
      className={`rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-800 dark:text-blue-300 overflow-hidden ${className}`}
      role="status"
      data-testid="dev-delivery-notice"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold mb-1">
            Dev mode — email delivery not configured
          </p>
          <p className="text-xs leading-relaxed mb-2">{delivery.note}</p>

          {delivery.type === 'otp' && delivery.code && (
            <div className="flex flex-wrap items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" />
              <span
                className="font-mono text-lg font-bold tracking-[0.3em] select-all"
                data-testid="dev-delivery-code"
              >
                {delivery.code}
              </span>
              {onFillCode && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onFillCode(delivery.code as string)}
                >
                  <ClipboardPaste className="mr-1 h-3 w-3" />
                  {fillLabel}
                </Button>
              )}
            </div>
          )}

          {delivery.type === 'magic-link' && delivery.url && (
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                window.location.href = delivery.url as string;
              }}
            >
              <Link2 className="mr-1 h-3 w-3" />
              Open sign-in link
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
