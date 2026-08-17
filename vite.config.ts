import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * 지금 도는 것이 언제 만든 것인가 — 설정 맨 아래에 적는다.
 *
 * 왜 필요한가 — 배포는 됐는데 앱에서는 옛날 화면이 보이는 일이 있었다(2026-08-17).
 * 홈 화면에 둔 앱은 홈 버튼으로 나가도 페이지가 살아 있어서, 새로 열어도 그대로다.
 * 그때 「고친 게 안 보인다」와 「앱이 옛것을 들고 있다」를 가릴 방법이 없었다.
 * 발표 당일에 이걸로 헤매면 곤란하다.
 *
 * 시각은 한국 시간이다. 서버가 어디서 빌드하든(Vercel 은 UTC) 우리가 읽을 수 있어야 한다.
 * 커밋은 Vercel 이 넣어주는 환경변수에서 가져오고, 내 컴퓨터에서 빌드하면 'local' 이다.
 */
// @types/node 를 새로 들이지 않으려고 여기서만 선언한다 — 쓰는 것은 환경변수 하나뿐이다
declare const process: { env: Record<string, string | undefined> }

const buildTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)
const buildCommit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'

// 백엔드(Spring Boot)가 준비되면 .env 의 VITE_API_BASE_URL 만 바꾸면 됩니다.
// 개발 중 CORS 를 피하려면 아래 proxy 를 사용할 수도 있습니다.
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 예: 백엔드 로컬 서버로 프록시하고 싶을 때 주석 해제
    // proxy: { '/api': 'http://localhost:8080' },
  },
})
