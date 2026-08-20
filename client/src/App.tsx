import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SubAdminDashboard from './pages/SubAdminDashboard';
import TenantDashboard from './pages/TenantDashboard';
import StaffDashboard from './pages/StaffDashboard';
import UserManagement from './pages/UserManagement';
import Quizzes from './pages/Quizzes';
import SettingsPage from './pages/SettingsPage';
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

// Global redirect for legacy /dashboard paths
const DashboardRedirect = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const role = user?.role;
  const path = role ? `/${role.toLowerCase()}` : '/staff';
  return <Navigate to={path} replace />;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Participant Routes */}
      <Route path="/" element={<Join />} />
      <Route path="/live/:roomCode" element={<LiveQuiz />} />

      {/* Host Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<DashboardRedirect />} />

      {/* SuperAdmin */}
      <Route path="/superadmin" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN']}><SuperAdminDashboard /></ProtectedRoute>
      } />
      <Route path="/superadmin/subadmins" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN']}>
          <UserManagement
            pageTitle="SubAdmins"
            entityLabel="SubAdmin"
            fetchUrl="/superadmin/subadmins"
            createUrl="/superadmin/subadmins"
            countLabel="Tenants"
          />
        </ProtectedRoute>
      } />
      <Route path="/superadmin/tenants" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN']}>
          <UserManagement
            pageTitle="All Tenants"
            entityLabel="Tenant"
            fetchUrl="/superadmin/tenants"
            countLabel="Staff"
          />
        </ProtectedRoute>
      } />
      <Route path="/superadmin/quizzes" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN']}><Quizzes /></ProtectedRoute>
      } />
      <Route path="/superadmin/logs" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN']}><ActivityLogs /></ProtectedRoute>
      } />
      <Route path="/superadmin/settings" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN']}><SettingsPage /></ProtectedRoute>
      } />

      {/* SubAdmin */}
      <Route path="/subadmin" element={
        <ProtectedRoute allowedRoles={['SUBADMIN']}><SubAdminDashboard /></ProtectedRoute>
      } />
      <Route path="/subadmin/tenants" element={
        <ProtectedRoute allowedRoles={['SUBADMIN']}>
          <UserManagement
            pageTitle="My Tenants"
            entityLabel="Tenant"
            fetchUrl="/subadmin/tenants"
            createUrl="/subadmin/tenants"
            countLabel="Staff"
          />
        </ProtectedRoute>
      } />
      <Route path="/subadmin/quizzes" element={
        <ProtectedRoute allowedRoles={['SUBADMIN']}><Quizzes /></ProtectedRoute>
      } />
      <Route path="/subadmin/logs" element={
        <ProtectedRoute allowedRoles={['SUBADMIN']}><ActivityLogs /></ProtectedRoute>
      } />
      <Route path="/subadmin/settings" element={
        <ProtectedRoute allowedRoles={['SUBADMIN']}><SettingsPage /></ProtectedRoute>
      } />

      {/* Tenant */}
      <Route path="/tenant" element={
        <ProtectedRoute allowedRoles={['TENANT']}><TenantDashboard /></ProtectedRoute>
      } />
      <Route path="/tenant/staff" element={
        <ProtectedRoute allowedRoles={['TENANT']}>
          <UserManagement
            pageTitle="My Staff"
            entityLabel="Staff"
            fetchUrl="/tenant/staff"
            createUrl="/tenant/staff"
            countLabel="Quizzes"
          />
        </ProtectedRoute>
      } />
      <Route path="/tenant/quizzes" element={
        <ProtectedRoute allowedRoles={['TENANT']}><Quizzes /></ProtectedRoute>
      } />
      <Route path="/tenant/settings" element={
        <ProtectedRoute allowedRoles={['TENANT']}><SettingsPage /></ProtectedRoute>
      } />

      {/* Staff */}
      <Route path="/staff" element={
        <ProtectedRoute allowedRoles={['STAFF']}><StaffDashboard /></ProtectedRoute>
      } />
      <Route path="/staff/quizzes" element={
        <ProtectedRoute allowedRoles={['STAFF']}><Quizzes /></ProtectedRoute>
      } />
      <Route path="/staff/settings" element={
        <ProtectedRoute allowedRoles={['STAFF']}><SettingsPage /></ProtectedRoute>
      } />

      {/* Shared Admin Routes (legacy path kept for compatibility) */}
      <Route path="/admin/logs" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN']}><ActivityLogs /></ProtectedRoute>
      } />

      {/* Event Management Routes */}
      <Route path="/events/:id" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN', 'TENANT', 'STAFF']}><EventDetails /></ProtectedRoute>
      } />
      <Route path="/host/live/:id" element={
        <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN', 'TENANT', 'STAFF']}><HostLive /></ProtectedRoute>
      } />

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
