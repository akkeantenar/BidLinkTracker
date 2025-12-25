import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import './ProfileSwitcher.css';

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

export function ProfileSwitcher({ 
  onProfileChange 
}: { 
  onProfileChange: (profile: Profile) => void;
}) {
  const { user } = useAuth();
  const [bidderData, setBidderData] = useState<BidderData | null>(null);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (hasInitialized.current) return;
    
    if (user?.email || user?.name) {
      hasInitialized.current = true;
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data: BidderData = JSON.parse(saved);
          setBidderData(data);
          
          // Find and set active profile
          if (data.activeProfileId && data.profiles.length > 0) {
            const profile = data.profiles.find(p => p.id === data.activeProfileId);
            if (profile) {
              setActiveProfile(profile);
              loadProfileCredentials(profile);
              onProfileChange(profile);
            } else if (data.profiles.length > 0) {
              // If active profile not found, use first profile
              const firstProfile = data.profiles[0];
              setActiveProfile(firstProfile);
              loadProfileCredentials(firstProfile);
              onProfileChange(firstProfile);
            }
          } else if (data.profiles.length > 0) {
            // No active profile set, use first one
            const firstProfile = data.profiles[0];
            setActiveProfile(firstProfile);
            loadProfileCredentials(firstProfile);
            onProfileChange(firstProfile);
          }
        } catch (error) {
          console.error('Error loading bidder data:', error);
        }
      }
    }
  }, [user]); // Removed onProfileChange from dependencies

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

  const loadProfileCredentials = (profile: Profile) => {
    const credentialsKey = `${CREDENTIALS_KEY_PREFIX}${profile.id}`;
    const credentials = localStorage.getItem(credentialsKey);
    
    if (credentials) {
      try {
        const creds = JSON.parse(credentials);
        const spreadsheetId = extractSpreadsheetId(profile.sheetUri);
        console.log(`[ProfileSwitcher] Loading credentials for profile "${profile.profileName}"`);
        console.log(`[ProfileSwitcher] Spreadsheet ID: ${spreadsheetId}`);
        console.log(`[ProfileSwitcher] Has credentials: ${!!creds && !!creds.client_email}`);
        sessionStorage.setItem('bidlinktracker_service_account', JSON.stringify(creds));
        sessionStorage.setItem('bidlinktracker_spreadsheet_id', spreadsheetId);
      } catch (error) {
        console.error('Error loading profile credentials:', error);
      }
    } else {
      console.warn(`[ProfileSwitcher] No credentials found for profile "${profile.profileName}" (key: ${credentialsKey})`);
    }
  };

  const handleProfileSwitch = (profileId: string) => {
    if (!bidderData) return;

    const profile = bidderData.profiles.find(p => p.id === profileId);
    if (!profile) return;

    setActiveProfile(profile);
    loadProfileCredentials(profile);
    
    // Update active profile ID
    const updatedData: BidderData = {
      ...bidderData,
      activeProfileId: profileId,
    };
    
    if (user?.email || user?.name) {
      const key = `${BIDDER_DATA_KEY}_${user.email || user.name}`;
      localStorage.setItem(key, JSON.stringify(updatedData));
    }
    
    setBidderData(updatedData);
    onProfileChange(profile);
  };

  if (!bidderData || bidderData.profiles.length === 0) {
    return null;
  }

  return (
    <div className="profile-switcher">
      <label htmlFor="profile-select">Active Profile:</label>
      <select
        id="profile-select"
        value={activeProfile?.id || ''}
        onChange={(e) => handleProfileSwitch(e.target.value)}
        className="profile-select"
      >
        {bidderData.profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.profileName}
          </option>
        ))}
      </select>
    </div>
  );
}

