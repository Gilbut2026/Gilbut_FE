/**
 * 홈 — 7차 와이어프레임 #screen-home 이식.
 * 마이크(음성으로 목적지 말하기) + 자주 가는 곳. 하단 탭은 App 셸이 렌더한다.
 */

import { TopBar } from '../components/TopBar'

const PLACES = [
  { emoji: '🏥', name: '○○병원' },
  { emoji: '🛒', name: '전통시장' },
  { emoji: '🏛️', name: '주민센터' },
  { emoji: '🚉', name: '수원역' },
]

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8.5" y="2.5" width="7" height="11.5" rx="3.5" fill="currentColor" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function HomeScreen({
  onMic,
  onPlace,
  onSos,
}: {
  onMic: () => void
  onPlace: (destination: string) => void
  onSos: () => void
}) {
  return (
    <section className="screen">
      <TopBar title="AI 길벗" onSos={onSos} />

      <div className="screen-body">
        <div className="home-hero glass">
          <h2>
            안녕하세요!
            <br />
            <em>어디로</em> 가고 싶으세요?
          </h2>
        </div>

        <div className="mic-zone">
          <button className="mic-button" onClick={onMic} aria-label="목적지를 음성으로 말하기">
            <MicIcon />
          </button>
          <div className="mic-label">누르고 목적지를 말씀하세요</div>
          <div className="mic-help">예: “○○병원에 가고 싶어요”</div>
        </div>

        <div className="home-section-label">자주 가는 곳</div>
        <div className="quick-grid">
          {PLACES.map((p) => (
            <button key={p.name} className="place-btn" onClick={() => onPlace(p.name)}>
              <span className="place-emoji">{p.emoji}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
