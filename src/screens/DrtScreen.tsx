/** 똑버스 이용 안내 (drt) — 6차 와이어프레임 #screen-drt 이식. */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DrtScreen({
  destination,
  onBack,
  onSos,
  onToast,
}: {
  destination: string | null
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const dest = destination ?? '목적지'

  function copyTrip() {
    const text = `출발지: 현재 위치 / 목적지: ${dest}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => onToast('출발지·목적지를 복사했어요'),
        () => onToast('복사에 실패했어요'),
      )
    } else {
      onToast('이 기기에서는 복사를 쓸 수 없어요')
    }
  }

  function speakDrt() {
    if (!('speechSynthesis' in window)) {
      onToast('이 기기에서는 음성 안내를 쓸 수 없어요')
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(
      '똑버스 예약 방법입니다. 전화 또는 공식 앱과 웹을 열고, 출발지와 목적지, 탑승 인원과 보조기구를 알려주세요. 배차 가능 여부와 대기시간은 운영기관에서 확인하세요.',
    )
    utter.lang = 'ko-KR'
    utter.rate = 0.9
    window.speechSynthesis.speak(utter)
  }

  return (
    <section className="screen">
      <header className="topbar">
        <button className="back-btn" onClick={onBack} aria-label="가는 길로 돌아가기">
          <BackIcon />
        </button>
        <div className="topbar-title">
          <span className="brand-dot" />
          똑버스 이용 안내
        </div>
        <button className="sos-btn-top" onClick={onSos}>
          SOS
        </button>
      </header>

      <div className="screen-body">
        <div className="drt-hero">
          <div className="drt-symbol">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 16V8a2 2 0 0 1 2-2h9l4 4v6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="8" cy="17" r="1.8" fill="currentColor" />
              <circle cx="17" cy="17" r="1.8" fill="currentColor" />
              <path d="M4 16h2m6 0h3M15 7v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2>
            똑버스 이용을 함께
            <br />
            확인해 보세요
          </h2>
          <p>현재 경로는 보행 부담이 커서 수요응답형 교통을 함께 안내합니다.</p>
        </div>

        <div className="section-label">추천한 이유</div>
        <div className="criteria">
          <div className="criterion">
            <i>✓</i>
            <span>현재 도보 구간이 설정한 최대 보행 범위를 넘어요.</span>
          </div>
          <div className="criterion">
            <i>✓</i>
            <span>걸어가는 경로에 계단 2곳과 지하보도 1곳이 포함돼 있어요.</span>
          </div>
        </div>

        <div className="section-label">이용 가능한 서비스</div>
        <div className="service-card glass">
          <div className="service-head">
            <h3>수원 똑버스</h3>
            <span className="service-status">
              <i />
              운행 지역 확인
            </span>
          </div>
          <div className="kv-list">
            <div className="kv">
              <span>운행 구역</span>
              <b>팔달구·권선구 일부</b>
            </div>
            <div className="kv">
              <span>예약 전화</span>
              <b>1661-0000</b>
            </div>
            <div className="kv">
              <span>준비 정보</span>
              <b>출발지·목적지·인원</b>
            </div>
          </div>
          <div className="channel-grid">
            <a className="channel" href="tel:16610000">
              <span className="channel-icon">☎️</span>
              <strong>전화 예약</strong>
              <span>운영기관에 바로 연결</span>
            </a>
            <button className="channel" onClick={() => onToast('예약 웹페이지 연결은 곧 준비할게요')}>
              <span className="channel-icon">🌐</span>
              <strong>앱·웹 열기</strong>
              <span>공식 예약 채널 이동</span>
            </button>
            <button className="channel" onClick={copyTrip}>
              <span className="channel-icon">📋</span>
              <strong>위치 복사</strong>
              <span>출발지와 목적지 복사</span>
            </button>
            <button className="channel" onClick={speakDrt}>
              <span className="channel-icon">🔊</span>
              <strong>음성 안내</strong>
              <span>예약 방법 다시 듣기</span>
            </button>
          </div>
        </div>

        <div className="section-label">예약은 이렇게 하세요</div>
        <div className="steps">
          <div className="step-card">전화 또는 공식 앱·웹을 열어주세요.</div>
          <div className="step-card">출발지, 목적지, 탑승 인원과 보조기구를 알려주세요.</div>
          <div className="step-card">배차 가능 여부와 대기시간을 운영기관에서 확인하세요.</div>
        </div>

        <div className="notice-box">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          실제 배차와 대기시간은 운영기관에서 확인해 주세요.
        </div>
      </div>
    </section>
  )
}
