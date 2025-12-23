import { useState, useEffect } from 'react';
import { getAllJobUrls } from '../../services/sheetsApi';
import { checkUrlDuplicate } from '../../utils/duplicateChecker';
import { ProfileSelector } from './ProfileSelector';
import './JobLinkInput.css';

interface LinkStatus {
  url: string;
  isDuplicate: boolean;
  duplicateInfo?: { tabName: string; position: string };
}

export function JobLinkInput() {
  const [jobLinks, setJobLinks] = useState('');
  const [linkStatuses, setLinkStatuses] = useState<LinkStatus[]>([]);
  const [existingUrls, setExistingUrls] = useState<Array<{ url: string; tabName: string; position: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasActiveProfile, setHasActiveProfile] = useState(false);
  const [checking, setChecking] = useState(false);

  // Check for active profile
  useEffect(() => {
    const checkProfile = () => {
      const activeId = localStorage.getItem('bidlinktracker_active_account');
      const accounts = localStorage.getItem('bidlinktracker_accounts');
      if (activeId && accounts) {
        try {
          const accountsList = JSON.parse(accounts);
          const activeAccount = accountsList.find((a: any) => a.id === activeId);
          setHasActiveProfile(!!activeAccount);
        } catch {
          setHasActiveProfile(false);
        }
      } else {
        setHasActiveProfile(false);
      }
    };

    checkProfile();
    const interval = setInterval(checkProfile, 1000);
    window.addEventListener('accountUpdated', checkProfile);

    return () => {
      clearInterval(interval);
      window.removeEventListener('accountUpdated', checkProfile);
    };
  }, []);

  // Load existing URLs from spreadsheet when profile is active
  const loadExistingData = async () => {
    if (!hasActiveProfile) {
      setError('Please select a profile first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const urls = await getAllJobUrls();
      setExistingUrls(urls.map(u => ({ url: u.url, tabName: u.tabName, position: u.position })));
    } catch (err: any) {
      console.error('Error loading existing data:', err);
      setError(err.message || 'Failed to load data from spreadsheet. Please check your profile settings.');
    } finally {
      setLoading(false);
    }
  };

  // Check duplicates when user clicks check button
  const handleCheckDuplicates = async () => {
    if (!hasActiveProfile) {
      setError('Please select a profile first');
      return;
    }

    if (!jobLinks.trim()) {
      setError('Please enter at least one job link');
      return;
    }

    setChecking(true);
    setError(null);

    try {
      // Load existing URLs if not already loaded
      if (existingUrls.length === 0) {
        await loadExistingData();
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

      // Check each link for duplicates
      const statuses: LinkStatus[] = links.map(url => {
        const duplicateCheck = checkUrlDuplicate(url, existingUrls);
        return {
          url,
          isDuplicate: duplicateCheck.isDuplicate,
          duplicateInfo: duplicateCheck.duplicateInfo,
        };
      });

      setLinkStatuses(statuses);
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

  // Get only available (non-duplicated) links
  const availableLinks = linkStatuses.filter(s => !s.isDuplicate);

  return (
    <div className="job-link-input">
      <ProfileSelector />
      
      <div className="input-header">
        <h2>Check Duplicate Job Links</h2>
        <p>Enter job links to check for duplicates against the spreadsheet</p>
      </div>

      {!hasActiveProfile && (
        <div className="message warning">
          Please select a profile to check for duplicates.
        </div>
      )}

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
            value={jobLinks}
            onChange={(e) => {
              setJobLinks(e.target.value);
              // Clear statuses when input changes
              if (linkStatuses.length > 0) {
                setLinkStatuses([]);
              }
            }}
            placeholder="https://example.com/job1&#10;https://example.com/job2&#10;https://example.com/job3"
            rows={10}
            disabled={!hasActiveProfile || loading}
          />
          <small>Enter one job URL per line</small>
        </div>

        <button
          type="button"
          onClick={handleCheckDuplicates}
          disabled={!hasActiveProfile || loading || checking || !jobLinks.trim()}
          className="check-button"
        >
          {checking ? 'Checking...' : 'Check for Duplicates'}
        </button>

        {error && (
          <div className="message error">
            {error}
          </div>
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

        {/* Show only available (non-duplicated) links */}
        {availableLinks.length > 0 && (
          <div className="available-links-section">
            <h3>Available Links ({availableCount})</h3>
            <div className="available-links-list">
              {availableLinks.map((status, index) => (
                <div key={index} className="available-link-item">
                  <span className="link-icon">✓</span>
                  <div className="link-url">{status.url}</div>
                  <span className="link-status-badge available">Available</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Show duplicate links info (optional, but helpful) */}
        {duplicateCount > 0 && (
          <div className="duplicate-links-section">
            <h3>Duplicated Links ({duplicateCount})</h3>
            <div className="duplicate-links-list">
              {linkStatuses
                .filter(s => s.isDuplicate)
                .map((status, index) => (
                  <div key={index} className="duplicate-link-item">
                    <span className="link-icon">✗</span>
                    <div className="link-info">
                      <div className="link-url">{status.url}</div>
                      {status.duplicateInfo && (
                        <div className="duplicate-details">
                          Found in: {status.duplicateInfo.tabName} - {status.duplicateInfo.position}
                        </div>
                      )}
                    </div>
                    <span className="link-status-badge duplicate">Duplicated</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
