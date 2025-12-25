import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './BidderSetup.css';

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

interface BidderInfo {
  bidderName: string;
  profileName: string;
  sheetUri: string;
}

const BIDDER_DATA_KEY = 'bidlinktracker_bidder_data';
const CREDENTIALS_KEY_PREFIX = 'bidlinktracker_profile_credentials_';
const OLD_BIDDER_INFO_KEY = 'bidlinktracker_bidder_info'; // For migration

export function BidderSetup({ 
  onComplete, 
  initialData,
  onCancel,
  editingProfile
}: { 
  onComplete: (info: BidderInfo) => void;
  initialData?: BidderInfo | null;
  onCancel?: () => void;
  editingProfile?: Profile | null;
}) {
  const { user } = useAuth();
  const [bidderName, setBidderName] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [formData, setFormData] = useState({
    profileName: '',
    sheetUri: '',
    file: null as File | null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.email || user?.name) {
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      const saved = localStorage.getItem(key);
      
      if (saved) {
        try {
          const data: BidderData = JSON.parse(saved);
          setBidderName(data.bidderName || '');
          setProfiles(data.profiles || []);
        } catch (error) {
          console.error('Error loading bidder data:', error);
        }
      } else {
        // Try to migrate from old format
        const oldKey = `${OLD_BIDDER_INFO_KEY}_${user.email || user.name}`;
        const oldSaved = localStorage.getItem(oldKey);
        if (oldSaved) {
          try {
            const oldInfo: BidderInfo = JSON.parse(oldSaved);
            setBidderName(oldInfo.bidderName || '');
            if (oldInfo.profileName && oldInfo.sheetUri) {
              const migratedProfile: Profile = {
                id: `profile_${Date.now()}`,
                profileName: oldInfo.profileName,
                sheetUri: oldInfo.sheetUri,
              };
              setProfiles([migratedProfile]);
            }
          } catch (error) {
            console.error('Error migrating old data:', error);
          }
        }
      }
    }

    // If initialData is provided (editing mode), use it
    if (initialData) {
      setBidderName(initialData.bidderName || '');
      if (initialData.profileName && initialData.sheetUri) {
        const profile: Profile = {
          id: `profile_${Date.now()}`,
          profileName: initialData.profileName,
          sheetUri: initialData.sheetUri,
        };
        setProfiles([profile]);
      }
    }
  }, [user, initialData]);

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file });
      setError(null);
    }
  };

  const handleAddProfile = () => {
    setEditingProfileId(null);
    setFormData({
      profileName: '',
      sheetUri: '',
      file: null,
    });
    setError(null);
    setShowProfileForm(true);
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfileId(profile.id);
    setFormData({
      profileName: profile.profileName,
      sheetUri: profile.sheetUri,
      file: null,
    });
    setError(null);
    setShowProfileForm(true);
  };

  const handleCancelProfileForm = () => {
    setShowProfileForm(false);
    setEditingProfileId(null);
    setFormData({
      profileName: '',
      sheetUri: '',
      file: null,
    });
    setError(null);
  };

  const handleDeleteProfile = (profileId: string) => {
    if (window.confirm('Are you sure you want to delete this profile?')) {
      const updatedProfiles = profiles.filter(p => p.id !== profileId);
      setProfiles(updatedProfiles);
      
      // Delete credentials
      const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${profileId}`;
      localStorage.removeItem(credentialsKey);
      
      // Save updated data
      if (user?.email || user?.name && bidderName) {
        const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
        const data: BidderData = {
          bidderName,
          profiles: updatedProfiles,
          activeProfileId: updatedProfiles.length > 0 ? updatedProfiles[0].id : null,
        };
        localStorage.setItem(key, JSON.stringify(data));
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bidderName.trim()) {
      setError('Bidder Name is required');
      return;
    }

    if (!formData.profileName.trim()) {
      setError('Profile Name is required');
      return;
    }

    if (!formData.sheetUri.trim()) {
      setError('Sheet URI is required');
      return;
    }

    if (!formData.file && !editingProfileId) {
      setError('Please upload a service account JSON file');
      return;
    }

    setLoading(true);

    try {
      let credentials;
      
      if (formData.file) {
        credentials = await validateAndParseFile(formData.file);
      } else if (editingProfileId) {
        // When editing, try to get existing credentials
        const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${editingProfileId}`;
        const existingCredentials = localStorage.getItem(credentialsKey);
        if (existingCredentials) {
          try {
            credentials = JSON.parse(existingCredentials);
          } catch (err) {
            throw new Error('Existing credentials are invalid. Please upload a new service account JSON file.');
          }
        } else {
          throw new Error('No credentials found. Please upload a service account JSON file.');
        }
      } else {
        throw new Error('Please upload a service account JSON file.');
      }

      const spreadsheetId = extractSpreadsheetId(formData.sheetUri);
      const profileId = editingProfileId || `profile_${Date.now()}`;

      const profile: Profile = {
        id: profileId,
        profileName: formData.profileName.trim(),
        sheetUri: spreadsheetId,
      };

      // Save credentials separately
      const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${profileId}`;
      localStorage.setItem(credentialsKey, JSON.stringify(credentials));

      // Update profiles list
      let updatedProfiles: Profile[];
      if (editingProfileId) {
        updatedProfiles = profiles.map(p => p.id === editingProfileId ? profile : p);
      } else {
        updatedProfiles = [...profiles, profile];
      }

      setProfiles(updatedProfiles);

      // Save bidder data
      if (user?.email || user?.name) {
        const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
        const data: BidderData = {
          bidderName: bidderName.trim(),
          profiles: updatedProfiles,
          activeProfileId: profileId, // Set as active
        };
        localStorage.setItem(key, JSON.stringify(data));
      }

      // Set up session storage with credentials and spreadsheet ID
      sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(credentials));
      sessionStorage.setItem('bidlinktracker_spreadsheet_id', spreadsheetId);

      // Reset form and go back to main view
      setFormData({
        profileName: '',
        sheetUri: '',
        file: null,
      });
      setEditingProfileId(null);
      setShowProfileForm(false);

      // Call onComplete to notify parent
      const infoToSave: BidderInfo = {
        bidderName: bidderName.trim(),
        profileName: profile.profileName,
        sheetUri: profile.sheetUri,
      };
      onComplete(infoToSave);
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
      console.error('Error saving profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    if (profiles.length === 0) {
      setError('Please add at least one profile');
      return;
    }

    const activeProfile = profiles.find(p => p.id === (editingProfileId || profiles[0].id));
    if (activeProfile) {
      const infoToSave: BidderInfo = {
        bidderName: bidderName.trim(),
        profileName: activeProfile.profileName,
        sheetUri: activeProfile.sheetUri,
      };
      onComplete(infoToSave);
    }
  };

  // Show profile form view (always show form when called from ProfileManager)
  if (showProfileForm || editingProfile) {
    return (
      <div className="bidder-setup">
        <div className="setup-header">
          <h2>{editingProfileId ? 'Edit Profile' : 'Add New Profile'}</h2>
          <p>{editingProfileId ? 'Update profile information below' : 'Fill in the profile information below'}</p>
        </div>

        <div className="setup-form">
          <form onSubmit={handleSaveProfile} className="profile-form">
            <div className="form-group">
              <label htmlFor="profile-name">Profile Name *</label>
              <input
                id="profile-name"
                type="text"
                value={formData.profileName}
                onChange={(e) => setFormData({ ...formData, profileName: e.target.value })}
                placeholder="Enter profile name"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="sheet-uri">Sheet URI *</label>
              <input
                id="sheet-uri"
                type="text"
                value={formData.sheetUri}
                onChange={(e) => setFormData({ ...formData, sheetUri: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/... or Spreadsheet ID"
                required
                disabled={loading}
              />
              <small>Enter the full Google Sheets URL or just the Spreadsheet ID</small>
            </div>

            <div className="form-group">
              <label htmlFor="service-account-file">
                Service Account JSON File {!editingProfileId && '*'}
              </label>
              <input
                id="service-account-file"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                required={!editingProfileId}
                disabled={loading}
              />
              <small>
                {editingProfileId
                  ? 'Upload a new file to replace existing credentials, or leave empty to keep current credentials.'
                  : 'Upload your Google Service Account JSON key file. Make sure the service account has access to the spreadsheet.'}
              </small>
            </div>

            {error && (
              <div className="form-error">{error}</div>
            )}

            <div className="profile-form-actions">
              <button type="submit" className="save-profile-button" disabled={loading}>
                {loading ? 'Saving...' : editingProfileId ? 'Update Profile' : 'Add Profile'}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCancelProfileForm();
                  if (onCancel) onCancel();
                }}
                className="cancel-button"
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Main view
  return (
    <div className="bidder-setup">
      <div className="setup-header">
        <h2>{initialData ? 'Edit Bidder Information' : 'Bidder Setup'}</h2>
        <p>{initialData ? 'Manage your profiles below' : 'Set up your bidder name and profiles'}</p>
      </div>

      <div className="setup-form">
        <div className="form-group">
          <label htmlFor="bidder-name">Bidder Name *</label>
          <input
            id="bidder-name"
            type="text"
            value={bidderName}
            onChange={(e) => setBidderName(e.target.value)}
            placeholder="Enter your bidder name"
            required
            disabled={loading}
          />
        </div>

        {/* Existing Profiles */}
        {profiles.length > 0 && (
          <div className="profiles-list">
            <h3>Your Profiles ({profiles.length})</h3>
            {profiles.map((profile) => (
              <div key={profile.id} className="profile-item">
                <div className="profile-info">
                  <strong>{profile.profileName}</strong>
                  <span className="profile-sheet-id">{profile.sheetUri.substring(0, 40)}...</span>
                </div>
                <div className="profile-actions">
                  <button
                    type="button"
                    onClick={() => handleEditProfile(profile)}
                    className="edit-profile-button"
                    disabled={loading}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="delete-profile-button"
                    disabled={loading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Profile Button */}
        <div className="add-profile-section">
          <button
            type="button"
            onClick={handleAddProfile}
            className="add-profile-button"
            disabled={loading || !bidderName.trim()}
          >
            + Add Profile
          </button>
        </div>

        {error && (
          <div className="form-error">{error}</div>
        )}

        {profiles.length > 0 && (
          <div className="form-actions">
            <button type="button" onClick={handleFinish} className="finish-button" disabled={loading}>
              {initialData ? 'Save Changes' : 'Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
