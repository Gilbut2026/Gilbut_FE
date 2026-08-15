import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * 화면별 스크롤 위치 기억.
 *
 * 이 앱은 라우터 없이 App 의 `useState<Screen>` 하나로 화면을 갈아끼운다. 그래서 다른 화면에
 * 다녀오면 원래 화면이 통째로 다시 마운트되고 스크롤이 맨 위로 돌아간다.
 * 설정 화면 아래쪽의 '비상 연락처'를 눌렀다가 뒤로 오면 다시 스크롤해서 찾아야 했다.
 * (7차 와이어프레임은 한 문서 안에서 화면을 전환해 위치가 유지됐는데, React 이식에서 빠졌다.)
 *
 * ⚠️ 화면을 떠날 때 scrollTop 을 읽어 저장하는 방식은 **동작하지 않는다.**
 *    React 는 DOM 노드를 먼저 지우고 그 뒤에 정리 함수를 부르기 때문에, 그 시점의 요소는
 *    이미 문서에서 떨어져 나가 scrollTop 이 항상 0 이다. 처음에 그렇게 만들었다가
 *    "매번 0 이 저장돼 늘 맨 위로 돌아가는" 상태였다.
 *    그래서 **스크롤할 때마다 기억**하는 방식으로 바꿨다. 읽는 시점에 의존하지 않는다.
 *
 * 위치는 모듈 수준 Map 에 담는다. 새로고침하면 사라지는데 그게 맞다 —
 * 앱을 새로 연 사람은 맨 위에서 시작하는 편이 자연스럽다.
 */
const positions = new Map<string, number>()

/**
 * 스크롤 컨테이너에 붙여 위치를 기억·복원한다.
 *
 * @param key 화면을 구분하는 이름. 같은 key 끼리 위치를 공유한다.
 * @param ready 목록을 아직 불러오는 중이면 false 로 두었다가, 내용이 그려진 뒤 true 로 바꾼다.
 *   내용이 없을 때 되돌리면 스크롤할 높이가 없어 0 으로 잘린다.
 * @returns 스크롤 컨테이너에 걸 ref
 */
export function useScrollMemory(key: string, ready: boolean = true) {
  const ref = useRef<HTMLDivElement>(null)
  const restored = useRef(false)

  // 스크롤할 때마다 기억한다 (passive — 스크롤 성능에 영향 없음)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const remember = () => positions.set(key, el.scrollTop)
    el.addEventListener('scroll', remember, { passive: true })
    return () => el.removeEventListener('scroll', remember)
  }, [key])

  // 내용이 준비되면 한 번만 되돌린다. 그리기 전(useEffect)에 하면 한 번 깜빡이므로 layout 단계에서.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready || restored.current) return
    restored.current = true

    const saved = positions.get(key)
    if (!saved) return

    el.scrollTop = saved
    // 아직 높이가 덜 자라 그만큼 못 내려갔으면 다음 프레임에 한 번 더 시도한다
    if (el.scrollTop < saved) {
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollTop = saved
      })
    }
  }, [key, ready])

  return ref
}

/** 흐름이 새로 시작될 때(예: 새 목적지 검색) 기억을 지운다 */
export function clearScrollMemory(key?: string): void {
  if (key) positions.delete(key)
  else positions.clear()
}
