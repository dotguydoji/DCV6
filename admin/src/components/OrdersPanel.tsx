import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clock, Maximize2, Loader2, RefreshCw, X } from 'lucide-react';
import { Order, listOrders, reviewOrder } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

interface OrdersPanelProps {
  idToken: string;
}

const formatDate = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : '—');

/**
 * Deliberately no polling/auto-refresh - see project notes: the buyer's own
 * Messenger message (prompted right after they submit) is the real
 * notification, so this list only ever refreshes when the admin opens this
 * tab or clicks Refresh, keeping this feature's Netlify/Firestore usage at
 * essentially zero beyond an admin actually looking at it.
 */
export const OrdersPanel: React.FC<OrdersPanelProps> = ({ idToken }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState('');
  const [approveTarget, setApproveTarget] = useState<Order | null>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!viewingImageUrl) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewingImageUrl(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewingImageUrl]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { orders: result } = await listOrders(idToken, 'pending');
      setOrders(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
    } finally {
      setIsLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const performApprove = async (order: Order) => {
    setBusyId(order.id);
    try {
      await reviewOrder(idToken, order.id, 'approve');
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve this order.');
    } finally {
      setBusyId(null);
    }
  };

  const performReject = async (order: Order) => {
    setBusyId(order.id);
    try {
      await reviewOrder(idToken, order.id, 'reject', rejectMessage.trim() || undefined);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setRejectingId(null);
      setRejectMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject this order.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-brand-muted mt-1">
            {isLoading ? 'Loading…' : `${orders.length} pending order${orders.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-brand-border text-brand-muted hover:text-white hover:border-brand-yellow transition-colors disabled:opacity-40"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
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
            <div key={i} className="h-32 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-16 text-center">
          <Clock size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No pending orders right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-4 p-4">
                <div className="w-full sm:w-40 h-32 shrink-0 rounded-lg overflow-hidden bg-brand-black border border-brand-border">
                  {order.screenshotUrl ? (
                    <button
                      type="button"
                      onClick={() => setViewingImageUrl(order.screenshotUrl)}
                      className="block w-full h-full"
                    >
                      <img src={order.screenshotUrl} alt="Payment screenshot" className="w-full h-full object-contain" />
                    </button>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-brand-muted text-xs">
                      Unavailable
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{order.email}</p>
                  <p className="text-xs text-brand-muted mb-2">{formatDate(order.submittedAt)}</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {order.productIds.map((id) => (
                      <span key={id} className="text-xs font-mono bg-brand-black border border-brand-border rounded px-2 py-1">
                        {id}
                      </span>
                    ))}
                  </div>

                  {order.screenshotUrl && (
                    <button
                      type="button"
                      onClick={() => setViewingImageUrl(order.screenshotUrl)}
                      className="inline-flex items-center gap-1 text-xs text-brand-yellow hover:underline mb-3"
                    >
                      <Maximize2 size={12} /> View full size
                    </button>
                  )}

                  {rejectingId === order.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={rejectMessage}
                        onChange={(event) => setRejectMessage(event.target.value)}
                        placeholder="Optional note the buyer will see (e.g. why this wasn't approved)"
                        rows={2}
                        className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-yellow transition-colors resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectMessage('');
                          }}
                          className="px-3 py-2 rounded-lg text-sm text-brand-muted hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => performReject(order)}
                          disabled={busyId === order.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-40"
                        >
                          {busyId === order.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                          Confirm Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setApproveTarget(order)}
                        disabled={busyId === order.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-brand-yellow text-brand-black hover:brightness-95 transition-[filter] disabled:opacity-40"
                      >
                        {busyId === order.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(order.id)}
                        disabled={busyId === order.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-brand-border text-brand-muted hover:text-red-400 hover:border-red-400 transition-colors disabled:opacity-40"
                      >
                        <X size={14} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingImageUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          role="presentation"
          onClick={() => setViewingImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setViewingImageUrl(null)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full bg-brand-surface/80 border border-brand-border text-white hover:bg-brand-surface transition-colors"
          >
            <X size={20} />
          </button>
          <img
            src={viewingImageUrl}
            alt="Payment screenshot, full size"
            onClick={(event) => event.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      <ConfirmDialog
        open={approveTarget !== null}
        title="Approve this order?"
        message={
          approveTarget
            ? `${approveTarget.productIds.join(', ')} will be granted to ${approveTarget.email} immediately, and the payment screenshot will be permanently deleted. This can't be undone.`
            : ''
        }
        confirmLabel="Approve"
        onCancel={() => setApproveTarget(null)}
        onConfirm={() => {
          const target = approveTarget;
          setApproveTarget(null);
          if (target) performApprove(target);
        }}
      />
    </div>
  );
};
