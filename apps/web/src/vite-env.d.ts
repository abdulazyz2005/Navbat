/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_TELEGRAM_ID?: string;
  readonly VITE_DEV_TELEGRAM_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
