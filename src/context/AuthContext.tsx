import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, StoredUser } from '../types';

const USERS_STORAGE_KEY = 'bidlinktracker_users';
const CURRENT_USER_KEY = 'bidlinktracker_user';

interface AuthContextType {
  user: User | null;
  signup: (fullName: string, email: string, password: string, role: UserRole) => Promise<{ success: boolean; error?: string }>;
  signin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem(CURRENT_USER_KEY);
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user:', error);
      }
    }
  }, []);

  const getStoredUsers = (): StoredUser[] => {
    try {
      const stored = localStorage.getItem(USERS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveStoredUsers = (users: StoredUser[]) => {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  };

  const signup = async (fullName: string, email: string, password: string, role: UserRole): Promise<{ success: boolean; error?: string }> => {
    // Validate inputs
    if (!fullName.trim()) {
      return { success: false, error: 'Full name is required' };
    }
    if (!email.trim()) {
      return { success: false, error: 'Email is required' };
    }
    if (!email.includes('@') || !email.includes('.')) {
      return { success: false, error: 'Please enter a valid email address' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // Check if user already exists
    const users = getStoredUsers();
    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return { success: false, error: 'An account with this email already exists' };
    }

    // Create new user
    const newUser: StoredUser = {
      email: email.toLowerCase().trim(),
      fullName: fullName.trim(),
      password, // In production, this would be hashed
      role,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveStoredUsers(users);

    // Don't automatically sign in - user should sign in manually
    return { success: true };
  };

  const signin = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Validate inputs
    if (!email.trim()) {
      return { success: false, error: 'Email is required' };
    }
    if (!password) {
      return { success: false, error: 'Password is required' };
    }

    // Find user
    const users = getStoredUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    
    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Check password (in production, this would compare hashed passwords)
    if (user.password !== password) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Sign in successful
    const userToSet: User = {
      email: user.email,
      name: user.fullName,
      role: user.role,
    };
    setUser(userToSet);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userToSet));

    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(CURRENT_USER_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        signup,
        signin,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

