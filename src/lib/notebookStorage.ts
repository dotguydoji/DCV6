/**
 * Notebook feature storage - local-first, same posture as
 * libraryPreferences.ts (bookmarks/favorites): stored only in this
 * browser's localStorage, never sent to any server. Notes are personal
 * scratch content tied to a device, not an account.
 */

const STORAGE_KEY = 'dcv6-notebook-data';
export const MAX_TITLE_LENGTH = 50;

export interface NotebookPageData {
  id: string;
  title: string;
  content: string; // sanitized HTML string
  createdAt: number;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: NotebookPageData[];
  isExpanded?: boolean;
}

export interface NotebookStorage {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  activePageId: string | null;
}

export const generateNotebookId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const createDefaultNotebookStorage = (): NotebookStorage => {
  const now = Date.now();
  const defaultPage: NotebookPageData = {
    id: generateNotebookId(),
    title: 'Welcome Note',
    // Empty, same canonical "blank" markup as createPage() below - the
    // editor shows its own "Write your notes here." placeholder (see
    // NotebookEditor.tsx) instead of this seeding real text into the note.
    content: '<div><br></div>',
    createdAt: now,
    updatedAt: now
  };
  const defaultNotebook: Notebook = {
    id: generateNotebookId(),
    title: 'My Notebook',
    createdAt: now,
    updatedAt: now,
    isExpanded: true,
    pages: [defaultPage]
  };

  return {
    notebooks: [defaultNotebook],
    activeNotebookId: defaultNotebook.id,
    activePageId: defaultPage.id
  };
};

const isValidStorage = (value: unknown): value is NotebookStorage =>
  typeof value === 'object' && value !== null && Array.isArray((value as NotebookStorage).notebooks);

/**
 * Detects a notebook saved before the storage-consent prompt existed (or
 * from a prior "granted" session) - used to avoid re-asking someone who
 * already has real notes sitting in localStorage. Deliberately just checks
 * key presence rather than parsing, so it can't itself throw on malformed data.
 */
export const hasExistingNotebookData = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

/** Storage access can throw (Safari Private Browsing, quota limits) - never let that crash the page. */
export const loadNotebookStorage = (): NotebookStorage => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultNotebookStorage();
    const parsed = JSON.parse(raw);
    return isValidStorage(parsed) ? parsed : createDefaultNotebookStorage();
  } catch {
    return createDefaultNotebookStorage();
  }
};

export const saveNotebookStorage = (data: NotebookStorage): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignored on purpose - e.g. storage full or unavailable. The in-memory
    // state still reflects the buyer's edits for the rest of the session.
  }
};

export const createNotebook = (data: NotebookStorage, title = 'New Notebook'): NotebookStorage => {
  const now = Date.now();
  const notebook: Notebook = {
    id: generateNotebookId(),
    title,
    createdAt: now,
    updatedAt: now,
    pages: [],
    isExpanded: true
  };
  return {
    ...data,
    notebooks: [...data.notebooks, notebook],
    activeNotebookId: notebook.id,
    activePageId: null
  };
};

export const createPage = (data: NotebookStorage, notebookId: string, title = 'New Page'): NotebookStorage => {
  const now = Date.now();
  const page: NotebookPageData = {
    id: generateNotebookId(),
    title,
    content: '<div><br></div>',
    createdAt: now,
    updatedAt: now
  };
  return {
    ...data,
    notebooks: data.notebooks.map((nb) =>
      nb.id === notebookId ? { ...nb, pages: [...nb.pages, page], isExpanded: true } : nb
    ),
    activeNotebookId: notebookId,
    activePageId: page.id
  };
};

export const updatePageContent = (data: NotebookStorage, pageId: string, content: string): NotebookStorage => ({
  ...data,
  notebooks: data.notebooks.map((nb) => ({
    ...nb,
    pages: nb.pages.map((page) => (page.id === pageId ? { ...page, content, updatedAt: Date.now() } : page))
  }))
});

export const updateTitle = (
  data: NotebookStorage,
  id: string,
  newTitle: string,
  type: 'notebook' | 'page'
): NotebookStorage => {
  const cleanTitle = newTitle.slice(0, MAX_TITLE_LENGTH);
  return {
    ...data,
    notebooks: data.notebooks.map((nb) => {
      if (type === 'notebook' && nb.id === id) {
        return { ...nb, title: cleanTitle };
      }
      if (type === 'page' && nb.pages.some((p) => p.id === id)) {
        return { ...nb, pages: nb.pages.map((p) => (p.id === id ? { ...p, title: cleanTitle } : p)) };
      }
      return nb;
    })
  };
};

export const toggleNotebookExpanded = (data: NotebookStorage, notebookId: string): NotebookStorage => ({
  ...data,
  notebooks: data.notebooks.map((nb) => (nb.id === notebookId ? { ...nb, isExpanded: !nb.isExpanded } : nb))
});

export const selectPage = (data: NotebookStorage, notebookId: string, pageId: string): NotebookStorage => ({
  ...data,
  activeNotebookId: notebookId,
  activePageId: pageId
});

export const deleteNotebook = (data: NotebookStorage, notebookId: string): NotebookStorage => {
  const remaining = data.notebooks.filter((nb) => nb.id !== notebookId);
  const wasActive = data.activeNotebookId === notebookId;
  return {
    ...data,
    notebooks: remaining,
    activeNotebookId: wasActive ? remaining[0]?.id ?? null : data.activeNotebookId,
    activePageId: wasActive ? null : data.activePageId
  };
};

export const deletePage = (data: NotebookStorage, notebookId: string, pageId: string): NotebookStorage => ({
  ...data,
  notebooks: data.notebooks.map((nb) =>
    nb.id === notebookId ? { ...nb, pages: nb.pages.filter((p) => p.id !== pageId) } : nb
  ),
  activePageId: data.activePageId === pageId ? null : data.activePageId
});

export const getActiveNotebook = (data: NotebookStorage): Notebook | undefined =>
  data.notebooks.find((nb) => nb.id === data.activeNotebookId);

export const getActivePage = (data: NotebookStorage): NotebookPageData | undefined =>
  getActiveNotebook(data)?.pages.find((p) => p.id === data.activePageId);
