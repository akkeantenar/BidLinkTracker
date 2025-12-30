import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BidderSetup } from './BidderSetup';
import './ProfileManager.css';

interface Profile {
  id: string;
  profileName: string;
  sheetUri: string;
}

interface BidderData {
  bidderName: string;
  profiles: Profile[];
  activeProfileId: string | null;
}

const BIDDER_DATA_KEY = 'bidlinktracker_bidder_data';
const CREDENTIALS_KEY_PREFIX = 'bidlinktracker_profile_credentials_';

export function ProfileManager({ 
  onProfileSelected,
  embedded = false 
}: { 
  onProfileSelected: () => void;
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const [bidderData, setBidderData] = useState<BidderData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadBidderData();
  }, [user]);

  const loadBidderData = () => {
    if (user?.email || user?.name) {
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data: BidderData = JSON.parse(saved);
          setBidderData(data);
        } catch (error) {
          console.error('Error loading bidder data:', error);
        }
      } else {
        // No data yet, show form to create first profile
        setShowForm(true);
      }
    }
  };

  const handleAddProfile = () => {
    setEditingProfile(null);
    setShowForm(true);
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setShowForm(true);
  };

  const handleDeleteProfile = (profileId: string) => {
    if (!bidderData) return;
    
    if (window.confirm('Are you sure you want to delete this profile?')) {
      const updatedProfiles = bidderData.profiles.filter(p => p.id !== profileId);
      const newActiveProfileId = 
        bidderData.activeProfileId === profileId 
          ? (updatedProfiles.length > 0 ? updatedProfiles[0].id : null)
          : bidderData.activeProfileId;

      const updatedData: BidderData = {
        ...bidderData,
        profiles: updatedProfiles,
        activeProfileId: newActiveProfileId,
      };

      // Delete credentials
      const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${profileId}`;
      localStorage.removeItem(credentialsKey);

      // Save updated data
      if (user?.email || user?.name) {
        const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
        localStorage.setItem(key, JSON.stringify(updatedData));
      }

      setBidderData(updatedData);
    }
  };

  // Helper to extract spreadsheet ID from URI
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

  const handleSetActive = (profileId: string) => {
    if (!bidderData) return;

    const profile = bidderData.profiles.find(p => p.id === profileId);
    if (!profile) return;

    // Load credentials for this profile
    const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${profileId}`;
    const credentials = localStorage.getItem(credentialsKey);
    
    if (credentials) {
      try {
        const creds = JSON.parse(credentials);
        const spreadsheetId = extractSpreadsheetId(profile.sheetUri);
        console.log(`[ProfileManager] Loading credentials for profile "${profile.profileName}"`);
        console.log(`[ProfileManager] Spreadsheet ID: ${spreadsheetId}`);
        console.log(`[ProfileManager] Has credentials: ${!!creds && !!creds.client_email}`);
        sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(creds));
        sessionStorage.setItem('bidlinktracker_spreadsheet_id', spreadsheetId);
      } catch (error) {
        console.error('Error loading profile credentials:', error);
      }
    } else {
      console.warn(`[ProfileManager] No credentials found for profile "${profile.profileName}" (key: ${credentialsKey})`);
    }

    const updatedData: BidderData = {
      ...bidderData,
      activeProfileId: profileId,
    };

    if (user?.email || user?.name) {
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      localStorage.setItem(key, JSON.stringify(updatedData));
    }

    setBidderData(updatedData);
    
    // If embedded, notify parent to reload bidder info
    if (embedded) {
      onProfileSelected();
    }
  };

  const handleFormComplete = () => {
    setShowForm(false);
    setEditingProfile(null);
    loadBidderData();
    // If embedded, notify parent to reload
    if (embedded) {
      onProfileSelected();
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingProfile(null);
  };

  const handleContinue = () => {
    if (bidderData && bidderData.profiles.length > 0) {
      // Ensure active profile credentials are loaded
      if (bidderData.activeProfileId) {
        const profile = bidderData.profiles.find(p => p.id === bidderData.activeProfileId);
        if (profile) {
          const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${profile.id}`;
          const credentials = localStorage.getItem(credentialsKey);
          if (credentials) {
            try {
              const creds = JSON.parse(credentials);
              sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(creds));
              sessionStorage.setItem('bidlinktracker_spreadsheet_id', profile.sheetUri);
            } catch (error) {
              console.error('Error loading profile credentials:', error);
            }
          }
        }
      }
      onProfileSelected();
    }
  };

  // Show form if adding/editing profile
  if (showForm) {
    return (
      <BidderSetup 
        onComplete={handleFormComplete}
        onCancel={handleFormCancel}
        editingProfile={editingProfile}
      />
    );
  }

  // Main page - show profiles
  return (
    <div className="profile-manager">
      <div className="manager-header">
        <h2>Manage Profiles</h2>
        <p>Upload and manage multiple profile configurations</p>
      </div>

      <div className="manager-actions">
        <button onClick={handleAddProfile} className="add-profile-button">
          + Add New Profile
        </button>
      </div>

      {!bidderData || bidderData.profiles.length === 0 ? (
        <div className="no-profiles">
          <p>No profiles added yet. Click "Add New Profile" to get started.</p>
        </div>
      ) : (
        <>
          <div className="profiles-list">
            {bidderData.profiles.map((profile) => (
              <div
                key={profile.id}
                className={`profile-card ${bidderData.activeProfileId === profile.id ? 'active' : ''}`}
              >
                <div className="profile-info">
                  <div className="profile-header">
                    <h4>{profile.profileName}</h4>
                    {bidderData.activeProfileId === profile.id && (
                      <span className="active-badge">Active</span>
                    )}
                  </div>
                  <p className="bidder-name">Bidder: {bidderData.bidderName}</p>
                  <p className="spreadsheet-id">
                    Spreadsheet: {profile.sheetUri.length > 30 ? `${profile.sheetUri.substring(0, 30)}...` : profile.sheetUri}
                  </p>
                </div>
                <div className="profile-actions">
                  {bidderData.activeProfileId !== profile.id && (
                    <button
                      onClick={() => handleSetActive(profile.id)}
                      className="set-active-button"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    onClick={() => handleEditProfile(profile)}
                    className="edit-button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!embedded && bidderData.profiles.length > 0 && (
            <div className="continue-section">
              <button onClick={handleContinue} className="continue-button">
                Continue to Job Links
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

