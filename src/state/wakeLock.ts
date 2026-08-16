/**
 * 길 안내 중 화면이 꺼지지 않게 잡아둔다.
 *
 * 왜 필요한가 — 길 안내는 **걸으면서 보는 화면**인데, 휴대폰은 30초쯤 손을 안 대면
 * 꺼진다. 어르신은 화면을 다시 켜고, 잠금을 풀고, 어디까지 왔는지 다시 찾아야 한다.
 * 길을 걷는 중에 세 단계를 요구하는 셈이라 실제로는 그냥 화면을 손에 든 채
 * 계속 두드리게 된다.
 *
 * 어디에만 거는가 — 길 안내 화면에서만이다. 앱 전체에 걸면 홈 화면을 켜둔 채
 * 주머니에 넣었을 때 배터리가 그냥 빠진다. 화면을 계속 봐야 하는 곳에만 건다.
 *
 * ⚠️ 브라우저가 **탭이 가려지면 잠금을 스스로 풀어버린다.** 전화를 받거나 다른 앱에
 *    다녀오면 풀린 채로 돌아온다. 그래서 `visibilitychange` 에서 다시 잡는다.
 *    (여정 자체가 날아가는 문제는 state/journey 가 따로 맡는다)
 *
 * 안 되는 기기 — iOS 16.4 미만, 그리고 http 로 열었을 때는 이 기능이 아예 없다.
 * 그때는 조용히 아무 일도 하지 않는다. 예전처럼 화면이 꺼질 뿐, 길 안내는 그대로 된다.
 */
import { useEffect } from 'react'

/** 브라우저마다 타입 정의가 있기도 없기도 해서 필요한 만큼만 직접 적는다 */
interface ScreenWakeLock {
  released: boolean
  release(): Promise<void>
}
interface WakeLockCapableNavigator {
  wakeLock?: { request(type: 'screen'): Promise<ScreenWakeLock> }
}

export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return

    const api = (navigator as Navigator & WakeLockCapableNavigator).wakeLock
    if (!api) return // 지원하지 않는 기기 — 그냥 예전처럼 동작한다

    let lock: ScreenWakeLock | null = null
    let alive = true

    const acquire = async () => {
      // 이미 잡고 있거나, 화면이 가려져 있으면 요청 자체가 거절된다
      if (!alive || document.visibilityState !== 'visible') return
      if (lock && !lock.released) return
      try {
        lock = await api.request('screen')
        // 기다리는 사이에 화면을 벗어났다면 바로 되돌린다
        if (!alive) void lock.release()
      } catch {
        // 배터리 절약 모드 등으로 거절될 수 있다. 화면이 꺼질 뿐이니 넘어간다.
      }
    }

    // 탭이 가려지면 브라우저가 잠금을 풀어버린다 — 돌아올 때 다시 잡는다
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      if (lock && !lock.released) void lock.release()
    }
  }, [active])
}
