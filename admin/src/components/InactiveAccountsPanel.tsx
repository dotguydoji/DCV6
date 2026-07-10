import React, { useMemo, useState } from 'react';
import { AlertCircle, Clock, Copy, Loader2, RefreshCw } from 'lucide-react';
import { backfillExpiry, Buyer } from '../lib/api';

const WARNING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface InactiveAccountsPanelProps {
  idToken: string;
  buyers: Buyer[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const formatCountdown = (expiresAt: string): string => {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return 'Past due - removal pending';
  if (diffDays === 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  return `Expires in ${diffDays} days`;
};

/**
 * Every buyer record has a rolling expiry (see admin-update-buyer.ts) so the
 * buyers collection doesn't grow forever. This tab is the early-warning
 * list for that - anyone within 30 days of it, with exactly what they still
 * have access to, so it's a one-click job to look someone up and restore
 * them (Buyers tab -> re-add the same email + products) if they ever get
 * in touch again after their record has been removed.
 */
export const InactiveAccountsPanel: React.FC<InactiveAccountsPanelProps> = ({
  idToken,
  buyers,
  isLoading,
  error,
  onRefresh
}) => {
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const upcoming = useMemo(() => {
    const cutoff = Date.now() + WARNING_WINDOW_MS;
    return buyers
      .filter((buyer) => buyer.expiresAt && new Date(buyer.expiresAt).getTime() <= cutoff)
      .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());
  }, [buyers]);

  const missingExpiryCount = useMemo(() => buyers.filter((buyer) => !buyer.expiresAt).length, [buyers]);

  const handleBackfill = async () => {
    setIsBackfilling(true);
    setBackfillMessage(null);
    try {
      const { updated } = await backfillExpiry(idToken);
      setBackfillMessage(
        updated > 0 ? `Set an expiry for ${updated} buyer${updated === 1 ? '' : 's'}.` : 'Nothing needed updating.'
      );
      onRefresh();
    } catch (err) {
      setBackfillMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleCopy = async (buyer: Buyer) => {
    const text = `${buyer.email}\n${buyer.productIds.join(', ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEmail(buyer.email);
      setTimeout(() => setCopiedEmail((current) => (current === buyer.email ? null : current)), 2000);
    } catch {
      // Clipboard can fail (permissions, older browsers) - the email and
      // products are still fully visible on screen either way.
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Inactive Accounts</h1>
        <p className="text-sm text-brand-muted mt-1">
          Buyers whose record is within 30 days of being automatically removed.
        </p>
      </div>

      {missingExpiryCount > 0 && (
        <div className="mb-6 bg-brand-surface border border-brand-border rounded-xl p-5">
          <p className="text-sm text-brand-muted mb-3">
            {missingExpiryCount} buyer{missingExpiryCount === 1 ? '' : 's'} {missingExpiryCount === 1 ? "doesn't" : "don't"} have an expiry set yet (added before this feature existed).
          </p>
          <button
            type="button"
            onClick={handleBackfill}
            disabled={isBackfilling}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter]"
          >
            {isBackfilling ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isBackfilling ? 'Setting expiry…' : 'Set expiry for these buyers'}
          </button>
          {backfillMessage && <p className="text-sm text-brand-muted mt-3">{backfillMessage}</p>}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-red-400 mb-4 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Clock size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No buyers approaching expiry right now.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-border overflow-hidden divide-y divide-brand-border">
          {upcoming.map((buyer) => (
            <div key={buyer.email} className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors">
              <div className="flex items-center justify-between gap-4 mb-2">
                <p className="font-bold truncate">{buyer.email}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(buyer)}
                  aria-label={`Copy ${buyer.email}'s details`}
                  className="flex items-center gap-1.5 text-xs font-bold text-brand-muted hover:text-brand-yellow transition-colors shrink-0"
                >
                  <Copy size={13} />
                  {copiedEmail === buyer.email ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-400 mb-2">
                {formatCountdown(buyer.expiresAt!)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {buyer.productIds.length === 0 ? (
                  <span className="text-sm text-brand-muted">No products</span>
                ) : (
                  buyer.productIds.map((productId) => (
                    <span
                      key={productId}
                      className="inline-flex items-center bg-white border border-gray-300 rounded-none px-2.5 py-1 text-xs text-black"
                    >
                      {productId}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
