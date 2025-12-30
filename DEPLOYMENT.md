# Vercel Deployment Guide for BidLinkTracker

This guide will walk you through deploying BidLinkTracker to Vercel.

## Prerequisites

1. **GitHub/GitLab/Bitbucket Account** - Your code needs to be in a Git repository
2. **Vercel Account** - Sign up at [vercel.com](https://vercel.com) (free tier available)
3. **Google Cloud Service Account** - Already set up for Google Sheets API access

## Step 1: Prepare Your Repository

1. **Commit all your changes:**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   ```

2. **Push to your Git repository:**
   ```bash
   git push origin main
   ```
   (Replace `main` with your branch name if different)

## Step 2: Update vercel.json (if needed)

The project already has a `vercel.json` file. Verify it includes API route configuration:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Note:** Vercel automatically detects API routes in the `/api` folder, so the rewrite for `/api/(.*)` ensures API routes work correctly.

## Step 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to [vercel.com](https://vercel.com)** and sign in

2. **Click "Add New..." → "Project"**

3. **Import your Git repository:**
   - Connect your GitHub/GitLab/Bitbucket account if not already connected
   - Select your repository
   - Click "Import"

4. **Configure Project Settings:**
   - **Framework Preset:** Vite (should be auto-detected)
   - **Root Directory:** `./` (leave as default)
   - **Build Command:** `npm run build` (should be auto-filled)
   - **Output Directory:** `dist` (should be auto-filled)
   - **Install Command:** `npm install` (should be auto-filled)

5. **Configure Environment Variables (Optional):**
   
   **⚠️ IMPORTANT:** Environment variables are **optional** if users will upload their own credentials!
   
   The app supports two modes:
   
   **Mode 1: User-Uploaded Credentials (Recommended for Multiple Accounts)**
   - ✅ **Skip environment variables** - Users upload their own credentials through the UI
   - ✅ Each user can have multiple profiles with different service accounts
   - ✅ Credentials stored securely in user's browser
   - ✅ One deployment serves all users
   
   **Mode 2: Environment Variables (Fallback/Default)**
   - Use if you want to provide a default service account
   - Only used if users haven't uploaded their own credentials
   - Click "Environment Variables" and add:

   **Optional Variables (for fallback/default):**
   
   - **`VITE_GOOGLE_SERVICE_ACCOUNT_KEY`**
     - Value: Your entire service account JSON as a **single-line string**
     - Example: `{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}`
     - **Important:** 
       - Paste the entire JSON object as one line
       - Keep all quotes and escape characters
       - Or use Vercel's "Encrypted" option for security
   
   - **`VITE_SPREADSHEET_ID`**
     - Value: Your Google Spreadsheet ID (for default/fallback)
     - Example: `18Rz4xAYhcxdfYJchKQzIhle_gHi7Nk0nEmvqdJUXgpU`
     - This is the ID from your spreadsheet URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

   - **`VITE_GOOGLE_CLIENT_ID`**
     - Value: Your Google OAuth Client ID (if using OAuth)
     - Only needed if you plan to use OAuth authentication

6. **Deploy:**
   - Click "Deploy"
   - Wait for the build to complete (usually 2-3 minutes)
   - Your app will be live at `https://your-project-name.vercel.app`

### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project or create new
   - Set up environment variables when prompted
   - Confirm deployment

4. **For production deployment:**
   ```bash
   vercel --prod
   ```

## Step 4: Configure Environment Variables in Vercel Dashboard

### Understanding Multiple Accounts

**Important:** Your application already supports multiple accounts! Here's how it works:

1. **User-Uploaded Credentials (Recommended):**
   - Each user can create multiple profiles
   - Each profile can have its own service account JSON and spreadsheet ID
   - Credentials are stored in the user's browser (localStorage)
   - **No environment variables needed for this approach!**

2. **Environment Variables (Optional Fallback):**
   - Environment variables in Vercel are used as a **fallback only**
   - They're only used if a user hasn't uploaded their own credentials
   - Useful for providing a default service account for testing/demos

### Option A: Multi-Account Setup (Recommended - No Env Vars Needed)

**Best for:** Multiple users, each with their own Google Sheets and service accounts

1. **Deploy without environment variables:**
   - Users will upload their own service account JSON files through the UI
   - Each user can manage multiple profiles with different credentials
   - Credentials are stored securely in the user's browser

2. **How it works:**
   - Users go to "Manage Profiles" → "Add New Profile"
   - They upload their service account JSON file
   - They enter their spreadsheet ID
   - The app stores credentials in localStorage (browser storage)
   - Each profile can have different credentials

**Advantages:**
- ✅ One deployment serves all users
- ✅ Each user manages their own credentials
- ✅ No need to manage multiple environment variables
- ✅ More secure (credentials never stored on server)

### Option B: Environment Variables as Fallback

**Best for:** Providing a default service account for testing or shared access

1. Go to your project on [vercel.com](https://vercel.com)
2. Click **Settings** → **Environment Variables**
3. Add the variables (see Step 3, Option A for details)
4. **Important:** After adding/updating environment variables, you need to **redeploy**:
   - Go to **Deployments** tab
   - Click the three dots (⋯) on the latest deployment
   - Click **Redeploy**

**Note:** These environment variables are only used if:
- A user hasn't uploaded their own credentials
- The API needs a fallback service account

### Option C: Multiple Deployments (One Per Account)

**Best for:** Completely separate instances for different organizations

If you want completely separate deployments for different accounts:

1. **Create separate Vercel projects:**
   - Project 1: `bidlinktracker-account1` → Set env vars for Account 1
   - Project 2: `bidlinktracker-account2` → Set env vars for Account 2
   - Project 3: `bidlinktracker-account3` → Set env vars for Account 3

2. **Each deployment has its own:**
   - Environment variables
   - Domain URL
   - Deployment history

3. **Deploy from different branches or repos:**
   - Option 1: Same repo, different branches
   - Option 2: Different repos
   - Option 3: Same branch, different Vercel projects

**When to use this:**
- Different organizations need completely separate instances
- Different security/compliance requirements
- Need separate billing/usage tracking

## Step 5: Verify Deployment

1. **Check your deployment URL:**
   - Your app should be available at `https://your-project-name.vercel.app`
   - API routes should work at `https://your-project-name.vercel.app/api/sheets`

2. **Test the application:**
   - Open your deployment URL
   - Try logging in
   - Test the duplicate checker functionality
   - Check browser console for any errors

3. **Check Vercel logs:**
   - Go to your project → **Deployments** → Click on a deployment
   - Click **Functions** tab to see API route logs
   - Check for any errors in the logs

## Troubleshooting

### Issue: API routes return 404

**Solution:** 
- Verify `vercel.json` includes the API rewrite rule
- Ensure your API files are in the `/api` folder
- Check that the file exports a default handler function

### Issue: Environment variables not working

**Solution:**
- Verify variables are set in Vercel dashboard (Settings → Environment Variables)
- Ensure variable names start with `VITE_` for frontend access
- **Redeploy** after adding/updating environment variables
- Check that the JSON string is properly formatted (single line, escaped quotes)

### Issue: Build fails

**Solution:**
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version (Vercel uses Node 18+ by default)
- Check for TypeScript errors: `npm run build` locally first

### Issue: Google Sheets API errors

**Solution:**
- Verify `VITE_GOOGLE_SERVICE_ACCOUNT_KEY` is set correctly
- Ensure the service account JSON is valid (single-line string)
- Check that the service account email has access to your spreadsheet
- Verify the spreadsheet ID is correct

### Issue: CORS errors

**Solution:**
- The API routes already include CORS headers
- If issues persist, check the `Access-Control-Allow-Origin` header in `api/sheets.ts`
- Ensure your frontend URL matches the allowed origins

## Environment Variable Format Tips

### For VITE_GOOGLE_SERVICE_ACCOUNT_KEY:

**Option 1: Single-line JSON string**
```
{"type":"service_account","project_id":"my-project","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n","client_email":"my-service@my-project.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/my-service%40my-project.iam.gserviceaccount.com"}
```

**Option 2: Use Vercel's encrypted environment variables**
- In Vercel dashboard, when adding the variable, select "Encrypted"
- Paste your JSON file content
- Vercel will handle the encryption

## Custom Domain (Optional)

1. Go to your project → **Settings** → **Domains**
2. Add your custom domain
3. Follow Vercel's DNS configuration instructions
4. Wait for DNS propagation (can take up to 24 hours)

## Continuous Deployment

Vercel automatically deploys when you push to your main branch:
- Every push to `main` triggers a new deployment
- Preview deployments are created for pull requests
- You can configure branch protection in Vercel settings

## Monitoring and Analytics

- **Logs:** View real-time logs in Vercel dashboard → **Deployments** → **Functions**
- **Analytics:** Enable Vercel Analytics in project settings
- **Error Tracking:** Consider integrating Sentry or similar service

## Security Best Practices

1. **Never commit environment variables to Git**
   - Use `.gitignore` to exclude `.env` files
   - Always set variables in Vercel dashboard

2. **Use Vercel's encrypted environment variables**
   - More secure than plain text
   - Encrypted at rest

3. **Limit service account permissions**
   - Only grant necessary permissions
   - Use separate service accounts for different environments

4. **Enable Vercel's security features**
   - Enable DDoS protection
   - Use Vercel's firewall rules if needed

## Support

- **Vercel Documentation:** https://vercel.com/docs
- **Vercel Community:** https://github.com/vercel/vercel/discussions
- **Project Issues:** Check your project's issue tracker

---

## Quick Checklist

- [ ] Code pushed to Git repository
- [ ] Vercel account created
- [ ] Project imported to Vercel
- [ ] Environment variables configured:
  - [ ] `VITE_GOOGLE_SERVICE_ACCOUNT_KEY`
  - [ ] `VITE_SPREADSHEET_ID`
  - [ ] `VITE_GOOGLE_CLIENT_ID` (optional)
- [ ] Project deployed successfully
- [ ] Application tested on production URL
- [ ] API routes working correctly
- [ ] Google Sheets integration verified

