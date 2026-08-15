import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toLocalDateTime } from '../api/time'

/**
 * 출발 날짜·시간 고르기 시트.
 *
 * 왜 필요한가 — 빠른 답변은 「지금 / 30분 뒤 / 1시간 뒤 / 2시간 뒤」뿐이라
 * **오늘 안에서만** 고를 수 있었다. 그런데 병원 예약은 다음 주 화요일일 수도 있다.
 * 입력창에 "내일 오후 3시"라고 적으면 알아듣기는 하지만(api/time parseDepartureMinutes),
 * 어르신께 타이핑을 시키는 것은 답이 아니다. 누를 수 있어야 한다.
 *
 * 왜 달력과 시간판을 직접 만들었나 — 브라우저 기본 선택기(`type="date"`·`type="time"`)는
 * **크기를 우리가 정할 수 없다.** 달력 팝업은 브라우저가 그리는 것이라 CSS 가 닿지 않고,
 * 데스크톱에서는 글자와 칸이 작아 어르신이 누르기 어렵다. 글자 크기가 1급 기능인
 * 앱에서 가장 중요한 입력만 통제 밖에 두는 것은 앞뒤가 맞지 않는다.
 *
 * 만드는 방식
 *   · 사흘 안(오늘·내일·모레)은 **한 번에** 끝난다. 실제로 대부분 여기서 끝난다.
 *   · 그 밖의 날은 달력에서 고른다. 칸을 크게 두고, 지난 날은 아예 못 누르게 한다.
 *   · 시간은 오전/오후 → 시 → 분. 지난 시각은 회색으로 막는다 —
 *     눌러놓고 거절당하는 것보다 처음부터 못 누르는 편이 낫다
 *     (백엔드가 "현재 -1분보다 과거면 거절"이다).
 *   · 고른 것은 늘 위에 말로 떠 있다 — 숫자만 보고는 잘못 고른 것을 알아채기 어렵다.
 */

const SHORTCUTS = [
  { offset: 0, label: '오늘' },
  { offset: 1, label: '내일' },
  { offset: 2, label: '모레' },
] as const

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * 고를 수 있는 시각 — 새벽 5시부터 밤 11시 30분까지 30분 간격.
 *
 * 왜 목록인가 — 처음에는 「오전/오후 → 시 12칸 → 분 6칸」이었는데, 한 시각을 정하는 데
 * 세 번을 나눠 눌러야 했고 칸에는 숫자만 있었다. 9 를 누르고 나서 그게 오전인지 오후인지
 * 다시 위를 확인해야 한다. 어르신에게는 그 왕복이 부담이다.
 * 「오전 9시 30분」이라고 통째로 적힌 줄을 한 번 누르는 편이 훨씬 쉽다.
 *
 * 30분 간격인 이유 — 10분 단위로 하면 줄이 세 배가 되는데, 그렇게까지 맞출 일이 없다.
 * 새벽 5시 이전과 자정 이후를 뺀 것도 같은 이유다. 없는 선택지는 고를 수고도 없다.
 */
const FIRST_HOUR = 5
const LAST_HOUR = 23

/** 고를 수 있는 시 — 새벽 5시부터 밤 11시까지 */
const HOURS: number[] = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)

/** 분은 10분 단위. 그보다 잘게 맞출 일이 없고, 줄만 여섯 배가 된다 */
const MINUTES = [0, 10, 20, 30, 40, 50] as const

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 오늘부터 offset 일 뒤의 'YYYY-MM-DD' */
function isoAfter(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return toISODate(d)
}

/** 'YYYY-MM-DD' → Date (그날 0시) */
function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * "오늘" · "내일" · "모레" · "8월 22일 금요일"
 * 사흘 안이면 날짜보다 이 말이 알아듣기 쉽다. 그 밖에는 요일까지 붙인다 —
 * 어르신은 "22일"보다 "금요일"로 약속을 기억하신다.
 */
