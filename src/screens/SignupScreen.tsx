import { useState } from 'react'
import { kakaoLogin, kakaoAuthorizeUrl } from '../api/auth'
import { useMock } from '../api/mode'

/**
 * 시작 · 카카오 회원가입 (첫 진입) — 7차 와이어프레임 #screen-signup 이식.
 * Mock 모드   : 가짜 토큰을 발급하고 바로 온보딩으로 넘어간다.
 * 실서버 모드 : 카카오 인가 페이지로 리다이렉트 → 돌아오면 App 이 콜백을 받아 로그인 처리.
 */
export function SignupScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false)

  async function handleKakao() {
    if (busy) return
    setBusy(true)
    if (useMock('auth')) {
      // Mock: 백엔드 없이 즉시 로그인된 상태로 온보딩 진입
      try {
        await kakaoLogin('mock-code')
        onSignedIn()
      } catch {
        setBusy(false)
      }
      return
    }
    // 실서버: 카카오 인가 페이지로 이동한다. 코드는 돌아온 뒤 App 의 콜백 처리에서 교환한다.
    window.location.href = kakaoAuthorizeUrl()
  }

  return (
    <section className="screen">
      <div className="screen-body signup-body">
        <div className="signup-logo">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2.8c-3.8 0-6.7 2.9-6.7 6.6 0 4.3 4.7 9.1 6.7 11.5 2-2.4 6.7-7.2 6.7-11.5 0-3.7-2.9-6.6-6.7-6.6Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="9.2" r="2.6" fill="currentColor" />
          </svg>
        </div>
        <h1 className="signup-title">
          어디로 가세요?
          <br />
          <em>편한 길</em>로 모실게요
        </h1>
        <p className="signup-lead">
          계단이 적은 길로
          <br />
          어르신께 맞는 길을 찾아드려요.
        </p>

        <div className="signup-benefits glass">
          <div className="signup-benefit">
            <span>1</span>말씀만 하시면 길을 찾아드려요
          </div>
          <div className="signup-benefit">
            <span>2</span>한 번 설정하면 다시 묻지 않아요
          </div>
          <div className="signup-benefit">
            <span>3</span>어려우면 차량 이용도 알려드려요
          </div>
        </div>

        <button className="kakao-btn" onClick={handleKakao} disabled={busy}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3.5c-4.7 0-8.5 3-8.5 6.7 0 2.4 1.6 4.5 4 5.7l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.2 0 .4.1.6.1 4.7 0 8.5-3 8.5-6.7S16.7 3.5 12 3.5Z"
              fill="currentColor"
            />
          </svg>
          {busy ? '시작하는 중…' : '카카오톡으로 시작하기'}
        </button>
      </div>
    </section>
  )
}
