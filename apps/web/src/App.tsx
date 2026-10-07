import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { VerifyEmail } from './pages/VerifyEmail';
import { Dashboard } from './pages/Dashboard';
import { Generate } from './pages/Generate';
import { History } from './pages/History';
import { Billing } from './pages/Billing';
import { Transactions } from './pages/Transactions';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <SettingsProvider>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                <Route
                  path="/login"
                  element={
                    <GuestRoute>
                      <Login />
                    </GuestRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <GuestRoute>
                      <Register />
                    </GuestRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <GuestRoute>
                      <ForgotPassword />
                    </GuestRoute>
                  }
                />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />

                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/generate" element={<Generate />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AuthProvider>
          </SettingsProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
