import { useState, useEffect } from 'react';
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

export function ProfileSelector() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load accounts
    const accountsList = loadAccounts();
    
    // Set active account if one is stored
    const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    if (activeId && accountsList.find(a => a.id === activeId)) {
      setSelectedAccountId(activeId);
      const activeAccount = accountsList.find(a => a.id === activeId);
      if (activeAccount) {
        sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(activeAccount.credentials));
        if (activeAccount.spreadsheetId) {
          sessionStorage.setItem('bidlinktracker_spreadsheet_id', activeAccount.spreadsheetId);
        } else {
          sessionStorage.removeItem('bidlinktracker_spreadsheet_id');
        }
      }
    } else if (accountsList.length > 0 && !activeId) {
      // If no active account but accounts exist, set the first one as active
      const firstAccount = accountsList[0];
      setSelectedAccountId(firstAccount.id);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, firstAccount.id);
      sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(firstAccount.credentials));
      if (firstAccount.spreadsheetId) {
        sessionStorage.setItem('bidlinktracker_spreadsheet_id', firstAccount.spreadsheetId);
      }
      window.dispatchEvent(new Event('accountUpdated'));
    }
    
    // Listen for account updates
    const handleAccountUpdate = () => {
      const updatedAccounts = loadAccounts();
      const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
      if (activeId && updatedAccounts.find(a => a.id === activeId)) {
        const activeAccount = updatedAccounts.find(a => a.id === activeId);
        if (activeAccount) {
          sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(activeAccount.credentials));
          if (activeAccount.spreadsheetId) {
            sessionStorage.setItem('bidlinktracker_spreadsheet_id', activeAccount.spreadsheetId);
          } else {
            sessionStorage.removeItem('bidlinktracker_spreadsheet_id');
          }
        }
      }
    };
    window.addEventListener('accountUpdated', handleAccountUpdate);
    
    // Listen for storage events (when localStorage changes in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === ACTIVE_ACCOUNT_KEY) {
        const updatedAccounts = loadAccounts();
        const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
        if (activeId && updatedAccounts.find(a => a.id === activeId)) {
          setSelectedAccountId(activeId);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('accountUpdated', handleAccountUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

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

  if (accounts.length === 0) {
    return (
      <div className="profile-selector">
        <div className="profile-header">
          <h3>Select Profile</h3>
          {user?.name && (
            <p className="user-name-info">Logged in as: <strong>{user.name}</strong></p>
          )}
          <p>No profiles available. Please ask a Bid Manager to set up a profile.</p>
        </div>
        {error && (
          <div className="profile-error">{error}</div>
        )}
      </div>
    );
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="profile-selector">
      <div className="profile-header">
        <h3>Profile</h3>
        {user?.name && (
          <p className="user-name-info">Logged in as: <strong>{user.name}</strong></p>
        )}
        <p>Choose a profile to use for submitting job links</p>
      </div>

      <div className="profile-select">
        <label htmlFor="profile-select">Profile:</label>
        <select
          id="profile-select"
          value={selectedAccountId || ''}
          onChange={(e) => handleProfileChange(e.target.value)}
          className="profile-dropdown"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} {account.bidderName ? `(${account.bidderName})` : ''}
            </option>
          ))}
        </select>
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

