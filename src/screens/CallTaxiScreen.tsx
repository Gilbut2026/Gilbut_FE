/**
 * 장애인 콜택시 안내 (calltaxi) — 7차 와이어프레임 #screen-calltaxi 이식.
 *
 * 7/31 회의(00:14:22~00:18:59): 수원 똑버스는 휠체어를 탄 채로 탑승할 수 없는 것으로 조사됐고,
 * 똑버스를 대체할 만한 공개 데이터셋도 찾지 못했다. 현시점에서 가장 현실적인 안으로
 * "장애인 콜택시 콜센터 전화번호 안내"에 팀 전원이 합의했다. 앱은 예약 주체가 아니고 번호만 알려준다.
 * (똑버스 미운행 지역도 같은 화면으로 통일)
 *
 * TODO(기획): 콜센터 정식 명칭·대표번호·이용 대상 기준은 기획팀 자료 수령 후 확정.
 */

/**
 * 콜센터 대표번호. **자료를 받기 전까지는 null 이다.**
 *
 * 예전에는 `1666-0000` 이라는 자리표시자를 화면에 띄우고 tel: 링크까지 걸어뒀다.
 * 실제 번호가 아닌데 누르면 전화가 걸린다 — 어르신 대상 서비스에서 있어선 안 되는 상태였다.
 * 없는 번호를 지어내느니 "확인이 필요하다"고 말하는 편이 맞다.
 *
 * BE 에도 콜택시 데이터는 없다. AI 가 주는 DrtDecision.taxiGuide(콜택시로 안내할지)만 있고
 * 번호·명칭·이용 대상은 어디에도 없다(2026-08-15 확인).
 * 노션 「7/31 회의」의 '장애인 콜택시 콜센터 정보 — 조건희님 자료 대기' 항목이 해결되면
 * 여기에 넣고, 가능하면 BE 응답으로 받아 지역별로 다르게 안내하는 것이 낫다.
 */
const CALL_CENTER_TEL: string | null = null

import { speak as playVoice } from '../state/tts'
import { TopBar } from '../components/TopBar'


export function CallTaxiScreen({
  destination,
  onBack,
  onSos,
  onToast,
  onOpenContacts,
}: {
  destination: string | null
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
  onOpenContacts: () => void
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

  function speakCallTaxi() {
    const ok = playVoice(
      '장애인 콜택시 안내입니다. 콜센터로 전화를 걸어 휠체어를 이용한다고 먼저 말씀하시고, 출발지와 목적지, 타실 시간을 알려주세요. 예약은 콜센터에서 직접 하셔야 해요.',
    )
    if (!ok) onToast('이 기기에서는 음성 안내를 쓸 수 없어요')
  }

  return (
    <section className="screen">
      <TopBar title="콜택시 안내" onBack={onBack} backLabel="가는 길로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <div className="drt-hero">
          <div className="drt-symbol">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10" cy="4" r="1.9" fill="currentColor" />
              <path d="M10 7v5h5l3 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14.5 13.2A5.5 5.5 0 1 1 7 8.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2>
            휠체어로 탈 수 있는
            <br />
            차량을 안내해 드려요
          </h2>
          <p>수원 똑버스는 휠체어를 탄 채로 탈 수 없어요. 대신 장애인 콜택시를 전화로 부르실 수 있어요.</p>
        </div>

        <div className="section-label">이렇게 안내해요</div>
        <div className="criteria">
          <div className="criterion">
            <i>✓</i>
            <span>기본 설정에서 휠체어를 쓰신다고 알려주셨어요.</span>
          </div>
          <div className="criterion">
            <i>✓</i>
            <span>수원 똑버스는 휠체어 탑승이 어려운 것으로 확인됐어요.</span>
          </div>
        </div>

        <div className="section-label">전화로 부르실 수 있어요</div>
        <div className="service-card glass">
          <div className="service-head">
            <h3>장애인 콜택시 콜센터</h3>
            <span className="service-status">
              <i />
              전화 예약
            </span>
          </div>
          <div className="kv-list">
            <div className="kv">
              <span>대표 번호</span>
              <b>{CALL_CENTER_TEL ?? '콜센터 확인'}</b>
            </div>
            <div className="kv">
              <span>이용 대상</span>
              <b>콜센터 확인</b>
            </div>
            <div className="kv">
              <span>준비 정보</span>
              <b>출발지·목적지·인원</b>
            </div>
          </div>
          <div className="channel-grid">
            {CALL_CENTER_TEL ? (
              <a className="channel" href={`tel:${CALL_CENTER_TEL.replace(/[^0-9]/g, '')}`}>
                <span className="channel-icon">☎️</span>
                <strong>전화 걸기</strong>
                <span>콜센터에 바로 연결</span>
              </a>
            ) : (
              <button
                className="channel"
                onClick={() => onToast('콜센터 번호는 준비되는 대로 안내해 드릴게요')}
              >
                <span className="channel-icon">☎️</span>
                <strong>전화 걸기</strong>
                <span>번호 확인이 필요해요</span>
              </button>
            )}
            <button className="channel" onClick={copyTrip}>
              <span className="channel-icon">📋</span>
              <strong>위치 복사</strong>
              <span>출발지와 목적지 복사</span>
            </button>
            <button className="channel" onClick={speakCallTaxi}>
              <span className="channel-icon">🔊</span>
              <strong>음성 안내</strong>
              <span>부르는 방법 다시 듣기</span>
            </button>
            <button className="channel" onClick={onOpenContacts}>
              <span className="channel-icon">👤</span>
              <strong>보호자에게</strong>
              <span>비상 연락처 보기</span>
            </button>
          </div>
        </div>

        <div className="section-label">부르실 때는 이렇게</div>
        <div className="steps">
          <div className="step-card">위 번호로 전화를 걸어주세요.</div>
          <div className="step-card">휠체어를 이용한다고 먼저 말씀해 주세요.</div>
          <div className="step-card">출발지와 목적지, 타실 시간을 알려주세요.</div>
        </div>

        <div className="notice-box">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          예약은 콜센터에서 직접 하셔야 해요. 이 앱은 번호만 알려드려요.
        </div>
      </div>
    </section>
  )
}
