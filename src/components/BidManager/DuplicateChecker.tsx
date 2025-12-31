import { useState, useEffect } from 'react';
import { getAllJobUrls, batchUpdateFeedback, getAllTabs } from '../../services/sheetsApi';
import { findDuplicates } from '../../utils/duplicateChecker';
import { DuplicateInfo } from '../../types';
import { AccountManager } from './AccountManager';
import './DuplicateChecker.css';

export function DuplicateChecker() {
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<Map<string, DuplicateInfo[]>>(new Map());
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasActiveAccount, setHasActiveAccount] = useState(false);
  const [activeAccountName, setActiveAccountName] = useState<string | null>(null);
  const [tabCount, setTabCount] = useState<number | 'all'>('all');
  const [checkedTabs, setCheckedTabs] = useState<string[]>([]);
  const [totalUrls, setTotalUrls] = useState<number>(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const checkActiveAccount = () => {
    const activeId = localStorage.getItem('bidlinktracker_active_account');
    const accounts = localStorage.getItem('bidlinktracker_accounts');
    if (activeId && accounts) {
      try {
        const accountsList = JSON.parse(accounts);
        const activeAccount = accountsList.find((a: any) => a.id === activeId);
        setHasActiveAccount(!!activeAccount);
        setActiveAccountName(activeAccount ? activeAccount.name : null);
      } catch (error) {
        setHasActiveAccount(false);
        setActiveAccountName(null);
      }
    } else {
      setHasActiveAccount(false);
      setActiveAccountName(null);
    }
  };

  useEffect(() => {
    checkActiveAccount();

    // Poll for changes (since localStorage changes in same tab don't trigger storage events)
    const interval = setInterval(checkActiveAccount, 1000);

    // Also listen for custom events
    const handleAccountChange = () => {
      checkActiveAccount();
    };

    window.addEventListener('accountUpdated', handleAccountChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('accountUpdated', handleAccountChange);
    };
  }, []);

  const handleCheckDuplicates = async () => {
    // Check if there's an active account
    if (!hasActiveAccount) {
      setError('Please add and activate an account first');
      return;
    }

      setLoading(true);
      setError(null);
      setSuccess(null);
      setDuplicates(new Map());
      setTotalUrls(0);

    try {
      // Get all tabs first
      const allTabs = await getAllTabs();
      
      // Get tabs based on selected tab count (or all tabs)
      const tabsToCheck = tabCount === 'all' ? allTabs : allTabs.slice(-tabCount);
      
      // Store the checked tabs so we can filter when marking
      setCheckedTabs(tabsToCheck);
      
      console.log(`Total tabs available: ${allTabs.length}`);
      console.log(`Checking duplicates in ${tabCount === 'all' ? 'ALL' : `last ${tabCount}`} tabs:`, tabsToCheck);
      console.log(`Tab names: ${tabsToCheck.join(', ')}`);
      
      // Get all URLs from all tabs
      const allUrls = await getAllJobUrls();
      
      // Filter to only include URLs from the selected tabs
      const filteredUrls = allUrls.filter(url => tabsToCheck.includes(url.tabName));
      
      console.log(`Found ${filteredUrls.length} URLs in ${tabCount === 'all' ? 'ALL' : `last ${tabCount}`} tabs (out of ${allUrls.length} total)`);
      
      // Verify which tabs actually have URLs
      const tabsWithUrls = new Set(filteredUrls.map(url => url.tabName));
      console.log(`Tabs with URLs:`, Array.from(tabsWithUrls));
      
      const duplicateMap = findDuplicates(filteredUrls);
      
      // Store total URLs checked
      setTotalUrls(filteredUrls.length);
      
      // Debug: Log first few entries to verify company name is present
      if (filteredUrls.length > 0) {
        console.log('Sample URL entries (first 3):', filteredUrls.slice(0, 3).map(u => ({
          url: u.url.substring(0, 50),
          companyName: u.companyName,
          tabName: u.tabName,
          rowIndex: u.rowIndex
        })));
      }
      
      // Debug: Check if duplicates have company name
      if (duplicateMap.size > 0) {
        const firstDuplicate = Array.from(duplicateMap.values())[0];
        console.log('First duplicate group entries:', firstDuplicate.map(e => ({
          tabName: e.tabName,
          rowIndex: e.rowIndex,
          companyName: e.companyName,
          hasCompanyName: !!e.companyName
        })));
      }
      
      setDuplicates(duplicateMap);
      
      // Calculate and log the count for debugging
      let calculatedCount = 0;
      for (const [, entries] of duplicateMap.entries()) {
        if (entries.length > 1) {
          calculatedCount += entries.length - 1;
        }
      }
      console.log(`Found ${duplicateMap.size} duplicate groups, ${calculatedCount} total duplicate entries`);
      
      if (duplicateMap.size === 0) {
        setSuccess(`No duplicates found in ${tabCount === 'all' ? 'all' : `the last ${tabCount}`} tabs!`);
      } else {
        setSuccess(`Checked ${tabCount === 'all' ? 'all' : `last ${tabCount}`} tabs: ${tabsToCheck.length} tabs`);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to check duplicates';
      setError(errorMessage);
      console.error('Error checking duplicates:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        hasActiveAccount,
        activeAccountName,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDuplicates = async () => {
    if (duplicates.size === 0) return;

    // Check if there's an active account
    if (!hasActiveAccount) {
      setError('Please add and activate an account first');
      return;
    }

    // Ensure we have checked tabs
    if (checkedTabs.length === 0) {
      setError('No tabs selected. Please check for duplicates first.');
      return;
    }

    setUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const updates: Array<{ tabName: string; rowIndex: number; feedback: string }> = [];
      const tabsToMark = new Set<string>();

      for (const [, entries] of duplicates.entries()) {
        // First entry (index 0) is the original/first occurrence
        const firstEntry = entries[0];
        const firstDate = firstEntry.date || 'N/A';
        const firstTabName = firstEntry.tabName || 'N/A';
        const firstNo = firstEntry.no || 'N/A';
        const firstPosition = firstEntry.position || 'N/A';
        
        // Mark all entries after the first as duplicates
        // Only mark entries that are in the checked tabs
        for (let i = 1; i < entries.length; i++) {
          const entry = entries[i];
          
          // Only mark if this entry is in one of the checked tabs
          if (checkedTabs.includes(entry.tabName)) {
            // Determine source type based on the duplicate entry's sourceColumn
            const sourceType = entry.sourceColumn === 'G' ? 'Applied Url' : 'Job Url';
            // Format: "Duplicated of Sheet - [Date] in [Tab Name] Tab- No.[No] - [Position] - [Applied Url/Job Url]"
            const feedback = `Duplicated of Sheet - ${firstDate} in [${firstTabName}] Tab- No.${firstNo} - ${firstPosition} - ${sourceType}`;
            
            updates.push({
              tabName: entry.tabName,
              rowIndex: entry.rowIndex,
              feedback,
              sourceColumn: entry.sourceColumn,
            });
            tabsToMark.add(entry.tabName);
          }
        }
      }

      // Verify the count matches
      console.log(`Marking ${updates.length} duplicate entries from ${duplicates.size} duplicate groups`);
      console.log(`Tabs that will be marked:`, Array.from(tabsToMark));

      if (updates.length > 0) {
        try {
          const result: any = await batchUpdateFeedback(updates);
          const skipped = result?.skipped || 0;
          const updated = result?.updated || updates.length;
          const tabsList = Array.from(tabsToMark).join(', ');
          let successMsg = `Successfully marked ${updated} duplicate(s) in tabs: ${tabsList}`;
          if (skipped > 0) {
            successMsg += `. ${skipped} skipped (already marked as duplicate with Job Url)`;
          }
          setSuccess(successMsg);
          // Clear duplicates after successful update
          setDuplicates(new Map());
          setCheckedTabs([]);
          setTotalUrls(0);
        } catch (err: any) {
          // Check if it's a partial success (some cells protected)
          if (err.partial) {
            const tabsList = Array.from(tabsToMark).join(', ');
            const successMsg = `Partially completed: ${err.successful} of ${updates.length} duplicates marked in tabs: ${tabsList}`;
            const errorMsg = 
              `Some cells are protected and could not be updated.\n\n` +
              `Successfully updated: ${err.successful}\n` +
              `Failed (protected): ${err.failed}\n\n` +
              `To fix this:\n` +
              `1. Open the Google Spreadsheet\n` +
              `2. Go to Data > Protect sheets and ranges\n` +
              `3. Remove protection from Columns H (Approved) and I (Feedback)\n` +
              `4. Or share the spreadsheet with edit permissions for your service account email`;
            
            setSuccess(successMsg);
            setError(errorMsg);
            // Don't clear duplicates if partial - user might want to retry after fixing protection
          } else {
            throw err; // Re-throw other errors
          }
        }
      } else {
        setError('No duplicates to mark in the selected tabs.');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to mark duplicates';
      
      // Check for protected cell errors
      if (errorMessage.includes('protected') || errorMessage.includes('Protected')) {
        setError(
          'Some cells are protected and cannot be edited.\n\n' +
          'To fix this:\n' +
          '1. Open the Google Spreadsheet\n' +
          '2. Go to Data > Protect sheets and ranges\n' +
          '3. Remove protection from Columns H (Approved) and I (Feedback)\n' +
          '4. Or share the spreadsheet with edit permissions for your service account email'
        );
      } else {
        setError(errorMessage);
      }
      console.error('Error marking duplicates:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Separate duplicates into Job Url and Applied Url groups
  const jobUrlDuplicateGroups = new Map<string, DuplicateInfo[]>();
  const appliedUrlDuplicateGroups = new Map<string, DuplicateInfo[]>();
  
  for (const [normalizedUrl, entries] of duplicates.entries()) {
    // Filter entries by source column
    const jobUrlEntries = entries.filter(e => e.sourceColumn === 'F' || !e.sourceColumn);
    const appliedUrlEntries = entries.filter(e => e.sourceColumn === 'G');
    
    // Only add to groups if there are duplicates (more than 1 entry)
    if (jobUrlEntries.length > 1) {
      // Create a unique key for job URL group
      const jobKey = `job-${normalizedUrl}`;
      jobUrlDuplicateGroups.set(jobKey, jobUrlEntries);
    }
    
    if (appliedUrlEntries.length > 1) {
      // Create a unique key for applied URL group
      const appliedKey = `applied-${normalizedUrl}`;
      appliedUrlDuplicateGroups.set(appliedKey, appliedUrlEntries);
    }
  }
  
  // Calculate counts for each type
  let jobUrlDuplicateCount = 0;
  let appliedUrlDuplicateCount = 0;
  
  for (const [, entries] of jobUrlDuplicateGroups.entries()) {
    if (entries.length > 1) {
      jobUrlDuplicateCount += entries.length - 1;
    }
  }
  
  for (const [, entries] of appliedUrlDuplicateGroups.entries()) {
    if (entries.length > 1) {
      appliedUrlDuplicateCount += entries.length - 1;
    }
  }

  // Calculate total duplicates
  const totalDuplicates = jobUrlDuplicateCount + appliedUrlDuplicateCount;

  // Calculate available (non-duplicated) links
  // Available links = Total URLs - Duplicate entries (excluding originals)
  // Each duplicate group has 1 original + N duplicates, so available = total - duplicates
  const availableLinks = totalUrls - totalDuplicates;

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  return (
    <div className="duplicate-checker">
      <AccountManager />
      
      <div className="checker-header">
        <h2>Duplicate Job Link Checker</h2>
        <p>Check for duplicate job URLs in the last N tabs (most recently created)</p>
        {hasActiveAccount && activeAccountName && (
          <p className="active-account-info">Active Account: <strong>{activeAccountName}</strong></p>
        )}
      </div>

      {!hasActiveAccount && (
        <div className="message warning">
          Please add and activate an account to check for duplicates.
        </div>
      )}

      <div className="tab-count-selector">
        <label htmlFor="tabCount">Number of tabs to check:</label>
        <select
          id="tabCount"
          value={tabCount}
          onChange={(e) => {
            const value = e.target.value;
            setTabCount(value === 'all' ? 'all' : Number(value));
            // Clear duplicates and checked tabs when tab count changes
            setDuplicates(new Map());
            setCheckedTabs([]);
            setTotalUrls(0);
            setSuccess(null);
            setError(null);
          }}
          disabled={loading || !hasActiveAccount}
          className="tab-count-select"
        >
          <option value="all">All tabs</option>
          <option value={4}>4 tabs</option>
          <option value={6}>6 tabs</option>
          <option value={8}>8 tabs</option>
          <option value={12}>12 tabs</option>
          <option value={16}>16 tabs</option>
        </select>
      </div>

      <div className="checker-actions">
        <button
          onClick={handleCheckDuplicates}
          disabled={loading || !hasActiveAccount}
          className="check-button"
        >
          {loading ? 'Checking...' : 'Check for Duplicates'}
        </button>

        {duplicates.size > 0 && (
          <>
            <button
              onClick={handleMarkDuplicates}
              disabled={updating}
              className="mark-button"
            >
              {updating ? 'Updating...' : `Mark ${totalDuplicates} Duplicate(s)`}
            </button>
            {checkedTabs.length > 0 && (
              <div className="tabs-to-mark-info">
                <span className="info-label">Will mark duplicates in:</span>
                <span className="info-tabs">{checkedTabs.join(', ')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="message error">
          {error}
        </div>
      )}

      {success && (
        <div className="message success">
          {success}
        </div>
      )}

      {/* Summary Statistics */}
      {totalUrls > 0 && (
        <div className="summary-stats">
          <div className="stat-item">
            <span className="stat-label">Total Links:</span>
            <span className="stat-value total">{totalUrls}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Available Links:</span>
            <span className="stat-value available">{availableLinks}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Duplicated Links:</span>
            <span className="stat-value duplicate">{totalDuplicates}</span>
          </div>
          {totalDuplicates > 0 && (
            <>
              <div className="stat-item">
                <span className="stat-label">Job Url Duplicates:</span>
                <span className="stat-value duplicate">{jobUrlDuplicateCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Applied Url Duplicates:</span>
                <span className="stat-value duplicate">{appliedUrlDuplicateCount}</span>
              </div>
            </>
          )}
        </div>
      )}

      {duplicates.size > 0 && (
        <div className="duplicates-results">
          <h3>Found {duplicates.size} duplicate URL group(s) ({totalDuplicates} duplicate entries to mark)</h3>
          
          {/* Job Url Duplicates Section */}
          {jobUrlDuplicateGroups.size > 0 && (
            <div className="duplicate-section">
              <h4 className="section-title">Job Url Duplicates (Column F) - {jobUrlDuplicateCount} duplicate(s)</h4>
              <div className="duplicates-list">
                {Array.from(jobUrlDuplicateGroups.entries()).map(([normalizedUrl, entries]) => (
                  <div key={`job-${normalizedUrl}`} className="duplicate-group">
                    <div className="duplicate-url">
                      <strong>URL:</strong> {entries[0].url}
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(entries[0].url)}
                        className="copy-button"
                        title="Copy URL"
                      >
                        {copiedUrl === entries[0].url ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="duplicate-entries">
                      {entries.map((entry, index) => (
                        <div
                          key={`${entry.tabName}-${entry.rowIndex}`}
                          className={`duplicate-entry ${index === 0 ? 'original' : 'duplicate'}`}
                        >
                          <span className="entry-label">
                            {index === 0 ? 'Original' : 'Duplicate'}
                          </span>
                          <span className="entry-info">
                            Tab: <strong>{entry.tabName}</strong> | 
                            Row: <strong>{entry.rowIndex}</strong> | 
                            Position: <strong>{entry.position || 'N/A'}</strong>
                            {entry.sourceColumn && (
                              <> | Source: <strong>Column {entry.sourceColumn}</strong></>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Applied Url Duplicates Section */}
          {appliedUrlDuplicateGroups.size > 0 && (
            <div className="duplicate-section">
              <h4 className="section-title">Applied Url Duplicates (Column G) - {appliedUrlDuplicateCount} duplicate(s)</h4>
              <div className="duplicates-list">
                {Array.from(appliedUrlDuplicateGroups.entries()).map(([normalizedUrl, entries]) => (
                  <div key={`applied-${normalizedUrl}`} className="duplicate-group">
                    <div className="duplicate-url">
                      <strong>URL:</strong> {entries[0].url}
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(entries[0].url)}
                        className="copy-button"
                        title="Copy URL"
                      >
                        {copiedUrl === entries[0].url ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="duplicate-entries">
                      {entries.map((entry, index) => (
                        <div
                          key={`${entry.tabName}-${entry.rowIndex}`}
                          className={`duplicate-entry ${index === 0 ? 'original' : 'duplicate'}`}
                        >
                          <span className="entry-label">
                            {index === 0 ? 'Original' : 'Duplicate'}
                          </span>
                          <span className="entry-info">
                            Tab: <strong>{entry.tabName}</strong> | 
                            Row: <strong>{entry.rowIndex}</strong> | 
                            Position: <strong>{entry.position || 'N/A'}</strong>
                            {entry.sourceColumn && (
                              <> | Source: <strong>Column {entry.sourceColumn}</strong></>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Fetching job URLs from {tabCount === 'all' ? 'all' : `last ${tabCount}`} tabs...</p>
        </div>
      )}
    </div>
  );
}

