import React, { useCallback, useEffect, useState } from 'react';
import {
  Book, FileText, Plus, Trash2, ChevronRight, ChevronDown,
  FolderOpen, X, ChevronsLeft, PanelLeft,
  CloudOff, ShieldAlert
} from 'lucide-react';
import { NotebookEditor, NotebookDeleteModal } from './NotebookEditor';
import { NotebookConsentModal } from './NotebookConsentModal';
import {
  NotebookStorage,
  loadNotebookStorage,
  saveNotebookStorage,
  createDefaultNotebookStorage,
  hasExistingNotebookData,
  createNotebook as createNotebookAction,
  createPage as createPageAction,
  updatePageContent as updatePageContentAction,
  updateTitle as updateTitleAction,
  toggleNotebookExpanded,
  selectPage as selectPageAction,
  deleteNotebook as deleteNotebookAction,
  deletePage as deletePageAction,
  getActiveNotebook,
  getActivePage
} from '../../lib/notebookStorage';
import {
  getNotebookConsentStatus,
  isLocalStorageAvailable,
  setNotebookConsentStatus
} from '../../lib/notebookConsent';

type PersistMode = 'checking' | 'ask' | 'persist' | 'memory-only' | 'unavailable';

interface DeleteModalState {
  isOpen: boolean;
  type: 'Notebook' | 'Page';
  id: string;
  title: string;
  parentId?: string;
}

interface NotebookWorkspaceProps {
  /** 'full' = dedicated standalone page (roomy). 'panel' = compact side panel inside the PDF viewer. */
  variant?: 'full' | 'panel';
}

