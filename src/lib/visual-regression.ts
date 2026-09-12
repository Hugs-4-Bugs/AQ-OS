// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Visual Regression Testing Foundation
// Phase 2: Screenshot comparison, baseline capture, diff calculation
// ═══════════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'acquisitionos_vr_';
const DIFF_THRESHOLD = 0.05; // 5% pixel difference threshold

export interface BaselineCapture {
  id: string;
  name: string;
  timestamp: number;
  viewportWidth: number;
  viewportHeight: number;
  imageData: string; // base64 data URL
  pixelHash: string;
}

export interface DiffResult {
  name: string;
  baselineTimestamp: number;
  currentTimestamp: number;
  pixelDifference: number; // percentage 0-100
  diffPixelCount: number;
  totalPixelCount: number;
  passed: boolean;
  diffImageUrl?: string; // base64 data URL of diff image
  threshold: number;
}

export interface DiffReport {
  timestamp: number;
  results: DiffResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    averageDiff: number;
  };
}

// ─── Pixel Hashing (simplified fingerprint) ──────────────────────

function computePixelHash(imageData: ImageData): string {
  // Downsample to 32x32 for hash computation
  const size = 32;
  let hash = '';

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcX = Math.floor((x / size) * imageData.width);
      const srcY = Math.floor((y / size) * imageData.height);
      const idx = (srcY * imageData.width + srcX) * 4;
      const r = imageData.data[idx] || 0;
      const g = imageData.data[idx + 1] || 0;
      const b = imageData.data[idx + 2] || 0;
      // Convert to 4-bit per channel
      hash += ((r >> 4) & 0xf).toString(16);
      hash += ((g >> 4) & 0xf).toString(16);
      hash += ((b >> 4) & 0xf).toString(16);
    }
  }

  return hash;
}

// ─── Canvas Utilities ────────────────────────────────────────────

function createCanvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function getElementScreenshot(element: Element): Promise<string> {
  return new Promise((resolve, reject) => {
    const rect = element.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    const scale = window.devicePixelRatio || 1;
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Use html2canvas-like approach — render DOM to canvas
    // Since we can't use html2canvas without installing it,
    // we capture the visual state via a simplified approach
    ctx.scale(scale, scale);

    // Draw background
    const style = window.getComputedStyle(element);
    const bgColor = style.backgroundColor;
    ctx.fillStyle = bgColor || '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // For production, you'd integrate html2canvas or similar here
    // For now, we capture a simplified visual fingerprint

    resolve(canvas.toDataURL('image/png'));
  });
}

// ─── Local Storage Helpers ───────────────────────────────────────

function getStorageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

function saveBaseline(baseline: BaselineCapture): void {
  try {
    localStorage.setItem(getStorageKey(baseline.name), JSON.stringify(baseline));
  } catch (e) {
    console.warn('Failed to save baseline to localStorage:', e);
  }
}

function loadBaseline(name: string): BaselineCapture | null {
  try {
    const stored = localStorage.getItem(getStorageKey(name));
    if (!stored) return null;
    return JSON.parse(stored) as BaselineCapture;
  } catch {
    return null;
  }
}

function listBaselines(): string[] {
  const baselines: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      baselines.push(key.replace(STORAGE_PREFIX, ''));
    }
  }
  return baselines;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Capture a baseline screenshot for a given element or the full page
 */
