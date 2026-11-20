# 2026-11-21 IAP 상담일지↔내담자 일정 안전성 검증

**판정: 검증용 브랜치의 핵심 검사 통과 / 운영 배포 보류.** 운영 데이터·스키마 변경은 하지 않았다.

## 범위
- 통합본 PR #64와 일정표 PR #46을 함께 평가
- Supabase 프로젝트 좋은일자리-상담일정관리의 **스키마·RLS 읽기 전용 조회**
- 가상 직원·내담자 자료의 isolated PostgreSQL 17 테스트
- 브라우저 DOM 모의, 데이터 중복·동시 저장, 명시적 실제 상담일/상태변경 모의, 익명/타 계정 차단

## 검증 결과
| 시나리오 | 결과 |
|---|---|
| IAP 저장→내담자 신규 연결, 동일번호 중복방지 | mock CI 통과 |
| 직원 이메일/직원 ID·센터·RLS 검증 | mock 및 SQL RLS 시험 통과 |
| 로그아웃 진행 중 등록 방지 | mock CI 통과 |
| 실제 상담일 수동 확인/미래 날짜 차단 | 단위 검사 통과 |
| 21일 경과와 상담일 미등록 구분 | 단위 검사 통과 |
| 상담 활동 이력 중복 요청 | mock CI 통과 |
| 취업·중지·종료 명시적 확인 없이 변경 차단 | mock CI 통과 |
| SQL 신규 테이블 SELECT/INSERT만 부여 | PostgreSQL 17 격리 실행 통과 |
| 타 계정 이력 조회·등록·다른 IAP 등록번호 연결 차단 | PostgreSQL 17 격리 실행 통과 |
| 비활성 직원의 이력 열람 차단 | PostgreSQL 17 격리 실행 통과 |
| 일정 변경+append-only audit SQL 원자 commit | PostgreSQL 17 격리 실행 통과 |
| audit INSERT 거부 시 일정 변경도 rollback | PostgreSQL 17 격리 실행 통과 |
| 이력 테이블 없을 때 '상담이력 없음'으로 오진하지 않기 | 코드 가드 추가 |
| 운영 본서버 실제 직원 로그인→저장→재조회 왕복 | **미검증** |
| 운영본 전체 회귀검사 | **실패 (기존 main에서도 실패)** |

## 수정된 결함
1. 일정/상태 변경은 저장되지만 이력 INSERT 실패 시 부분 반영될 수 있는 구조 → **SECURITY INVOKER** SQL RPC를 통해 트랜잭션에서 함께 적용/롤백.
2. 신규 SQL 함수의 dollar-quoting 및 IAP 번호 정규식 구문오류 → isolated PostgreSQL CI로 탐지 후 수정.
3. 이력 조회 실패를 '기록 없음'으로 보여줄 수 있는 UI → '조회 불가'로 구분.
4. 테스트의 status-only 등록번호 전달, 중복·로그아웃 검증 및 날짜 검증 보완.

## 운영 배포 차단사항
1. `public.schedule_client_activity` 테이블과 `public.schedule_client_commit_and_audit` 함수가 **운영 서버에 아직 없음**. 본 검증 중 운영 DB 마이그레이션을 적용하지 않았음.
2. 실제 북부센터 직원 계정/Chrome에서 저장·조회·담당자 변경·인계·로그아웃을 끝까지 검증하지 못함.
3. 기존 전체 CI가 양쪽 모두 적색: 일정표 `ScheduleErrorReporting is not defined`, 상담일지 날짜필터 테스트 `expected all, actual today`. 해당 오류는 기존 main에서도 확인됨. 이들 회귀검사 문제의 원인 점검 필요.
4. 본 범위의 상담 이력은 고용24의 **공식 상담 실시/수당/참여 상태**를 자동 변경하지 않음. 21일은 법정 기준이 아닌 내부 점검 기준.
5. Supabase 기존 보안 어드바이저에서 범위 외 별도 경고 발견: 익명 호출 가능한 SECURITY DEFINER 함수 1건과 pg_net public 확장. 의도된 API인지 별도 보안 심사 필요. 기존 RLS 정책은 유지됨.

## 배포 체크리스트
- [ ] 기존 DB와 직원 로컬 기록을 백업 및 복원 시연
- [ ] SQL 마이그레이션 백업/점검 후 적용 (별도 승인)
- [ ] 실제 직원 계정에서 신규/기존/다른 직원/로그아웃/동시 브라우저 저장·조회, 타 계정 데이터 0건 확인
- [ ] 전체 CI의 기존 실패 항목 원인 해결·재실행
- [ ] 샘플 내담자로 IAP/상담일/날짜수정/상태수정/21일 경과까지 왕복 확인
- [ ] 두 PR 함께 병합, 배포 후 개인정보·오류 모니터링

### 검증 근거
- [isolated PostgreSQL RLS & atomic rollback success](https://github.com/careercounselor1984-code/my-html-9/actions/runs/44838937998)
- [상담일지 핵심 연결 검사](https://github.com/careercounselor1984-code/my-html-4/actions/runs/44835461877)
- [기존 일정표 main 전체 CI 실패](https://github.com/careercounselor1984-code/my-html-9/actions/runs/43802182661)
- [기존 상담일지 main 전체 CI 실패](https://github.com/careercounselor1984-code/my-html-4/actions/runs/44834825265)

결론: 코드와 격리 DB 시뮬레이션의 보안 속성은 확인했으나 **운영 사용 승인에는 실제 인증/RLS 환경 통합검증이 필요함**.
