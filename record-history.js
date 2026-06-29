#!/usr/bin/env node
/**
 * 시계열 스냅샷 기록기 — 차별화의 핵심 자산.
 *
 * 매 cron 실행마다 '판매중' 회차의 (출고율, 1등 잔여)를 history.json 에 누적한다.
 * 과거 데이터는 소급 수집이 불가능하므로, 일찍·꾸준히 쌓을수록 경쟁 우위가 커진다.
 *
 * 실행 순서: fetch-data.js → record-history.js → build.js
 *  (build.js 가 history.json 을 읽어 추세 차트를 사전 렌더하므로 build 보다 먼저 실행)
 *
 * 저장 형식 (용량 최소화):
 *   { "SP1000-107": [ { "t":"2026-06-27T03:56Z", "s":59, "r":11 }, ... ] }
 *   t=시각(분 단위), s=출고율(%), r=1등 잔여매수
 *  - 직전 스냅샷과 값이 같으면 기록하지 않는다(희소 저장).
 *  - 판매종료 회차는 더 이상 추가하지 않는다(값이 고정되므로).
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "data.json");
const HIST = path.join(__dirname, "history.json");
const MAX_POINTS = 500; // 회차당 안전 상한 (이상 시 오래된 것부터 버림)

const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
let hist = {};
try { hist = JSON.parse(fs.readFileSync(HIST, "utf8")); } catch (e) { hist = {}; }

// 시각: data.updatedAt(예: 2026-06-27T03:56:53.498Z) → 분 단위 "2026-06-27T03:56Z"
const t = (data.updatedAt || "").slice(0, 16) + "Z";

let added = 0;
for (const g of data.games || []) {
  if (g.status !== "판매중") continue; // 판매중만 추적
  const k = `${g.typeCd}-${g.episode}`;
  const s = g.shipmentRate == null ? null : g.shipmentRate;
  const r = g.rank1 && g.rank1.remain != null ? g.rank1.remain : null;
  const arr = hist[k] || (hist[k] = []);
  const last = arr[arr.length - 1];
  // 변화가 있을 때만 기록(희소). 첫 기록은 무조건 남긴다.
  if (!last || last.s !== s || last.r !== r) {
    arr.push({ t, s, r });
    added++;
  }
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
}

fs.writeFileSync(HIST, JSON.stringify(hist));
console.log(`history 기록: ${Object.keys(hist).length}개 회차 추적 중 (이번 신규 포인트 ${added}개, 기준 ${t})`);
