// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Website Quality Scorer
// Analyzes a company website and produces a comprehensive score
// with gaps and opportunity statements.
//
// No AI calls — pure HTML analysis with cheerio.
// ═══════════════════════════════════════════════════════════════════

// DYNAMIC IMPORT: cheerio is ~3MB. Load only when scraping to reduce startup memory.
// This prevents the module from being loaded at server boot.

// ===== TYPES =====

export interface WebsiteScore {
  overallScore: number;          // 0-100
  hasWebsite: boolean;
  isMobile: boolean;
  hasSSL: boolean;
  loadSpeed: 'fast' | 'slow' | 'unknown';
  hasContactInfo: boolean;
  hasSocialLinks: boolean;
  hasOnlineBooking: boolean;     // relevant for restaurants, doctors etc
  techStack: string[];
  designAge: 'modern' | 'outdated' | 'unknown';
  seoScore: number;              // 0-100
  gaps: string[];                // human readable gap list
  opportunityStatement: string;  // 1 sentence: what we can offer
}

// ===== CONSTANTS =====

const FETCH_TIMEOUT_MS = 5000; // 5 second timeout (reduced from 8)
const MAX_HTML_SIZE = 500 * 1024; // 500KB max HTML response size

const BOOKING_KEYWORDS = [
  'book', 'reserve', 'appointment', 'schedule',
  'order online', 'book now', 'book a table',
  'make a reservation', 'request appointment',
  'online scheduling', 'book an appointment',
];

// Modern platforms that indicate a newer website
const MODERN_PLATFORMS = [
  'Webflow', 'Next.js', 'React', 'Ghost',
  'Shopify', 'Squarespace',
];

// Platforms that often indicate a basic/DIY site (not necessarily outdated)
const BASIC_BUILDER_PLATFORMS = ['Wix', 'Squarespace'];

// Platforms that can be either modern or outdated depending on theme
const LEGACY_CMS_PLATFORMS = ['WordPress', 'Joomla', 'Drupal'];

// ===== MAIN EXPORT =====

/**
 * Analyze a website and produce a comprehensive quality score.
 *
 * Fetches the HTML, then scores across multiple dimensions:
 * - SSL, mobile-friendliness, load speed
 * - Contact info, social links, online booking
 * - SEO (10 checks × 10pts each = 100pts max)
 * - Tech stack detection and design age
 * - Gaps and opportunity statement
 */
