// AcquisitionOS — Resilience barrel export

export {
  getCircuitBreaker,
  getAllBreakerStates,
  resetBreaker,
  BreakerOpenError,
  BreakerTimeoutError,
  type CircuitBreakerOptions,
  type BreakerState,
  _resetAllBreakers,
} from './circuit-breaker';

export {
  getBulkhead,
  getAllBulkheadStates,
  BulkheadFullError,
  type BulkheadOptions,
  _resetAllBulkheads,
} from './bulkhead';

export { withRetry, type RetryOptions } from './retry';

export {
  isFeatureDegraded,
  getDegradedFeatures,
  setFeatureDegraded,
  degradedResponse,
  _resetEnvParsedForTests,
  type DegradableFeature,
} from './degraded-mode';
