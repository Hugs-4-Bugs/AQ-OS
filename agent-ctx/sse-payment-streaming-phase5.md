# SSE Payment Status Streaming — Phase 5

## Task: Create SSE infrastructure for real-time payment status updates

### Files Created

1. **`/home/z/my-project/src/app/api/payments/sse/route.ts`** — SSE endpoint
2. **`/home/z/my-project/src/hooks/use-payment-sse.ts`** — React hook for consuming SSE

### SSE Endpoint (`/api/payments/sse/route.ts`)

- **Authentication**: Uses `getAuthUser` directly (same auth mechanism as `withAuth`) because SSE requires returning a streaming `Response`, not `NextResponse`
- **Response headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
- **Event types**:
  - `connected` — Initial connection with full payment status snapshot
  - `payment_status` — Payment order status changed
  - `subscription_update` — Subscription status/plan/cycle changed
  - `credit_update` — Credit balance changed
  - `heartbeat` — Keep-alive every 30 seconds
- **Implementation**:
  - ReadableStream with TextEncoder for SSE event formatting
  - 10-second interval for payment status polling (compares previous snapshot)
  - 30-second heartbeat interval
  - 5-minute max connection duration (auto-close)
  - Client disconnect detection via `request.signal.addEventListener('abort')`
  - Fetches data from: `db.subscription.findFirst`, `db.user.findUnique`, `db.paymentOrder.findFirst`, `db.creditAddon.aggregate`
- **Change detection**: Compares previous and current snapshots, only emits events when state changes

### usePaymentSSE Hook (`/hooks/use-payment-sse.ts`)

- **Exported types**: `PaymentSSEData`, `UsePaymentSSEReturn`, `UsePaymentSSEOptions`
- **Options**: `{ autoConnect?: boolean, onStatusUpdate?: (data) => void }`
- **Return**: `{ data, isConnected, error, reconnect }`
- **Implementation**:
  - Uses `connectionTrigger` state counter to manage connection lifecycle
  - `EventSource` with `withCredentials: true` for cookie-based auth
  - Handles all 5 SSE event types with proper parsing and state updates
  - Exponential backoff reconnection: 1s → 2s → 4s → ... → 30s max
  - Derived `isConnected` from `connectionActive && isAuthenticated`
  - Derived `error` that shows "Not authenticated" when unauthenticated
  - Syncs subscription store on `subscription_update` and `credit_update` events via `useSubscriptionStore.getState()`
  - Stable `onStatusUpdateRef` to avoid re-creating the effect on callback changes
  - Graceful cleanup on unmount

### Lint Status

- 0 errors, 1 pre-existing warning (TanStack Table in leads-tab.tsx)
- All React Compiler rules satisfied (no synchronous setState in effects, no ref access during render)
