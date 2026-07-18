import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import {
  Book, FileText, Bold, Italic, Underline, Strikethrough, Highlighter,
  Eraser, Type, Download, FilePlus,
  AlertTriangle,
  Minus, Table as TableIcon, PaintBucket,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, XCircle, Trash2,
  Code, Code2, Link as LinkIcon,
  List, ListOrdered, ListChecks, Subscript, Superscript,
  Undo2, Redo2, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ZoomIn, ZoomOut
} from 'lucide-react';
import { highlightNotebookCode, isKnownNotebookLanguage, NOTEBOOK_CODE_LANGUAGES } from '../../lib/notebookSyntaxHighlight';

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

// Purely a visual zoom on the note content (CSS `zoom`, not a change to
// any saved font-size) - separate from the PDF viewer's own zoom, and
// scoped to just the contentEditable surface so the toolbar stays a
// consistent, always-legible size regardless of zoom level.
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1;

// A pause this long in typing is treated as "the user finished this
// thought" - one undo step then covers the whole burst of keystrokes
// (matches standard editor behavior: undoing continuous typing removes a
// whole word/sentence at a time, not one character per Ctrl+Z). Discrete
// actions (a toolbar click, inserting a table/code block, toggling a
// checklist) instead flush immediately via flushHistoryNow(), each
// becoming its own atomic undo step regardless of this timer.
const HISTORY_DEBOUNCE_MS = 400;
const MAX_HISTORY_ENTRIES = 100;

// A caret positioned exactly at the very end of a text node's data - i.e.
// right after a trailing '\n' with nothing following it - isn't a reliable
// typing anchor in Chrome: the Selection API reports it correctly, but the
// very next keystroke can land one position early (before the '\n')
// instead of after it. Inserting this invisible marker right after every
// newline gives the caret a real character to sit in front of instead of
// dangling at the node's absolute end, without affecting anything visible.
// Stripped out again wherever code-block text is actually read (lastLineBlank/
// isAtEnd checks, Prism highlighting) - it's purely a transient typing aid.
const CODE_CARET_ANCHOR = '​';
const stripCodeCaretAnchor = (text: string) => text.split(CODE_CARET_ANCHOR).join('');

// Single names only, deliberately - no comma-separated fallback stacks
// (e.g. "Arial, Helvetica, sans-serif"). The sanitizer's style-value
// allowlist (SAFE_SIMPLE_CSS_VALUE below) rejects commas on purpose, since
// that's one of the characters a more complex CSS value smuggling attempt
// would need - these are picked from universally-preinstalled OS fonts so
// a missing fallback is a non-issue in practice.
const NOTEBOOK_FONTS: { value: string; label: string }[] = [
  { value: '', label: 'Default' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' }
];

const BLOCK_FORMATS: { value: string; label: string }[] = [
  { value: 'DIV', label: 'Paragraph' },
  { value: 'H1', label: 'Heading 1' },
  { value: 'H2', label: 'Heading 2' },
  { value: 'H3', label: 'Heading 3' },
  { value: 'H4', label: 'Heading 4' },
  { value: 'H5', label: 'Heading 5' },
  { value: 'H6', label: 'Heading 6' },
  { value: 'BLOCKQUOTE', label: 'Quote' }
];

DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
  if ('target' in node) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Defense-in-depth on top of the strict ALLOWED_ATTR allowlist below (which
// already excludes on* handlers entirely) - catches any stray event-handler
// attribute regardless of name, before the later attribute-stage filtering
// even runs.
DOMPurify.addHook('uponSanitizeElement', (node: Node) => {
  if (!(node instanceof HTMLElement)) return;
  Array.from(node.attributes).forEach((attr) => {
    if (attr.name.toLowerCase().startsWith('on')) node.removeAttribute(attr.name);
  });
});

// Vanilla DOMPurify has no built-in "allowed CSS properties" option - the
// `style` attribute, once allowlisted, would otherwise pass through
// completely unfiltered (no per-property/value checking at all). This hook
// re-parses `style` by hand and rebuilds it from only a fixed set of safe
// properties with safe-shaped values, rejecting anything with url(),
// expression(), @import, or javascript: outright - the only place actual
// CSS injection into this editor could otherwise happen.
const ALLOWED_STYLE_PROPS = new Set([
  'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'border', 'border-top', 'border-left', 'border-right', 'border-bottom', 'border-collapse', 'border-radius',
  'white-space', 'tab-size', 'width', 'min-width', 'max-width', 'height',
  'display', 'word-break', 'overflow-wrap', 'vertical-align', 'table-layout',
  'text-align', 'text-decoration', 'text-decoration-line'
]);
const SAFE_SIMPLE_CSS_VALUE = /^[a-zA-Z0-9#.%\s-]+$/;
const SAFE_CSS_COLOR_FUNC = /^(rgb|rgba|hsl|hsla)\([0-9.,%\s]+\)$/i;
const DANGEROUS_CSS_PATTERN = /url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:/i;

const isSafeCssValue = (value: string): boolean => {
  if (DANGEROUS_CSS_PATTERN.test(value)) return false;
  return SAFE_SIMPLE_CSS_VALUE.test(value) || SAFE_CSS_COLOR_FUNC.test(value);
};

DOMPurify.addHook('uponSanitizeAttribute', (_node: Element, data: any) => {
  if (data.attrName === 'style') {
    const safeDeclarations: string[] = [];
    data.attrValue.split(';').forEach((declaration: string) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex === -1) return;
      const prop = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (!value || !ALLOWED_STYLE_PROPS.has(prop) || !isSafeCssValue(value)) return;
      safeDeclarations.push(`${prop}: ${value}`);
    });
    data.attrValue = safeDeclarations.join('; ');
    return;
  }

  // Our own code only ever produces 'false' - clamping here means a
  // tampered/hand-edited value can't turn a checklist marker (or any other
  // structural span) into an independently editable island.
  if (data.attrName === 'contenteditable' && data.attrValue !== 'false') {
    data.keepAttr = false;
    return;
  }

  if (data.attrName === 'data-checked' && data.attrValue !== 'true' && data.attrValue !== 'false') {
    data.attrValue = 'false';
  }

  // Our own code only ever writes one of NOTEBOOK_CODE_LANGUAGES' values
  // here - clamping to that same allowlist means a tampered/hand-edited
  // value can't smuggle anything through as a "language" (it's only ever
  // used to look up a Prism grammar by exact key, so there's no real
  // injection vector either way, but this keeps stored data self-consistent).
  if (data.attrName === 'data-language' && !isKnownNotebookLanguage(data.attrValue)) {
    data.attrValue = 'plaintext';
  }
});

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'br', 'p', 'span', 'b', 'i', 'u', 's', 'a',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'table', 'tbody', 'thead', 'tr', 'td', 'th', 'font',
    'sub', 'sup'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'style', 'class', 'colspan', 'rowspan', 'align', 'size',
    'data-checked', 'contenteditable', 'data-language'
  ],
  FORBID_TAGS: ['style', 'script', 'iframe', 'img', 'video', 'audio', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  KEEP_CONTENT: true
};

const sanitize = (html: string) => DOMPurify.sanitize(html, PURIFY_CONFIG);

// The editor's own "blank" markup takes a couple of different exact shapes
// depending on how it got there (storage's seed/new-page template is plain
// '<div><br></div>', while typing-then-deleting-everything re-normalizes to
// a version with an inline font-size style - see handleInput below) -
// stripping tags/&nbsp; and checking for leftover visible text covers all
// of them without caring which one produced the current markup.
//
// A code block, heading, ruler, table, or checklist item can all exist
// with zero visible text (an empty code block, an <h1><br></h1> right
// after picking "Heading 1" before typing anything) - text-only emptiness
// checking would then wrongly still call the page "empty" and show the
// placeholder overlapping the inserted element. Any of these structural
// tags/classes being present means the user has already inserted
// something, regardless of whether they've typed a visible character yet.
const NON_EMPTY_ELEMENT_PATTERN =
  /<(h[1-6]|hr|table|ul|ol)[\s>]|class="[^"]*\b(notebook-code-block|notebook-checklist-item)\b/i;

const isNoteContentEmpty = (html: string): boolean => {
  if (NON_EMPTY_ELEMENT_PATTERN.test(html)) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length === 0;
};

