import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <h1>BidLinkTracker</h1>
          <div className="header-right">
            <span className="user-role">
              {user?.role === 'bid-manager' ? 'Bid Manager' : 'Bidder'}
            </span>
            {user?.name && <span className="user-name">{user.name}</span>}
            <button onClick={logout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

