import type { StairComparison } from '../types/dto'
import { speak as playVoice } from '../state/tts'
import { TopBar } from '../components/TopBar'

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

  /*
   * **계단 없는 길이 항상 더 멀다고 볼 수 없다.**
   *
   * 예전에는 그렇게 가정하고 `n.meters - w.meters` 를 그대로 적었다. 그런데 BE 가
   * 비교하는 두 길은 「추천 경로」와 「계단제외 최단 경로」라, 계단 없는 쪽이 더 짧을
   * 수도 있다. 그러면 화면에 「계단을 피하면 -120m 더 걸어요」가 뜨고 음성도 그렇게
   * 읽는다. 숫자가 음수로 보이는 순간 나머지 안내까지 못 믿게 된다.
   *
   * 세 경우를 갈라서 각각 사실대로 적는다.
   */
  const moreMeters = n.meters - w.meters
  const moreMinutes = n.minutes - w.minutes
  // 50m·2분 미만은 사람이 체감하지 못한다 — 「더 걷는다」고 할 것이 못 된다
  const similar = Math.abs(moreMeters) < 50 && Math.abs(moreMinutes) < 2
  const detour = !similar && (moreMeters > 0 || moreMinutes > 0)

  const diffTitle = similar
    ? '두 길의 걷는 양이 비슷해요'
    : detour
      ? `계단을 피하면 ${moreMeters.toLocaleString()}m 더 걸어요`
      : `계단을 피해도 더 걷지 않아요`

  const diffText = similar
    ? '걷는 거리가 거의 같아서, 계단만 놓고 편한 쪽을 고르시면 돼요.'
    : detour
      ? `걷는 시간이 ${moreMinutes}분 늘어납니다. 오늘 오래 걷기 힘드시면 계단이 있는 길이 나을 수 있어요.`
      : `계단 없는 길이 오히려 ${Math.abs(moreMeters).toLocaleString()}m 짧아요.`

  const summary =
    `계단을 피할까요? 계단이 있는 길은 ${w.minutes}분에 ${w.meters}미터, ` +
    `계단 없는 길은 ${n.minutes}분에 ${n.meters}미터예요. ` +
    `${diffTitle}. ${diffText}`

  function speak() {
    if (!playVoice(summary)) onToast('이 기기에서는 음성 안내를 쓸 수 없어요')
  }

  return (
    <section className="screen">
      <TopBar title="계단 선택" onBack={onBack} backLabel="대화로 길찾기로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <p className="screen-kicker">두 가지 길이 있어요</p>
        <h2 className="screen-title">계단을 피할까요?</h2>
        <p className="screen-lead">
          계단이 조금 어렵다고 하셔서, 두 가지를 모두 준비했어요.
          <br />
          걷는 거리를 견줘 보고 골라주세요.
        </p>

        <div className="stair-diff">
          <b>{diffTitle}</b>
          <span>{diffText}</span>
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
            {/* 「가장 짧다」는 사실일 때만 적는다 — 예전에는 늘 붙어 있었다 */}
            {moreMeters > 0 && (
              <div>
                <i className="status-icon ok">✓</i>
                <span>걷는 거리가 더 짧아요</span>
              </div>
            )}
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
            {/* 더 걸어야 할 때만 경고로 적는다. 비슷하거나 더 짧으면 그렇게 적는다 */}
            {detour ? (
              <div>
                <i className="status-icon warn">!</i>
                <span>
                  대신 {moreMinutes}분 · {moreMeters.toLocaleString()}m 더 걸어야 해요
                </span>
              </div>
            ) : (
              <div>
                <i className="status-icon ok">✓</i>
                <span>
                  {similar ? '걷는 양은 계단 있는 길과 비슷해요' : '걷는 거리도 더 짧아요'}
                </span>
              </div>
            )}
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
