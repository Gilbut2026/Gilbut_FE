import { TopBar } from '../components/TopBar'

/**
 * 위치 권한 거부 — 7차 와이어프레임 #screen-location 이식.
 * 대화로 길찾기에서 "현재 위치" 출발을 골랐는데 GPS 가 꺼져 있거나 거부됐을 때,
 * ChatScreen 이 대화 상태를 유지한 채 이 화면으로 바꿔 보여준다.
 *  · 위치 사용 켜기        : 위치 권한을 다시 시도
 *  · 집에서 출발하기       : 저장된 집이 있을 때만 노출 → 집을 출발지로
 *  · 출발지를 직접 말할게요 : 대화로 돌아가 직접 입력받기
 */
export function LocationScreen({
  hasHome,
  onAllow,
  onUseHome,
  onTypeOrigin,
  onBack,
  onSos,
}: {
  hasHome: boolean
  onAllow: () => void
  onUseHome: () => void
  onTypeOrigin: () => void
  onBack: () => void
  onSos: () => void
}) {
  return (
    <section className="screen">
      <TopBar title="위치 사용" onBack={onBack} backLabel="출발지 선택으로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <div className="route-empty glass">
          <div className="route-empty-art error">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2>지금 계신 곳을 알 수 없어요</h2>
          <p>
            위치 사용이 꺼져 있어요.
            <br />
            켜시면 지금 계신 곳에서 바로 길을 찾아드려요.
          </p>
          <div className="route-empty-actions">
            <button className="btn primary" onClick={onAllow}>
              위치 사용 켜기
            </button>
            {hasHome && (
              <button className="btn secondary" onClick={onUseHome}>
                집에서 출발하기
              </button>
            )}
            <button className="btn secondary" onClick={onTypeOrigin}>
              출발지를 직접 말할게요
            </button>
          </div>
          <div className="route-empty-hint">
            위치를 켜지 않아도 <b>출발지를 직접 말씀하시면</b> 길 안내를 받으실 수 있어요.
          </div>
        </div>
      </div>
    </section>
  )
}
