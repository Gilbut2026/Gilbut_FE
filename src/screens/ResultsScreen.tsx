import { useCallback, useEffect, useRef, useState } from 'react'
import { getRoutes } from '../api/route'
import type { ChatOutcome } from '../types/nav'
import { ApiError } from '../api/client'
import { speak } from '../state/tts'
import { arrivalLabel } from '../api/time'
import { TopBar } from '../components/TopBar'
import { applyStairChoice } from '../api/stairChoice'
import { getMobilityProfile } from '../api/user'
import type {
  LatLng,
  RouteErrorKind,
  RouteFacility,
  RouteFilterCode,
  RouteKey,
  RouteOption,
  RouteResult,
} from '../types/dto'

/**
 * 가는 길 (결과) — 7차 와이어프레임 #screen-results 이식.
 * 오늘의 추천 경로를 중심에 두고, '다른 길도 볼게요'로 편한 길·걷기 적은 길·똑버스(또는 콜택시)를 번갈아 본다.
 *
 * 7/31 회의 반영
 *  · 쉼터를 미니맵 위에 마커로 표시 — 점수에는 넣지 않고 "가는 길에 보이게"만 한다.
 *  · 계단이 '조금 어려움'이면 결과를 바로 보여주지 않고 계단 선택 화면을 먼저 띄운다.
 *  · 휠체어 이용자에게는 똑버스 대신 장애인 콜택시 안내가 후보로 들어온다.
 */


/**
 * 경로 조회 실패 안내 문구.
 * 설계 원칙: **막다른 길을 만들지 않는다** — 모든 원인에 다음 행동을 준다.
 * 어르신 대상이라 최후 수단으로 「전화로 도움 받기」를 항상 남긴다.
 */
const ROUTE_ERRORS: Record<RouteErrorKind, { title: string; text: string; hint: string }> = {
  quota: {
    title: '지금은 길을 찾지 못했어요',
    text: '교통정보를 불러오는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.',
    hint: '길 안내가 안 되더라도 전화로 도움을 받으실 수 있어요.',
  },
  none: {
    title: '갈 수 있는 길을 찾지 못했어요',
    text: '계단을 피하는 조건 때문일 수 있어요. 기본 설정을 조금 바꾸면 길이 나올 수 있어요.',
    hint: '설정에서 계단·보행 시간을 바꾸고 다시 찾아보실 수 있어요.',
  },
  outside: {
    title: '아직 안내할 수 없는 지역이에요',
    text: '지금은 수원시 안에서만 길을 찾아드릴 수 있어요.',
    hint: '수원시 안의 목적지로 다시 말씀해 주세요.',
  },
  offline: {
    title: '인터넷 연결이 끊겼어요',
    text: '연결을 확인하신 뒤 다시 시도해 주세요.',
    hint: '연결이 안 되어도 전화로 도움을 받으실 수 있어요.',
  },
  server: {
    title: '지금은 길을 찾지 못했어요',
    text: '잠시 문제가 생겼어요. 조금 뒤 다시 시도해 주세요.',
    hint: '길 안내가 안 되더라도 전화로 도움을 받으실 수 있어요.',
  },
}

/**
 * 실패 원인 판별.
 * ⚠️ `outside`(수원 밖)는 BE 가 별도 코드/메시지를 내려줘야 구분할 수 있다 — 응답 규약 확인 필요.
 */
function toErrorKind(e: unknown): RouteErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'offline'
    if (e.status === 429) return 'quota'
    if (e.status === 404) return 'none'
    return 'server'
  }
  return 'server'
}

/**
 * 출발지 → 목적지 요약 띠.
 *
 * 여기 원래 지도가 있었는데 **가짜였다.** 도로도 건물도 경로선도 전부 하드코딩된
 * 그림이라 실제 경로와 아무 관계가 없었다. 그런데 라벨은 "🗺️ 경로 미리보기"라고
 * 경로라고 주장했다(2026-08-16 지적).
 *
 * 똑버스에서는 특히 나빴다. 수요응답형이라 **예약 전에는 경로가 정해지지도 않는다.**
 * 없는 길을 그려놓고 있었던 셈이다.
 *
 * 어르신은 화면에 그려진 것을 사실로 믿는다. 그러니 모르는 것은 그리지 않는다.
 * 대신 우리가 **확실히 아는 것**만 보여준다 — 어디서 어디로 가는지, 어떻게 가는지.
 * 지도처럼 보이지 않게 만든 것도 일부러다. 지도인 척하면 지도로 읽힌다.
 *
 * 진짜 지도는 지도 SDK 를 붙여야 한다(노션 고도화 목록).
 */
