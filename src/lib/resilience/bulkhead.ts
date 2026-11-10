// AcquisitionOS — Bulkhead (concurrency limiter)
// Limits the number of concurrent in-flight operations for a named resource
// pool. Prevents one slow subsystem from starving other subsystems.

import logger from '@/lib/logger';

export class BulkheadFullError extends Error {
  constructor(public readonly name: string, public readonly maxConcurrent: number) {
    super(`Bulkhead "${name}" is full (${maxConcurrent} concurrent)`);
    this.name = 'BulkheadFullError';
  }
}

export interface BulkheadOptions {
  maxConcurrent: number;
  queueTimeoutMs?: number;
}

interface BulkheadInternal {
  name: string;
  maxConcurrent: number;
  queueTimeoutMs?: number;
  active: number;
  highWaterMark: number;
}

const bulkheads = new Map<string, BulkheadInternal>();

export function getBulkhead(name: string, options: BulkheadOptions) {
  let b = bulkheads.get(name);
  if (!b) {
    b = {
      name,
      maxConcurrent: options.maxConcurrent,
      queueTimeoutMs: options.queueTimeoutMs,
      active: 0,
      highWaterMark: 0,
    };
    bulkheads.set(name, b);
  }
  return {
    run: <T>(fn: () => Promise<T>): Promise<T> => runWithBulkhead(b!, fn),
    getActive: (): number => b!.active,
    getMaxConcurrent: (): number => b!.maxConcurrent,
    getHighWaterMark: (): number => b!.highWaterMark,
  };
}

async function runWithBulkhead<T>(b: BulkheadInternal, fn: () => Promise<T>): Promise<T> {
  if (b.active < b.maxConcurrent) {
    b.active++;
    if (b.active > b.highWaterMark) b.highWaterMark = b.active;
    try {
      return await fn();
    } finally {
      b.active--;
    }
  }

  if (!b.queueTimeoutMs) {
    throw new BulkheadFullError(b.name, b.maxConcurrent);
  }

  const start = Date.now();
  while (b.active >= b.maxConcurrent) {
    if (Date.now() - start > b.queueTimeoutMs!) {
      throw new BulkheadFullError(b.name, b.maxConcurrent);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  b.active++;
  if (b.active > b.highWaterMark) b.highWaterMark = b.active;
  try {
    return await fn();
  } finally {
    b.active--;
  }
}

export function getAllBulkheadStates(): Array<{
  name: string;
  active: number;
  maxConcurrent: number;
  highWaterMark: number;
}> {
  return Array.from(bulkheads.values()).map((b) => ({
    name: b.name,
    active: b.active,
    maxConcurrent: b.maxConcurrent,
    highWaterMark: b.highWaterMark,
  }));
}

export function _resetAllBulkheads(): void {
  bulkheads.clear();
}
