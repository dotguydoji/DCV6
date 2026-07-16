import React, { useCallback, useState } from 'react';
import { AlertCircle, Box, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminFile, Package, deletePackage, upsertPackage } from '../lib/api';
import { ProductAutocomplete } from './ProductAutocomplete';
import { PasswordGateDialog } from './PasswordGateDialog';
import { getAdminCid } from '../lib/cid';

interface PackagesPanelProps {
  idToken: string;
  packages: Package[];
  files: AdminFile[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const PackagesPanel: React.FC<PackagesPanelProps> = ({
  idToken,
  packages,
  files,
  isLoading,
  error,
  onRefresh
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [productIdsInput, setProductIdsInput] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Package | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setNameInput('');
    setProductIdsInput([]);
    setFormError('');
  };

  const startEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setNameInput(pkg.name);
    setProductIdsInput(pkg.productIds);
    setFormError('');
  };

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const name = nameInput.trim();
      if (!name || productIdsInput.length === 0) {
        setFormError('Enter a package name and pick at least one PDF.');
        return;
      }

      setIsSubmitting(true);
      setFormError('');

      try {
        await upsertPackage(idToken, { id: editingId ?? undefined, name, productIds: productIdsInput });
        resetForm();
        onRefresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [idToken, editingId, nameInput, productIdsInput, onRefresh]
  );

  const performDelete = useCallback(
    async (pkg: Package) => {
      setBusyId(pkg.id);
      try {
        await deletePackage(idToken, pkg.id);
        if (editingId === pkg.id) resetForm();
        onRefresh();
      } finally {
        setBusyId(null);
      }
    },
    [idToken, editingId, onRefresh]
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Packages</h1>
        <p className="text-sm text-brand-muted mt-1">
          {isLoading ? 'Loading…' : `${packages.length} package${packages.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 bg-brand-surface border border-brand-border rounded-xl p-5">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Box size={18} className="text-brand-yellow" />
          {editingId ? 'Edit package' : 'Create package'}
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-brand-muted mb-1.5">Package name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="Python Package (English)"
              className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-brand-muted mb-1.5">PDFs included</label>
            <ProductAutocomplete products={files} value={productIdsInput} onChange={setProductIdsInput} />
          </div>
          <div className="flex gap-2 shrink-0">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-border text-brand-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter]"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {isSubmitting ? 'Saving…' : editingId ? 'Save' : 'Create'}
            </button>
          </div>
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

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Box size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No packages yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-border overflow-hidden">
          <div className="divide-y divide-brand-border">
            {packages.map((pkg) => (
              <div key={pkg.id} className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors">
                <div className="flex items-center justify-between gap-4 mb-2.5">
                  <p className="font-bold truncate">{pkg.name}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(pkg)}
                      aria-label={`Edit ${pkg.name}`}
                      className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-brand-muted hover:border-brand-yellow hover:text-brand-yellow transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(pkg)}
                      disabled={busyId === pkg.id}
                      aria-label={`Delete ${pkg.name}`}
                      className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-red-400 hover:border-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                    >
                      {busyId === pkg.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pkg.productIds.map((productId) => (
                    <span
                      key={productId}
                      className="inline-flex items-center gap-1.5 bg-white border border-gray-300 rounded-none px-3 py-1 text-sm text-black"
                    >
                      {productId}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PasswordGateDialog
        open={deleteTarget !== null}
        title="Enter CID to continue"
        message={
          deleteTarget
            ? `Deleting the "${deleteTarget.name}" package is a sensitive action. Enter the CID to proceed. This only removes the shortcut - buyers who already received these PDFs keep them.`
            : ''
        }
        password={getAdminCid()}
        onCancel={() => setDeleteTarget(null)}
        onVerified={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) performDelete(target);
        }}
      />
    </div>
  );
};
