import React, { useCallback, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Plus, Trash2, Youtube } from 'lucide-react';
import { AdminFile, ProductVideoGroup, deleteProductVideo, upsertProductVideo } from '../lib/api';
import { ProductAutocomplete } from './ProductAutocomplete';
import { ConfirmDialog } from './ConfirmDialog';

interface ProductVideosPanelProps {
  idToken: string;
  productVideos: ProductVideoGroup[];
  files: AdminFile[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

interface DeleteTarget {
  productId: string;
  videoId: string;
  title: string;
}

export const ProductVideosPanel: React.FC<ProductVideosPanelProps> = ({
  idToken,
  productVideos,
  files,
  isLoading,
  error,
  onRefresh
}) => {
  const [productId, setProductId] = useState('');
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const resetForm = () => {
    setEditingVideoId(null);
    setTitleInput('');
    setUrlInput('');
    setFormError('');
  };

  const currentGroup = useMemo(
    () => productVideos.find((group) => group.productId === productId),
    [productVideos, productId]
  );

  const startEdit = (video: { id: string; title: string; youtubeId: string }) => {
    setEditingVideoId(video.id);
    setTitleInput(video.title);
    setUrlInput(video.youtubeId);
    setFormError('');
  };

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!productId) {
        setFormError('Pick a PDF product first.');
        return;
      }
      const title = titleInput.trim();
      const youtubeUrl = urlInput.trim();
      if (!title || !youtubeUrl) {
        setFormError('Enter a title and the unlisted video link (or id).');
        return;
      }

      setIsSubmitting(true);
      setFormError('');

      try {
        await upsertProductVideo(idToken, productId, {
          id: editingVideoId ?? undefined,
          title,
          youtubeUrl
        });
        resetForm();
        onRefresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [idToken, productId, editingVideoId, titleInput, urlInput, onRefresh]
  );

  const performDelete = useCallback(
    async (target: DeleteTarget) => {
      setBusyId(target.videoId);
      try {
        await deleteProductVideo(idToken, target.productId, target.videoId);
        if (editingVideoId === target.videoId) resetForm();
        onRefresh();
      } finally {
        setBusyId(null);
      }
    },
    [idToken, editingVideoId, onRefresh]
  );

  const totalVideos = productVideos.reduce((sum, group) => sum + group.videos.length, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Premium Videos</h1>
        <p className="text-sm text-brand-muted mt-1">
          {isLoading
            ? 'Loading…'
            : `${totalVideos} video${totalVideos === 1 ? '' : 's'} across ${productVideos.length} product${productVideos.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 bg-brand-surface border border-brand-border rounded-xl p-5">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Youtube size={18} className="text-brand-yellow" />
          {editingVideoId ? 'Edit video' : 'Add unlisted video'}
        </h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-brand-muted mb-1.5">PDF product</label>
            <ProductAutocomplete
              products={files}
              value={productId ? [productId] : []}
              onChange={(ids) => setProductId(ids[ids.length - 1] ?? '')}
              placeholder="Search products…"
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-sm text-brand-muted mb-1.5">Video title</label>
              <input
                type="text"
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                placeholder="Match the actual YouTube video title"
                className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm text-brand-muted mb-1.5">Unlisted video link or id</label>
              <input
                type="text"
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://youtu.be/…"
                className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              {editingVideoId && (
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
                {isSubmitting ? 'Saving…' : editingVideoId ? 'Save' : 'Add'}
              </button>
            </div>
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
      ) : productId && !currentGroup ? (
        <div className="rounded-xl border border-dashed border-brand-border py-12 text-center">
          <Youtube size={28} className="mx-auto text-brand-muted mb-2" />
          <p className="text-brand-muted">No videos yet for {productId}.</p>
        </div>
      ) : productId && currentGroup ? (
        <div className="rounded-xl border border-brand-border overflow-hidden">
          <div className="divide-y divide-brand-border">
            {currentGroup.videos.map((video) => (
              <div
                key={video.id}
                className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-bold truncate">{video.title}</p>
                  <p className="text-xs text-brand-muted font-mono truncate">{video.youtubeId}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(video)}
                    aria-label={`Edit ${video.title}`}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-brand-muted hover:border-brand-yellow hover:text-brand-yellow transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ productId, videoId: video.id, title: video.title })}
                    disabled={busyId === video.id}
                    aria-label={`Delete ${video.title}`}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-red-400 hover:border-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                  >
                    {busyId === video.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-border overflow-hidden">
          <div className="divide-y divide-brand-border">
            {productVideos.length === 0 ? (
              <div className="py-12 text-center">
                <Youtube size={28} className="mx-auto text-brand-muted mb-2" />
                <p className="text-brand-muted">No premium videos added yet.</p>
              </div>
            ) : (
              productVideos.map((group) => (
                <button
                  key={group.productId}
                  type="button"
                  onClick={() => setProductId(group.productId)}
                  className="w-full text-left px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors flex items-center justify-between gap-4"
                >
                  <span className="font-bold">{group.productId}</span>
                  <span className="text-sm text-brand-muted shrink-0">
                    {group.videos.length} video{group.videos.length === 1 ? '' : 's'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this video?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" will no longer be available to buyers of ${deleteTarget.productId}. This can't be undone.`
            : ''
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) performDelete(target);
        }}
      />
    </div>
  );
};