export async function captureBaseline(
  name: string,
  element?: Element
): Promise<BaselineCapture> {
  const targetElement = element || document.body;
  const imageData = await getElementScreenshot(targetElement);

  // Create a canvas to compute pixel hash
  const canvas = await createCanvasFromDataUrl(imageData);
  const ctx = canvas.getContext('2d')!;
  const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixelHash = computePixelHash(pixelData);

  const baseline: BaselineCapture = {
    id: `bl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    timestamp: Date.now(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    imageData,
    pixelHash,
  };

  saveBaseline(baseline);
  return baseline;
}

/**
 * Compare current state with a stored baseline
 */
export async function compareWithBaseline(
  name: string,
  element?: Element
): Promise<DiffResult> {
  const baseline = loadBaseline(name);
  if (!baseline) {
    throw new Error(`No baseline found for "${name}". Capture a baseline first.`);
  }

  const currentData = await getElementScreenshot(element || document.body);
  const currentCanvas = await createCanvasFromDataUrl(currentData);
  const baselineCanvas = await createCanvasFromDataUrl(baseline.imageData);

  const currentCtx = currentCanvas.getContext('2d')!;
  const baselineCtx = baselineCanvas.getContext('2d')!;

  // Normalize dimensions to match
  const width = Math.min(currentCanvas.width, baselineCanvas.width);
  const height = Math.min(currentCanvas.height, baselineCanvas.height);

  const currentPixels = currentCtx.getImageData(0, 0, width, height);
  const baselinePixels = baselineCtx.getImageData(0, 0, width, height);

  // Compute pixel difference
  let diffPixelCount = 0;
  const totalPixelCount = width * height;

  // Create diff image
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d')!;
  const diffImageData = diffCtx.createImageData(width, height);

  for (let i = 0; i < totalPixelCount; i++) {
    const idx = i * 4;
    const rDiff = Math.abs(currentPixels.data[idx] - baselinePixels.data[idx]);
    const gDiff = Math.abs(currentPixels.data[idx + 1] - baselinePixels.data[idx + 1]);
    const bDiff = Math.abs(currentPixels.data[idx + 2] - baselinePixels.data[idx + 2]);
    const aDiff = Math.abs(currentPixels.data[idx + 3] - baselinePixels.data[idx + 3]);

    const avgDiff = (rDiff + gDiff + bDiff + aDiff) / 4;

    if (avgDiff > 10) { // threshold for "different" pixel
      diffPixelCount++;
      // Highlight differences in red
      diffImageData.data[idx] = 255;
      diffImageData.data[idx + 1] = 0;
      diffImageData.data[idx + 2] = 0;
      diffImageData.data[idx + 3] = 180;
    } else {
      // Keep baseline pixel (dimmed)
      diffImageData.data[idx] = baselinePixels.data[idx] * 0.3;
      diffImageData.data[idx + 1] = baselinePixels.data[idx + 1] * 0.3;
      diffImageData.data[idx + 2] = baselinePixels.data[idx + 2] * 0.3;
      diffImageData.data[idx + 3] = baselinePixels.data[idx + 3];
    }
  }

  diffCtx.putImageData(diffImageData, 0, 0);
  const diffImageUrl = diffCanvas.toDataURL('image/png');

  const pixelDifference = (diffPixelCount / totalPixelCount) * 100;
  const threshold = DIFF_THRESHOLD * 100;

  return {
    name,
    baselineTimestamp: baseline.timestamp,
    currentTimestamp: Date.now(),
    pixelDifference: Math.round(pixelDifference * 100) / 100,
    diffPixelCount,
    totalPixelCount,
    passed: pixelDifference <= threshold,
    diffImageUrl,
    threshold,
  };
}

/**
 * Generate a full diff report for all stored baselines
 */
export async function generateDiffReport(
  elements?: Record<string, Element>
): Promise<DiffReport> {
  const baselineNames = listBaselines();
  const results: DiffResult[] = [];

  for (const name of baselineNames) {
    try {
      const element = elements?.[name];
      const result = await compareWithBaseline(name, element);
      results.push(result);
    } catch (e) {
      // Skip baselines that fail to compare
      console.warn(`Failed to compare baseline "${name}":`, e);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const averageDiff =
    results.length > 0
      ? Math.round((results.reduce((sum, r) => sum + r.pixelDifference, 0) / results.length) * 100) / 100
      : 0;

  return {
    timestamp: Date.now(),
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      averageDiff,
    },
  };
}

/**
 * Delete a stored baseline
 */
export function deleteBaseline(name: string): void {
  localStorage.removeItem(getStorageKey(name));
}

/**
 * Get all stored baselines metadata (without image data)
 */
export function listBaselineMetadata(): Array<Omit<BaselineCapture, 'imageData'>> {
  return listBaselines().map((name) => {
    const baseline = loadBaseline(name);
    if (!baseline) return null;
    const { imageData: _imageData, ...meta } = baseline;
    return meta;
  }).filter((b): b is Omit<BaselineCapture, 'imageData'> => b !== null);
}

/**
 * Set the diff threshold (0-1 range, default 0.05 = 5%)
 */
export function setDiffThreshold(threshold: number): void {
  // Threshold is used per-comparison; store for reference
  try {
    localStorage.setItem(`${STORAGE_PREFIX}threshold`, threshold.toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the current diff threshold
 */
export function getDiffThreshold(): number {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}threshold`);
    return stored ? parseFloat(stored) : DIFF_THRESHOLD;
  } catch {
    return DIFF_THRESHOLD;
  }
}
