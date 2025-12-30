import React, { useState, useEffect } from 'react';
import './AccountManager.css';

export interface Account {
  id: string;
  name: string;
  bidderName: string;
  fileName: string;
  spreadsheetId?: string; // Optional for backward compatibility
  credentials: any;
  createdAt: string;
}

const STORAGE_KEY = 'bidlinktracker_accounts';
const ACTIVE_ACCOUNT_KEY = 'bidlinktracker_active_account';

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', bidderName: '', spreadsheetId: '', file: null as File | null });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const accountsList = JSON.parse(stored) as Account[];
        setAccounts(accountsList);
        
        const activeId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
        if (activeId && accountsList.find(a => a.id === activeId)) {
          setActiveAccountId(activeId);
          // Set active credentials in sessionStorage for API calls
          const activeAccount = accountsList.find(a => a.id === activeId);
          if (activeAccount) {
            sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(activeAccount.credentials));
            if (activeAccount.spreadsheetId) {
              sessionStorage.setItem('bidlinktracker_spreadsheet_id', activeAccount.spreadsheetId);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file });
    }
  };

  const validateAndParseFile = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const json = JSON.parse(text);

          if (!json.type || json.type !== 'service_account') {
            reject(new Error('Invalid service account key. The file must contain a service_account type.'));
            return;
          }

          if (!json.client_email || !json.private_key) {
            reject(new Error('Invalid service account key. Missing required fields.'));
            return;
          }

          resolve(json);
        } catch (err) {
          reject(new Error('Failed to parse JSON file. Please ensure it is valid JSON.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!formData.bidderName.trim()) {
      setError('Bidder Name is required');
      return;
    }

    if (!formData.spreadsheetId.trim()) {
      setError('Spreadsheet ID is required');
      return;
    }

    // Extract spreadsheet ID from URL if a full URL is provided
    let spreadsheetId = formData.spreadsheetId.trim();
    try {
      const url = new URL(spreadsheetId);
      // Extract ID from Google Sheets URL format: https://docs.google.com/spreadsheets/d/{ID}/...
      const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        spreadsheetId = match[1];
      }
    } catch {
      // Not a URL, assume it's already an ID
    }

    if (!formData.file && !editingId) {
      setError('Please select a JSON file');
      return;
    }

    try {
      // If editing and no new file, use existing credentials
      let credentials;
      if (editingId && !formData.file) {
        const existingAccount = accounts.find(a => a.id === editingId);
        if (!existingAccount) {
          setError('Account not found');
          return;
        }
        credentials = existingAccount.credentials;
      } else {
        if (!formData.file) {
          setError('Please select a JSON file');
          return;
        }
        credentials = await validateAndParseFile(formData.file);
      }
      
      const account: Account = {
        id: editingId || `account_${Date.now()}`,
        name: formData.name.trim(),
        bidderName: formData.bidderName.trim(),
        fileName: formData.file ? formData.file.name : (accounts.find(a => a.id === editingId)?.fileName || ''),
        spreadsheetId: spreadsheetId || undefined,
        credentials,
        createdAt: editingId 
          ? accounts.find(a => a.id === editingId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
      };

      let updatedAccounts: Account[];
      if (editingId) {
        updatedAccounts = accounts.map(a => a.id === editingId ? account : a);
      } else {
        updatedAccounts = [...accounts, account];
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAccounts));
      setAccounts(updatedAccounts);
      
      // If this is the first account or we're editing the active one, set it as active
      if (updatedAccounts.length === 1 || activeAccountId === editingId) {
        setActiveAccountId(account.id);
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, account.id);
        sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(account.credentials));
        if (account.spreadsheetId) {
          sessionStorage.setItem('bidlinktracker_spreadsheet_id', account.spreadsheetId);
        }
      }

      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('accountUpdated'));

      setShowForm(false);
      setFormData({ name: '', bidderName: '', spreadsheetId: '', file: null });
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to process file');
    }
  };

  const handleSetActive = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setActiveAccountId(accountId);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
      sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(account.credentials));
      if (account.spreadsheetId) {
        sessionStorage.setItem('bidlinktracker_spreadsheet_id', account.spreadsheetId);
      } else {
        sessionStorage.removeItem('bidlinktracker_spreadsheet_id');
      }
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('accountUpdated'));
    }
  };

  const handleEdit = (account: Account) => {
    setFormData({
      name: account.name,
      bidderName: account.bidderName,
      spreadsheetId: account.spreadsheetId || '',
      file: null,
    });
    setEditingId(account.id);
    setShowForm(true);
  };

  const handleDelete = (accountId: string) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      const updatedAccounts = accounts.filter(a => a.id !== accountId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAccounts));
      setAccounts(updatedAccounts);
      
      if (activeAccountId === accountId) {
        if (updatedAccounts.length > 0) {
          handleSetActive(updatedAccounts[0].id);
        } else {
          setActiveAccountId(null);
          localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
          sessionStorage.removeItem('bidlinktracker_service_account');
          sessionStorage.removeItem('bidlinktracker_spreadsheet_id');
        }
      }
      
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('accountUpdated'));
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: '', bidderName: '', spreadsheetId: '', file: null });
    setEditingId(null);
    setError(null);
  };

  return (
    <div className="account-manager">
      <div className="manager-header">
        <h3>Manage Accounts</h3>
        <p>Upload and manage multiple service account JSON files</p>
      </div>

      {!showForm ? (
        <>
          <div className="manager-actions">
            <button onClick={() => setShowForm(true)} className="add-account-button">
              + Add New Account
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="no-accounts">
              <p>No accounts added yet. Click "Add New Account" to get started.</p>
            </div>
          ) : (
            <div className="accounts-list">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`account-card ${activeAccountId === account.id ? 'active' : ''}`}
                >
                  <div className="account-info">
                    <div className="account-header">
                      <h4>{account.name}</h4>
                      {activeAccountId === account.id && (
                        <span className="active-badge">Active</span>
                      )}
                    </div>
                    <p className="bidder-name">Bidder: {account.bidderName}</p>
                    <p className="file-name">File: {account.fileName}</p>
                    {account.spreadsheetId && (
                      <p className="spreadsheet-id">Spreadsheet: {account.spreadsheetId.length > 30 ? `${account.spreadsheetId.substring(0, 30)}...` : account.spreadsheetId}</p>
                    )}
                  </div>
                  <div className="account-actions">
                    {activeAccountId !== account.id && (
                      <button
                        onClick={() => handleSetActive(account.id)}
                        className="set-active-button"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(account)}
                      className="edit-button"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} className="account-form">
          <h4>{editingId ? 'Edit Account' : 'Add New Account'}</h4>
          
          <div className="form-group">
            <label htmlFor="account-name">Name *</label>
            <input
              id="account-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter account name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="bidder-name">Bidder Name *</label>
            <input
              id="bidder-name"
              type="text"
              value={formData.bidderName}
              onChange={(e) => setFormData({ ...formData, bidderName: e.target.value })}
              placeholder="Enter bidder name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="spreadsheet-id">Spreadsheet ID or URL *</label>
            <input
              id="spreadsheet-id"
              type="text"
              value={formData.spreadsheetId}
              onChange={(e) => setFormData({ ...formData, spreadsheetId: e.target.value })}
              placeholder="Enter spreadsheet ID or full URL"
              required
            />
            <small>You can paste the full Google Sheets URL or just the ID</small>
          </div>

          <div className="form-group">
            <label htmlFor="json-file">JSON File {!editingId && '*'}</label>
            <input
              id="json-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              required={!editingId}
            />
            {formData.file && (
              <p className="file-selected">Selected: {formData.file.name}</p>
            )}
            {editingId && !formData.file && (
              <p className="file-hint">Leave empty to keep current file</p>
            )}
          </div>

          {error && (
            <div className="form-error">{error}</div>
          )}

          <div className="form-actions">
            <button type="submit" className="submit-button">
              {editingId ? 'Update Account' : 'Add Account'}
            </button>
            <button type="button" onClick={handleCancel} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

