# Multi-Account Setup Guide

## Overview

BidLinkTracker is designed to support **multiple accounts** out of the box. Each user can manage multiple profiles, each with its own Google Sheets service account and spreadsheet.

## How Multi-Account Works

### Architecture

1. **User Profiles System:**
   - Each user (bidder) can create multiple profiles
   - Each profile has:
     - Profile name
     - Service account JSON file (uploaded by user)
     - Spreadsheet ID/URL
   - Credentials are stored in the user's browser (localStorage)

2. **API Credential Flow:**
   - When making API calls, credentials are sent from the browser (sessionStorage)
   - API uses credentials from request if provided
   - Falls back to environment variables only if no credentials in request
   - This allows each user to use their own service account

## Deployment Options for Multiple Accounts

### Option 1: Single Deployment (Recommended) ✅

**Best for:** Most use cases - multiple users, each with their own accounts

**Setup:**
1. Deploy to Vercel **without** environment variables (or with optional fallback)
2. Each user uploads their own service account JSON through the UI
3. Users can create multiple profiles with different credentials

**Advantages:**
- ✅ One deployment serves all users
- ✅ No need to manage multiple environment variables
- ✅ Users manage their own credentials
- ✅ More secure (credentials never stored on server)
- ✅ Easy to scale (add users without redeploying)

**How Users Set Up:**
1. User signs in
2. Goes to "Manage Profiles"
3. Clicks "Add New Profile"
4. Uploads their service account JSON file
5. Enters their spreadsheet ID
6. Can create multiple profiles for different spreadsheets

**Example:**
- User "Alice" has 3 profiles:
  - Profile 1: "My Personal Sheet" → Service Account A → Spreadsheet 1
  - Profile 2: "Work Projects" → Service Account B → Spreadsheet 2
  - Profile 3: "Client XYZ" → Service Account C → Spreadsheet 3

### Option 2: Multiple Deployments

**Best for:** Completely separate instances for different organizations

**Setup:**
1. Create separate Vercel projects for each account
2. Each project has its own environment variables
3. Each project has its own domain

**When to Use:**
- Different organizations need separate instances
- Different security/compliance requirements
- Need separate billing/usage tracking
- Want completely isolated deployments

**Steps:**
1. **Create Project 1:**
   - Vercel project: `bidlinktracker-org1`
   - Environment variables:
     - `VITE_GOOGLE_SERVICE_ACCOUNT_KEY` = Org1's service account
     - `VITE_SPREADSHEET_ID` = Org1's spreadsheet
   - Domain: `org1-bidlinktracker.vercel.app`

2. **Create Project 2:**
   - Vercel project: `bidlinktracker-org2`
   - Environment variables:
     - `VITE_GOOGLE_SERVICE_ACCOUNT_KEY` = Org2's service account
     - `VITE_SPREADSHEET_ID` = Org2's spreadsheet
   - Domain: `org2-bidlinktracker.vercel.app`

3. **Repeat for each organization**

### Option 3: Hybrid Approach

**Best for:** Default account + user-specific accounts

**Setup:**
1. Set environment variables in Vercel (for default/fallback account)
2. Users can still upload their own credentials
3. Environment variables used only if user hasn't uploaded credentials

**Use Case:**
- Provide a default/demo account
- Allow users to override with their own credentials
- Useful for testing or shared access

## Recommended Setup for Multiple Accounts

### For Most Cases: Use Option 1 (Single Deployment)

**Why?**
- The app is already designed for this
- Users can manage their own credentials
- No server-side credential management needed
- More secure and scalable

**Deployment Steps:**
1. Deploy to Vercel (can skip environment variables)
2. Share the deployment URL with users
3. Users set up their own profiles through the UI
4. Done!

**No Environment Variables Needed:**
- Users upload credentials through the UI
- Credentials stored in browser (localStorage)
- Each API call includes credentials from browser
- API uses those credentials

