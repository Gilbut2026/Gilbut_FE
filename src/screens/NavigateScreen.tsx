import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { RouteMap } from '../components/RouteMap'
import { speak } from '../state/tts'
import type { RouteOption } from '../types/dto'

/**
 * 길 안내 — 고른 경로를 한 단계씩 따라간다.
 *
 * 왜 지도만으로 끝내지 않는가 — 어르신은 지도에서 "여기가 어디고 어느 쪽으로 가야 하는지"를
 * 읽어내기 어렵다. 화살표와 도로 이름을 보고 방향을 잡는 것은 학습된 기술이다.
 * 그래서 **지금 할 일 하나만 크게** 보여주고, 지도는 그 옆의 참고로 둔다.
 * "오른쪽으로 도세요"를 듣는 편이 지도를 읽는 것보다 쉽다.
 *
 * 한 화면에 한 단계만 두는 이유도 같다. 일곱 단계를 한꺼번에 늘어놓으면 지금 어디인지
 * 놓친다. 전체가 보고 싶은 분을 위해 「전체 보기」를 따로 뒀다.
 *
 * 안내문과 좌표는 전부 TMAP 이 준 값이다(api/directions). 지어낸 문장이 없다.
 * BE 가 상세를 안 주면 그렇다고 알린다 — 없는 길을 만들어내지 않는다.
 */

const KIND_ICON: Record<string, string> = {
  walk: '🚶',
  ride: '🚌',
  getoff: '🚏',
}

export function NavigateScreen({
  option,
  destination,
  onBack,
  onSos,
  onToast,
}: {
  option: RouteOption
  destination: string | null
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const steps = option.directions?.steps ?? []
  const path = option.directions?.path ?? []

  const [index, setIndex] = useState(0)
  const [showAll, setShowAll] = useState(false)
  // 화면에 들어온 직후 한 번은 자동으로 읽어준다. 그 뒤에는 단계를 넘길 때마다.
  const spokenRef = useRef(-1)

  const step = steps[index]
  const isLast = index >= steps.length - 1

  /*
   * 지금 단계를 소리로 읽어준다.
   * 음성 안내가 꺼져 있으면 speak() 가 아무 일도 하지 않는다(state/tts) —
   * 여기서 설정을 다시 판단하지 않는다. 한 곳에서만 정해야 어긋나지 않는다.
   */
  useEffect(() => {
    if (!step || spokenRef.current === index) return
    spokenRef.current = index
    // auto: true — 음성 안내를 꺼두신 분에게는 소리가 나지 않는다
    speak(`${step.title}. ${step.detail ?? ''}`, { auto: true })
  }, [index, step])

  if (!steps.length) {
    return (
      <section className="screen">
        <TopBar title="길 안내" onBack={onBack} backLabel="결과로 돌아가기" onSos={onSos} />
        <div className="screen-body">
          <div className="empty-note">
            <b>길 안내를 준비하지 못했어요</b>
            <p>
              이 경로는 상세 안내가 오지 않았어요. 결과 화면의 이동 조건은 그대로 보실 수 있어요.
            </p>
            <button className="btn neutral" onClick={onBack}>
              결과로 돌아가기
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="screen">
      <TopBar title="길 안내" onBack={onBack} backLabel="결과로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <div className="nav-head">
          <b>{destination ?? '목적지'}까지</b>
          <span>
            {index + 1} / {steps.length}
          </span>
        </div>

        {/* 실제 경로 좌표. 키가 없거나 못 불러오면 지도 자리에 그 사실을 적는다 */}
        <RouteMap path={path} />

        <div className="nav-step">
          <span className="ico" aria-hidden="true">
            {KIND_ICON[step.kind] ?? '🚶'}
          </span>
          <div>
            <b>{step.title}</b>
            {step.detail && <span>{step.detail}</span>}
          </div>
        </div>

        <div className="nav-actions">
          <button
            className="btn neutral"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            이전
          </button>
          {isLast ? (
            <button
              className="btn primary"
              onClick={() => {
                onToast('안전하게 도착하셨길 바라요')
                onBack()
              }}
            >
              도착했어요
            </button>
          ) : (
            <button className="btn primary" onClick={() => setIndex((i) => i + 1)}>
              다음
            </button>
          )}
        </div>

        <button
          className="btn neutral"
          onClick={() => {
            // 직접 누르신 것이므로 설정과 상관없이 읽어드린다 (auto 를 붙이지 않는다)
            speak(`${step.title}. ${step.detail ?? ''}`)
          }}
        >
          🔊 다시 들려주세요
        </button>

        <button className="nav-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '전체 보기 접기' : `전체 ${steps.length}단계 보기`}
        </button>

        {showAll && (
          <ol className="nav-all">
            {steps.map((s, i) => (
              <li key={`${s.title}-${i}`} className={i === index ? 'on' : undefined}>
                <button onClick={() => setIndex(i)}>
                  <span aria-hidden="true">{KIND_ICON[s.kind] ?? '🚶'}</span>
                  <span>
                    <b>{s.title}</b>
                    {s.detail && <em>{s.detail}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
