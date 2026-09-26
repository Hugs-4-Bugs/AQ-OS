# pdf_body_data1.py — Chapters 1-10 (verified against repository HEAD 30624fe)
# Block kinds: h1, h2, p, bullets, table(headers,rows,ratios,caption), code, callout

CHAPTERS_1 = [
("1. Product Overview", [
('p', 'AcquisitionOS (package name <b>vantage</b>, version 0.2.0) is a single Next.js 16 '
      'full-stack application: the React frontend, the HTTP API and all backend services live in '
      'one project and run in one process. There is no separate backend server to start. This '
      'document was produced by direct inspection of the actual repository (HEAD 30624fe, branch '
      'main) on 2026-09-22; every command, path, version and variable named here was verified in '
      'code, and items that depend on external accounts are explicitly marked as external '
      'requirements.'),
('table',
 ['Fact', 'Verified value', 'Evidence'],
 [
  ['Framework', 'Next.js 16.1.3, App Router', 'package.json, src/app/layout.tsx'],
  ['React / TypeScript', 'React 19.2.3 / TypeScript 5.9.3', 'lockfile, tsconfig.json'],
  ['UI system', 'Tailwind CSS 4.1.18 + shadcn/ui + 27 Radix packages', 'globals.css, components.json'],
  ['Backend API', '507 Next.js Route Handlers under src/app/api/', 'file count'],
  ['Database', 'SQLite file db/custom.db via Prisma 6.19.2 (105 models)', 'prisma/schema.prisma'],
  ['Redis', 'Not required (optional pub/sub only)', 'src/lib/redis-pubsub-service.ts'],
  ['AI', 'Built-in Z-AI SDK; optional OpenAI / Anthropic / OpenRouter / local fallbacks', 'src/lib/ai/ai-provider.ts'],
  ['Auth', 'Custom JWT stack: OTP email, magic link, Google OAuth, TOTP MFA', 'src/lib/auth.ts'],
  ['Ports', 'App 3000; optional realtime sidecar 3003', 'package.json, Makefile'],
 ], [0.20, 0.46, 0.34], 'Verified core facts and their sources.'),
('p', 'Equally important is what a developer does <b>not</b> need locally: PostgreSQL, Redis, '
      'Docker, the Python FastAPI service under backend/, Celery, and the mini-services sidecars '
      'are all optional. The complete application runs on Node.js plus a SQLite file, which makes '
      'the zero-to-running path short and reproducible on a brand-new machine.'),
]),

("2. Complete Technology Stack", [
('h2', '2.1 Frontend'),
('table',
 ['Technology', 'Version', 'Purpose'],
 [
  ['Next.js (App Router)', '16.1.3', 'Full-stack framework; dev on Turbopack, build on webpack'],
  ['React / React DOM', '19.2.3', 'UI runtime'],
  ['TypeScript', '5.9.3', 'Strict mode (noImplicitAny relaxed)'],
  ['Tailwind CSS', '4.1.18', 'CSS-first config (globals.css @theme inline)'],
  ['shadcn/ui + Radix UI', '27 Radix packages', 'Component primitives in src/components/ui/'],
  ['lucide-react', '0.525.0', 'Icon set (tree-shaken)'],
  ['framer-motion', '12.26.2', 'Animation'],
  ['recharts', '2.15.4', 'Charts via ui/chart.tsx'],
  ['zustand', '5.0.10', 'Six client stores in src/lib/*-store.ts'],
  ['@tanstack/react-query', '5.90.19', 'Server-state cache'],
  ['@dnd-kit (core/sortable/utilities)', '6.3.1 / 10.0.0 / 3.2.2', 'Kanban drag and drop'],
  ['cmdk, input-otp, sonner, react-day-picker, qrcode.react, react-markdown', 'various', 'Palette, OTP input, toasts, calendar, QR, markdown'],
  ['Fonts', 'Geist + Geist Mono via next/font/google', 'src/app/layout.tsx'],
 ], [0.34, 0.20, 0.46], 'Frontend stack (versions resolved from package.json and lockfile).'),
('h2', '2.2 Backend / Server'),
('bullets', [
 '<b>Runtime model:</b> one Next.js process serves pages, 507 API route handlers, SSE streams '
 '(/api/events/*) and server-side services; server components and route handlers share the '
 'Prisma client from src/lib/db.ts.',
 '<b>Auth libraries:</b> jsonwebtoken 9.0.3 (Node) and jose 6.2.3 (Edge proxy), bcryptjs 3.0.3 '
 'for password hashing (12 rounds); next-auth 4.24.11 is declared but never imported.',
 '<b>Payments:</b> stripe 22.1.1 (API 2025-04-30.basil) and razorpay 2.9.6.',
 '<b>Email:</b> resend 6.12.3 (primary) and nodemailer 8.0.7 (SMTP fallback).',
 '<b>Observability:</b> custom logger, metrics collector, alert engine and health checks under '
 'src/lib/observability/; OpenTelemetry packages are installed but never initialized; Sentry is '
 'a console shim behind NEXT_PUBLIC_SENTRY_DSN.',
 '<b>Validation:</b> zod 4.x in src/lib/security/input-validator.ts.',
]),
]),

("3. Architecture and Repository Structure", [
('p', 'This is one full-stack application. The frontend (React components), the backend (API '
      'route handlers) and all server services live in the same src/ tree and ship as one build '
      'artifact. Do not look for a separate backend directory to run; the only genuinely separate '
      'processes are optional sidecars.'),
('table',
 ['Path', 'Contents'],
 [
  ['src/app/', 'App Router pages + 507 API route handlers (the backend)'],
  ['src/components/', '249 tsx: ui/ (shadcn), dashboard/, admin/, meetings/, feedback/'],
  ['src/lib/', '261 ts files: ai/, security/, observability/, payments/, gmail-*, workflow-*, meetings/ and more'],
  ['src/hooks/', '23 client hooks (auth, SSE, websocket, payment)'],
  ['src/proxy.ts', 'Next 16 edge proxy: route protection, CSRF, security headers (jose jwtVerify)'],
  ['prisma/', 'schema.prisma (105 models), schema.production.prisma (PG target), 4 migrations'],
  ['db/', 'custom.db - the live SQLite database (about 4.2 MB)'],
  ['scripts/', '120+ ops/dev scripts incl. backup/, seed.ts, security-scan.ts'],
  ['mini-services/', '5 optional Bun sidecars: realtime-service (:3003), ws-service, proxy, email-service, server-watchdog'],
  ['backend/', 'Optional Python FastAPI + Celery stack (not imported by Next.js)'],
  ['docs/, infra/, deploy/', 'Deployment runbooks, ops strategy, platform assets'],
  ['tests/', '37 vitest files: unit/, integration/, e2e/, load/'],
 ], [0.22, 0.78], 'Repository map (depth 2, excluding node_modules and .next).'),
('callout', 'Optional realtime sidecar: mini-services/realtime-service (Bun + Socket.IO on port '
            '3003). The in-app primary realtime path is SSE and works without it; the client '
            'socket hook degrades gracefully with reconnection disabled.'),
]),

("4. Prerequisites and Brand-New Mac Setup", [
('p', 'Assume a completely new Apple Mac: no package manager, no Node.js, no Git, no database. '
      'The following versions are required; anything beyond this list is optional. Both Apple '
      'Silicon and Intel are supported (Homebrew auto-installs to /opt/homebrew on ARM).'),
('table',
 ['Software', 'Version', 'Why needed'],
 [
  ['macOS', '13 or newer', 'Node 20 support'],
  ['Xcode Command Line Tools', 'latest', 'Provides Git and compilers'],
  ['Homebrew', 'latest', 'Package manager'],
  ['Node.js', '20 LTS or newer (>= 20.9)', 'Next.js 16 requirement; Dockerfile pins node:20-alpine'],
  ['npm', '10.x (bundled)', 'Matches vercel.json install command'],
  ['Bun (optional)', '1.1+', 'Only for scripts/seed.ts, mini-services, make targets'],
  ['VS Code (optional)', 'latest', 'Editor'],
 ], [0.30, 0.28, 0.42], 'Required software. PostgreSQL, Redis, Docker and Python are NOT required locally.'),
('code',
 'xcode-select --install\n'
 '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n'
 'brew install node@20\n'
 'brew link node@20\n'
 'node -v\n'
 'npm -v'),
('p', 'Not required locally, verified: PostgreSQL (the database is SQLite), Redis (optional '
      'pub/sub only), Docker (only for containerized deployment), and Python (the backend/ '
      'FastAPI stack is a separate optional service, not imported by the Next.js app).'),
]),

("5. Git Repository Setup", [
('p', 'The canonical remote is https://github.com/Hugs-4-Bugs/AQ-OS.git, branch main. Clone the '
      'current main branch and verify its state before doing anything else. Never reset, revert, '
      'checkout an older commit, or force-pull over the working tree; the current HEAD is the '
      'single source of truth.'),
('code',
 'git config --global user.name  "Your Name"\n'
 'git config --global user.email "you@example.com"\n'
 'git clone https://github.com/Hugs-4-Bugs/AQ-OS.git AcquisitionOS\n'
 'cd AcquisitionOS\n'
 'git checkout main\n'
 'git branch --show-current\n'
 'git rev-parse HEAD\n'
 'git status --porcelain'),
('p', 'Verification expectations: branch prints main; rev-parse prints the current commit hash '
      '(record it); status prints nothing on a clean tree. Then install dependencies with the '
      'exact command the repository expects (npm with legacy peer deps, because next-auth 4 and '
      'nodemailer 8 declare conflicting peer ranges - the same combination used by vercel.json '
      'and the Dockerfile):'),
('code',
 'npm install --legacy-peer-deps'),
('p', 'The postinstall hook runs prisma generate automatically, so the typed Prisma client is '
      'ready before the first build. bun install also works (a bun.lock exists and the Makefile '
      'uses it), but npm is the documented default because production uses npm.'),
]),

("6. Database Setup (SQLite, zero external services)", [
('p', 'The application actually uses SQLite. Three independent evidence points verify this: '
      'prisma/schema.prisma declares provider = "sqlite"; the environment DATABASE_URL is a '
      'file: URL pointing at db/custom.db; and that file exists on disk containing all 105 '
      'tables with live data. PostgreSQL appears only in production-target documents, the '
      'Supabase-oriented schema.production.prisma, and the guided migration script '
      'scripts/migrate-to-postgresql.sh. A developer needs zero external database services.'),
('code',
 'npm run db:generate        # generate Prisma Client (also runs via postinstall)\n'
 'npm run db:push            # push schema to the SQLite file (the real dev workflow)\n'
 'npx prisma studio          # browse data on http://localhost:5555\n'
 'bun run scripts/seed.ts    # OPTIONAL sample data (destructive: deletes leads/deals first)'),
('table',
 ['Operation', 'Command', 'Notes'],
 [
  ['Start / stop database', 'nothing to start', 'It is a file: db/custom.db'],
  ['Schema change', 'npm run db:push', 'Canonical workflow; only 4 migrations exist vs 105 models'],
  ['Formal migrations', 'npm run db:migrate', 'Works, but migration state has drifted from schema'],
  ['Backup', 'npm run backup', 'Pass DB_PATH=db/custom.db (script default points elsewhere)'],
  ['Destructive reset', 'npm run db:reset', 'DEV ONLY - deletes all data; never run against shared data'],
 ], [0.24, 0.30, 0.46], 'Daily database operations (Prisma 6.19.2).'),
]),

("7. Redis Policy (explicitly not required)", [
('p', 'The application runs fully without Redis, and the current workspace demonstrably does. '
      'The only Redis client usage sits behind lazy guards: src/lib/redis-pubsub-service.ts '
      'connects only on first publish/subscribe and only if REDIS_URL is set, and the health '
      'check skips Redis entirely when it is not configured. Caching, rate limiting and queues '
      'all have in-memory implementations (gmail-cache-service.ts, security/rate-limiter.ts, '
      'performance/cache-manager.ts). No BullMQ or Bull dependency exists.'),
('table',
 ['Feature', 'Behaviour without Redis'],
 [
  ['Cross-process realtime fan-out', 'Works in-process; fan-out across multiple instances is lost (irrelevant locally)'],
  ['Health endpoint Redis component', 'Reports "Redis not configured - skipped" (healthy, not failing)'],
  ['Sessions, caching, rate limiting, queues', 'Unaffected - in-memory implementations'],
 ], [0.38, 0.62], 'Everything else degrades to nothing: local development is identical without Redis.'),
('callout', 'Do not install Redis on the Mac unless you later run the optional Socket.IO '
            'sidecar, which accepts REDIS_URL for cross-instance fan-out.'),
]),

("8. Environment Variables and Secrets", [
('p', 'A repository-wide audit found 201 unique environment variable names, of which 46 are '
      'secret-class and 5 reach the client bundle (NEXT_PUBLIC_*). The boot-critical minimal set '
      'is three variables: DATABASE_URL, JWT_SECRET (aliases AUTH_SECRET and NEXTAUTH_SECRET are '
      'accepted) and NEXT_PUBLIC_APP_URL. Everything else degrades gracefully. The safe template '
      '.env.example ships with the repository; copy it to .env and fill real values.'),
('table',
 ['Variable', 'Class', 'Purpose / source'],
 [
  ['DATABASE_URL', 'required, secret', 'SQLite file locally; managed PostgreSQL in production'],
  ['JWT_SECRET / AUTH_SECRET / NEXTAUTH_SECRET', 'required, secret', 'JWT signing; self-generate 64-hex random'],
  ['NEXT_PUBLIC_APP_URL', 'required, client', 'Public URL fallback (dynamic origin wins)'],
  ['GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET', 'optional, secret', 'Google sign-in; Google Cloud Console OAuth client'],
  ['SMTP_USER / SMTP_PASSWORD', 'optional, secret', 'Gmail SMTP; 16-char Google Account App Password'],
  ['RESEND_API_KEY', 'optional, secret', 'Primary email provider (resend.com API keys)'],
  ['GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX', 'optional, secret', 'Lead discovery search (Cloud API key + engine id)'],
  ['STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / price IDs', 'optional, secret', 'Billing; Stripe Dashboard Developers section'],
  ['RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET', 'optional, secret', 'India gateway; Razorpay Dashboard'],
  ['OPENAI / ANTHROPIC / OPENROUTER keys', 'optional, secret', 'AI fallback chain (built-in Z-AI needs no key)'],
  ['CRON_SECRET', 'optional, secret', 'Bearer token for /api/cron/* endpoints; self-generate'],
  ['ENCRYPTION_KEY / GMAIL_ENCRYPTION_KEY', 'optional, secret', 'Token encryption at rest; ENCRYPTION_KEY throws in production if unset'],
  ['REDIS_URL', 'optional', 'Pub/sub fan-out only; omit locally'],
 ], [0.40, 0.20, 0.40], 'Core variables. Full 201-name inventory with sources: ENVIRONMENT-VARIABLES.md.'),
('h2', '8.1 Secret handling rules (enforced)'),
('bullets', [
 '.gitignore line 34 covers .env*; .env, .env.local and .env.*.local are never committed.',
 '.env.example contains placeholders only and is the shareable template.',
 'No real credential value appears in any documentation or PDF in this repository.',
 '<b>Known leak requiring rotation (verified):</b> the git-tracked file ensure-env.sh embeds '
 'real-looking Google OAuth, Gmail app-password and search API values. Treat them as exposed: '
 'rotate them in Google Cloud Console / Google Account, then keep the new values only in .env.',
 'AUTH_DEV_MODE: when NODE_ENV is not production AND this is not the literal string "false", '
 'unsendable OTP codes are returned in API responses (src/lib/dev-auth.ts). With real email '
 'configured the flag is irrelevant; keep it false in any shared environment.',
]),
('code',
 "cp .env.example .env\n"
 "# generate strong secrets (repeat for each secret name):\n"
 "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
 "# then append to .env:\n"
 "#   JWT_SECRET=<hex>  AUTH_SECRET=<hex>  NEXTAUTH_SECRET=<hex>\n"
 "#   CRON_SECRET=<hex>\n"
 "git check-ignore -v .env    # must confirm the file is ignored"),
]),

("9. AI Providers", [
('p', 'The AI stack is single-dependency by default: the bundled z-ai-web-dev-sdk (0.0.18) '
      'requires no API key at the application level and powers chat, lead analysis, outreach '
      'generation, discovery research, competitor intelligence, workflow AI nodes, meeting '
      'assistants and RAG-style embeddings. The central dispatcher src/lib/ai/ai-provider.ts '
      'builds a fallback chain: Z-AI always first, then OpenAI, Anthropic and OpenRouter only if '
      'their keys exist, then a local LLM endpoint if AI_LOCAL_ENDPOINT is set. Each provider '
      'gets retries with exponential backoff and a timeout; if all fail, callers refund credits '
      'and surface a clear error.'),
('table',
 ['Provider', 'Trigger env vars', 'Default model', 'If missing'],
 [
  ['Z-AI (built-in)', 'none', 'SDK server-side default', 'Chain reports failure; credits refunded'],
  ['OpenAI', 'OPENAI_API_KEY (+_MODEL, _BASE_URL)', 'gpt-4o', 'Not appended to chain; nothing breaks'],
  ['Anthropic', 'ANTHROPIC_API_KEY (+_MODEL, _BASE_URL)', 'claude-sonnet-4-20250514', 'Not appended; nothing breaks'],
  ['OpenRouter', 'OPENROUTER_API_KEY (+_MODEL, _BASE_URL)', 'openai/gpt-4o', 'Not appended; nothing breaks'],
  ['Local LLM', 'AI_LOCAL_ENDPOINT (+AI_LOCAL_MODEL)', 'local-default', 'Not appended; nothing breaks'],
 ], [0.20, 0.34, 0.24, 0.22], 'Provider selection and degradation (verified in ai-provider.ts).'),
('p', 'Web research (lead discovery, deep research, website intelligence) uses Google Custom '
      'Search (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX or GOOGLE_SEARCH_ENGINE_ID) with a '
      'SerpAPI fallback (SERPAPI_KEY) and the Z-AI web_search / page_reader tools. Lead '
      'discovery fails fast with an explicit "No search API configured" error when neither '
      'search provider is set - this is the one AI-adjacent feature that hard-requires keys. '
      'Embeddings are novel: a 64-dimension vector is elicited from the chat model and stored as '
      'JSON in Prisma, with cosine similarity computed in JavaScript; no pgvector or embedding '
      'API exists.'),
]),

("10. Email System", [
('p', 'Email is real-only by design: the Ethereal test-inbox fallback was permanently removed '
      'from src/lib/email.ts. The provider chain is Resend first (when RESEND_API_KEY is set and '
      'non-placeholder), then Nodemailer SMTP, and if neither is configured sendEmail returns a '
      'clear error that auth routes surface to the user. Nine SMTP password alias names are '
      'accepted (SMTP_PASSWORD, SMTP_PASS, GMAIL_APP_PASSWORD, GMAIL_PASSWORD, and others), so '
      'operations teams can use whichever name they already provisioned.'),
('table',
 ['Trigger', 'Route / service', 'Recipient'],
 [
  ['OTP login code (6 digits, 10 min, 5 attempts)', 'POST /api/auth/otp/request to sendEmail()', 'User inbox'],
  ['Magic link (32-byte token, 15 min)', 'POST /api/auth/magic-link/request', 'User inbox'],
  ['Suspicious-login security alert', 'auth.ts sendSecurityAlertEmail()', 'User inbox'],
  ['Invoices and failed-payment notices', 'payment flows', 'User inbox'],
  ['Notifications and sequence emails', 'notification-engine / sequence engine', 'User or leads'],
 ], [0.40, 0.36, 0.24], 'Verified trigger-to-recipient map. Provider chain: Resend, then Gmail SMTP.'),
('p', 'Local behaviour with real credentials: Gmail SMTP needs a 16-character App Password from '
      'Google Account (Security, 2-Step Verification, App passwords), with SMTP_HOST smtp.gmail.com '
      'and SMTP_PORT 587. Once SMTP or Resend is configured, the login screen stops showing the '
      '"Dev mode - email delivery not configured" banner and codes are emailed for real. In '
      'production builds the dev-mode code exposure is impossible regardless of configuration.'),
]),
]
