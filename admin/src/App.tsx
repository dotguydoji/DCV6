import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, FileText, Loader2, LogOut, ShieldCheck, Users } from 'lucide-react';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { BuyersPanel } from './components/BuyersPanel';
import { FilesPanel } from './components/FilesPanel';
import { InactiveAccountsPanel } from './components/InactiveAccountsPanel';
import { AdminCidGate } from './components/AdminCidGate';
import { InstallAppButton } from './components/InstallAppButton';
import { AdminFile, ApiError, Buyer, listBuyers, listFiles } from './lib/api';
import { clearCachedIdToken, getCachedIdToken, setCachedIdToken, signOutOfGoogle } from './lib/googleIdentity';
import { useInstallPrompt } from './lib/useInstallPrompt';

type AuthState =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'checking' }
  | { status: 'denied' }
  | { status: 'error'; message: string; idToken: string }
  | { status: 'ready'; idToken: string };

type Tab = 'buyers' | 'files' | 'inactive';

const App: React.FC = () => {
  const installPrompt = useInstallPrompt();
  const [auth, setAuth] = useState<AuthState>({ status: 'restoring' });
  const [tab, setTab] = useState<Tab>('files');
  const [cidPassed, setCidPassed] = useState(false);
  const hasTriedCache = useRef(false);

  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [buyersError, setBuyersError] = useState<string | null>(null);

  const [files, setFiles] = useState<AdminFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [canManageFiles, setCanManageFiles] = useState(false);

  const refreshBuyers = useCallback(async (idToken: string) => {
    setBuyersLoading(true);
    setBuyersError(null);
    try {
      const { buyers: result } = await listBuyers(idToken);
      setBuyers(result);
    } catch (err) {
      setBuyersError(err instanceof Error ? err.message : 'Could not load buyers.');
    } finally {
      setBuyersLoading(false);
    }
  }, []);

  const refreshFiles = useCallback(async (idToken: string) => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const { files: result, canManageFiles: allowed } = await listFiles(idToken);
      setFiles(result);
      setCanManageFiles(allowed);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Could not load files.');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  const handleSignIn = useCallback(async (idToken: string) => {
    setAuth({ status: 'checking' });

    try {
      const [buyersResult, filesResult] = await Promise.all([listBuyers(idToken), listFiles(idToken)]);
      setBuyers(buyersResult.buyers);
      setFiles(filesResult.files);
      setCanManageFiles(filesResult.canManageFiles);
      setCachedIdToken(idToken);
      setAuth({ status: 'ready', idToken });
    } catch (err) {
      // Only a genuine 403 means "this Gmail isn't an admin" - anything else
      // (rate limit, a transient server error, a network hiccup) has nothing
      // to do with the account, so don't sign the admin out over it or show
      // a misleading "not authorized" message.
      if (err instanceof ApiError && err.status !== 403) {
        setAuth({ status: 'error', message: err.message, idToken });
        return;
      }
      clearCachedIdToken();
      setAuth({ status: 'denied' });
    }
  }, []);

  useEffect(() => {
    if (hasTriedCache.current) return;
    hasTriedCache.current = true;

    const cached = getCachedIdToken();
    if (cached) {
      handleSignIn(cached);
    } else {
      setAuth({ status: 'signed-out' });
    }
  }, [handleSignIn]);

  if (auth.status === 'ready') {
    const navItems: { key: Tab; label: string; icon: typeof FileText }[] = [
      { key: 'buyers', label: 'Buyers', icon: Users },
      { key: 'files', label: 'Files', icon: FileText },
      { key: 'inactive', label: 'Inactive Accounts', icon: Clock }
    ];

    const handleSignOut = () => {
      signOutOfGoogle();
      setCidPassed(false);
      setAuth({ status: 'signed-out' });
    };

    if (!cidPassed) {
      return <AdminCidGate onVerified={() => setCidPassed(true)} />;
    }

    return (
      <div className="min-h-screen lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:fixed lg:inset-y-0 border-r border-brand-border bg-brand-surface/60">
          <div className="flex items-center gap-2.5 px-6 h-16 border-b border-brand-border">
            <ShieldCheck size={22} className="text-brand-yellow shrink-0" />
            <div className="min-w-0">
              <p className="font-bold leading-tight truncate">DC Notes</p>
              <p className="text-xs text-brand-muted leading-tight">Admin panel</p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === key
                    ? 'bg-brand-yellow text-brand-black font-bold'
                    : 'text-brand-muted hover:bg-brand-surface-hover hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-brand-border space-y-1">
            <InstallAppButton {...installPrompt} />
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-muted hover:bg-brand-surface-hover hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 h-16 px-4 sm:px-6 border-b border-brand-border bg-brand-black/90 backdrop-blur supports-[backdrop-filter]:bg-brand-black/70">
            <div className="flex items-center gap-2.5 lg:hidden">
              <ShieldCheck size={20} className="text-brand-yellow" />
              <p className="font-bold">DC Notes Admin</p>
            </div>
            <h2 className="hidden lg:block text-lg font-bold">
              {tab === 'files' ? 'Files' : tab === 'buyers' ? 'Buyers' : 'Inactive Accounts'}
            </h2>
            <div className="lg:hidden flex items-center gap-3">
              <InstallAppButton {...installPrompt} />
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-red-400 transition-colors"
                aria-label="Sign out"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 pb-24 lg:pb-8 max-w-4xl w-full mx-auto animate-fade-in">
            {tab === 'files' ? (
              <FilesPanel
                idToken={auth.idToken}
                files={files}
                isLoading={filesLoading}
                error={filesError}
                canManageFiles={canManageFiles}
                onRefresh={() => refreshFiles(auth.idToken)}
              />
            ) : tab === 'buyers' ? (
              <BuyersPanel
                idToken={auth.idToken}
                buyers={buyers}
                files={files}
                isLoading={buyersLoading}
                error={buyersError}
                onRefresh={() => refreshBuyers(auth.idToken)}
              />
            ) : (
              <InactiveAccountsPanel
                idToken={auth.idToken}
                buyers={buyers}
                isLoading={buyersLoading}
                error={buyersError}
                onRefresh={() => refreshBuyers(auth.idToken)}
              />
            )}
          </main>
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-brand-border bg-brand-surface/95 backdrop-blur safe-bottom">
          <div className="flex">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  tab === key ? 'text-brand-yellow' : 'text-brand-muted'
                }`}
                aria-current={tab === key ? 'page' : undefined}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center animate-fade-in">
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-brand-surface border border-brand-border flex items-center justify-center">
          <ShieldCheck size={30} className="text-brand-yellow" />
        </div>
        <h1 className="text-2xl font-bold mb-2">DC Notes — Admin</h1>
        <p className="text-brand-muted mb-8">Sign in with the owner's Gmail to continue.</p>

        {auth.status === 'restoring' && (
          <p className="flex items-center justify-center gap-2 text-brand-muted">
            <Loader2 size={16} className="animate-spin" />
            Checking your session…
          </p>
        )}

        {auth.status === 'signed-out' && (
          <div className="flex justify-center">
            <GoogleSignInButton onSignIn={handleSignIn} />
          </div>
        )}

        {auth.status === 'checking' && (
          <p className="flex items-center justify-center gap-2 text-brand-muted">
            <Loader2 size={16} className="animate-spin" />
            Checking your access…
          </p>
        )}

        {auth.status === 'denied' && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5">
            <AlertTriangle size={22} className="mx-auto text-red-400 mb-3" />
            <p className="text-red-400 font-bold mb-4">This Gmail account isn't authorized.</p>
            <button
              type="button"
              onClick={() => setAuth({ status: 'signed-out' })}
              className="text-brand-yellow underline underline-offset-2 hover:text-white transition-colors"
            >
              Try a different Gmail account
            </button>
          </div>
        )}

        {auth.status === 'error' && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5">
            <AlertTriangle size={22} className="mx-auto text-red-400 mb-3" />
            <p className="text-red-400 font-bold mb-4">{auth.message}</p>
            <button
              type="button"
              onClick={() => handleSignIn(auth.idToken)}
              className="text-brand-yellow underline underline-offset-2 hover:text-white transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
