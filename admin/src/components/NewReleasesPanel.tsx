import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, Image as ImageIcon, Loader2, Pencil, Plus, Sparkles, Trash2, Youtube } from 'lucide-react';
import {
  AdminFile,
  NewReleasePdf,
  NewReleaseVideo,
  deleteNewRelease,
  getNewReleaseUploadUrl,
  upsertNewRelease,
  uploadNewReleaseThumbnail
} from '../lib/api';
import { ProductAutocomplete } from './ProductAutocomplete';
import { ConfirmDialog } from './ConfirmDialog';

interface NewReleasesPanelProps {
  idToken: string;
  files: AdminFile[];
  videos: NewReleaseVideo[];
  pdfs: NewReleasePdf[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const MAX_VIDEOS = 2;

// Same public bucket product thumbnails already load from - see
// admin/src/vite-env.d.ts and publicR2Client.ts for why this is a separate
// credential/bucket from the private PDF one.
const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? '';
const thumbnailUrl = (key: string) => `${IMAGE_BASE_URL}/${key}`;

type Kind = 'video' | 'pdf';

interface DeleteTarget {
  kind: Kind;
  id: string;
  title: string;
}

interface FormState {
  id: string | null;
  title: string;
  description: string;
  thumbnailKey: string;
  youtubeUrl: string;
  productId: string;
}

const EMPTY_FORM: FormState = { id: null, title: '', description: '', thumbnailKey: '', youtubeUrl: '', productId: '' };

const EditorCard: React.FC<{
  kind: Kind;
  idToken: string;
  files: AdminFile[];
  items: (NewReleaseVideo | NewReleasePdf)[];
  atCap: boolean;
  onRefresh: () => void;
  onRequestDelete: (target: DeleteTarget) => void;
  busyId: string | null;
}> = ({ kind, idToken, files, items, atCap, onRefresh, onRequestDelete, busyId }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingThumbnail, setPendingThumbnail] = useState<File | null>(null);
  // A data: URL, not URL.createObjectURL()'s blob: URL - "data:" is already
  // allowed by both sites' img-src CSP (nothing to add there), whereas
  // blob: isn't, and adding it just for a local file preview isn't worth
  // widening the policy for.
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const isEditing = form.id !== null;
  const label = kind === 'video' ? 'New Video' : 'New PDF Release';

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setPendingThumbnail(null);
    setPreviewDataUrl(null);
    setFormError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startEdit = (entry: NewReleaseVideo | NewReleasePdf) => {
    setForm({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      thumbnailKey: entry.thumbnailKey,
      youtubeUrl: kind === 'video' ? (entry as NewReleaseVideo).youtubeId : '',
      productId: kind === 'pdf' ? (entry as NewReleasePdf).productId : ''
    });
    setPendingThumbnail(null);
    setPreviewDataUrl(null);
    setFormError('');
  };

  const handleFilePick = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingThumbnail(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setFormError('');

      const title = form.title.trim();
      const description = form.description.trim();
      if (!title || !description) {
        setFormError('Enter a title and description.');
        return;
      }
      if (kind === 'video' && !form.youtubeUrl.trim()) {
        setFormError('Enter the YouTube link.');
        return;
      }
      if (kind === 'pdf' && !form.productId) {
        setFormError('Pick which PDF this release links to.');
        return;
      }
      if (!form.thumbnailKey && !pendingThumbnail) {
        setFormError('Choose a thumbnail image.');
        return;
      }
      if (!isEditing && atCap) {
        setFormError(`Only ${MAX_VIDEOS} New Videos can be listed at once - remove one first.`);
        return;
      }

      setIsSubmitting(true);
      try {
        let thumbnailKey = form.thumbnailKey;

        if (pendingThumbnail) {
          setIsUploading(true);
          const ext = pendingThumbnail.name.split('.').pop()?.toLowerCase() ?? '';
          const { url, key } = await getNewReleaseUploadUrl(idToken, ext);
          await uploadNewReleaseThumbnail(url, pendingThumbnail);
          thumbnailKey = key;
          setIsUploading(false);
        }

        await upsertNewRelease(idToken, kind, {
          id: form.id ?? undefined,
          title,
          description,
          thumbnailKey,
          ...(kind === 'video' ? { youtubeUrl: form.youtubeUrl.trim() } : { productId: form.productId })
        });

        resetForm();
        onRefresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsSubmitting(false);
        setIsUploading(false);
      }
    },
    [form, pendingThumbnail, kind, isEditing, atCap, idToken, onRefresh]
  );

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-6 bg-brand-surface border border-brand-border rounded-xl p-5">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          {kind === 'video' ? (
            <Youtube size={18} className="text-brand-yellow" />
          ) : (
            <FileText size={18} className="text-brand-yellow" />
          )}
          {isEditing ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="shrink-0">
              <label className="block text-sm text-brand-muted mb-1.5">Thumbnail</label>
              <div className="flex items-center gap-3">
                <div className="w-24 h-16 rounded-lg overflow-hidden bg-brand-black border border-brand-border flex items-center justify-center shrink-0">
                  {previewDataUrl ? (
                    <img src={previewDataUrl} alt="" className="w-full h-full object-cover" />
                  ) : form.thumbnailKey ? (
                    <img src={thumbnailUrl(form.thumbnailKey)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={20} className="text-brand-muted" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/webp,image/png,image/jpeg"
                  onChange={handleFilePick}
                  className="block text-xs text-brand-muted file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-brand-yellow file:text-brand-black file:font-bold file:cursor-pointer file:text-xs cursor-pointer max-w-[140px]"
                />
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <div>
                <label className="block text-sm text-brand-muted mb-1.5">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
                  placeholder={kind === 'video' ? 'New video title' : 'New PDF title'}
                  className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-brand-muted mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
                  placeholder="Short description shown in My Library"
                  rows={2}
                  className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors resize-none"
                />
              </div>
            </div>
          </div>

          {kind === 'video' ? (
            <div>
              <label className="block text-sm text-brand-muted mb-1.5">YouTube link or id</label>
              <input
                type="text"
                value={form.youtubeUrl}
                onChange={(event) => setForm((f) => ({ ...f, youtubeUrl: event.target.value }))}
                placeholder="https://youtu.be/…"
                className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-brand-muted mb-1.5">Links to which PDF</label>
              <ProductAutocomplete
                products={files}
                value={form.productId ? [form.productId] : []}
                onChange={(ids) => setForm((f) => ({ ...f, productId: ids[ids.length - 1] ?? '' }))}
                placeholder="Search products…"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            {isEditing && (
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
              disabled={isSubmitting || (!isEditing && atCap)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter]"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {isSubmitting ? (isUploading ? 'Uploading…' : 'Saving…') : isEditing ? 'Save' : 'Add'}
            </button>
          </div>
        </div>

        {!isEditing && atCap && (
          <p className="flex items-center gap-1.5 text-brand-yellow text-sm mt-3">
            <AlertCircle size={14} className="shrink-0" />
            Only {MAX_VIDEOS} New Videos can be listed at once - remove one below first.
          </p>
        )}
        {formError && (
          <p className="flex items-center gap-1.5 text-red-400 text-sm mt-3">
            <AlertCircle size={14} className="shrink-0" />
            {formError}
          </p>
        )}
      </form>

      <div className="rounded-xl border border-brand-border overflow-hidden">
        <div className="divide-y divide-brand-border">
          {items.length === 0 ? (
            <div className="py-10 text-center">
              <Sparkles size={24} className="mx-auto text-brand-muted mb-2" />
              <p className="text-brand-muted text-sm">Nothing here yet.</p>
            </div>
          ) : (
            items.map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-3.5 bg-brand-surface hover:bg-brand-surface-hover transition-colors flex items-center gap-3"
              >
                <div className="w-14 h-10 rounded-lg overflow-hidden bg-brand-black border border-brand-border shrink-0">
                  <img src={thumbnailUrl(entry.thumbnailKey)} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{entry.title}</p>
                  <p className="text-xs text-brand-muted truncate">
                    {kind === 'video' ? (entry as NewReleaseVideo).youtubeId : (entry as NewReleasePdf).productId}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(entry)}
                    aria-label={`Edit ${entry.title}`}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-brand-muted hover:border-brand-yellow hover:text-brand-yellow transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestDelete({ kind, id: entry.id, title: entry.title })}
                    disabled={busyId === entry.id}
                    aria-label={`Delete ${entry.title}`}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-red-400 hover:border-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                  >
                    {busyId === entry.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const NewReleasesPanel: React.FC<NewReleasesPanelProps> = ({
  idToken,
  files,
  videos,
  pdfs,
  isLoading,
  error,
  onRefresh
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const performDelete = useCallback(
    async (target: DeleteTarget) => {
      setBusyId(target.id);
      try {
        await deleteNewRelease(idToken, target.kind, target.id);
        onRefresh();
      } finally {
        setBusyId(null);
      }
    },
    [idToken, onRefresh]
  );

  const sortedVideos = useMemo(() => [...videos].sort((a, b) => b.addedAt - a.addedAt), [videos]);
  const sortedPdfs = useMemo(() => [...pdfs].sort((a, b) => b.addedAt - a.addedAt), [pdfs]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Releases</h1>
        <p className="text-sm text-brand-muted mt-1">
          {isLoading ? 'Loading…' : 'Shown at the top of every buyer\'s My Library page.'}
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
            <div key={i} className="h-20 rounded-xl bg-brand-surface border border-brand-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-brand-muted mb-3">
              New Videos Uploaded ({sortedVideos.length}/{MAX_VIDEOS})
            </h2>
            <EditorCard
              kind="video"
              idToken={idToken}
              files={files}
              items={sortedVideos}
              atCap={sortedVideos.length >= MAX_VIDEOS}
              onRefresh={onRefresh}
              onRequestDelete={setDeleteTarget}
              busyId={busyId}
            />
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-brand-muted mb-3">
              New PDF Releases ({sortedPdfs.length})
            </h2>
            <EditorCard
              kind="pdf"
              idToken={idToken}
              files={files}
              items={sortedPdfs}
              atCap={false}
              onRefresh={onRefresh}
              onRequestDelete={setDeleteTarget}
              busyId={busyId}
            />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this entry?"
        message={deleteTarget ? `"${deleteTarget.title}" will no longer show in My Library. This can't be undone.` : ''}
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
