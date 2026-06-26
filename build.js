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

// 주석 마커 사이를 교체(idempotent) — 이미 베이크된 index.html을 다시 빌드해도 안전
function injectBetween(src, startMark, endMark, inner) {
  const s = src.indexOf(startMark);
  const e = src.indexOf(endMark);
  if (s === -1 || e === -1) {
    console.error("SSG 마커를 찾지 못했습니다:", startMark, endMark);
    process.exit(1);
  }
  return src.slice(0, s + startMark.length) + "\n" + inner + "\n    " + src.slice(e);
}

const pickInner = `    <section id="pick">${pickOut}</section>`;
const gridInner =
  `    <div class="grid" id="grid">${gridOut}</div>\n\n` +
  `    <!-- 판매 종료 (컴팩트) -->\n` +
  `    <div id="soldSection">${soldOut}</div>`;

let out = html;
out = injectBetween(out, "<!--SSG:PICK-->", "<!--/SSG:PICK-->", pickInner);
out = injectBetween(out, "<!--SSG:GRID-->", "<!--/SSG:GRID-->", gridInner);

// (1) index.html 자체에 베이크(in-place) → Git 연동 Worker가 사전렌더본을 서빙
fs.writeFileSync(SRC, out, "utf8");
// (2) dist/ 에도 출력 → Pages(ge-uk) 배포용
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), out, "utf8");
console.log(`사전 렌더 완료: index.html(in-place) + dist/index.html (판매중 ${onSale.length} · 판매종료 ${sold.length} · PICK ${pick ? pick.typeName + " " + pick.episode + "회" : "없음"})`);

