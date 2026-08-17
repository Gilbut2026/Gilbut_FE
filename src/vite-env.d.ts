/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
  readonly VITE_API_BASE_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/* 빌드할 때 박아 넣는 값 (vite.config.ts define) — 설정 맨 아래에 적는다 */
/** 빌드한 시각, 한국 시간 'YYYY-MM-DD HH:mm' */
declare const __BUILD_TIME__: string
/** 빌드한 커밋 7자리. 내 컴퓨터에서 빌드하면 'local' */
declare const __BUILD_COMMIT__: string
