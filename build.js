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
  `    <!-- AD: 인피드(판매중 카드 바로 아래) — render()가 #grid/#soldSection 만 갱신하므로 이 광고는 보존됨 -->\n` +
  `    <div class="ad" data-ad-slot-key="feed"><div class="lbl">광고</div><div class="slot"></div></div>\n\n` +
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

// ============================================================
//  가이드 글 (검색 유입 + 상업 키워드 → 광고 단가 유리)
// ============================================================
const GUIDES = [
  {
    slug: "guide-tax", cat: "세금", emoji: "🧾",
    title: "복권 당첨금 세금 총정리 — 스피또 실수령액 계산 | 긁",
    desc: "복권·스피또 당첨금 세금(제세금) 세율과 실수령액 계산법. 5만원 이하 비과세, 3억 이하 22%, 3억 초과 33%. 스피또2000·1000·500 1등 실수령액 예시까지.",
    keywords: "복권 세금, 복권 당첨금 세금, 스피또 세금, 복권 실수령액, 당첨금 제세금, 복권 세율, 로또 세금",
    h1: "복권 당첨금 세금, 얼마나 떼일까?",
    lead: "스피또를 포함한 복권 당첨금에는 ‘기타소득세’가 붙습니다. 얼마를 떼고 실제로 얼마를 받는지, 구간별 세율과 스피또 1등 실수령액 예시로 정리했어요.",
    body:
      "<h2>복권 당첨금 세율 (제세금)</h2>" +
      "<p>복권 당첨금은 당첨금액 구간에 따라 세율이 다릅니다. (소득세 + 지방소득세 합산 기준)</p>" +
      "<div class=\"itable-wrap\"><table class=\"itable\"><thead><tr><th>당첨금 구간</th><th>세율</th><th>구성</th></tr></thead><tbody>" +
      "<tr><td class=\"tg\">5만 원 이하</td><td class=\"tprize\">비과세</td><td>세금 없음</td></tr>" +
      "<tr><td class=\"tg\">5만 원 초과 ~ 3억 원 이하</td><td class=\"tprize\">22%</td><td>소득세 20% + 지방세 2%</td></tr>" +
      "<tr><td class=\"tg\">3억 원 초과분</td><td class=\"tprize\">33%</td><td>소득세 30% + 지방세 3%</td></tr>" +
      "</tbody></table></div>" +
      "<p>즉 3억 원까지는 22%, <b>3억 원을 넘는 부분</b>에만 33%가 적용됩니다.</p>" +
      "<h2>스피또 1등 실수령액 예시</h2>" +
      "<p>위 세율로 계산한 대략적인 실수령액입니다. (참고용 추정치)</p>" +
      "<div class=\"itable-wrap\"><table class=\"itable\"><thead><tr><th>게임</th><th>1등 당첨금</th><th>세금(추정)</th><th>실수령(추정)</th></tr></thead><tbody>" +
      "<tr><td class=\"tg\">스피또500</td><td>2억 원</td><td>약 4,400만 원</td><td class=\"tprize\">약 1억 5,600만 원</td></tr>" +
      "<tr><td class=\"tg\">스피또1000</td><td>5억 원</td><td>약 1억 3,200만 원</td><td class=\"tprize\">약 3억 6,800만 원</td></tr>" +
      "<tr><td class=\"tg\">스피또2000</td><td>10억 원</td><td>약 2억 9,700만 원</td><td class=\"tprize\">약 7억 300만 원</td></tr>" +
      "</tbody></table></div>" +
      "<p style=\"color:var(--muted);font-size:13.5px\">※ 위 금액은 구간별 세율을 단순 적용한 추정치이며, 실제 공제·지급 방식은 다를 수 있습니다. 정확한 세금·수령 절차는 <a href=\"https://www.dhlottery.co.kr\" target=\"_blank\" rel=\"noopener\">동행복권 공식 안내</a>를 확인하세요.</p>",
    faq: [
      ["복권 당첨금은 무조건 세금을 내나요?", "5만 원 이하 당첨금은 비과세로 세금이 없습니다. 5만 원을 초과하면 기타소득세가 부과됩니다."],
      ["스피또 1등도 세금을 떼나요?", "네. 스피또 1등은 고액이라 3억 원까지 22%, 3억 원 초과분은 33%가 적용됩니다. 예를 들어 스피또2000 1등 10억 원의 실수령액은 약 7억 원 안팎입니다."],
      ["세금은 어떻게 납부하나요?", "고액 당첨금은 수령 시 원천징수되어, 세금을 뗀 금액을 지급받습니다. 별도로 신고·납부할 필요는 없는 것이 일반적입니다."],
    ],
  },
  {
    slug: "guide-prize", cat: "수령", emoji: "🏦",
    title: "복권 당첨금 수령 방법 — 어디서, 무엇을 챙길까 | 긁",
    desc: "스피또·복권 당첨금 수령 방법 총정리. 소액은 판매점, 고액은 농협은행·동행복권 본사에서 신분증 지참 후 수령. 즉석복권 지급기한(1년)까지 꼭 확인하세요.",
    keywords: "복권 당첨금 수령, 복권 당첨 수령방법, 스피또 당첨금, 복권 지급기한, 즉석복권 당첨, 복권 당첨 어디서",
    h1: "복권 당첨금, 어디서 어떻게 받나?",
    lead: "당첨금 액수에 따라 받는 곳이 다릅니다. 스피또(즉석복권) 기준으로 수령처와 준비물, 그리고 놓치면 안 되는 ‘지급기한’까지 정리했어요.",
    body:
      "<h2>금액별 수령처</h2>" +
      "<ul class=\"glist\">" +
      "<li><b>소액(보통 5만 원 이하)</b> — 복권을 산 판매점이나 가까운 복권 판매점에서 바로 수령</li>" +
      "<li><b>중간 금액</b> — NH농협은행 영업점에서 수령 (지점에 따라 한도 상이)</li>" +
      "<li><b>고액(1등 등)</b> — 동행복권 본사(서울) 또는 지정 지급기관에서 수령</li>" +
      "</ul>" +
      "<h2>수령 시 준비물</h2>" +
      "<ul class=\"glist\"><li>당첨 복권 원본 (훼손·분실 주의)</li><li>신분증(주민등록증·운전면허증 등)</li><li>본인 명의 통장(고액 계좌 입금 시)</li></ul>" +
      "<h2>⏰ 지급기한을 꼭 확인하세요</h2>" +
      "<p>스피또(즉석복권)는 <b>지급기한이 정해져 있어</b>, 기한이 지나면 당첨금을 받을 수 없습니다. 보통 판매 종료(또는 발행) 시점 기준으로 <b>약 1년</b>입니다. ‘긁?’의 각 회차 카드에서 <b>지급기한</b>을 확인할 수 있어요.</p>" +
      "<p style=\"color:var(--muted);font-size:13.5px\">※ 수령처·한도·절차는 변경될 수 있으니 <a href=\"https://www.dhlottery.co.kr\" target=\"_blank\" rel=\"noopener\">동행복권 공식 안내</a>를 확인하세요. 미성년자는 복권 구매·수령이 불가합니다.</p>",
    faq: [
      ["복권 1등은 어디서 받나요?", "고액 당첨금은 동행복권 본사 또는 지정 지급기관에서 신분증과 당첨 복권을 지참해 수령합니다. 소액은 판매점이나 농협은행에서 받을 수 있습니다."],
      ["스피또 당첨금에도 기한이 있나요?", "네. 즉석복권은 지급기한(보통 약 1년)이 지나면 당첨금을 받을 수 없습니다. 회차별 지급기한을 꼭 확인하세요."],
      ["당첨 복권을 잃어버리면 어떻게 되나요?", "복권은 무기명 유가증권이라 원본이 없으면 수령이 어렵습니다. 당첨이 확인되면 복권을 안전하게 보관하세요."],
    ],
  },
  {
    slug: "guide-how", cat: "입문", emoji: "🎫",
    title: "스피또란? 종류·구매·당첨 확인 완전정복 | 긁",
    desc: "스피또(즉석복권) 입문 가이드. 스피또2000·1000·500 종류와 가격·당첨금, 구매 방법, 당첨 확인법, 그리고 출고율로 똑똑하게 고르는 법까지.",
    keywords: "스피또, 스피또란, 즉석복권, 스피또 종류, 스피또 사는법, 스피또 당첨 확인, 스피또 출고율",
    h1: "스피또, 처음이라면 여기부터",
    lead: "스피또는 긁어서 바로 당첨을 확인하는 동행복권의 즉석복권(스크래치)입니다. 종류와 사는 법, 똑똑하게 고르는 법까지 한 번에 정리했어요.",
    body:
      "<h2>스피또 종류</h2>" +
      "<p>가격과 1등 당첨금에 따라 세 가지로 나뉩니다.</p>" +
      "<div class=\"itable-wrap\"><table class=\"itable\"><thead><tr><th>종류</th><th>가격</th><th>1등 최고</th><th>자세히</th></tr></thead><tbody>" +
      "<tr><td class=\"tg\">스피또2000</td><td>2,000원</td><td class=\"tprize\">10억 원</td><td><a href=\"/2000\">회차 보기 →</a></td></tr>" +
      "<tr><td class=\"tg\">스피또1000</td><td>1,000원</td><td class=\"tprize\">5억 원</td><td><a href=\"/1000\">회차 보기 →</a></td></tr>" +
      "<tr><td class=\"tg\">스피또500</td><td>500원</td><td class=\"tprize\">2억 원</td><td><a href=\"/500\">회차 보기 →</a></td></tr>" +
      "</tbody></table></div>" +
      "<h2>사는 법 &amp; 당첨 확인</h2>" +
      "<ul class=\"glist\"><li>전국 복권 판매점에서 <b>즉석 구매</b></li><li>덮인 부분을 <b>긁어서 즉시</b> 당첨 확인</li><li>당첨 시 금액에 따라 판매점·농협·동행복권에서 수령 (<a href=\"/guide-prize\">수령 방법 보기</a>)</li></ul>" +
      "<h2>출고율로 똑똑하게 고르기</h2>" +
      "<p>즉석복권은 ‘어떤 회차를 긁느냐’가 중요합니다. <b>출고율</b>(시중에 풀린 비율)이 높은데도 <b>1등이 아직 많이 남은</b> 회차일수록, 안 나온 고액 당첨이 시중에 있을 가능성이 큽니다. ‘긁?’ 메인에서 회차별 출고율·잔여 당첨·추천 지수를 확인하세요.</p>" +
      "<p><a class=\"idetail\" href=\"/\">회차별 출고율 한눈에 보기 →</a></p>",
    faq: [
      ["스피또는 어떻게 사나요?", "전국 동행복권 복권판매점에서 즉석으로 구매하고, 덮인 부분을 긁어 바로 당첨을 확인하는 즉석복권입니다."],
      ["스피또 종류는 무엇이 있나요?", "스피또2000(2,000원·1등 10억), 스피또1000(1,000원·1등 5억), 스피또500(500원·1등 2억) 세 가지가 있습니다."],
      ["출고율이 높으면 좋은 건가요?", "출고율은 시중에 풀린 비율입니다. 출고율이 높은데도 1등이 많이 남았다면 당첨 기회가 더 남아있다는 신호로 볼 수 있어요."],
    ],
  },
  {
    slug: "guide-lucky", cat: "명당", emoji: "📍",
    title: "복권 명당, 진짜 효과 있을까? 데이터로 보는 합리적 선택 | 긁",
    desc: "복권 명당의 의미와 통계적 진실. 1등 많이 나온 명당의 비밀과, 즉석복권에서는 명당보다 ‘회차 선택(출고율·잔여 당첨)’이 더 중요한 이유를 설명합니다.",
    keywords: "복권 명당, 로또 명당, 복권 1등 명당, 스피또 명당, 복권 잘 나오는 곳, 명당 효과",
    h1: "복권 명당, 정말 효과가 있을까?",
    lead: "‘1등이 많이 나온 명당’ 이야기는 늘 화제죠. 명당의 통계적 의미와, 스피또(즉석복권)에서 더 중요한 합리적 선택 기준을 짚어봤어요.",
    body:
      "<h2>명당의 비밀 — 대부분은 ‘판매량’ 효과</h2>" +
      "<p>1등이 자주 나오는 판매점은 대개 <b>판매량 자체가 많은 곳</b>입니다. 많이 팔수록 1등이 나올 확률도 비례해서 커지죠. 즉 명당이라서 잘 나온다기보다, 많이 팔려서 그만큼 1등도 자주 나오는 ‘표본 효과’인 경우가 많습니다.</p>" +
      "<h2>즉석복권은 ‘어디’보다 ‘어떤 회차’</h2>" +
      "<p>스피또 같은 즉석복권은 추첨식과 달리 <b>이미 당첨이 정해진 복권이 회차별로 발행</b>됩니다. 그래서 명당보다 중요한 건, <b>1등이 아직 많이 남은 회차를 고르는 것</b>이에요.</p>" +
      "<ul class=\"glist\"><li><b>출고율</b>이 높은데 <b>1등 잔여</b>가 많다 → 안 나온 1등이 시중에 있을 가능성↑</li><li>반대로 출고율이 높고 1등이 다 빠졌다 → 굳이 그 회차를 살 이유가 적음</li></ul>" +
      "<p>‘긁?’은 바로 이 정보를 회차별로 실시간 추적해, 합리적으로 고를 수 있게 도와줘요.</p>" +
      "<p><a class=\"idetail\" href=\"/\">1등 많이 남은 회차 보기 →</a></p>" +
      "<p style=\"color:var(--muted);font-size:13.5px\">※ 복권은 확률 게임이며, 어떤 방법도 당첨을 보장하지 않습니다. 과도한 구매는 삼가세요.</p>",
    faq: [
      ["복권 명당은 정말 효과가 있나요?", "1등이 자주 나오는 곳은 대부분 판매량이 많은 곳입니다. 많이 팔릴수록 1등도 비례해 자주 나오는 표본 효과인 경우가 많아, ‘명당이라 잘 나온다’고 보긴 어렵습니다."],
      ["스피또도 명당이 중요한가요?", "즉석복권은 회차별로 당첨이 정해져 발행되므로, 어디서 사느냐보다 1등이 많이 남은 회차를 고르는 것이 더 합리적입니다."],
      ["1등 많이 남은 회차는 어떻게 아나요?", "‘긁?’에서 회차별 출고율과 등위별 잔여 당첨매수를 실시간으로 확인할 수 있습니다."],
    ],
  },
];

