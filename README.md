# 스피또 출고율 · 당첨율 현황

동행복권 **스피또2000 · 1000 · 500** 의 회차별 **출고율**과 **등위별 잔여 당첨매수**를
한눈에 보여주는 정적 사이트입니다. 데이터는 동행복권 공식 발행내역에서 자동 수집됩니다.

## 구성

| 파일 | 설명 |
|------|------|
| `fetch-data.js` | 동행복권 발행내역 API를 호출해 `data.json` 생성 (의존성 없음, Node 18+) |
| `data.json` | 수집된 회차별 데이터 |
| `index.html` | 데이터를 시각화하는 단일 페이지 |
| `.github/workflows/deploy.yml` | 6시간마다 데이터 갱신 후 GitHub Pages 배포 |

## 로컬에서 보기

```bash
node fetch-data.js     # 최신 데이터 수집
npx serve .            # 또는 python3 -m http.server
```

브라우저에서 `http://localhost:3000` (serve) 접속.
`index.html`을 파일로 바로 열면 브라우저 보안정책 때문에 `data.json`을 못 읽으니 꼭 서버로 띄우세요.

## 배포 (GitHub Pages)

1. 이 폴더를 GitHub 저장소로 push
2. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** 선택
3. 이후 push 시 자동 배포되고, 6시간마다 데이터가 갱신됩니다.

## 데이터 항목

- **출고율(`shipmentRate`)** — 발행량 중 판매점 출고(입고) 비율 %
- **등위별 잔여(`rank1~3`)** — 남은 당첨매수 / 전체 당첨매수
- **추천 지수(`recommendScore`)** — 출고율이 높은데 고액 당첨이 많이 남을수록 높은 참고용 휴리스틱 점수 (통계적 보장 아님)

> 본 사이트는 비공식 정보 제공 페이지이며, 데이터의 정확성을 보장하지 않습니다.
