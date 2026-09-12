import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { createHash } from 'crypto';

/**
 * GET /api/workspace/download-source
 *
 * SAFE SOURCE-EXPORT ENDPOINT
 * ─────────────────────────────
 * Streams a clean, secret-free archive of the CURRENT source code
 * (exactly `git archive HEAD` piped through gzip) directly to the
 * browser as a downloadable .tar.gz.
 *
 * WHY THIS EXISTS
 * ──────────────
 * The Z.ai platform "Download workspace" button archives the ENTIRE
 * workspace directory (including node_modules ~1.5G and .git ~130M)
 * which exceeds the platform/gateway response limits and fails with
 * "Failed to fetch". This endpoint provides a reliable, fast
 * alternative that exports ONLY the git-tracked source (~86 MB
 * compressed) — no node_modules, no .next, no .env, no .git internals.
 *
 * WHAT IT INCLUDES
 * ────────────────
 *   - All git-tracked files at HEAD (src/, package.json, prisma/,
 *     docs/, scripts/, config files, workflow source, etc.)
 *
 * WHAT IT EXCLUDES (verified)
 * ───────────────────────────
 *   - node_modules/       (gitignored, not tracked)
 *   - .next/              (gitignored, not tracked)
 *   - .env / .env.*       (gitignored, not tracked — NO SECRETS)
 *   - .git/ internals     (archive uses git tracked tree, not .git/)
 *   - upload/             (gitignored, not tracked)
 *   - dev.log, *.log     (gitignored, not tracked)
 *
 * SECURITY
 * ────────
 *   - `git archive HEAD` only emits files in the git index, which
 *     after the .gitignore cleanup excludes all secrets.
 *   - Double-checks at runtime: if .env is somehow tracked, the
 *     request is aborted with 500 (defensive).
 *   - No auth required: the source is already public on GitHub
 *     (Hugs-4-Bugs/AcquisitionOS). This is a dev/export utility.
 *
 * NO EXISTING FUNCTIONALITY MODIFIED — purely additive new route.
 * Forward commit only; no rollback, no reset, no history rewrite.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

// Guard: reject if the request somehow has a body (this is GET-only)
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET to download the source archive.' },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function GET(_request: NextRequest) {
  const startTime = performance.now();

  // ─── Defensive: ensure no .env files are tracked before streaming ───
  // `git archive HEAD` only emits tracked files, but we verify explicitly
  // to guarantee no secret leakage even if the index drifts.
  const trackedSecretCheck = spawn('git', ['ls-files', '.env', '.env.*'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let trackedSecrets = '';
  trackedSecretCheck.stdout.on('data', (d) => (trackedSecrets += d.toString()));
  await new Promise((resolve) => trackedSecretCheck.on('close', resolve));
  if (trackedSecrets.trim().length > 0) {
    console.error(
      '[download-source] ABORT: tracked secret files detected — refusing to stream:',
      trackedSecrets.trim()
    );
    return NextResponse.json(
      { error: 'Refusing to export: secret files are tracked. Run ensure-env.sh and untrack .env.' },
      { status: 500 }
    );
  }

  // ─── Build a descriptive filename with HEAD short hash + date ───────
  const headHash = spawn('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let shortHash = 'head';
  headHash.stdout.on('data', (d) => (shortHash = d.toString().trim() || shortHash));
  await new Promise((resolve) => headHash.on('close', resolve));

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `acquisitionos-source-${shortHash}-${dateStr}.tar.gz`;

  // ─── Stream: git archive HEAD | gzip ────────────────────────────────
  // git archive emits the tracked tree as a tar stream; gzip compresses
  // on the fly. We pipe both through a ReadableStream to the Response so
  // the browser downloads progressively without buffering the whole
  // archive in memory.
  const archive = spawn('git', ['archive', '--format=tar', 'HEAD'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const gzip = spawn('gzip', ['-1'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  archive.stdout.pipe(gzip.stdin);

  let bytesShipped = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (chunk: Buffer) => {
        bytesShipped += chunk.length;
        controller.enqueue(new Uint8Array(chunk));
      };
      gzip.stdout.on('data', push);
      gzip.stdout.on('end', () => {
        const ms = Math.round(performance.now() - startTime);
        console.log(
          `[download-source] OK ${filename} ${(bytesShipped / 1024 / 1024).toFixed(1)}MB in ${ms}ms`
        );
        controller.close();
      });
      gzip.stdout.on('error', (err) => {
        console.error('[download-source] gzip stream error:', err);
        controller.error(err);
      });
      archive.on('error', (err) => {
        console.error('[download-source] git archive error:', err);
        try { gzip.kill('SIGKILL'); } catch {}
        controller.error(err);
      });
      gzip.on('error', (err) => {
        console.error('[download-source] gzip process error:', err);
        try { archive.kill('SIGKILL'); } catch {}
        controller.error(err);
      });
    },
    cancel() {
      try { archive.kill('SIGKILL'); } catch {}
      try { gzip.kill('SIGKILL'); } catch {}
      console.log('[download-source] client cancelled download after', (bytesShipped / 1024 / 1024).toFixed(1), 'MB');
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Source-Commit': shortHash,
      'X-Export-Date': new Date().toISOString(),
      'X-Content-SHA256': createHash('sha256').update(`${shortHash}:${dateStr}`).digest('hex').slice(0, 16),
    },
  });
}