export async function analyzeWebsite(
  url: string,
  companyName: string,
  niche: string
): Promise<WebsiteScore> {
  console.log(`[WebsiteScorer] Analyzing: ${url} (${companyName}, ${niche})`);

  // ── No URL → no website ─────────────────────────────────────────
  if (!url || url.trim() === '') {
    return buildNoWebsiteResult(companyName, niche);
  }

  // ── Check SSL from URL ──────────────────────────────────────────
  const normalizedUrl = normalizeUrl(url.trim());
  const hasSSL = normalizedUrl.startsWith('https://');

  // ── Fetch the website ───────────────────────────────────────────
  let html = '';
  let hasWebsite = false;
  let loadSpeed: 'fast' | 'slow' | 'unknown' = 'unknown';

  const fetchStart = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AcquisitionOS-Bot/1.0; +https://acquisitionos.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const fetchDuration = Date.now() - fetchStart;

    if (response.ok) {
      // Check content-length header before downloading full HTML body
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_HTML_SIZE) {
        console.warn(`[WebsiteScorer] Skipping large page (${(contentLength / 1024).toFixed(0)}KB > 500KB): ${normalizedUrl}`);
        return {
          overallScore: 40,
          hasWebsite: true,
          isMobile: false,
          hasSSL,
          loadSpeed: 'slow',
          hasContactInfo: false,
          hasSocialLinks: false,
          hasOnlineBooking: false,
          techStack: [],
          designAge: 'unknown',
          seoScore: 10,
          gaps: ['Large page size (content over 500KB)'],
          opportunityStatement: `${companyName} has a very large website that may need optimization — we can improve their page performance for their ${niche} business.`,
        };
      }

      html = await response.text();

      // Additional size check after download in case content-length was missing/incorrect
      if (html.length > MAX_HTML_SIZE) {
        console.warn(`[WebsiteScorer] Page too large (${(html.length / 1024).toFixed(0)}KB > 500KB), skipping full analysis: ${normalizedUrl}`);
        html = null as unknown as string; // Free memory immediately
        return {
          overallScore: 40,
          hasWebsite: true,
          isMobile: false,
          hasSSL,
          loadSpeed: 'slow',
          hasContactInfo: false,
          hasSocialLinks: false,
          hasOnlineBooking: false,
          techStack: [],
          designAge: 'unknown',
          seoScore: 10,
          gaps: ['Large page size (over 500KB)'],
          opportunityStatement: `${companyName} has a very large website that may need optimization — we can improve their page performance for their ${niche} business.`,
        };
      }
      hasWebsite = true;
      loadSpeed = fetchDuration < 3000 ? 'fast' : 'slow';
    } else {
      hasWebsite = false;
      loadSpeed = 'unknown';
    }
  } catch {
    hasWebsite = false;
    loadSpeed = 'unknown';
  }

  // ── No website reachable ────────────────────────────────────────
  if (!hasWebsite || html.length === 0) {
    return buildNoWebsiteResult(companyName, niche);
  }

  // ── Parse HTML with cheerio ─────────────────────────────────────
  // DYNAMIC IMPORT: Load cheerio only when actually analyzing a website
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  const bodyText = $('body').text() || '';
  const lowerBody = bodyText.toLowerCase();

  // Free the raw HTML string from memory after cheerio parsing
  html = '';

  // ── isMobile: check viewport meta tag ───────────────────────────
  const viewportContent = $('meta[name="viewport"]').attr('content') || '';
  const isMobile = viewportContent.includes('width=device-width') ||
    viewportContent.includes('initial-scale');

  // ── Contact info check ──────────────────────────────────────────
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailMatches = bodyText.match(emailRegex) || [];
  const hasEmail = emailMatches.some(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')
  );

  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;
  const hasPhone = phoneRegex.test(bodyText);

  const hasContactInfo = hasEmail || hasPhone;

  // ── Social links check ──────────────────────────────────────────
  const hasSocialLinks = checkSocialLinks($);

  // ── Online booking check ────────────────────────────────────────
  const hasOnlineBooking = BOOKING_KEYWORDS.some((kw) => lowerBody.includes(kw));

  // ── Tech stack detection ────────────────────────────────────────
  const techStack = detectTechStack($, html);

  // ── Design age ──────────────────────────────────────────────────
  const designAge = determineDesignAge($, html, techStack);

  // ── SEO Score (10 checks × 10pts each) ─────────────────────────
  const seoResult = calculateSeoScore($, html);

  // ── Calculate overall score ─────────────────────────────────────
  let overallScore = 50; // Start at baseline

  // Positive contributions
  if (hasSSL) overallScore += 10; else overallScore -= 15;
  if (isMobile) overallScore += 10; else overallScore -= 20;
  if (hasContactInfo) overallScore += 5;
  if (hasSocialLinks) overallScore += 5;
  if (hasOnlineBooking) overallScore += 5;
  if (loadSpeed === 'fast') overallScore += 5;
  if (loadSpeed === 'slow') overallScore -= 5;

  // Design age modifier
  if (designAge === 'modern') overallScore += 5;
  if (designAge === 'outdated') overallScore -= 10;

  // SEO contribution (0-100 → scaled to 0-20 contribution)
  overallScore += Math.round(seoResult.score / 5);

  // Clamp to 0-100
  overallScore = Math.max(0, Math.min(100, overallScore));

  // ── Build gaps array ────────────────────────────────────────────
  const gaps = buildGapsArray({
    hasSSL,
    isMobile,
    hasContactInfo,
    hasSocialLinks,
    hasOnlineBooking,
    loadSpeed,
    designAge,
    seoScore: seoResult.score,
    seoGaps: seoResult.gaps,
    techStack,
  });

  // ── Opportunity statement ───────────────────────────────────────
  const opportunityStatement = generateOpportunityStatement(
    companyName,
    niche,
    gaps
  );

  console.log(`[WebsiteScorer] Result: overall=${overallScore} seo=${seoResult.score} gaps=${gaps.length} (${companyName})`);

  return {
    overallScore,
    hasWebsite,
    isMobile,
    hasSSL,
    loadSpeed,
    hasContactInfo,
    hasSocialLinks,
    hasOnlineBooking,
    techStack,
    designAge,
    seoScore: seoResult.score,
    gaps,
    opportunityStatement,
  };
}

