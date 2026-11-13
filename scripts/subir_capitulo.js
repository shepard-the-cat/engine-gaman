import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MANGA_ID = 'berserk';
const CAPITULO = '1';
const URLS_PRUEBA = [
  'https://picsum.photos/1200/1800?random=1',
  'https://picsum.photos/1200/1800?random=2',
  'https://picsum.photos/1200/1800?random=3'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function descargarYOptimizar(url, index) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': new URL(url).origin + '/'
    }
  });

  if (!res.ok) throw new Error(`Error descargando página ${index + 1}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  return await sharp(buffer)
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}

async function subirLoteTelegram(buffers, offsetIndex) {
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);

  const media = buffers.map((buf, i) => {
    const key = `file_${i}`;
    const filename = `${MANGA_ID}_cap${CAPITULO}_p${String(offsetIndex + i + 1).padStart(3, '0')}.webp`;
    formData.append(key, new Blob([buf], { type: 'image/webp' }), filename);
    return { type: 'document', media: `attach://${key}` };
  });

  formData.append('media', JSON.stringify(media));

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API Error: ${JSON.stringify(data)}`);
  }

  return data.result.map((msg) => msg.document.file_id);
}

async function ejecutar() {
  console.log(`Iniciando ingesta: ${MANGA_ID} - Cap. ${CAPITULO} (${URLS_PRUEBA.length} páginas)`);
  const fileIds = [];

  for (let i = 0; i < URLS_PRUEBA.length; i += 10) {
    const bloqueUrls = URLS_PRUEBA.slice(i, i + 10);
    console.log(`Descargando y optimizando páginas ${i + 1} a ${i + bloqueUrls.length}...`);

    const buffers = await Promise.all(
      bloqueUrls.map((url, idx) => descargarYOptimizar(url, i + idx))
    );

    console.log(`Subiendo lote a Telegram...`);
    const idsLote = await subirLoteTelegram(buffers, i);
    fileIds.push(...idsLote);

    if (i + 10 < URLS_PRUEBA.length) await sleep(3000);
  }

  const dirSalida = path.join('data', 'capitulos', MANGA_ID);
  fs.mkdirSync(dirSalida, { recursive: true });

  const payload = {
    manga: MANGA_ID,
    capitulo: CAPITULO,
    total_paginas: fileIds.length,
    actualizado: new Date().toISOString(),
    paginas: fileIds
  };

  const rutaArchivo = path.join(dirSalida, `${CAPITULO}.json`);
  fs.writeFileSync(rutaArchivo, JSON.stringify(payload, null, 2));
  console.log(`Completado. Guardado en ${rutaArchivo}`);
}

ejecutar().catch((err) => {
  console.error(err);
  process.exit(1);
});
