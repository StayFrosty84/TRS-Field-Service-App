import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import Layout from './components/Layout.jsx';

import Home from './pages/Home.jsx';
import Work from './pages/Work.jsx';
import WorkOrderNew from './pages/WorkOrderNew.jsx';
import WorkOrderDetail from './pages/WorkOrderDetail.jsx';
// Lazy-loaded: pulls in jsPDF only when actually creating a bill.
const BillEditor = lazy(() => import('./pages/BillEditor.jsx'));
import Accounts from './pages/Accounts.jsx';
import AccountForm from './pages/AccountForm.jsx';
import AccountDetail from './pages/AccountDetail.jsx';
import Contacts from './pages/Contacts.jsx';
import ContactForm from './pages/ContactForm.jsx';
import ContactDetail from './pages/ContactDetail.jsx';
import AssetForm from './pages/AssetForm.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="work" element={<Work />} />

          <Route path="work-orders/new" element={<WorkOrderNew />} />
          <Route path="work-orders/:id" element={<WorkOrderDetail />} />
          <Route
            path="work-orders/:id/bill"
            element={
              <Suspense fallback={<p className="muted">Loading…</p>}>
                <BillEditor />
              </Suspense>
            }
          />

          <Route path="accounts" element={<Accounts />} />
          <Route path="accounts/new" element={<AccountForm />} />
          <Route path="accounts/:id" element={<AccountDetail />} />
          <Route path="accounts/:id/edit" element={<AccountForm />} />

          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/new" element={<ContactForm />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="contacts/:id/edit" element={<ContactForm />} />

          <Route path="assets/new" element={<AssetForm />} />
          <Route path="assets/:id" element={<AssetDetail />} />
          <Route path="assets/:id/edit" element={<AssetForm />} />

          <Route path="reports" element={<Reports />} />

          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