interface NotebookEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export const NotebookDeleteModal: React.FC<{
  isOpen: boolean;
  title: string;
  type: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, title, type, onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => cancelRef.current?.focus(), 100);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="bg-surface border border-border-hairline rounded-sm w-full max-w-sm p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notebook-delete-title"
      >
        <div className="flex items-center gap-3 mb-4 text-red-500">
          <div className="p-2 bg-red-500/10 rounded-full">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 id="notebook-delete-title" className="text-lg font-bold text-text-primary">Delete {type}?</h3>
        </div>
        <p className="text-text-secondary text-sm mb-6 leading-relaxed">
          Are you sure you want to remove <span className="text-text-primary font-bold">"{title}"</span>?
          {type === 'Notebook' && ' This will delete all pages inside it.'}
          <br />This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={`p-2 rounded-sm hover:bg-surface transition-colors ${active ? 'text-text-primary bg-surface' : 'text-text-secondary hover:text-text-primary'}`}
  >
    {children}
  </button>
);

const FORMAT_STATE_COMMANDS = [
  'bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript',
  'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'
] as const;

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
  content, onUpdate, readOnly = false, compact
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);
  const [foreColor, setForeColor] = useState('#c98a3a');
  const [backColor, setBackColor] = useState('#FFFFFF');
  const [fontSize, setFontSize] = useState('16');
  const [fontFamily, setFontFamily] = useState('');
  const [blockFormat, setBlockFormat] = useState('DIV');
  const [formatState, setFormatState] = useState<Record<string, boolean>>({});
  const [wordCount, setWordCount] = useState({ words: 0, characters: 0 });

  // The code block the caret is currently inside, if any - drives the
  // contextual language picker in the toolbar. previousCodeBlockRef tracks
  // the same thing across renders so syncSelectionState can tell "the
  // caret just left a code block" apart from "still typing inside it" and
  // trigger re-highlighting only at that transition, not on every keystroke.
  const [activeCodeBlock, setActiveCodeBlock] = useState<HTMLElement | null>(null);
  const previousCodeBlockRef = useRef<HTMLElement | null>(null);

  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);

  // Custom undo/redo history, replacing reliance on the browser's native
  // execCommand('undo'/'redo') - that native stack doesn't reliably track
  // changes made via direct DOM manipulation (checklists, code blocks,
  // tables, font-size/color spans), which is most of what this editor
  // actually does, so undo would silently miss or corrupt those. Plain
  // HTML snapshots, most recent at the end; historyIndexRef points at the
  // entry currently shown. Refs (not state) since every keystroke touches
  // these and re-rendering on each one would be wasteful - nothing here is
  // ever rendered directly.
  const historyStackRef = useRef<string[]>([content]);
  const historyIndexRef = useRef(0);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set for the duration of applyHistoryEntry's own innerHTML swap so that
  // swap doesn't get misread as a new user edit and re-enter the history
  // it's currently replaying.
  const isApplyingHistoryRef = useRef(false);

  const [showSavedToast, setShowSavedToast] = useState(false);
  const savedToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const downloadNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHrMenu, setShowHrMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const [hrThickness, setHrThickness] = useState(2);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [activeTable, setActiveTable] = useState<HTMLTableElement | null>(null);
  const [activeCell, setActiveCell] = useState<HTMLTableCellElement | null>(null);

  const [rowColor, setRowColor] = useState('#FFFFFF');
  const [colColor, setColColor] = useState('#FFFFFF');

  const savedSelection = useRef<Range | null>(null);

  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const hrMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.queryCommandSupported?.('defaultParagraphSeparator')) {
      document.execCommand('defaultParagraphSeparator', false, 'div');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (downloadNoticeTimeoutRef.current) clearTimeout(downloadNoticeTimeoutRef.current);
    };
  }, []);

  const showDownloadNotice = (message: string) => {
    if (downloadNoticeTimeoutRef.current) clearTimeout(downloadNoticeTimeoutRef.current);
    setDownloadNotice(message);
    downloadNoticeTimeoutRef.current = setTimeout(() => setDownloadNotice(null), 5000);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false);
        setDownloadNotice(null);
      }
      if (hrMenuRef.current && !hrMenuRef.current.contains(event.target as Node)) setShowHrMenu(false);
      if (tableMenuRef.current && !tableMenuRef.current.contains(event.target as Node)) setShowTableMenu(false);
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      const sanitizedContent = sanitize(content);
      if (editorRef.current.innerHTML !== sanitizedContent) {
        editorRef.current.innerHTML = sanitizedContent;
      }
      if (editorRef.current.innerHTML === '' || editorRef.current.innerHTML === '<br>') {
        editorRef.current.innerHTML = '<div><br></div>';
      }

      // An externally-driven content change (a different notebook page was
      // selected) is a different document entirely - the undo/redo history
      // must not let the user undo back across a page switch into a
      // previous page's content.
      if (historyDebounceRef.current) {
        clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = null;
      }
      historyStackRef.current = [editorRef.current.innerHTML];
      historyIndexRef.current = 0;

      const plainText = editorRef.current.innerText.trim();
      setWordCount({
        words: plainText ? plainText.split(/\s+/).length : 0,
        characters: plainText.length
      });
    }
    isInternalUpdate.current = false;
  }, [content]);

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedSelection.current = range;
      }
    }
  };

  // Records the caret as a path of child-node indices from the editor root
  // down to the exact text node/offset it's in - cheap to re-walk after an
  // innerHTML replacement as long as the DOM shape is still roughly the
  // same (true for an attribute-only sanitize pass, which is the only
  // caller of this), unlike a live Range/Selection object which goes stale
  // the instant its nodes are replaced.
  const getCaretPath = (root: HTMLElement): { path: number[]; offset: number } | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;

    const path: number[] = [];
    let node: Node | null = range.startContainer;
    while (node && node !== root) {
      const parent: Node | null = node.parentNode;
      if (!parent) return null;
      const idx = Array.prototype.indexOf.call(parent.childNodes, node);
      if (idx === -1) return null;
      path.unshift(idx);
      node = parent;
    }
    return { path, offset: range.startOffset };
  };

  const restoreCaretFromPath = (root: HTMLElement, { path, offset }: { path: number[]; offset: number }) => {
    let node: Node = root;
    for (const idx of path) {
      const child: Node | undefined = node.childNodes[idx];
      if (!child) break;
      node = child;
    }
    const maxOffset = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
    const clampedOffset = Math.min(Math.max(offset, 0), maxOffset);
    try {
      const range = document.createRange();
      range.setStart(node, clampedOffset);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // Shape diverged too much to trust the path (e.g. a disallowed node
      // was actually removed, not just stripped of an attribute) - leaving
      // the caret wherever the browser already put it beats throwing.
    }
  };

  const restoreRange = () => {
    // document.execCommand silently no-ops on a selection whose text lives
    // inside the editor if document.activeElement isn't the editor itself
    // - true even though window.getSelection() still reports the old
    // Range intact. Every toolbar control that isn't the contentEditable
    // div (a <select>, a color <input>) steals focus the instant it's
    // interacted with, which is exactly when this function's callers need
    // execCommand to actually do something - so focus has to be restored
    // first, before the saved Range is reapplied.
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedSelection.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  };

  // Commits the editor's CURRENT live innerHTML as a new history entry -
  // no-ops if nothing actually changed since the last entry (e.g. clicking
  // a toolbar button twice in a row with no edit in between). Any existing
  // "future" (redo) entries are discarded, matching standard editor
  // behavior: making a new change after an undo abandons the old redo branch.
  const commitHistoryEntry = useCallback(() => {
    if (!editorRef.current || isApplyingHistoryRef.current) return;
    const html = editorRef.current.innerHTML;
    const stack = historyStackRef.current;
    const index = historyIndexRef.current;
    if (stack[index] === html) return;

    const truncated = stack.slice(0, index + 1);
    truncated.push(html);
    if (truncated.length > MAX_HISTORY_ENTRIES) truncated.shift();
    historyStackRef.current = truncated;
    historyIndexRef.current = truncated.length - 1;
  }, []);

  // Continuous typing calls this on every keystroke (via handleInput) -
  // coalesces a whole burst into one eventual history entry instead of one
  // per character, by restarting the timer on every call.
  const scheduleHistoryCommit = useCallback(() => {
    if (isApplyingHistoryRef.current) return;
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      historyDebounceRef.current = null;
      commitHistoryEntry();
    }, HISTORY_DEBOUNCE_MS);
  }, [commitHistoryEntry]);

  // Discrete, deliberate actions (a toolbar click, inserting a table/code
  // block, toggling a checklist box) call this right after making their
  // change, so that action becomes its own atomic undo step immediately -
  // it shouldn't have to wait out the typing-debounce, and it shouldn't get
  // silently merged into whatever the user was typing just before it.
  const flushHistoryNow = useCallback(() => {
    if (isApplyingHistoryRef.current) return;
    if (historyDebounceRef.current) {
      clearTimeout(historyDebounceRef.current);
      historyDebounceRef.current = null;
    }
    commitHistoryEntry();
  }, [commitHistoryEntry]);

  // Swaps in a past/future snapshot verbatim. Caret restoration after an
  // undo/redo is intentionally simple (collapse to the very end) rather
  // than trying to re-derive exactly where it was - every rich-text editor
  // that supports jumping across arbitrary structural changes (a table
  // appearing/disappearing, a heading becoming a paragraph) makes this same
  // tradeoff, since a precise position genuinely may not exist in the
  // restored structure.
  const applyHistoryEntry = useCallback(
    (html: string) => {
      if (!editorRef.current) return;
      isApplyingHistoryRef.current = true;

      editorRef.current.innerHTML = html || '<div><br></div>';

      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      editorRef.current.focus();

      isInternalUpdate.current = true;
      onUpdate(editorRef.current.innerHTML);
      syncSelectionState();

      const plainText = editorRef.current.innerText.trim();
      setWordCount({
        words: plainText ? plainText.split(/\s+/).length : 0,
        characters: plainText.length
      });

      isApplyingHistoryRef.current = false;
    },
    [onUpdate]
  );

  const historyUndo = useCallback(() => {
    const hadPendingEdit = historyDebounceRef.current !== null;
    if (historyDebounceRef.current) {
      clearTimeout(historyDebounceRef.current);
      historyDebounceRef.current = null;
    }

    const stack = historyStackRef.current;
    const index = historyIndexRef.current;

    // Mid-typing-burst Ctrl+Z (the debounced commit hasn't fired yet):
    // revert the in-progress, not-yet-committed edit back to the last real
    // checkpoint, without consuming a step - the same "escape hatch" you'd
    // expect from undoing something you're still in the middle of typing.
    if (hadPendingEdit) {
      applyHistoryEntry(stack[index]);
      return;
    }

    if (index <= 0) return;
    historyIndexRef.current = index - 1;
    applyHistoryEntry(stack[index - 1]);
  }, [applyHistoryEntry]);

  const historyRedo = useCallback(() => {
    // Flushing first matters if the user typed something new after an
    // undo but before redoing - that new edit should invalidate the old
    // redo branch (standard behavior), which committing it here achieves
    // via commitHistoryEntry's own truncate-then-push.
    flushHistoryNow();
    const stack = historyStackRef.current;
    const index = historyIndexRef.current;
    if (index >= stack.length - 1) return;
    historyIndexRef.current = index + 1;
    applyHistoryEntry(stack[index + 1]);
  }, [flushHistoryNow, applyHistoryEntry]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  }, []);

  const handleSaveShortcut = useCallback(() => {
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onUpdate(editorRef.current.innerHTML);
    }
    flushHistoryNow();

    if (savedToastTimeoutRef.current) clearTimeout(savedToastTimeoutRef.current);
    setShowSavedToast(true);
    savedToastTimeoutRef.current = setTimeout(() => setShowSavedToast(false), 3000);
  }, [onUpdate, flushHistoryNow]);

  useEffect(() => {
    return () => {
      if (savedToastTimeoutRef.current) clearTimeout(savedToastTimeoutRef.current);
      if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    };
  }, []);

  // Ctrl/Cmd+S (save + toast), Ctrl/Cmd+Z / Ctrl/Cmd+Y (custom undo/redo,
  // replacing the browser's native contentEditable undo entirely - see the
  // history functions above for why), and Ctrl/Cmd+= / +- (zoom). Attached
  // to the whole panel (not just the contentEditable) so these work
  // regardless of which control inside the notebook currently has focus,
  // e.g. right after clicking a color swatch.
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();

    if (key === 's') {
      e.preventDefault();
      handleSaveShortcut();
    } else if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      historyUndo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      historyRedo();
    } else if (key === '=' || key === '+') {
      e.preventDefault();
      handleZoomIn();
    } else if (key === '-') {
      e.preventDefault();
      handleZoomOut();
    }
  };

  // Re-tokenizes a code block's current plain text and swaps it in as the
  // block's new innerHTML - always re-extracted fresh from block.textContent
  // rather than incrementally patched, so it doesn't matter how stale the
  // colors got while the reader was actively typing (see the call site in
  // syncSelectionState below: this only runs once, at the moment the caret
  // actually leaves the block, never on every keystroke inside it).
  const highlightCodeBlockNode = (block: HTMLElement) => {
    const language = block.getAttribute('data-language') || 'plaintext';
    const code = stripCodeCaretAnchor(block.textContent ?? '');
    const html = highlightNotebookCode(code, language);
    if (block.innerHTML === html) return;
    block.innerHTML = html;
    handleInput();
  };

  const syncSelectionState = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    let node = selection.anchorNode;

    let tableFound: HTMLTableElement | null = null;
    let cellFound: HTMLTableCellElement | null = null;
    let codeBlockFound: HTMLElement | null = null;

    while (node && node !== editorRef.current) {
      if (node instanceof HTMLElement && node.classList.contains('notebook-code-block')) {
        codeBlockFound = node;
      }
      if (node.nodeName === 'TD' || node.nodeName === 'TH') cellFound = node as HTMLTableCellElement;
      if (node.nodeName === 'TABLE') {
        tableFound = node as HTMLTableElement;
        break;
      }
      node = node.parentNode;
    }
    setActiveTable(tableFound);
    setActiveCell(cellFound);

    // Only fires at the moment the caret actually moves OUT of a code
    // block (to somewhere else, or to a different code block) - typing
    // continuously inside the same block never re-triggers this, since
    // previousCodeBlockRef.current already equals codeBlockFound in that
    // steady-state case.
    if (previousCodeBlockRef.current && previousCodeBlockRef.current !== codeBlockFound) {
      highlightCodeBlockNode(previousCodeBlockRef.current);
    }
    previousCodeBlockRef.current = codeBlockFound;
    setActiveCodeBlock(codeBlockFound);

    try {
      const value = document.queryCommandValue('formatBlock');
      setBlockFormat(value ? value.toUpperCase() : 'DIV');
    } catch {
      setBlockFormat('DIV');
    }

    const nextFormatState: Record<string, boolean> = {};
    FORMAT_STATE_COMMANDS.forEach((cmd) => {
      try {
        nextFormatState[cmd] = document.queryCommandState(cmd);
      } catch {
        nextFormatState[cmd] = false;
      }
    });
    setFormatState(nextFormatState);
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const currentHTML = editorRef.current.innerHTML;
    const sanitized = sanitize(currentHTML);
    if (currentHTML !== sanitized) {
      // Whenever DOMPurify actually changes something (routinely true right
      // after a code block/heading/etc, since the browser's own
      // execCommand/formatBlock output often carries an attribute the
      // allowlist strips), wholesale-replacing innerHTML detaches the live
      // Selection from the DOM - the browser then drops the caret back to
      // the very start of the editor on the next keystroke. Capturing a
      // childNode-index path beforehand and re-walking it after the swap
      // keeps the caret where the user actually was.
      const caretPath = getCaretPath(editorRef.current);
      editorRef.current.innerHTML = sanitized;
      if (caretPath) restoreCaretFromPath(editorRef.current, caretPath);
    }
    if (editorRef.current.innerHTML === '' || editorRef.current.innerHTML === '<br>') {
      editorRef.current.innerHTML = `<div style="font-size: ${fontSize}px"><br></div>`;
      const range = document.createRange();
      const sel = window.getSelection();
      if (editorRef.current.childNodes[0]) {
        range.setStart(editorRef.current.childNodes[0], 0);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    isInternalUpdate.current = true;
    onUpdate(editorRef.current.innerHTML);
    syncSelectionState();
    scheduleHistoryCommit();

    const plainText = editorRef.current.innerText.trim();
    setWordCount({
      words: plainText ? plainText.split(/\s+/).length : 0,
      characters: plainText.length
    });
  };

  // Security: force plain text on paste (blocks XSS payloads and huge image data URIs).
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const insertChecklistItemAfter = (referenceNode: HTMLElement) => {
    const newItem = document.createElement('div');
    newItem.className = 'notebook-checklist-item';
    newItem.setAttribute('data-checked', 'false');
    const box = document.createElement('span');
    box.className = 'notebook-checklist-box';
    box.setAttribute('contenteditable', 'false');
    const text = document.createElement('span');
    text.className = 'notebook-checklist-text';
    text.innerHTML = '<br>';
    newItem.appendChild(box);
    newItem.appendChild(text);
    referenceNode.parentNode?.insertBefore(newItem, referenceNode.nextSibling);

    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
      return;
    }

    if (e.key === 'Enter') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        let node = selection.anchorNode;
        let checklistNode: HTMLElement | null = null;
        let codeBlockNode: HTMLElement | null = null;

        let curr = node;
        while (curr && curr !== editorRef.current) {
          if (curr instanceof HTMLElement && curr.classList.contains('notebook-checklist-item')) {
            checklistNode = curr;
            break;
          }
          if (curr instanceof HTMLElement && curr.classList.contains('notebook-code-block')) {
            codeBlockNode = curr;
            break;
          }
          curr = curr.parentNode;
        }

        if (checklistNode) {
          e.preventDefault();
          insertChecklistItemAfter(checklistNode);
          handleInput();
          flushHistoryNow();
          return;
        }

        if (codeBlockNode) {
          e.preventDefault();
          const range = selection.getRangeAt(0);

          // Double-Enter on an already-blank final line exits the block
          // (matches common code-editor UX) - otherwise Enter inserts a
          // literal '\n' character, never a <br>. The block's own
          // white-space: pre-wrap renders '\n' as a real line break, and
          // keeping the content as plain text (no <br> elements mixed in)
          // is what lets highlightCodeBlockNode's block.textContent
          // round-trip exactly when it re-tokenizes the block later.
          const tailRange = document.createRange();
          tailRange.setStart(range.endContainer, range.endOffset);
          tailRange.setEndAfter(codeBlockNode.lastChild ?? codeBlockNode);
          const isAtEnd = range.collapsed && stripCodeCaretAnchor(tailRange.toString()).length === 0;
          const fullText = stripCodeCaretAnchor(codeBlockNode.textContent ?? '');
          const lastLineBlank = fullText.length === 0 || fullText.endsWith('\n');

          if (isAtEnd && lastLineBlank) {
            highlightCodeBlockNode(codeBlockNode);
            previousCodeBlockRef.current = null;
            setActiveCodeBlock(null);

            const newDiv = document.createElement('div');
            newDiv.innerHTML = '<br>';
            if (codeBlockNode.nextSibling) {
              codeBlockNode.parentNode?.insertBefore(newDiv, codeBlockNode.nextSibling);
            } else {
              codeBlockNode.parentNode?.appendChild(newDiv);
            }

            const newRange = document.createRange();
            newRange.setStart(newDiv, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            handleInput();
            flushHistoryNow();
            return;
          }

          // Deliberately NOT execCommand('insertText', ..., '\n') -
          // Chromium's insertText treats an embedded newline as an implicit
          // paragraph break and splits the code block into multiple
          // separate <div class="notebook-code-block"> elements (one per
          // line), which silently destroys the "one block, one language"
          // model.
          //
          // Also deliberately NOT Range.insertNode() with a fresh text
          // node - when the caret sits mid-text (the common case: end of a
          // line), insertNode() splits that text node and leaves an empty
          // remainder right after the inserted node. The Selection API
          // reports a caret placed inside that empty node as correct, but
          // Chrome's native typing doesn't reliably treat a zero-length
          // text node as a real anchor - the very next keystroke can land
          // back at the start of the block's first text node instead,
          // silently corrupting every multi-line code block. Splicing the
          // newline directly into the existing text node's data (or
          // appending a fresh, non-empty one only when the block is still
          // completely empty) never creates that empty-node trap.
          // The CODE_CARET_ANCHOR right after '\n' is what actually fixes
          // the browser quirk above - without it, the caret would sit at
          // the text node's absolute end (right after '\n', nothing
          // following), which is the exact position Chrome mishandles.
          // With the anchor there, the caret sits *between* two real
          // characters instead, which Chrome always anchors reliably.
          range.deleteContents();
          const container = range.startContainer;
          let anchorNode: Text;
          let anchorOffset: number;

          if (container.nodeType === Node.TEXT_NODE) {
            const textNode = container as Text;
            textNode.insertData(range.startOffset, '\n' + CODE_CARET_ANCHOR);
            anchorNode = textNode;
            anchorOffset = range.startOffset + 1;
          } else {
            const textNode = document.createTextNode('\n' + CODE_CARET_ANCHOR);
            const referenceNode = container.childNodes[range.startOffset] ?? null;
            container.insertBefore(textNode, referenceNode);
            anchorNode = textNode;
            anchorOffset = 1;
          }

          const caretRange = document.createRange();
          caretRange.setStart(anchorNode, anchorOffset);
          caretRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(caretRange);
          handleInput();
          return;
        }
      }
    }

    saveRange();
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const box = target.closest('.notebook-checklist-box');
    if (box && editorRef.current?.contains(box)) {
      e.preventDefault();
      const item = box.closest('.notebook-checklist-item') as HTMLElement | null;
      if (item) {
        const isChecked = item.getAttribute('data-checked') === 'true';
        item.setAttribute('data-checked', isChecked ? 'false' : 'true');
        handleInput();
        flushHistoryNow();
      }
    }
  };

  // Focus can leave the editor entirely (clicking a toolbar button, the
  // language/font selects, or switching pages) without the caret ever
  // "moving" through syncSelectionState first, which would otherwise leave
  // a code block's last edit un-highlighted until the user clicks back in.
  const handleEditorBlur = () => {
    if (previousCodeBlockRef.current) {
      highlightCodeBlockNode(previousCodeBlockRef.current);
    }
  };

  const handleEditorMouseUp = () => {
    syncSelectionState();
    saveRange();
  };

  const handleEditorKeyUp = () => {
    syncSelectionState();
    saveRange();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    const cell = target.closest('td') || target.closest('th');
    if (cell && editorRef.current?.contains(cell)) {
      e.preventDefault();
      const table = cell.closest('table');
      if (table) {
        setActiveTable(table as HTMLTableElement);
        setActiveCell(cell as HTMLTableCellElement);
        setContextMenu({ x: e.clientX, y: e.clientY });
        setShowTableMenu(false);
      }
    }
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
      // Every execCmd call is a deliberate, discrete action (bold, a list
      // toggle, inserting a link/table/inline-code) - each becomes its own
      // atomic undo step immediately rather than waiting out or merging
      // into the typing-debounce window.
      flushHistoryNow();
      // Refreshes savedSelection.current to the post-command selection.
      // Without this, chaining two toolbar actions back-to-back (e.g. Bold
      // then Highlight on the same selected text) silently loses the
      // second one: execCommand('bold') rewraps the selected text in a new
      // <b> element, which can leave the OLD Range object saveRange
      // captured earlier (before Bold ran) pointing at a node that's no
      // longer part of the live selection in the way restoreRange expects -
      // so the next action's restoreRange() re-applies a stale, effectively
      // empty selection and has nothing left to act on.
      saveRange();
    }
  };

  // Only these are safe to swap the tag of directly - anything else found
  // while walking up to a top-level block (a <table>, <ul>/<ol> from a
  // selection that starts inside a list) is left alone rather than risk
  // corrupting its structure by turning it into a heading.
  const CONVERTIBLE_BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);

  // insertChecklist's range.insertNode() (above) inserts a checklist row as
  // a CHILD of whatever top-level div the cursor was in at the time, not as
  // its own top-level sibling - so a top-level block can itself have the
  // right tag/no special class of its own while still containing a nested
  // checklist row (or, defensively, a table) that would be corrupted by
  // getting swapped into a heading tag along with it.
  const isConvertibleBlock = (node: Element): boolean =>
    CONVERTIBLE_BLOCK_TAGS.has(node.tagName) &&
    !node.classList.contains('notebook-checklist-item') &&
    !node.querySelector('.notebook-checklist-item, table');

  /** Walks up from any node inside the editor to the top-level block that's a direct child of the editor root. */
  const getTopLevelBlock = (node: Node | null): HTMLElement | null => {
    let current = node;
    while (current) {
      if (current === editorRef.current) return null;
      if (current.parentElement === editorRef.current) return current as HTMLElement;
      current = current.parentNode;
    }
    return null;
  };

  // Built via direct DOM manipulation rather than execCommand('formatBlock')
  // - browsers (particularly on a selection collapsed inside an otherwise
  // empty block, e.g. picking a heading before typing anything) are
  // inconsistent about actually retagging the CURRENT block in place, vs.
  // only taking effect starting with the next block Enter creates - which
  // is exactly the "heading only applies from the second line onward" bug
  // this replaces. Same reasoning as insertChecklist above: Range/DOM APIs
  // give exact, deterministic control that execCommand doesn't guarantee
  // here (see MDN's own formatBlock caveats).
  const applyBlockFormat = (tag: string) => {
    restoreRange();
    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editor.focus();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      editor.focus();
      return;
    }

    const startBlock = getTopLevelBlock(range.startContainer);
    const endBlock = getTopLevelBlock(range.endContainer);
    if (!startBlock || !endBlock) {
      editor.focus();
      return;
    }

    // A multi-line selection converts each line to its own heading (rather
    // than merging them into one block, which is what formatBlock tended to
    // do) - matches how most other editors handle "apply heading" across
    // several paragraphs.
    const blocksToConvert: HTMLElement[] = [];
    let node: Element | null = startBlock;
    while (node) {
      if (isConvertibleBlock(node)) {
        blocksToConvert.push(node as HTMLElement);
      }
      if (node === endBlock) break;
      node = node.nextElementSibling;
    }

    if (blocksToConvert.length === 0) {
      editor.focus();
      return;
    }

    const anchorNode = range.startContainer;
    const anchorOffset = range.startOffset;
    const anchorBlock = getTopLevelBlock(anchorNode);

    let newAnchorBlock: HTMLElement | null = null;
    blocksToConvert.forEach((block) => {
      const replacement = document.createElement(tag);
      while (block.firstChild) {
        replacement.appendChild(block.firstChild);
      }
      if (!replacement.firstChild) {
        replacement.appendChild(document.createElement('br'));
      }
      block.replaceWith(replacement);
      if (block === anchorBlock) newAnchorBlock = replacement;
    });

    // anchorNode is either a descendant that moved along with its parent
    // (still the same node object, just re-parented - the offset within it
    // is unaffected) or, for a collapsed cursor sitting directly on an
    // empty block, the block element itself (now detached, replaced by
    // newAnchorBlock) - reconstruct the range accordingly either way.
    const finalRange = document.createRange();
    if (anchorNode === anchorBlock && newAnchorBlock) {
      const offset = Math.min(anchorOffset, newAnchorBlock.childNodes.length);
      finalRange.setStart(newAnchorBlock, offset);
    } else {
      finalRange.setStart(anchorNode, anchorOffset);
    }
    finalRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(finalRange);

    editor.focus();
    isInternalUpdate.current = true;
    onUpdate(editor.innerHTML);
    syncSelectionState();
    flushHistoryNow();
  };

  const insertHr = () => {
    restoreRange();
    const html = `<hr style="border: 0; border-top: ${hrThickness}px solid #8a8a8a; margin: 1rem 0; display: block; width: 100%;" /><div><br></div>`;
    execCmd('insertHTML', html);
    setShowHrMenu(false);
  };

  // Built via direct Range/DOM APIs rather than execCommand('insertHTML')
  // with an HTML string - when the current selection spans multiple
  // existing paragraphs (e.g. the buyer selected some text and chose
  // "Checklist" to convert it), Chrome's insertHTML can splice the parsed
  // fragment into the selection in an order that doesn't match what was
  // parsed (the checkbox and text spans could come out swapped). Range's
  // own deleteContents()/insertNode() give exact control over the
  // resulting structure instead.
  const insertChecklist = () => {
    restoreRange();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    range.deleteContents();

    const item = document.createElement('div');
    item.className = 'notebook-checklist-item';
    item.setAttribute('data-checked', 'false');
    const box = document.createElement('span');
    box.className = 'notebook-checklist-box';
    box.setAttribute('contenteditable', 'false');
    const text = document.createElement('span');
    text.className = 'notebook-checklist-text';
    text.innerHTML = '<br>';
    item.appendChild(box);
    item.appendChild(text);

    const spacer = document.createElement('div');
    spacer.innerHTML = '<br>';

    const fragment = document.createDocumentFragment();
    fragment.appendChild(item);
    fragment.appendChild(spacer);
    range.insertNode(fragment);

    const newRange = document.createRange();
    newRange.selectNodeContents(text);
    newRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(newRange);

    editorRef.current.focus();
    handleInput();
    flushHistoryNow();
  };

  const escapeHtml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const insertInlineCode = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    restoreRange();
    const text = window.getSelection()?.toString() ?? '';
    if (!text) return;
    execCmd('insertHTML', `<code>${escapeHtml(text)}</code>`);
  };

  const openLinkModal = () => {
    saveRange();
    setLinkInput('https://');
    setShowLinkModal(true);
  };

  const confirmLink = () => {
    restoreRange();
    let sanitizedLink = linkInput.trim();
    sanitizedLink = sanitizedLink.replace(/^(javascript|data|vbscript|file|about):/i, '');
    const urlPattern = /^https?:\/\//i;
    if (sanitizedLink && !urlPattern.test(sanitizedLink)) {
      sanitizedLink = 'https://' + sanitizedLink;
    }
    if (sanitizedLink && sanitizedLink !== 'https://') {
      execCmd('createLink', sanitizedLink);
      editorRef.current?.focus();
    }
    setShowLinkModal(false);
  };

  const applyFontSize = (size: string) => {
    setFontSize(size);
    restoreRange();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      if (!selection.isCollapsed) {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('fontSize', false, '7');
        document.execCommand('styleWithCSS', false, 'false');
        if (editorRef.current) {
          const markers = editorRef.current.querySelectorAll(
            'font[size="7"], span[style*="font-size: -webkit-xxx-large"], span[style*="font-size: xxx-large"]'
          );
          markers.forEach((el) => {
            if (el instanceof HTMLElement) {
              el.style.fontSize = `${size}px`;
              el.removeAttribute('size');
            }
          });
        }
      } else {
        const span = document.createElement('span');
        span.style.fontSize = `${size}px`;
        span.innerHTML = '&#8203;';
        const range = selection.getRangeAt(0);
        range.insertNode(span);
        range.setStart(span, 1);
        range.setEnd(span, 1);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    handleInput();
    flushHistoryNow();
  };

  const insertTable = () => {
    restoreRange();
    let html = `<table style="width: 100%; border-collapse: collapse; margin: 1rem 0; border: 1px solid #8a8a8a; table-layout: fixed;"><tbody>`;
    for (let r = 0; r < tableRows; r++) {
      html += `<tr>`;
      for (let c = 0; c < tableCols; c++) {
        html += `<td style="border: 1px solid #8a8a8a; padding: 8px; word-break: break-word; overflow-wrap: break-word; vertical-align: top;">&nbsp;</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table><div><br></div>`;
    execCmd('insertHTML', html);
    setShowTableMenu(false);
  };

  const insertCodeBlock = () => {
    restoreRange();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    range.deleteContents();

    // Built and inserted as real DOM nodes (not an HTML string via
    // execCommand('insertHTML')) so we keep a direct JS reference to the
    // new block - going through execCmd's handleInput()->sanitize() call
    // strips any temporary id attribute (id isn't in ALLOWED_ATTR) before
    // a setTimeout-based id lookup would ever get a chance to run,
    // silently losing focus placement on every insert.
    const block = document.createElement('div');
    block.className = 'notebook-code-block';
    block.setAttribute('data-language', 'javascript');

    const spacer = document.createElement('div');
    spacer.innerHTML = '<br>';

    const fragment = document.createDocumentFragment();
    fragment.appendChild(block);
    fragment.appendChild(spacer);
    range.insertNode(fragment);

    const newRange = document.createRange();
    newRange.selectNodeContents(block);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    previousCodeBlockRef.current = block;
    setActiveCodeBlock(block);
    editorRef.current.focus();
    handleInput();
    flushHistoryNow();
  };

  const setCodeBlockLanguage = (language: string) => {
    if (!activeCodeBlock) return;
    const safeLanguage = isKnownNotebookLanguage(language) ? language : 'plaintext';
    activeCodeBlock.setAttribute('data-language', safeLanguage);
    highlightCodeBlockNode(activeCodeBlock);
    flushHistoryNow();
  };

  const applyFontFamily = (family: string) => {
    setFontFamily(family);
    restoreRange();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      document.execCommand('styleWithCSS', false, 'true');
      // 'inherit' clears just the font-family override without touching
      // bold/italic/color/etc - execCommand('removeFormat') would strip
      // all formatting from the selection, not only the font.
      document.execCommand('fontName', false, family || 'inherit');
      document.execCommand('styleWithCSS', false, 'false');
    }
    handleInput();
    flushHistoryNow();
  };

  type TableAction =
    | 'insert-row-above' | 'insert-row-below' | 'insert-col-left' | 'insert-col-right'
    | 'delete-row' | 'delete-col' | 'delete-table' | 'highlight-row' | 'highlight-col';

  const modifyTable = (action: TableAction, colorOverride?: string) => {
    if (!activeTable || !activeCell) return;

    const createCell = () => {
      const cell = document.createElement('td');
      cell.style.cssText = 'border: 1px solid #8a8a8a; padding: 8px; word-break: break-word; overflow-wrap: break-word; vertical-align: top;';
      cell.innerHTML = '&nbsp;';
      return cell;
    };

    const row = activeCell.parentElement as HTMLTableRowElement;
    const rowIndex = row.rowIndex;
    const cellIndex = activeCell.cellIndex;

    switch (action) {
      case 'delete-table':
        activeTable.remove();
        setActiveTable(null);
        setActiveCell(null);
        break;
      case 'insert-row-above': {
        const newRow = activeTable.insertRow(rowIndex);
        for (let i = 0; i < row.cells.length; i++) newRow.appendChild(createCell());
        break;
      }
      case 'insert-row-below': {
        const newRow = activeTable.insertRow(rowIndex + 1);
        for (let i = 0; i < row.cells.length; i++) newRow.appendChild(createCell());
        break;
      }
      case 'insert-col-left':
        for (let i = 0; i < activeTable.rows.length; i++) activeTable.rows[i].insertCell(cellIndex).style.cssText = activeCell.style.cssText;
        break;
      case 'insert-col-right':
        for (let i = 0; i < activeTable.rows.length; i++) activeTable.rows[i].insertCell(cellIndex + 1).style.cssText = activeCell.style.cssText;
        break;
      case 'delete-row':
        activeTable.deleteRow(rowIndex);
        if (activeTable.rows.length === 0) {
          activeTable.remove();
          setActiveTable(null);
        }
        setActiveCell(null);
        break;
      case 'delete-col':
        for (let i = 0; i < activeTable.rows.length; i++) activeTable.rows[i].deleteCell(cellIndex);
        if (activeTable.rows.length > 0 && (activeTable.rows[0] as HTMLTableRowElement).cells.length === 0) {
          activeTable.remove();
          setActiveTable(null);
        }
        setActiveCell(null);
        break;
      case 'highlight-row': {
        const rColor = colorOverride || backColor;
        Array.from(row.cells).forEach((c) => ((c as HTMLTableCellElement).style.backgroundColor = rColor));
        break;
      }
      case 'highlight-col': {
        const cColor = colorOverride || backColor;
        Array.from(activeTable.rows).forEach((r: any) => {
          if (r.cells[cellIndex]) (r.cells[cellIndex] as HTMLTableCellElement).style.backgroundColor = cColor;
        });
        break;
      }
    }

    handleInput();
    flushHistoryNow();
    setShowTableMenu(false);
    setContextMenu(null);
  };

  // styleWithCSS is forced on for color changes so every browser produces a
  // `style="color: ...; background-color: ...` span consistently, instead
  // of some browsers falling back to a legacy `<font color="...">` tag -
  // whose `color` attribute isn't on the sanitizer's ALLOWED_ATTR list and
  // would otherwise get silently stripped, undoing the color change.
  const applyColor = (type: 'fore' | 'back', color: string) => {
    restoreRange();
    document.execCommand('styleWithCSS', false, 'true');
    const cmd = type === 'fore' ? 'foreColor' : 'hiliteColor';
    execCmd(cmd, color);
    document.execCommand('styleWithCSS', false, 'false');
    if (type === 'fore') setForeColor(color);
    else setBackColor(color);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // iOS Safari doesn't reliably honor `download` - it can instead
    // navigate to the blob URL like a normal link click. target="_blank"
    // (+ noopener/noreferrer, standard practice whenever target="_blank"
    // is used) keeps that navigation in a new tab instead of away from the
    // notebook, so the reader's in-progress edits here are never at risk
    // either way this plays out.
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delayed rather than immediate: on a browser that treats this as a
    // navigation instead of a same-tick download, revoking the object URL
    // right away can race that navigation and leave the new tab with
    // nothing to load. The download/navigation has always started well
    // within this window in practice.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const CHECKLIST_EXPORT_CSS = `
    .notebook-checklist-item { display: flex; align-items: flex-start; gap: 8px; margin: 0.3em 0; }
    .notebook-checklist-box { flex-shrink: 0; width: 14px; height: 14px; margin-top: 3px; border: 1.5px solid currentColor; border-radius: 3px; display: inline-block; }
    .notebook-checklist-item[data-checked="true"] .notebook-checklist-text { text-decoration: line-through; opacity: 0.6; }
  `;

  const handleDownload = async (type: 'text' | 'pdf') => {
    if (!editorRef.current) return;
    setShowDownloadMenu(false);

    if (type === 'text') {
      const text = editorRef.current.innerText;
      const blob = new Blob([text], { type: 'text/plain' });
      triggerDownload(blob, 'note.txt');
    } else if (type === 'pdf') {
      const printContent = sanitize(editorRef.current.innerHTML);
      let printWindow: Window | null = null;
      try {
        printWindow = window.open('', '', 'height=650,width=900');
      } catch {
        printWindow = null;
      }

      // window.open silently returns null when a popup blocker (mobile
      // browsers and in-app webviews - e.g. Facebook/Instagram's built-in
      // browser - are especially aggressive about this) steps in, even
      // though this call is a direct, synchronous result of the click. That
      // used to fail with zero feedback: the button just did nothing, which
      // is exactly what "download seems broken" looks like from a visitor's
      // side. Surfacing it here doesn't change what this export can do -
      // it's still the same print-to-PDF flow - it just stops failing silently.
      if (!printWindow) {
        showDownloadNotice("Couldn't open the PDF preview - your browser may be blocking pop-ups for this site. Please allow pop-ups and try again, or use Text File instead.");
        return;
      }

      try {
        printWindow.document.write('<html><head><title>Notebook Export</title>');
        printWindow.document.write(
          `<style>body { font-family: sans-serif; line-height: 1.6; color: #000; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; } table { width: 100%; border-collapse: collapse; margin: 1em 0; border: 1px solid #000; } td, th { border: 1px solid #000; padding: 8px; text-align: left; } pre, code { font-family: monospace; background: #f5f5f5; padding: 2px 4px; border-radius: 4px; } a { color: #0066cc; text-decoration: underline; } hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; } ${CHECKLIST_EXPORT_CSS}</style>`
        );
        printWindow.document.write('</head><body>');
        printWindow.document.write(printContent);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          try {
            printWindow?.print();
            printWindow?.close();
          } catch {
            // The reader may have already closed the preview tab themselves
            // before this fired - nothing to recover, just avoid an
            // unhandled exception over it.
          }
        }, 250);
      } catch {
        printWindow.close();
        showDownloadNotice('Something went wrong preparing the PDF preview. Please try again.');
      }
    }
  };

  // `content` (not editorRef's live DOM) is what re-renders this component,
  // so deriving it here keeps the placeholder in sync a render after every
  // keystroke - same tick the toolbar's active-state highlighting already
  // updates on, no extra effect/state needed.
  const isEmpty = isNoteContentEmpty(content);

  if (readOnly) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary p-8 border-2 border-dashed border-border-hairline rounded-sm bg-surface">
        <Book className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-sm font-medium">Select a page to start writing</p>
      </div>
    );
  }

  const renderTableMenuContent = () => (
    <>
      {activeTable ? (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-2 border-b border-border-hairline pb-1">Insert</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => modifyTable('insert-row-above')} className="p-2 hover:bg-surface-secondary rounded-sm text-xs text-text-primary transition-colors flex items-center justify-center gap-1 bg-surface border border-border-hairline"><ArrowUp className="w-3 h-3" /> Row</button>
            <button onClick={() => modifyTable('insert-row-below')} className="p-2 hover:bg-surface-secondary rounded-sm text-xs text-text-primary transition-colors flex items-center justify-center gap-1 bg-surface border border-border-hairline"><ArrowDown className="w-3 h-3" /> Row</button>
            <button onClick={() => modifyTable('insert-col-left')} className="p-2 hover:bg-surface-secondary rounded-sm text-xs text-text-primary transition-colors flex items-center justify-center gap-1 bg-surface border border-border-hairline"><ArrowLeft className="w-3 h-3" /> Col</button>
            <button onClick={() => modifyTable('insert-col-right')} className="p-2 hover:bg-surface-secondary rounded-sm text-xs text-text-primary transition-colors flex items-center justify-center gap-1 bg-surface border border-border-hairline"><ArrowRight className="w-3 h-3" /> Col</button>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-2 border-b border-border-hairline pb-1 mt-2">Actions</div>
          {activeCell && (
            <div className="grid grid-cols-1 gap-1 mb-2">
              <div className="flex items-center gap-1 bg-surface rounded-sm border border-border-hairline p-1">
                <button onClick={() => modifyTable('highlight-row', rowColor)} className="flex-1 p-1 hover:bg-surface-secondary rounded-sm text-xs text-text-primary transition-colors flex items-center justify-center gap-1"><PaintBucket className="w-3 h-3" /> Row</button>
                <div className="w-px h-4 bg-border-hairline mx-1"></div>
                <label className="p-1 hover:bg-surface-secondary rounded-sm cursor-pointer relative w-6 h-6 flex items-center justify-center"><input type="color" value={rowColor} onChange={(e) => setRowColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" /><div className="w-4 h-4 rounded-full border border-border-hairline" style={{ backgroundColor: rowColor }}></div></label>
              </div>
              <div className="flex items-center gap-1 bg-surface rounded-sm border border-border-hairline p-1">
                <button onClick={() => modifyTable('highlight-col', colColor)} className="flex-1 p-1 hover:bg-surface-secondary rounded-sm text-xs text-text-primary transition-colors flex items-center justify-center gap-1"><PaintBucket className="w-3 h-3 rotate-90" /> Col</button>
                <div className="w-px h-4 bg-border-hairline mx-1"></div>
                <label className="p-1 hover:bg-surface-secondary rounded-sm cursor-pointer relative w-6 h-6 flex items-center justify-center"><input type="color" value={colColor} onChange={(e) => setColColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" /><div className="w-4 h-4 rounded-full border border-border-hairline" style={{ backgroundColor: colColor }}></div></label>
              </div>
            </div>
          )}

          <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-2 border-b border-border-hairline pb-1">Delete</div>
          <div className="flex flex-col gap-1">
            <button onClick={() => modifyTable('delete-row')} className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-500 rounded-sm text-xs transition-colors flex items-center gap-2"><XCircle className="w-3 h-3" /> Delete Row</button>
            <button onClick={() => modifyTable('delete-col')} className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-500 rounded-sm text-xs transition-colors flex items-center gap-2"><XCircle className="w-3 h-3" /> Delete Column</button>
            <button onClick={() => modifyTable('delete-table')} className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-500 rounded-sm text-xs transition-colors flex items-center gap-2 border-t border-border-hairline mt-1 pt-2"><Trash2 className="w-3 h-3" /> Delete Table</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-1">Insert Table</div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="text-[9px] text-text-secondary block mb-1">Rows</label><input type="number" min="1" max="10" value={tableRows} onChange={(e) => setTableRows(parseInt(e.target.value) || 1)} className="w-full bg-surface border border-border-hairline rounded-sm px-2 py-1 text-xs text-text-primary text-center" /></div>
            <div className="flex-1"><label className="text-[9px] text-text-secondary block mb-1">Cols</label><input type="number" min="1" max="10" value={tableCols} onChange={(e) => setTableCols(parseInt(e.target.value) || 1)} className="w-full bg-surface border border-border-hairline rounded-sm px-2 py-1 text-xs text-text-primary text-center" /></div>
          </div>
          <button onClick={insertTable} className="w-full py-2 bg-surface-inverted text-text-inverted rounded-sm text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-90">Create</button>
        </div>
      )}
    </>
  );

  return (
    <div
      data-keyboard-scope="notebook"
      onKeyDown={handlePanelKeyDown}
      className="flex flex-col h-full bg-surface rounded-sm overflow-hidden border border-border-hairline shadow-lg"
    >
      {/* Single horizontally-swipeable row below `sm` (mobile) so the tools
          never eat into the text area's vertical space - wraps into normal
          multi-row layout from `sm` up, where there's room to spare.
          notebook-toolbar (index.css) makes every child shrink-0 so items
          overflow into the scrollable row instead of squishing. */}
      <div className="notebook-toolbar flex flex-nowrap sm:flex-wrap gap-1 p-2 border-b border-border-hairline bg-surface-secondary items-center sticky top-0 z-10 shrink-0 overflow-x-auto sm:overflow-x-visible no-scrollbar">
        <ToolbarButton onClick={historyUndo} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={historyRedo} title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-6 bg-border-hairline mx-1"></div>
        <ToolbarButton onClick={handleZoomOut} title="Zoom Out (Ctrl+-)"><ZoomOut className="w-4 h-4" /></ToolbarButton>
        <span className="text-xs font-bold text-text-secondary w-10 text-center select-none">{Math.round(zoomLevel * 100)}%</span>
        <ToolbarButton onClick={handleZoomIn} title="Zoom In (Ctrl+=)"><ZoomIn className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-6 bg-border-hairline mx-1"></div>

        <select
          value={blockFormat}
          onChange={(e) => applyBlockFormat(e.target.value)}
          className="bg-surface text-text-secondary text-xs font-bold p-1.5 rounded-sm border border-border-hairline focus:outline-none focus:border-border-strong transition-colors cursor-pointer w-28"
        >
          {BLOCK_FORMATS.map((format) => (
            <option key={format.value} value={format.value}>{format.label}</option>
          ))}
        </select>
        <select value={fontSize} onChange={(e) => applyFontSize(e.target.value)} className="bg-surface text-text-secondary text-xs font-bold p-1.5 rounded-sm border border-border-hairline focus:outline-none focus:border-border-strong transition-colors cursor-pointer w-16">
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <select
          value={fontFamily}
          onChange={(e) => applyFontFamily(e.target.value)}
          title="Font Family"
          className="bg-surface text-text-secondary text-xs font-bold p-1.5 rounded-sm border border-border-hairline focus:outline-none focus:border-border-strong transition-colors cursor-pointer w-28"
        >
          {NOTEBOOK_FONTS.map((font) => (
            <option key={font.value} value={font.value} style={font.value ? { fontFamily: font.value } : undefined}>{font.label}</option>
          ))}
        </select>
        <div className="w-px h-6 bg-border-hairline mx-1"></div>

        <ToolbarButton onClick={() => execCmd('bold')} active={formatState.bold} title="Bold"><Bold className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('italic')} active={formatState.italic} title="Italic"><Italic className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('underline')} active={formatState.underline} title="Underline"><Underline className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('strikeThrough')} active={formatState.strikeThrough} title="Strikethrough"><Strikethrough className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('subscript')} active={formatState.subscript} title="Subscript"><Subscript className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('superscript')} active={formatState.superscript} title="Superscript"><Superscript className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={insertInlineCode} title="Inline Code (select text first)"><Code2 className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={openLinkModal} title="Insert Link"><LinkIcon className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-6 bg-border-hairline mx-1"></div>

        <ToolbarButton onClick={() => execCmd('insertUnorderedList')} active={formatState.insertUnorderedList} title="Bulleted List"><List className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('insertOrderedList')} active={formatState.insertOrderedList} title="Numbered List"><ListOrdered className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={insertChecklist} title="Checklist"><ListChecks className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-6 bg-border-hairline mx-1"></div>

        <ToolbarButton onClick={() => execCmd('justifyLeft')} active={formatState.justifyLeft} title="Align Left"><AlignLeft className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('justifyCenter')} active={formatState.justifyCenter} title="Align Center"><AlignCenter className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('justifyRight')} active={formatState.justifyRight} title="Align Right"><AlignRight className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => execCmd('justifyFull')} active={formatState.justifyFull} title="Justify"><AlignJustify className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-6 bg-border-hairline mx-1"></div>

        <div className="relative" ref={hrMenuRef}>
          <ToolbarButton onClick={() => setShowHrMenu(!showHrMenu)} active={showHrMenu} title="Insert Ruler"><Minus className="w-4 h-4" /></ToolbarButton>
          {showHrMenu && (
            <div className="absolute top-full left-0 mt-2 w-48 bg-surface border border-border-hairline rounded-sm shadow-2xl z-50 p-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-2 block">Line Thickness</label>
              <div className="flex items-center gap-2 mb-3">
                <input type="range" min="1" max="10" value={hrThickness} onChange={(e) => setHrThickness(parseInt(e.target.value))} className="flex-grow h-1 bg-surface-secondary rounded-lg appearance-none cursor-pointer" />
                <span className="text-xs font-mono text-text-primary w-6 text-right">{hrThickness}px</span>
              </div>
              <button onClick={insertHr} className="w-full py-2 bg-surface-inverted text-text-inverted rounded-sm text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-90">Insert Line</button>
            </div>
          )}
        </div>
        <div className="relative" ref={tableMenuRef}>
          <ToolbarButton onClick={() => setShowTableMenu(!showTableMenu)} active={showTableMenu} title="Table Tools"><TableIcon className="w-4 h-4" /></ToolbarButton>
          {showTableMenu && (<div className="absolute top-full left-0 mt-2 w-64 bg-surface border border-border-hairline rounded-sm shadow-2xl z-50 p-3">{renderTableMenuContent()}</div>)}
        </div>
        <ToolbarButton onClick={insertCodeBlock} title="Insert Code Block"><Code className="w-4 h-4" /></ToolbarButton>
        {activeCodeBlock && (
          <select
            value={activeCodeBlock.getAttribute('data-language') || 'plaintext'}
            onChange={(e) => setCodeBlockLanguage(e.target.value)}
            title="Code Block Language"
            className="bg-surface text-text-secondary text-xs font-bold p-1.5 rounded-sm border border-border-hairline focus:outline-none focus:border-border-strong transition-colors cursor-pointer w-32"
          >
            {NOTEBOOK_CODE_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        )}
        <div className="w-px h-6 bg-border-hairline mx-1"></div>

        <div className="flex items-center bg-surface rounded-sm border border-border-hairline p-0.5">
          <button onClick={() => applyColor('fore', foreColor)} className="flex flex-col items-center justify-center p-1.5 hover:bg-surface-secondary rounded-sm transition-colors w-8 h-8" title="Apply Text Color"><Type className="w-3 h-3 text-text-secondary" /><div className="w-4 h-0.5 mt-0.5 rounded-full" style={{ backgroundColor: foreColor }}></div></button>
          <div className="w-px h-4 bg-border-hairline mx-0.5"></div>
          <label className="p-1.5 hover:bg-surface-secondary rounded-sm cursor-pointer flex items-center justify-center relative w-8 h-8" title="Pick Text Color"><input type="color" value={foreColor} onChange={(e) => applyColor('fore', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" /><div className="w-3 h-3 rounded-full border border-border-hairline" style={{ backgroundColor: foreColor }}></div></label>
        </div>
        <div className="flex items-center bg-surface rounded-sm border border-border-hairline p-0.5 ml-1">
          <button onClick={() => applyColor('back', backColor)} className="flex flex-col items-center justify-center p-1.5 hover:bg-surface-secondary rounded-sm transition-colors w-8 h-8" title="Apply Highlight"><Highlighter className="w-3 h-3 text-text-secondary" /><div className="w-4 h-0.5 mt-0.5 rounded-full" style={{ backgroundColor: backColor }}></div></button>
          <div className="w-px h-4 bg-border-hairline mx-0.5"></div>
          <label className="p-1.5 hover:bg-surface-secondary rounded-sm cursor-pointer flex items-center justify-center relative w-8 h-8" title="Pick Highlight Color"><input type="color" value={backColor} onChange={(e) => applyColor('back', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" /><div className="w-3 h-3 rounded-full border border-border-hairline" style={{ backgroundColor: backColor }}></div></label>
        </div>
        <div className="flex-grow"></div>

        <div className="relative" ref={downloadMenuRef}>
          <ToolbarButton onClick={() => setShowDownloadMenu(!showDownloadMenu)} active={showDownloadMenu} title="Download Page"><Download className="w-4 h-4" /></ToolbarButton>
          {showDownloadMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-surface border border-border-hairline rounded-sm shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-border-hairline bg-surface-secondary"><span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary pl-2">Download As</span></div>
              <div className="p-1">
                <button onClick={() => handleDownload('text')} className="w-full text-left px-4 py-2.5 hover:bg-surface-secondary rounded-sm text-sm font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"><FileText className="w-4 h-4" /> Text File (.txt)</button>
                <button onClick={() => handleDownload('pdf')} className="w-full text-left px-4 py-2.5 hover:bg-surface-secondary rounded-sm text-sm font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"><FilePlus className="w-4 h-4" /> PDF Document</button>
              </div>
            </div>
          )}
          {/* Independent of showDownloadMenu (which closes the instant a
              download is clicked) so this can still report a failure that
              only becomes known after the menu's already gone. */}
          {downloadNotice && (
            <div
              role="alert"
              className="absolute top-full right-0 mt-2 w-64 bg-surface border border-border-hairline rounded-sm shadow-2xl z-50 p-3 text-xs text-text-secondary leading-relaxed"
            >
              {downloadNotice}
            </div>
          )}
        </div>
        <ToolbarButton onClick={() => execCmd('removeFormat')} title="Clear Formatting"><Eraser className="w-4 h-4" /></ToolbarButton>
      </div>

      <div className="relative flex-grow flex min-h-0 bg-surface overflow-hidden">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onKeyDown={handleEditorKeyDown}
          onPaste={handlePaste}
          onMouseUp={handleEditorMouseUp}
          onKeyUp={handleEditorKeyUp}
          onBlur={handleEditorBlur}
          onContextMenu={handleContextMenu}
          onClick={handleEditorClick}
          className={`notebook-editor-content flex-grow min-w-0 outline-none overflow-y-auto overflow-x-auto text-text-primary leading-relaxed max-w-none font-normal break-words whitespace-pre-wrap ${compact ? 'py-4 px-4 overscroll-y-contain' : 'py-6 px-6 md:py-8 md:px-8'}`}
          spellCheck={false}
          // `zoom` (not transform: scale) - it participates in normal layout,
          // so overflow/scroll on this same element keep working correctly
          // at any zoom level, and it only affects this content, never the
          // toolbar above it.
          style={{ wordBreak: 'break-word', zoom: zoomLevel }}
        />
        {isEmpty && (
          // Mirrors the editable div's own padding/line-height so it lines up
          // exactly where typed text would start. contentEditable has no
          // native `placeholder` attribute (that's textarea-only), and the
          // editor's "blank" markup isn't DOM-:empty (it's a div wrapping a
          // <br>), so a CSS-only ::before placeholder trick doesn't apply
          // here - this overlay is the equivalent for a contentEditable
          // surface. pointer-events-none lets a click pass straight through
          // to focus the real editor underneath.
          <span
            aria-hidden="true"
            className={`absolute top-0 left-0 pointer-events-none select-none text-text-secondary leading-relaxed ${compact ? 'py-4 px-4' : 'py-6 px-6 md:py-8 md:px-8'}`}
          >
            Write your notes here.
          </span>
        )}
        {!compact && (
          <div className="absolute bottom-2 right-3 pointer-events-none select-none text-[10px] font-bold uppercase tracking-widest text-text-secondary/70 bg-surface/80 px-2 py-1 rounded-sm">
            {wordCount.words} {wordCount.words === 1 ? 'word' : 'words'} · {wordCount.characters} {wordCount.characters === 1 ? 'char' : 'chars'}
          </div>
        )}
        {showSavedToast && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
            <div
              role="status"
              className="notebook-saved-toast bg-surface-inverted text-text-inverted text-sm font-bold px-5 py-3 rounded-sm shadow-2xl"
            >
              Notes saved.
            </div>
          </div>,
          document.body
        )}
        {contextMenu && createPortal(
          <div ref={contextMenuRef} className="fixed w-64 bg-surface border border-border-hairline rounded-sm shadow-2xl z-[100] p-3" style={{ top: contextMenu.y, left: contextMenu.x }} onMouseDown={(e) => e.stopPropagation()}>
            {renderTableMenuContent()}
          </div>,
          document.body
        )}
        {showLinkModal && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-surface border border-border-hairline rounded-sm w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-text-primary mb-4">Insert Link</h3>
              <input type="url" value={linkInput} onChange={(e) => setLinkInput(e.target.value)} className="w-full bg-surface border border-border-hairline rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-border-strong mb-6" placeholder="https://example.com" autoFocus />
              <div className="flex gap-3">
                <button onClick={() => setShowLinkModal(false)} className="flex-1 py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
                <button onClick={confirmLink} className="flex-1 py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-surface-inverted text-text-inverted hover:opacity-90 transition-colors shadow-lg">Insert</button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};
