import { google } from 'googleapis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Google Sheets API client
function initializeSheetsClient(credentialsFromRequest?: any) {
  // Use credentials from request if provided, otherwise use environment variable
  let credentials = credentialsFromRequest;
  
  if (!credentials) {
    const serviceAccountKey = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccountKey) {
      throw new Error('VITE_GOOGLE_SERVICE_ACCOUNT_KEY is not set and no credentials provided in request');
    }

    try {
      credentials = typeof serviceAccountKey === 'string' 
        ? JSON.parse(serviceAccountKey) 
        : serviceAccountKey;
    } catch (error) {
      throw new Error('Failed to parse service account key JSON');
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

function getSpreadsheetId(requestSpreadsheetId?: string): string {
  // Use spreadsheet ID from request if provided, otherwise fall back to environment variable
  if (requestSpreadsheetId) {
    return requestSpreadsheetId;
  }
  
  const id = process.env.VITE_SPREADSHEET_ID;
  if (!id) {
    throw new Error('Spreadsheet ID is required. Please provide it in your account settings or set VITE_SPREADSHEET_ID environment variable.');
  }
  return id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Get credentials and spreadsheet ID from request body if provided
    const { credentials: requestCredentials, spreadsheetId: requestSpreadsheetId, ...bodyData } = req.body || {};
    const sheets = initializeSheetsClient(requestCredentials);
    const spreadsheetId = getSpreadsheetId(requestSpreadsheetId);
    const { action } = req.query;
    
    // Debug logging
    console.log('[API] Received request:', { 
      action, 
      method: req.method,
      hasCredentials: !!requestCredentials,
      hasSpreadsheetId: !!requestSpreadsheetId,
      bodyKeys: Object.keys(bodyData || {})
    });
    
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: `Action parameter is required. Received: ${action}. Use ?action=getAllTabs or similar.` 
      });
    }

    switch (action) {
      case 'getAllTabs': {
        const response = await sheets.spreadsheets.get({ spreadsheetId });
        const tabs = (response.data.sheets || []).map((sheet: any) => sheet.properties?.title || '');
        return res.json({ success: true, data: tabs });
      }

      case 'getTabData': {
        const { tabName } = bodyData;
        if (!tabName) {
          return res.status(400).json({ success: false, error: 'tabName is required' });
        }
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${tabName}!A:J`,
        });
        return res.json({ success: true, data: response.data.values || [] });
      }

      case 'getAllJobUrls': {
        const tabsResponse = await sheets.spreadsheets.get({ spreadsheetId });
        const tabs = (tabsResponse.data.sheets || []).map((sheet: any) => sheet.properties?.title || '');
        
        const allUrls: Array<{ url: string; tabName: string; rowIndex: number; position: string; date: string; no: string; companyName: string }> = [];

        for (const tabName of tabs) {
          try {
            const dataResponse = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `${tabName}!A:J`,
            });
            const data = dataResponse.data.values || [];
            
            for (let i = 1; i < data.length; i++) {
              const row = data[i];
              // Ensure row has enough elements (handle sparse arrays from Google Sheets)
              if (!row || row.length === 0) continue;
              
              const jobUrl = (row[5] && row[5].trim()) || ''; // Column F - Job Url
              const appliedUrl = (row[6] && row[6].trim()) || ''; // Column G - Applied Url
              const position = (row[4] && row[4].trim()) || '';
              const companyName = (row[3] && row[3].trim()) || ''; // Column D - Company Name
              const date = (row[0] && row[0].trim()) || ''; // Column A
              const no = (row[1] && row[1].trim()) || ''; // Column B
              
              // Check Column F (Job Url)
              if (jobUrl && jobUrl.trim()) {
                allUrls.push({
                  url: jobUrl.trim(),
                  tabName,
                  rowIndex: i + 1,
                  position: position.trim(),
                  date: date.trim(),
                  no: no.trim(),
                  companyName: companyName.trim(),
                });
              }
              
              // Also check Column G (Applied Url) - treat as separate entry if different from Job Url
              if (appliedUrl && appliedUrl.trim() && appliedUrl.trim() !== jobUrl.trim()) {
                allUrls.push({
                  url: appliedUrl.trim(),
                  tabName,
                  rowIndex: i + 1,
                  position: position.trim(),
                  date: date.trim(),
                  no: no.trim(),
                  companyName: companyName.trim(),
                });
              }
            }
          } catch (error) {
            console.error(`Error reading tab ${tabName}:`, error);
          }
        }

        return res.json({ success: true, data: allUrls });
      }

      case 'getJobUrlsFromTabs': {
        const { tabNames } = bodyData;
        if (!tabNames || !Array.isArray(tabNames) || tabNames.length === 0) {
          return res.status(400).json({ success: false, error: 'tabNames array is required' });
        }

        const allUrls: Array<{ url: string; tabName: string; rowIndex: number; position: string; date: string; no: string; companyName: string }> = [];

        // Fetch all tabs in parallel for better performance
        const tabPromises = tabNames.map(async (tabName: string) => {
          try {
            const dataResponse = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `${tabName}!A:J`,
            });
            const data = dataResponse.data.values || [];
            
            console.log(`Tab "${tabName}": Found ${data.length} rows (including header)`);
            
            const tabUrls: Array<{ url: string; tabName: string; rowIndex: number; position: string; date: string; no: string; companyName: string }> = [];
            
            for (let i = 1; i < data.length; i++) {
              const row = data[i];
              if (!row || row.length === 0) continue;
              
              const jobUrl = (row[5] && row[5].trim()) || '';
              const appliedUrl = (row[6] && row[6].trim()) || '';
              const position = (row[4] && row[4].trim()) || '';
              const companyName = (row[3] && row[3].trim()) || '';
              const date = (row[0] && row[0].trim()) || '';
              const no = (row[1] && row[1].trim()) || '';
              
              if (jobUrl && jobUrl.trim()) {
                tabUrls.push({
                  url: jobUrl.trim(),
                  tabName,
                  rowIndex: i + 1,
                  position: position.trim(),
                  date: date.trim(),
                  no: no.trim(),
                  companyName: companyName.trim(),
                });
              }
              
              if (appliedUrl && appliedUrl.trim() && appliedUrl.trim() !== jobUrl.trim()) {
                tabUrls.push({
                  url: appliedUrl.trim(),
                  tabName,
                  rowIndex: i + 1,
                  position: position.trim(),
                  date: date.trim(),
                  no: no.trim(),
                  companyName: companyName.trim(),
                });
              }
            }
            
            console.log(`Tab "${tabName}": Extracted ${tabUrls.length} URLs`);
            return tabUrls;
          } catch (error: any) {
            console.error(`Error reading tab "${tabName}":`, error);
            console.error(`Error details:`, {
              message: error.message,
              code: error.code,
              status: error.status,
            });
            // Return empty array but log the error
            return [];
          }
        });

        const tabResults = await Promise.all(tabPromises);
        tabResults.forEach((tabUrls, index) => {
          allUrls.push(...tabUrls);
          console.log(`Tab "${tabNames[index]}": Added ${tabUrls.length} URLs (total so far: ${allUrls.length})`);
        });

        console.log(`Total URLs extracted from ${tabNames.length} tab(s): ${allUrls.length}`);
        return res.json({ success: true, data: allUrls });
      }

      case 'batchUpdateFeedback': {
        const { updates } = bodyData;
        if (!Array.isArray(updates)) {
          return res.status(400).json({ success: false, error: 'updates must be an array' });
        }

        // Update both Column H (Approved - clear it) and Column I (Feedback)
        const valueUpdates: any[] = [];
        
        updates.forEach(({ tabName, rowIndex, feedback }: any) => {
          // Clear Column H (Approved) - set to FALSE
          valueUpdates.push({
            range: `${tabName}!H${rowIndex}`,
            values: [['FALSE']], // Use string FALSE to uncheck checkbox
          });
          // Update Column I (Feedback)
          valueUpdates.push({
            range: `${tabName}!I${rowIndex}`,
            values: [[feedback]],
          });
        });

        try {
          // Try batch update first
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data: valueUpdates,
            },
          });

          return res.json({ success: true });
        } catch (batchError: any) {
          // If batch update fails due to protected cells, try updating individually
          if (batchError.message && batchError.message.includes('protected')) {
            const successful: string[] = [];
            const failed: Array<{ tabName: string; rowIndex: number; reason: string }> = [];

            // Try updating each cell individually
            for (const { tabName, rowIndex, feedback } of updates) {
              try {
                // Try to update Column H (Approved)
                try {
                  await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${tabName}!H${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [['FALSE']] },
                  });
                } catch (hError: any) {
                  if (hError.message && hError.message.includes('protected')) {
                    failed.push({ tabName, rowIndex, reason: 'Column H (Approved) is protected' });
                    continue; // Skip this row entirely
                  }
                  throw hError; // Re-throw if it's a different error
                }

                // Try to update Column I (Feedback)
                try {
                  await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${tabName}!I${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[feedback]] },
                  });
                } catch (iError: any) {
                  if (iError.message && iError.message.includes('protected')) {
                    failed.push({ tabName, rowIndex, reason: 'Column I (Feedback) is protected' });
                    continue;
                  }
                  throw iError;
                }

                successful.push(`${tabName}!${rowIndex}`);
              } catch (error: any) {
                failed.push({ tabName, rowIndex, reason: error.message || 'Unknown error' });
              }
            }

            if (failed.length > 0) {
              const failedDetails = failed.map(f => `${f.tabName} row ${f.rowIndex}: ${f.reason}`).join('; ');
              return res.status(207).json({ 
                success: true,
                partial: true,
                message: `Updated ${successful.length} of ${updates.length} entries. Some cells are protected.`,
                successful: successful.length,
                failed: failed.length,
                failedDetails: failed.length <= 10 ? failedDetails : `${failedDetails.substring(0, 200)}... (and ${failed.length - 10} more)`,
                error: `Some cells are protected. Please contact the spreadsheet owner to remove protection from Columns H and I, or share the spreadsheet with edit permissions for the service account.`
              });
            }

            return res.json({ success: true, message: `Updated ${successful.length} entries` });
          }
          
          // Re-throw if it's not a protection error
          throw batchError;
        }
      }

      case 'batchAddJobEntries': {
        const { tabName, entries } = bodyData;
        if (!tabName || !Array.isArray(entries)) {
          return res.status(400).json({ success: false, error: 'tabName and entries are required' });
        }

        // Find empty row
        const dataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${tabName}!A:J`,
        });
        const data = dataResponse.data.values || [];
        
        let startRow = data.length + 1;
        for (let i = 1; i < data.length; i++) {
          if (!data[i] || !data[i][0] || !data[i][0].trim()) {
            startRow = i + 1;
            break;
          }
        }

        const values = entries.map(({ date, jobUrl }: any) => [date, '', '', '', '', jobUrl]);

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabName}!A${startRow}:F${startRow + entries.length - 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });

        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ 
          success: false, 
          error: `Invalid action: "${action}". Available actions: getAllTabs, getTabData, getAllJobUrls, getJobUrlsFromTabs, batchUpdateFeedback, batchAddJobEntries, findEmptyRow` 
        });
    }
  } catch (error: any) {
    console.error('API Error:', error);
    const errorMessage = error.message || 'Internal server error';
    
    // Provide more specific error messages
    if (errorMessage.includes('Spreadsheet ID')) {
      return res.status(400).json({ 
        success: false, 
        error: errorMessage 
      });
    }
    
    if (errorMessage.includes('service account') || errorMessage.includes('credentials')) {
      return res.status(401).json({ 
        success: false, 
        error: errorMessage 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: errorMessage 
    });
  }
}

