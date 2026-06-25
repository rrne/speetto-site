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
        "User-Agent": "Mozilla/5.0 (speetto-site data fetcher)",
        "Accept": "application/json",
      },
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
  });
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
  const raw = await get(API);
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
