#!/usr/bin/env node
/**
 * 당첨판매점 역대 아카이브 빌더 (1회성/수동 실행)
 * - selectStEpsdInfo 로 종류별 역대 전 회차 목록을 얻고,
 *   각 회차의 1·2등 당첨판매점을 selectStWnShp 로 수집해 stores-archive.json 으로 저장한다.
 * - 과거 회차 데이터는 거의 고정이므로 커밋해두고, 평소 빌드는 최근 회차만 갱신(fetch-data) 후 병합한다.
 * 사용: node build-archive.js
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const STORE_GDS = { SP2000: "LP35", SP1000: "LP34", SP500: "LP33" };

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "AJAX": "true",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": "https://www.dhlottery.co.kr/wnprchsplcsrch/home",
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
async function getJson(url, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const b = await get(url);
      if (!b || !b.trim().startsWith("{")) throw new Error("non-json");
      return JSON.parse(b);
    } catch (e) { last = e; if (i < tries) await sleep(i * 2000); }
  }
  throw last;
}

async function episodes(typeCd) {
  const gds = STORE_GDS[typeCd];
  const j = await getJson(`https://www.dhlottery.co.kr/wnprchsplcsrch/selectStEpsdInfo.do?srchLtGdsCd=${gds}`);
  return ((j.data && j.data.list) || []).map((x) => x.ltEpsd).filter((n) => n != null);
}
async function storesFor(typeCd, ep, rank) {
  const gds = STORE_GDS[typeCd];
  const url = `https://www.dhlottery.co.kr/wnprchsplcsrch/selectStWnShp.do?srchLtGdsCd=${gds}&srchLtEpsd=${ep}&srchWnShpRnk=${rank}`;
  try {
    const j = await getJson(url, 3);
    return ((j.data && j.data.list) || []).map((s) => ({
      rank, name: s.shpNm || "", addr: (s.shpAddr || "").trim(),
      tel: s.shpTelno || "", lat: s.shpLat ?? null, lng: s.shpLot ?? null, region: s.region || "",
    })).filter((s) => s.name);
  } catch (e) { console.error(`  실패 ${typeCd} ${ep}회 ${rank}등: ${e.message}`); return []; }
}

// 동시성 제한 풀
async function pool(items, limit, worker) {
  const out = []; let i = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx], idx); }
  });
  await Promise.all(runners);
  return out;
}

(async () => {
  const archive = {};
  let total = 0;
  for (const typeCd of Object.keys(STORE_GDS)) {
    const eps = await episodes(typeCd);
    console.log(`${typeCd}: 역대 ${eps.length}회차 수집 시작...`);
    await pool(eps, 6, async (ep) => {
      const [r1, r2] = await Promise.all([storesFor(typeCd, ep, 1), storesFor(typeCd, ep, 2)]);
      const list = [...r1, ...r2];
      if (list.length) { archive[`${typeCd}-${ep}`] = list; total += list.length; }
    });
    console.log(`${typeCd}: 완료`);
  }
  fs.writeFileSync(path.join(__dirname, "stores-archive.json"), JSON.stringify(archive), "utf8");
  console.log(`아카이브 저장: ${Object.keys(archive).length}회차, 총 ${total}곳 → stores-archive.json`);
})().catch((e) => { console.error("아카이브 실패:", e.message); process.exit(1); });
