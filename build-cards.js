/* build-cards.js
 * data/cards/<CODE>.json から、カード1枚ごとの静的HTML（card/<id>.html）を生成する。
 * SPA（index.html）は #card/<id> のまま。こちらは検索エンジンとJS無し環境のための実URL。
 * Cloudflare Pages は card/ogn-001.html を /card/ogn-001 で配信する。
 *
 *   node build-cards.js            … サンプル10枚だけ生成（動作確認用）
 *   node build-cards.js --all      … 全カード生成
 *   node build-cards.js --clean    … 生成物を消す
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BASE = 'https://riftbound-unofficialjp.pages.dev';
const OUT = path.join(ROOT, 'card');

/* ---- データ読み込み ---- */
function loadCards() {
  const dir = path.join(ROOT, 'data', 'cards');
  let all = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    all = all.concat(j.cards || []);
  }
  return all;
}

/* ---- 文字列ユーティリティ ---- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const has = v => Array.isArray(v) ? v.length > 0 : String(v == null ? '' : v).trim() !== '';

// description 用。記号（⟨⟩ ①）は読み上げても意味を成さないので落とす。
function plain(s, limit) {
  let t = String(s || '').replace(/[⟨⟩]/g, '').replace(/\s+/g, ' ').trim();
  if (limit && t.length > limit) t = t.slice(0, limit - 1) + '…';
  return t;
}

const jaText = c => (c.effects || []).map(e => e.ja).filter(has).join(' ');

/* ---- 1枚分のHTML ---- */
function renderCard(c) {
  const url = BASE + '/card/' + c.id;
  const img = BASE + '/' + c.image;
  const doms = has(c.domains) ? c.domains : (has(c.domain) ? [c.domain] : []);

  // 訳が無いカード（効果テキストを持たない Rune / 一部 Token）に「日本語訳」と名乗らせない。
  const translated = has(jaText(c));
  const title = translated
    ? `${c.name}（${c.number}）日本語訳 | Riftbound 日本語カードデータベース`
    : `${c.name}（${c.number}） | Riftbound 日本語カードデータベース`;
  const descBody = plain(jaText(c), 110);
  const desc = descBody
    ? `${c.name}（${c.number}）の効果テキスト日本語訳。${descBody}`
    : `${c.name}（${c.number}）のカード情報。${c.set}収録の${c.type}。`;

  // 表示するステータス（種別により空のものは出さない）
  const stats = [
    ['コスト', c.cost], ['マイト', c.might], ['パワー', c.power],
    ['レアリティ', c.rarity], ['タイプ', c.type],
    ['ドメイン', doms.join(' / ')], ['タグ', c.tag], ['セット', c.set],
  ].filter(([, v]) => has(v));

  const ogTitle = `${c.name}（${c.number}）${translated ? '日本語訳' : ''}`.trim();

  const statRows = stats.map(([k, v]) =>
    `      <div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n');

  const effects = (c.effects || []).map(e => {
    const head = [e.kw, e.cost].filter(has).map(x => `<span class="kw">${esc(x)}</span>`).join(' ');
    const ja = has(e.ja) ? `<p class="ja">${esc(e.ja)}</p>` : '';
    const en = has(e.en) ? `<p class="en">${esc(e.en)}</p>` : '';
    return `      <li>${head}${ja}${en}</li>`;
  }).join('\n');

  const equip = (c.equip || []).filter(e => has(e.ja) || has(e.stat)).map(e => {
    const head = [e.kw, e.stat].filter(has).map(x => `<span class="kw">${esc(x)}</span>`).join(' ');
    const ja = has(e.ja) ? `<p class="ja">${esc(e.ja)}</p>` : '';
    return `      <li>${head}${ja}</li>`;
  }).join('\n');

  const errata = (c.errata || []).map(e =>
    `      <li>${esc(typeof e === 'string' ? e : (e.ja || e.text || JSON.stringify(e)))}</li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(plain(desc, 160))}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(plain(desc, 160))}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Riftbound 日本語カードデータベース">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(plain(desc, 160))}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" type="image/png" sizes="256x256" href="/images/icon/favicon.png?v=2">
