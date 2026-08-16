import { useEffect, useMemo, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { RouteMap } from '../components/RouteMap'
import { speak } from '../state/tts'
import { useKeepAwake } from '../state/wakeLock'
import { getFacilitiesAlongRoute } from '../api/facility'
import type { FacilityItem, FacilityType, RouteOption } from '../types/dto'

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

/*
 * 빈 배열은 **모듈에 하나만** 둔다.
 *
 * `?? []` 로 그때그때 만들면 렌더마다 다른 배열이 되어, 그것을 의존성으로 쓰는
 * 지도가 매번 처음부터 다시 그려진다. 값은 똑같은데 참조만 달라서 생기는 낭비다.
 * 오늘 이전에 저장된 여정을 되살리면 segments 가 없어서 실제로 이 경우가 된다.
 */
const NO_POINTS: never[] = []

/** 토글 칩에 넣는 작은 핀 — 지도 표시와 같은 모양이라 무엇을 켜는 버튼인지 바로 읽힌다 */
function PinMark({ kind }: { kind: 'shelter' | 'toilet' }) {
  return (
    <svg className={`pin-mark ${kind}`} viewBox="0 0 28 36" aria-hidden="true">
      <path d="M14 .9C6.8.9 1 6.6 1 13.6c0 9 13 21.5 13 21.5s13-12.5 13-21.5C27 6.6 21.2.9 14 .9z" />
    </svg>
  )
}

const KIND_ICON: Record<string, string> = {
  walk: '🚶',
  ride: '🚌',
  getoff: '🚏',
}

export function NavigateScreen({
  option,
  destination,
  onBack,
  onArrive,
  onSos,
  onToast,
}: {
  option: RouteOption
  destination: string | null
  onBack: () => void
  /** 도착했을 때 — 이동이 끝났으므로 홈으로 돌려보낸다 */
  onArrive: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const steps = option.directions?.steps ?? NO_POINTS
  const path = option.directions?.path ?? NO_POINTS
  const segments = option.directions?.segments ?? NO_POINTS

  const [index, setIndex] = useState(0)
  const [showAll, setShowAll] = useState(false)

  /*
   * 쉼터·화장실 — 7/31 회의: **점수에 넣지 않고 지도에 표시만** 한다.
   *
   * 쉼터는 기본으로 켜 둔다. 「쉬어 갈 곳이 있다」는 것은 길을 나서기 전에 알아야
   * 하는 정보이고, 어르신이 토글을 찾아 누를 것이라고 기대하면 안 된다.
   * 화장실은 꺼 둔다 — 둘 다 켜면 마커가 많아 정작 경로가 묻힌다. 필요한 분이 켠다.
   */
  const [showShelter, setShowShelter] = useState(true)
  const [showToilet, setShowToilet] = useState(false)
  const [facilities, setFacilities] = useState<FacilityItem[]>([])
  /** 반경을 넓혀서 찾은 것인가 — 「가는 길에」와 「길에서 조금 떨어진 곳에」를 갈라 적는다 */
  const [widened, setWidened] = useState(false)
  // 화면에 들어온 직후 한 번은 자동으로 읽어준다. 그 뒤에는 단계를 넘길 때마다.
  const spokenRef = useRef(-1)

  const step = steps[index]
  const isLast = index >= steps.length - 1

  /*
   * 걷는 동안 화면이 꺼지지 않게 한다.
   * 길 안내 화면에서만 건다 — 앱 전체에 걸면 켜둔 채 주머니에 넣었을 때 배터리가 샌다.
   * 안내할 단계가 없으면(아래에서 안내문 대신 안내 실패를 그린다) 걸 이유도 없다.
   */
  useKeepAwake(steps.length > 0)

  /*
   * 지도를 옮길 자리 — 타는 곳과 내리는 곳뿐이다.
   *
   * 단계를 넘길 때 지도는 그대로 두는 것이 기본이다(RouteMap.focusActive). 걷는 길은
   * 눈앞이 이어지니 그게 맞다. 그런데 버스·지하철은 다르다 — 「○○에서 내려요」가
   * 떴는데 화면이 탄 자리에 남아 있으면 정작 내릴 곳이 화면 밖이다.
   *
   *   타기   그 구간의 첫 좌표 = 타는 곳     (이전 단계로 돌아왔을 때)
   *   내리기 그 구간의 끝 좌표 = 내리는 곳   (다음 단계로 넘어갈 때)
   *   걷기   옮기지 않는다
   *
   * 앞뒤가 같은 규칙이라는 것이 중요하다. 다음에서 옮기고 이전에서 안 옮기면
   * 같은 버튼을 눌렀는데 어떨 땐 튀고 어떨 땐 가만히 있어 규칙을 알 수 없다.
   */
  const panTo = useMemo(() => {
    if (!step || step.segmentIndex == null) return null
    const seg = segments[step.segmentIndex]
    if (!seg || seg.points.length < 2) return null
    if (step.kind === 'ride') return seg.points[0]
    if (step.kind === 'getoff') return seg.points[seg.points.length - 1]
    return null
  }, [step, segments])


  /*
   * 켜져 있는 종류만 받아온다.
   * BE 가 수원시 공공데이터를 들고 있어 외부 호출이 아니라, 토글마다 불러도 부담이 없다.
   */
  useEffect(() => {
    const types: FacilityType[] = []
    if (showShelter) types.push('SHELTER')
    if (showToilet) types.push('TOILET')
    if (!types.length || path.length < 2) {
      setFacilities([])
      setWidened(false)
      return
    }
    let alive = true
    getFacilitiesAlongRoute(path, types).then((found) => {
      if (!alive) return
      setFacilities(found.items)
      setWidened(found.widened)
    })
    return () => {
      alive = false
    }
  }, [showShelter, showToilet, path])

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

        {/* 실제 경로 좌표. 키가 없거나 못 불러오면 지도 자리에 그 사실을 적는다.
            지금 단계가 지도에서도 진하게 보이도록 그 토막을 함께 넘긴다 */}
        <RouteMap
          path={path}
          segments={segments}
          activeSegment={step.segmentIndex}
          /* 타는 곳·내리는 곳으로만 옮긴다. 줌은 그대로 둔다 */
          panTo={panTo}
          facilities={facilities}
          /* 마커를 누르면 이름과 여는 시간을 알려준다 — 지도에 글자를 얹으면 길이 묻힌다 */
          onFacilityTap={(f) =>
            onToast(
              [f.name, f.operatingHours, f.distanceFromRouteM ? `길에서 ${f.distanceFromRouteM}m` : '']
                .filter(Boolean)
                .join(' · '),
            )
          }
        />

        {/* 쉼터·화장실 토글. 지도 바로 아래에 둬서 무엇이 켜졌는지 함께 보인다 */}
        <div className="facility-toggles">
          <button
            className={`facility-toggle${showShelter ? ' on' : ''}`}
            aria-pressed={showShelter}
            onClick={() => setShowShelter((v) => !v)}
          >
            <PinMark kind="shelter" />
            쉼터
          </button>
          <button
            className={`facility-toggle${showToilet ? ' on' : ''}`}
            aria-pressed={showToilet}
            onClick={() => setShowToilet((v) => !v)}
          >
            <PinMark kind="toilet" />
            화장실
          </button>
          {(showShelter || showToilet) && (
            <span className="facility-count">
              {facilities.length === 0
                ? '가는 길 근처에는 없어요'
                : widened
                  ? `길에서 조금 떨어진 곳에 ${facilities.length}곳`
                  : `가는 길에 ${facilities.length}곳`}
            </span>
          )}
        </div>

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
                /*
                 * 도착하면 **홈으로** 돌려보낸다.
                 *
                 * 예전에는 결과 화면으로 되돌아갔는데, 이동이 끝났는데 가는 길이
                 * 그대로 떠 있으면 「아직 안 간 건가」로 읽힌다.
                 * 다음에 하실 일은 다른 곳에 가는 것이지 방금 온 길을 다시 보는 것이 아니다.
                 */
                onToast('안전하게 도착하셨길 바라요')
                onArrive()
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
