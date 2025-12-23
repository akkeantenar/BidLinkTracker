import { parseTabRange } from './dateUtils';

/**
 * Validates if a tab name follows the date range format
 */
export function isValidTabName(tabName: string): boolean {
  return parseTabRange(tabName) !== null;
}

/**
 * Sorts tabs by their start date
 */
export function sortTabsByDate(tabNames: string[]): string[] {
  return tabNames.sort((a, b) => {
    const rangeA = parseTabRange(a);
    const rangeB = parseTabRange(b);
    
    if (!rangeA || !rangeB) {
      return 0;
    }
    
    return rangeA.start.getTime() - rangeB.start.getTime();
  });
}

