/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Base URL of the public dc-notes-images R2 bucket (same one product
  // thumbnails already load from on the main site) - used here only to
  // preview New Releases thumbnails already uploaded via
  // admin-get-new-release-upload-url.ts, never to write anything.
  readonly VITE_IMAGE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