<style>
:root{--bg:#12100e;--surface:#191612;--surface2:#211d18;--line:#332d26;
 --ink:#f4efe6;--ink-dim:#b3a998;--ink-faint:#7c7364;--gold:#d9b978;--gold-dim:#8a744a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font-family:'Zen Kaku Gothic New',system-ui,sans-serif;line-height:1.75}
a{color:var(--gold)}
header,footer{border-color:var(--line);border-style:solid;border-width:0}
header{border-bottom-width:1px;background:var(--surface)}
.bar{max-width:820px;margin:0 auto;padding:14px 20px;display:flex;gap:16px;align-items:center;
 justify-content:space-between;flex-wrap:wrap}
.brand{font-family:'Zen Old Mincho',serif;font-weight:700;color:var(--gold);text-decoration:none;letter-spacing:1px}
main{max-width:820px;margin:0 auto;padding:28px 20px 56px}
h1{font-family:'Zen Old Mincho',serif;font-size:28px;margin:0 0 6px}
.num{color:var(--ink-faint);font-size:13px;margin:0 0 22px}
.art{max-width:300px;width:100%;border:1px solid var(--line);border-radius:10px;display:block;margin:0 0 24px}
h2{font-size:15px;color:var(--gold);border-bottom:1px solid var(--line);
 padding-bottom:6px;margin:32px 0 14px;font-weight:700}
dl{margin:0;border-top:1px solid var(--line)}
.row{display:flex;gap:16px;border-bottom:1px solid var(--line);padding:9px 2px}
dt{flex:0 0 96px;color:var(--ink-faint);font-size:13px;margin:0}
dd{margin:0;font-size:14px}
ul{list-style:none;margin:0;padding:0}
li{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.kw{display:inline-block;background:var(--surface2);color:var(--gold);border:1px solid var(--gold-dim);
 border-radius:4px;font-size:11px;font-weight:700;padding:2px 7px;margin:0 6px 8px 0;letter-spacing:.5px}
.ja{margin:0;font-size:15px}
.en{margin:8px 0 0;font-size:13px;color:var(--ink-dim);font-style:italic}
.cta{display:inline-block;margin-top:32px;background:var(--surface2);border:1px solid var(--gold-dim);
 border-radius:8px;padding:11px 20px;color:var(--gold);text-decoration:none;font-weight:700;font-size:14px}
footer{border-top-width:1px;margin-top:48px}
.foot{max-width:820px;margin:0 auto;padding:22px 20px;color:var(--ink-faint);font-size:12px}
</style>
</head>
<body>
<header>
  <div class="bar">
    <a class="brand" href="/">RIFTBOUND 日本語翻訳</a>
    <nav><a href="/#list">カード一覧</a></nav>
  </div>
</header>
<main>
  <h1>${esc(c.name)}</h1>
  <p class="num">${esc(c.number)}${has(c.set) ? ' ・ ' + esc(c.set) : ''}</p>
  <img class="art" src="/${esc(c.image)}" alt="${esc(c.name)} のカード画像" loading="lazy" width="300">

  <h2>カード情報</h2>
  <dl>
${statRows}
  </dl>
${effects ? `
  <h2>効果テキスト（日本語訳）</h2>
  <ul>
${effects}
  </ul>` : ''}${equip ? `
  <h2>装備効果</h2>
  <ul>
${equip}
  </ul>` : ''}${errata ? `
  <h2>エラッタ</h2>
  <ul>
${errata}
  </ul>` : ''}

  <a class="cta" href="/#card/${esc(c.id)}">サイトでこのカードを開く →</a>
</main>
<footer>
  <div class="foot">
    RiftBound 日本語翻訳 Wiki ・ 本サイトはファンによる非公式サイトです。
    RIFTBOUND および League of Legends は Riot Games, Inc. の商標であり、権利はすべて同社に帰属します。
    当サイトは Riot Games とは一切関係ありません。
  </div>
</footer>
</body>
</html>
`;
}

/* ---- 実行 ---- */
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--clean')) {
    fs.rmSync(OUT, { recursive: true, force: true });
    console.log('removed ' + path.relative(ROOT, OUT) + '/');
    return;
  }
  const all = loadCards();
  let targets;
  if (argv.includes('--all')) {
    targets = all;
  } else {
    // 動作確認用: 種別が散らばるように1枚ずつ拾う
    const seen = new Set();
    targets = all.filter(c => {
      if (seen.has(c.type)) return false;
      seen.add(c.type); return true;
    });
    for (const c of all) {
      if (targets.length >= 10) break;
      if (!targets.includes(c)) targets.push(c);
    }
    targets = targets.slice(0, 10);
  }

  fs.mkdirSync(OUT, { recursive: true });
  let bytes = 0;
  for (const c of targets) {
    const html = renderCard(c);
    fs.writeFileSync(path.join(OUT, c.id + '.html'), html, 'utf8');
    bytes += Buffer.byteLength(html);
  }
  console.log(`generated ${targets.length} page(s) into ${path.relative(ROOT, OUT)}/  (${(bytes / 1024).toFixed(1)} KB)`);
  const noJa = targets.filter(c => !has(jaText(c)));
  if (noJa.length) console.log(`note: ${noJa.length} of them have no Japanese effect text (${noJa.map(c => c.id).join(', ')})`);
}

main();
