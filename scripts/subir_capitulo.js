import fs from 'fs';
import path from 'path';
import https from 'https';
import sharp from 'sharp';
import FormData from 'form-data';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MANGA_ID = 'berserk';
const CAPITULO = '1';
const PAGINAS_PRUEBA = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generarPaginaPrueba(numero) {
  const svg = `
    <svg width="1200" height="1800" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111111"/>
      <rect x="40" y="40" width="1120" height="1720" fill="none" stroke="#f59e0b" stroke-width="8"/>
      <text x="600" y="850" font-family="sans-serif" font-size="72" fill="#ffffff" text-anchor="middle">
        ${MANGA_ID.toUpperCase()} - CAP ${CAPITULO}
      </text>
      <text x="600" y="960" font-family="sans-serif" font-size="48" fill="#f59e0b" text-anchor="middle">
        PAGINA ${numero} (WEBP SIN COMPRESION)
      </text>
    </svg>
  `;

  return await sharp(Buffer.from(svg))
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}

function subirLoteTelegram(buffers, offsetIndex) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    
    // 1. Primero chat_id y el JSON de media
    form.append('chat_id', CHAT_ID);

    const media = buffers.map((_, i) => ({
      type: 'document',
      media: `attach://file_${i}`
    }));
    form.append('media', JSON.stringify(media));

    // 2. Después los archivos binarios referenciados
    buffers.forEach((buf, i) => {
      const key = `file_${i}`;
      const filename = `${MANGA_ID}_cap${CAPITULO}_p${String(offsetIndex + i + 1).padStart(3, '0')}.webp`;
      form.append(key, buf, { filename, contentType: 'image/webp' });
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMediaGroup`,
        method: 'POST',
        headers: form.getHeaders()
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (!data.ok) {
              return reject(new Error(`Telegram API Error: ${body}`));
            }
            resolve(data.result.map((msg) => msg.document.file_id));
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    form.pipe(req);
  });
}

async function ejecutar() {
  console.log(`Iniciando ingesta: ${MANGA_ID} - Cap. ${CAPITULO} (${PAGINAS_PRUEBA} páginas)`);
  const fileIds = [];

  for (let i = 0; i < PAGINAS_PRUEBA; i += 10) {
    const cantidad = Math.min(10, PAGINAS_PRUEBA - i);
    console.log(`Generando y optimizando páginas ${i + 1} a ${i + cantidad}...`);

    const buffers = await Promise.all(
      Array.from({ length: cantidad }, (_, idx) => generarPaginaPrueba(i + idx + 1))
    );

    console.log(`Subiendo lote a Telegram...`);
    const idsLote = await subirLoteTelegram(buffers, i);
    fileIds.push(...idsLote);

    if (i + 10 < PAGINAS_PRUEBA) await sleep(3000);
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