// ============================================================
//  종류별 전용 페이지 (스피또2000/1000/500) — 검색 진입점 + 광고 인벤토리
// ============================================================
const STYLE = (html.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
const ADSENSE = "ca-pub-6037343600471239";
const AD_SLOT = "5042804616";
const GA_ID = "G-ZG2KZYHQBL";
const NAV_LOGO = (html.match(/<svg class="logo"[\s\S]*?<\/svg>/) || ['<svg class="logo" viewBox="0 0 40 40"></svg>'])[0];

const TYPE_META = {
  SP2000: {
    path: "2000", price: 2000, prize: "10억 원", per1: "6~8매",
    title: "스피또2000 출고율·당첨율 실시간 | 1등 10억 남은 회차 - 긁",
    desc: "스피또2000(2,000원·1등 최고 10억) 회차별 출고율과 등위별 잔여 당첨매수를 실시간 조회. 1등이 가장 많이 남은 스피또2000 회차를 추천 지수로 확인하세요.",
    keywords: "스피또2000, 스피또2000 출고율, 스피또2000 당첨율, 스피또2000 1등, 스피또2000 당첨금, 스피또2000 추천 회차, 즉석복권",
    intro: "스피또2000은 동행복권 즉석복권 중 <b>1등 당첨금이 가장 큰(최고 10억 원)</b> 게임입니다. 한 장 2,000원이며, 회차당 1등은 보통 6~8매가 발행돼요. ‘긁?’은 각 회차의 출고율과 1·2·3등 잔여 당첨을 실시간 추적해, <b>1등이 아직 많이 남은 스피또2000 회차</b>를 콕 집어 드립니다.",
    tip: "출고율(시중에 풀린 비율)이 높은데도 1등 잔여가 많은 회차일수록, 아직 안 나온 1등이 시중에 있을 가능성이 큽니다. 위 추천 지수가 높은 회차를 노려보세요.",
    faq: [
      ["스피또2000 1등 당첨금은 얼마인가요?", "스피또2000의 1등 당첨금은 최고 10억 원으로, 스피또 시리즈 중 가장 큽니다. 한 장 가격은 2,000원입니다."],
      ["스피또2000은 어디서 사나요?", "전국 동행복권 복권판매점에서 구매할 수 있는 즉석복권(스크래치)입니다. 긁어서 바로 당첨을 확인합니다."],
      ["스피또2000 출고율이 뭔가요?", "발행된 복권 중 판매점으로 출고된 비율입니다. 출고율이 높은데 1등이 많이 남았다면, 당첨 기회가 더 남아있다는 신호로 볼 수 있어요."],
    ],
  },
  SP1000: {
    path: "1000", price: 1000, prize: "5억 원", per1: "9~12매",
    title: "스피또1000 출고율·당첨율 실시간 | 1등 5억 남은 회차 - 긁",
    desc: "스피또1000(1,000원·1등 최고 5억) 회차별 출고율과 등위별 잔여 당첨매수를 실시간 조회. 가성비 좋은 스피또1000에서 1등이 많이 남은 회차를 추천 지수로 확인하세요.",
    keywords: "스피또1000, 스피또1000 출고율, 스피또1000 당첨율, 스피또1000 1등, 스피또1000 당첨금, 스피또1000 추천 회차, 즉석복권",
    intro: "스피또1000은 한 장 <b>1,000원</b>으로 부담 없이 즐기는 스피또입니다. 1등 최고 당첨금은 5억 원이고, 회차당 1등이 9~12매로 스피또2000보다 많이 발행돼 <b>당첨 빈도와 가성비</b>가 좋아요. 출고율이 낮은 초기 회차일수록 고액 당첨이 그대로 남아있을 가능성이 높습니다.",
    tip: "초기 회차(출고율 낮음)일수록 1등이 통째로 남아있는 경우가 많아요. 추천 지수와 1등 잔여율을 함께 보고 고르세요.",
    faq: [
      ["스피또1000 1등 당첨금은 얼마인가요?", "스피또1000의 1등 당첨금은 최고 5억 원이며, 한 장 가격은 1,000원입니다."],
      ["스피또1000과 2000의 차이는?", "가격(1,000원 vs 2,000원)과 1등 당첨금(5억 vs 10억)이 다릅니다. 스피또1000은 1등 발행 매수가 더 많아 당첨 빈도가 높은 편입니다."],
      ["스피또1000 출고율은 어떻게 보나요?", "출고율은 판매점에 풀린 비율입니다. ‘긁?’에서 회차별 출고율과 1·2·3등 잔여 매수를 실시간으로 확인할 수 있어요."],
    ],
  },
  SP500: {
    path: "500", price: 500, prize: "2억 원", per1: "2~5매",
    title: "스피또500 출고율·당첨율 실시간 | 1등 2억 남은 회차 - 긁",
    desc: "스피또500(500원·1등 최고 2억) 회차별 출고율과 등위별 잔여 당첨매수를 실시간 조회. 단돈 500원으로 즐기는 스피또500에서 1등 남은 회차를 추천 지수로 확인하세요.",
    keywords: "스피또500, 스피또500 출고율, 스피또500 당첨율, 스피또500 1등, 스피또500 당첨금, 스피또500 추천 회차, 즉석복권",
    intro: "스피또500은 <b>단돈 500원</b>으로 시작하는 가장 가벼운 스피또입니다. 1등 최고 당첨금은 2억 원으로, 적은 금액으로 즉석복권의 재미를 보기 좋아요. 발행 매수가 적어 출고율 변화에 따라 잔여 1등 비율이 빠르게 바뀌므로, <b>판매 초반 회차</b>를 노리는 전략이 유효합니다.",
    tip: "발행량이 적어 1등이 금방 빠지기도, 끝까지 남기도 해요. 출고율 대비 1등 잔여율이 높은 회차가 유리합니다.",
    faq: [
      ["스피또500 1등 당첨금은 얼마인가요?", "스피또500의 1등 당첨금은 최고 2억 원이며, 한 장 가격은 500원입니다."],
      ["스피또500은 가성비가 좋나요?", "단돈 500원으로 즐길 수 있어 부담이 가장 적습니다. 다만 발행 매수가 적어 회차별 잔여 당첨을 확인하고 사는 것이 좋아요."],
      ["스피또500 당첨 확인은 어떻게 하나요?", "현장에서 긁어 바로 확인하는 즉석복권입니다. ‘긁?’에서는 회차별 출고율과 남은 당첨을 실시간으로 보여드려요."],
    ],
  },
};

function adUnit() {
  return `<div class="ad"><div class="lbl">광고</div><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE}" data-ad-slot="${AD_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins></div>`;
}

function gamePage(typeCd) {
  const m = TYPE_META[typeCd];
  const name = ({ SP2000: "스피또2000", SP1000: "스피또1000", SP500: "스피또500" })[typeCd];
  const list = games.filter((g) => g.typeCd === typeCd);
  const on = list.filter((g) => g.status === "판매중");
  const sd = list.filter((g) => g.status !== "판매중");
  const tPick = on.filter((g) => g.recommendScore != null).sort((a, b) => b.recommendScore - a.recommendScore)[0];
  const avgShip = on.length ? Math.round(on.reduce((a, g) => a + (g.shipmentRate || 0), 0) / on.length) : 0;
  const remain1 = on.reduce((a, g) => a + ((g.rank1 && g.rank1.remain) || 0), 0);
  const url = `https://ge-uk.com/${m.path}`;

  const faqLd = m.faq.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const ld = `{"@context":"https://schema.org","@graph":[
    {"@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"긁?","item":"https://ge-uk.com/"},
      {"@type":"ListItem","position":2,"name":${JSON.stringify(name)},"item":${JSON.stringify(url)}}]},
    {"@type":"WebPage","url":${JSON.stringify(url)},"name":${JSON.stringify(m.title)},"inLanguage":"ko-KR"},
    {"@type":"FAQPage","mainEntity":[${faqLd}]}]}`;

  const statStrip = `<div class="stats">
    <div class="stat"><div class="k">🎟️ 판매중 회차</div><div class="v">${on.length}<small>개</small></div><div class="s">${name} 기준</div></div>
    <div class="stat"><div class="k">📦 평균 출고율</div><div class="v">${avgShip}<small>%</small></div><div class="s">판매중 회차 평균</div></div>
    <div class="stat"><div class="k">🏆 남은 1등</div><div class="v">${fmt(remain1)}<small>매</small></div><div class="s">아직 안 나온 1등 합계</div></div>
  </div>`;

  const pickBlock = tPick ? `<div class="section-h"><h2>${name} 추천 회차</h2><span class="desc">추천 지수 1위</span></div><section>${pickHTML(tPick)}</section>` : "";
  const gridBlock = on.length
    ? `<div class="section-h"><h2>판매중인 ${name} 회차</h2><span class="desc">출고율·등위별 잔여 당첨</span></div><div class="grid">${on.map(cardHTML).join("")}</div>`
    : `<div class="section-h"><h2>판매중인 ${name} 회차</h2></div><p class="empty">현재 판매중인 ${name} 회차가 없어요.</p>`;
  const soldBlock = sd.length
    ? `<div class="divider">지난 ${name} 회차 <span class="n">${sd.length}개</span></div><div class="sold-list">${sd.map(soldDetailsHTML).join("")}</div>`
    : "";

  const others = Object.keys(TYPE_META).filter((t) => t !== typeCd)
    .map((t) => `<a class="tbtn" href="/${TYPE_META[t].path}">${({ SP2000: "스피또2000", SP1000: "스피또1000", SP500: "스피또500" })[t]} →</a>`).join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${m.title}</title>
<meta name="description" content="${m.desc}" />
<meta name="keywords" content="${m.keywords}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<meta name="theme-color" content="#0071e3" />
<link rel="canonical" href="${url}" />
<meta name="google-adsense-account" content="${ADSENSE}" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/favicon.svg" />
<link rel="manifest" href="/site.webmanifest" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="긁?" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:title" content="${m.title}" />
<meta property="og:description" content="${m.desc}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="https://ge-uk.com/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${m.title}" />
<meta name="twitter:description" content="${m.desc}" />
<meta name="twitter:image" content="https://ge-uk.com/og-image.png" />
<script type="application/ld+json">${ld}</script>
${STYLE}
</head>
<body>
  <div class="nav"><div class="wrap row">
    <a class="brand" href="/" style="text-decoration:none">
      ${NAV_LOGO}
      <span class="name">긁</span>
    </a>
    <div class="right"><a class="share" href="/" style="font-weight:700">← 전체 보기</a></div>
  </div></div>

  <div class="wrap">
    <section class="hero" style="padding:56px 0 32px">
      <span class="eyebrow">🎯 동행복권 공식 데이터 기반</span>
      <h1 style="font-size:clamp(30px,5.4vw,52px)">${name} 출고율·당첨율</h1>
      <p>${m.intro}</p>
    </section>

    ${statStrip}

    ${adUnit()}

    ${pickBlock}

    ${gridBlock}

    ${adUnit()}

    ${soldBlock}

    <section class="ginfo">
      <div class="section-h"><h2>${name}, 이렇게 공략하세요</h2></div>
      <p class="lead">${m.tip}</p>
      <div class="itable-wrap">
        <table class="itable"><tbody>
          <tr><td class="tg">한 장 가격</td><td>${fmt(m.price)}원</td></tr>
          <tr><td class="tg">1등 최고 당첨금</td><td class="tprize">${m.prize}</td></tr>
          <tr><td class="tg">회차당 1등 발행</td><td>${m.per1}</td></tr>
        </tbody></table>
      </div>
    </section>

    <section class="faq">
      <div class="section-h"><h2>${name} 자주 묻는 질문</h2></div>
      <div class="list">
        ${m.faq.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${q}<span class="chev">⌄</span></summary><div class="ans">${a}</div></details>`).join("")}
      </div>
    </section>

    <div class="section-h"><h2>다른 스피또도 보기</h2></div>
    <div class="toolbar">${others}<a class="tbtn" href="/">전체 한눈에 보기 →</a></div>
  </div>

  <footer><div class="wrap in">
    <div>
      <div class="brand" style="display:flex;align-items:center;gap:10px;font-weight:900">${NAV_LOGO} 긁</div>
      <p class="disc" style="margin-top:12px;font-weight:600;color:var(--ink2)">긁기 전에 보는 스피또 출고율·당첨율</p>
      <p class="disc" style="margin-top:4px">데이터 출처: <a href="https://www.dhlottery.co.kr/st/pblcnDsctn" target="_blank" rel="noopener">동행복권 발행내역 ↗</a></p>
    </div>
    <p class="disc">본 사이트는 동행복권과 무관한 비공식 정보 제공 페이지입니다. 데이터는 자동 수집되며 정확성을 보장하지 않습니다. 과도한 구매는 삼가주세요.</p>
  </div></footer>

<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');
  document.querySelectorAll('ins.adsbygoogle').forEach(function(){try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}});
</script>
</body>
</html>`;
}

Object.keys(TYPE_META).forEach((t) => {
  const pageHtml = gamePage(t);
  const file = TYPE_META[t].path + ".html";
  fs.writeFileSync(path.join(__dirname, file), pageHtml, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, file), pageHtml, "utf8");
});
console.log(`종류별 페이지 생성: ${Object.values(TYPE_META).map((m) => "/" + m.path).join(", ")}`);
