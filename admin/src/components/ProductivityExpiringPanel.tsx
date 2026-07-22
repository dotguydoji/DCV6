import React, { useMemo } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Buyer } from '../lib/api';
import { getProductivityExpiresAt, PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID } from '../lib/productivityFeatures';

const WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ProductivityExpiringPanelProps {
  buyers: Buyer[];
  isLoading: boolean;
  error: string | null;
}

const formatCountdown = (expiresAt: Date): string => {
  const diffMs = expiresAt.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Expired - removal pending';
  if (diffDays === 1) return 'Expires tomorrow';
  return `Expires in ${diffDays} days`;
};

/**
 * Early-warning list for Productivity subscriptions specifically (separate
 * from the general 3-year Inactive Accounts warning) - anyone within 7 days
 * of scheduled-expire-productivity.ts removing their access, so it's a
 * one-click job to reach out and collect the next month's payment before
 * they lose the Typing Speed and any other Productivity feature.
 */
export const ProductivityExpiringPanel: React.FC<ProductivityExpiringPanelProps> = ({
  buyers,
  isLoading,
  error
}) => {
  const expiringSoon = useMemo(() => {
    const cutoff = Date.now() + WARNING_WINDOW_MS;
    return buyers
      .filter((buyer) => buyer.productIds.includes(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID) && buyer.productivitySubscribedAt)
      .map((buyer) => ({ buyer, expiresAt: getProductivityExpiresAt(buyer.productivitySubscribedAt!) }))
      .filter(({ expiresAt }) => expiresAt.getTime() <= cutoff)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  }, [buyers]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Productivity - Expiring Soon</h1>
        <p className="text-sm text-brand-muted mt-1">
          Buyers whose Productivity subscription is within 7 days of automatic removal.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-red-400 mb-4 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : expiringSoon.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Sparkles size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No Productivity subscriptions expiring within 7 days.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-border overflow-hidden divide-y divide-brand-border">
          {expiringSoon.map(({ buyer, expiresAt }) => (
            <div key={buyer.email} className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors">
              <p className="font-bold truncate mb-1">{buyer.email}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-orange-500">{formatCountdown(expiresAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