const MODE_ICON: Record<RouteKey, string> = {
  comfort: '🚌',
  short: '🚶',
  drt: '🚐',
  calltaxi: '🚕',
}

function RouteStrip({
  routeKey,
  origin,
  destination,
}: {
  routeKey: RouteKey
  origin: string
  destination: string
}) {
  return (
    <div className="route-strip">
      <div className="route-strip-end">
        <span className="dot start" aria-hidden="true" />
        <b>{origin}</b>
      </div>
      <div className="route-strip-line" aria-hidden="true">
        <span>{MODE_ICON[routeKey]}</span>
      </div>
      <div className="route-strip-end">
        <span className="dot goal" aria-hidden="true" />
        <b>{destination}</b>
      </div>
    </div>
  )
}

function RouteView({
  result,
  selected,
  departureDateTime,
  onCompare,
  onGuide,
}: {
  result: RouteResult
  selected: RouteOption
  /** 대화에서 고른 출발 시각. 없으면 지금 나서는 것으로 본다 */
  departureDateTime: string | null
  onCompare: () => void
  onGuide: (guide: RouteOption['guide'], result: RouteResult, option: RouteOption) => void
}) {
  const isRec = selected.key === result.recommendedKey
  // 소요시간을 못 읽어내면 도착 시각도 적지 않는다 — 틀린 시각은 없느니만 못하다
  const selectedMin = minutesOf(selected.time)
  const arriveAt = selectedMin == null ? null : arrivalLabel(departureDateTime, selectedMin)
  return (
    <div>
      <div className="result-intro">
        <div>
          <h2>{result.destination} 가는 길</h2>
          <p>
            {result.origin} → {result.destination} · 내 이동 설정을 반영했어요.
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {isRec ? (
          <div className="today-best">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            오늘은 이 길이 편해요
          </div>
        ) : (
          <div className="today-alt">다른 길이에요</div>
        )}

        <article className="route-card glass">
          {/*
            도착 시각은 길 이름 옆에 둔다.
            「예상 시간」 칸 안에 넣었더니 25분과 도착 시각이 한 덩어리로 붙어서,
            셋으로 나란한 칸 중 하나만 두 줄이 되어 균형이 무너졌다.
            약속 시간과 견주는 정보라 카드를 열자마자 보이는 자리가 낫다.
          */}
          <div className="route-card-head">
            <h3>{selected.title}</h3>
            {arriveAt && <em className="route-arrive">{arriveAt} 도착</em>}
          </div>
          <p className="route-sub">{selected.sub}</p>
          <div className="metrics">
            <div className="metric">
              <span>예상 시간</span>
              <strong>{selected.time}</strong>
            </div>
            <div className="metric">
              <span>걷는 시간</span>
              <strong>{selected.walk}</strong>
            </div>
            <div className="metric">
              <span>환승</span>
              <strong>{selected.transfer}</strong>
            </div>
          </div>
          <RouteStrip routeKey={selected.key} origin={result.origin} destination={result.destination} />
        </article>

        <div className="section-label">편의시설과 이동 조건</div>
        <div className="facility-grid">
          {selected.facilities.map((f) => (
            <div key={f.label} className="facility">
              <i className={`status-icon ${f.status}`}>{f.status === 'ok' ? '✓' : f.status === 'warn' ? '!' : 'i'}</i>
              <div>
                <b>{f.label}</b>
                <span>{f.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="notice-box">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 2.5 20h19L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 9v5m0 3h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span>
            <b>확인해 주세요</b>
            <br />
            {selected.notice}
          </span>
        </div>

        {/*
          똑버스·콜택시 안내만 남았다는 것은 걷거나 타고 갈 길을 하나도 찾지 못했다는 뜻이다.
          카드 한 장만 덩그러니 두면 "왜 이것뿐이지" 하고 끝난다 — 이유와 할 일을 적어준다.
          BE·AI 는 왜 걸렀는지 알고 있다(filteredResults). 우리가 안 쓸 이유가 없다.
        */}
        {result.options.length === 1 && selected.guide !== 'navigate' && (
          <div className="result-note">
            지금 조건으로는 <b>걸어가거나 타고 갈 길</b>을 찾지 못했어요. 대신 이 방법을 안내해 드려요.
            {result.filteredReasons?.map((code) => (
              <span key={code}>{FILTER_TEXT[code]}</span>
            ))}
          </div>
        )}

        <div className="result-actions">
          <button className="btn primary" onClick={() => onGuide(selected.guide, result, selected)}>
            {selected.guide === 'drt'
              ? '똑버스 이용 방법 보기'
              : selected.guide === 'calltaxi'
                ? '콜택시 부르는 방법 보기'
                : '이 길로 안내받기'}
          </button>
          {/*
            길이 하나뿐이면 「다른 길도 볼게요」를 내지 않는다.
            순환할 곳이 없어 눌러도 아무 일이 없는데, 그런 버튼은 어르신에게
            "내가 잘못 눌렀나" 하는 불안을 준다(2026-08-16 확인).
          */}
          {result.options.length > 1 && (
            <button className="text-btn" onClick={onCompare}>
              다른 길도 볼게요
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 후보가 제외된 이유를 사람 말로.
 *
 * "길을 못 찾았어요"만 보여주면 사용자가 할 수 있는 것이 없다. 무엇 때문에 빠졌는지와
 * **무엇을 바꾸면 되는지**를 함께 적는다. 설정을 고치면 되는 것은 고칠 수 있다고 말해준다.
 */
const FILTER_TEXT: Record<RouteFilterCode, string> = {
  WALK_TIME_EXCEEDED:
    '걷는 시간이 설정하신 시간을 넘어서 제외했어요. 내 정보에서 걷는 시간을 늘리면 이 길도 보실 수 있어요.',
  STAIR_DIFFICULT_WITH_EXTERNAL_STAIR:
    '계단이 있는 길이라 제외했어요. 계단 이용을 「조금 어려움」으로 바꾸면 함께 보여드려요.',
  WHEELCHAIR_WITH_EXTERNAL_STAIR:
    '휠체어로 지나기 어려운 계단이 있어 제외했어요. 콜택시 안내를 함께 보여드려요.',
}

/**
 * "약 25분" · "1시간 10분" 같은 문구에서 분을 뽑는다.
 *
 * 길끼리 비교하려면 숫자가 있어야 하는데, 화면에 쓰는 값은 사람이 읽는 문구다.
 * 못 읽어내면 null 을 주고, 그때는 「가장 빠름」 같은 표시를 아예 안 붙인다 —
 * 잘못 읽은 값으로 "이게 제일 빨라요"라고 하면 그대로 믿고 따라가신다.
 */
function minutesOf(text: string): number | null {
  const hour = text.match(/(\d+)\s*시간/)
  const min = text.match(/(\d+)\s*분/)
  if (!hour && !min) return null
  return (hour ? Number(hour[1]) * 60 : 0) + (min ? Number(min[1]) : 0)
}

/**
 * 길 고르기 시트 — 「다른 길도 볼게요」를 누르면 열린다.
 *
 * 왜 만들었나 — 예전에는 이 버튼이 카드 안의 값만 조용히 바꿨다. 화면은 그대로인데
 * 숫자만 슬쩍 달라지니 **바뀐 줄도 모르고, 어느 쪽이 나은지 견줄 수도 없었다**
 * (2026-08-16). 비교는 나란히 놓고 보는 것이지, 번갈아 보며 외우는 것이 아니다.
 *
 * 그래서 한 화면에 다 펼친다. 어르신이 실제로 견주는 것은 세 가지다 —
 * 얼마나 걸리나, 얼마나 걷나, 갈아타나. 그것만 크게 적고 나머지는 뺐다.
 */
/**
 * 시트에 적을 계단 한 마디.
 *
 * 카드의 계단 칸을 그대로 쓰면 안 된다 — 계단 있는 길을 고르신 뒤에는 그 값이
 * 「계단 1곳 · 12칸을 오르내려야 해요」 같은 문장이라(api/stairChoice), 나란히
 * 견주는 칸에 넣으면 줄이 밀린다. 개수만 뽑아 짧게 적는다.
 *
 * 「확인 불가」를 숨기지 않는 것이 중요하다. 계단이 어렵다고 답하신 분에게
 * 「모른다」와 「없다」는 전혀 다른 말이다 — 없는 것처럼 보이면 그 길을 고르신다.
 */
function stairNote(option: RouteOption): { text: string; status: RouteFacility['status'] } | null {
  const row = option.facilities.find((f) => f.label === '계단')
  if (!row) return null
  if (row.status === 'ok') return { text: '없음', status: 'ok' }
  if (row.status === 'info') return { text: '확인 불가', status: 'info' }
  const count = row.value.match(/(\d+)\s*곳/)
  return { text: count ? `${count[1]}곳` : '있음', status: 'warn' }
}

function RouteCompareSheet({
  open,
  result,
  options,
  selectedKey,
  departureDateTime,
  onPick,
  onClose,
}: {
  open: boolean
  result: RouteResult
  /**
   * 계단 선택까지 반영된 목록.
   *
   * 예전에는 시트가 result.options(원본)를 봤다. 그래서 「계단 없는 길」을 고른 뒤
   * 시트를 열면 **카드는 41분인데 시트는 28분**이었다 — 같은 길이 두 값을 갖는다.
   */
  options: RouteOption[]
  selectedKey: RouteKey
  departureDateTime: string | null
  onPick: (key: RouteKey) => void
  onClose: () => void
}) {
  // 「가장 빠름」·「가장 적게 걸음」은 읽어낸 값이 다 있을 때만 붙인다
  const times = options.map((o) => minutesOf(o.time))
  const walks = options.map((o) => minutesOf(o.walk))
  const best = (list: (number | null)[]) => {
    const usable = list.filter((n): n is number => n != null)
    // 값이 하나뿐이거나 전부 같으면 "가장"이라고 할 것이 없다
    if (usable.length < 2 || Math.min(...usable) === Math.max(...usable)) return null
    return Math.min(...usable)
  }
  const fastest = best(times)
  const shortestWalk = best(walks)
  const stair = options.map(stairNote)

  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <div
        className={`sheet${open ? ' show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="길 고르기"
      >
        <div className="sheet-grip" />
        <h3>어느 길로 가실래요?</h3>
        <p>{result.destination}까지 갈 수 있는 길이에요.</p>

        <div className="route-picks">
          {options.map((o, i) => {
            const on = o.key === selectedKey
            return (
              <button
                key={o.key}
                className={`route-pick${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onPick(o.key)}
              >
                {/*
                  이름표와 배지를 한 줄에 모은다. 배지를 따로 한 줄 내리면 카드가
                  그만큼 길어지는데, 길이 서너 개면 시트가 화면을 다 잡아먹는다.
                  무엇이 나은지는 값을 못 읽어냈으면 붙이지 않는다.
                */}
                <div className="head">
                  <b>{o.title}</b>
                  {o.key === result.recommendedKey && <em className="rec">오늘 추천</em>}
                  {on && <em className="now">보는 중</em>}
                  {times[i] != null && times[i] === fastest && <em className="fast">가장 빠름</em>}
                  {walks[i] != null && walks[i] === shortestWalk && (
                    <em className="walkless">가장 적게 걸음</em>
                  )}
                </div>
                <div className="big">
                  {o.time}
                  {/* 길마다 도착 시각이 다르다 — 견주는 화면이니 여기가 오히려 더 필요하다 */}
                  {times[i] != null && arrivalLabel(departureDateTime, times[i]) && (
                    <em className="when">{arrivalLabel(departureDateTime, times[i])} 도착</em>
                  )}
                </div>
                <div className="facts">
                  <span>
                    걷기 <b>{o.walk}</b>
                  </span>
                  <span>
                    환승 <b>{o.transfer}</b>
                  </span>
                  {/* 계단이 어렵다고 답하신 분이 보는 화면이다. 여기 없으면 길을 고를 근거가 빠진다 */}
                  {stair[i] && (
                    <span className={`stair ${stair[i]!.status}`}>
                      계단 <b>{stair[i]!.text}</b>
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="sheet-actions">
          <button className="btn neutral" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * 기다리는 동안 문구를 바꾼다 — **흘러간 시간**만 기준으로 삼는다.
 *
 * 가짜 진행률을 그리지 않는 이유: 서버가 지금 어디까지 왔는지 우리는 모른다.
 * 막대가 80% 에서 멈춰 있으면 "다 됐는데 왜 안 되지"가 되어 오히려 불안해진다.
 * 우리가 확실히 아는 것은 몇 초가 지났는가 하나뿐이라, 그것에만 근거해서 말한다.
 */
const WAIT_NOTES: { after: number; text: string }[] = [
  { after: 0, text: '보통 10초쯤 걸려요.' },
  { after: 10, text: '거의 다 됐어요. 조금만 더 기다려 주세요.' },
  { after: 25, text: '길이 복잡해서 조금 더 걸리고 있어요. 그대로 두시면 돼요.' },
]

/**
 * 길을 찾는 동안 보여주는 화면.
 *
 * 왜 만들었나 — 경로 조회는 TMAP 길찾기와 AI 스코어링을 거쳐서 10~30초씩 걸린다.
 * 그동안 화면에는 「편한 길을 찾고 있어요…」 글자 한 줄만 있었다(2026-08-16 스크린샷 09).
 * 어르신에게 **빈 화면은 고장과 구별되지 않는다.** 실제로 이 단계에서 뒤로 가거나
 * 앱을 껐다 켜면, 방금까지 한 대화가 통째로 날아간다.
 *
 * 그래서 세 가지를 보여준다.
 *   1. 움직이는 것 — 멈춘 게 아니라는 신호. 글자보다 이게 먼저 읽힌다
 *   2. 어디를 찾는 중인지 — 내가 말한 그곳이 맞는지 확인시켜 준다
 *   3. 얼마나 더 기다리면 되는지 — 끝을 모르는 기다림이 사람을 손 떼게 만든다
 */
function RouteSearching({ destination }: { destination: string }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // 지난 시간에 해당하는 문구 중 가장 마지막 것
  const note = WAIT_NOTES.reduce((acc, n) => (seconds >= n.after ? n.text : acc), WAIT_NOTES[0].text)

  return (
    // role/aria-live — 화면을 못 보시는 분에게도 상황이 읽힌다
    <div className="route-empty route-loading glass" role="status" aria-live="polite">
      <div className="route-loading-art" aria-hidden="true">
        <span className="ring" />
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M6 20c0-2.5 1.6-3.6 4-3.9 2.4-.3 4-1.4 4-3.9s-1.6-3.6-4-3.9"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <circle cx="6" cy="20" r="2.1" fill="currentColor" />
          <path
            d="M18 3.5c1.9 0 3.5 1.6 3.5 3.6 0 2.6-3.5 5.9-3.5 5.9s-3.5-3.3-3.5-5.9c0-2 1.6-3.6 3.5-3.6Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2>
        {destination}까지
        <br />
        편한 길을 찾고 있어요
      </h2>
      <p>계단과 경사, 갈아타는 횟수까지 하나씩 확인하고 있어요.</p>
      <div className="route-empty-hint">{note}</div>
    </div>
  )
}

export function ResultsScreen({
  destination,
  departureDateTime,
  destinationCoords,
  origin,
  stairChoice,
  onStairChoice,
  onNeedStairChoice,
  onGoHome,
  onRestartChat,
  onSos,
  onGuide,
}: {
  destination: string | null
  /** 대화에서 확정한 출발지. 없으면 현재 위치에서 출발하는 것으로 본다. */
  origin?: ChatOutcome['origin']
  /** 대화에서 고른 출발 시각('YYYY-MM-DDTHH:mm:ss'). 없으면 지금 기준으로 조회한다. */
  departureDateTime: string | null
  /** 대화에서 사용자가 확인한 목적지 좌표. 있으면 이름으로 다시 검색하지 않는다. */
  destinationCoords: LatLng | null
  /** 사용자가 이미 고른 계단 선택 (아직 안 골랐으면 null) */
  stairChoice: 'with' | 'none' | null
  /** 시트에서 계단 갈래를 바꿨을 때 — 고른 값을 App 이 다시 들고 있어야 한다 */
  onStairChoice?: (pick: 'with' | 'none') => void
  /** 계단 선택을 물어야 할 때 — App 이 계단 선택 화면으로 넘긴다 */
  onNeedStairChoice: (comparison: NonNullable<RouteResult['stairComparison']>) => void
  onGoHome: () => void
  /** 목적지를 다시 말하러 대화 화면으로 */
  onRestartChat: () => void
  onSos: () => void
  onGuide: (guide: RouteOption['guide'], result: RouteResult, option: RouteOption) => void
}) {
  const [result, setResult] = useState<RouteResult | null>(null)
  const [selectedKey, setSelectedKey] = useState<RouteKey | null>(null)
  const [error, setError] = useState<RouteErrorKind | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!destination) {
      setResult(null)
      setSelectedKey(null)
      setError(null)
      return
    }
    let alive = true
    setError(null)
    setResult(null)
    getRoutes({
      destination,
      destinationCoords: destinationCoords ?? undefined,
      departureDateTime: departureDateTime ?? undefined,
      origin: origin ?? null,
    }).then(
      (r) => {
        if (!alive) return
        // 후보가 하나도 없으면 오류가 아니라 '갈 수 있는 길 없음'
        if (r.options.length === 0) {
          setError('none')
          return
        }
        setResult(r)
        setSelectedKey(r.recommendedKey)
      },
      (e: unknown) => {
        if (!alive) return
        setError(toErrorKind(e))
      },
    )
    return () => {
      alive = false
    }
    // 출발 시각이 바뀌면 다시 조회한다 — 시간대에 따라 대중교통 후보가 달라진다
  }, [destination, departureDateTime, destinationCoords, origin, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // 글씨를 못 읽는 분도 상황을 알 수 있게 오류 제목은 음성으로도 안내한다
  useEffect(() => {
    if (!error) return
    speak(ROUTE_ERRORS[error].title, { auto: true })
  }, [error])

  /*
   * 계단을 고르셨으면 그 길을 펼쳐서 보여준다.
   *
   * 예전에는 고르고 나서도 추천 카드가 그대로 떠 있었다 — 폭염이거나 환승이 많으면
   * 그게 똑버스다. 「계단 없는 길」을 고른 어르신에게 똑버스 카드를 보여주면
   * 고른 것이 어디로 갔는지 알 수 없다. 물어봤으면 답을 반영해야 한다.
   *
   * 한 번만 맞춰준다. 그 뒤 「다른 길도 볼게요」로 옮기는 것은 그대로 둔다.
   */
  useEffect(() => {
    if (!stairChoice || !result?.stairComparison) return
    /*
     * 고르신 쪽 **카드 자체**를 고른다.
     *
     * 예전에는 '가장 편한 길' 카드를 고른 쪽 값으로 덮어썼다. 그러면 원래 그 카드가
     * 계단 없는 길이었을 때 그 길이 화면에서 통째로 사라진다 — 남은 카드도 계단
     * 있는 길이라, 「다른 길도 볼게요」에 **같은 길이 두 개** 뜨는 것처럼 보였다
     * (2026-08-16 스크린샷). 마음을 바꾸고 싶어도 바꿀 대상이 없었다.
     *
     * BE 가 두 갈래를 각각 온전한 후보로 준다. 덮어쓸 이유가 없다.
     */
    const match = result.options.find((o) => o.stairOption === stairChoice)
    setSelectedKey(match ? match.key : 'comfort')
  }, [stairChoice, result])

  /*
   * 계단이 **'조금 어려움'인 분에게만** 두 경로 비교를 먼저 보여드린다(7/31 회의).
   *
   *   이용 어려움·휠체어 — AI 하드필터가 계단 있는 길을 빼서 비교할 대상이 없다
   *   조금 어려움        — 두 길을 나란히 놓고 직접 고르게 한다
   *   이용 가능          — **우회할 이유가 없다.** 물어보면 없던 걱정을 만든다
   *
   * BE 는 계단이 실제로 있고 계단 없는 대안이 진짜로 있으면 두 벌을 준다. 다만
   * **사용자 설정은 보지 않는다.** 그래서 「이용 가능」이라고 답한 분에게도 두 벌이
   * 와서, 우리가 거르지 않으면 「계단을 피할까요?」를 묻게 된다(2026-08-16 확인).
   *
   * 설정을 못 읽으면 물어본다 — 묻는 쪽이 덜 나쁘다. 어느 쪽을 고르든 갈 수 있다.
   */
  useEffect(() => {
    if (!result?.stairComparison || stairChoice !== null) return
    let alive = true
    const comparison = result.stairComparison
    getMobilityProfile()
      .then((p) => {
        if (alive && p.stairLevel === 'SLIGHTLY_DIFFICULT') onNeedStairChoice(comparison)
      })
      .catch(() => {
        if (alive) onNeedStairChoice(comparison)
      })
    return () => {
      alive = false
    }
  }, [result, stairChoice, onNeedStairChoice])

  // 고른 결과를 '가장 편한 길' 카드에 실제로 반영한다 (BE 실측값으로)
  const cmp = result?.stairComparison ?? null
  /*
   * 계단 갈래가 카드로 왔으면 덮어쓰지 않는다 — 고른 쪽 카드를 고르면 그만이다.
   * 카드가 안 왔을 때만(옛 응답 등) 예전처럼 값을 반영한다.
   */
  const hasStairCards = result?.options.some((o) => o.stairOption) ?? false
  const options = result
    ? result.options.map((o) =>
        !hasStairCards && o.key === 'comfort' && stairChoice && cmp
          ? applyStairChoice(o, stairChoice, cmp)
          : o,
      )
    : []

  const selected = result && selectedKey ? options.find((o) => o.key === selectedKey) ?? options[0] : null

  // pickRoute 가 최신 목록을 보게 한다 — 목록을 의존성에 넣으면 매 렌더마다 콜백이 새로 만들어진다
  const optionsRef = useRef(options)
  optionsRef.current = options

  /*
   * 길 고르기 시트.
   *
   * 예전에는 「다른 길도 볼게요」가 카드 값만 조용히 바꿨다(순환). 화면은 그대로인데
   * 숫자만 슬쩍 달라지니 바뀐 줄도 모르고, 어느 쪽이 나은지 견줄 수도 없었다.
   * 이제 시트를 열어 나란히 놓고 고른다.
   */
  const [compareOpen, setCompareOpen] = useState(false)

  const pickRoute = useCallback(
    (key: RouteKey) => {
      /*
       * 시트에서 계단 갈래를 바꾸면 그 선택도 함께 바꾼다.
       * 안 그러면 「계단 없는 길」을 골랐다고 저장해두고 화면은 계단 있는 길을
       * 보여주게 된다 — 되살아난 여정에서 어긋난다(state/journey).
       */
      const picked = optionsRef.current.find((o) => o.key === key)
      if (picked?.stairOption && picked.stairOption !== stairChoice) {
        onStairChoice?.(picked.stairOption)
      }
      setSelectedKey(key)
      setCompareOpen(false)
    },
    [stairChoice, onStairChoice],
  )

  return (
    <section className="screen">
      <TopBar title="가는 길" onBack={onGoHome} backLabel="홈으로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        {!destination && (
          <div className="route-empty glass">
            <div className="route-empty-art">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9 4v14m6-11.5V20.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>아직 추천할 경로가 없어요</h2>
            <p>
              어디로 가실지 먼저 알려주세요.
              <br />
              말씀만 하시면 편한 길을 찾아드려요.
            </p>
            <div className="route-empty-actions">
              <button className="btn primary" onClick={onGoHome}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="8.5" y="2.5" width="7" height="11.5" rx="3.5" fill="currentColor" />
                  <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                목적지 말하기
              </button>
              <button className="btn secondary" onClick={onRestartChat}>
                대화로 길찾기
              </button>
            </div>
            <div className="route-empty-hint">목적지만 정하면 편한 길을 바로 찾아드려요.</div>
          </div>
        )}

        {destination && error && (
          <div className="route-empty glass">
            <div className="route-empty-art error">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3 2.5 20h19L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M12 10v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h2>{ROUTE_ERRORS[error].title}</h2>
            <p>{ROUTE_ERRORS[error].text}</p>
            <div className="route-empty-actions">
              <button className="btn primary" onClick={retry}>
                다시 시도하기
              </button>
              <button className="btn secondary" onClick={onRestartChat}>
                목적지 다시 말하기
              </button>
              <a className="btn neutral" href="tel:031-228-2114">
                전화로 도움 받기
              </a>
            </div>
            <div className="route-empty-hint">{ROUTE_ERRORS[error].hint}</div>
          </div>
        )}

        {destination && !error && !selected && <RouteSearching destination={destination} />}

        {destination && !error && result && selected && (
          <RouteView
            result={result}
            selected={selected}
            departureDateTime={departureDateTime}
            onCompare={() => setCompareOpen(true)}
            onGuide={onGuide}
          />
        )}
      </div>

      {result && selected && (
        <RouteCompareSheet
          open={compareOpen}
          result={result}
          options={options}
          selectedKey={selected.key}
          departureDateTime={departureDateTime}
          onPick={pickRoute}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </section>
  )
}
