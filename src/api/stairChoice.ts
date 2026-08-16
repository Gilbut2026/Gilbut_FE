/**
 * 계단 선택을 결과 카드에 반영한다.
 *
 * 어르신이 「계단 없는 길」을 고르셨으면, 그다음 화면은 **고른 그 길**이어야 한다.
 * 고르게 해놓고 다른 길을 보여주면 고른 의미가 없다.
 *
 * 예전에는 이 일을 mock/route.ts 가 했다. 실서버로 돌 때도 Mock 상수(28분·850m·
 * '계단 1곳 12칸'·'횡단보도 2곳 확인')를 그대로 덮어썼다. 실제로 무엇을 골랐든
 * 화면에는 늘 같은 숫자가 나왔다(2026-08-16). 지어낸 숫자를 사실처럼 보여준 것이다.
 *
 * 지금은 BE 가 준 두 보행 경로(SHORTEST · AVOID_STAIRS)의 실제 값만 쓴다.
 * 모르는 것은 쓰지 않는다 — 계단 개수는 BE 접근성 신호에 있을 때만 나온다.
 */
import type { RouteFacility, RouteOption, StairComparison } from '../types/dto'

/** 분 → "28분" */
const min = (n: number): string => `${n}분`

/**
 * @param option  반영할 카드 ('가장 편한 길')
 * @param pick    사용자가 고른 것
 * @param cmp     BE 실측 비교값
 */
export function applyStairChoice(
  option: RouteOption,
  pick: 'with' | 'none',
  cmp: StairComparison,
): RouteOption {
  const chosen = pick === 'with' ? cmp.withStairs : cmp.noStairs
  const gap = cmp.noStairs.minutes - cmp.withStairs.minutes

  // 걷는 거리는 항상 실제 값. 계단 여부만 고른 쪽에 따라 달라진다.
  const facilities: RouteFacility[] = [
    pick === 'with'
      ? { status: 'warn', label: '계단', value: cmp.withStairs.stairFact }
      : { status: 'ok', label: '계단', value: '없음' },
    { status: 'ok', label: '걷는 거리', value: `${chosen.meters.toLocaleString()}m` },
  ]

  return {
    ...option,
    /*
     * 길 안내도 고른 쪽으로 바꾼다.
     *
     * 예전에는 숫자만 바꾸고 이건 그대로 뒀다. 「계단 없는 길」을 고르셨는데
     * 지도와 단계는 계단 있는 길이었다 — 계단이 어렵다고 답하신 분을 계단으로
     * 보내는 것이라 그냥 안 맞는 정도가 아니다.
     *
     * 고른 쪽 상세가 없으면 **원래 것을 쓰지 않고 비운다.** 안내 화면이
     * 「길 안내를 준비하지 못했어요」로 알린다 — 틀린 길을 안내하느니 낫다.
     */
    directions: chosen.directions,
    time: min(chosen.minutes),
    walk: min(chosen.walkMinutes),
    sub:
      pick === 'with'
        ? '계단을 지나지만 걷는 거리가 짧은 길'
        : '계단을 피해 걷는 부담을 줄인 길',
    facilities,
    notice:
      pick === 'with'
        ? cmp.withStairs.stairFact
        : gap > 0
          ? `계단이 있는 길보다 ${gap}분 더 걸어요. 중간에 쉬어가셔도 괜찮아요.`
          : '계단을 피해서 가는 길이에요.',
  }
}
