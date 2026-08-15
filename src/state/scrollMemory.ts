import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * 화면별 스크롤 위치 기억.
 *
 * 이 앱은 라우터 없이 App 의 `useState<Screen>` 하나로 화면을 갈아끼운다. 그래서 다른 화면에
 * 다녀오면 원래 화면이 통째로 다시 마운트되고 스크롤이 맨 위로 돌아간다.
 * 설정 화면 아래쪽의 '비상 연락처'를 눌렀다가 뒤로 오면 다시 스크롤해서 찾아야 했다.
 * (7차 와이어프레임은 한 문서 안에서 화면을 전환해 위치가 유지됐는데, React 이식에서 빠졌다.)
 *
 * 만들면서 밟은 함정 두 가지 — 둘 다 겪고 나서 지금 모양이 됐다.
 *
 * 1. **떠날 때 scrollTop 을 읽어 저장하면 안 된다.** React 는 DOM 노드를 먼저 지우고 그 뒤에
 *    정리 함수를 부른다. 그 시점의 요소는 문서에서 떨어져 나가 scrollTop 이 항상 0 이라,
 *    매번 0 이 저장돼 늘 맨 위로 돌아갔다. → **스크롤할 때마다 기억**한다.
 *
 * 2. **내용을 다 불러온 뒤에 되돌리면 화면이 튄다.** 서버 응답을 기다리는 동안 맨 위 화면이
 *    한 번 그려지고, 응답이 온 뒤에야 아래로 순간이동하는 것이 눈에 보였다.
 *    → **마운트하자마자** 되돌리고, 내용이 아직 덜 자라 목표까지 못 갔으면 다음 프레임마다
 *      다시 시도한다. 설정처럼 대부분이 정적인 화면은 첫 시도에 바로 맞아 튐이 없다.
 *
 * 위치는 모듈 수준 Map 에 담는다. 새로고침하면 사라지는데 그게 맞다 —
 * 앱을 새로 연 사람은 맨 위에서 시작하는 편이 자연스럽다.
 */
const positions = new Map<string, number>()

/** 목표에 닿지 못했을 때 다시 시도할 최대 프레임 수 (약 0.3초) */
const MAX_RETRY_FRAMES = 20

/**
 * 스크롤 컨테이너에 붙여 위치를 기억·복원한다.
 *
 * @param key 화면을 구분하는 이름. 같은 key 끼리 위치를 공유한다.
 * @param ready 내용을 불러오는 중이면 false 로 두었다가 그려진 뒤 true 로 바꾼다.
 *   비동기로 목록이 채워지는 화면에서 "이제 높이가 생겼으니 다시 시도하라"는 신호로 쓴다.
 * @returns 스크롤 컨테이너에 걸 ref
 */
export function useScrollMemory(key: string, ready: boolean = true) {
  const ref = useRef<HTMLDivElement>(null)
  // 이번 마운트에서 되돌릴 목표. 첫 렌더에 한 번만 읽는다.
  const target = useRef<number | undefined>(undefined)
  if (target.current === undefined) target.current = positions.get(key) ?? 0
  // 목표에 닿았거나 되돌릴 것이 없으면 true. 이때부터 사용자의 스크롤을 기억한다.
  const done = useRef(false)

  const restore = useCallback(() => {
    const goal = target.current ?? 0
    if (goal <= 0) {
      done.current = true
      return
    }
    let frames = 0
    const attempt = () => {
      const el = ref.current
      if (!el || done.current) return
      el.scrollTop = goal
      // 브라우저가 내용 높이만큼으로 잘라내므로, 실제로 닿았는지로 판단한다
      if (el.scrollTop >= goal - 1) {
        done.current = true
        return
      }
      // 아직 내용이 덜 자랐다 — 다음 프레임에 다시
      if (++frames < MAX_RETRY_FRAMES) requestAnimationFrame(attempt)
    }
    attempt()
  }, [])

  // 마운트 직후(그리기 전)와, 내용이 준비됐다는 신호가 왔을 때 되돌린다.
  useLayoutEffect(restore, [restore, ready])

  /*
   * 스크롤할 때마다 기억한다 (passive — 스크롤 성능에 영향 없음).
   * 복원이 끝난 뒤부터만 기록한다. 복원 중에 기록하면, 아직 내용이 짧아 잘린 값이
   * 목표를 덮어써 되돌릴 자리를 잃는다.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const remember = () => {
      if (done.current) positions.set(key, el.scrollTop)
    }
    el.addEventListener('scroll', remember, { passive: true })
    return () => el.removeEventListener('scroll', remember)
  }, [key])

  return ref
}

/** 흐름이 새로 시작될 때(예: 새 목적지 검색) 기억을 지운다 */
export function clearScrollMemory(key?: string): void {
  if (key) positions.delete(key)
  else positions.clear()
}
