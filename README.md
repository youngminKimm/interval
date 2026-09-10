# ⏱️ 인터벌 타이머

유튜브 틀어놓고 운동할 때 쓰는 심플한 인터벌 타이머. 서버·빌드 없이 정적 파일 3개.

## 실행

```bash
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000 접속. (`index.html`을 바로 열어도 되지만, 화면 켜짐 유지(Wake Lock)는 localhost/https에서만 동작)

## 기능

- 준비 / 운동 / 휴식 / 라운드 / 세트 / 세트 간 휴식 설정 + 프리셋 (타바타 등)
- **오디오 클록 기반 효과음** — 시작 시 남은 구간의 비프음을 Web Audio에 전부 예약하므로, 유튜브 탭을 보느라 타이머가 백그라운드에 있어도 3-2-1 카운트다운과 전환음이 정확한 타이밍에 울림
- 음성 안내 옵션 (한국어 TTS)
- 화면 켜짐 유지 (Wake Lock)
- 설정 자동 저장 (localStorage)
- 단축키: Space 시작/일시정지 · ←/→ 이전/다음 구간 · Esc 정지

## 배포

정적 호스팅 아무 데나 올리면 됨 — GitHub Pages, Vercel, Netlify, Cloudflare Pages.
