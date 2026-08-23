import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Join from './pages/Join';
import LiveQuiz from './pages/LiveQuiz';

const Login = lazy(() => import('./pages/Login'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const SubAdminDashboard = lazy(() => import('./pages/SubAdminDashboard'));
const TenantDashboard = lazy(() => import('./pages/TenantDashboard'));
const StaffDashboard = lazy(() => import('./pages/StaffDashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Quizzes = lazy(() => import('./pages/Quizzes'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const EventDetails = lazy(() => import('./pages/EventDetails'));
const HostLive = lazy(() => import('./pages/HostLive'));
const ActivityLogs = lazy(() => import('./pages/ActivityLogs'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const Organizations = lazy(() => import('./pages/Organizations'));
const Signup = lazy(() => import('./pages/Signup'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));

const PageFallback = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
    Loading...
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }: { children: ReactNode, allowedRoles?: string[] }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  // Hold the route until the stored session has been confirmed, so a refresh
  // never redirects a valid session to the login page.
  if (isLoading) return <PageFallback />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const DashboardRedirect = () => {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return <PageFallback />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const role = user?.role;
  const path = role ? `/${role.toLowerCase()}` : '/staff';
  return <Navigate to={path} replace />;
};

/** Keeps a signed-in host off the login form instead of showing it again. */
const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageFallback />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Join />} />
        <Route path="/live/:roomCode" element={<LiveQuiz />} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/dashboard" element={<DashboardRedirect />} />

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
        <Route path="/superadmin/organizations" element={
          <ProtectedRoute allowedRoles={['SUPERADMIN']}><Organizations /></ProtectedRoute>
        } />
        <Route path="/superadmin/logs" element={
          <ProtectedRoute allowedRoles={['SUPERADMIN']}><ActivityLogs /></ProtectedRoute>
        } />
        <Route path="/superadmin/settings" element={
          <ProtectedRoute allowedRoles={['SUPERADMIN']}><SettingsPage /></ProtectedRoute>
        } />

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

        <Route path="/staff" element={
          <ProtectedRoute allowedRoles={['STAFF']}><StaffDashboard /></ProtectedRoute>
        } />
        <Route path="/staff/quizzes" element={
          <ProtectedRoute allowedRoles={['STAFF']}><Quizzes /></ProtectedRoute>
        } />
        <Route path="/staff/settings" element={
          <ProtectedRoute allowedRoles={['STAFF']}><SettingsPage /></ProtectedRoute>
        } />

        <Route path="/admin/logs" element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN']}><ActivityLogs /></ProtectedRoute>
        } />
        <Route path="/events/:id" element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN', 'TENANT', 'STAFF']}><EventDetails /></ProtectedRoute>
        } />
        <Route path="/host/live/:id" element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'SUBADMIN', 'TENANT', 'STAFF']}><HostLive /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Toaster position="top-center" />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
