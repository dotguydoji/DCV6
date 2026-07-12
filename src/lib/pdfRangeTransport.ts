import * as pdfjsLib from 'pdfjs-dist';

const PROBE_RANGE_HEADER = 'bytes=0-0';

/**
 * Learns the PDF's total byte length via a single 1-byte Range request,
 * without downloading the file - needed up front because
 * PDFDataRangeTransport requires a known `length` at construction time.
 * Returns null if the response doesn't expose enough information to
 * determine it (the caller falls back to plain url-based loading in that
 * case - rarer than it sounds, since Range support against this exact host
 * is already required for the existing per-page lazy-loading to work at all).
 */
export async function probeContentLength(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { headers: { Range: PROBE_RANGE_HEADER } });

    const contentRange = response.headers.get('Content-Range');
    if (contentRange) {
      const match = /\/(\d+)\s*$/.exec(contentRange);
      if (match) return parseInt(match[1], 10);
    }

    // A 200 (not 206) response means the server ignored the Range header
    // and sent the whole file - its Content-Length is then exactly the
    // total length we need. A 206's Content-Length would just be "1" and
    // isn't usable (the Content-Range branch above covers that case).
    if (response.status === 200) {
      const contentLength = response.headers.get('Content-Length');
      const parsed = contentLength ? parseInt(contentLength, 10) : NaN;
      if (Number.isFinite(parsed)) return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

interface RefreshableRangeTransportOptions {
  length: number;
  /** Always returns whatever presigned URL is currently valid - this is the one thing a background refresh ever changes. */
  getUrl: () => string;
  /** Called when a range fetch fails - expected to obtain a fresh URL and resolve once it's ready, so the failed range can be retried once. */
  onRecoverableFailure: () => Promise<void>;
  /** Called only if the retried fetch also fails - a genuinely broken session, not just an unlucky timing race. */
  onFatalFailure: () => void;
}

/**
 * A PDFDataRangeTransport whose byte-range fetches always target whatever
 * URL `getUrl()` currently returns. This is what makes the presigned URL's
 * ~5 minute expiry invisible to the reader: the PDF.js document and viewer
 * this is handed to are created exactly once and never rebuilt, so a
 * background URL refresh (a plain ref mutation elsewhere) never touches the
 * page the reader is on, their scroll position, or already-rendered pages -
 * it only affects which URL the *next* range fetch happens to use.
 */
export function createRefreshableRangeTransport({
  length,
  getUrl,
  onRecoverableFailure,
  onFatalFailure
}: RefreshableRangeTransportOptions): InstanceType<typeof pdfjsLib.PDFDataRangeTransport> {
  const transport = new pdfjsLib.PDFDataRangeTransport(length, null);

  const fetchRange = (begin: number, end: number) =>
    fetch(getUrl(), { headers: { Range: `bytes=${begin}-${end - 1}` } }).then((response) => {
      if (!response.ok) throw new Error(`Range request failed: ${response.status}`);
      return response.arrayBuffer();
    });

  transport.requestDataRange = (begin: number, end: number) => {
    fetchRange(begin, end)
      .then((buffer) => transport.onDataRange(begin, new Uint8Array(buffer)))
      .catch(() => {
        // The current URL may have just expired slightly ahead of the
        // scheduled proactive refresh - force one immediately and retry
        // this exact range once before giving up on it.
        onRecoverableFailure()
          .then(() => fetchRange(begin, end))
          .then((buffer) => transport.onDataRange(begin, new Uint8Array(buffer)))
          .catch(() => {
            // Resolve with an empty chunk so PDF.js's range reader doesn't
            // hang forever awaiting data that will never arrive - the
            // resulting parse error surfaces through the normal
            // loadingTask.promise rejection path instead.
            transport.onDataRange(begin, new Uint8Array(end - begin));
            onFatalFailure();
          });
      });
  };

  return transport;
}
