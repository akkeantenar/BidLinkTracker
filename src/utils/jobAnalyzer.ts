/**
 * Job Analyzer - Extracts job information from URLs
 * Supports multiple job board formats
 */

export interface JobInfo {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  url: string;
  normalizedContent?: string; // For duplicate comparison
}

/**
 * Normalizes job content for comparison
 * Removes extra whitespace, converts to lowercase, removes special characters
 */
export function normalizeJobContent(content: string): string {
  if (!content) return '';
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s]/g, '') // Remove special characters
    .trim();
}

/**
 * Creates a normalized content string from job info for duplicate comparison
 */
export function createJobContentHash(jobInfo: JobInfo): string {
  const parts: string[] = [];
  
  if (jobInfo.title) {
    parts.push(normalizeJobContent(jobInfo.title));
  }
  if (jobInfo.company) {
    parts.push(normalizeJobContent(jobInfo.company));
  }
  if (jobInfo.location) {
    parts.push(normalizeJobContent(jobInfo.location));
  }
  
  return parts.join('|');
}

/**
 * Analyzes a job URL by fetching and parsing the page
 * Returns job information extracted from the page
 */
export async function analyzeJobUrl(url: string): Promise<JobInfo> {
  try {
    // Use server-side API to fetch and analyze
    const response = await fetch('/api/analyze-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Failed to analyze URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.jobInfo || { url };
  } catch (error: any) {
    console.error('Error analyzing job URL:', error);
    return { url }; // Return minimal info if analysis fails
  }
}

