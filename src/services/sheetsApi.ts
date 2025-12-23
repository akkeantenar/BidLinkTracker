/**
 * Google Sheets API service - uses Vercel API routes
 * All functions call the /api/sheets endpoint with different actions
 */

// API base URL - in production uses same domain, in dev uses Vite proxy
const API_BASE = import.meta.env.PROD 
  ? '' // In production, use relative path (same domain)
  : ''; // In dev, use relative path (Vite proxy handles it)

async function apiCall(action: string, body?: any) {
  const url = `${API_BASE}/api/sheets?action=${action}`;
  
  // Get uploaded credentials and spreadsheet ID from sessionStorage if available
  const STORAGE_KEY = 'bidlinktracker_service_account';
  const SPREADSHEET_KEY = 'bidlinktracker_spreadsheet_id';
  const credentials = sessionStorage.getItem(STORAGE_KEY);
  const spreadsheetId = sessionStorage.getItem(SPREADSHEET_KEY);
  
  // Log for debugging
  if (!credentials) {
    console.warn('[sheetsApi] No credentials found in sessionStorage');
  }
  if (!spreadsheetId) {
    console.warn('[sheetsApi] No spreadsheet ID found in sessionStorage');
  }
  
  const requestBody = body || {};
  if (credentials) {
    try {
      requestBody.credentials = JSON.parse(credentials);
    } catch (error) {
      console.error('Failed to parse stored credentials:', error);
      throw new Error('Invalid credentials format. Please re-upload your service account key.');
    }
  } else {
    throw new Error('No credentials found. Please add and activate an account with service account credentials.');
  }
  
  if (spreadsheetId) {
    requestBody.spreadsheetId = spreadsheetId;
  } else {
    throw new Error('No spreadsheet ID found. Please add and activate an account with a spreadsheet ID.');
  }
  
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError: any) {
    console.error('Network error:', networkError);
    if (networkError.message?.includes('Failed to fetch') || networkError.message?.includes('NetworkError')) {
      throw new Error('Cannot connect to API server. Please make sure the API server is running. Run "npm run dev:all" to start both the frontend and API server.');
    }
    throw networkError;
  }

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const errorMessage = errorData.error || errorData.details || `API request failed: ${response.statusText}`;
    console.error('API Error Details:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      url,
      hasCredentials: !!credentials,
      hasSpreadsheetId: !!spreadsheetId,
    });
    throw new Error(errorMessage);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'API request failed');
  }

  return result.data;
}

/**
 * Get all tabs (sheets) in the spreadsheet
 */
export async function getAllTabs(): Promise<string[]> {
  return apiCall('getAllTabs');
}

/**
 * Get all data from a specific tab
 */
export async function getTabData(tabName: string): Promise<any[][]> {
  return apiCall('getTabData', { tabName });
}

/**
 * Get all job URLs from Column F across all tabs
 * Returns array with url, tabName, rowIndex, and position
 */
export async function getAllJobUrls(): Promise<
  Array<{ url: string; tabName: string; rowIndex: number; position: string }>
> {
  return apiCall('getAllJobUrls');
}

/**
 * Update feedback in Column I for a specific row
 */
export async function updateFeedback(
  tabName: string,
  rowIndex: number,
  feedback: string
): Promise<void> {
  await apiCall('batchUpdateFeedback', {
    updates: [{ tabName, rowIndex, feedback }],
  });
}

/**
 * Batch update feedback for multiple rows
 * Also clears Column H (Approved) for duplicate entries
 */
export async function batchUpdateFeedback(
  updates: Array<{ tabName: string; rowIndex: number; feedback: string }>
): Promise<void> {
  await apiCall('batchUpdateFeedback', { updates });
}

/**
 * Find the next empty row in a tab (checking Column A)
 */
export async function findEmptyRow(tabName: string): Promise<number> {
  const data = await getTabData(tabName);
  
  // Find first empty row in Column A (index 0)
  for (let i = 1; i < data.length; i++) {
    if (!data[i] || !data[i][0] || !data[i][0].trim()) {
      return i + 1; // 1-based row index
    }
  }
  
  // If no empty row found, return next row after last data row
  return data.length + 1;
}

/**
 * Add a job entry to a tab (write to Column A and Column F)
 */
export async function addJobEntry(
  tabName: string,
  date: string,
  jobUrl: string
): Promise<void> {
  await batchAddJobEntries(tabName, [{ date, jobUrl }]);
}

/**
 * Batch add job entries to a tab
 */
export async function batchAddJobEntries(
  tabName: string,
  entries: Array<{ date: string; jobUrl: string }>
): Promise<void> {
  await apiCall('batchAddJobEntries', { tabName, entries });
}
