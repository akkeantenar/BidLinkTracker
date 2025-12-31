import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

interface JobInfo {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  url: string;
  normalizedContent?: string;
}

/**
 * Extracts job information from HTML content
 * Supports multiple job board formats
 */
function extractJobInfo(html: string, url: string): JobInfo {
  const $ = cheerio.load(html);
  const jobInfo: JobInfo = { url };

  // Try to detect job board type from URL
  const urlLower = url.toLowerCase();
  
  // Welcome to the Jungle
  if (urlLower.includes('welcometothejungle.com')) {
    // Try JSON-LD structured data first
    const jsonLd = $('script[type="application/ld+json"]').first().html();
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        if (data['@type'] === 'JobPosting') {
          jobInfo.title = data.title || $('h1').first().text().trim();
          jobInfo.company = data.hiringOrganization?.name || $('[data-testid="company-name"]').text().trim();
          jobInfo.location = data.jobLocation?.address?.addressLocality || $('[data-testid="job-location"]').text().trim();
          jobInfo.description = data.description || $('[data-testid="job-description"]').text().trim();
        }
      } catch (e) {
        // Fall back to HTML parsing
      }
    }
    
    // Fallback to HTML selectors
    if (!jobInfo.title) {
      jobInfo.title = $('h1').first().text().trim() || 
                     $('[data-testid="job-title"]').text().trim() ||
                     $('.sc-').first().text().trim();
    }
    if (!jobInfo.company) {
      jobInfo.company = $('[data-testid="company-name"]').text().trim() ||
                       $('a[href*="/companies/"]').first().text().trim();
    }
    if (!jobInfo.location) {
      jobInfo.location = $('[data-testid="job-location"]').text().trim() ||
                        $('[data-testid="job-locations"]').text().trim();
    }
  }
  
  // LinkedIn
  else if (urlLower.includes('linkedin.com/jobs')) {
    const jsonLd = $('script[type="application/ld+json"]').first().html();
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        if (data['@type'] === 'JobPosting') {
          jobInfo.title = data.title;
          jobInfo.company = data.hiringOrganization?.name;
          jobInfo.location = data.jobLocation?.address?.addressLocality;
          jobInfo.description = data.description;
        }
      } catch (e) {
        // Fall back to HTML parsing
      }
    }
    
    if (!jobInfo.title) {
      jobInfo.title = $('h1.topcard__title').text().trim() ||
                     $('.job-details-jobs-unified-top-card__job-title').text().trim();
    }
    if (!jobInfo.company) {
      jobInfo.company = $('.topcard__org-name-link').text().trim() ||
                       $('.job-details-jobs-unified-top-card__company-name a').text().trim();
    }
    if (!jobInfo.location) {
      jobInfo.location = $('.topcard__flavor--bullet').text().trim() ||
                        $('.job-details-jobs-unified-top-card__primary-description-without-tagline').text().trim();
    }
  }
  
  // Indeed
  else if (urlLower.includes('indeed.com')) {
    const jsonLd = $('script[type="application/ld+json"]').first().html();
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        if (data['@type'] === 'JobPosting') {
          jobInfo.title = data.title;
          jobInfo.company = data.hiringOrganization?.name;
          jobInfo.location = data.jobLocation?.address?.addressLocality;
          jobInfo.description = data.description;
        }
      } catch (e) {
        // Fall back to HTML parsing
      }
    }
    
    if (!jobInfo.title) {
      jobInfo.title = $('h2.jobTitle').text().trim() ||
                     $('[data-testid="job-title"]').text().trim();
    }
    if (!jobInfo.company) {
      jobInfo.company = $('[data-testid="inlineHeader-companyName"]').text().trim() ||
                       $('.companyName').text().trim();
    }
    if (!jobInfo.location) {
      jobInfo.location = $('[data-testid="job-location"]').text().trim() ||
                        $('.jobLocation').text().trim();
    }
  }
  
  // Generic fallback - try to find common patterns
  else {
    // Try JSON-LD first
    const jsonLd = $('script[type="application/ld+json"]').first().html();
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        if (data['@type'] === 'JobPosting') {
          jobInfo.title = data.title;
          jobInfo.company = data.hiringOrganization?.name;
          jobInfo.location = data.jobLocation?.address?.addressLocality;
          jobInfo.description = data.description;
        }
      } catch (e) {
        // Continue to HTML parsing
      }
    }
    
    // Generic HTML selectors
    if (!jobInfo.title) {
      jobInfo.title = $('h1').first().text().trim() ||
                     $('meta[property="og:title"]').attr('content') ||
                     $('title').text().trim();
    }
    if (!jobInfo.company) {
      jobInfo.company = $('meta[property="og:site_name"]').attr('content') ||
                       $('[itemprop="hiringOrganization"]').text().trim();
    }
    if (!jobInfo.location) {
      jobInfo.location = $('[itemprop="jobLocation"]').text().trim();
    }
  }

  // Normalize content for comparison
  const parts: string[] = [];
  if (jobInfo.title) parts.push(jobInfo.title.toLowerCase().trim());
  if (jobInfo.company) parts.push(jobInfo.company.toLowerCase().trim());
  if (jobInfo.location) parts.push(jobInfo.location.toLowerCase().trim());
  jobInfo.normalizedContent = parts.join('|');

  return jobInfo;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    // Only allow http/https URLs
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ success: false, error: 'Only HTTP/HTTPS URLs are allowed' });
    }

    console.log(`Analyzing job URL: ${url}`);

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000, // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const jobInfo = extractJobInfo(html, url);

    console.log(`Extracted job info:`, {
      title: jobInfo.title,
      company: jobInfo.company,
      location: jobInfo.location,
      hasDescription: !!jobInfo.description,
    });

    return res.json({
      success: true,
      jobInfo,
    });
  } catch (error: any) {
    console.error('Error analyzing job URL:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze job URL',
    });
  }
}

