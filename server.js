// Development server for API routes
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize Google Sheets API client
function initializeSheetsClient(credentialsFromRequest) {
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

function getSpreadsheetId(requestSpreadsheetId) {
  if (requestSpreadsheetId) {
    return requestSpreadsheetId;
  }
  
  const id = process.env.VITE_SPREADSHEET_ID;
  if (!id) {
    throw new Error('Spreadsheet ID is required. Please provide it in your account settings or set VITE_SPREADSHEET_ID environment variable.');
  }
  return id;
}

app.post('/api/sheets', async (req, res) => {
  try {
    const { credentials: requestCredentials, spreadsheetId: requestSpreadsheetId, ...bodyData } = req.body || {};
    const { action } = req.query;
    
    if (!action) {
      return res.status(400).json({ success: false, error: 'action query parameter is required' });
    }
    
    const sheets = initializeSheetsClient(requestCredentials);
    const spreadsheetId = getSpreadsheetId(requestSpreadsheetId);

    switch (action) {
      case 'getAllTabs': {
        const response = await sheets.spreadsheets.get({ spreadsheetId });
        const tabs = (response.data.sheets || []).map((sheet) => sheet.properties?.title || '');
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
        const tabs = (tabsResponse.data.sheets || []).map((sheet) => sheet.properties?.title || '');
        
        const allUrls = [];

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
        const valueUpdates = [];
        
        updates.forEach(({ tabName, rowIndex, feedback }) => {
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

        // Use batchUpdate with USER_ENTERED
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

        const values = entries.map(({ date, jobUrl }) => [date, '', '', '', '', jobUrl]);

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
  } catch (error) {
    console.error('API Error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('Query params:', req.query);
    
    const errorMessage = error?.message || 'Internal server error';
    
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
    
    // Provide more detailed error in development
    const errorResponse = {
      success: false,
      error: errorMessage,
    };
    
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
      errorResponse.details = error?.stack;
      errorResponse.errorType = error?.name;
    }
    
    return res.status(500).json(errorResponse);
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

