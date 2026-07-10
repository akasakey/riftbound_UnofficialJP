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
    if (a === 'rules') return { view: 'rules', ruleSec: b || '' };
    if (a === 'domain' && b) return { view: 'list', domain: b };
    if (a === 'set' && b) return { view: 'list', set: b };
    if (a === 'legend' && b) return { view: 'legend', legendId: b };
    if (a === 'card' && b) return { view: 'detail', selectedId: b };
    return { view: 'home' };
  }

  /* ---- ゲーム記号のアイコン化 ---- */
  function symSrc(name) {
    const dom = ['Fury', 'Body', 'Calm', 'Order', 'Mind', 'Chaos'];
    if (dom.includes(name)) return 'images/icon/' + name + '.avif';
    if (name === 'might') return 'images/icon/might.svg';
    if (name === 'exhaust') return 'images/icon/exhaust.svg';
    if (name === 'rune') return 'images/icon/rune_rainbow.svg';
    return '';
  }
  function symImg(name, size) {
    const src = symSrc(name); if (!src) return name;
    const s = (size || 15) + 'px';
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
    const re = /⟨イグゾースト⟩|⟨rune⟩|⟨(Fury|Body|Calm|Order|Mind|Chaos)⟩|⟨(\d+)⟩|([①②③④⑤⑥⑦⑧⑨⑩])|マイト/g;
    const out = []; let last = 0, m, k = 0;
    const pushText = function (t) { scanKw(t, 'w' + (k++) + '_').forEach(function (n) { out.push(n); }); };
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) pushText(str.slice(last, m.index));
      const tok = m[0]; let node = null;
      if (tok === '⟨イグゾースト⟩') node = symImg('exhaust', is);
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
