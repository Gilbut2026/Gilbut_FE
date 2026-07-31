/**
 * Mock 경로 추천 — 6차 와이어프레임 routeData 를 그대로 옮김.
 * BE 경로추천 엔드포인트는 아직 미구현(🟡)이라 당분간 이 Mock 만 사용한다.
 * 시설 데이터는 팀 확정 기준: 계단·육교·지하보도·횡단보도·쉼터 = 확인 가능,
 * 엘리베이터·경사 = 제외.
 */
import type { RouteKey, RouteOption, RouteResult } from '../types/dto'
import { delay } from './_shared'
import { mockGetMobilityProfile } from './user'

const OPTIONS: RouteOption[] = [
  {
    key: 'comfort',
    title: '가장 편한 길',
    sub: '계단과 육교를 피해 걷는 부담을 줄인 경로',
    time: '48분',
    walk: '11분',
    transfer: '1회',
    facilities: [
      { status: 'ok', label: '계단', value: '없음 확인' },
      { status: 'ok', label: '육교', value: '없음 확인' },
      { status: 'ok', label: '지하보도', value: '없음 확인' },
      { status: 'ok', label: '횡단보도', value: '2곳 확인' },
      { status: 'ok', label: '환승', value: '1회' },
      { status: 'ok', label: '쉼터', value: '가는 길에 있음' },
    ],
    notice: '계단·육교·지하보도·횡단보도는 확인된 정보예요. 현장 상황은 조금 다를 수 있어요.',
    guide: 'navigate',
  },
  {
    key: 'short',
    title: '걷기 적은 길',
    sub: '걷는 시간은 줄이고 대중교통 환승을 늘린 경로',
    time: '55분',
    walk: '6분',
    transfer: '2회',
    facilities: [
      { status: 'ok', label: '보행거리', value: '420m' },
      { status: 'ok', label: '횡단보도', value: '1곳 확인' },
      { status: 'info', label: '환승', value: '2회 필요' },
      { status: 'warn', label: '계단', value: '2곳 있음' },
      { status: 'warn', label: '지하보도', value: '1곳 있음' },
    ],
    notice: '계단 2곳과 지하보도 1곳이 포함돼 있어요. 지하보도는 계단을 함께 이용해야 할 수 있어요.',
    guide: 'navigate',
  },
  {
    key: 'drt',
    title: '똑버스 이용 추천',
    sub: '보행 부담을 줄이고 예약 차량으로 이동하는 방법',
    time: '약 38분',
    walk: '4분',
    transfer: '없음',
    facilities: [
      { status: 'ok', label: '운행 구역', value: '포함 확인' },
      { status: 'info', label: '대기시간', value: '기관 확인' },
      { status: 'ok', label: '보조기구', value: '요청 가능' },
      { status: 'warn', label: '배차', value: '예약 후 확정' },
    ],
    notice: '실제 배차 가능 여부와 대기시간은 운영기관에서 최종 확인해야 해요.',
    guide: 'drt',
  },
]

/** 미니맵 경로 곡선 (viewBox 300×120) */
export const MINI_PATHS: Record<RouteKey, string> = {
  comfort: 'M18 94 C58 86 72 60 108 56 C150 51 168 40 210 42 C250 44 268 40 284 34',
  short: 'M18 94 C46 80 58 56 94 60 C120 63 128 42 150 40 C186 36 210 56 246 44 C266 39 276 36 284 34',
  drt: 'M18 94 C70 90 122 88 168 76 C214 64 250 48 284 34',
}

export async function mockGetRoutes(destination: string): Promise<RouteResult> {
  const profile = await mockGetMobilityProfile()
  // 보행 범위가 짧으면 똑버스를 오늘의 추천으로 (와이어프레임 recommendedRoute 규칙 축약)
  const recommendedKey: RouteKey =
    profile.walkingDuration === 'WITHIN_10_MINUTES' ? 'drt' : 'comfort'
  return delay({ destination, origin: '현재 위치', options: OPTIONS, recommendedKey })
}
