import { DuplicateInfo } from '../types';
import { parseTabRange } from './dateUtils';

/**
 * Normalizes a URL for comparison by:
 * - Removing trailing slashes
 * - Converting to lowercase
 * - Preserving important query parameters (like job IDs)
 * - Removing only tracking/analytics parameters
 */
export function normalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  try {
    const urlObj = new URL(url.trim());
    
    // Remove trailing slash from pathname
    let pathname = urlObj.pathname;
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }
    
    // Important query parameters that identify the job (keep these)
    const importantParams = ['jk', 'id', 'jobId', 'job_id', 'positionId', 'position_id', 'req', 'reqid'];
    
    // Tracking/analytics parameters to remove
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
                           'ref', 'source', 'fbclid', 'gclid', 'msclkid', '_ga', '_gid'];
    
    // Filter query parameters
    const params = new URLSearchParams(urlObj.search);
    const filteredParams = new URLSearchParams();
    
    for (const [key, value] of params.entries()) {
      const lowerKey = key.toLowerCase();
      // Keep important parameters or parameters that aren't tracking-related
      if (importantParams.includes(lowerKey) || 
          (!trackingParams.includes(lowerKey) && value && value.trim().length > 0)) {
        filteredParams.append(key, value);
      }
    }
    
    // Reconstruct URL with filtered query parameters
    const queryString = filteredParams.toString();
    const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${pathname}${queryString ? '?' + queryString : ''}`;
    
    return normalizedUrl.toLowerCase();
  } catch {
    // If URL parsing fails, just normalize the string (preserve query params)
    const trimmed = url.trim().toLowerCase().replace(/\/$/, '');
    // Try to preserve query string even if URL parsing fails
    return trimmed;
  }
}

/**
 * Checks if two URLs are duplicates
 */
export function areUrlsDuplicate(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Finds duplicates across all job entries
 * Returns a map of normalized URL to array of duplicate entries
 */
export function findDuplicates(
  allEntries: Array<{ url: string; tabName: string; rowIndex: number; position: string; date?: string; no?: string }>
): Map<string, DuplicateInfo[]> {
  const urlMap = new Map<string, DuplicateInfo[]>();
  
  // Group entries by normalized URL
  for (const entry of allEntries) {
    const normalized = normalizeUrl(entry.url);
    if (!normalized) continue;
    
    if (!urlMap.has(normalized)) {
      urlMap.set(normalized, []);
    }
    
    urlMap.get(normalized)!.push({
      url: entry.url,
      tabName: entry.tabName,
      rowIndex: entry.rowIndex,
      position: entry.position,
      date: entry.date,
      no: entry.no,
      isDuplicate: false, // Will be set later
    });
  }
  
  // Mark duplicates (keep first occurrence, mark others as duplicates)
  // Sort entries by tab date and row number to ensure earliest entry is first
  const duplicates = new Map<string, DuplicateInfo[]>();
  
  for (const [normalizedUrl, entries] of urlMap.entries()) {
    if (entries.length > 1) {
      // Sort entries to find the true first occurrence
      // Sort by: 1) Tab start date (earliest first), 2) Row index (lower first)
      const sortedEntries = [...entries].sort((a, b) => {
        const tabA = parseTabRange(a.tabName);
        const tabB = parseTabRange(b.tabName);
        
        // If both tabs have valid date ranges, sort by start date
        if (tabA && tabB) {
          const dateDiff = tabA.start.getTime() - tabB.start.getTime();
          if (dateDiff !== 0) {
            return dateDiff; // Earlier tab comes first
          }
        }
        
        // If same tab or invalid tab names, sort by row index (lower row = earlier)
        return a.rowIndex - b.rowIndex;
      });
      
      // Mark all but the first (earliest) as duplicates
      const duplicateEntries = sortedEntries.map((entry, index) => ({
        ...entry,
        isDuplicate: index > 0,
      }));
      duplicates.set(normalizedUrl, duplicateEntries);
    }
  }
  
  return duplicates;
}

/**
 * Checks if a URL is a duplicate against existing entries
 */
export function checkUrlDuplicate(
  url: string,
  existingEntries: Array<{ url: string; tabName: string; position: string }>
): { isDuplicate: boolean; duplicateInfo?: { tabName: string; position: string } } {
  const normalized = normalizeUrl(url);
  
  for (const entry of existingEntries) {
    if (normalizeUrl(entry.url) === normalized) {
      return {
        isDuplicate: true,
        duplicateInfo: {
          tabName: entry.tabName,
          position: entry.position,
        },
      };
    }
  }
  
  return { isDuplicate: false };
}

