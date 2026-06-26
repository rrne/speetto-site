#!/usr/bin/env node
/**
 * 동행복권 스피또 발행내역 수집기
 * - 공식 발행내역 API(/st/selectPblcnDsctn.do)를 호출해 회차별 출고율과
 *   등위별 잔여 당첨매수를 가져와 data.json 으로 저장한다.
 * - 외부 의존성 없이 Node 기본 모듈만 사용한다.
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const API = "https://www.dhlottery.co.kr/st/selectPblcnDsctn.do" +
  "?gdsType=&gdsPrice=&gdsStatus=&pageNum=1&recordCountPerPage=200";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        // 동행복권은 이 두 헤더가 있어야 JSON을 내려준다.
        "AJAX": "true",
        "requestMenuUri": "/st/pblcnDsctn",
        // 일부 해외 IP에서 차단을 피하려고 실제 브라우저에 가깝게 위장
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": "https://www.dhlottery.co.kr/st/pblcnDsctn",
        "X-Requested-With": "XMLHttpRequest",
      },
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 동행복권이 해외 IP를 간헐적으로 막거나 느려서, 지수 백오프로 여러 번 재시도한다.
async function getWithRetry(url, tries = 5) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const body = await get(url);
      // 빈 응답/HTML(차단 페이지)이면 실패로 간주하고 재시도
      if (!body || !body.trim().startsWith("{")) throw new Error("비정상 응답(JSON 아님)");
      return body;
    } catch (e) {
      lastErr = e;
      console.error(`시도 ${i}/${tries} 실패: ${e.message}`);
      if (i < tries) await sleep(i * 2500); // 2.5s, 5s, 7.5s, 10s
    }
  }
  throw lastErr;
}

// "7매/8매" → { remain: 7, total: 8 }
function parseRate(s) {
  if (!s || typeof s !== "string") return { remain: null, total: null };
  const m = s.match(/([\d,]+)\s*매?\s*\/\s*([\d,]+)\s*매?/);
  if (!m) return { remain: null, total: null };
  const n = (x) => parseInt(x.replace(/,/g, ""), 10);
  return { remain: n(m[1]), total: n(m[2]) };
}

const TYPE_NAME = { SP2000: "스피또2000", SP1000: "스피또1000", SP500: "스피또500" };
const TYPE_PRICE = { SP2000: 2000, SP1000: 1000, SP500: 500 };

(async () => {
  const raw = await getWithRetry(API);
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("응답 파싱 실패. 앞부분:", raw.slice(0, 200));
    process.exit(1);
  }
  const list = (json.data && json.data.list) || [];
  if (!list.length) {
    console.error("데이터가 비어있습니다. 응답:", JSON.stringify(json).slice(0, 300));
    process.exit(1);
  }

  const games = list.map((it) => {
    const r1 = parseRate(it.stRnk1Rt);
    const r2 = parseRate(it.stRnk2Rt);
    const r3 = parseRate(it.stRnk3Rt);
    const spmt = Number(it.stSpmtRt); // 출고율(판매점 입고율) %

    // 잔여율 = 남은 당첨매수 / 전체 당첨매수
    const rate = (r) => (r.total ? Math.round((r.remain / r.total) * 1000) / 10 : null);
    const r1Rate = rate(r1);

    // 구매 추천 지수 (0~100, 휴리스틱)
    // 아이디어: 출고율이 높고(=시중에 많이 풀렸고) 고액 당첨이 아직 많이 남아있을수록
    //          남은 고액복권이 시중에 있을 가능성이 커 유리하다고 본다.
    let score = null;
    if (r1Rate != null && !Number.isNaN(spmt)) {
      const remainScore = (rate(r1) ?? 0) * 0.6 + (rate(r2) ?? 0) * 0.3 + (rate(r3) ?? 0) * 0.1;
      score = Math.round(Math.min(100, (remainScore * (spmt / 100))) * 10) / 10;
    }

    return {
      typeCd: it.stGmTypeCd,
      typeName: it.stGmTypeNm || TYPE_NAME[it.stGmTypeCd] || it.stGmTypeCd,
      price: TYPE_PRICE[it.stGmTypeCd] ?? Number(it.stNtslAmt) ?? null,
      episode: Number(it.stEpsd),
      status: it.ntslStatus,                 // 판매중 / 판매종료
      shipmentRate: Number.isNaN(spmt) ? null : spmt, // 출고율 %
      rank1: { ...r1, prize: it.rnk1Atm },   // 1등 잔여/전체 + 당첨금
      rank2: r2,
      rank3: r3,
      rank1RemainRate: r1Rate,               // 1등 잔여율 %
      recommendScore: score,
      saleEndDate: it.stNtslEndDt,
      giveEndDate: it.stGiveEndDt,
      dataChgDate: it.dataChgDt,
    };
  });

  // 회차 내림차순(최신 우선)
  games.sort((a, b) => b.episode - a.episode);

  // ---- 판매중 회차의 1·2등 당첨판매점 수집 (지도 링크용 좌표 포함) ----
  // 동행복권 당첨판매점 API: 상품코드(LP35/34/33) + 회차 + 등수
  const STORE_GDS = { SP2000: "LP35", SP1000: "LP34", SP500: "LP33" };
  async function fetchStores(g, rank) {
    const gds = STORE_GDS[g.typeCd];
    if (!gds) return [];
    const url = "https://www.dhlottery.co.kr/wnprchsplcsrch/selectStWnShp.do" +
      `?srchLtGdsCd=${gds}&srchLtEpsd=${g.episode}&srchWnShpRnk=${rank}`;
    try {
      const body = await getWithRetry(url, 2);
      const j = JSON.parse(body);
      const list = (j.data && j.data.list) || [];
      return list.map((s) => ({
        rank,
        name: s.shpNm || "",
        addr: (s.shpAddr || "").trim(),
        tel: s.shpTelno || "",
        lat: s.shpLat ?? null,
        lng: s.shpLot ?? null,
        region: s.region || "",
      })).filter((s) => s.name);
    } catch (e) {
      console.error(`당첨판매점 수집 실패 ${g.typeCd} ${g.episode}회 ${rank}등: ${e.message}`);
      return [];
    }
  }
  // 전 회차의 1·2등 당첨판매점을 stores.json 으로 분리 저장 (명당 집계 + 상세페이지용, data.json 은 가볍게 유지)
  const stores = {};
  for (const g of games) {
    const [r1, r2] = await Promise.all([fetchStores(g, 1), fetchStores(g, 2)]);
    const list = [...r1, ...r2];
    if (list.length) stores[`${g.typeCd}-${g.episode}`] = list;
  }
  const storeTotal = Object.values(stores).reduce((a, l) => a + l.length, 0);
  fs.writeFileSync(path.join(__dirname, "stores.json"), JSON.stringify(stores), "utf8");
  console.log(`당첨판매점 수집: ${Object.keys(stores).length}회차, 총 ${storeTotal}곳 → stores.json`);

  const out = {
    updatedAt: new Date().toISOString(),
    source: "동행복권 dhlottery.co.kr 발행내역",
    count: games.length,
    games,
  };

  const outPath = path.join(__dirname, "data.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`저장 완료: ${outPath} (${games.length}건, 갱신 ${out.updatedAt})`);
})().catch((e) => {
  console.error("수집 실패:", e.message);
  process.exit(1);
});
