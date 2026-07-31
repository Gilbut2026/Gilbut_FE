/**
 * 경로 API — 화면은 이 파일의 함수만 호출한다.
 * ⚠️ BE 경로추천 컨트롤러(/api/routes/recommendations)는 아직 미구현이라
 *    현재는 항상 Mock 을 사용한다. BE 준비되면 여기만 스위치를 붙이면 된다.
 */
import type { RouteResult } from '../types/dto'
import { mockGetRoutes } from '../mock/route'

/** 목적지 기준 추천 경로(편한 길·걷기 적은 길·똑버스) 조회 */
export function getRoutes(destination: string): Promise<RouteResult> {
  return mockGetRoutes(destination)
}