function guidePage(g) {
  const url = `https://ge-uk.com/${g.slug}`;
  const faqLd = g.faq.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",");
  const ld = `{"@context":"https://schema.org","@graph":[
    {"@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"긁?","item":"https://ge-uk.com/"},
      {"@type":"ListItem","position":2,"name":"가이드","item":"https://ge-uk.com/guide"},
      {"@type":"ListItem","position":3,"name":${JSON.stringify(g.cat)},"item":${JSON.stringify(url)}}]},
    {"@type":"Article","headline":${JSON.stringify(g.title)},"description":${JSON.stringify(g.desc)},"inLanguage":"ko-KR","mainEntityOfPage":${JSON.stringify(url)},"publisher":{"@type":"Organization","name":"긁?","url":"https://ge-uk.com/"}},
    {"@type":"FAQPage","mainEntity":[${faqLd}]}]}`;
  const related = GUIDES.filter((x) => x.slug !== g.slug)
    .map((x) => `<a class="tbtn" href="/${x.slug}">${x.emoji} ${x.cat} 가이드 →</a>`).join("");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${g.title}</title>
<meta name="description" content="${g.desc}" />
<meta name="keywords" content="${g.keywords}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<meta name="theme-color" content="#0071e3" />
<link rel="canonical" href="${url}" />
<meta name="google-adsense-account" content="${ADSENSE}" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="/site.webmanifest" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="긁?" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:title" content="${g.title}" />
<meta property="og:description" content="${g.desc}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="https://ge-uk.com/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${g.title}" />
<meta name="twitter:description" content="${g.desc}" />
<script type="application/ld+json">${ld}</script>
${STYLE}
<style>
  .glist{display:grid;gap:10px;margin:14px 0;padding:0;list-style:none}
  .glist li{position:relative;padding-left:26px;font-size:15px;color:var(--ink2);line-height:1.7}
  .glist li::before{content:"✓";position:absolute;left:0;top:0;color:var(--brand);font-weight:800}
  .article h2{font-size:clamp(20px,3vw,26px);font-weight:700;letter-spacing:-.02em;margin:34px 0 12px}
  .article p{font-size:15.5px;color:var(--ink2);line-height:1.8;margin:10px 0}
  .article b{color:var(--ink);font-weight:700}
  .article a{color:var(--brand-ink);font-weight:600;text-decoration:none}
  .crumb{font-size:13px;color:var(--muted);font-weight:600;margin:6px 2px 0}
  .crumb a{color:var(--muted);text-decoration:none}
