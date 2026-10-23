import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Spinner } from './components/ui/feedback';
import { AuthProvider, useAuth } from './lib/auth';
import { PublicOnly, RequireAuth } from './routes/guards';

const SignIn = lazy(() => import('./routes/auth/SignIn'));
const SignUp = lazy(() => import('./routes/auth/SignUp'));
const ForgotPassword = lazy(() => import('./routes/auth/ForgotPassword'));
const VerifyEmail = lazy(() => import('./routes/auth/VerifyEmail'));
const Companies = lazy(() => import('./routes/Companies'));
const CreateCompany = lazy(() => import('./routes/CreateCompany'));
const AcceptInvite = lazy(() => import('./routes/AcceptInvite'));
const Projects = lazy(() => import('./routes/company/Projects'));
const Production = lazy(() => import('./routes/company/Production'));
const Boms = lazy(() => import('./routes/company/Boms'));
const ProductionOrderDetail = lazy(() => import('./routes/company/ProductionOrderDetail'));
const ProjectDetail = lazy(() => import('./routes/company/ProjectDetail'));
const Quotations = lazy(() => import('./routes/company/Quotations'));
const NewQuotation = lazy(() => import('./routes/company/NewQuotation'));
const QuotationDetail = lazy(() => import('./routes/company/QuotationDetail'));
const CompanyLayout = lazy(() => import('./routes/company/CompanyLayout'));
const Dashboard = lazy(() => import('./routes/company/Dashboard'));
const Members = lazy(() => import('./routes/company/Members'));
const Roles = lazy(() => import('./routes/company/Roles'));
const Branches = lazy(() => import('./routes/company/Branches'));
const Periods = lazy(() => import('./routes/company/Periods'));
const Settings = lazy(() => import('./routes/company/Settings'));
const AuditLog = lazy(() => import('./routes/company/AuditLog'));
const Accounts = lazy(() => import('./routes/company/Accounts'));
const Journals = lazy(() => import('./routes/company/Journals'));
const NewJournal = lazy(() => import('./routes/company/NewJournal'));
const JournalDetail = lazy(() => import('./routes/company/JournalDetail'));
const OpeningBalances = lazy(() => import('./routes/company/OpeningBalances'));
const TrialBalance = lazy(() => import('./routes/company/TrialBalance'));
const Approvals = lazy(() => import('./routes/company/Approvals'));
const Products = lazy(() => import('./routes/company/Products'));
const ProductDetail = lazy(() => import('./routes/company/ProductDetail'));
const StockAdjustments = lazy(() => import('./routes/company/StockAdjustments'));
const NewStockAdjustment = lazy(() => import('./routes/company/NewStockAdjustment'));
const StockAdjustmentDetail = lazy(() => import('./routes/company/StockAdjustmentDetail'));
const Suppliers = lazy(() => import('./routes/company/Suppliers'));
const SupplierDetail = lazy(() => import('./routes/company/SupplierDetail'));
const Purchases = lazy(() => import('./routes/company/Purchases'));
const NewGoodsReceipt = lazy(() => import('./routes/company/NewGoodsReceipt'));
const GoodsReceiptDetail = lazy(() => import('./routes/company/GoodsReceiptDetail'));
const NewPurchaseInvoice = lazy(() => import('./routes/company/NewPurchaseInvoice'));
const PurchaseInvoiceDetail = lazy(() => import('./routes/company/PurchaseInvoiceDetail'));
const NewSupplierPayment = lazy(() => import('./routes/company/NewSupplierPayment'));
const SupplierPaymentDetail = lazy(() => import('./routes/company/SupplierPaymentDetail'));
const NewSupplierReturn = lazy(() => import('./routes/company/NewSupplierReturn'));
const SupplierReturnDetail = lazy(() => import('./routes/company/SupplierReturnDetail'));
const TaxCodes = lazy(() => import('./routes/company/TaxCodes'));
const Customers = lazy(() => import('./routes/company/Customers'));
const CustomerDetail = lazy(() => import('./routes/company/CustomerDetail'));
const Sales = lazy(() => import('./routes/company/Sales'));
const NewSale = lazy(() => import('./routes/company/NewSale'));
const SalesInvoiceDetail = lazy(() => import('./routes/company/SalesInvoiceDetail'));
const NewCustomerReceipt = lazy(() => import('./routes/company/NewCustomerReceipt'));
const CustomerReceiptDetail = lazy(() => import('./routes/company/CustomerReceiptDetail'));
const NewCreditNote = lazy(() => import('./routes/company/NewCreditNote'));
const CreditNoteDetail = lazy(() => import('./routes/company/CreditNoteDetail'));
const CustomerRefundDetail = lazy(() => import('./routes/company/CustomerRefundDetail'));
const BankReconciliation = lazy(() => import('./routes/company/BankReconciliation'));
const Reports = lazy(() => import('./routes/company/Reports'));
const FixedAssets = lazy(() => import('./routes/company/FixedAssets'));
const NewFixedAsset = lazy(() => import('./routes/company/NewFixedAsset'));
const FixedAssetDetail = lazy(() => import('./routes/company/FixedAssetDetail'));
const NotFound = lazy(() => import('./routes/NotFound'));

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? '/companies' : '/sign-in'} replace />;
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  {
    path: '/sign-in',
    element: (
      <PublicOnly>
        <SignIn />
      </PublicOnly>
    ),
  },
  {
    path: '/sign-up',
    element: (
      <PublicOnly>
        <SignUp />
      </PublicOnly>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <PublicOnly>
        <ForgotPassword />
      </PublicOnly>
    ),
  },
  {
    path: '/verify-email',
    element: (
      <RequireAuth verified={false}>
        <VerifyEmail />
      </RequireAuth>
    ),
  },
  {
    path: '/companies',
    element: (
      <RequireAuth>
        <Companies />
      </RequireAuth>
    ),
  },
  {
    path: '/companies/new',
    element: (
      <RequireAuth>
        <CreateCompany />
      </RequireAuth>
    ),
  },
  {
    path: '/invite/:invitationId',
    element: (
      <RequireAuth>
        <AcceptInvite />
      </RequireAuth>
    ),
  },
  {
    path: '/c/:companyId',
    element: (
      <RequireAuth>
        <CompanyLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'members', element: <Members /> },
      { path: 'roles', element: <Roles /> },
      { path: 'branches', element: <Branches /> },
      { path: 'periods', element: <Periods /> },
      { path: 'settings', element: <Settings /> },
      { path: 'audit', element: <AuditLog /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'journals', element: <Journals /> },
      { path: 'journals/new', element: <NewJournal /> },
      { path: 'journals/:journalId', element: <JournalDetail /> },
      { path: 'opening-balances', element: <OpeningBalances /> },
      { path: 'trial-balance', element: <TrialBalance /> },
      { path: 'approvals', element: <Approvals /> },
      { path: 'products', element: <Products /> },
      { path: 'products/:productId', element: <ProductDetail /> },
      { path: 'stock-adjustments', element: <StockAdjustments /> },
      { path: 'stock-adjustments/new', element: <NewStockAdjustment /> },
      { path: 'stock-adjustments/:adjustmentId', element: <StockAdjustmentDetail /> },
      { path: 'suppliers', element: <Suppliers /> },
      { path: 'suppliers/:supplierId', element: <SupplierDetail /> },
      { path: 'tax-codes', element: <TaxCodes /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/:customerId', element: <CustomerDetail /> },
      { path: 'sales', element: <Sales /> },
      { path: 'sales/new', element: <NewSale /> },
      { path: 'sales/invoices/:invoiceId', element: <SalesInvoiceDetail /> },
      { path: 'sales/receipts/new', element: <NewCustomerReceipt /> },
      { path: 'sales/receipts/:receiptId', element: <CustomerReceiptDetail /> },
      { path: 'sales/invoices/:invoiceId/return', element: <NewCreditNote /> },
      { path: 'sales/returns/:creditNoteId', element: <CreditNoteDetail /> },
      { path: 'sales/refunds/:refundId', element: <CustomerRefundDetail /> },
      { path: 'bank-reconciliation', element: <BankReconciliation /> },
      { path: 'reports', element: <Reports /> },
      { path: 'fixed-assets', element: <FixedAssets /> },
      { path: 'fixed-assets/new', element: <NewFixedAsset /> },
      { path: 'fixed-assets/:assetId', element: <FixedAssetDetail /> },
      { path: 'projects', element: <Projects /> },
      { path: 'projects/:projectId', element: <ProjectDetail /> },
      { path: 'production', element: <Production /> },
      { path: 'production/boms', element: <Boms /> },
      { path: 'production/:orderId', element: <ProductionOrderDetail /> },
      { path: 'quotations', element: <Quotations /> },
      { path: 'quotations/new', element: <NewQuotation /> },
      { path: 'quotations/:quotationId', element: <QuotationDetail /> },
      { path: 'purchases', element: <Purchases /> },
      { path: 'purchases/receipts/new', element: <NewGoodsReceipt /> },
      { path: 'purchases/receipts/:receiptId', element: <GoodsReceiptDetail /> },
      { path: 'purchases/invoices/new', element: <NewPurchaseInvoice /> },
      { path: 'purchases/invoices/:invoiceId', element: <PurchaseInvoiceDetail /> },
      { path: 'purchases/payments/new', element: <NewSupplierPayment /> },
      { path: 'purchases/payments/:paymentId', element: <SupplierPaymentDetail /> },
      { path: 'purchases/returns/new', element: <NewSupplierReturn /> },
      { path: 'purchases/returns/:returnId', element: <SupplierReturnDetail /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Spinner />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  );
}
