/**
 * 똑버스 이용 안내 (drt) — 7차 와이어프레임 #screen-drt 이식.
 *
 * 2026-08-15 실데이터 반영. 예전에는 예약 전화 `1661-0000`, 운행 구역 "팔달구·권선구 일부",
 * 추천 이유 "계단 2곳과 지하보도 1곳"이 전부 하드코딩이었다. 특히 전화번호는 실제 번호가
 * 아닌데 `tel:` 링크까지 걸려 있어서, 누르면 엉뚱한 곳으로 전화가 걸렸다.
 *
 * 이제 BE 「맞춤 경로 추천」 응답의 drtGuide(권역명·대표번호·이용 가능 여부)와
 * drtDecision.reasonCodes(AI 판단 근거)를 받아 쓴다. 값이 없으면 **번호를 지어내지 않고**
 * 운영기관 확인 안내로 대체한다.
 */
import { speak as playVoice } from '../state/tts'
import { TopBar } from '../components/TopBar'
import type { DrtGuideResponse, DrtReasonCode } from '../types/dto'

/** AI 판단 근거 코드 → 어르신이 읽을 문장 */
const REASON_TEXT: Record<DrtReasonCode, string> = {
  ASSISTIVE_DEVICE: '보조기구를 사용하신다고 알려주셨어요.',
  LONG_WALK_DISTANCE: '걸어가는 거리가 평소 편하신 범위보다 길어요.',
  MANY_TRANSFERS: '갈아타는 횟수가 많아요.',
  SEVERE_WEATHER: '날씨가 좋지 않아 걷기 어려울 수 있어요.',
  NO_PASSABLE_ROUTE: '걸어서 갈 수 있는 편한 길을 찾지 못했어요.',
}

export function DrtScreen({
  destination,
  drtGuide,
  reasons,
  onBack,
  onSos,
  onToast,
}: {
  destination: string | null
  /** BE 가 준 똑버스 안내 상세. 없으면 번호·권역을 표시하지 않는다 */
  drtGuide?: DrtGuideResponse | null
  /** 똑버스를 권한 이유 (AI 판단) */
  reasons?: DrtReasonCode[]
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const dest = destination ?? '목적지'
  const serviceName = drtGuide?.serviceName?.trim() || '수원 똑버스'
  const areaName = drtGuide?.serviceAreaName?.trim() || null
  const tel = drtGuide?.contactNumber?.trim() || null
  const outOfArea = drtGuide?.availability === 'OUT_OF_SERVICE_AREA'
  const reasonList = (reasons ?? []).filter((r) => r in REASON_TEXT)

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
    const telPart = tel ? `예약 전화는 ${tel} 입니다. ` : ''
    const ok = playVoice(
      `똑버스 예약 방법입니다. ${telPart}전화 또는 공식 앱과 웹을 열고, 출발지와 목적지, 탑승 인원과 보조기구를 알려주세요. 배차 가능 여부와 대기시간은 운영기관에서 확인하세요.`,
    )
    if (!ok) onToast('이 기기에서는 음성 안내를 쓸 수 없어요')
  }

  return (
    <section className="screen">
      <TopBar title="똑버스 이용 안내" onBack={onBack} backLabel="가는 길로 돌아가기" onSos={onSos} />

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

        {reasonList.length > 0 && (
          <>
            <div className="section-label">추천한 이유</div>
            <div className="criteria">
              {reasonList.map((code) => (
                <div className="criterion" key={code}>
                  <i>✓</i>
                  <span>{REASON_TEXT[code]}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="section-label">이용 가능한 서비스</div>
        <div className="service-card glass">
          <div className="service-head">
            <h3>{serviceName}</h3>
            <span className="service-status">
              <i />
              {outOfArea ? '운행 구역 밖' : '운행 지역 확인'}
            </span>
          </div>
          <div className="kv-list">
            <div className="kv">
              <span>운행 구역</span>
              <b>{outOfArea ? '이 지역은 운행하지 않아요' : (areaName ?? '운영기관 확인')}</b>
            </div>
            <div className="kv">
              <span>예약 전화</span>
              {/* 번호를 모를 때 지어내지 않는다 — 잘못된 곳으로 전화가 걸리면 안 된다 */}
              <b>{tel ?? '운영기관 확인'}</b>
            </div>
            <div className="kv">
              <span>준비 정보</span>
              <b>출발지·목적지·인원</b>
            </div>
          </div>
          <div className="channel-grid">
            {tel ? (
              <a className="channel" href={`tel:${tel.replace(/[^0-9]/g, '')}`}>
                <span className="channel-icon">☎️</span>
                <strong>전화 예약</strong>
                <span>운영기관에 바로 연결</span>
              </a>
            ) : (
              <button
                className="channel"
                onClick={() => onToast('예약 전화번호는 운영기관에서 확인해 주세요')}
              >
                <span className="channel-icon">☎️</span>
                <strong>전화 예약</strong>
                <span>번호 확인이 필요해요</span>
              </button>
            )}
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