// ===== SCORING COMPONENTS =====

/**
 * Calculate SEO score from 10 checks, each worth 10 points.
 */
function calculateSeoScore(
  $: ReturnType<typeof import('cheerio').load>,
  html: string
): { score: number; gaps: string[] } {
  let score = 0;
  const gaps: string[] = [];

  // 1. Meta title (10pts)
  const metaTitle = $('title').text().trim();
  if (metaTitle.length > 0 && metaTitle.length <= 70) {
    score += 10;
  } else if (metaTitle.length > 70) {
    score += 5;
    gaps.push('Title tag too long (over 70 characters)');
  } else {
    gaps.push('Missing meta title tag');
  }

  // 2. Meta description (10pts)
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  if (metaDescription.length > 0 && metaDescription.length <= 160) {
    score += 10;
  } else if (metaDescription.length > 160) {
    score += 5;
    gaps.push('Meta description too long (over 160 characters)');
  } else {
    gaps.push('Missing meta description');
  }

  // 3. H1 tag (10pts)
  const h1Count = $('h1').length;
  if (h1Count === 1) {
    score += 10;
  } else if (h1Count > 1) {
    score += 5;
    gaps.push('Multiple H1 tags found (should be exactly one)');
  } else {
    gaps.push('Missing H1 tag');
  }

  // 4. Alt tags on images (10pts)
  const images = $('img');
  const totalImages = images.length;
  if (totalImages > 0) {
    const imagesWithAlt = images.filter('[alt]').length;
    const altRatio = imagesWithAlt / totalImages;
    if (altRatio >= 0.9) {
      score += 10;
    } else if (altRatio >= 0.5) {
      score += 5;
      gaps.push('Some images missing alt tags');
    } else {
      gaps.push('Most images missing alt tags');
    }
  } else {
    // No images — give full points (nothing to penalize)
    score += 10;
  }

  // 5. Sitemap link (10pts)
  const hasSitemap = $('link[rel="sitemap"]').length > 0 ||
    html.includes('sitemap.xml') ||
    html.includes('/sitemap');
  if (hasSitemap) {
    score += 10;
  } else {
    gaps.push('No sitemap link found');
  }

  // 6. Structured data / schema.org (10pts)
  const hasSchemaOrg =
    html.includes('schema.org') ||
    html.includes('application/ld+json') ||
    $('[itemscope]').length > 0 ||
    $('[typeof]').length > 0;
  if (hasSchemaOrg) {
    score += 10;
  } else {
    gaps.push('No structured data (schema.org)');
  }

  // 7. Google Analytics or Tag Manager (10pts)
  const hasAnalytics =
    html.includes('google-analytics.com') ||
    html.includes('gtag') ||
    html.includes('UA-') ||
    html.includes('G-') ||
    html.includes('googletagmanager.com') ||
    html.includes('GTM-');
  if (hasAnalytics) {
    score += 10;
  } else {
    gaps.push('No Google Analytics or Tag Manager');
  }

  // 8. Canonical tag (10pts)
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  if (hasCanonical) {
    score += 10;
  } else {
    gaps.push('Missing canonical tag');
  }

  // 9. Robots meta tag (10pts)
  const hasRobotsMeta = $('meta[name="robots"]').length > 0;
  const hasRobotsTxt = html.includes('robots.txt');
  if (hasRobotsMeta || hasRobotsTxt) {
    score += 10;
  } else {
    gaps.push('Missing robots meta tag');
  }

  // 10. Open Graph tags (10pts)
  const hasOgTitle = $('meta[property="og:title"]').length > 0;
  const hasOgDescription = $('meta[property="og:description"]').length > 0;
  const hasOgImage = $('meta[property="og:image"]').length > 0;
  const ogCount = [hasOgTitle, hasOgDescription, hasOgImage].filter(Boolean).length;
  if (ogCount >= 3) {
    score += 10;
  } else if (ogCount >= 1) {
    score += 5;
    gaps.push('Incomplete Open Graph tags');
  } else {
    gaps.push('Missing Open Graph tags');
  }

  return { score, gaps };
}