## Environment Variables Reference

### If You Want a Fallback/Default Account:

Set these in Vercel (optional):

```bash
# Default service account (used only if user hasn't uploaded their own)
VITE_GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Default spreadsheet ID (used only if user hasn't set their own)
VITE_SPREADSHEET_ID=your-default-spreadsheet-id
```

### Format for VITE_GOOGLE_SERVICE_ACCOUNT_KEY:

**Single-line JSON string:**
```json
{"type":"service_account","project_id":"my-project","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n","client_email":"my-service@my-project.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/my-service%40my-project.iam.gserviceaccount.com"}
```

**Important:**
- Must be a single line
- Keep all quotes and escape characters
- Or use Vercel's "Encrypted" option

## User Guide: Setting Up Multiple Profiles

### For End Users:

1. **Sign in** to the application

2. **Go to Bidder page** → "Manage Profiles"

3. **Add First Profile:**
   - Click "+ Add New Profile"
   - Enter Profile Name (e.g., "My Personal Sheet")
   - Enter Sheet URI (full URL or just the ID)
   - Upload Service Account JSON file
   - Click "Save"

4. **Add More Profiles:**
   - Click "+ Add New Profile" again
   - Repeat for each different spreadsheet/account
   - Each profile can have different credentials

5. **Switch Between Profiles:**
   - Use the profile selector at the top
   - Or click "Set Active" on any profile card
   - The app automatically loads the correct credentials

6. **Edit/Delete Profiles:**
   - Click "Edit" to update profile details
   - Click "Delete" to remove a profile
   - Credentials are automatically managed

## Security Considerations

### User-Uploaded Credentials (Option 1):

**Pros:**
- ✅ Credentials never stored on server
- ✅ Each user manages their own credentials
- ✅ More secure (no central credential storage)
- ✅ Users can revoke access independently

**Cons:**
- ⚠️ Credentials stored in browser (localStorage)
- ⚠️ Users must manage their own credentials
- ⚠️ Credentials lost if browser data is cleared

### Environment Variables (Option 2/3):

**Pros:**
- ✅ Centralized credential management
- ✅ Credentials stored securely on Vercel
- ✅ Easier for users (no upload needed)

**Cons:**
- ⚠️ All users share same credentials
- ⚠️ Less flexible (one account per deployment)
- ⚠️ Credentials stored on server

## Best Practice Recommendation

**For multiple accounts: Use Option 1 (Single Deployment, User-Uploaded Credentials)**

1. Deploy once to Vercel
2. Don't set environment variables (or set them as optional fallback)
3. Users upload their own credentials through the UI
4. Each user can have multiple profiles
5. Scalable and secure

This approach:
- ✅ Supports unlimited accounts
- ✅ No server-side credential management
- ✅ More secure (credentials in browser)
- ✅ Easy to maintain (one deployment)
- ✅ Users have full control

## Troubleshooting

### Issue: "No credentials found" error

**Solution:**
- User needs to upload service account JSON through "Manage Profiles"
- Or set environment variables as fallback

### Issue: User wants to use different spreadsheet

**Solution:**
- Create a new profile with different spreadsheet ID
- Upload the same or different service account JSON
- Switch to the new profile

### Issue: Multiple users need separate instances

**Solution:**
- Use Option 2 (Multiple Deployments)
- Create separate Vercel projects
- Each with its own environment variables

## Summary

**For multiple accounts, you have 3 options:**

1. **Single Deployment + User Uploads** (Recommended) ✅
   - One Vercel deployment
   - No environment variables needed
   - Users upload their own credentials
   - Supports unlimited accounts

2. **Multiple Deployments**
   - One Vercel project per account
   - Each with its own environment variables
   - Completely separate instances

3. **Hybrid**
   - Environment variables for default/fallback
   - Users can still upload their own
   - Best of both worlds

**Recommendation:** Use Option 1 for most cases. It's the most flexible and scalable approach.

