import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { AdminFile, Buyer, updateBuyer } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';
import { ProductAutocomplete } from './ProductAutocomplete';

const PAGE_SIZE = 50;

interface BuyersPanelProps {
  idToken: string;
  buyers: Buyer[];
  files: AdminFile[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const BuyersPanel: React.FC<BuyersPanelProps> = ({
  idToken,
  buyers,
  files,
  isLoading,
  error,
  onRefresh
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [productIdsInput, setProductIdsInput] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const handleGrant = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const email = emailInput.trim().toLowerCase();
      if (!email || productIdsInput.length === 0) {
        setFormError('Enter an email and pick at least one product.');
        return;
      }

      // The product field allows free typing (for search), so a selection
      // could in principle be stale - only ever grant products that match a
      // real uploaded file, otherwise a typo could silently grant access to
      // a nonexistent product id.
      const validFileIds = new Set(files.map((file) => file.productId));
      if (!productIdsInput.every((id) => validFileIds.has(id))) {
        setFormError('Select products from the list - one of those product ids was not found.');
        return;
      }

      setIsSubmitting(true);
      setFormError('');

      try {
        await updateBuyer(idToken, email, 'add', productIdsInput);
        setEmailInput('');
        setProductIdsInput([]);
        onRefresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [emailInput, productIdsInput, idToken, onRefresh, files]
  );

  const handleRemoveProduct = useCallback(
    async (email: string, productId: string) => {
      const key = `${email}:${productId}`;
      setBusyKey(key);
      try {
        await updateBuyer(idToken, email, 'remove', productId);
        onRefresh();
      } finally {
        setBusyKey(null);
      }
    },
    [idToken, onRefresh]
  );

  const performDeleteBuyer = useCallback(
    async (email: string) => {
      setBusyKey(email);
      try {
        await updateBuyer(idToken, email, 'delete');
        onRefresh();
      } finally {
        setBusyKey(null);
      }
    },
    [idToken, onRefresh]
  );

  const filteredBuyers = useMemo(() => {
    const normalized = buyerSearch.trim().toLowerCase();
    if (!normalized) return buyers;
    return buyers.filter((buyer) => buyer.email.toLowerCase().includes(normalized));
  }, [buyers, buyerSearch]);

  useEffect(() => {
    setPage(1);
  }, [buyerSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredBuyers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedBuyers = filteredBuyers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Buyers</h1>
        <p className="text-sm text-brand-muted mt-1">
          {isLoading ? 'Loading…' : `${buyers.length} buyer${buyers.length === 1 ? '' : 's'} whitelisted`}
        </p>
      </div>

      <form onSubmit={handleGrant} className="mb-8 bg-brand-surface border border-brand-border rounded-xl p-5">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <UserPlus size={18} className="text-brand-yellow" />
          Grant access
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-brand-muted mb-1.5">Buyer's Gmail</label>
            <input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="buyer@gmail.com"
              className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-brand-muted mb-1.5">Products</label>
            <ProductAutocomplete products={files} value={productIdsInput} onChange={setProductIdsInput} />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter] shrink-0"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {isSubmitting ? 'Granting…' : 'Grant'}
          </button>
        </div>
        {files.length === 0 && (
          <p className="text-sm text-brand-muted mt-3">
            No PDFs uploaded yet — upload one in the Files tab first, then it'll appear here.
          </p>
        )}
        {formError && (
          <p className="flex items-center gap-1.5 text-red-400 text-sm mt-3">
            <AlertCircle size={14} className="shrink-0" />
            {formError}
          </p>
        )}
      </form>

      {error && (
        <p className="flex items-center gap-1.5 text-red-400 mb-4 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {!isLoading && buyers.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          <input
            type="search"
            value={buyerSearch}
            onChange={(event) => setBuyerSearch(event.target.value)}
            placeholder="Search buyers by email…"
            aria-label="Search buyers by email"
            className="w-full bg-brand-black border border-brand-border rounded-lg pl-9 pr-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : buyers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Users size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No buyers yet.</p>
        </div>
      ) : filteredBuyers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Search size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No buyers match "{buyerSearch}".</p>
        </div>
      ) : (
        <>
        <div className="rounded-xl border border-brand-border overflow-hidden">
          <div className="max-h-[55vh] sm:max-h-[60vh] overflow-y-auto scrollbar-thin divide-y divide-brand-border">
            {paginatedBuyers.map((buyer) => (
              <div key={buyer.email} className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors">
                <div className="flex items-center justify-between gap-4 mb-2.5">
                  <p className="font-bold truncate">{buyer.email}</p>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(buyer.email)}
                    disabled={busyKey === buyer.email}
                    aria-label={`Remove all access for ${buyer.email}`}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-red-400 hover:border-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {busyKey === buyer.email ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {buyer.productIds.length === 0 && (
                    <span className="text-sm text-brand-muted">No products</span>
                  )}
                  {buyer.productIds.map((productId) => (
                    <span
                      key={productId}
                      className="inline-flex items-center gap-1.5 bg-white border border-gray-300 rounded-none px-3 py-1 text-sm text-black"
                    >
                      {productId}
                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(buyer.email, productId)}
                        disabled={busyKey === `${buyer.email}:${productId}`}
                        aria-label={`Remove ${productId} from ${buyer.email}`}
                        className="text-red-600 hover:text-red-700 disabled:opacity-40 transition-colors"
                      >
                        {busyKey === `${buyer.email}:${productId}` ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <X size={12} />
                        )}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Pagination
          page={safePage}
          totalItems={filteredBuyers.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="buyers"
        />
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove buyer access?"
        message={
          deleteTarget
            ? `This removes all product access for ${deleteTarget}. They will no longer be able to view any of their purchased PDFs. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove access"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const email = deleteTarget;
          setDeleteTarget(null);
          if (email) performDeleteBuyer(email);
        }}
      />
    </div>
  );
};