/**
 * Check if the page has social media links.
 */
function checkSocialLinks($: ReturnType<typeof import('cheerio').load>): boolean {
  let hasSocial = false;

  $('a[href]').each((_index, element) => {
    const href = ($(element).attr('href') || '').toLowerCase();
    if (
      href.includes('linkedin.com') ||
      href.includes('instagram.com') ||
      href.includes('facebook.com') ||
      href.includes('twitter.com') ||
      href.includes('x.com')
    ) {
      hasSocial = true;
      return false; // break out of .each
    }
  });

  return hasSocial;
}

/**
 * Detect technology stack from HTML content.
 * Reuses the same detection logic as discovery-engine.
 */
function detectTechStack($: ReturnType<typeof import('cheerio').load>, html: string): string[] {
  const techStack: string[] = [];

  if (
    html.includes('wp-content') ||
    html.includes('wp-includes') ||
    $('meta[name="generator"][content*="WordPress"]').length > 0 ||
    $('link[href*="wp-content"]').length > 0
  ) {
    techStack.push('WordPress');
  }

  if (
    html.includes('shopify.com') ||
    html.includes('Shopify.theme') ||
    $('script[src*="shopify"]').length > 0 ||
    html.includes('cdn.shopify.com')
  ) {
    techStack.push('Shopify');
  }

  if (
    html.includes('wix.com') ||
    html.includes('wixpress') ||
    $('meta[name="generator"][content*="Wix"]').length > 0 ||
    html.includes('static.wixstatic.com')
  ) {
    techStack.push('Wix');
  }

  if (
    html.includes('squarespace.com') ||
    $('meta[name="generator"][content*="Squarespace"]').length > 0 ||
    html.includes('static1.squarespace.com')
  ) {
    techStack.push('Squarespace');
  }

  if (
    html.includes('webflow.com') ||
    html.includes('webflow.io') ||
    $('meta[name="generator"][content*="Webflow"]').length > 0
  ) {
    techStack.push('Webflow');
  }

  if (
    $('meta[name="generator"][content*="Ghost"]').length > 0 ||
    html.includes('ghost.org')
  ) {
    techStack.push('Ghost');
  }

  if (
    $('meta[name="generator"][content*="Joomla"]').length > 0 ||
    html.includes('/media/jui/')
  ) {
    techStack.push('Joomla');
  }

  if (
    $('meta[name="generator"][content*="Drupal"]').length > 0 ||
    html.includes('Drupal.settings') ||
    html.includes('/misc/drupal.js')
  ) {
    techStack.push('Drupal');
  }

  if (
    html.includes('_reactRootContainer') ||
    html.includes('__NEXT_DATA__') ||
    html.includes('data-reactroot')
  ) {
    techStack.push('React');
  }

  if (
    html.includes('__NEXT_DATA__') ||
    html.includes('_next/static') ||
    $('meta[name="next-head-count"]').length > 0
  ) {
    techStack.push('Next.js');
  }

  if (
    html.includes('google-analytics.com') ||
    html.includes('gtag') ||
    html.includes('UA-') ||
    html.includes('G-')
  ) {
    techStack.push('Google Analytics');
  }

  if (html.includes('googletagmanager.com') || html.includes('GTM-')) {
    techStack.push('Google Tag Manager');
  }

  if (
    html.includes('woocommerce') ||
    $('meta[name="generator"][content*="WooCommerce"]').length > 0
  ) {
    techStack.push('WooCommerce');
  }

  if (techStack.length === 0) {
    techStack.push('Unknown');
  }

  return techStack;
}

/**
 * Determine design age based on tech stack and HTML patterns.
 */
