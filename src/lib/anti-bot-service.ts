// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Anti-Bot Strategy Service
// Phase 7 Remediation: Lead engine fixes
//
// Generates realistic request headers, manages request throttling,
// respects robots.txt, detects CAPTCHA/403 responses, manages sessions,
// and randomizes request fingerprints.
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

export type AntiBotHeaders = Record<string, string>;

export interface ScrapingSession {
  id: string;
  cookies: Map<string, string>;
  referer: string | null;
  userAgent: string;
  requestCount: number;
  createdAt: Date;
  lastRequestAt: Date | null;
  domainVisits: Map<string, number>;
}

export interface CaptchaResponse {
  isCaptcha: boolean;
  is403: boolean;
  type: 'recaptcha' | 'hcaptcha' | 'cloudflare' | 'custom' | 'none';
  message: string;
}

export interface RobotsTxtRule {
  path: string;
  allowed: boolean;
}

// ===== USER AGENT POOL =====

const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  // Firefox on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  // Safari on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  // Chrome on Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Firefox on Linux
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const ACCEPT_HEADERS = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
];

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-US,en;q=0.9,hi;q=0.8',
  'en-GB,en;q=0.9,en-US;q=0.8',
  'en-US,en;q=0.9,de;q=0.7,fr;q=0.6',
  'en,en-US;q=0.9',
];

// ===== SESSION MANAGEMENT =====

const activeSessions = new Map<string, ScrapingSession>();

// ===== CORE FUNCTIONS =====

/**
 * Generate realistic request headers with User-Agent rotation and fingerprint randomization.
 */
