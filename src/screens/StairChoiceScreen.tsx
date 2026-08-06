import type { StairComparison } from '../types/dto'

/**
 * 계단 있는 길 ↔ 계단 없는 길 선택 — 7차 와이어프레임 #screen-stairs 이식.
 *
 * 7/31 회의(00:31:55~00:37:56): "시스템이 단일 경로를 일방적으로 추천하는 대신, 계단 회피 경로와 일반 경로를
 * 모두 제시하여 사용자가 보행 거리와 편의성을 비교하고 선택할 수 있도록 구현한다."
 *
 * 설계 원칙
 *  · 차이를 숫자로 못 박는다 — "조금 더 걸어요"는 판단에 도움이 안 된다. 분(minute)과 미터를 모두 보여준다.
 *  · 어느 쪽도 추천으로 강조하지 않는다 — 같은 컨디션이라도 그날 무엇이 덜 힘든지는 본인만 안다.
 *  · 글씨를 못 읽는 분을 위해 비교 내용을 음성으로도 읽어준다.
 */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StairChoiceScreen({
  comparison,
  onPick,
  onBack,
  onSos,
  onToast,
}: {
  comparison: StairComparison
  onPick: (pick: 'with' | 'none') => void
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const w = comparison.withStairs
  const n = comparison.noStairs
  const gapMinutes = n.minutes - w.minutes
  const gapMeters = n.meters - w.meters

  const summary =
    `계단을 피할까요? 계단이 있는 길은 ${w.minutes}분에 ${w.meters}미터, ` +
    `계단 없는 길은 ${n.minutes}분에 ${n.meters}미터예요. ` +
    `계단을 피하면 ${gapMeters}미터, ${gapMinutes}분 더 걸어야 해요.`

  function speak() {
    if (!('speechSynthesis' in window)) {
      onToast('이 기기에서는 음성 안내를 쓸 수 없어요')
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(summary)
    utter.lang = 'ko-KR'
    utter.rate = 0.9
    window.speechSynthesis.speak(utter)
  }

  return (
    <section className="screen">
      <header className="topbar">
        <button className="back-btn" onClick={onBack} aria-label="대화로 길찾기로 돌아가기">
          <BackIcon />
        </button>
        <div className="topbar-title">
          <span className="brand-dot" />
          계단 선택
        </div>
        <button className="sos-btn-top" onClick={onSos}>
          SOS
        </button>
      </header>

      <div className="screen-body">
        <p className="screen-kicker">두 가지 길이 있어요</p>
        <h2 className="screen-title">계단을 피할까요?</h2>
        <p className="screen-lead">
          계단이 조금 어렵다고 하셔서, 두 가지를 모두 준비했어요.
          <br />
          걷는 거리를 견줘 보고 골라주세요.
        </p>

        <div className="stair-diff">
          <b>계단을 피하면 {gapMeters.toLocaleString()}m 더 걸어요</b>
          <span>
            걷는 시간이 <b>{gapMinutes}분</b> 늘어납니다. 오늘 오래 걷기 힘드시면 계단이 있는 길이 나을 수 있어요.
          </span>
        </div>

        <div className="stair-opt">
          <div className="stair-opt-head">
            <i aria-hidden="true">🪜</i>
            <b>계단이 있는 길</b>
          </div>
          <div className="stair-metrics">
            <div>
              <span>예상 시간</span>
              <strong>{w.minutes}분</strong>
            </div>
            <div>
              <span>걷는 시간</span>
              <strong>{w.walkMinutes}분</strong>
            </div>
            <div>
              <span>걷는 거리</span>
              <strong>{w.meters.toLocaleString()}m</strong>
            </div>
          </div>
          <div className="stair-facts">
            <div>
              <i className="status-icon warn">!</i>
              <span>{w.stairFact}</span>
            </div>
            <div>
              <i className="status-icon ok">✓</i>
              <span>걷는 거리가 가장 짧아요</span>
            </div>
          </div>
          <button className="btn secondary" onClick={() => onPick('with')}>
            이 길로 갈게요
          </button>
        </div>

        <div className="stair-opt">
          <div className="stair-opt-head">
            <i aria-hidden="true">✓</i>
            <b>계단 없는 길</b>
          </div>
          <div className="stair-metrics">
            <div>
              <span>예상 시간</span>
              <strong>{n.minutes}분</strong>
            </div>
            <div>
              <span>걷는 시간</span>
              <strong>{n.walkMinutes}분</strong>
            </div>
            <div>
              <span>걷는 거리</span>
              <strong>{n.meters.toLocaleString()}m</strong>
            </div>
          </div>
          <div className="stair-facts">
            <div>
              <i className="status-icon ok">✓</i>
              <span>계단·육교·지하보도가 없어요</span>
            </div>
            <div>
              <i className="status-icon warn">!</i>
              <span>
                대신 {gapMinutes}분 · {gapMeters.toLocaleString()}m 더 걸어야 해요
              </span>
            </div>
          </div>
          <button className="btn secondary" onClick={() => onPick('none')}>
            이 길로 갈게요
          </button>
        </div>

        <div className="notice-box" style={{ marginTop: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>오늘 덜 힘드신 쪽을 골라주세요.</span>
        </div>

        <button className="text-btn" style={{ marginTop: 12 }} onClick={speak}>
          음성으로 듣기
        </button>
      </div>
    </section>
  )
}
