/* apply-handoff.js
 * handoff/ に置いた Claude Design の書き出しを、このリポジトリに取り込む。
 *
 *   node apply-handoff.js            … 取り込む（handoff/ は空にする）
 *   node apply-handoff.js --dry-run  … 何をするかだけ表示して、何も書き換えない
 *   node apply-handoff.js --keep     … 取り込むが handoff/ は消さない
 *
 * なぜ必要か:
 * 書き出し版の <head> には charset / viewport / support.js しか入らず、<title> や
 * description、OGP、JSON-LD は <helmet> の中（つまり <body> の中）に置かれる。この形だと
 * JS を動かさないクローラ（Twitterbot など）からは題名も説明も無い文書に見える。だから
 * 2026-07-16 にこれらを <head> へ移した（コミット a11aed4）。書き出しの形は Claude Design
 * 側の仕組みが決めていて向こうでは直せないので、取り込むたびにこちらで組み替え直す。
 * その手作業をこのスクリプトにしてある。
 *
 * 何を取り込み、何を取り込まないか:
 *   index.html      … <head> を組み替えたうえで取り込む
 *   data/**.json    … そのまま取り込む
 *   riftbound-render.js / support.js
 *                   … 差があっても自動では取り込まない。書き出し版のほうが古く、手元で
 *                      足した経路が消えていることがあるため。差があれば警告だけ出す
 *   robots.txt / sitemap.xml / favicon.png / google*.html
 *                   … 取り込まない。手元のものが正しい（書き出し版の sitemap.xml は
 *                      1件だけの雛形で、こちらは build-cards.js が作る856件）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const HANDOFF = path.join(ROOT, 'handoff');
const DRY = process.argv.includes('--dry-run');
const KEEP = process.argv.includes('--keep');

// 取り込まないファイル。手元のものが正しい
const SKIP = new Set(['robots.txt', 'sitemap.xml', 'favicon.png', '.gitkeep']);
// 差があっても手で確かめたいファイル
const REVIEW = new Set(['riftbound-render.js', 'support.js']);

const log = (s) => console.log(s);
const norm = (s) => s.replace(/\r\n/g, '\n');

function die(msg) {
  console.error('中止: ' + msg);
  process.exit(1);
}

/* 書き出し版の index.html を、<head> が正しい形になるよう組み替える。
 * 行番号は使わず目印で探す。書き出しの形が変わったら分かるように、見つからなければ止める。 */
function fixHead(src) {
  const lines = norm(src).split('\n');
  const at = (needle, from = 0) => lines.indexOf(needle, from);

  const iScript = at('<script src="./support.js"></script>');
  const iHeadClose = at('</head>');
  const iHelmet = at('<helmet data-dc-atomics>');
  const iStyle = iHelmet < 0 ? -1 : at('<style>', iHelmet);

  if (iScript < 0 || iHeadClose < 0 || iHelmet < 0 || iStyle < 0) {
    die('index.html の目印が見つからない（support.js / </head> / <helmet> / <style>）。書き出しの形が変わった可能性がある');
  }
  if (!(iScript < iHeadClose && iHeadClose < iHelmet && iHelmet < iStyle)) {
    die('index.html の目印の並び順が想定と違う。書き出しの形が変わった可能性がある');
  }
  if (lines[0] !== '<!DOCTYPE html>') die('index.html が <!DOCTYPE html> で始まっていない');

  // <helmet> と <style> の間にある静的タグ一式。これを <head> へ移す
  const meta = lines.slice(iHelmet + 1, iStyle);
  if (!meta.some((l) => l.startsWith('<title>'))) {
    die('<helmet> の中に <title> が無い。すでに組み替え済みの可能性がある');
  }

  const out = [
    lines[0],
    '<html lang="ja">', // 書き出し版では lang が落ちるので付け直す
    ...lines.slice(2, iScript), // <head> / charset / viewport
    ...meta,
    '<script src="./support.js"></script>',
    ...lines.slice(iScript + 1, iHelmet + 1), // </head> 〜 <helmet ...>
    ...lines.slice(iStyle), // <style> 以降
  ];
  return out.join('\n');
}

/* handoff/ の中のファイルを相対パスで列挙する */
function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

function main() {
  if (!fs.existsSync(HANDOFF)) die('handoff/ が無い');
  const files = walk(HANDOFF).filter((f) => !SKIP.has(path.basename(f)));
  if (!files.length) die('handoff/ が空。Claude Design から書き出したものを置いてから実行する');

  if (DRY) log('--dry-run: 何も書き換えない\n');

  let changed = 0;
  const warn = [];

  for (const rel of files) {
    const from = path.join(HANDOFF, rel);
    const to = path.join(ROOT, rel);
    const isText = /\.(html|js|json|txt|xml)$/i.test(rel);

    if (rel === 'index.html') {
      const fixed = fixHead(fs.readFileSync(from, 'utf8'));
      const cur = fs.existsSync(to) ? norm(fs.readFileSync(to, 'utf8')) : null;
      if (cur === fixed) { log(`  そのまま  ${rel}`); continue; }
      if (!DRY) fs.writeFileSync(to, fixed);
      log(`  取り込み  ${rel}  … <head> を組み替えた`);
      changed++;
      continue;
    }

    const a = fs.readFileSync(from);
    const b = fs.existsSync(to) ? fs.readFileSync(to) : null;
    const same = b && (isText ? norm(a.toString('utf8')) === norm(b.toString('utf8')) : a.equals(b));
    if (same) { log(`  そのまま  ${rel}`); continue; }

    if (REVIEW.has(path.basename(rel))) {
      warn.push(rel);
      log(`  見送り    ${rel}  … 差がある。手で確かめること`);
      continue;
    }

    if (!DRY) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
    log(`  取り込み  ${rel}`);
    changed++;
  }

  log('');
  if (warn.length) {
    log('確認が要るファイル（自動では取り込んでいない）:');
    for (const w of warn) {
      log(`  ${w}`);
      log(`    git diff --no-index -- ${w} handoff/${w}`);
    }
    log('  書き出し版のほうが古いことがある。経路など手元で足したものが消えていないか見ること');
    log('');
  }

  if (!changed) { log('取り込むものは無かった。handoff/ はそのまま残す'); return; }

  if (DRY) { log(`--dry-run のためここで終わり（${changed} 件を取り込む予定）`); return; }

  log('静的ページを作り直す…');
  execFileSync(process.execPath, [path.join(ROOT, 'build-cards.js'), '--all'], { stdio: 'inherit' });

  if (KEEP) {
    log('\n--keep のため handoff/ は消さない');
  } else if (warn.length) {
    log('\n確認が要るファイルが残っているので handoff/ は消さない');
  } else {
    for (const e of fs.readdirSync(HANDOFF)) {
      if (e === '.gitkeep') continue;
      fs.rmSync(path.join(HANDOFF, e), { recursive: true, force: true });
    }
    log('\nhandoff/ を空にした');
  }

  log('\n次: git status で差分を見て、問題なければコミットする');
}

main();
