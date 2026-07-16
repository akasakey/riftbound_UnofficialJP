/* riftbound-render.js
 * 共通ロジックの切り出し（本体 Riftbound Wiki.dc.html から利用）。
 * React 非依存の純粋関数群 + React.createElement を使うリッチテキスト描画。
 * window.React を参照。window.RB に公開し、本体クラスは薄いデリゲータで呼ぶ。
 * 本番（publish/index.html）は super_inline_html でこのファイルごとインライン化される。
 */
(function () {
  function R() { return window.React; }

  /* ---- ルーティング（location.hash → ビュー状態） ---- */
  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return { view: 'home' };
    const i = h.indexOf('/');
    const a = i < 0 ? h : h.slice(0, i);
    const b = i < 0 ? '' : decodeURIComponent(h.slice(i + 1));
    if (a === 'list') return { view: 'list' };
    if (a === 'legends') return { view: 'legends' };
    if (a === 'keywords') return { view: 'keywords' };
    if (a === 'deck') return { view: 'deck' };
    if (a === 'rules') return { view: 'rules', ruleSec: b || '' };
    if (a === 'domain' && b) return { view: 'list', domain: b };
    if (a === 'set' && b) return { view: 'list', set: b };
    if (a === 'legend' && b) return { view: 'legend', legendId: b };
    if (a === 'card' && b) return { view: 'detail', selectedId: b };
    return { view: 'home' };
  }

  /* ---- ゲーム記号のアイコン化 ---- */
  // exhaust はモノクロ・グリフなので currentColor のインラインSVGで描画し、本文の文字色に追従させる。
  var EXHAUST_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block"><path d="M18.7085 8.47119H20.2591C20.6636 8.47119 20.967 8.80824 20.967 9.17903V10.4263H24.0006V9.17903C24.0006 7.12284 22.3153 5.4375 20.2591 5.4375H17.6973C18.1355 6.38132 18.4725 7.39254 18.7085 8.47119Z"/><path d="M20.968 15.6172V20.2016C20.968 20.6061 20.6308 20.9094 20.26 20.9094H16.451L14.2264 23.4712L12.0353 20.9094H4.28254C3.87805 20.9094 3.5746 20.5724 3.5746 20.2016V10.9319L3.17012 10.4599H3.5746V9.21277C3.5746 8.80827 3.87805 8.50493 4.28254 8.50493H9.00152C8.9004 7.9656 8.76555 7.42627 8.5633 6.92066C8.32735 6.31391 8.05772 5.84199 7.75435 5.4375H4.28254C2.22636 5.4375 0.541016 7.12284 0.541016 9.17903V20.1678C0.541016 22.224 2.22636 23.9095 4.28254 23.9095H20.26C22.3162 23.9095 24.0016 22.224 24.0016 20.1678V12.0442L20.968 15.5836V15.6172Z"/><path d="M16.9887 12.6183C16.9887 10.0565 16.5169 7.89925 15.6068 6.11273C14.427 3.75318 12.6067 2.10148 10.3146 1.25879C3.91011 -0.763689 0.0337079 3.82051 0 3.92163C2.46068 1.93287 6.43825 2.06769 7.41578 2.5396C9.03376 3.28117 9.97762 4.49475 10.6181 6.11273C11.4608 8.27003 11.5955 10.8992 11.5618 12.6183H7.88774L14.2248 20.1015L20.6292 12.6183H16.9887Z"/><path d="M3.5389 9.88672H2.89844V11.471H3.5389V9.88672Z"/></svg>';
  // might も currentColor で描画（バッジ上はゴールド、本文ではインク色に追従。白fillだと明るい地で消えるため）。
  var MIGHT_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block"><path d="M15.7938 7.88519L16.7882 15.8057L11.8849 21.0175L6.98178 15.8057L7.97616 7.88519C4.30733 6.95941 2.25 4.35352 2.25 4.35352V11.3825C2.25 13.4055 2.86722 15.4286 3.99873 17.2116C5.54169 19.6117 8.11326 22.629 11.8849 24.0005C15.6566 22.629 18.2283 19.6117 19.7713 17.2116C20.9371 15.4286 21.5199 13.4055 21.5199 11.3825V4.45638C21.5199 4.45638 19.2226 6.95937 15.7252 7.85087L15.7938 7.88519Z"/><path d="M15.7942 5.93188C15.7942 4.80037 14.8684 3.87457 13.7369 3.87457H13.0169L12.6055 1.57733C12.9826 1.44018 13.257 1.1658 13.257 0.857203C13.257 0.377169 12.6397 0 11.8854 0C11.131 0 10.5138 0.377169 10.5138 0.857203C10.5138 1.1658 10.7882 1.44018 11.1653 1.57733L10.7539 3.87457H10.0339C8.90236 3.87457 7.97656 4.80037 7.97656 5.93188H10.5138L9.45093 14.9153L11.8511 17.4184L14.2512 14.9153L13.1883 5.93188H15.7599H15.7942Z"/></svg>';
  function symSrc(name) {
    const dom = ['Fury', 'Body', 'Calm', 'Order', 'Mind', 'Chaos'];
    if (dom.includes(name)) return 'images/icon/' + name + '.avif';
    if (name === 'might') return 'images/icon/might.svg';
    if (name === 'exhaust') return 'images/icon/exhaust.svg';
    if (name === 'rune') return 'images/icon/rune_rainbow.svg';
    return '';
  }
  function symImg(name, size) {
    const s = (size || 15) + 'px';
    if (name === 'exhaust') {
      return R().createElement('span', { title: 'イグゾースト', style: { display: 'inline-block', width: s, height: s, verticalAlign: '-2px', margin: '0 1px', color: 'inherit' }, dangerouslySetInnerHTML: { __html: EXHAUST_SVG } });
    }
    if (name === 'might') {
      return R().createElement('span', { title: 'マイト', style: { display: 'inline-block', width: s, height: s, verticalAlign: '-2px', margin: '0 1px', color: 'inherit' }, dangerouslySetInnerHTML: { __html: MIGHT_SVG } });
    }
    const src = symSrc(name); if (!src) return name;
    return R().createElement('img', { src, alt: name, title: name, style: { height: s, width: s, verticalAlign: '-2px', display: 'inline-block', margin: '0 1px' } });
  }
  function energyPip(n, size) {
    const d = (size || 16) + 'px';
    return R().createElement('span', { title: 'エネルギー ' + n, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: d, height: d, borderRadius: '50%', background: '#E7B24C', color: '#3a2708', font: '700 ' + Math.round((size || 16) * 0.62) + 'px "JetBrains Mono",monospace', lineHeight: '1', verticalAlign: 'middle', margin: '0 2px', position: 'relative', top: '-1px' } }, String(n));
  }

  /* ---- カード効果文のリッチテキスト ---- */
  // キーワード配色マップ（Component から setKeywords で受け取る）。base(大文字) -> {bg, ink}
  let KWMAP = {};
  function setKeywords(map) { KWMAP = map || {}; }
  function kwChip(label, base, key) {
    const c = KWMAP[base] || { bg: 'var(--surface3)', ink: 'var(--gold)' };
    return R().createElement('span', { key: key, style: { display: 'inline-block', font: "700 0.8em 'JetBrains Mono',monospace", letterSpacing: '.03em', padding: '0 6px', borderRadius: '4px', background: c.bg, color: c.ink, margin: '0 2px', verticalAlign: '1px', whiteSpace: 'nowrap' } }, label);
  }
  // 本文中に現れる登録済みキーワード（英大文字）をチップ化する。
  function scanKw(text, kp) {
    const bases = Object.keys(KWMAP);
    if (!bases.length || !text) return [text];
    const alt = bases.map(function (b) { return b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).sort(function (a, b) { return b.length - a.length; }).join('|');
    const re = new RegExp('(?<![A-Za-z])(' + alt + ')(\\s?(?:X|\\d+))?(?![A-Za-z])', 'g');
    const out = []; let last = 0, m, k = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const base = m[1].toUpperCase();
      const num = m[2] ? (' ' + m[2].trim()) : '';
      out.push(kwChip(m[1] + num, base, kp + 'k' + (k++)));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  function richLine(str, sz) {
    const es = sz ? Math.round(sz) : null;
    const is = sz ? Math.round(sz * 0.92) : null;
    const circled = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10 };
    const re = /⟨イグゾースト⟩|⟨might⟩|⟨rune⟩|⟨(Fury|Body|Calm|Order|Mind|Chaos)⟩|⟨(\d+)⟩|([①②③④⑤⑥⑦⑧⑨⑩])|マイト/g;
    const out = []; let last = 0, m, k = 0;
    const pushText = function (t) { scanKw(t, 'w' + (k++) + '_').forEach(function (n) { out.push(n); }); };
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) pushText(str.slice(last, m.index));
      const tok = m[0]; let node = null;
      if (tok === '⟨イグゾースト⟩') node = symImg('exhaust', is);
      else if (tok === '⟨might⟩') node = symImg('might', is);
      else if (tok === '⟨rune⟩') node = symImg('rune', is);
      else if (m[1]) node = symImg(m[1], is);
      else if (m[2] != null) node = energyPip(m[2], es);
      else if (m[3]) node = energyPip(circled[m[3]], es);
      else if (tok === 'マイト') node = symImg('might', is);
      out.push(R().createElement('span', { key: 's' + (k++) }, node));
      last = re.lastIndex;
    }
    if (last < str.length) pushText(str.slice(last));
    return out;
  }
  function richText(str, sz) {
    if (!str) return str;
    const lines = String(str).split('\n');
    if (lines.length === 1) return R().createElement('span', null, ...richLine(str, sz));
    return R().createElement('span', null, ...lines.map((ln, i) => {
      const bullet = /^[・•]/.test(ln.trim());
      const body = bullet ? ln.trim().replace(/^[・•]\s*/, '') : ln;
      return R().createElement('span', {
        key: 'ln' + i,
        style: bullet
          ? { display: 'block', paddingLeft: '1.15em', textIndent: '-1.15em' }
          : { display: 'block' }
      }, bullet ? R().createElement('span', { style: { color: 'var(--accent,#c9a24a)' } }, '・') : null, ...richLine(body, sz));
    }));
  }

  /* ---- ルール散文のリッチテキスト ---- */
  function ruleTokenNodes(str, li) {
    const circled = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10 };
    const re = /⟨イグゾースト⟩|⟨might⟩|⟨rune⟩|⟨(Fury|Body|Calm|Order|Mind|Chaos)⟩|⟨(\d+)⟩|([①②③④⑤⑥⑦⑧⑨⑩])/g;
    const out = []; let last = 0, m, k = 0;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) out.push(str.slice(last, m.index));
      const tok = m[0]; let node = null;
      if (tok === '⟨イグゾースト⟩') node = symImg('exhaust', 14);
      else if (tok === '⟨might⟩') node = symImg('might', 14);
      else if (tok === '⟨rune⟩') node = symImg('rune', 14);
      else if (m[1]) node = symImg(m[1], 14);
      else if (m[2] != null) node = energyPip(m[2], 15);
      else if (m[3]) node = energyPip(circled[m[3]], 15);
      out.push(R().createElement('span', { key: 't' + li + '-' + (k++) }, node));
      last = re.lastIndex;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  }
  function ruleInline(str, li) {
    const parts = String(str).split(/(\*\*[^*]+\*\*)/g);
    const out = []; let k = 0;
    parts.forEach(p => {
      if (/^\*\*[^*]+\*\*$/.test(p)) {
        out.push(R().createElement('strong', { key: 'b' + li + '-' + (k++), style: { color: 'var(--ink)', fontWeight: 700 } }, p.slice(2, -2)));
      } else if (p) {
        ruleTokenNodes(p, li + '_' + (k++)).forEach(n => out.push(n));
      }
    });
    return out;
  }
  function ruleNodes(str) {
    if (str == null) return null;
    const lines = String(str).split('\n');
    return R().createElement('span', null, ...lines.map((ln, i) => {
      const t = ln.trim();
      if (t === '') return R().createElement('span', { key: 'l' + i, style: { display: 'block', height: '8px' } });
      const bullet = /^[・•]/.test(t);
      const body = bullet ? t.replace(/^[・•]\s*/, '') : ln;
      return R().createElement('span', {
        key: 'l' + i,
        style: bullet ? { display: 'block', paddingLeft: '1.25em', textIndent: '-1.25em', margin: '2px 0' } : { display: 'block' }
      },
        bullet ? R().createElement('span', { style: { color: 'var(--gold)' } }, '・') : null,
        ...ruleInline(body, i));
    }));
  }

  window.RB = { parseHash, symSrc, symImg, energyPip, richLine, richText, ruleTokenNodes, ruleInline, ruleNodes, setKeywords };
})();
