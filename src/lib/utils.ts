import { TabGroupColor } from '../types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Normalize URL for comparison (remove query params, trailing slash)
 */
export function normalizeUrl(url: string, ignoreQueryParams = false): string {
  try {
    const parsed = new URL(url);
    let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    if (!ignoreQueryParams && parsed.search) {
      normalized += parsed.search;
    }
    return normalized.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Get Chrome tab group color CSS class
 */
export function getColorClass(color: TabGroupColor): string {
  const colorMap: Record<TabGroupColor, string> = {
    grey: 'bg-chrome-grey',
    blue: 'bg-chrome-blue',
    red: 'bg-chrome-red',
    yellow: 'bg-chrome-yellow',
    green: 'bg-chrome-green',
    pink: 'bg-chrome-pink',
    purple: 'bg-chrome-purple',
    cyan: 'bg-chrome-cyan',
  };
  return colorMap[color];
}

/**
 * Get Chrome tab group color hex value
 */
export function getColorHex(color: TabGroupColor): string {
  const colorMap: Record<TabGroupColor, string> = {
    grey: '#5f6368',
    blue: '#1a73e8',
    red: '#d93025',
    yellow: '#f9ab00',
    green: '#1e8e3e',
    pink: '#d01884',
    purple: '#9334e6',
    cyan: '#007b83',
  };
  return colorMap[color];
}

/**
 * All available Chrome tab group colors
 */
export const TAB_GROUP_COLORS: TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
];

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Format date for display
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a consistent color based on domain name hash
 */
function getColorFromDomainHash(domain: string): TabGroupColor {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    const char = domain.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Map to color (excluding grey for more vibrant results)
  const colors: TabGroupColor[] = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  const index = Math.abs(hash) % colors.length;

  console.log(`[getColorFromDomainHash] Domain: ${domain}, hash: ${hash}, color: ${colors[index]}`);
  return colors[index];
}

/**
 * Get color for a domain using hash-based assignment
 */
export async function getColorFromFaviconWithFallback(_faviconUrl: string | undefined, domain: string): Promise<TabGroupColor> {
  console.log(`[getColorFromFavicon] Getting color for domain: "${domain}"`);
  return getColorFromDomainHash(domain);
}