</style>
</head>
<body>
  <div class="nav"><div class="wrap row">
    <a class="brand" href="/" style="text-decoration:none">${NAV_LOGO}<span class="name">긁</span></a>
    <div class="right"><a class="share" href="/guide" style="font-weight:700">가이드 전체</a></div>
  </div></div>

  <div class="wrap">
    <p class="crumb"><a href="/">홈</a> › <a href="/guide">가이드</a> › ${g.cat}</p>
    <section class="hero" style="padding:36px 0 22px;text-align:left">
      <span class="eyebrow">${g.emoji} 스피또·복권 가이드</span>
      <h1 style="font-size:clamp(28px,5vw,46px);max-width:none;margin:16px 0 14px;text-align:left">${g.h1}</h1>
      <p style="margin:0;max-width:60ch;text-align:left">${g.lead}</p>
    </section>

    ${adUnit()}

    <article class="article ginfo">${g.body}</article>

    ${adUnit()}

    <section class="faq">
      <div class="section-h"><h2>자주 묻는 질문</h2></div>
      <div class="list">
        ${g.faq.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${q}<span class="chev">⌄</span></summary><div class="ans">${a}</div></details>`).join("")}
      </div>
    </section>

    <div class="section-h"><h2>다른 가이드</h2></div>
    <div class="toolbar">${related}<a class="tbtn" href="/">전체 회차 보기 →</a></div>
  </div>

  <footer><div class="wrap in">
    <div>
      <div class="brand" style="display:flex;align-items:center;gap:10px;font-weight:900">${NAV_LOGO} 긁</div>
      <p class="disc" style="margin-top:12px;font-weight:600;color:var(--ink2)">긁기 전에 보는 스피또 출고율·당첨율</p>
    </div>
    <p class="disc">본 사이트는 동행복권과 무관한 비공식 정보 제공 페이지입니다. 세금·수령 등 정보는 참고용이며 정확한 내용은 동행복권 공식 안내를 확인하세요. 과도한 구매는 삼가주세요.</p>
  </div></footer>

<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');
  document.querySelectorAll('ins.adsbygoogle').forEach(function(){try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}});
</script>
</body>
</html>`;
}

