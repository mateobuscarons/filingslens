import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, AdminRoute } from './auth.jsx';
import { ToastProvider } from './notifications.jsx';

import Landing       from './pages/Landing.jsx';
import Login         from './pages/Login.jsx';
import Signup        from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard     from './pages/Dashboard.jsx';
import Setup         from './pages/Setup.jsx';
import Analysis      from './pages/Analysis.jsx';
import Diff          from './pages/Diff.jsx';
import QA            from './pages/QA.jsx';
import ReportsList   from './pages/ReportsList.jsx';
import Report        from './pages/Report.jsx';
import TeamSettings  from './pages/TeamSettings.jsx';
import Billing       from './pages/Billing.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/"       element={<Landing />} />
            <Route path="/login"  element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot" element={<ForgotPassword />} />

            {/* Protected — any authenticated user */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/analyses/new" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
            <Route path="/analyses/:id" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
            <Route path="/analyses/:id/findings/:findingId" element={<ProtectedRoute><Diff /></ProtectedRoute>} />
            <Route path="/analyses/:id/qa" element={<ProtectedRoute><QA /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><ReportsList /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute><Report /></ProtectedRoute>} />
            <Route path="/settings/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />

            {/* Admin only */}
            <Route path="/settings/team" element={<AdminRoute><TeamSettings /></AdminRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
