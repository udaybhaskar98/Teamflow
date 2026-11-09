/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_API_URL?: string;
  readonly VITE_ORGANIZATION_API_URL?: string;
  readonly VITE_PROJECT_API_URL?: string;
  readonly VITE_TASK_API_URL?: string;
  readonly VITE_NOTIFICATION_API_URL?: string;
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
