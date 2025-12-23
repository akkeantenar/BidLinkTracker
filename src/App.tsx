import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/common/Login';
import { Layout } from './components/common/Layout';
import { DuplicateChecker } from './components/BidManager/DuplicateChecker';
import { JobLinkInput } from './components/Bidder/JobLinkInput';
import './App.css';

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole: 'bid-manager' | 'bidder' }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== requiredRole) {
    return <Navigate to={user?.role === 'bid-manager' ? '/bid-manager' : '/bidder'} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" replace />} />
      <Route
        path="/bid-manager"
        element={
          <ProtectedRoute requiredRole="bid-manager">
            <Layout>
              <DuplicateChecker />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bidder"
        element={
          <ProtectedRoute requiredRole="bidder">
            <Layout>
              <JobLinkInput />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'bid-manager' ? '/bid-manager' : '/bidder'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  console.log('App component rendering');
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;

