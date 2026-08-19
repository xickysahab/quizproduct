import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EventDetails from './pages/EventDetails';
import HostLive from './pages/HostLive';
import Join from './pages/Join';
import LiveQuiz from './pages/LiveQuiz';
import ActivityLogs from './pages/ActivityLogs';

// Protected Route Wrapper for Host Pages
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Participant Routes */}
      <Route path="/" element={<Join />} />
      <Route path="/live/:roomCode" element={<LiveQuiz />} />

      {/* Host Auth Routes */}
      <Route path="/login" element={<Login />} />

      {/* Host Protected Routes */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/logs" 
        element={
          <ProtectedRoute>
            <ActivityLogs />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/events/:id" 
        element={
          <ProtectedRoute>
            <EventDetails />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/host/live/:id" 
        element={
          <ProtectedRoute>
            <HostLive />
          </ProtectedRoute>
        } 
      />
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
