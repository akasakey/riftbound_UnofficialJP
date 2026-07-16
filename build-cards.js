/* build-cards.js
 * data/cards/<CODE>.json から、カード1枚ごとの静的HTML（card/<id>.html）を生成する。
 * SPA（index.html）は #card/<id> のまま。こちらは検索エンジンとJS無し環境のための実URL。
 * Cloudflare Pages は card/ogn-001.html を /card/ogn-001 で配信する。
 *
 *   node build-cards.js            … サンプル10枚だけ生成（動作確認用）
 *   node build-cards.js --all      … 全カード生成
 *   node build-cards.js --clean    … 生成物を消す
 *
 * 効果テキストの記号（⟨might⟩ ① など）とキーワードチップは riftbound-render.js の
 * richText をそのまま呼んで描いている。React.createElement を「HTML文字列を返す関数」に
 * 差し替えて読み込むので、SPA のカード詳細と同じ描画ロジックを二重に持たずに済む。
 * 見た目も index.html のカード詳細（<sc-if value="{{ showDetail }}">）から写している。
 *
 * 効果テキストを持たないカード（Rune と一部 Token）は生成しない。画像と数項目しか
 * 載らず固有のテキストが無いので、出しても検索結果に出る目がなく薄いページを増やすだけ。
 * SPA 側（#card/<id>）では従来どおり見られる。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BASE = 'https://riftbound-unofficialjp.pages.dev';
const OUT = path.join(ROOT, 'card');

/* ---- 文字列ユーティリティ ---- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const has = v => Array.isArray(v) ? v.length > 0 : String(v == null ? '' : v).trim() !== '';

// description 用。記号は読み上げても意味を成さないので落とす。
function plain(s, limit) {
  let t = String(s || '').replace(/[⟨⟩]/g, '').replace(/\s+/g, ' ').trim();
  if (limit && t.length > limit) t = t.slice(0, limit - 1) + '…';
  return t;
}

const jaText = c => (c.effects || []).map(e => e.ja).filter(has).join(' ');

/* ---- React.createElement → HTML文字列 ----
 * riftbound-render.js を書き換えずに Node で走らせるための最小シム。
 * 画像の src は SPA では 'images/icon/…' の相対パスだが、/card/<id> から見ると
 * /card/images/… を指してしまうので、ここでルート絶対に直す。
 */
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input']);
const styleAttr = obj => Object.entries(obj)
  .filter(([, v]) => v != null && v !== '')
  .map(([k, v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v)
  .join(';');

function createElement(type, props, ...children) {
  const p = props || {};
  const attrs = [];
  for (const [k, v] of Object.entries(p)) {
    if (v == null || k === 'key' || k === 'dangerouslySetInnerHTML' || k === 'children') continue;
    if (k === 'style') { const s = styleAttr(v); if (s) attrs.push(`style="${esc(s)}"`); continue; }
    if (k === 'className') { attrs.push(`class="${esc(v)}"`); continue; }
    if (k === 'src' && !/^(https?:)?\/\//.test(v) && !v.startsWith('/')) { attrs.push(`src="/${esc(v)}"`); continue; }
    if (typeof v === 'function') continue;
    attrs.push(`${k}="${esc(v)}"`);
  }
  const open = `<${type}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  if (VOID_TAGS.has(type)) return open;
  let inner = p.dangerouslySetInnerHTML ? p.dangerouslySetInnerHTML.__html : flatten(children);
  return open + inner + `</${type}>`;
}
// 子は文字列（=要素）と生テキストが混ざる。生テキストのみエスケープする。
function flatten(nodes) {
  return nodes.flat(Infinity).filter(n => n != null && n !== false)
    .map(n => typeof n === 'string' ? (n.startsWith('<') ? n : esc(n)) : String(n)).join('');
}

/* ---- サイト側のロジックを読み込む ---- */
function loadRB() {
  const src = fs.readFileSync(path.join(ROOT, 'riftbound-render.js'), 'utf8');
  const win = { React: { createElement } };
  const loc = { hash: '' };
  win.location = loc;
  new Function('window', 'location', src)(win, loc);
  return win.RB;
}

function loadJson(p) { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); }

function loadCards() {
  const dir = path.join(ROOT, 'data', 'cards');
  let all = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')))
    all = all.concat(loadJson(path.join('data', 'cards', f)).cards || []);
  return all;
}

/* ---- index.html から写した配色 ---- */
const DOMAINS = {
  Fury: '#d92d2a', Body: '#f5901e', Order: '#d3b41f',
  Calm: '#4f9c3b', Mind: '#1481be', Chaos: '#7b4aa8',
};
const domColor = k => DOMAINS[k] || '#888';
const domInk = k => (k === 'Body' || k === 'Order') ? '#1a130a' : '#fbf6ec';
const kwBase = kw => { const m = String(kw || '').match(/^[A-Za-z][A-Za-z-]*/); return m ? m[0].toUpperCase() : ''; };

// meta.json の keywords / keywordCategories から、richText が使う配色マップを組む。
function keywordMap(meta) {
  const km = {};
  for (const k of meta.keywords || []) {
    const base = kwBase(k.kw);
    if (!base) continue;
    const cat = (meta.keywordCategories || []).find(c => c.id === k.cat);
    if (cat) km[base] = { bg: cat.color, ink: cat.text };
  }
  return km;
}

/* ---- 1枚分のHTML ---- */
function renderCard(c, RB, meta) {
  const url = BASE + '/card/' + c.id;
  const img = BASE + '/' + c.image;
  const doms = has(c.domains) ? c.domains : (has(c.domain) ? [c.domain] : []);
  const tags = String(c.tag || '').split(/[・･]/).map(t => t.trim()).filter(Boolean);
  const setName = (meta.sets || []).find(s => s.code === c.setCode);

  const translated = has(jaText(c));
  const title = translated
    ? `${c.name}（${c.number}）日本語訳 | Riftbound 日本語カードデータベース`
    : `${c.name}（${c.number}） | Riftbound 日本語カードデータベース`;
  const ogTitle = `${c.name}（${c.number}）${translated ? '日本語訳' : ''}`.trim();
  const descBody = plain(jaText(c), 110);
  const desc = plain(descBody
    ? `${c.name}（${c.number}）の効果テキスト日本語訳。${descBody}`
    : `${c.name}（${c.number}）のカード情報。${c.set}収録の${c.type}。`, 160);

  // ---- 情報表（index.html の sel.info と同じ項目・同じ順） ----
  const domainCell = doms.length
    ? doms.map(d => `<span style="display:inline-flex;gap:5px;align-items:center;color:${domColor(d)};font-weight:600">` +
        `<img src="/images/icon/${esc(d)}.avif" alt="${esc(d)}" style="height:16px;width:16px">${esc(d)}</span>`)
        .join('<span style="display:inline-block;width:12px"></span>')
    : '—';
  const info = [
    ['カード名', esc(c.name)],
    ['ドメイン', domainCell],
    ['エネルギー', has(c.cost) ? RB.energyPip(c.cost, 17) : '—'],
    ['パワー', has(c.power) ? `<span style="display:inline-flex;gap:5px;align-items:center">${RB.symImg(c.domain, 16)}${esc(c.power)}</span>` : '—'],
    ['マイト', has(c.might) ? `<span style="display:inline-flex;gap:5px;align-items:center">${RB.symImg('might', 16)}${esc(c.might)}</span>` : '—'],
    ['レアリティ', has(c.rarity) ? esc(c.rarity) : '—'],
    ['収録セット', esc(setName ? setName.name : c.set)],
    ['番号', esc(c.number)],
  ];
  const infoRows = info.map(([k, v]) =>
    `        <div style="display:grid;grid-template-columns:110px 1fr;border-bottom:1px solid var(--line-soft)">
          <div style="padding:11px 14px;background:var(--surface2);font-size:12.5px;font-weight:700;color:var(--ink-dim)">${esc(k)}</div>
          <div style="padding:11px 16px;font-size:13px;color:var(--ink)">${v}</div>
        </div>`).join('\n');

  // ---- 効果（SPA と同じ richText。英語原文は SPA に無いがこちらでは併記する） ----
  const km = keywordMap(meta);
  RB.setKeywords(km);
  const effects = (c.effects || []).map(e => {
    const col = km[kwBase(e.kw)];
    const chip = has(e.kw)
      ? `<span style="display:inline-flex;align-items:center;gap:5px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.05em;padding:2px 8px;border-radius:4px;background:${col ? col.bg : 'var(--surface3)'};color:${col ? col.ink : 'var(--gold)'};margin-right:8px;transform:translateY(-1px)">${esc(e.kw)}${has(e.cost) ? RB.richText(e.cost, 13) : ''}</span>`
      : '';
    const ja = has(e.ja) ? RB.richText(e.ja) : '';
    const en = has(e.en) ? `<div style="font-size:12.5px;line-height:1.8;color:var(--ink-faint);font-style:italic;margin-top:7px">${esc(e.en)}</div>` : '';
    return `          <div style="font-size:14px;line-height:1.95;color:var(--ink)">${chip}${ja}${en}</div>`;
  }).join('\n');

  const equip = (c.equip || []).filter(e => has(e.ja) || has(e.stat)).map(e => {
    const head = has(e.stat) ? `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">${RB.symImg('might', 15)}${esc(e.stat)}</span>` : '';
    return `          <div style="font-size:14px;line-height:1.95;color:var(--ink)">${head}${has(e.ja) ? RB.richText(e.ja) : ''}</div>`;
  }).join('\n');

  const typeChip = `<span style="display:inline-flex;align-items:center;gap:5px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:20px;background:${domColor(c.domain)};color:${domInk(c.domain)}">${esc(c.type || 'Card')}</span>`;
  const tagChips = tags.map(t =>
    `<span style="display:inline-flex;align-items:center;font:600 10px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:20px;background:var(--surface3);border:1px solid var(--line);color:var(--ink-dim)">${esc(t)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Riftbound 日本語カードデータベース">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" type="image/png" sizes="256x256" href="/images/icon/favicon.png?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<script>
// index.html と同じ判定。保存済みのテーマがあれば従い、無ければ OS 設定に合わせる。
(function(){
  try{
    var saved = localStorage.getItem('rb-theme');
    var theme = (saved === 'light' || saved === 'dark') ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }catch(e){ document.documentElement.setAttribute('data-theme','dark'); }
})();
</script>
<style>
/* index.html のトークンをそのまま使う */
:root{
  --bg:#12100e; --surface:#191612; --surface2:#211d18; --surface3:#2a251f;
  --line:#332d26; --line-soft:#28231d;
  --ink:#f4efe6; --ink-dim:#b3a998; --ink-faint:#7c7364;
  --gold:#d9b978; --gold-dim:#8a744a;
  --header-a:#1c1813; --header-b:#161310;
  color-scheme:dark;
}
:root[data-theme="light"]{
  --bg:#e8dbbf; --surface:#fbf6ec; --surface2:#f1e8d6; --surface3:#e7dcc4;
  --line:#cdb890; --line-soft:#dccbaa;
  --ink:#2c2216; --ink-dim:#524328; --ink-faint:#6a5836;
  --gold:#7d5b14; --gold-dim:#8f6d28;
  --header-a:#fbf6ec; --header-b:#efe4cf;
  color-scheme:light;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font-family:'Zen Kaku Gothic New',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--gold)}
.rb-header{display:flex;align-items:center;gap:18px;padding:0 26px;height:60px;
 background:linear-gradient(180deg,var(--header-a),var(--header-b));
 border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.brand{font-family:'Zen Old Mincho',serif;font-weight:700;font-size:17px;color:var(--ink);
 text-decoration:none;letter-spacing:.02em}
.brand b{color:var(--gold)}
.rb-main{max-width:1100px;margin:0 auto;padding:26px 34px 60px}
.rb-detail-grid{display:grid;grid-template-columns:300px 1fr;gap:28px;align-items:start}
@media(max-width:760px){.rb-main{padding:20px 18px 48px}.rb-detail-grid{grid-template-columns:1fr}}
.cta{display:inline-block;margin-top:34px;background:var(--surface2);border:1px solid var(--gold-dim);
 border-radius:8px;padding:11px 20px;color:var(--gold);text-decoration:none;font-weight:700;font-size:13px}
.foot{border-top:1px solid var(--line);margin-top:52px}
.foot div{max-width:1100px;margin:0 auto;padding:22px 34px;color:var(--ink-faint);font-size:12px;line-height:1.9}
</style>
</head>
<body>
<header class="rb-header">
  <a class="brand" href="/"><b>RIFTBOUND</b> 日本語翻訳</a>
  <nav style="margin-left:auto;font-size:13px"><a href="/cards">カード索引</a></nav>
</header>
<main class="rb-main">

  <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-faint);margin-bottom:22px">
    <a href="/" style="color:inherit;text-decoration:none">ホーム</a>
    <span>›</span><span style="color:var(--ink-dim)">${esc(doms[0] || c.type)} / ${esc(c.name)}</span>
  </div>

  <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:6px">
    <span style="width:34px;height:34px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;flex:none;margin-top:6px">${doms[0] ? `<img src="/images/icon/${esc(doms[0])}.avif" alt="${esc(doms[0])}" style="width:100%;height:100%;object-fit:contain">` : ''}</span>
    <div>
      <h1 style="margin:0;font-family:'Zen Old Mincho',serif;font-weight:700;font-size:34px;letter-spacing:.01em;line-height:1.1">${esc(c.name)}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${typeChip}${tagChips}</div>
    </div>
  </div>
  <div style="font:500 11px 'JetBrains Mono',monospace;color:var(--ink-faint);margin:14px 0 26px">Last-modified: ${esc(c.modified)}</div>

  <div class="rb-detail-grid">
    <div>
      <img src="/${esc(c.image)}" alt="${esc(c.name)}" width="300" loading="lazy"
           style="width:100%;border-radius:12px;border:1px solid var(--line);display:block">
    </div>
    <div>
      <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)">
${infoRows}
      </div>
    </div>
  </div>
${effects ? `
  <div style="margin-top:34px">
    <div style="font-family:'Zen Old Mincho',serif;font-weight:700;font-size:16px;padding-bottom:10px;border-bottom:2px solid var(--gold);display:inline-block">効果</div>
    <div style="border:1px solid var(--line);border-radius:10px;padding:20px 22px;margin-top:12px;background:var(--surface)">
      <div style="display:flex;flex-direction:column;gap:15px">
${effects}
      </div>
    </div>
  </div>` : ''}${equip ? `
  <div style="margin-top:34px">
    <div style="font-family:'Zen Old Mincho',serif;font-weight:700;font-size:16px;padding-bottom:10px;border-bottom:2px solid var(--gold);display:inline-block">装備効果</div>
    <div style="border:1px solid var(--line);border-radius:10px;padding:20px 22px;margin-top:12px;background:var(--surface)">
      <div style="display:flex;flex-direction:column;gap:15px">
${equip}
      </div>
    </div>
  </div>` : ''}

  <a class="cta" href="/#card/${esc(c.id)}">サイトでこのカードを開く →</a>
</main>
<footer class="foot">
  <div>
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
  const RB = loadRB();
  const meta = loadJson(path.join('data', 'meta.json'));
  const all = loadCards();

  // 訳のあるカードだけ。Rune と効果なし Token は固有テキストが無いので出さない。
  const publishable = all.filter(c => has(jaText(c)));
  const skipped = all.length - publishable.length;

  let targets;
  if (argv.includes('--all')) {
    targets = publishable;
  } else {
    const seen = new Set();
    targets = publishable.filter(c => { if (seen.has(c.type)) return false; seen.add(c.type); return true; });
    for (const c of publishable) { if (targets.length >= 10) break; if (!targets.includes(c)) targets.push(c); }
    targets = targets.slice(0, 10);
  }

  fs.mkdirSync(OUT, { recursive: true });
  let bytes = 0;
  for (const c of targets) {
    const html = renderCard(c, RB, meta);
    fs.writeFileSync(path.join(OUT, c.id + '.html'), html, 'utf8');
    bytes += Buffer.byteLength(html);
  }
  console.log(`generated ${targets.length} page(s) into ${path.relative(ROOT, OUT)}/  (${(bytes / 1024).toFixed(1)} KB, avg ${(bytes / targets.length / 1024).toFixed(1)} KB)`);
  console.log(`skipped ${skipped} card(s) with no Japanese effect text`);
}

main();
