import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import './Login.css';

export function Login() {
  const { signup, signin } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [selectedRole, setSelectedRole] = useState<UserRole | ''>('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!selectedRole) {
      setError('Please select a role');
      setLoading(false);
      return;
    }

    const result = await signup(fullName, email, password, selectedRole as UserRole);
    
    if (result.success) {
      // Switch to signin mode after successful signup
      // Keep the email filled in for convenience
      setMode('signin');
      setFullName('');
      setPassword('');
      setSelectedRole('');
      setError(null);
    } else {
      setError(result.error || 'Signup failed');
    }
    
    setLoading(false);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signin(email, password);
    
    if (!result.success) {
      setError(result.error || 'Sign in failed');
    }
    
    setLoading(false);
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setSelectedRole('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>BidLinkTracker</h1>
        <p className="subtitle">
          {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
        </p>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {mode === 'signup' ? (
          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email-signup">Email</label>
              <input
                id="email-signup"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password-signup">Password</label>
              <input
                id="password-signup"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password (min. 6 characters)"
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            <div className="role-selection">
              <p className="role-label">Select your role:</p>
              <label className="role-option">
                <input
                  type="radio"
                  name="role"
                  value="bid-manager"
                  checked={selectedRole === 'bid-manager'}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  disabled={loading}
                />
                <div className="role-content">
                  <strong>Bid Manager</strong>
                  <span>Manage duplicates and track job applications</span>
                </div>
              </label>
              
              <label className="role-option">
                <input
                  type="radio"
                  name="role"
                  value="bidder"
                  checked={selectedRole === 'bidder'}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  disabled={loading}
                />
                <div className="role-content">
                  <strong>Bidder</strong>
                  <span>Submit job links for tracking</span>
                </div>
              </label>
            </div>

            <button type="submit" className="login-button" disabled={loading || !selectedRole}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>

            <p className="switch-mode">
              Already have an account?{' '}
              <button type="button" onClick={switchMode} className="link-button">
                Sign In
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSignin}>
            <div className="form-group">
              <label htmlFor="email-signin">Email</label>
              <input
                id="email-signin"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password-signin">Password</label>
              <input
                id="password-signin"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>

            <p className="switch-mode">
              Don't have an account?{' '}
              <button type="button" onClick={switchMode} className="link-button">
                Sign Up
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
