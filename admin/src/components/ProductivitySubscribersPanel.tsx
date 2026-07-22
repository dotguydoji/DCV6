import React, { useMemo, useState } from 'react';
import { AlertCircle, Search, Sparkles } from 'lucide-react';
import { Buyer } from '../lib/api';
import { getProductivityExpiresAt, PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID } from '../lib/productivityFeatures';

interface ProductivitySubscribersPanelProps {
  buyers: Buyer[];
  isLoading: boolean;
  error: string | null;
}

const formatCountdown = (expiresAt: Date): { text: string; isUrgent: boolean } => {
  const diffMs = expiresAt.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return { text: 'Expired - removal pending', isUrgent: true };
  if (diffDays === 1) return { text: 'Renews or expires tomorrow', isUrgent: true };
  if (diffDays <= 7) return { text: `${diffDays} days left`, isUrgent: true };
  return { text: `${diffDays} days left`, isUrgent: false };
};

/**
 * Complete list of every buyer currently holding the Productivity
 * subscription, each with a live countdown from their recorded start date
 * (admin-update-buyer.ts's productivitySubscribedAt) to the 30-day mark
 * scheduled-expire-productivity.ts enforces - the full picture, not just
 * who's about to expire (see ProductivityExpiringPanel for that narrower view).
 */
export const ProductivitySubscribersPanel: React.FC<ProductivitySubscribersPanelProps> = ({
  buyers,
  isLoading,
  error
}) => {
  const [search, setSearch] = useState('');

  const subscribers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return buyers
      .filter((buyer) => buyer.productIds.includes(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID))
      .filter((buyer) => !normalized || buyer.email.toLowerCase().includes(normalized))
      .map((buyer) => ({
        buyer,
        expiresAt: buyer.productivitySubscribedAt ? getProductivityExpiresAt(buyer.productivitySubscribedAt) : null
      }))
      .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity));
  }, [buyers, search]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Productivity Subscribers</h1>
        <p className="text-sm text-brand-muted mt-1">
          {isLoading ? 'Loading…' : `${subscribers.length} buyer${subscribers.length === 1 ? '' : 's'} subscribed`}
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-red-400 mb-4 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {!isLoading && buyers.some((b) => b.productIds.includes(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID)) && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subscribers by email…"
            aria-label="Search subscribers by email"
            className="w-full bg-brand-black border border-brand-border rounded-lg pl-9 pr-3 py-2.5 text-white outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : subscribers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Sparkles size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">
            {search ? `No subscribers match "${search}".` : 'No one is subscribed to Productivity yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-border overflow-hidden divide-y divide-brand-border">
          {subscribers.map(({ buyer, expiresAt }) => {
            const countdown = expiresAt ? formatCountdown(expiresAt) : null;
            return (
              <div
                key={buyer.email}
                className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-bold truncate">{buyer.email}</p>
                  {buyer.productivitySubscribedAt && (
                    <p className="text-xs text-brand-muted mt-0.5">
                      Subscribed {new Date(buyer.productivitySubscribedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                    countdown?.isUrgent ? 'bg-orange-500/10 text-orange-500' : 'bg-brand-black text-brand-muted'
                  }`}
                >
                  {countdown ? countdown.text : 'No start date recorded'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
