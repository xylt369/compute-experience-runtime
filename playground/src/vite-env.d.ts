/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMPILE_LLM_API_KEY?: string;
  readonly VITE_COMPILE_LLM_BASE_URL?: string;
  readonly VITE_COMPILE_LLM_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
