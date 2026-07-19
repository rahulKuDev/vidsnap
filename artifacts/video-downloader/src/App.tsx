import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/context/auth-context';
import { Layout } from './components/layout';
import Home from './pages/home';
import HistoryPage from './pages/history';
import EditorPage from './pages/editor';
import PlatformsPage from './pages/platforms';
import AuthPage from './pages/auth';
import ResetPasswordPage from './pages/reset-password';
import HelpPage from './pages/help';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

// ─── Global error reporter ─────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  const reportError = (message: string, stack?: string, url?: string, errorType?: string) => {
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'frontend', message: String(message).slice(0, 1000), stack: stack?.slice(0, 3000), url, errorType }),
    }).catch(() => {});
  };
  window.onerror = (msg, src, _line, _col, err) => {
    reportError(String(msg), err?.stack, src, 'window.onerror');
    return false;
  };
  window.addEventListener('unhandledrejection', e => {
    reportError(e.reason?.message ?? String(e.reason), e.reason?.stack, window.location.href, 'unhandledrejection');
  });
}

// ─── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) navigate('/auth');
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />

      {/* Protected routes */}
      <Route path="/">
        {() => (
          <AuthGuard>
            <Layout><Home /></Layout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/history">
        {() => (
          <AuthGuard>
            <Layout><HistoryPage /></Layout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/editor">
        {() => (
          <AuthGuard>
            <Layout><EditorPage /></Layout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/platforms">
        {() => (
          <AuthGuard>
            <Layout><PlatformsPage /></Layout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/help">
        {() => (
          <AuthGuard>
            <Layout><HelpPage /></Layout>
          </AuthGuard>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster theme="dark" position="bottom-right" className="bg-popover border-white/10 text-white" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
