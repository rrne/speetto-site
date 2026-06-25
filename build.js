#!/usr/bin/env node
/**
 * 정적 사전 렌더(SSG) 빌드
 * - data.json 을 읽어 추천 PICK·판매중 카드·판매종료 목록을 index.html 의 컨테이너에 미리 주입한다.
 * - 크롤러(구글·네이버)·AdSense가 실제 출고율/당첨율 콘텐츠를 초기 HTML에서 바로 읽게 한다.
 * - 클라이언트 JS는 로드 시 동일 내용을 다시 렌더(하이드레이션)하므로 동작/신선도는 그대로.
 * 출력: dist/index.html  (나머지 정적 파일은 배포 스크립트가 복사)
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "index.html");
const DATA = path.join(__dirname, "data.json");
const OUT_DIR = path.join(__dirname, "dist");

// ---- index.html 의 렌더 로직과 동일 (단일 디자인 소스 유지) ----
const LOGO_MARK = '<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="20" cy="20" r="12" stroke="#fff" stroke-width="3.4"/><circle cx="20" cy="20" r="5.5" stroke="#fff" stroke-width="3.4"/><circle cx="20" cy="20" r="2.2" fill="#fff"/></svg>';
const TCLASS = { SP2000: "t2000", SP1000: "t1000", SP500: "t500" };
const CCLASS = { SP2000: "c2000", SP1000: "c1000", SP500: "c500" };
const fmt = (n) => (n == null ? "-" : n.toLocaleString("ko-KR"));
const rateOf = (r) => (r && r.total ? (r.remain / r.total) * 100 : 0);
function dday(end) {
  if (!end) return null;
  const d = new Date(end + "T23:59:59");
  if (isNaN(d)) return null;
  const days = Math.ceil((d - Date.now()) / 86400000);
  if (days < 0) return { days, txt: "마감", soon: false, over: true };
  if (days === 0) return { days, txt: "오늘 마감", soon: true, over: false };
  return { days, txt: "D-" + days, soon: days <= 14, over: false };
}
function scoreColor(s) {
  if (s == null) return "#9aa6ba";
  if (s >= 40) return "#10b981";
  if (s >= 20) return "#f59e0b";
  return "#f43f5e";
}
function rankRow(n, r, cls) {
  const pct = rateOf(r);
  const rmn = r && r.remain != null ? r.remain : null;
  const tot = r && r.total != null ? r.total : null;
  return `<div class="rk ${cls}">
    <div class="badge">${n}등</div>
    <div class="body">
      <div class="nums">
        <div class="remain">${fmt(rmn)}<span class="of">/ ${fmt(tot)}매</span></div>
        <div class="pct">${pct.toFixed(0)}%</div>
      </div>
      <div class="mini"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>
  </div>`;
}
function cardHTML(g) {
  const ship = g.shipmentRate == null ? 0 : g.shipmentRate;
  const sc = g.recommendScore, scP = sc == null ? 0 : Math.min(100, sc);
  const ddInfo = (() => { const d = dday(g.saleEndDate); return d && !d.over ? ` · <b class="dday${d.soon ? " soon" : ""}">${d.txt}</b>` : ""; })();
  return `<div class="card ${TCLASS[g.typeCd] || ""}">
    <div class="chead">
      <div class="title">
        <span class="gname ${CCLASS[g.typeCd] || ""}">${LOGO_MARK}${g.typeName}</span>
        <span class="epno">${g.episode}회</span>
        <span class="price">${fmt(g.price)}원</span>
      </div>
      <span class="status st-sale">${g.status}</span>
    </div>
    <div class="panel">
      <div class="ship">
        <div class="row"><span class="k">출고율</span><span class="v">${ship}<small>%</small></span></div>
        <div class="track"><i style="width:${ship}%"></i></div>
      </div>
      <div class="ranks-h"><span class="lbl">등위별 잔여 당첨</span><span class="hint">남은 / 전체</span></div>
      <div class="ranks">
        ${rankRow(1, g.rank1, "rk1")}
        ${rankRow(2, g.rank2, "rk2")}
        ${rankRow(3, g.rank3, "rk3")}
      </div>
      <div class="cfoot">
        <div class="info">1등 <b>${g.rank1 && g.rank1.prize ? g.rank1.prize : "-"}</b><br>판매기한 <b>${g.saleEndDate || "-"}</b>${ddInfo}</div>
        <div class="rec">
          <div class="meta2"><div class="t">추천 지수</div><div class="s" style="color:${scoreColor(sc)}">${sc == null ? "-" : sc}</div></div>
          <div class="gauge" style="--p:${scP};--g:${scoreColor(sc)}"><span>${sc == null ? "-" : Math.round(scP)}</span></div>
        </div>
      </div>
    </div>
  </div>`;
}
function soldDetailsHTML(g) {
  const ship = g.shipmentRate == null ? 0 : g.shipmentRate;
  const r1 = g.rank1 || {};
  return `<details class="sd">
    <summary>
      <span class="sd-name">${g.typeName} ${g.episode}회</span>
      <span class="sd-mini">출고 ${ship}% · 1등 ${fmt(r1.remain)}/${fmt(r1.total)}</span>
      <span class="chev">⌄</span>
    </summary>
    <div class="sd-body">
      <div class="ship">
        <div class="row"><span class="k">출고율</span><span class="v">${ship}<small>%</small></span></div>
        <div class="track"><i style="width:${ship}%"></i></div>
      </div>
      <div class="ranks-h"><span class="lbl">등위별 잔여 당첨</span><span class="hint">남은 / 전체</span></div>
      <div class="ranks">
        ${rankRow(1, g.rank1, "rk1")}
        ${rankRow(2, g.rank2, "rk2")}
        ${rankRow(3, g.rank3, "rk3")}
      </div>
      <div class="cfoot">
        <div class="info">1등 <b>${r1.prize || "-"}</b> · 판매기한 <b>${g.saleEndDate || "-"}</b></div>
      </div>
    </div>
  </details>`;
}
function pickHTML(g) {
  const sc = g.recommendScore, scP = Math.min(100, sc);
  const r1 = g.rank1 || {}, r1pct = rateOf(r1).toFixed(0);
  const dd = dday(g.saleEndDate);
  const ddSticker = dd && !dd.over ? `<span class="sticker${dd.soon ? " hot" : ""}"><i>판매</i><b>${dd.txt}</b></span>` : "";
  return `
    <div class="pick">
      <div class="pick-l">
        <div class="pick-labels">
          <span class="ribbon">⭐ 추천 1순위</span>
          <span class="gname ${CCLASS[g.typeCd] || ""}">${LOGO_MARK}${g.typeName}</span>
        </div>
        <div class="pep">${g.episode}회</div>
        <p class="preason">출고율 <b>${g.shipmentRate}%</b>인데 1등이 아직 <b>${fmt(r1.remain)}매(${r1pct}%)</b> 남았어요.</p>
        <div class="pstickers">
          <span class="sticker"><i>출고율</i><b>${g.shipmentRate}%</b></span>
          <span class="sticker"><i>1등 잔여</i><b>${fmt(r1.remain)}/${fmt(r1.total)}매</b></span>
          <span class="sticker"><i>1등 당첨금</i><b>${r1.prize || "-"}</b></span>
          ${ddSticker}
        </div>
      </div>
      <div class="pick-r">
        <div class="bigGauge" style="--p:${scP};--g:var(--brand)">
          <div class="inner"><div class="num" style="color:var(--brand)">${sc}</div><div class="lab">추천 지수</div></div>
        </div>
        <div class="cap">${dd && !dd.over ? "판매기한 " + g.saleEndDate : "판매 종료 임박"}</div>
      </div>
    </div>`;
}

// ---- 빌드 ----
const html = fs.readFileSync(SRC, "utf8");
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const games = (data.games || []).slice().sort((a, b) => b.episode - a.episode);
const onSale = games.filter((g) => g.status === "판매중");
const sold = games.filter((g) => g.status !== "판매중");

const pick = onSale.filter((g) => g.recommendScore != null).sort((a, b) => b.recommendScore - a.recommendScore)[0];
const pickOut = pick ? pickHTML(pick) : "";
const gridOut = onSale.map(cardHTML).join("");
const soldOut = sold.length
  ? `<div class="divider">이미 다 긁힌 회차 <span class="n">${sold.length}개</span></div>
       <div class="sold-list">${sold.map(soldDetailsHTML).join("")}</div>`
  : "";

let out = html;
// 1) PICK 주입
out = out.replace('<section id="pick"></section>', `<section id="pick">${pickOut}</section>`);
// 2) GRID(스켈레톤) → 실제 카드, 3) soldSection 주입 : 두 마커 사이를 통째로 교체
const gridStart = out.indexOf('<div class="grid" id="grid">');
const soldMarker = '<div id="soldSection"></div>';
const soldIdx = out.indexOf(soldMarker);
if (gridStart === -1 || soldIdx === -1) {
  console.error("주입 마커를 찾지 못했습니다 (grid/soldSection)");
  process.exit(1);
}
const before = out.slice(0, gridStart);
const after = out.slice(soldIdx + soldMarker.length);
out = before +
  `<div class="grid" id="grid">${gridOut}</div>\n\n    <!-- 판매 종료 -->\n    <div id="soldSection">${soldOut}</div>` +
  after;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), out, "utf8");
console.log(`사전 렌더 완료: dist/index.html (판매중 ${onSale.length} · 판매종료 ${sold.length} · PICK ${pick ? pick.typeName + " " + pick.episode + "회" : "없음"})`);
