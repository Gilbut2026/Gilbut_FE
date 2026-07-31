# AI 길벗 · 프론트엔드 (UI/UX 프로토타입)

교통약자 음성 AI 이동상담 서비스 **"AI 길벗"** 의 프론트엔드.
KT디인재 X 교통안전공단 2026 프로젝트 · React + Vite + TypeScript.

> **핵심 설계**: 지금은 **Mock 데이터**로 백엔드 없이 동작합니다.
> 백엔드(Spring Boot)가 준비되면 **`.env` 두 줄만** 바꾸면 실제 서버에 연결됩니다.

---

## 실행 방법

```bash
npm install     # 최초 1회
npm run dev     # 개발 서버 실행 → http://localhost:5173
```

빌드:

```bash
npm run build   # dist/ 에 정적 파일 생성 (배포용)
npm run preview # 빌드 결과 미리보기
```

---

## 백엔드 연결 전환 (.env)

```env
VITE_USE_MOCK=true                          # true=Mock, false=실제 백엔드
VITE_API_BASE_URL=http://localhost:8080     # 백엔드 주소
```

백엔드가 준비되면 `VITE_USE_MOCK=false` 로 바꾸고 주소만 맞추면 끝.
화면(screens) 코드는 하나도 안 바꿔도 됩니다.

---

## 폴더 구조

```
src/
├─ screens/     화면별 컴포넌트 (홈·상담·결과·공유)
├─ components/  공용 UI (AppBar·Icon·ResultCardView)
├─ api/         백엔드 연동 계층
│   ├─ client.ts       fetch 래퍼 (baseURL 한 곳)
│   └─ counseling.ts   상담 API (Mock ↔ 실서버 스위치)
├─ mock/        Mock 상담 엔진 (백엔드 대역, 나중에 삭제)
├─ types/       DTO 타입 (백엔드와 1:1 계약) ← 가장 중요
└─ styles/      디자인 토큰 + 전역 CSS
```

---

## 백엔드팀과 맞춰야 할 것 (types/dto.ts 참고)

`src/types/dto.ts` 에 백엔드 DTO를 그대로 옮겨두었습니다. 주석의 표시를 확인하세요:

- ✅ = 백엔드 초안에 이미 있는 필드 (그대로 사용)
- 🟡 = 화면에 필요해서 프론트가 **추가 요청**하는 필드 (백엔드 협의 필요)
  - `quickReplies` — 질문 화면의 답변 버튼 목록
  - `resultCard.drtInfo` — DRT/이동지원 카드의 전화번호·운행정보
  - `prefersDRT` — DRT 선호 슬롯 (확장값 여부)

---

## 결과 카드 5종 (types/dto.ts 의 `ResultType`)

| resultType | 화면 | 색 |
|---|---|---|
| `ALONE_OK` | 혼자 이동 가능 | 초록 |
| `DRT_RECOMMENDED` | DRT 문의 권장 | 청록 |
| `GUARDIAN_RECOMMENDED` | 보호자 동행 권장 | 주황 |
| `STAFF_CHECK` | 이동지원·직원 확인 권장 | 남색 |
| `NEED_CHECK` | 확인 필요 (정보 부족) | 회색 |

> 회의에서 3종으로 줄이기로 하면 `mock/counseling.ts` 의 판단 규칙만 바꾸면 됩니다.
> 디자인 참고 원본: 상위 폴더의 `AI_길벗_와이어프레임_완성본.html`