export const NotebookWorkspace: React.FC<NotebookWorkspaceProps> = ({ variant = 'full' }) => {
  const isPanel = variant === 'panel';
  const [data, setData] = useState<NotebookStorage | null>(null);
  const [persistMode, setPersistMode] = useState<PersistMode>('checking');
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isPanel);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  // The Notebook has no backend at all - every note lives only in this
  // browser's localStorage. The first time it's opened on a device, that
  // needs to be an explicit choice rather than a silent write the moment
  // someone starts typing. Buyers who already have saved notes (from
  // before this consent flow existed, or from a prior "allow" here) skip
  // straight to loading them - re-asking someone with real data already on
  // disk would just be confusing, not more protective.
  useEffect(() => {
    if (!isLocalStorageAvailable()) {
      setData(createDefaultNotebookStorage());
      setPersistMode('unavailable');
      return;
    }

    const consent = getNotebookConsentStatus();
    if (consent === 'granted') {
      setData(loadNotebookStorage());
      setPersistMode('persist');
    } else if (consent === 'declined') {
      setData(createDefaultNotebookStorage());
      setPersistMode('memory-only');
    } else if (hasExistingNotebookData()) {
      setNotebookConsentStatus('granted');
      setData(loadNotebookStorage());
      setPersistMode('persist');
    } else {
      setData(createDefaultNotebookStorage());
      setPersistMode('ask');
    }
  }, []);

  useEffect(() => {
    if (data && persistMode === 'persist') saveNotebookStorage(data);
  }, [data, persistMode]);

  const handleAllowStorage = useCallback(() => {
    setNotebookConsentStatus('granted');
    setPersistMode('persist');
  }, []);

  const handleDeclineStorage = useCallback(() => {
    setNotebookConsentStatus('declined');
    setPersistMode('memory-only');
  }, []);

  const activeNotebook = data ? getActiveNotebook(data) : undefined;
  const activePage = data ? getActivePage(data) : undefined;

  const handleCreateNotebook = useCallback(() => {
    setData((prev) => (prev ? createNotebookAction(prev) : prev));
  }, []);

  const handleCreatePage = useCallback((notebookId: string) => {
    setData((prev) => (prev ? createPageAction(prev, notebookId) : prev));
  }, []);

  const handleUpdateContent = useCallback((content: string) => {
    setData((prev) => (prev && prev.activePageId ? updatePageContentAction(prev, prev.activePageId, content) : prev));
  }, []);

  const handleUpdateTitle = useCallback((id: string, newTitle: string, type: 'notebook' | 'page') => {
    setData((prev) => (prev ? updateTitleAction(prev, id, newTitle, type) : prev));
  }, []);

  const handleToggleNotebook = useCallback((id: string) => {
    setData((prev) => (prev ? toggleNotebookExpanded(prev, id) : prev));
  }, []);

  const handleSelectPage = useCallback((notebookId: string, pageId: string) => {
    setData((prev) => (prev ? selectPageAction(prev, notebookId, pageId) : prev));
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, []);

  const handleDelete = useCallback(() => {
    if (!deleteModal) return;
    setData((prev) => {
      if (!prev) return prev;
      return deleteModal.type === 'Notebook'
        ? deleteNotebookAction(prev, deleteModal.id)
        : deletePageAction(prev, deleteModal.parentId!, deleteModal.id);
    });
    setDeleteModal(null);
  }, [deleteModal]);

  if (!data || persistMode === 'checking') {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading Notebook…
      </div>
    );
  }

  if (persistMode === 'ask') {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <NotebookConsentModal onAllow={handleAllowStorage} onDecline={handleDeclineStorage} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <NotebookDeleteModal
        isOpen={!!deleteModal}
        title={deleteModal?.title || ''}
        type={deleteModal?.type || 'Item'}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />

      {persistMode === 'memory-only' && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-hairline bg-amber-500/10 text-amber-600 text-xs shrink-0">
          <span className="flex items-center gap-2 min-w-0">
            <CloudOff className="w-4 h-4 shrink-0" />
            <span className="truncate">Not saving - your notes will be lost when you close this tab.</span>
          </span>
          <button
            type="button"
            onClick={handleAllowStorage}
            className="shrink-0 font-bold uppercase tracking-wider underline underline-offset-2 hover:opacity-80"
          >
            Enable saving
          </button>
        </div>
      )}

      {persistMode === 'unavailable' && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-hairline bg-red-500/10 text-red-500 text-xs shrink-0">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span className="truncate">Local storage isn't available in this browser - your notes won't be saved after this tab closes.</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <div
          className={`
            ${isPanel ? 'absolute md:relative' : 'fixed md:relative'} z-30 h-full bg-surface border-r border-border-hairline flex flex-col transition-all duration-300 ease-in-out overflow-hidden shrink-0
            w-56
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${isSidebarOpen ? 'md:w-56 opacity-100' : 'md:w-0 md:opacity-0 md:border-r-0'}
          `}
        >
          <div className="w-56 h-full flex flex-col">
            <div className="p-3 border-b border-border-hairline flex items-center justify-between bg-surface shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 -ml-1 rounded-sm hover:bg-surface-secondary text-text-secondary hover:text-text-primary transition-colors">
                  <ChevronsLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-text-primary flex items-center gap-2 text-sm truncate"><Book className="w-4 h-4 shrink-0" /> Notebooks</h2>
              </div>
              <button onClick={handleCreateNotebook} className="p-1.5 rounded-sm hover:bg-surface-secondary text-text-secondary hover:text-text-primary shrink-0" title="New Notebook">
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {data.notebooks.map((nb) => (
                <div key={nb.id} className="mb-2">
                  <div className={`group flex items-center gap-1 px-2 py-1.5 rounded-sm cursor-pointer ${data.activeNotebookId === nb.id ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/60'}`}>
                    <button onClick={(e) => { e.stopPropagation(); handleToggleNotebook(nb.id); }} className="text-text-secondary hover:text-text-primary p-0.5 shrink-0">
                      {nb.isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <input
                      className="bg-transparent text-sm font-bold text-text-primary focus:outline-none w-full min-w-0"
                      value={nb.title}
                      onChange={(e) => handleUpdateTitle(nb.id, e.target.value, 'notebook')}
                      onClick={() => setData((prev) => (prev ? { ...prev, activeNotebookId: nb.id } : prev))}
                    />
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => handleCreatePage(nb.id)} className="p-1 text-text-secondary hover:text-text-primary" title="Add Page"><Plus className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteModal({ isOpen: true, type: 'Notebook', id: nb.id, title: nb.title })} className="p-1 text-text-secondary hover:text-red-500" title="Delete Notebook"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>

                  {nb.isExpanded && (
                    <div className="ml-4 pl-2 border-l border-border-hairline mt-1 space-y-0.5">
                      {nb.pages.map((page) => (
                        <div
                          key={page.id}
                          onClick={() => handleSelectPage(nb.id, page.id)}
                          className={`group flex items-center justify-between px-2 py-1.5 rounded-sm cursor-pointer text-xs ${data.activePageId === page.id ? 'bg-surface-inverted text-text-inverted font-bold' : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary/40'}`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden min-w-0">
                            <FileText className="w-3 h-3 shrink-0" />
                            {data.activePageId === page.id ? (
                              <input
                                value={page.title}
                                onChange={(e) => handleUpdateTitle(page.id, e.target.value, 'page')}
                                className="bg-transparent focus:outline-none w-full min-w-0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span className="truncate">{page.title}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, type: 'Page', id: page.id, title: page.title, parentId: nb.id }); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded-sm shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {nb.pages.length === 0 && (
                        <div className="px-2 py-1 text-[10px] text-text-secondary italic">No pages</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {isPanel && isSidebarOpen && (
          <div className="absolute inset-0 z-20 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} role="presentation" />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface">
          <div className="h-12 border-b border-border-hairline flex items-center px-3 justify-between bg-surface shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`p-1 rounded-sm hover:bg-surface-secondary text-text-secondary hover:text-text-primary transition-colors shrink-0 ${!isSidebarOpen ? 'text-text-primary' : ''}`}
                title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              {activePage ? (
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-text-secondary truncate">{activeNotebook?.title} /</span>
                  <span className="font-bold text-text-primary text-sm truncate">{activePage.title}</span>
                </div>
              ) : (
                <span className="text-text-secondary text-sm italic">Select a page</span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-2 md:p-4 relative min-h-0">
            {activePage ? (
              <NotebookEditor
                key={activePage.id}
                content={activePage.content}
                onUpdate={handleUpdateContent}
                compact={isPanel}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-secondary opacity-70 border-2 border-dashed border-border-hairline rounded-sm">
                <Book className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">Select or create a page to start writing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
