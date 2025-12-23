import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './ProfileSelector.css';

interface Account {
  id: string;
  name: string;
  bidderName: string;
  fileName: string;
  spreadsheetId?: string;
  credentials: any;
  createdAt: string;
}

const STORAGE_KEY = 'bidlinktracker_accounts';
const ACTIVE_ACCOUNT_KEY = 'bidlinktracker_active_account';
const ASSIGNMENTS_KEY = 'bidlinktracker_assignments';
const CONFIRMATIONS_KEY = 'bidlinktracker_confirmations';

export function ProfileSelector() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignedAccountIds, setAssignedAccountIds] = useState<string[]>([]);
  const [assignedAccountNames, setAssignedAccountNames] = useState<string[]>([]);
  const [isAssigned, setIsAssigned] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    console.log('[ProfileSelector] useEffect triggered, user:', user);
    
    // Load accounts first, then check assignments
    const accountsList = loadAccounts();
    console.log('[ProfileSelector] Loaded accounts:', accountsList.length);
    
    // Always check assignments, even if no accounts are loaded yet
    // This ensures we can show the assigned profile if it exists
    checkAssignments(accountsList);
    
    // Listen for assignment updates
    const handleAssignmentsUpdate = () => {
      console.log('[ProfileSelector] assignmentsUpdated event received');
      const updatedAccounts = loadAccounts();
      checkAssignments(updatedAccounts);
    };
    window.addEventListener('assignmentsUpdated', handleAssignmentsUpdate);
    
    // Also listen for account updates
    const handleAccountUpdate = () => {
      console.log('[ProfileSelector] accountUpdated event received');
      const updatedAccounts = loadAccounts();
      checkAssignments(updatedAccounts);
    };
    window.addEventListener('accountUpdated', handleAccountUpdate);
    
    // Listen for storage events (when localStorage changes in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ASSIGNMENTS_KEY || e.key === STORAGE_KEY) {
        console.log('[ProfileSelector] Storage event detected for key:', e.key);
        const updatedAccounts = loadAccounts();
        checkAssignments(updatedAccounts);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Poll for changes in case localStorage is updated from another tab
    // Check every 1 second to catch assignments quickly
    const interval = setInterval(() => {
      const updatedAccounts = loadAccounts();
      checkAssignments(updatedAccounts);
    }, 1000);
    
    return () => {
      window.removeEventListener('assignmentsUpdated', handleAssignmentsUpdate);
      window.removeEventListener('accountUpdated', handleAccountUpdate);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [user]);

  // Check confirmation whenever assignment status changes
  useEffect(() => {
    if (isAssigned && user?.name) {
      checkConfirmation();
    } else {
      setIsConfirmed(false);
    }
  }, [isAssigned, user?.name]);

  const checkConfirmation = () => {
    if (!user?.name || !isAssigned) {
      setIsConfirmed(false);
      return;
    }
    
    try {
      const stored = localStorage.getItem(CONFIRMATIONS_KEY);
      if (stored) {
        const confirmations = JSON.parse(stored) as Record<string, { confirmed: boolean; confirmedAt: string }>;
        const normalizedUserName = user.name.trim().toLowerCase();
        
        // Find confirmation by case-insensitive match
        for (const [bidderName, confirmation] of Object.entries(confirmations)) {
          if (bidderName.trim().toLowerCase() === normalizedUserName) {
            setIsConfirmed(confirmation.confirmed);
            return;
          }
        }
      }
      setIsConfirmed(false);
    } catch (error) {
      console.error('Error checking confirmation:', error);
      setIsConfirmed(false);
    }
  };

  const handleConfirm = () => {
    if (!user?.name) return;
    
    try {
      const stored = localStorage.getItem(CONFIRMATIONS_KEY);
      const confirmations = stored ? JSON.parse(stored) as Record<string, { confirmed: boolean; confirmedAt: string }> : {};
      const normalizedUserName = user.name.trim().toLowerCase();
      
      // Find the exact key (case-sensitive) that matches
      let exactKey: string | undefined;
      for (const key of Object.keys(confirmations)) {
        if (key.trim().toLowerCase() === normalizedUserName) {
          exactKey = key;
          break;
        }
      }
      
      // Use existing key or create new one with the user's name as entered
      const key = exactKey || user.name.trim();
      
      confirmations[key] = {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
      };
      
      localStorage.setItem(CONFIRMATIONS_KEY, JSON.stringify(confirmations));
      setIsConfirmed(true);
      window.dispatchEvent(new Event('confirmationsUpdated'));
    } catch (error) {
      console.error('Error confirming profile:', error);
      setError('Failed to confirm profile');
    }
  };

  const checkAssignments = (accountsList: Account[]) => {
    if (!user?.name) {
      // If user doesn't have a name, check if there are any assignments
      // and show a message that they need to log in with their name
      try {
        const stored = localStorage.getItem(ASSIGNMENTS_KEY);
        if (stored) {
          const assignments = JSON.parse(stored) as Record<string, string | string[]>;
          if (Object.keys(assignments).length > 0) {
            setError('Please log in with your name to see your assigned profile. If you have an assigned profile, make sure the name you enter matches the bidder name assigned by the Bid Manager.');
          }
        }
      } catch (error) {
        console.error('Error checking assignments:', error);
      }
      setIsAssigned(false);
      setAssignedAccountIds([]);
      setAssignedAccountNames([]);
      return;
    }
    
    try {
      const stored = localStorage.getItem(ASSIGNMENTS_KEY);
      console.log('[ProfileSelector] Checking localStorage for assignments key:', ASSIGNMENTS_KEY);
      console.log('[ProfileSelector] Raw stored value:', stored);
      console.log('[ProfileSelector] All localStorage keys:', Object.keys(localStorage).filter(k => k.includes('bidlinktracker')));
      
      if (!stored) {
        console.log('[ProfileSelector] No assignments found in localStorage');
        setIsAssigned(false);
        setAssignedAccountIds([]);
        setAssignedAccountNames([]);
        setError(null);
        return;
      }
      
      const assignments = JSON.parse(stored) as Record<string, string | string[]>;
      // Normalize the user name for comparison (trim and lowercase)
      const normalizedUserName = user.name.trim().toLowerCase();
      
      console.log('[ProfileSelector] ===== ASSIGNMENT CHECK =====');
      console.log('[ProfileSelector] User name:', user.name);
      console.log('[ProfileSelector] Normalized user name:', normalizedUserName);
      console.log('[ProfileSelector] All assignment keys:', Object.keys(assignments));
      console.log('[ProfileSelector] All assignments:', assignments);
      
      // Find assignment by case-insensitive match
      let assignedIds: string[] = [];
      let matchedBidderName: string | undefined;
      for (const [bidderName, assignment] of Object.entries(assignments)) {
        const normalizedBidderName = bidderName.trim().toLowerCase();
        console.log('[ProfileSelector] Comparing stored key:', `"${bidderName}"`, '(normalized:', normalizedBidderName, ') with user:', normalizedUserName);
        if (normalizedBidderName === normalizedUserName) {
          matchedBidderName = bidderName;
          // Support both single account and multiple accounts
          if (Array.isArray(assignment)) {
            assignedIds = assignment;
          } else {
            assignedIds = [assignment];
          }
          console.log('[ProfileSelector] ✓ MATCH FOUND! Bidder:', matchedBidderName, 'Account IDs:', assignedIds);
          break;
        }
      }
      
      if (!matchedBidderName) {
        console.log('[ProfileSelector] ✗ No match found. User name might not match exactly.');
        console.log('[ProfileSelector] Try checking: exact case, spacing, special characters');
      }
      
      if (assignedIds.length > 0) {
        console.log('[ProfileSelector] Found assignments! Account IDs:', assignedIds);
        setAssignedAccountIds(assignedIds);
        setIsAssigned(true);
        setError(null);
        
        // Reload accounts from localStorage to ensure we have the latest
        const reloadedAccounts = loadAccounts();
        if (reloadedAccounts.length > 0) {
          setAccounts(reloadedAccounts);
        }
        
        // Find assigned accounts that exist in the accounts list
        const availableAssignedAccounts = reloadedAccounts.filter(a => assignedIds.includes(a.id));
        
        // Store assigned account names for display
        const names = availableAssignedAccounts.map(a => a.name);
        setAssignedAccountNames(names);
        
        if (availableAssignedAccounts.length > 0) {
          // Use the first assigned account by default, or the one that's already selected
          const assignedId = assignedIds.includes(selectedAccountId || '') 
            ? (selectedAccountId || assignedIds[0])
            : assignedIds[0];
          
          const assignedAccount = availableAssignedAccounts.find(a => a.id === assignedId) || availableAssignedAccounts[0];
          
          console.log('[ProfileSelector] Setting active account:', assignedAccount.name);
          setSelectedAccountId(assignedAccount.id);
          localStorage.setItem(ACTIVE_ACCOUNT_KEY, assignedAccount.id);
          sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(assignedAccount.credentials));
          if (assignedAccount.spreadsheetId) {
            sessionStorage.setItem('bidlinktracker_spreadsheet_id', assignedAccount.spreadsheetId);
          } else {
            sessionStorage.removeItem('bidlinktracker_spreadsheet_id');
          }
          window.dispatchEvent(new Event('accountUpdated'));
        } else {
          // No account names found
          setAssignedAccountNames([]);
          // Assignment exists but accounts not found - show helpful message
          console.warn('[ProfileSelector] Assignment found but accounts not found. Account IDs:', assignedIds);
          console.warn('[ProfileSelector] Available accounts:', reloadedAccounts.map(a => a.id));
          setError(`Profile assigned to "${matchedBidderName}" but the profile account(s) were not found. Please contact the Bid Manager or refresh the page.`);
          // Still set a selected account ID if we have one, so the UI can show something
          if (assignedIds.length > 0 && !selectedAccountId) {
            setSelectedAccountId(assignedIds[0]);
          }
        }
      } else {
        console.log('[ProfileSelector] No assignment found for user:', user.name);
        setIsAssigned(false);
        setAssignedAccountIds([]);
        setError(null);
      }
    } catch (error) {
      console.error('[ProfileSelector] Error checking assignments:', error);
      setError('Failed to check profile assignments');
      setIsAssigned(false);
      setAssignedAccountIds([]);
      setAssignedAccountNames([]);
    }
  };

  const loadAccounts = (): Account[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const accountsList = JSON.parse(stored) as Account[];
        setAccounts(accountsList);
        return accountsList;
      }
      return [];
    } catch (error) {
      console.error('Error loading accounts:', error);
      setError('Failed to load accounts');
      return [];
    }
  };

  const handleProfileChange = (accountId: string) => {
    // If assigned, only allow switching between assigned profiles
    if (isAssigned && assignedAccountIds.length > 0) {
      if (!assignedAccountIds.includes(accountId)) {
        setError('You can only switch between profiles assigned to you by the Bid Manager.');
        return;
      }
    }
    
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setSelectedAccountId(accountId);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
      sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(account.credentials));
      if (account.spreadsheetId) {
        sessionStorage.setItem('bidlinktracker_spreadsheet_id', account.spreadsheetId);
      } else {
        sessionStorage.removeItem('bidlinktracker_spreadsheet_id');
      }
      setError(null);
      // Dispatch event to notify other components
      window.dispatchEvent(new Event('accountUpdated'));
    }
  };

  // Show different messages based on whether accounts exist and if there's an assignment
  // If there's an assignment, always show the profile selector (even if accounts haven't loaded yet)
  // Also check localStorage directly to see if there's an assignment even if state hasn't updated
  const hasAssignmentInStorage = (() => {
    if (!user?.name) return false;
    try {
      const stored = localStorage.getItem(ASSIGNMENTS_KEY);
      if (stored) {
        const assignments = JSON.parse(stored) as Record<string, string | string[]>;
        const normalizedUserName = user.name.trim().toLowerCase();
        for (const bidderName of Object.keys(assignments)) {
          if (bidderName.trim().toLowerCase() === normalizedUserName) {
            return true;
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return false;
  })();

  // Don't show "No profiles available" if there's an assignment or if we're assigned
  // Also check one more time if assignment exists but state hasn't updated
  const shouldShowNoProfiles = accounts.length === 0 && !isAssigned && assignedAccountIds.length === 0 && !hasAssignmentInStorage;
  
  if (shouldShowNoProfiles) {
    // Double-check assignments one more time before showing "no profiles"
    const lastCheck = (() => {
      if (!user?.name) return false;
      try {
        const stored = localStorage.getItem(ASSIGNMENTS_KEY);
        if (stored) {
          const assignments = JSON.parse(stored) as Record<string, string | string[]>;
          const normalizedUserName = user.name.trim().toLowerCase();
          for (const bidderName of Object.keys(assignments)) {
            if (bidderName.trim().toLowerCase() === normalizedUserName) {
              return true;
            }
          }
        }
      } catch {
        // Ignore
      }
      return false;
    })();
    
    if (!lastCheck) {
      return (
        <div className="profile-selector">
          <div className="profile-header">
            <h3>Select Profile</h3>
            {user?.name && (
              <p className="user-name-info">Logged in as: <strong>{user.name}</strong></p>
            )}
            <p>No profiles available. Please ask a Bid Manager to set up a profile.</p>
            {user?.name && (
              <p className="name-required-message">If a profile has been assigned to you, make sure you logged in with the exact name that the Bid Manager used when assigning the profile.</p>
            )}
            <button
              onClick={() => {
                console.log('[ProfileSelector] Manual refresh triggered');
                console.log('[ProfileSelector] Current user:', user);
                // Force reload everything
                const updatedAccounts = loadAccounts();
                console.log('[ProfileSelector] Reloaded accounts:', updatedAccounts.length);
                console.log('[ProfileSelector] Account IDs:', updatedAccounts.map(a => ({ id: a.id, name: a.name })));
                checkAssignments(updatedAccounts);
                // Also trigger a re-render
                setAccounts([...updatedAccounts]);
                // Force a re-check after a brief delay to ensure state updates
                setTimeout(() => {
                  const accountsAgain = loadAccounts();
                  checkAssignments(accountsAgain);
                }, 100);
              }}
              className="refresh-button"
              style={{ marginTop: '12px', padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Refresh / Check for Assignments
            </button>
          </div>
          {error && (
            <div className="profile-error">{error}</div>
          )}
        </div>
      );
    }
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="profile-selector">
      <div className="profile-header">
        <h3>Profile</h3>
        {user?.name && (
          <p className="user-name-info">Logged in as: <strong>{user.name}</strong></p>
        )}
        {isAssigned ? (
          <div className="assigned-status">
            <p className="assigned-message">
              ✓ {assignedAccountIds.length > 1 
                ? `${assignedAccountIds.length} profiles assigned by Bid Manager` 
                : 'Profile assigned by Bid Manager'}
            </p>
            {assignedAccountNames.length > 0 && (
              <div className="assigned-profiles-list" style={{ marginTop: '8px', padding: '8px', background: '#f5f7ff', borderRadius: '6px' }}>
                <p style={{ fontSize: '0.9em', fontWeight: '500', marginBottom: '4px', color: '#333' }}>
                  Assigned Profile{assignedAccountNames.length > 1 ? 's' : ''}:
                </p>
                <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '0.9em', color: '#555' }}>
                  {assignedAccountNames.map((name, index) => (
                    <li key={index} style={{ marginBottom: '2px' }}>
                      <strong>{name}</strong>
                      {selectedAccountId === assignedAccountIds[index] && (
                        <span style={{ marginLeft: '8px', color: '#667eea', fontSize: '0.85em' }}>(Active)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assignedAccountIds.length > 1 && (
              <p className="multiple-profiles-message" style={{ fontSize: '0.9em', color: '#666', marginTop: '8px' }}>
                You can switch between your assigned profiles using the dropdown below.
              </p>
            )}
            {isConfirmed ? (
              <p className="confirmed-message" style={{ marginTop: '12px' }}>✓ Profile confirmed</p>
            ) : (
              <button
                onClick={handleConfirm}
                className="confirm-button"
                style={{ marginTop: '12px' }}
              >
                Confirm Profile Assignment
              </button>
            )}
          </div>
        ) : user?.name ? (
          <p>No profile assigned. Choose a profile to use for submitting job links</p>
        ) : (
          <p className="name-required-message">⚠️ Please log in with your name to see your assigned profile. The name must match the bidder name assigned by the Bid Manager.</p>
        )}
      </div>

      <div className="profile-select">
        <label htmlFor="profile-select">Profile:</label>
        {accounts.length === 0 && (isAssigned || hasAssignmentInStorage) ? (
          <div className="loading-assignment">
            <p>Loading assigned profile...</p>
            <small>If the profile doesn't appear, please refresh the page.</small>
          </div>
        ) : (
          <>
            <select
              id="profile-select"
              value={selectedAccountId || ''}
              onChange={(e) => handleProfileChange(e.target.value)}
              className="profile-dropdown"
              disabled={isAssigned && assignedAccountIds.length === 1}
            >
              {accounts.length === 0 ? (
                <option value="">No profiles available</option>
              ) : (
                accounts.map((account) => {
                  // If assigned, only show assigned accounts
                  if (isAssigned && assignedAccountIds.length > 0) {
                    if (!assignedAccountIds.includes(account.id)) {
                      return null;
                    }
                  }
                  return (
                    <option key={account.id} value={account.id}>
                      {account.name} {account.bidderName ? `(${account.bidderName})` : ''}
                    </option>
                  );
                })
              )}
            </select>
            {isAssigned && (
              <small className="disabled-hint">This profile is assigned to you and cannot be changed</small>
            )}
          </>
        )}
      </div>

      {selectedAccount && (
        <div className="profile-info">
          <div className="info-item">
            <strong>Profile:</strong> {selectedAccount.name}
          </div>
          {selectedAccount.bidderName && (
            <div className="info-item">
              <strong>Bidder:</strong> {selectedAccount.bidderName}
            </div>
          )}
          {selectedAccount.spreadsheetId && (
            <div className="info-item">
              <strong>Spreadsheet:</strong> {selectedAccount.spreadsheetId.substring(0, 40)}...
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="profile-error">{error}</div>
      )}
    </div>
  );
}

