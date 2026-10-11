# 상담 일정관리 운영 반영 확인 (2026-10-11)

## 정식 반영
- PR #1: 기존 예약 중복·복원·공휴일·이벤트 버전 동기화 안전 수정, main 병합.
- PR #2: 참여자·공통 휴무·공지 compare-and-swap RPC 전환 및 로컬 백업 실패 시 자동 저장 차단, main 병합. Merge: `9b92bce110d3dca12939758f3f606530ea25ec77`.
- 웹 서비스워커 캐시: `goodjob-schedule-v24-8-aux-cas`.
- GitHub Actions 검수 브랜치 반복 회귀검사 성공. 검수 스크립트는 `tests/schedule-safety.test.cjs`.

## 운영 Supabase 데이터베이스
- 신규 함수 `public.schedule_apply_aux_changes(text,jsonb)` 배포. `authenticated` EXECUTE 허용, `anon` 거부.
- 기존 `schedule_apply_event_changes(jsonb)`도 인증 계정만 호출 가능.
- 두 RPC 모두 서버 인증을 기준으로 소유권·충돌을 판단. 신규 보조 RPC는 행 단위 `FOR UPDATE` 및 JSONB 기준값 비교 후 수정·삭제.
- 거래 후 ROLLBACK하는 임시 참여자 테스트로 신규 등록/정상 수정/오래된 기기의 수정 및 삭제 거부/최신 값 유지/정상 삭제 검증 통과.
- 실제 서버 상태: 상담 이벤트 1건, 참여자 2건, 공통 휴무 0건, 공지 0건. 테스트용 레코드 0건.
- 구버전 직접 쓰기 우회 방지: `schedule_events`, `schedule_participants`, `schedule_closures`, `schedule_notices`의 `authenticated` 직접 INSERT/UPDATE/DELETE 권한을 회수. SELECT 및 신규 인증 RPC 호출은 유지.
- 운영 SQL 및 안전 복구 SQL은 `docs/sql/20261011_schedule_*.sql`에 보존.

## 반드시 지켜야 할 운영 사항
- 이전 버전 탭/설치형 앱은 구형 직접 저장이 거부될 수 있으므로 PC 강력 새로고침 및 모바일 PWA 재실행 필요.
- 실제 상담사 두 계정의 교차 기기 저장·삭제, 공휴일 예약/거절, PWA·푸시, 상담일지 연결, 인쇄·PDF 및 지사별 권한 표시까지 **실사용 검증은 완료됐다고 주장하지 않음**.
- GitHub main 병합을 확인했으나 외부 배포 URL의 실제 CDN/브라우저 캐시 반영 및 이용자 기기 동기화까지 검증한 것은 아님.
- 스키마/함수 롤백은 최신 클라이언트가 새 RPC를 호출하지 않는다는 조건과 안전한 백업 확인 후 수행. 구형 직접 쓰기 권한 복원은 충돌 방지 수준을 낮춤.
