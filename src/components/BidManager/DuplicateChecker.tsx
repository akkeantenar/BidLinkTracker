import { useState, useEffect } from 'react';
import { getAllJobUrls, batchUpdateFeedback } from '../../services/sheetsApi';
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

    try {
      const allUrls = await getAllJobUrls();
      const duplicateMap = findDuplicates(allUrls);
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
        setSuccess('No duplicates found!');
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

    setUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const updates: Array<{ tabName: string; rowIndex: number; feedback: string }> = [];

      for (const [, entries] of duplicates.entries()) {
        // First entry (index 0) is the original/first occurrence
        const firstEntry = entries[0];
        const firstDate = firstEntry.date || 'N/A';
        const firstNo = firstEntry.no || 'N/A';
        const firstPosition = firstEntry.position || 'N/A';
        
        // Mark all entries after the first as duplicates
        // This loop creates (entries.length - 1) updates per group
        for (let i = 1; i < entries.length; i++) {
          const entry = entries[i];
          // Format: "Duplicated of Sheet - [Date] - [No] - [Position]"
          const feedback = `Duplicated of Sheet - ${firstDate} - ${firstNo} - ${firstPosition}`;
          updates.push({
            tabName: entry.tabName,
            rowIndex: entry.rowIndex,
            feedback,
          });
        }
      }

      // Verify the count matches
      console.log(`Marking ${updates.length} duplicate entries from ${duplicates.size} duplicate groups`);

      if (updates.length > 0) {
        await batchUpdateFeedback(updates);
        setSuccess(`Successfully marked ${updates.length} duplicate(s) and cleared approval status!`);
        // Clear duplicates after successful update
        setDuplicates(new Map());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to mark duplicates');
      console.error('Error marking duplicates:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Calculate total duplicates - count entries that will be marked (all except first in each group)
  // This should match the number of updates we'll create in handleMarkDuplicates
  let totalDuplicates = 0;
  for (const [, entries] of duplicates.entries()) {
    // For each group, count all entries except the first one (index 0)
    // This matches the logic: for (let i = 1; i < entries.length; i++)
    if (entries.length > 1) {
      totalDuplicates += entries.length - 1;
    }
  }

  return (
    <div className="duplicate-checker">
      <AccountManager />
      
      <div className="checker-header">
        <h2>Duplicate Job Link Checker</h2>
        <p>Check for duplicate job URLs across all spreadsheet tabs</p>
        {hasActiveAccount && activeAccountName && (
          <p className="active-account-info">Active Account: <strong>{activeAccountName}</strong></p>
        )}
      </div>

      {!hasActiveAccount && (
        <div className="message warning">
          Please add and activate an account to check for duplicates.
        </div>
      )}

      <div className="checker-actions">
        <button
          onClick={handleCheckDuplicates}
          disabled={loading || !hasActiveAccount}
          className="check-button"
        >
          {loading ? 'Checking...' : 'Check for Duplicates'}
        </button>

        {duplicates.size > 0 && (
          <button
            onClick={handleMarkDuplicates}
            disabled={updating}
            className="mark-button"
          >
            {updating ? 'Updating...' : `Mark ${totalDuplicates} Duplicate(s)`}
          </button>
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

      {duplicates.size > 0 && (
        <div className="duplicates-results">
          <h3>Found {duplicates.size} duplicate URL group(s) ({totalDuplicates} duplicate entries to mark)</h3>
          <div className="duplicates-list">
            {Array.from(duplicates.entries()).map(([normalizedUrl, entries]) => (
              <div key={normalizedUrl} className="duplicate-group">
                <div className="duplicate-url">
                  <strong>URL:</strong> {entries[0].url}
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
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Fetching job URLs from all tabs...</p>
        </div>
      )}
    </div>
  );
}

