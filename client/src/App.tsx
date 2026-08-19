import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SubAdminDashboard from './pages/SubAdminDashboard';
import TenantDashboard from './pages/TenantDashboard';
import StaffDashboard from './pages/StaffDashboard';
import EventDetails from './pages/EventDetails';
import HostLive from './pages/HostLive';
import Join from './pages/Join';
import LiveQuiz from './pages/LiveQuiz';
import ActivityLogs from './pages/ActivityLogs';

// Protected Route Wrapper for Host Pages
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />; // Or unauthorized page
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

      {/* Role-Specific Dashboards */}
      <Route 
        path="/superadmin" 
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN']}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/subadmin" 
        element={
          <ProtectedRoute allowedRoles={['SUBADMIN']}>
            <SubAdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tenant" 
        element={
          <ProtectedRoute allowedRoles={['TENANT']}>
            <TenantDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/staff" 
        element={
          <ProtectedRoute allowedRoles={['STAFF']}>
            <StaffDashboard />
          </ProtectedRoute>
        } 
      />

      {/* Shared Admin Routes */}
      <Route 
        path="/admin/logs" 
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN']}>
            <ActivityLogs />
          </ProtectedRoute>
        } 
      />
      
      {/* Event Management Routes (Staff/Tenant) */}
      <Route 
        path="/events/:id" 
        element={
          <ProtectedRoute allowedRoles={['STAFF', 'TENANT']}>
            <EventDetails />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/host/live/:id" 
        element={
          <ProtectedRoute allowedRoles={['STAFF', 'TENANT']}>
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
