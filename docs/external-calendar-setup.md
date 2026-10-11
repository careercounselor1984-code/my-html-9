# 좋은일자리 상담일정표 — 외부 캘린더 연결 (2026-10-11)

## 운영 원칙
- **좋은일자리 상담일정표가 유일한 원본**입니다. 상담사에게 외부 캘린더 사용을 강제하지 않습니다.
- 외부 연결은 직원별로 선택합니다. 기존 휴대폰 알림 기능과는 독립적으로 작동합니다.
- 외부로 내보내는 일정에는 내담자 이름·전화번호·상담메모를 포함하지 않고 **일정 구분과 시간**만 포함합니다.
- ICS는 개인별 비공개 URL입니다. 유출 시 '구독 주소 새로 발급'으로 기존 주소를 즉시 무효화하세요.

## 현재 제공 기능
- **ICS**: 서버에서 직원 인증 후 주소 발급/조회/재발급/해제. 주소를 Apple·Google·Outlook 캘린더에서 구독 가능. 사용자는 설정 → 외부 캘린더 연결(선택) → 내 구독 주소 발급·보기. 구독 갱신 주기는 캘린더 제공업체가 결정.
- **Google / Microsoft**: OAuth 2.0 + PKCE 로그인 및 갱신 토큰 보관, 본인 일정 외부 등록·수정·삭제. 외부에서 수정한 내용은 원본 일정표로 수입하지 않음.
- 외부 자동 갱신은 원본에서 저장했을 때와 앱 로그인 및 정기 확인 시 실행. 대리 예약·인계 수락 시 관련 상대방 갱신 요청. 직원이 앱을 모두 닫은 상태에서 발생한 다른 예외적 DB 변경은 다음 동기화까지 지연될 수 있음.

## Google / Microsoft 자동 연동 활성화 — 관리자 최초 1회
Supabase 프로젝트 `hnhccnyitrlzqprnredi`의 **Edge Functions Secrets**에서 아래 4개를 등록합니다. 비밀값을 GitHub나 HTML에 직접 넣지 않습니다.

```
GOOGLE_CALENDAR_CLIENT_ID=... (Google Cloud 웹 애플리케이션 OAuth 클라이언트 ID)
GOOGLE_CALENDAR_CLIENT_SECRET=... (Google Cloud 클라이언트 비밀)
MICROSOFT_CALENDAR_CLIENT_ID=... (Microsoft Entra 앱 ID)
MICROSOFT_CALENDAR_CLIENT_SECRET=... (Microsoft Entra 클라이언트 비밀)
```

**두 업체 모두 동일한 승인된 리디렉션 URI를 등록하세요.**

```
https://hnhccnyitrlzqprnredi.supabase.co/functions/v1/schedule-calendar
```

### Google Cloud
1. Calendar API 활성화 → OAuth 동의 화면 구성 및 테스트 사용자 지정(내부 테스트 상태일 때).
2. OAuth 클라이언트 유형: **웹 애플리케이션**, 위 리디렉션 URI 등록.
3. 범위: `https://www.googleapis.com/auth/calendar.events` (개인 캘린더 일정 조회·수정 접근).
4. 클라이언트 ID/비밀을 Supabase Edge Functions Secrets에 입력.
5. 일반 사용자 배포에 OAuth 앱 검증 등이 필요할 수 있음. 테스트 계정만으로 먼저 검증.

문서: https://developers.google.com/identity/protocols/oauth2/web-server

### Microsoft Entra
1. 앱 등록 → 지원 계정 유형에 조직·개인 Microsoft 계정 지원 여부를 목적에 따라 지정.
2. 플랫폼: Web → 위 리디렉션 URI 등록.
3. Microsoft Graph 위임 권한: `Calendars.ReadWrite`, `User.Read`, `offline_access` (조직 정책에 따라 관리자 동의 필요).
4. 클라이언트 비밀 생성 및 유효기간 관리 → App ID/비밀을 Supabase Secrets에 입력.

문서: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

## 직원 사용법
1. 좋은일자리 일정표 로그인 → 설정·더보기 → **외부 캘린더 연결(선택)**.
2. 연동하지 않을 경우 아무것도 할 필요가 없음.
3. ICS는 구독 URL을 복사하여 본인의 캘린더에서 **URL로 구독**.
4. Google / Outlook 자동 연결은 관리자 설정 후 '내 계정 연결하기' 선택, 한 번 로그인·동의. 연결 직후 '지금 동기화'.
5. 연결 해제 시 기존에 외부 캘린더에 복사된 예약은 외부에 남을 수 있음. 외부 캘린더에서 직접 정리하거나 다시 연결해 갱신.

## 보안/테스트
- 개인별 서버 직원 인증, 변경 가능한 256비트 랜덤 ICS URL, 비공개 테이블·RLS 및 인증 동의 코드를 적용.
- 자동 연동의 업체별 실제 OAuth 로그인 및 푸시/캘린더 수신은 **실제 기기와 테스트 계정으로 최종 확인 필요**.
- GitHub: `index.html`; Supabase Edge Function: `schedule-calendar`; DB: `schedule_calendar_*.`