function guideHub() {
  const url = "https://ge-uk.com/guide";
  const cards = GUIDES.map((g) =>
    `<a class="gcard" href="/${g.slug}" style="text-decoration:none;display:block">
      <div class="gi a" style="font-size:22px">${g.emoji}</div>
      <h4>${g.cat} 가이드</h4>
      <p>${g.lead}</p>
      <span class="idetail" style="margin-top:12px">읽어보기 →</span>
    </a>`).join("");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>스피또·복권 가이드 — 세금·수령·명당·입문 | 긁</title>
<meta name="description" content="스피또·복권을 더 잘 즐기는 가이드 모음. 당첨금 세금·실수령액, 당첨금 수령 방법, 복권 명당의 진실, 스피또 입문까지." />
<meta name="keywords" content="복권 가이드, 스피또 가이드, 복권 세금, 복권 당첨금 수령, 복권 명당, 스피또란" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<meta name="theme-color" content="#0071e3" />
<link rel="canonical" href="${url}" />
<meta name="google-adsense-account" content="${ADSENSE}" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="/site.webmanifest" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="긁?" />
<meta property="og:title" content="스피또·복권 가이드 | 긁" />
<meta property="og:description" content="당첨금 세금·수령·명당·입문까지, 스피또를 더 잘 즐기는 가이드 모음." />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="https://ge-uk.com/og-image.png" />
${STYLE}
</head>
<body>
  <div class="nav"><div class="wrap row">
    <a class="brand" href="/" style="text-decoration:none">${NAV_LOGO}<span class="name">긁</span></a>
    <div class="right"><a class="share" href="/" style="font-weight:700">← 전체 보기</a></div>
  </div></div>
  <div class="wrap">
    <section class="hero" style="padding:48px 0 24px">
      <span class="eyebrow">📚 스피또·복권 가이드</span>
      <h1 style="font-size:clamp(30px,5.4vw,50px)">알고 긁으면 더 똑똑하다</h1>
      <p>세금·수령·명당·입문까지, 스피또를 더 잘 즐기는 데 필요한 정보만 모았어요.</p>
    </section>
    ${adUnit()}
    <section class="guide"><div class="cards">${cards}</div></section>
  </div>
  <footer><div class="wrap in">
    <div><div class="brand" style="display:flex;align-items:center;gap:10px;font-weight:900">${NAV_LOGO} 긁</div>
    <p class="disc" style="margin-top:12px;font-weight:600;color:var(--ink2)">긁기 전에 보는 스피또 출고율·당첨율</p></div>
    <p class="disc">본 사이트는 동행복권과 무관한 비공식 정보 제공 페이지입니다. 정보는 참고용입니다.</p>
  </div></footer>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');
document.querySelectorAll('ins.adsbygoogle').forEach(function(){try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}});</script>
</body>
</html>`;
}

fs.writeFileSync(path.join(__dirname, "guide.html"), guideHub(), "utf8");
fs.writeFileSync(path.join(OUT_DIR, "guide.html"), guideHub(), "utf8");
GUIDES.forEach((g) => {
  const pg = guidePage(g);
  fs.writeFileSync(path.join(__dirname, g.slug + ".html"), pg, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, g.slug + ".html"), pg, "utf8");
});
console.log(`가이드 생성: /guide + ${GUIDES.map((g) => "/" + g.slug).join(", ")}`);
