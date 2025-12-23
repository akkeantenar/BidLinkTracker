import { format, parse, startOfWeek, addDays, isWithinInterval } from 'date-fns';

/**
 * Validates if a date string is in MM/DD/YYYY format
 */
export function isValidDateFormat(dateString: string): boolean {
  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }
  
  try {
    const date = parse(dateString, 'MM/dd/yyyy', new Date());
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Parses a date string in MM/DD/YYYY format
 */
export function parseDate(dateString: string): Date {
  return parse(dateString, 'MM/dd/yyyy', new Date());
}

/**
 * Formats a date to MM/DD/YYYY format
 */
export function formatDate(date: Date): string {
  return format(date, 'MM/dd/yyyy');
}

/**
 * Generates a tab name from a date (MM/DD/YYYY-MM/DD/YYYY format)
 * The tab represents a 7-day period starting from the date's week
 */
export function generateTabName(date: Date): string {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 }); // Sunday
  const weekEnd = addDays(weekStart, 6); // Saturday
  
  const startStr = formatDate(weekStart);
  const endStr = formatDate(weekEnd);
  
  return `${startStr}-${endStr}`;
}

/**
 * Finds the appropriate tab name for a given date
 */
export function findTabForDate(date: Date, existingTabs: string[]): string | null {
  const targetTab = generateTabName(date);
  
  // Check if exact tab exists
  if (existingTabs.includes(targetTab)) {
    return targetTab;
  }
  
  // Try to find a tab that contains this date
  for (const tabName of existingTabs) {
    const tabRange = parseTabRange(tabName);
    if (tabRange && isWithinInterval(date, { start: tabRange.start, end: tabRange.end })) {
      return tabName;
    }
  }
  
  return null;
}

/**
 * Parses a tab name (MM/DD/YYYY-MM/DD/YYYY) to extract date range
 */
export function parseTabRange(tabName: string): { start: Date; end: Date } | null {
  const parts = tabName.split('-');
  if (parts.length !== 2) {
    return null;
  }
  
  try {
    // Handle format like "12/15-12/21" or "12/15/2024-12/21/2024"
    let startStr = parts[0].trim();
    let endStr = parts[1].trim();
    
    // If year is missing, try to infer from current date
    if (!startStr.match(/\d{4}$/)) {
      const currentYear = new Date().getFullYear();
      startStr = `${startStr}/${currentYear}`;
    }
    if (!endStr.match(/\d{4}$/)) {
      const currentYear = new Date().getFullYear();
      endStr = `${endStr}/${currentYear}`;
    }
    
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return null;
    }
    
    return { start, end };
  } catch {
    return null;
  }
}