function determineDesignAge(
  $: ReturnType<typeof import('cheerio').load>,
  html: string,
  techStack: string[]
): 'modern' | 'outdated' | 'unknown' {
  // Check for modern platforms
  if (techStack.some((t) => MODERN_PLATFORMS.includes(t))) {
    return 'modern';
  }

  // Check for table-based layout (very outdated)
  const tableCount = $('table').length;
  const nestedTables = $('table table').length;
  const usesTablesForLayout = nestedTables > 2 || (tableCount > 5 && $('div').length < tableCount * 3);

  if (usesTablesForLayout) {
    return 'outdated';
  }

  // Check for very old WordPress themes
  if (techStack.includes('WordPress')) {
    const wpGenerator = $('meta[name="generator"][content*="WordPress"]').attr('content') || '';
    // Check for old-style WP includes (pre-2018 themes often use wp_enqueue_script patterns)
    const hasOldWpPatterns =
      html.includes('wp-content/themes/twentytwelve') ||
      html.includes('wp-content/themes/twentythirteen') ||
      html.includes('wp-content/themes/twentyfourteen') ||
      html.includes('wp-content/themes/twentyfifteen') ||
      html.includes('wp-content/themes/twentysixteen') ||
      html.includes('wp-content/themes/twentyseventeen');

    if (hasOldWpPatterns) {
      return 'outdated';
    }

    // If WordPress but no old patterns detected, it could be modern
    if (wpGenerator) {
      // Modern WordPress is fine
      return 'modern';
    }
  }

  // Check for Joomla/Drupal (often older sites)
  if (techStack.includes('Joomla') || techStack.includes('Drupal')) {
    return 'outdated';
  }

  // Basic website builders (Wix/Squarespace) — modern but basic
  if (techStack.some((t) => BASIC_BUILDER_PLATFORMS.includes(t))) {
    return 'modern';
  }

  // Unknown tech stack with no viewport — likely outdated
  if (techStack.includes('Unknown') && $('meta[name="viewport"]').length === 0) {
    return 'outdated';
  }

  // Check for very old HTML patterns
  const hasFontTags = $('font').length > 0;
  const hasCenterTags = $('center').length > 0;
  const usesInlineStyles = ($('[style]').length / Math.max($('body *').length, 1)) > 0.4;

  if (hasFontTags || hasCenterTags || usesInlineStyles) {
    return 'outdated';
  }

  // Default: if it has a viewport meta tag, consider it modern
  if ($('meta[name="viewport"]').length > 0) {
    return 'modern';
  }

  return 'unknown';
}

// ===== GAPS BUILDER =====

interface GapsContext {
  hasSSL: boolean;
  isMobile: boolean;
  hasContactInfo: boolean;
  hasSocialLinks: boolean;
  hasOnlineBooking: boolean;
  loadSpeed: 'fast' | 'slow' | 'unknown';
  designAge: 'modern' | 'outdated' | 'unknown';
  seoScore: number;
  seoGaps: string[];
  techStack: string[];
}

/**
 * Build the human-readable gaps array from all scoring dimensions.
 */
function buildGapsArray(ctx: GapsContext): string[] {
  const gaps: string[] = [];

  // SSL
  if (!ctx.hasSSL) {
    gaps.push('No SSL certificate');
  }

  // Mobile
  if (!ctx.isMobile) {
    gaps.push('Website not mobile-friendly');
  }

  // Contact info
  if (!ctx.hasContactInfo) {
    gaps.push('No contact information visible');
  }

  // Social links
  if (!ctx.hasSocialLinks) {
    gaps.push('No social media links');
  }

  // Online booking
  if (!ctx.hasOnlineBooking) {
    gaps.push('No online booking or ordering system');
  }

  // Load speed
  if (ctx.loadSpeed === 'slow') {
    gaps.push('Slow page load speed');
  }

  // Design age
  if (ctx.designAge === 'outdated') {
    gaps.push('Outdated website design');
  }

  // Basic website builder
  if (ctx.techStack.some((t) => BASIC_BUILDER_PLATFORMS.includes(t))) {
    gaps.push('Using basic website builder (limited customization)');
  }

  // Unknown tech stack
  if (ctx.techStack.includes('Unknown')) {
    gaps.push('Unidentifiable technology stack');
  }

  // SEO gaps (low score)
  if (ctx.seoScore < 50) {
    gaps.push('Poor SEO optimization');
  } else if (ctx.seoScore < 80) {
    gaps.push('SEO needs improvement');
  }

  // Include specific SEO gaps
  gaps.push(...ctx.seoGaps);

  return gaps;
}