export function generateRequestHeaders(
  session?: ScrapingSession,
  targetUrl?: string
): AntiBotHeaders {
  const userAgent = session?.userAgent || getRandomUserAgent();
  const isChrome = userAgent.includes('Chrome');
  const isFirefox = userAgent.includes('Firefox');
  const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');

  const headers: AntiBotHeaders = {
    'User-Agent': userAgent,
    Accept: randomChoice(ACCEPT_HEADERS),
    'Accept-Language': randomChoice(ACCEPT_LANGUAGES),
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': randomChoice(['no-cache', 'max-age=0', 'no-store']),
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    DNT: Math.random() > 0.5 ? '1' : '0',
  };

  // Chrome-specific Client Hints
  if (isChrome) {
    const chromeVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '120';
    headers['Sec-Ch-Ua'] = `"Chromium";v="${chromeVersion}", "Not_A Brand";v="8", "Google Chrome";v="${chromeVersion}"`;
    headers['Sec-Ch-Ua-Mobile'] = '?0';
    headers['Sec-Ch-Ua-Platform'] = randomChoice(['"Windows"', '"macOS"', '"Linux"']);
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = targetUrl ? 'cross-site' : 'none';
  }

  // Add referer from session if available
  if (session?.referer) {
    headers.Referer = session.referer;
  }

  // Add cookies from session if available
  if (session?.cookies && session.cookies.size > 0) {
    headers.Cookie = Array.from(session.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  return headers;
}

/**
 * Check if robots.txt allows scraping the given path.
 * Returns true if the path should be respected (i.e., scraping is disallowed).
 */
export function shouldRespectRobotsTxt(
  robotsTxtContent: string,
  targetPath: string,
  userAgent: string = '*'
): boolean {
  const rules = parseRobotsTxt(robotsTxtContent, userAgent);

  // Check most specific rules first (longest paths first)
  const sortedRules = rules.sort((a, b) => b.path.length - a.path.length);

  for (const rule of sortedRules) {
    if (targetPath.startsWith(rule.path)) {
      return !rule.allowed; // Return true if we SHOULD respect (i.e., it's disallowed)
    }
  }

  // Default: allowed
  return false;
}

/**
 * Detect and handle CAPTCHA or 403 responses.
 */
export function handleCaptchaResponse(
  statusCode: number,
  responseBody: string,
  responseHeaders: Record<string, string>
): CaptchaResponse {
  // 403 Forbidden
  if (statusCode === 403) {
    const body = responseBody.toLowerCase();

    if (body.includes('cloudflare') && body.includes('challenge')) {
      return {
        isCaptcha: true,
        is403: true,
        type: 'cloudflare',
        message: 'Cloudflare challenge detected',
      };
    }

    if (body.includes('recaptcha') || body.includes('g-recaptcha')) {
      return {
        isCaptcha: true,
        is403: true,
        type: 'recaptcha',
        message: 'reCAPTCHA challenge detected on 403 page',
      };
    }

    if (body.includes('hcaptcha') || body.includes('h-captcha')) {
      return {
        isCaptcha: true,
        is403: true,
        type: 'hcaptcha',
        message: 'hCaptcha challenge detected on 403 page',
      };
    }

    return {
      isCaptcha: false,
      is403: true,
      type: 'none',
      message: '403 Forbidden - access denied',
    };
  }

  // Check response body for CAPTCHA on other status codes
  const body = responseBody.toLowerCase();

  if (body.includes('recaptcha') || body.includes('g-recaptcha')) {
    return {
      isCaptcha: true,
      is403: false,
      type: 'recaptcha',
      message: 'reCAPTCHA challenge detected',
    };
  }

  if (body.includes('hcaptcha') || body.includes('h-captcha')) {
    return {
      isCaptcha: true,
      is403: false,
      type: 'hcaptcha',
      message: 'hCaptcha challenge detected',
    };
  }

  if (body.includes('cloudflare') && body.includes('challenge')) {
    return {
      isCaptcha: true,
      is403: false,
      type: 'cloudflare',
      message: 'Cloudflare challenge detected',
    };
  }

  // Check for custom CAPTCHA indicators
  if (
    body.includes('captcha') ||
    body.includes('are you a robot') ||
    body.includes('verify you are human') ||
    body.includes('bot protection')
  ) {
    return {
      isCaptcha: true,
      is403: false,
      type: 'custom',
      message: 'Custom CAPTCHA/bot protection detected',
    };
  }

  return {
    isCaptcha: false,
    is403: false,
    type: 'none',
    message: '',
  };
}

/**
 * Generate a random delay between requests (1-5 seconds by default).
 * Adds jitter to avoid predictable patterns.
 */
export async function randomizeDelay(
  minMs: number = 1000,
  maxMs: number = 5000
): Promise<number> {
  const baseDelay = minMs + Math.random() * (maxMs - minMs);
  // Add ±10% jitter
  const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
  const delay = Math.max(minMs, Math.min(maxMs, baseDelay + jitter));

  await new Promise((resolve) => setTimeout(resolve, delay));
  return Math.round(delay);
}

/**
 * Create a new scraping session with a consistent identity.
 */
export function createSession(domain?: string): ScrapingSession {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const userAgent = getRandomUserAgent();

  const session: ScrapingSession = {
    id: sessionId,
    cookies: new Map(),
    referer: null,
    userAgent,
    requestCount: 0,
    createdAt: new Date(),
    lastRequestAt: null,
    domainVisits: new Map(),
  };

  if (domain) {
    session.domainVisits.set(domain, 0);
  }

  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Get an existing session by ID.
 */
export function getSession(sessionId: string): ScrapingSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Update session after a request.
 */
export function updateSession(
  sessionId: string,
  updates: {
    referer?: string;
    cookies?: Array<{ name: string; value: string }>;
    domain?: string;
  }
): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (updates.referer) {
    session.referer = updates.referer;
  }

  if (updates.cookies) {
    for (const cookie of updates.cookies) {
      session.cookies.set(cookie.name, cookie.value);
    }
  }

  if (updates.domain) {
    const visits = session.domainVisits.get(updates.domain) || 0;
    session.domainVisits.set(updates.domain, visits + 1);
  }

  session.requestCount++;
  session.lastRequestAt = new Date();
}

/**
 * Destroy a session and clean up resources.
 */
export function destroySession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

/**
 * Get the count of active sessions.
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Clean up stale sessions (older than 30 minutes).
 */
export function cleanupStaleSessions(): number {
  const staleThreshold = Date.now() - 30 * 60 * 1000;
  let cleaned = 0;

  for (const [id, session] of activeSessions.entries()) {
    if (
      session.lastRequestAt &&
      session.lastRequestAt.getTime() < staleThreshold
    ) {
      activeSessions.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

// ===== UTILITY FUNCTIONS =====

function getRandomUserAgent(): string {
  return randomChoice(USER_AGENTS);
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Parse robots.txt content and extract rules for a given user agent.
 */
function parseRobotsTxt(content: string, userAgent: string = '*'): RobotsTxtRule[] {
  const rules: RobotsTxtRule[] = [];
  const lines = content.split('\n').map((l) => l.trim());

  let currentAgent = '';
  let isRelevant = false;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') continue;

    const [directive, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    const directiveLower = directive.trim().toLowerCase();

    if (directiveLower === 'user-agent') {
      currentAgent = value;
      isRelevant = currentAgent === userAgent || currentAgent === '*';
      continue;
    }

    if (!isRelevant) continue;

    if (directiveLower === 'disallow') {
      if (value) {
        rules.push({ path: value, allowed: false });
      }
    } else if (directiveLower === 'allow') {
      if (value) {
        rules.push({ path: value, allowed: true });
      }
    }
  }

  return rules;
}

// Periodic cleanup of stale sessions (every 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cleaned = cleanupStaleSessions();
    if (cleaned > 0) {
      console.log(`[AntiBot] Cleaned up ${cleaned} stale sessions`);
    }
  }, 10 * 60 * 1000);
}
