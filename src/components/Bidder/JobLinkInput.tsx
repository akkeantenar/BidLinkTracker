import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getAllTabs, getJobUrlsFromTabs, batchUpdateFeedback } from '../../services/sheetsApi';
import { checkUrlDuplicate } from '../../utils/duplicateChecker';
import { ProfileManager } from './ProfileManager';
import './JobLinkInput.css';

interface LinkStatus {
  url: string;
  isDuplicate: boolean;
  duplicateInfo?: { tabName: string; position: string; sourceColumn?: 'F' | 'G'; rowIndex?: number; date?: string; no?: string };
}

interface Profile {
  id: string;
  profileName: string;
  sheetUri: string;
}

interface BidderInfo {
  bidderName: string;
  profileName: string;
  sheetUri: string;
}

const BIDDER_DATA_KEY = 'bidlinktracker_bidder_data';

// Helper to extract spreadsheet ID from URI (handles both full URLs and IDs)
const extractSpreadsheetId = (uri: string): string => {
  try {
    const url = new URL(uri);
    const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Not a URL, assume it's already an ID
  }
  return uri.trim();
};

export function JobLinkInput() {
  const { user } = useAuth();
  const [bidderInfo, setBidderInfo] = useState<BidderInfo | null>(null);
  const [jobLinks, setJobLinks] = useState('');
  const [linkStatuses, setLinkStatuses] = useState<LinkStatus[]>([]);
  const [existingUrls, setExistingUrls] = useState<Array<{ url: string; tabName: string; position: string; sourceColumn?: 'F' | 'G'; rowIndex?: number; date?: string; no?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<string | null>(null);
  const isInitialLoad = useRef(true);
  const cacheRef = useRef<{
    spreadsheetId: string;
    profileName: string;
    last4Tabs: string[];
    urls: Array<{ url: string; tabName: string; position: string; sourceColumn?: 'F' | 'G'; rowIndex?: number; date?: string; no?: string }>;
    timestamp: number;
  } | null>(null);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Load bidder info on mount (only once)
  useEffect(() => {
    if (isInitialLoad.current && user?.email || user?.name) {
      isInitialLoad.current = false;
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.bidderName && data.profiles && data.profiles.length > 0) {
            const activeProfileId = data.activeProfileId || data.profiles[0].id;
            const profile = data.profiles.find((p: Profile) => p.id === activeProfileId) || data.profiles[0];
            
            setBidderInfo({
              bidderName: data.bidderName,
              profileName: profile.profileName,
              sheetUri: profile.sheetUri,
            });
            
            // Set up session storage with spreadsheet ID (extract ID if it's a full URL)
            const spreadsheetId = extractSpreadsheetId(profile.sheetUri);
            sessionStorage.setItem('bidlinktracker_spreadsheet_id', spreadsheetId);
            
            // Load credentials
            const credentialsKey = `bidlinktracker_profile_credentials_${profile.id}`;
            const credentials = localStorage.getItem(credentialsKey);
            if (credentials) {
              try {
                const creds = JSON.parse(credentials);
                console.log(`[JobLinkInput] Loading credentials for profile "${profile.profileName}"`);
                console.log(`[JobLinkInput] Has credentials: ${!!creds && !!creds.client_email}`);
                sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(creds));
              } catch (error) {
                console.error('Error loading credentials:', error);
              }
            } else {
              console.warn(`[JobLinkInput] ⚠️ No credentials found for profile "${profile.profileName}" (key: ${credentialsKey})`);
              console.warn('[JobLinkInput] Please make sure you have uploaded the service account JSON file for this profile.');
            }
            
            // Clear cache for new profile
            cacheRef.current = null;
          }
        } catch (error) {
          console.error('Error loading bidder info:', error);
        }
      }
    }
  }, [user]);

  const handleProfileSelected = () => {
    // Reload bidder info after profile is selected
    if (user?.email || user?.name) {
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.bidderName && data.profiles && data.profiles.length > 0) {
            const activeProfileId = data.activeProfileId || data.profiles[0].id;
            const profile = data.profiles.find((p: Profile) => p.id === activeProfileId) || data.profiles[0];
            
            setBidderInfo({
              bidderName: data.bidderName,
              profileName: profile.profileName,
              sheetUri: profile.sheetUri,
            });
            
            // Load credentials
            const credentialsKey = `bidlinktracker_profile_credentials_${profile.id}`;
            const credentials = localStorage.getItem(credentialsKey);
            if (credentials) {
              try {
                const creds = JSON.parse(credentials);
                sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(creds));
                const spreadsheetId = extractSpreadsheetId(profile.sheetUri);
                sessionStorage.setItem('bidlinktracker_spreadsheet_id', spreadsheetId);
              } catch (error) {
                console.error('Error loading credentials:', error);
              }
            }
            
            // Clear cache for new profile
            cacheRef.current = null;
            setExistingUrls([]);
            setLinkStatuses([]);
            setJobLinks('');
          }
        } catch (error) {
          console.error('Error loading bidder info:', error);
        }
      }
    }
  };



  // Load existing URLs from last 4 tabs (with caching)
  const loadExistingData = useCallback(async (forceRefresh = false): Promise<Array<{ url: string; tabName: string; position: string; sourceColumn?: 'F' | 'G'; rowIndex?: number; date?: string; no?: string }> | undefined> => {
    if (!bidderInfo) {
      setError('Please complete the setup form first');
      return undefined;
    }

    // Check cache first
    const now = Date.now();
    const spreadsheetId = extractSpreadsheetId(bidderInfo.sheetUri);
    if (!forceRefresh && cacheRef.current) {
      const cache = cacheRef.current;
      if (
        cache.spreadsheetId === spreadsheetId &&
        cache.profileName === bidderInfo.profileName &&
        (now - cache.timestamp) < CACHE_TTL
      ) {
        // Cache is valid, use it
        console.log('Using cached URLs:', cache.urls.length, 'URLs');
        setExistingUrls(cache.urls);
        return cache.urls;
      } else {
        console.log('Cache invalid or expired, refreshing...', {
          cacheSpreadsheetId: cache.spreadsheetId,
          currentSpreadsheetId: spreadsheetId,
          cacheProfileName: cache.profileName,
          currentProfileName: bidderInfo.profileName,
          cacheAge: now - cache.timestamp,
          cacheTTL: CACHE_TTL,
        });
      }
    } else {
      console.log('No cache available, loading fresh data...');
    }

    setLoading(true);
    setError(null);

    try {
      // Get all tabs
      const allTabs = await getAllTabs();
      console.log('All tabs in spreadsheet:', allTabs);
      console.log('Total number of tabs:', allTabs.length);
      
      if (allTabs.length === 0) {
        throw new Error('No tabs found in spreadsheet. Please check the spreadsheet ID and permissions.');
      }
      
      // Get last 4 tabs (or all tabs if fewer than 4)
      const last4Tabs = allTabs.length >= 4 ? allTabs.slice(-4) : allTabs;
      console.log('Tabs to check for URLs:', last4Tabs);
      console.log('Number of tabs to check:', last4Tabs.length);
      
      // Use optimized API to fetch only from last 4 tabs (parallel requests)
      const allUrls = await getJobUrlsFromTabs(last4Tabs);
      console.log(`Fetched ${allUrls.length} URLs from ${last4Tabs.length} tab(s):`, last4Tabs);
      
      if (allUrls.length === 0) {
        console.warn('⚠️ No URLs found in checked tabs. Debugging info:');
        console.warn('Spreadsheet ID:', spreadsheetId);
        console.warn('Tabs checked:', last4Tabs);
        console.warn('Total tabs in spreadsheet:', allTabs.length);
        console.warn('Possible reasons:');
        console.warn('1. The tabs are empty or have no data rows');
        console.warn('2. URLs are not in Column F (Job Url) or Column G (Applied Url)');
        console.warn('3. The spreadsheet structure might be different than expected');
        console.warn('4. Credentials might not have read access to these tabs');
        
        // If no URLs found in last 4 tabs, try checking all tabs to see if data exists elsewhere
        if (allTabs.length > 4) {
          console.log('Attempting to check all tabs to see if data exists...');
          const allTabsUrls = await getJobUrlsFromTabs(allTabs);
          console.log(`Found ${allTabsUrls.length} URLs across ALL tabs`);
          if (allTabsUrls.length > 0) {
            console.warn('⚠️ URLs exist in other tabs, but not in the last 4 tabs. Consider checking earlier tabs.');
          }
        }
      }
      
      // Map to the format we need (include sourceColumn and other metadata)
      const formattedUrls = allUrls.map(u => ({ 
        url: u.url, 
        tabName: u.tabName, 
        position: u.position,
        sourceColumn: u.sourceColumn,
        rowIndex: u.rowIndex,
        date: u.date,
        no: u.no,
      }));
      
      // Debug: Log sample URLs to verify they're being loaded
      if (formattedUrls.length > 0) {
        console.log('Sample existing URLs (first 5):', formattedUrls.slice(0, 5).map(u => u.url));
      } else {
        console.log('No URLs found in formatted data');
      }
      
      // Update cache (use extracted spreadsheet ID)
      cacheRef.current = {
        spreadsheetId: spreadsheetId,
        profileName: bidderInfo.profileName,
        last4Tabs,
        urls: formattedUrls,
        timestamp: now,
      };
      
      setExistingUrls(formattedUrls);
      
      // Return the URLs so caller knows if data was loaded
      return formattedUrls;
    } catch (err: any) {
      console.error('Error loading existing data:', err);
      const errorMessage = err.message || 'Failed to load data from spreadsheet. Please check your settings.';
      setError(errorMessage);
      // Return empty array on error so caller can handle it
      return [];
    } finally {
      setLoading(false);
    }
  }, [bidderInfo, CACHE_TTL]);

  // Check duplicates when user clicks check button
  const handleCheckDuplicates = async () => {
    if (!bidderInfo) {
      setError('Please complete the setup form first');
      return;
    }

    if (!jobLinks.trim()) {
      setError('Please enter at least one job link');
      return;
    }

    setChecking(true);
    setError(null);

    try {
      // Load existing URLs from last 4 tabs (will use cache if available)
      const loadedUrls = await loadExistingData();
      
      // Use cached URLs if available, otherwise use loaded URLs or state
      let urlsToCheck = cacheRef.current?.urls || loadedUrls || existingUrls;
      
      // If still empty, wait a moment for state to update (in case cache wasn't used)
      if (!urlsToCheck || urlsToCheck.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        urlsToCheck = cacheRef.current?.urls || existingUrls;
      }

      // Parse input links
      const links = jobLinks
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (links.length === 0) {
        setError('Please enter at least one valid job link');
        setChecking(false);
        return;
      }
      
      if (!urlsToCheck || urlsToCheck.length === 0) {
        const spreadsheetId = extractSpreadsheetId(bidderInfo.sheetUri);
        const credentials = sessionStorage.getItem('bidlinktracker_service_account');
        const hasCredentials = !!credentials;
        
        let errorMsg = `No existing URLs found in the last 4 tabs of spreadsheet "${spreadsheetId}".\n\n`;
        errorMsg += `Diagnostics:\n`;
        errorMsg += `- Credentials loaded: ${hasCredentials ? '✓ Yes' : '✗ No'}\n`;
        errorMsg += `- Spreadsheet ID: ${spreadsheetId}\n\n`;
        errorMsg += `Please verify:\n`;
        errorMsg += `1) Your credentials have access to this spreadsheet\n`;
        errorMsg += `2) There are URLs in Column F (Job Url) or Column G (Applied Url) in the last 4 tabs\n`;
        errorMsg += `3) The spreadsheet ID is correct\n\n`;
        errorMsg += `Click "Test Connection" below to get detailed information.`;
        
        setError(errorMsg);
        setChecking(false);
        return;
      }
      
      // Debug logging
      console.log('Checking duplicates with:', {
        totalLinksToCheck: links.length,
        existingUrlsCount: urlsToCheck.length,
        cacheAvailable: !!cacheRef.current,
        sampleExistingUrls: urlsToCheck.slice(0, 5).map(u => u.url),
        inputLinks: links,
        spreadsheetId: bidderInfo.sheetUri,
        profileName: bidderInfo.profileName,
      });

      // Check each link for duplicates
      const statuses: LinkStatus[] = links.map(url => {
        const duplicateCheck = checkUrlDuplicate(url, urlsToCheck);
        console.log(`Checking ${url}:`, {
          isDuplicate: duplicateCheck.isDuplicate,
          duplicateInfo: duplicateCheck.duplicateInfo,
        });
        return {
          url,
          isDuplicate: duplicateCheck.isDuplicate,
          duplicateInfo: duplicateCheck.duplicateInfo,
        };
      });

      console.log('Duplicate check results:', statuses);
      setLinkStatuses(statuses);

      // Auto-write feedback for all duplicates (both Job URLs and Applied URLs)
      const duplicatesToMark = statuses.filter(s => 
        s.isDuplicate && 
        s.duplicateInfo?.sourceColumn &&
        s.duplicateInfo?.rowIndex &&
        s.duplicateInfo?.tabName
      );

      if (duplicatesToMark.length > 0) {
        const appliedUrlCount = duplicatesToMark.filter(s => s.duplicateInfo?.sourceColumn === 'G').length;
        const jobUrlCount = duplicatesToMark.filter(s => s.duplicateInfo?.sourceColumn === 'F').length;
        
        console.log(`Found ${duplicatesToMark.length} duplicate(s): ${appliedUrlCount} Applied URL(s), ${jobUrlCount} Job URL(s). Writing feedback...`);
        
        const feedbackUpdates = duplicatesToMark.map(status => {
          const info = status.duplicateInfo!;
          const sourceType = info.sourceColumn === 'G' ? 'Applied Url' : 'Job Url';
          // Format: "Duplicated of Sheet - [Date] in [Tab Name] Tab- No.[No] - [Position] - [Applied Url/Job Url]"
          const feedback = `Duplicated of Sheet - ${info.date || 'N/A'} in [${info.tabName}] Tab- No.${info.no || 'N/A'} - ${info.position || 'N/A'} - ${sourceType}`;
          
          return {
            tabName: info.tabName,
            rowIndex: info.rowIndex!,
            feedback,
            sourceColumn: info.sourceColumn,
          };
        });

        try {
          await batchUpdateFeedback(feedbackUpdates);
          console.log(`Successfully wrote feedback for ${feedbackUpdates.length} duplicate(s)`);
          // Show success message
          const successMsg = `✓ Found ${duplicatesToMark.length} duplicate(s) (${appliedUrlCount} Applied URL(s), ${jobUrlCount} Job URL(s)). Feedback has been automatically written to Column I.`;
          setSuccess(successMsg);
          // Clear success message after 5 seconds
          setTimeout(() => setSuccess(null), 5000);
        } catch (feedbackError: any) {
          console.error('Error writing feedback for duplicates:', feedbackError);
          // Don't fail the entire duplicate check if feedback writing fails
          const errorMsg = feedbackError.partial 
            ? `Duplicate check completed. However, some feedback could not be written: ${feedbackError.message}`
            : `Duplicate check completed. However, feedback could not be written: ${feedbackError.message}`;
          setError(errorMsg);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check duplicates');
      console.error('Error checking duplicates:', err);
    } finally {
      setChecking(false);
    }
  };

  // Calculate counts
  const totalCount = linkStatuses.length;
  const availableCount = linkStatuses.filter(s => !s.isDuplicate).length;
  const duplicateCount = linkStatuses.filter(s => s.isDuplicate).length;

  // Get available (non-duplicated) links
  const availableLinks = linkStatuses.filter(s => !s.isDuplicate);
  // Get duplicated links
  const duplicatedLinks = linkStatuses.filter(s => s.isDuplicate);

  // Test connection and show detailed diagnostics
  const handleTestConnection = async () => {
    if (!bidderInfo) {
      setError('Please complete the setup form first');
      return;
    }

    setTestingConnection(true);
    setError(null);
    setConnectionTestResult(null);

    try {
      const spreadsheetId = extractSpreadsheetId(bidderInfo.sheetUri);
      const credentials = sessionStorage.getItem('bidlinktracker_service_account');
      
      let result = `=== Connection Test Results ===\n\n`;
      result += `Spreadsheet ID: ${spreadsheetId}\n`;
      result += `Profile: ${bidderInfo.profileName}\n`;
      result += `Credentials: ${credentials ? '✓ Loaded' : '✗ Missing'}\n\n`;

      if (!credentials) {
        result += `❌ ERROR: No credentials found in session storage.\n`;
        result += `Please make sure you have uploaded the service account JSON file for this profile.\n`;
        setConnectionTestResult(result);
        setTestingConnection(false);
        return;
      }

      // Test getting all tabs
      result += `Testing API connection...\n`;
      const allTabs = await getAllTabs();
      result += `✓ Successfully connected to spreadsheet\n`;
      result += `Total tabs found: ${allTabs.length}\n`;
      result += `Tab names: ${allTabs.join(', ')}\n\n`;

      if (allTabs.length === 0) {
        result += `❌ ERROR: No tabs found in spreadsheet.\n`;
        setConnectionTestResult(result);
        setTestingConnection(false);
        return;
      }

      // Get last 4 tabs
      const last4Tabs = allTabs.length >= 4 ? allTabs.slice(-4) : allTabs;
      result += `Checking last ${last4Tabs.length} tab(s): ${last4Tabs.join(', ')}\n\n`;

      // Test getting URLs from each tab
      let totalUrls = 0;
      for (const tabName of last4Tabs) {
        try {
          const tabUrls = await getJobUrlsFromTabs([tabName]);
          const count = tabUrls.length;
          totalUrls += count;
          result += `Tab "${tabName}": ${count} URL(s) found\n`;
          
          if (count > 0) {
            result += `  Sample URLs:\n`;
            tabUrls.slice(0, 3).forEach((u, i) => {
              result += `    ${i + 1}. ${u.url.substring(0, 60)}${u.url.length > 60 ? '...' : ''}\n`;
            });
          } else {
            result += `  ⚠️ No URLs found in Columns F or G\n`;
          }
          result += `\n`;
        } catch (err: any) {
          result += `Tab "${tabName}": ❌ ERROR - ${err.message}\n\n`;
        }
      }

      result += `=== Summary ===\n`;
      result += `Total URLs in last ${last4Tabs.length} tab(s): ${totalUrls}\n\n`;

      if (totalUrls === 0) {
        result += `❌ No URLs found. Possible reasons:\n`;
        result += `1. The last ${last4Tabs.length} tab(s) are empty\n`;
        result += `2. URLs are not in Column F (Job Url) or Column G (Applied Url)\n`;
        result += `3. The data rows don't have URLs in those columns\n\n`;
        
        // Check all tabs
        result += `Checking ALL tabs for URLs...\n`;
        const allTabsUrls = await getJobUrlsFromTabs(allTabs);
        result += `Total URLs across ALL tabs: ${allTabsUrls.length}\n`;
        
        if (allTabsUrls.length > 0) {
          result += `\n⚠️ URLs exist in other tabs, but not in the last ${last4Tabs.length} tab(s).\n`;
          result += `Consider using tabs that contain data.\n`;
        }
      } else {
        result += `✓ Connection successful! URLs are available for duplicate checking.\n`;
      }

      setConnectionTestResult(result);
    } catch (err: any) {
      let errorMsg = `❌ Connection Test Failed\n\n`;
      errorMsg += `Error: ${err.message}\n\n`;
      errorMsg += `Possible issues:\n`;
      errorMsg += `1. Credentials are invalid or expired\n`;
      errorMsg += `2. Credentials don't have access to this spreadsheet\n`;
      errorMsg += `3. Spreadsheet ID is incorrect\n`;
      errorMsg += `4. Network connection issue\n`;
      errorMsg += `5. API server is not running\n\n`;
      errorMsg += `Check the browser console for more details.`;
      
      setConnectionTestResult(errorMsg);
      console.error('Connection test error:', err);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCopyUrl = async (url: string, index: number | string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // Show profile manager if no profiles exist
  if (!bidderInfo) {
    return <ProfileManager onProfileSelected={handleProfileSelected} />;
  }

  return (
    <div className="job-link-input">
      {/* Profile Manager Section - Always visible at top */}
      <div className="profile-section">
        <ProfileManager onProfileSelected={handleProfileSelected} embedded={true} />
      </div>

      <div className="input-header">
        <h2>Check Duplicate Job Links</h2>
        <p>Enter job links to check for duplicates against the last 4 tabs from the spreadsheet</p>
        {bidderInfo && (
          <div className="bidder-info-display">
            <div className="bidder-info-content">
              <p><strong>Active Profile:</strong> {bidderInfo.profileName}</p>
              <p><strong>Spreadsheet ID:</strong> {bidderInfo.sheetUri.substring(0, 40)}...</p>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="message info">
          Loading data from spreadsheet...
        </div>
      )}

      <div className="job-link-form">
        <div className="form-group">
          <label htmlFor="jobLinks">Job Links (one per line)</label>
          <textarea
            id="jobLinks"
            name="jobLinks"
            value={jobLinks}
            onChange={(e) => {
              const newValue = e.target.value;
              console.log('Textarea value changed:', newValue);
              setJobLinks(newValue);
              // Clear statuses when input changes
              if (linkStatuses.length > 0) {
                setLinkStatuses([]);
              }
            }}
            onFocus={(e) => {
              console.log('Textarea focused, disabled:', e.target.disabled, 'loading:', loading, 'checking:', checking);
            }}
            placeholder="https://example.com/job1&#10;https://example.com/job2&#10;https://example.com/job3"
            rows={10}
            disabled={loading || checking}
            autoComplete="off"
            spellCheck={false}
            data-testid="job-links-textarea"
          />
          <small>Enter one job URL per line</small>
          {(loading || checking) && (
            <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
              {loading ? 'Loading...' : checking ? 'Checking duplicates...' : ''}
            </small>
          )}
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
            Debug: loading={String(loading)}, checking={String(checking)}, disabled={String(loading || checking)}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckDuplicates}
          disabled={loading || checking || !jobLinks.trim()}
          className="check-button"
        >
          {checking ? 'Checking...' : 'Check for Duplicates'}
        </button>

        {success && (
          <div className="message success" style={{ whiteSpace: 'pre-line', backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
            {success}
          </div>
        )}
      {error && (
          <div className="message error" style={{ whiteSpace: 'pre-line' }}>
            {error}
            {error.includes('Test Connection') && (
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="check-button"
                  style={{ marginTop: '8px' }}
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            )}
          </div>
        )}

        {connectionTestResult && (
          <div className="message info" style={{ whiteSpace: 'pre-line', fontFamily: 'monospace', fontSize: '13px', maxHeight: '400px', overflow: 'auto' }}>
            {connectionTestResult}
            <button
              type="button"
              onClick={() => setConnectionTestResult(null)}
              style={{ marginTop: '12px', padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        )}

        {!error && !connectionTestResult && (
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection || !bidderInfo}
            className="check-button"
            style={{ background: '#48bb78', marginBottom: '16px' }}
          >
            {testingConnection ? 'Testing Connection...' : 'Test Connection & Verify Spreadsheet'}
          </button>
        )}

        {/* Counts Display */}
        {linkStatuses.length > 0 && (
          <div className="counts-display">
            <div className="count-item">
              <span className="count-label">Total Links:</span>
              <span className="count-value total">{totalCount}</span>
            </div>
            <div className="count-item">
              <span className="count-label">Available Links:</span>
              <span className="count-value available">{availableCount}</span>
            </div>
            <div className="count-item">
              <span className="count-label">Duplicated Links:</span>
              <span className="count-value duplicate">{duplicateCount}</span>
            </div>
          </div>
        )}

        {/* Show duplicated links */}
        {duplicatedLinks.length > 0 && (
          <div className="duplicated-links-section">
            <h3>Duplicated Links ({duplicateCount})</h3>
            <div className="duplicated-links-list">
              {duplicatedLinks.map((status, index) => (
                <div key={`dup-${index}`} className="duplicated-link-item">
                  <span className="link-icon">⚠</span>
                  <div className="link-content">
                    <div className="link-url">{status.url}</div>
                    {status.duplicateInfo && (
                      <div className="duplicate-info">
                        <span className="duplicate-label">Found in:</span>
                        <span className="duplicate-details">
                          {status.duplicateInfo.tabName} - {status.duplicateInfo.position}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(status.url, `dup-${index}`)}
                    className="copy-button"
                    title="Copy URL"
                  >
                    {copiedIndex === `dup-${index}` ? '✓ Copied' : 'Copy'}
                  </button>
                  <span className="link-status-badge duplicate">Duplicate</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Show available (non-duplicated) links */}
        {availableLinks.length > 0 && (
          <div className="available-links-section">
            <h3>Non-Duplicated Links ({availableCount})</h3>
            <div className="available-links-list">
              {availableLinks.map((status, index) => (
                <div key={index} className="available-link-item">
                  <span className="link-icon">✓</span>
                  <div className="link-url">{status.url}</div>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(status.url, index)}
                    className="copy-button"
                    title="Copy URL"
                  >
                    {copiedIndex === index ? '✓ Copied' : 'Copy'}
                  </button>
                  <span className="link-status-badge available">Available</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