// ===== OPPORTUNITY STATEMENT =====

/**
 * Generate a 1-sentence opportunity statement based on the top 2 gaps.
 * Uses a template approach (no AI call — saves credits).
 */
function generateOpportunityStatement(
  companyName: string,
  niche: string,
  gaps: string[]
): string {
  // If no gaps, the site is in great shape
  if (gaps.length === 0) {
    return `${companyName} has a well-optimized website — we can offer advanced growth services like AI-powered lead nurturing and conversion optimization for their ${niche} business.`;
  }

  // Map gaps to solution fragments
  const gapToSolution: Record<string, string> = {
    'No SSL certificate': 'secure their website with SSL',
    'Website not mobile-friendly': 'build a mobile-friendly, responsive website',
    'No contact information visible': 'add clear contact forms and click-to-call buttons',
    'No social media links': 'integrate social media presence into their website',
    'No online booking or ordering system': 'set up an online booking and ordering system',
    'Slow page load speed': 'optimize their website for fast load times',
    'Outdated website design': 'redesign their website with a modern, professional look',
    'Using basic website builder (limited customization)': 'build a custom, fully-branded website',
    'Unidentifiable technology stack': 'migrate them to a modern, maintainable platform',
    'Poor SEO optimization': 'implement comprehensive SEO optimization',
    'SEO needs improvement': 'improve their SEO with proper meta tags and structured data',
    'Missing meta title tag': 'add proper meta title tags for better search visibility',
    'Missing meta description': 'write compelling meta descriptions for better click-through rates',
    'Missing H1 tag': 'structure their pages with proper heading hierarchy',
    'Most images missing alt tags': 'add alt tags to images for accessibility and SEO',
    'Some images missing alt tags': 'complete image alt tags for full SEO coverage',
    'No sitemap link found': 'create and submit a sitemap for better crawlability',
    'No structured data (schema.org)': 'add structured data markup for rich search results',
    'No Google Analytics or Tag Manager': 'set up analytics to track visitor behavior',
    'Missing canonical tag': 'add canonical tags to prevent duplicate content issues',
    'Missing robots meta tag': 'configure proper robots directives',
    'Missing Open Graph tags': 'add Open Graph tags for better social sharing',
    'Incomplete Open Graph tags': 'complete their Open Graph tags for better social previews',
    'Title tag too long (over 70 characters)': 'optimize their title tags for better SERP display',
    'Meta description too long (over 160 characters)': 'trim meta descriptions for optimal display',
    'Multiple H1 tags found (should be exactly one)': 'fix their heading structure for proper SEO',
  };

  // Take the top 2 gaps that have solutions
  const topGaps = gaps.slice(0, 2);
  const solutions = topGaps
    .map((gap) => gapToSolution[gap])
    .filter(Boolean);

  if (solutions.length === 0) {
    // Fallback if no known gap mapping
    const firstGap = gaps[0].toLowerCase();
    return `${companyName} needs help with ${firstGap} — we can provide a complete digital solution for their ${niche} business.`;
  }

  if (solutions.length === 1) {
    return `${companyName} needs to ${solutions[0]} — we can help transform their online presence for their ${niche} business.`;
  }

  return `${companyName} needs to ${solutions[0]} and ${solutions[1]} — we can build a modern, high-performing website for their ${niche} business.`;
}

// ===== HELPER FUNCTIONS =====

/**
 * Build a result for when no website is available.
 */
function buildNoWebsiteResult(companyName: string, niche: string): WebsiteScore {
  const gaps = ['No website found'];
  const opportunityStatement = generateOpportunityStatement(companyName, niche, gaps);

  return {
    overallScore: 10,
    hasWebsite: false,
    isMobile: false,
    hasSSL: false,
    loadSpeed: 'unknown',
    hasContactInfo: false,
    hasSocialLinks: false,
    hasOnlineBooking: false,
    techStack: [],
    designAge: 'unknown',
    seoScore: 0,
    gaps,
    opportunityStatement,
  };
}

/**
 * Normalize a URL by adding https:// if no protocol is present.
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}
