import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, Search, Trash2, Upload } from 'lucide-react';
import { AdminFile, deleteFile, getUploadUrl, uploadFileToR2 } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';
import { PasswordGateDialog } from './PasswordGateDialog';
import { getAdminCid } from '../lib/cid';

interface FilesPanelProps {
  idToken: string;
  files: AdminFile[];
  isLoading: boolean;
  error: string | null;
  canManageFiles: boolean;
  onRefresh: () => void;
}

const PAGE_SIZE = 50;

const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const formatTotalSize = (bytes: number) => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const FilesPanel: React.FC<FilesPanelProps> = ({
  idToken,
  files,
  isLoading,
  error,
  canManageFiles,
  onRefresh
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [productIdInput, setProductIdInput] = useState('');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [page, setPage] = useState(1);

  const handleFilePick = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const suggested = file.name.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    setProductIdInput(suggested);
  }, []);

  const handleUpload = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!pendingFile || !PRODUCT_ID_PATTERN.test(productIdInput)) {
        setUploadState('error');
        setUploadError('Enter a valid product id (lowercase letters, numbers, hyphens only).');
        return;
      }

      setUploadState('uploading');
      setUploadError('');

      try {
        const { url } = await getUploadUrl(idToken, productIdInput);
        await uploadFileToR2(url, pendingFile);
        setUploadState('idle');
        setPendingFile(null);
        setProductIdInput('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        onRefresh();
      } catch (err) {
        setUploadState('error');
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
      }
    },
    [pendingFile, productIdInput, idToken, onRefresh]
  );

  const performDelete = useCallback(
    async (productId: string) => {
      setDeletingId(productId);
      try {
        await deleteFile(idToken, productId);
        onRefresh();
      } finally {
        setDeletingId(null);
      }
    },
    [idToken, onRefresh]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalSizeBytes = useMemo(() => files.reduce((sum, file) => sum + file.sizeBytes, 0), [files]);

  const willOverwriteExisting = useMemo(
    () => files.some((file) => file.productId === productIdInput),
    [files, productIdInput]
  );

  const filteredFiles = useMemo(() => {
    const normalized = fileSearch.trim().toLowerCase();
    if (!normalized) return files;
    return files.filter((file) => file.productId.toLowerCase().includes(normalized));
  }, [files, fileSearch]);

  const suggestions = useMemo(() => {
    const normalized = fileSearch.trim().toLowerCase();
    if (!normalized) return [];
    return files.filter((file) => file.productId.toLowerCase().includes(normalized)).slice(0, 6);
  }, [files, fileSearch]);

  useEffect(() => {
    setPage(1);
  }, [fileSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedFiles = filteredFiles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold">Files</h1>
        <p className="text-sm text-brand-muted">
          {isLoading
            ? 'Loading…'
            : `${files.length} PDF${files.length === 1 ? '' : 's'} · ${formatTotalSize(totalSizeBytes)} total`}
        </p>
      </div>

      {canManageFiles ? (
        <form onSubmit={handleUpload} className="mb-8 bg-brand-surface border border-brand-border rounded-xl p-5">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Upload size={18} className="text-brand-yellow" />
            Upload a PDF
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-sm text-brand-muted mb-1.5">PDF file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFilePick}
                className="block w-full text-sm text-brand-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-yellow file:text-brand-black file:font-bold file:cursor-pointer cursor-pointer"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm text-brand-muted mb-1.5">Product id (must match the catalog)</label>
              <input
                type="text"
                value={productIdInput}
                onChange={(event) => setProductIdInput(event.target.value)}
                placeholder="pl-python-beginner-en"
                className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={!pendingFile || uploadState === 'uploading'}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter] shrink-0"
            >
              {uploadState === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploadState === 'uploading' ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {willOverwriteExisting && uploadState !== 'uploading' && (
            <p className="flex items-center gap-1.5 text-brand-yellow text-sm mt-3">
              <AlertCircle size={14} className="shrink-0" />
              A file named "{productIdInput}.pdf" already exists - uploading will replace it.
            </p>
          )}
          {uploadState === 'error' && (
            <p className="flex items-center gap-1.5 text-red-400 text-sm mt-3">
              <AlertCircle size={14} className="shrink-0" />
              {uploadError}
            </p>
          )}
        </form>
      ) : (
        <div className="mb-8 rounded-xl border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-muted">
          You can view files but don't have permission to upload or delete them.
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-red-400 mb-4 text-sm">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {!isLoading && files.length > 0 && (
        <div ref={searchContainerRef} className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          <input
            type="search"
            value={fileSearch}
            onChange={(event) => setFileSearch(event.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            placeholder="Search files by product id…"
            aria-label="Search files by product id"
            className="w-full bg-brand-black border border-brand-border rounded-lg pl-9 pr-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
          />
          {suggestionsOpen && fileSearch.trim() && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto scrollbar-thin rounded-lg border border-brand-border bg-brand-surface shadow-2xl animate-fade-in">
              {suggestions.map((file) => (
                <li
                  key={file.productId}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setFileSearch(file.productId);
                    setSuggestionsOpen(false);
                  }}
                  className="px-3 py-2.5 text-sm cursor-pointer hover:bg-brand-surface-hover transition-colors truncate"
                >
                  {file.productId}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <FileText size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No PDFs uploaded yet.</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Search size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No files match "{fileSearch}".</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-brand-border overflow-hidden">
            <div className="max-h-[55vh] sm:max-h-[60vh] overflow-y-auto scrollbar-thin divide-y divide-brand-border">
              {paginatedFiles.map((file) => (
                <div
                  key={file.key}
                  className="flex items-center gap-4 px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-brand-black border border-brand-border flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-brand-yellow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{file.productId}</p>
                    <p className="text-sm text-brand-muted">
                      {formatSize(file.sizeBytes)}
                      {file.lastModified ? ` · ${new Date(file.lastModified).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  {canManageFiles && (
                    <button
                      type="button"
                      onClick={() => setPasswordTarget(file.productId)}
                      disabled={deletingId === file.productId}
                      aria-label={`Delete ${file.productId}`}
                      className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-red-400 hover:border-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {deletingId === file.productId ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Pagination
            page={safePage}
            totalItems={filteredFiles.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="files"
          />
        </>
      )}

      <PasswordGateDialog
        open={passwordTarget !== null}
        title="Enter CID to continue"
        message={
          passwordTarget
            ? `Deleting "${passwordTarget}.pdf" is a sensitive action. Enter the CID to proceed.`
            : ''
        }
        password={getAdminCid()}
        onCancel={() => setPasswordTarget(null)}
        onVerified={() => {
          const productId = passwordTarget;
          setPasswordTarget(null);
          if (productId) setDeleteTarget(productId);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this PDF?"
        message={
          deleteTarget
            ? `"${deleteTarget}.pdf" will be permanently deleted from storage. Any buyer with access to it will no longer be able to open it. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const productId = deleteTarget;
          setDeleteTarget(null);
          if (productId) performDelete(productId);
        }}
      />
    </div>
  );
};
