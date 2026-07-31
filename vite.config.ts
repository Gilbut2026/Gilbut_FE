import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 백엔드(Spring Boot)가 준비되면 .env 의 VITE_API_BASE_URL 만 바꾸면 됩니다.
// 개발 중 CORS 를 피하려면 아래 proxy 를 사용할 수도 있습니다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 예: 백엔드 로컬 서버로 프록시하고 싶을 때 주석 해제
    // proxy: { '/api': 'http://localhost:8080' },
  },
})
