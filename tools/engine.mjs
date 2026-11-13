// Loads the block engine out of the page so it can run from the command line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, '..', 'Jump Blocks (Claude Fable 5.2).html');
const cut = (html, open) => { const a = html.indexOf(open); const b = html.indexOf('</script>', a); return html.slice(a + open.length, b); };
export async function loadEngine(page = PAGE) {
  const html = fs.readFileSync(page, 'utf8');
  const src = cut(html, '<script type="text/plain" id="engine-src">');
  const wasm = Buffer.from(cut(html, '<script type="text/plain" id="wasm-b64">').replace(/\s+/g, ''), 'base64');
  const tmp = path.join(os.tmpdir(), `jump-blocks-engine-${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  try { await import(pathToFileURL(tmp).href); } finally { fs.rmSync(tmp, { force: true }); }
  const eng = globalThis.__engineFallback;
  await eng.call({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  // page-side defaults, looks and the parameter mapping, taken from the page script
  const ui = html.slice(html.lastIndexOf('<script>'));
  const grab = (from, to) => { const a = ui.indexOf(from); const b = ui.indexOf(to, a); if (a < 0 || b < 0) throw new Error('page text not found: ' + from); return ui.slice(a, b); };
  const code = grab('const DEF = {', 'let S =') + grab('const LEGO = {', 'let pinned') + grab('function coreParamsRaw', 'const calib =') + grab('const WIN_OF', '// the arch looks differ') + '\nreturn { DEF, LOOKS, coreParamsRaw };';
  const { DEF, LOOKS, coreParamsRaw } = new Function(code)();
  let id = 0;
  const run = async (msg, onInterim) => eng.call({ ...msg, id: ++id }, onInterim);
  const build = async (settings, exact = true) => {
    let quick = null, geom = null;
    const r = await run({ type: 'build', params: coreParamsRaw({ ...DEF, ...settings }) }, (m) => { if (m.type === 'geometry') geom = m; if (m.type === 'results') quick = m; });
    const res = r && r.type === 'results' ? r : quick;
    return { grams: res.mass.grams, hours: res.mass.timeS / 3600, kg: res.strength.capKg, governs: res.strength.governing.name, checks: res.strength.checks, stats: res.stats, warnings: geom ? geom.warnings : [], mass: res.mass };
  };
  return { run, build, DEF, LOOKS, coreParamsRaw, get core() { return eng.core; }, get wasm() { return eng.wasm; } };
}
