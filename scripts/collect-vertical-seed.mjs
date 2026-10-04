#!/usr/bin/env node
/**
 * Собирает проверенный набор ВЕРТИКАЛЬНЫХ роликов для seed.
 *
 * Источник — Wikimedia Commons API (свободная лицензия, стабильный CDN, hotlink
 * разрешён). Скрипт ничего не угадывает: ищет -> берёт транскод ->
 * УБИРАЕТ трекинговые utm-параметры -> проверяет HTTP-доступность ->
 * печатает готовый JSON.
 *
 * Запуск: node scripts/collect-vertical-seed.mjs
 */
import { writeFileSync } from "node:fs";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "VibeTube-seed/1.0 (metadata collector)";

const apiGet = async (params) => {
  const u = new URL(API);
  Object.entries({ format: "json", formatversion: "2", ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
};

/** Убираем ?utm_source=... и прочий трекинг — прямая ссылка должна быть чистой. */
const clean = (u) => u.split("?")[0];

const stripExt = (title) => title.replace(/^File:/, "").replace(/\.(webm|ogv|mp4)$/i, "");

async function findVertical() {
  const searches = [
    "filetype:video vertical",
    "filetype:video portrait phone",
    "filetype:video 1080 1920",
    "filetype:video vertical reel",
  ];
  const seen = new Map();

  for (const q of searches) {
    let data;
    try {
      data = await apiGet({
        action: "query", generator: "search", gsrsearch: q, gsrnamespace: "6",
        gsrlimit: "40", prop: "videoinfo", viprop: "url|size|mime|derivatives",
      });
    } catch (e) {
      console.log("  ! поиск не удался:", q, e.message);
      continue;
    }
    for (const p of data?.query?.pages ?? []) {
      const vi = p.videoinfo?.[0];
      if (!vi || !vi.height || !vi.width) continue;
      if (vi.height <= vi.width) continue;                       // только вертикальные
      const ratio = vi.width / vi.height;
      if (ratio < 0.4 || ratio > 0.75) continue;               // строго 9:16..4:5
      if (seen.has(p.title)) continue;
      const ders = (vi.derivatives ?? []).map((d) => ({ ...d, src: clean(d.src) }));
      const webm = ders.filter((d) => /\.webm$/.test(d.src)).sort((a, b) => a.width - b.width);
      // Берём самый маленький вертикальный webm-транскод: лента должна грузиться на мобильном.
      const pick = webm.find((d) => d.width >= 270) ?? webm[0];
      if (!pick) continue;
      seen.set(p.title, {
        commonsTitle: p.title,
        name: stripExt(p.title),
        width: pick.width,
        height: pick.height,
        url: pick.src,
        durationSec: vi.duration ?? null,
      });
    }
  }
  return [...seen.values()];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Commons CDN отвечает 429 при частых запросах — поэтому троттлинг + ретраи. */
async function probe(url, attempt = 0) {
  try {
    const r = await fetch(url, {
      method: "GET", redirect: "follow",
      headers: { Range: "bytes=0-2047", "User-Agent": UA },
      signal: AbortSignal.timeout(25000),
    });
    const cr = r.headers.get("content-range") || "";
    const total = cr.includes("/") ? Number(cr.split("/")[1]) : Number(r.headers.get("content-length") || 0);
    const type = r.headers.get("content-type") || "";
    if (r.status === 429 && attempt < 4) {
      const wait = 2500 * 2 ** attempt + Math.floor(Math.random() * 800);
      process.stdout.write(`429, ждём ${wait}ms...`);
      await sleep(wait);
      return probe(url, attempt + 1);
    }
    if (!r.ok) return { ok: false, status: r.status, bytes: 0 };
    return { ok: type.startsWith("video/") || url.endsWith(".webm"), status: r.status, bytes: total, type };
  } catch (e) {
    if (attempt < 2) {
      await sleep(1500);
      return probe(url, attempt + 1);
    }
    return { ok: false, status: 0, bytes: 0, type: String(e.message) };
  }
}

console.log("Ищу вертикальные ролики в Wikimedia Commons...");
const candidates = await findVertical();
console.log(`Кандидатов: ${candidates.length}`);

const verified = [];
const LIMIT = Number(process.env.LIMIT || 12);
for (const c of candidates) {
  if (verified.length >= LIMIT) break;
  const p = await probe(c.url);
  const mb = p.bytes ? (p.bytes / 1048576).toFixed(1) + "MB" : "?";
  console.log(`  ${p.ok ? "OK  " : "FAIL"} ${String(p.status).padEnd(3)} ${String(c.width).padStart(4)}x${String(c.height).padEnd(5)} ${mb.padEnd(8)} ${c.name.slice(0, 60)}`);
  if (p.ok) verified.push({ ...c, bytes: p.bytes, contentType: p.type });
  await sleep(1500); // троттлинг: Commons не любит пачки запросов подряд
}

writeFileSync("scripts/.vertical-seed.json", JSON.stringify(verified, null, 2), "utf8");
console.log(`\nГотово: ${verified.length} вертикальных ссылок -> scripts/.vertical-seed.json`);