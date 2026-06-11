import React, { createContext, useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

// Import Views
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import TripDetailView from './views/TripDetailView';
import MapView from './views/MapView';
import FriendsView from './views/FriendsView';
import LedgerView from './views/LedgerView';

// Import Components
import BottomNav from './components/BottomNav';

// Configure Axios Defaults
const getBaseURL = () => {
  let url = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  if (Capacitor.isNativePlatform()) {
    // Dynamically retrieve the local development machine IP, defaulting to Android loopback (10.0.2.2) if not specified
    const currentIP = import.meta.env.VITE_LOCAL_IP || '10.0.2.2';
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      url = url.replace('localhost', currentIP).replace('127.0.0.1', currentIP);
    }
  }
  return url;
};

axios.defaults.baseURL = getBaseURL();
axios.defaults.timeout = 10000; // 10 seconds timeout for request failure



// Global response interceptor to handle token expiration (401 Unauthorized)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('convoyToken');
      localStorage.removeItem('convoyUser');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Create Auth Context
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || localStorage.getItem('convoyToken') || '');
  const [loading, setLoading] = useState(true);

  // Set default auth header if token exists
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('token', token);
      localStorage.setItem('convoyToken', token);
      fetchUserProfile();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
      localStorage.removeItem('convoyToken');
      localStorage.removeItem('convoyUser');
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/auth/me');
      setUser(res.data);
      if (res.data) {
        localStorage.setItem('convoyUser', JSON.stringify({ 
          id: res.data._id, 
          name: res.data.name, 
          bikeModel: res.data.bikeModel 
        }));
      }
    } catch (err) {
      console.error('Fetch profile error:', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const res = await axios.post('/auth/login', { email, password });
      setToken(res.data.token);
      setUser({ 
        _id: res.data._id, 
        name: res.data.name, 
        email: res.data.email,
        bikeModel: res.data.bikeModel 
      });
      localStorage.setItem('convoyUser', JSON.stringify({ 
        id: res.data._id, 
        name: res.data.name, 
        bikeModel: res.data.bikeModel 
      }));
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Login failed. Please try again.'
      };
    }
  };

  const register = async (name, email, password, bikeModel) => {
    try {
      const res = await axios.post('/auth/register', { name, email, password, bikeModel });
      setToken(res.data.token);
      setUser({ 
        _id: res.data._id, 
        name: res.data.name, 
        email: res.data.email, 
        bikeModel: res.data.bikeModel 
      });
      localStorage.setItem('convoyUser', JSON.stringify({ 
        id: res.data._id, 
        name: res.data.name, 
        bikeModel: res.data.bikeModel 
      }));
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Registration failed. Please try again.'
      };
    }
  };

  const loginWithGoogle = async (email, name) => {
    try {
      const res = await axios.post('/auth/google-login', { email, name });
      setToken(res.data.token);
      setUser({ 
        _id: res.data._id, 
        name: res.data.name, 
        email: res.data.email, 
        bikeModel: res.data.bikeModel 
      });
      localStorage.setItem('convoyUser', JSON.stringify({ 
        id: res.data._id, 
        name: res.data.name, 
        bikeModel: res.data.bikeModel 
      }));
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Google login failed. Please try again.'
      };
    }
  };

  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('convoyToken');
    localStorage.removeItem('convoyUser');
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUserProfile();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
};

// Route wrapper for authentication protection
const ProtectedRoute = ({ children }) => {
  const { token, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0b0d]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          <p className="text-gray-400 font-medium animate-pulse">Syncing vehicle telemetry...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Internal Layout wrapper to conditional render BottomNav
const AppLayout = () => {
  const location = useLocation();
  const showNav = location.pathname !== '/login';

  return (
    <div className="min-h-screen pb-24 bg-[#0a0b0d] text-white">
      <Routes>
        <Route path="/login" element={<LoginView />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardView />
          </ProtectedRoute>
        } />
        
        <Route path="/trips/:id" element={
          <ProtectedRoute>
            <TripDetailView />
          </ProtectedRoute>
        } />
        
        <Route path="/map/:id" element={
          <ProtectedRoute>
            <MapView />
          </ProtectedRoute>
        } />
        
        <Route path="/friends" element={
          <ProtectedRoute>
            <FriendsView />
          </ProtectedRoute>
        } />

        <Route path="/ledger" element={
          <ProtectedRoute>
            <LedgerView />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      {showNav && <BottomNav />}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout />
      </Router>
    </AuthProvider>
  );
}

export default App;
