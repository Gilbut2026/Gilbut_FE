import { useEffect, useRef } from 'react'

/**
 * 화면별 스크롤 위치 기억.
 *
 * 이 앱은 라우터 없이 App 의 `useState<Screen>` 하나로 화면을 갈아끼운다. 그래서 다른 화면에
 * 다녀오면 원래 화면이 통째로 다시 마운트되고 스크롤이 맨 위로 돌아간다.
 * 설정 화면 아래쪽의 '비상 연락처'를 눌렀다가 뒤로 오면 다시 스크롤해서 찾아야 했다.
 * (7차 와이어프레임은 한 문서 안에서 화면을 전환해 위치가 유지됐는데, React 이식에서 빠졌다.)
 *
 * 어르신 대상이라 더 불편하다 — 목록에서 자기가 보던 자리를 다시 찾는 일 자체가 부담이다.
 *
 * 위치는 모듈 수준 Map 에 담는다. 새로고침하면 사라지는데 그게 맞다 —
 * 앱을 새로 연 사람은 맨 위에서 시작하는 편이 자연스럽다.
 */
const positions = new Map<string, number>()

/**
 * 스크롤 컨테이너에 붙여 위치를 기억·복원한다.
 *
 * @param key 화면을 구분하는 이름. 같은 key 끼리 위치를 공유한다.
 * @param enabled 목록을 아직 불러오는 중이면 false 로 두었다가, 내용이 그려진 뒤 true 로 바꾼다.
 *   내용이 없을 때 복원하면 스크롤할 높이가 없어 0 으로 되돌아간다.
 * @returns 스크롤 컨테이너에 걸 ref
 */
export function useScrollMemory(key: string, enabled: boolean = true) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const saved = positions.get(key)
    if (saved) {
      // 레이아웃이 잡힌 다음 프레임에 복원한다. 같은 프레임에 넣으면 아직 높이가 0 이라 먹지 않는다.
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollTop = saved
      })
    }

    // 스크롤할 때마다 저장하면 잦으니, 화면을 떠날 때 마지막 위치만 남긴다.
    return () => {
      positions.set(key, el.scrollTop)
    }
  }, [key, enabled])

  return ref
}

/** 흐름이 새로 시작될 때(예: 새 목적지 검색) 기억을 지운다 */
export function clearScrollMemory(key?: string): void {
  if (key) positions.delete(key)
  else positions.clear()
}
