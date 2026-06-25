import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, AuthOnlyRoute, AdminRoute, useAuth } from './auth.jsx';
import { ToastProvider } from './notifications.jsx';

import AuthGate     from './pages/AuthGate.jsx';
import PlanAndPay   from './pages/PlanAndPay.jsx';
import Dashboard    from './pages/Dashboard.jsx';
import Setup        from './pages/Setup.jsx';
import Analysis     from './pages/Analysis.jsx';
import Diff         from './pages/Diff.jsx';
import QA           from './pages/QA.jsx';
import ReportsList  from './pages/ReportsList.jsx';
import Report       from './pages/Report.jsx';
import TeamSettings from './pages/TeamSettings.jsx';
import Billing      from './pages/Billing.jsx';

// `/` routes to the right place based on auth + subscription state.
function Root() {
  const { user, subscription, ready } = useAuth();
  if (!ready) return null;
  if (user && subscription) return <Navigate to="/dashboard" replace />;
  if (user && !subscription) return <Navigate to="/billing/setup" replace />;
  return <AuthGate />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/billing/setup" element={<AuthOnlyRoute><PlanAndPay /></AuthOnlyRoute>} />

            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/analyses/new" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
            <Route path="/analyses/:id" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
            <Route path="/analyses/:id/findings/:findingId" element={<ProtectedRoute><Diff /></ProtectedRoute>} />
            <Route path="/analyses/:id/qa" element={<ProtectedRoute><QA /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><ReportsList /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute><Report /></ProtectedRoute>} />
            <Route path="/settings/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="/settings/team" element={<AdminRoute><TeamSettings /></AdminRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