function koreanDate(d: Date): string {
  const near = SHORTCUTS.find((s) => isoAfter(s.offset) === toISODate(d))
  if (near) return near.label
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일`
}

/** "오후 3시" · "오전 9시 30분" — 어르신이 읽는 방식 그대로 */
function koreanTime(hour: number, minute: number): string {
  const ampm = hour < 12 ? '오전' : '오후'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return minute === 0 ? `${ampm} ${h}시` : `${ampm} ${h}시 ${minute}분`
}

/** 지금부터 한 시간 뒤를 10분 단위로 올린 값 (목록에 있는 시각이어야 한다) */
function defaultWhen(): { hour: number; minute: number } {
  const d = new Date(Date.now() + 60 * 60_000)
  const m = Math.ceil(d.getMinutes() / 10) * 10
  const hour = m >= 60 ? d.getHours() + 1 : d.getHours()
  const minute = m >= 60 ? 0 : m
  if (hour > LAST_HOUR) return { hour: LAST_HOUR, minute: 30 }
  if (hour < FIRST_HOUR) return { hour: FIRST_HOUR, minute: 0 }
  return { hour, minute }
}

export function DepartureSheet({
  open,
  onClose,
  onPick,
  onToast,
}: {
  open: boolean
  onClose: () => void
  /** 고른 시각 — 'YYYY-MM-DDTHH:mm:ss' 와 사람이 읽을 문구 */
  onPick: (departureDateTime: string, label: string) => void
  onToast: (msg: string) => void
}) {
  /**
   * 지금 무엇을 보여줄지.
   *   main     — 날짜 칸·시간 칸을 보여주는 기본 화면
   *   calendar — 날짜 칸을 눌렀을 때 펼치는 달력
   *   clock    — 시간 칸을 눌렀을 때 펼치는 시간판
   *
   * 탭으로 나란히 두지 않고 눌러서 들어가게 한 이유 — 대부분은 「오늘·내일·모레」와
   * 기본 시각으로 끝난다. 그런 분에게까지 달력을 펼쳐 보이면 고를 것이 갑자기 서른 개가 된다.
   * 필요한 사람만 열어보게 한다.
   */
  const [view, setView] = useState<'main' | 'calendar' | 'clock'>('main')
  const [date, setDate] = useState(() => isoAfter(0))
  const [hour, setHour] = useState(() => defaultWhen().hour)
  const [minute, setMinute] = useState(() => defaultWhen().minute)
  // 달력이 보여주는 달 — 고른 날짜와는 별개다(다음 달을 넘겨보다 그만둘 수 있다)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  // 열 때마다 처음 상태로. 지난번에 고른 값이 남아 있으면 "내일"이 선택된 줄 모르고
  // 확인을 눌러 엉뚱한 날로 길을 찾게 된다.
  useEffect(() => {
    if (!open) return
    const when = defaultWhen()
    const d = new Date()
    setView('main')
    setDate(isoAfter(0))
    setHour(when.hour)
    setMinute(when.minute)
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [open])

  const picked = fromISODate(date)
  picked.setHours(hour, minute, 0, 0)

  /*
   * 시각 목록을 열면 지금 고른 줄이 가운데 보이게 굴린다.
   * 목록이 열아홉 줄이라 맨 위(새벽 5시)에서 시작하면 오후를 고르려는 분은
   * 한참을 내려야 하고, 이미 고른 것이 어디 있는지도 안 보인다.
   *
   * ⚠️ scrollIntoView 를 쓰면 안 된다. **스크롤되는 조상을 전부 굴려서 창까지 밀어버린다.**
   *    실제로 시간 고르기를 열면 앱 전체가 위로 밀렸고, 창 스크롤이 남아 그 뒤로도
   *    계속 밀린 채로 보였다(2026-08-16). 우리가 굴리려는 것은 이 목록 하나뿐이므로
   *    목록의 scrollTop 만 직접 옮긴다.
   */
  const hourListRef = useRef<HTMLDivElement>(null)
  const minuteListRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (view !== 'clock') return
    for (const ref of [hourListRef, minuteListRef]) {
      const list = ref.current
      const row = list?.querySelector<HTMLElement>('[data-on="y"]')
      if (!list || !row) continue
      list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2
    }
  }, [view])

  const now = new Date()
  const todayISO = isoAfter(0)
  const isToday = date === todayISO
  const isShortcutDate = SHORTCUTS.some((s) => isoAfter(s.offset) === date)

  /** 오늘이면 이미 지난 시각은 못 고르게 한다 */
  const isPast = (h: number, m: number) =>
    isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))

  const hourDisabled = (h: number) => isToday && h < now.getHours()
  const minuteDisabled = (m: number) => isPast(hour, m)

  /**
   * 시를 고른다. 분이 과거로 남으면 고를 수 있는 첫 분으로 옮겨준다 —
   * 「오전 9시」를 눌렀는데 확정이 거절당하면 이유를 알 수 없다.
   */
  function pickHour(h: number) {
    setHour(h)
    if (isToday && h === now.getHours() && minute <= now.getMinutes()) {
      const next = MINUTES.find((m) => m > now.getMinutes())
      if (next !== undefined) setMinute(next)
      else {
        setHour(h + 1)
        setMinute(0)
      }
    }
  }

  function pickDate(iso: string) {
    setDate(iso)
    // 고르면 곧바로 원래 화면으로 돌아온다. 한 번 눌렀는데 달력이 그대로 떠 있으면
    // 골라진 것인지 아닌지 알 수 없다.
    setView('main')
  }

  function confirm() {
    if (picked.getTime() < Date.now()) {
      onToast('이미 지난 시각이에요. 다시 골라주세요')
      return
    }
    onPick(toLocalDateTime(picked), `${koreanDate(picked)} ${koreanTime(hour, minute)}`)
    onClose()
  }

  // ── 달력 한 달치 ────────────────────────────────
  const firstWeekday = month.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const canGoPrev = toISODate(month) > toISODate(new Date(now.getFullYear(), now.getMonth(), 1))

  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <div
        className={`sheet depart-sheet${open ? ' show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="출발 날짜와 시간 고르기"
      >
        <div className="sheet-grip" />
        <h3>
          {view === 'calendar' ? '어느 날 가세요?' : view === 'clock' ? '몇 시에 나서세요?' : '언제 출발하실까요?'}
        </h3>

        {/* 고른 것을 늘 말로 보여준다 — 숫자만 보고는 잘못 고른 것을 알아채기 어렵다 */}
        <p className="depart-preview">
          <b>
            {koreanDate(picked)} {koreanTime(hour, minute)}
          </b>
          에 출발
        </p>

        {view === 'main' && (
          <div className="depart-body">
            <span className="label">날짜</span>
            {/* 사흘 안은 한 번에 — 실제로 대부분 여기서 끝난다 */}
            <div className="depart-days">
              {SHORTCUTS.map((s) => {
                const iso = isoAfter(s.offset)
                return (
                  <button
                    key={s.offset}
                    className={`depart-day${date === iso ? ' on' : ''}`}
                    aria-pressed={date === iso}
                    onClick={() => setDate(iso)}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            {/*
              그 밖의 날은 달력에서 — 다음 주 병원 예약 같은 것이 실제로 있다.
              위 버튼으로 고른 날이면 칸에 「달력에서 고르기」라고 적는다. 「오늘」이라고
              적어두면 바로 버튼과 같은 말이 두 번 나오고, 눌렀을 때 무엇이 열리는지도
              알 수 없다. 달력에서 직접 고른 날이면 그 날짜를 보여준다.
            */}
            <button className="depart-field" onClick={() => setView('calendar')}>
              <span className="ico" aria-hidden="true">📅</span>
              <b>{isShortcutDate ? '달력에서 고르기' : koreanDate(picked)}</b>
              <span className="chev" aria-hidden="true">›</span>
            </button>

            <span className="label">시간</span>
            <button className="depart-field" onClick={() => setView('clock')}>
              <span className="ico" aria-hidden="true">🕐</span>
              <b>{koreanTime(hour, minute)}</b>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          </div>
        )}

        {view === 'calendar' && (
          <div className="depart-body">
            <div className="cal-head">
              <button
                className="cal-nav"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                disabled={!canGoPrev}
                aria-label="이전 달"
              >
                ‹
              </button>
              <b>
                {month.getFullYear()}년 {month.getMonth() + 1}월
              </b>
              <button
                className="cal-nav"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                aria-label="다음 달"
              >
                ›
              </button>
            </div>

            <div className="cal-grid">
              {WEEKDAY.map((w) => (
                <span key={w} className={`cal-wd${w === '일' ? ' sun' : w === '토' ? ' sat' : ''}`}>
                  {w}
                </span>
              ))}
              {Array.from({ length: firstWeekday }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const iso = `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(day)}`
                return (
                  <button
                    key={iso}
                    className={`cal-day${iso === date ? ' on' : ''}${iso === todayISO ? ' today' : ''}`}
                    disabled={iso < todayISO}
                    aria-pressed={iso === date}
                    onClick={() => pickDate(iso)}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {view === 'clock' && (
          <div className="depart-body">
            {/* 시와 분을 나눠 고른다. 한 목록에 다 넣으면 줄이 백 개를 넘는다 */}
            <div className="time-cols">
              <div className="time-col">
                <span className="label">시</span>
                <div className="time-list" ref={hourListRef}>
                  {HOURS.map((h) => {
                    const on = h === hour
                    return (
                      <button
                        key={h}
                        className={`time-row${on ? ' on' : ''}`}
                        disabled={hourDisabled(h)}
                        aria-pressed={on}
                        data-on={on ? 'y' : undefined}
                        onClick={() => pickHour(h)}
                      >
                        {h < 12 ? '오전' : '오후'} {h % 12 === 0 ? 12 : h % 12}시
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="time-col">
                <span className="label">분</span>
                <div className="time-list" ref={minuteListRef}>
                  {MINUTES.map((m) => {
                    const on = m === minute
                    return (
                      <button
                        key={m}
                        className={`time-row${on ? ' on' : ''}`}
                        disabled={minuteDisabled(m)}
                        aria-pressed={on}
                        data-on={on ? 'y' : undefined}
                        onClick={() => setMinute(m)}
                      >
                        {m}분
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 달력·시간판에서는 「다 골랐어요」로 돌아온다. 확정은 기본 화면에서만 —
            어디를 눌러야 끝나는지가 한 곳에만 있어야 헷갈리지 않는다. */}
        <div className="sheet-actions">
          {view === 'main' ? (
            <>
              <button className="btn" onClick={confirm}>
                이 시각으로 정할게요
              </button>
              <button className="btn neutral" onClick={onClose}>
                그만두기
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setView('main')}>
              다 골랐어요
            </button>
          )}
        </div>
      </div>
    </>
  )
}
