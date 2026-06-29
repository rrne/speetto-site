#!/usr/bin/env node
/**
 * 텔레그램 채널 다이제스트 — 리텐션 채널.
 *
 * 정적 사이트(Cloudflare Pages)는 웹푸시용 백엔드를 둘 수 없으므로,
 * 이미 3시간마다 도는 GitHub Action에서 텔레그램 봇으로 알림을 쏜다.
 *
 *  - 새 회차 발매 → 즉시 1회 알림
 *  - 하루 1회 → 추천 1순위 + 마감 임박(D-7 이내) 다이제스트
 *
 * 환경변수 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 없으면 아무 일도 하지 않는다(no-op).
 * 어떤 오류가 나도 배포 파이프라인을 막지 않도록 항상 정상 종료한다.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
if (!TOKEN || !CHAT) {
  console.log("텔레그램 시크릿(TELEGRAM_BOT_TOKEN/CHAT_ID) 없음 — 알림 생략(no-op)");
  process.exit(0);
}

const SITE = "https://ge-uk.com";
const TPATH = { SP2000: "2000", SP1000: "1000", SP500: "500" };
const fmt = (n) => (n == null ? "-" : n.toLocaleString("ko-KR"));

function send(text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true });
    const req = https.request(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (r) => { r.on("data", () => {}); r.on("end", resolve); }
    );
    req.on("error", (e) => { console.log("텔레그램 전송 오류:", e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));
    const ST = path.join(__dirname, "telegram-state.json");
    let st = { seen: [], lastDigest: "" };
    try { st = JSON.parse(fs.readFileSync(ST, "utf8")); } catch (e) {}
    const seen = new Set(st.seen || []);

    const onSale = (data.games || []).filter((g) => g.status === "판매중");
    const link = (g) => `${SITE}/${TPATH[g.typeCd]}-${g.episode}`;

    // ① 새 회차 발매 즉시 알림
    let newCount = 0;
    for (const g of onSale) {
      const k = `${g.typeCd}-${g.episode}`;
      if (seen.has(k)) continue;
      seen.add(k);
      newCount++;
      // 첫 실행(seen 비어있음)에는 폭탄 방지를 위해 알림 없이 seed만
      if (!st.seen || !st.seen.length) continue;
      await send(
        `🆕 <b>새 회차 발매</b>\n${g.typeName} ${g.episode}회\n` +
        `한 장 ${fmt(g.price)}원 · 1등 ${g.rank1 && g.rank1.prize ? g.rank1.prize : "-"}\n` +
        `👉 <a href="${link(g)}">출고율·잔여 보기</a>`
      );
    }

    // ② 하루 1회 다이제스트 (UTC 날짜 기준)
    const today = new Date().toISOString().slice(0, 10);
    if (st.lastDigest !== today && onSale.length) {
      const pick = onSale.filter((g) => g.recommendScore != null).sort((a, b) => b.recommendScore - a.recommendScore)[0];
      const soon = onSale
        .filter((g) => g.saleEndDate)
        .map((g) => ({ g, d: Math.ceil((new Date(g.saleEndDate + "T23:59:59") - Date.now()) / 86400000) }))
        .filter((x) => x.d >= 0 && x.d <= 7)
        .sort((a, b) => a.d - b.d);

      let msg = `📊 <b>오늘의 스피또 추천</b>\n`;
      if (pick) {
        const r1 = pick.rank1 || {};
        msg += `\n⭐ <b>${pick.typeName} ${pick.episode}회</b> (추천지수 ${pick.recommendScore})\n` +
          `출고율 ${pick.shipmentRate}% · 1등 ${fmt(r1.remain)}/${fmt(r1.total)}매 남음\n👉 <a href="${link(pick)}">자세히</a>\n`;
      }
      if (soon.length) {
        msg += `\n⏰ <b>마감 임박</b>\n` + soon.map((x) => `· ${x.g.typeName} ${x.g.episode}회 — D-${x.d}`).join("\n") + "\n";
      }
      msg += `\n🔗 전체 보기: ${SITE}`;
      await send(msg);
      st.lastDigest = today;
    }

    st.seen = [...seen];
    fs.writeFileSync(ST, JSON.stringify(st, null, 0));
    console.log(`텔레그램 다이제스트 완료 (새 회차 ${newCount}건, 다이제스트 ${st.lastDigest === today ? "전송" : "생략"})`);
  } catch (e) {
    console.log("텔레그램 다이제스트 오류(파이프라인 영향 없음):", e.message);
  }
  process.exit(0);
})();
