# FilingLens — Frontend

AI-assisted annual report analysis for German investment analysts. Compare two filings, see impact-ranked findings, ask cited questions, save to a report.

## Stack

- **React 18** + **Vite** — no Next.js
- **React Router v6** — client-side routing
- **Plain CSS** — all styles in `src/styles.css`, ported from the HTML mockup
- No UI library, no Tailwind

## Start

```bash
npm install
npm run dev       # http://localhost:5173
```

Backend must be running on `http://localhost:4000`. See `backend/README.md`.

**Demo logins:**
- `elena.steiner@frankfurt-investments.de` / `Demo1234!` — firm admin
- `daniel.chen@chen-research.de` / `Demo1234!` — solo analyst

## Entry point

```
index.html  →  src/main.jsx  →  <App />
```

`main.jsx` renders `<App />` into `<div id="root">`. That's all it does.

`App.jsx` sets up three providers and the route table:

```
<BrowserRouter>
  <AuthProvider>       ← fetches /me on load, exposes user + login/logout
    <ToastProvider>    ← global toast queue
      <Routes>         ← 13 routes, some behind ProtectedRoute / AdminRoute
```

`AuthProvider` (in `auth.jsx`) reads the JWT from `localStorage`, calls `GET /me`, and sets the current user. `ProtectedRoute` redirects to `/login` if no user. `AdminRoute` additionally requires `firm_admin` role.

Every page calls `apiFetch()` (in `api.js`) for all HTTP requests — it attaches the JWT header automatically and throws `ApiError` on non-2xx responses, carrying `status`, `code`, and per-field `fields` for inline form errors.

## Structure

```
src/
├── main.jsx            # entry — mounts <App />
├── App.jsx             # providers + route table
├── api.js              # apiFetch() + ApiError
├── auth.jsx            # AuthProvider, useAuth, ProtectedRoute, AdminRoute
├── notifications.jsx   # ToastProvider, useToast()
├── styles.css          # all CSS classes and design tokens
├── components/
│   ├── TopBar.jsx      # nav bar + avatar dropdown (logout, billing, team)
│   ├── ProductNav.jsx  # Dashboard · Analyses · Reports pills
│   └── ...             # Chip, Button, Panel, Field, Toast
└── pages/
    ├── Landing.jsx         /
    ├── Login.jsx           /login
    ├── Signup.jsx          /signup
    ├── ForgotPassword.jsx  /forgot
    ├── Dashboard.jsx       /dashboard
    ├── Setup.jsx           /analyses/new
    ├── Analysis.jsx        /analyses/:id        (polls until complete, then shows findings)
    ├── Diff.jsx            /analyses/:id/findings/:findingId
    ├── QA.jsx              /analyses/:id/qa
    ├── ReportsList.jsx     /reports
    ├── Report.jsx          /reports/:id
    ├── Billing.jsx         /settings/billing
    └── TeamSettings.jsx    /settings/team       (firm_admin only)
```

## Key conventions

- Every HTTP call uses `apiFetch()` — never `fetch` directly. It attaches the JWT and throws `ApiError` on non-2xx.
- Every page renders its own `<TopBar />` — no global layout wrapper.
- `useAuth()` gives you the current user anywhere in the tree.
- `useToast()` gives you `toast.success()` / `toast.error()` anywhere.

