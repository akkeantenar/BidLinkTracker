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
        
        const allUrls: Array<{ url: string; tabName: string; rowIndex: number; position: string; date: string; no: string }> = [];

        for (const tabName of tabs) {
          try {
            const dataResponse = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `${tabName}!A:J`,
            });
            const data = dataResponse.data.values || [];
            
            for (let i = 1; i < data.length; i++) {
              const row = data[i];
              const jobUrl = row[5] || '';
              const position = row[4] || '';
              const date = row[0] || ''; // Column A
              const no = row[1] || ''; // Column B
              
              if (jobUrl && jobUrl.trim()) {
                allUrls.push({
                  url: jobUrl.trim(),
                  tabName,
                  rowIndex: i + 1,
                  position: position.trim(),
                  date: date.trim(),
                  no: no.trim(),
                });
              }
            }
          } catch (error) {
            console.error(`Error reading tab ${tabName}:`, error);
          }
        }

        return res.json({ success: true, data: allUrls });
      }

      case 'batchUpdateFeedback': {
        const { updates } = bodyData;
        if (!Array.isArray(updates)) {
          return res.status(400).json({ success: false, error: 'updates must be an array' });
        }

        // Update both Column H (Approved - clear it) and Column I (Feedback)
        // Use batchUpdate with both value updates and data validation clearing
        const requests: any[] = [];
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

        // Use batchUpdate with RAW for checkbox, USER_ENTERED for text
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: valueUpdates,
          },
        });

        return res.json({ success: true });
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
        return res.status(400).json({ success: false, error: 'Invalid action' });
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

