#!/usr/bin/env node
/**
 * Проверяет, что прямые ссылки из seed-данных реально отдают видео (200 + video/*).
 * Запуск:  npm run media:check
 *
 * Зачем: сервер не хранит файлы — только метаданные. Поэтому "живость" ссылки
 * целиком в зоне ответственности разработчика, и она обязана проверяться
 * автоматически, а не "на глаз".
 */

const CANDIDATES = [
  // 9:16 / вертикальные кандидаты
  "https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4",
  "https://videos.pexels.com/video-files/4people/3195394/3195394-uhd_2560_1440_25fps.mp4",
  "https://player.vimeo.com/external/434045526.hd.mp4?s=27",
  "https://player.vimeo.com/external/357274789.hd.mp4?s=27",
  // Надёжные тестовые CDN
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantDream.mp4",
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
  "https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4",
  "https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4",
  "https://mdn.github.io/shared-assets/videos/flower.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://download.samplelib.com/mp4/sample-5s.mp4",
  "https://download.samplelib.com/mp4/sample-10s.mp4",
  "https://download.samplelib.com/mp4/sample-15s.mp4",
  "https://download.samplelib.com/mp4/sample-20s.mp4",
  "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
  "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
  "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
  "https://filesamples.com/samples/video/mp4/sample_960x400_ocean_with_audio.mp4",
  "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4",
  "https://media.w3.org/2010/05/bunny/trailer.mp4",
  "https://media.w3.org/2010/05/video/movie_300.mp4",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(url) {
  // HEAD — дёшево; многие CDN не отдают CORS/HEAD корректно, поэтому есть фолбэк.
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
    const type = r.headers.get("content-type") || "";
    const len = Number(r.headers.get("content-length") || 0);
    if (r.ok && (type.startsWith("video/") || url.endsWith(".mp4"))) {
      return { url, ok: true, status: r.status, type, bytes: len };
    }
  } catch {
    /* игнорируем, пробуем GET */
  }
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-2047", "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    const type = r.headers.get("content-type") || "";
    const cr = r.headers.get("content-range") || "";
    const total = cr.includes("/") ? Number(cr.split("/")[1]) : Number(r.headers.get("content-length") || 0);
    const buf = r.body ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
    const isMp4 = buf.length > 8 && buf.subarray(4, 8).toString("latin1") === "ftyp";
    return {
      url,
      ok: r.ok && (type.startsWith("video/") || isMp4),
      status: r.status,
      type,
      bytes: total,
      mp4: isMp4,
    };
  } catch (e) {
    return { url, ok: false, status: 0, type: String(e.message || e), bytes: 0 };
  }
}

const results = [];
await Promise.all(
  CANDIDATES.map(async (u) => {
    const r = await probe(u);
    results.push(r);
    const mb = r.bytes ? (r.bytes / 1048576).toFixed(1) + "MB" : "?";
    console.log(`${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(3)} ${(r.type || "-").slice(0, 24).padEnd(24)} ${mb.padEnd(8)} ${u}`);
  })
);

const good = results.filter((r) => r.ok);
console.log(`\n=== ИТОГ: ${good.length}/${results.length} ссылок живы ===`);
good.sort((a, b) => a.bytes - b.bytes).forEach((r) => console.log(`  ${r.url}  (${(r.bytes / 1048576).toFixed(1)} MB)`));