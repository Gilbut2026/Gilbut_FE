import { useEffect, useState } from 'react'
import { startMicLevel } from '../state/micLevel'

/**
 * 듣는 중에 흔들리는 막대 — **실제로 들어오는 목소리 크기**를 따라간다.
 *
 * 예전에는 정해진 대로만 흔들렸다. 말을 해도 가만히 있어도 똑같아서, 어르신이
 * 「내 말이 들어가고 있나」를 확인할 방법이 없었다. 소리를 내면 막대가 커지는
 * 것만으로도 「지금 듣고 있구나」가 전해진다.
 *
 * 세기를 못 읽으면(마이크를 하나 더 못 열었거나 기기가 안 받아주면) 원래 애니메이션
 * 그대로 움직인다 — 인라인 높이를 안 주면 CSS 가 알아서 한다(global.css .listening-wave).
 *
 * 홈 화면과 대화 화면이 같은 것을 쓴다. 두 군데에 각자 두면 한쪽만 고쳐진다.
 */

/**
 * 막대별 크기 배수 — 가운데가 가장 크게. 다섯 개가 같은 높이면 파형이 아니라 담벼락이다.
 */
const BAR_SCALE = [0.42, 0.72, 1, 0.72, 0.42]

/** 아무 소리가 없어도 이만큼은 남긴다. 0 이면 막대가 사라져 고장처럼 보인다 */
const MIN_PX = 7
/** 가장 클 때의 높이(px). .listening-wave 의 높이(46px) 안에 들어와야 한다 */
const MAX_PX = 44

export function ListeningWave({ active }: { active: boolean }) {
  /** 지금 소리 세기 0~1. null 이면 못 읽는 것이라 CSS 애니메이션에 맡긴다 */
  const [level, setLevel] = useState<number | null>(null)

  useEffect(() => {
    if (!active) {
      setLevel(null)
      return
    }
    return startMicLevel(setLevel)
  }, [active])

  return (
    <div className="listening-wave" aria-hidden="true">
      {BAR_SCALE.map((scale, i) => (
        <i
          key={i}
          style={
            level == null
              ? undefined
              : {
                  height: `${Math.round(MIN_PX + (MAX_PX - MIN_PX) * level * scale)}px`,
                  animation: 'none',
                }
          }
        />
      ))}
    </div>
  )
}
