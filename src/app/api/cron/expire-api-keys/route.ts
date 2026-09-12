import { NextRequest, NextResponse } from 'next/server';
import { expireApiKeys } from '@/lib/api-key-service';
import { trackError, getErrorCounts } from '@/lib/observability/error-tracker';
import logger from '@/lib/logger';

// POST /api/cron/expire-api-keys — Cron job to expire API keys
// Protected by a shared secret to prevent unauthorized invocation
// Phase L10: Observability (Enhanced) — Structured cron monitoring
export async function POST(request: NextRequest) {
  const startTime = performance.now();
  const cronJobName = 'expire-api-keys';
  const requestId = `cron_${cronJobName}_${Date.now().toString(36)}`;
  const cronLogger = logger.createLogger({ service: 'cron', requestId });

  cronLogger.info('Cron job starting', {
    cronJobName,
    timestamp: new Date().toISOString(),
  });

  try {
    // Verify cron secret — require CRON_SECRET to be set
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      cronLogger.fatal('CRON_SECRET not configured — cron job cannot run');
      trackError(new Error('CRON_SECRET not configured'), {
        severity: 'critical',
        source: `cron/${cronJobName}`,
        context: { cronJobName, requestId },
      });
      return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
    }
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      cronLogger.warn('Unauthorized cron invocation attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Execute the cron job
    const result = await expireApiKeys();
    const executionTime = Math.round(performance.now() - startTime);

    // Build structured result summary
    const resultSummary = {
      cronJobName,
      executionTime,
      result: 'success',
      summary: {
        expiredKeys: result.expired,
        errors: result.errors,
      },
      timestamp: new Date().toISOString(),
    };

    cronLogger.info('Cron job completed', resultSummary);

    // Track any errors that occurred during execution
    if (result.errors > 0) {
      trackError(
        new Error(`${result.errors} errors during ${cronJobName} execution`),
        {
          severity: result.errors > 10 ? 'critical' : 'warning',
          source: `cron/${cronJobName}`,
          context: { ...resultSummary, errorCount: result.errors },
        },
      );
    }

    return NextResponse.json({
      success: true,
      cronJobName,
      executionTime,
      expired: result.expired,
      errors: result.errors,
      timestamp: new Date().toISOString(),
      errorStatus: {
        recentCount: getErrorCounts().recentCount,
        criticalCount: getErrorCounts().criticalCount,
      },
    });
  } catch (error) {
    const executionTime = Math.round(performance.now() - startTime);

    // Track the cron failure
    trackError(error, {
      severity: 'critical',
      source: `cron/${cronJobName}`,
      context: {
        cronJobName,
        requestId,
        executionTime,
      },
    });

    cronLogger.error('Cron job failed', {
      cronJobName,
      executionTime,
      error: error instanceof Error ? error : new Error(String(error)),
      errorStatus: {
        recentCount: getErrorCounts().recentCount,
        criticalCount: getErrorCounts().criticalCount,
      },
    });

    return NextResponse.json({
      success: false,
      cronJobName,
      executionTime,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      errorStatus: {
        recentCount: getErrorCounts().recentCount,
        criticalCount: getErrorCounts().criticalCount,
      },
    }, { status: 500 });
  }
}
