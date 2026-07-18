import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';

/**
 * Languages the notebook's code-block language picker offers - deliberately
 * a curated subset (not Prism's full component list) matching what this
 * site's own catalog actually teaches, kept small so the bundle only pays
 * for grammars that'll realistically get used.
 */
export const NOTEBOOK_CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'markup', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'markdown', label: 'Markdown' }
];

const VALID_LANGUAGES = new Set(NOTEBOOK_CODE_LANGUAGES.map((l) => l.value));

/** Used both to validate a stored `data-language` value and to pick the tokenizer grammar - anything not on this exact list is treated as plain text. */
export const isKnownNotebookLanguage = (value: string): boolean => VALID_LANGUAGES.has(value);

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Tokenizes `code` into Prism's `<span class="token ...">` markup for the
 * given language - the colors themselves live in index.css
 * (.notebook-code-block .token.*), scoped so they never leak onto the
 * plain inline `<code>` spans elsewhere in the notebook.
 *
 * Prism.highlight() already HTML-escapes the source text as part of
 * tokenizing it (that's the whole point - it has to represent `<`/`>`/`&`
 * literally as visible characters, not markup), so its output is safe to
 * assign as innerHTML on its own. It still goes through the same
 * DOMPurify pass as everything else in this editor immediately afterward
 * (see handleInput) - this function has no special exemption from that,
 * it's just belt-and-braces on top of Prism's own escaping.
 *
 * Falls back to a manually-escaped, unhighlighted rendering for an
 * unrecognized language or if tokenizing itself ever throws, rather than
 * letting a bad `data-language` value (e.g. hand-edited storage, or a
 * grammar with an internal bug) crash the editor.
 */
export const highlightNotebookCode = (code: string, language: string): string => {
  const grammar = isKnownNotebookLanguage(language) ? Prism.languages[language] : undefined;
  if (!grammar || language === 'plaintext') {
    return escapeHtml(code);
  }

  try {
    return Prism.highlight(code, grammar, language);
  } catch {
    return escapeHtml(code);
  }
};
