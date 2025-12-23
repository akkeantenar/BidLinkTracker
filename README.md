# BidLinkTracker

A React application for tracking job applications with duplicate detection and Google Sheets integration.

## Features

### Bid Manager
- Check for duplicate job URLs across all spreadsheet tabs
- Mark duplicates with feedback including tab name and position
- View detailed duplicate information

### Bidder
- Submit job links with date
- Real-time duplicate checking
- Automatic tab selection based on date (weekly periods)
- Only non-duplicate links are added to the spreadsheet

## Setup

### Prerequisites
- Node.js 18+ and npm
- Google Cloud Console project with Sheets API enabled
- Service account with access to your Google Spreadsheet

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Add your Google service account key JSON as `VITE_GOOGLE_SERVICE_ACCOUNT_KEY`
   - Add your Spreadsheet ID as `VITE_SPREADSHEET_ID`

### Environment Variables

Create a `.env` file in the root directory:

```
VITE_GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
VITE_SPREADSHEET_ID=your-spreadsheet-id-here
VITE_GOOGLE_CLIENT_ID=your-client-id-here
```

**Note:** The service account key should be a JSON string. The app uses Vercel API routes (`/api/sheets`) to securely handle Google Sheets API calls server-side, keeping your credentials safe.

### Development

For local development, you have two options:

**Option 1: Run both frontend and API server (Recommended)**
```bash
# Install dependencies first
npm install

# Run both servers concurrently
npm run dev:all
```

This will start:
- Frontend on `http://localhost:3000`
- API server on `http://localhost:3001`

**Option 2: Run servers separately**
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - API Server
npm run dev:api
```

**Option 3: Use Vercel CLI (for production-like environment)**
```bash
npm install -g vercel
vercel dev
```

**Note:** The API routes require server-side execution. For local development, use `npm run dev:all` or run the servers separately.

### Build

Build for production:
```bash
npm run build
```

## Deployment on Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Import your project in Vercel:
   - Go to [Vercel](https://vercel.com)
   - Click "New Project"
   - Import your repository

3. Configure environment variables in Vercel:
   - Go to Project Settings → Environment Variables
   - Add the following variables (these are used by the API routes):
     - `VITE_GOOGLE_SERVICE_ACCOUNT_KEY`: Paste your service account JSON as a string (keep the quotes and escape properly, or paste as plain JSON)
     - `VITE_SPREADSHEET_ID`: Your Google Spreadsheet ID
     - `VITE_GOOGLE_CLIENT_ID`: Your Google Client ID (optional)
   
   **Important:** In Vercel, environment variables are available to both frontend and API routes. The API routes in `/api/sheets.ts` use these variables server-side to securely access Google Sheets.

4. Deploy:
   - Vercel will automatically detect Vite and build your project
   - The deployment will be available at your Vercel URL

## Google Sheets Setup

### Spreadsheet Structure

Your spreadsheet should have the following columns:
- **Column A**: Date (MM/DD/YYYY)
- **Column B**: No (Number)
- **Column C**: Job Site
- **Column D**: Company Name
- **Column E**: Position
- **Column F**: Job Url
- **Column G**: Applied Url
- **Column H**: Approved
- **Column I**: Feedback
- **Column J**: Bonus

### Tabs

Tabs should be named in the format: `MM/DD/YYYY-MM/DD/YYYY` (e.g., `12/15/2024-12/21/2024`)
Each tab represents a 7-day period (week).

### Service Account Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google Sheets API
4. Create a Service Account:
   - Go to "IAM & Admin" → "Service Accounts"
   - Click "Create Service Account"
   - Give it a name and description
   - Click "Create and Continue"
   - Skip role assignment (click "Continue")
   - Click "Done"
5. Create a key:
   - Click on your service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose JSON format
   - Download the JSON file
6. Share your spreadsheet with the service account:
   - Open your Google Spreadsheet
   - Click "Share"
   - Add the service account email (found in the JSON file as `client_email`)
   - Give it "Editor" access

## Usage

### Bid Manager

1. Log in and select "Bid Manager" role
2. Click "Check for Duplicates" to scan all tabs
3. Review the duplicate results
4. Click "Mark Duplicates" to update Column I with duplicate information

### Bidder

1. Log in and select "Bidder" role
2. Enter a date in MM/DD/YYYY format
3. Paste job URLs (one per line)
4. Review the status of each link (Available or Duplicated)
5. Click "Submit" to add available links to the spreadsheet

## Technologies

- React 18
- TypeScript
- Vite
- React Router
- Google Sheets API
- date-fns
