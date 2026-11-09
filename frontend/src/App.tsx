import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ActivityPage } from "./pages/ActivityPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { BoardPage } from "./pages/BoardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProjectLayout } from "./pages/ProjectLayout";
import { ProjectSettingsPage } from "./pages/ProjectSettingsPage";
import { Link } from "react-router-dom";
import { Icon } from "./components/Icon";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
        <Icon name="search" className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className="btn-primary mt-5">
        Back to dashboard
      </Link>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="organizations/:orgId" element={<OrganizationPage />} />
                <Route path="projects/:projectId" element={<ProjectLayout />}>
                  <Route index element={<Navigate to="board" replace />} />
                  <Route path="board" element={<BoardPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                  <Route path="settings" element={<ProjectSettingsPage />} />
                </Route>
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
