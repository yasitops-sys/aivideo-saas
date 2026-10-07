import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AuthProvider, RequireAdmin, RequireSuperAdmin } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import AccessDenied from './pages/AccessDenied';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Generations from './pages/Generations';
import Payments from './pages/Payments';
import Packages from './pages/Packages';
import Models from './pages/Models';
import Transactions from './pages/Transactions';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import Admins from './pages/Admins';

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route
            path="/*"
            element={
              <RequireAdmin>
                <Layout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="generations" element={<Generations />} />
            <Route path="payments" element={<Payments />} />
            <Route path="packages" element={<Packages />} />
            <Route path="models" element={<Models />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="settings" element={<Settings />} />
            <Route
              path="admins"
              element={
                <RequireSuperAdmin>
                  <Admins />
                </RequireSuperAdmin>
              }
            />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
