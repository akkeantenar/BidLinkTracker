/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_SERVICE_ACCOUNT_KEY: string
  readonly VITE_SPREADSHEET_ID: string
  readonly VITE_GOOGLE_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

