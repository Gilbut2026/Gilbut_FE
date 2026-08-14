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
 * 🚨 BE 실응답은 dto.ts §6-BE 에 이식 완료(RouteRecommendationResult, 2026-08-14 실코드 기준).
 *    우리 RouteResult(편집형 4카드)와 모양이 달라, 번역 어댑터를 미리 만들어 뒀다:
 *      mapRecommendationToRouteResult(be, {destination, origin})  ← api/mapRecommendation.ts
 *
 *    스위치 뺄 때(연결) 이 함수 본문을 아래처럼 바꾼다 (좌표 배선이 선행돼야 함):
 *      const be = await apiPost<RouteRecommendationResult>('/api/routes/recommendations', {
 *        origin, destination, departureDateTime,           // ← 좌표(searchPlaces)·geolocation 로 채움
 *      })
 *      return mapRecommendationToRouteResult(be, { destination: destName, origin: originName })
 *    (지금은 좌표 흐름·경사 NOT_REQUESTED 이슈가 남아 mock 유지 — FORCED_MOCK 에 'route' 있음.)
 */
import type { RouteResult } from '../types/dto'
import { mockGetRoutes } from '../mock/route'

/** 목적지 기준 추천 경로(편한 길·걷기 적은 길·똑버스/콜택시) 조회 */
export function getRoutes(destination: string): Promise<RouteResult> {
  return mockGetRoutes(destination)
}
