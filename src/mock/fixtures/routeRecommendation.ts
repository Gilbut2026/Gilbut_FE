import type { RouteRecommendationResult } from '../../types/dto'
import captured from './route-suwon-ajou.json'

/**
 * 실서버가 실제로 준 경로 응답 한 벌 — **로컬에서 API 를 안 쓰려고 떠 둔 것**이다.
 *
 * 왜 두는가
 *   TMAP 은 호출 수가 곧 비용이고, 대중교통 조회는 한도가 따로 있다. 그런데 지도·색·버튼
 *   같은 화면 작업은 같은 경로를 수십 번 다시 그려봐야 한다. 그때마다 실호출을 하면
 *   정작 시연 당일에 쓸 몫을 화면 다듬다가 태운다.
 *
 *   그래서 잘 나온 응답 하나를 여기 박아두고, 로컬에서는 이것만 본다.
 *   카카오맵은 무료 쿼터 안이라 지도는 실제로 그려진다 — **경로는 고정, 지도는 진짜**다.
 *
 * 덤으로 얻는 것
 *   이 파일은 `RouteRecommendationResult` 로 타입 검사를 받는다. 즉 **BE 실응답이
 *   우리 계약과 맞는지 컴파일 때 검증된다.** 필드가 어긋나면 여기서 빨간 줄이 뜬다.
 *
 * 언제 뜬 것인가
 *   2026-08-16, 배포본(gilbut-ten.vercel.app)에서 수원시청 → 아주대학교병원.
 *   TMAP 유료 전환 직후라 대중교통 후보가 5개 정상적으로 돌아온 응답이다.
 *   (그 전에는 transitRoutes 가 null 이라 똑버스 카드만 남았다)
 *
 * 다시 뜨는 방법
 *   1. 배포본에서 목적지를 끝까지 진행해 결과 화면까지 간다
 *   2. 개발자도구 → 네트워크 → `recommendations` → 응답(Response) 전체 복사
 *   3. route-suwon-ajou.json 을 통째로 갈아끼운다 (봉투 `{success,message,data}` 의 **data 안쪽만**)
 *
 * ⚠️ JSON 을 import 하면 "TRANSIT" 같은 문자열이 리터럴이 아니라 string 으로 넓어져서
 *    유니온 타입에 그대로는 안 들어간다. 그래서 한 번 캐스팅한다.
 *    다만 이 캐스팅은 **여기 한 줄에서 끝난다** — 이 값을 쓰는 쪽은 전부 제대로 타입을 받는다.
 */
export const REAL_ROUTE_RESULT = captured as unknown as RouteRecommendationResult | null

/** 이 응답을 뜬 구간 — 화면에 출발지·목적지 이름으로 쓴다 */
export const REAL_ROUTE_LABEL = { origin: '수원시청', destination: '아주대학교병원' }
