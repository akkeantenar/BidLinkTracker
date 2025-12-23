import React, { useState, useEffect } from 'react';
import './CredentialsUpload.css';

const STORAGE_KEY = 'bidlinktracker_service_account';

export function CredentialsUpload() {
  const [isUploaded, setIsUploaded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if credentials are already uploaded
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setIsUploaded(true);
      setFileName(sessionStorage.getItem(`${STORAGE_KEY}_filename`) || 'Service Account Key');
    }
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);

        // Validate it's a service account key
        if (!json.type || json.type !== 'service_account') {
          setError('Invalid service account key. The file must contain a service_account type.');
          return;
        }

        if (!json.client_email || !json.private_key) {
          setError('Invalid service account key. Missing required fields.');
          return;
        }

        // Store in sessionStorage
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(json));
        sessionStorage.setItem(`${STORAGE_KEY}_filename`, file.name);
        
        setIsUploaded(true);
        setFileName(file.name);
      } catch (err) {
        setError('Failed to parse JSON file. Please ensure it is valid JSON.');
        console.error('Error parsing JSON:', err);
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
    };

    reader.readAsText(file);
  };

  const handleClear = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(`${STORAGE_KEY}_filename`);
    setIsUploaded(false);
    setFileName(null);
    setError(null);
  };

  return (
    <div className="credentials-upload">
      <div className="upload-header">
        <h3>Service Account Credentials</h3>
        <p>Upload your Google Cloud service account JSON key file</p>
      </div>

      {!isUploaded ? (
        <div className="upload-area">
          <label htmlFor="credentials-file" className="upload-label">
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              <strong>Click to upload</strong> or drag and drop
              <span className="upload-hint">JSON file only</span>
            </div>
          </label>
          <input
            id="credentials-file"
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="upload-input"
          />
        </div>
      ) : (
        <div className="uploaded-info">
          <div className="uploaded-file">
            <span className="file-icon">✓</span>
            <span className="file-name">{fileName}</span>
            <button onClick={handleClear} className="clear-button">
              Clear
            </button>
          </div>
          <p className="uploaded-message">Credentials loaded successfully</p>
        </div>
      )}

      {error && (
        <div className="upload-error">
          {error}
        </div>
      )}
    </div>
  );
}

