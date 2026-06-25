# 긁? 🎯 (스피또 출고율·당첨율 트래커)

동행복권 **스피또2000 · 1000 · 500**의 회차별 **출고율**과 **등위별 잔여 당첨**을 실시간으로 추적해,
지금 사기 좋은 회차를 **추천 지수**로 보여주는 정적 웹 서비스입니다.

> 데이터는 동행복권 공식 발행내역에서 자동 수집됩니다. 비공식 정보 제공 페이지입니다.

## ✨ 주요 기능

- **출고율 · 등위별 잔여 당첨** 회차별 시각화 (판매중/판매종료 구분)
- **추천 지수** — 출고율 대비 고액 당첨 잔여를 가중한 참고 점수
- **오늘의 추천 PICK** — 판매중 회차 중 추천 1순위를 사유와 함께 강조
- **요약 지표** — 판매중 회차 수 · 평균 출고율 · 남은 1등 합계 (카운트업)
- **검색 / 판매중만 토글 / 정렬**(최신·추천·출고율) / **종류 탭**
- **공유 버튼**(Web Share·링크 복사), 맨 위로, 로딩 스켈레톤
- **SEO** — 메타·OG·트위터·JSON-LD(FAQ/WebSite/Org), sitemap·robots·manifest·OG 이미지
- **수익화 준비** — AdSense 슬롯(설정값으로 on/off), `ads.txt`
- **PWA** 설치 지원(manifest)

## 📁 구성

| 파일 | 설명 |
|------|------|
| `index.html` | 단일 페이지 앱(스타일·스크립트 인라인) |
| `fetch-data.js` | 동행복권 발행내역 API → `data.json` (의존성 없음, Node 18+) |
| `data.json` | 수집된 회차 데이터 |
| `favicon.svg` / `og-image.png` | 브랜드 아이콘 / 공유 미리보기 이미지 |
| `robots.txt` / `sitemap.xml` / `site.webmanifest` | SEO·PWA |
| `ads.txt` | AdSense 게시자 인증 |
| `_headers` | Cloudflare Pages 캐시·보안 헤더 |
| `.ci-pending/refresh-data.yml` | 데이터 자동 갱신 워크플로(아래 참고) |

## 🔧 배포 전 설정 (중요)

배포 도메인이 정해지면 아래 **플레이스홀더 도메인**을 실제 도메인으로 바꾸세요.
현재 값은 `https://ge-uk.com/` 입니다.

- `index.html` — `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, JSON-LD의 URL들
- `robots.txt` — `Sitemap:` 줄
- `sitemap.xml` — `<loc>`

> 빠른 일괄 치환 예: `grep -rl ge-uk.com . | xargs sed -i '' 's#ge-uk.com#내도메인#g'`

## 💰 광고(AdSense) 연동

1. AdSense 승인 후 게시자 ID(`ca-pub-…`)와 광고 단위 슬롯 ID 발급
2. `index.html` 상단 `CONFIG`에 입력:
   ```js
   const CONFIG = {
     adsenseClient: "ca-pub-XXXXXXXXXXXXXXXX",
     adSlots: { top: "1234567890", mid: "0987654321" }
   };
   ```
3. `ads.txt`의 `pub-XXXX…`를 본인 게시자 ID로 교체
4. 미설정 시 광고는 로드되지 않고 자리만 미리보기로 표시됩니다.

## 🚀 Cloudflare Pages 배포

1. 이 저장소를 GitHub에 push
2. Cloudflare 대시보드 → **Workers & Pages → Create → Pages → Connect to Git**
3. 빌드 설정: **Framework preset: None**, **Build command: 비움**, **Output directory: `/`**
4. 배포 완료 → `https://<project>.pages.dev` 생성 (커스텀 도메인 연결 가능)
5. `_headers`가 자동 적용됩니다.

### 데이터 자동 갱신
Cloudflare Pages는 정적 호스팅이라 빌드 시점 데이터를 서빙합니다. 주기 갱신 옵션:

- **(권장) GitHub Actions** — `.ci-pending/refresh-data.yml`을 `.github/workflows/`로 옮겨 push.
  6시간마다 `data.json`을 갱신·커밋하고, 연결된 Cloudflare Pages가 자동 재배포합니다.
  (push하려면 토큰에 `workflow` 스코프 필요: `gh auth refresh -h github.com -s workflow`)
- **대안** — Cloudflare Cron Trigger + Worker로 주기 재빌드 훅 호출.

## 🖥 로컬 실행

```bash
node fetch-data.js          # 최신 데이터 수집
python3 -m http.server 8765 # 또는 npx serve
# http://localhost:8765
```
`index.html`을 파일로 바로 열면 `data.json`을 못 읽으니 반드시 서버로 띄우세요.

## 📊 데이터 항목

- **출고율(`shipmentRate`)** — 발행량 중 판매점 출고 비율 %
- **등위별 잔여(`rank1~3`)** — 남은 / 전체 당첨매수
- **추천 지수(`recommendScore`)** — 1·2·3등 잔여율(6:3:1 가중) × 출고율 (참고용, 확률 보장 아님)

---
본 서비스는 동행복권과 무관한 비공식 페이지이며 데이터 정확성을 보장하지 않습니다. 과도한 복권 구매는 삼가세요.
