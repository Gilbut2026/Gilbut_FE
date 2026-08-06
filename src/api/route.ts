/**
 * 경로 API — 화면은 이 파일의 함수만 호출한다.
 *
 * ⚠️ BE 경로 컨트롤러는 **개발 전** (노션 「API 명세서」 2026-08-04) 이라 항상 Mock 이다.
 *    올라오면 api/mode.ts 의 FORCED_MOCK 에서 'route' 를 빼고 아래 주석의 경로를 붙인다.
 *
 *      POST /api/routes/recommendations          맞춤 경로 추천   ← getRoutes 가 쓸 것
 *      POST /api/routes/transit                  대중교통 경로
 *      POST /api/routes/walking                  보행 경로
 *      POST /api/routes/walking/reroute          보행 경로 재탐색
 *      POST /api/routes/walking/rest-stop-reroute 쉼터 경유 재탐색
 *      POST /api/facilities/along-route          경로 주변 쉼터 (7/31 회의: 지도 표시용)
 *
 * 🚨 응답 DTO 가 아직 확정되지 않았다. 우리 RouteResult 는 와이어프레임 기준으로 프론트가 만든 형태라,
 *    BE 응답이 나오면 types/dto.ts 의 RouteOption/RouteResult 를 그쪽에 맞춰야 한다.
 *    특히 7/31 회의 신규 항목 — 계단 회피/포함 두 후보(StairComparison), 콜택시 분기, 쉼터 좌표 — 가
 *    응답에 들어오는지 확인 필요.
 */
import type { RouteResult } from '../types/dto'
import { mockGetRoutes } from '../mock/route'

/** 목적지 기준 추천 경로(편한 길·걷기 적은 길·똑버스/콜택시) 조회 */
export function getRoutes(destination: string): Promise<RouteResult> {
  return mockGetRoutes(destination)
}
