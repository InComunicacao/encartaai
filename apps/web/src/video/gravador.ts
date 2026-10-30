// Gravador MP4 quadro a quadro: WebCodecs (H.264) + mp4-muxer.
//
// Por que não MediaRecorder: ele grava em TEMPO REAL — se o computador
// engasga, o vídeo sai com quadros faltando, duração errada ou em WebM
// com extensão .mp4 (o "vídeo que não abre" da v2). Aqui cada quadro é
// desenhado, entregue ao codificador e só então vem o próximo; o arquivo
// sai com 30 fps constantes e a duração exata, num MP4 comum (faststart,
// não fragmentado), que TV e player de LED aceitam.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { VIDEO_FPS } from '@encartaai/render';

// Do perfil mais alto para o mais compatível. Nível 5.1 cobre até 4K e
// painéis muito largos; Baseline 3.1 é a última tentativa.
const CODECS_H264 = ['avc1.640033', 'avc1.4d0033', 'avc1.640028', 'avc1.42E033', 'avc1.42E01F'];

export const podeGravarMp4 = () => typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';

// Bitrate pela área: ~6 Mbps no Full HD, nunca abaixo de 1,5 Mbps.
export const bitratePara = (w: number, h: number) => Math.round(Math.max(1_500_000, Math.min(12_000_000, (w * h) / (1920 * 1080) * 6_000_000)));

async function escolherConfig(w: number, h: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  for (const codec of CODECS_H264) {
    const cfg: VideoEncoderConfig = { codec, width: w, height: h, bitrate, framerate: VIDEO_FPS, avc: { format: 'avc' }, latencyMode: 'quality' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* tenta o próximo */ }
  }
  return null;
}

export interface Progresso { quadro: number; total: number }

// desenhar(i) deixa o canvas pronto com o quadro i. Devolve o MP4.
export async function gravarMp4(canvas: HTMLCanvasElement, total: number, desenhar: (i: number) => void | Promise<void>,
  aoProgredir?: (p: Progresso) => void, cancelado?: () => boolean): Promise<Blob> {
  if (!podeGravarMp4()) throw new Error('Este navegador não grava MP4. Use o Chrome ou o Edge atualizados.');
  const { width: w, height: h } = canvas;
  if (w % 2 || h % 2) throw new Error(`Medidas ímpares (${w}×${h}): o MP4 exige largura e altura pares.`);
  const cfg = await escolherConfig(w, h, bitratePara(w, h));
  if (!cfg) throw new Error(`O codificador deste computador não aceita ${w}×${h}.`);

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h, frameRate: VIDEO_FPS },
    fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let falha: Error | null = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { falha = e instanceof Error ? e : new Error(String(e)); },
  });
  enc.configure(cfg);
  const passo = 1_000_000 / VIDEO_FPS;
  try {
    for (let i = 0; i < total; i++) {
      if (falha) throw falha;
      if (cancelado?.()) throw new DOMException('Cancelado', 'AbortError');
      await desenhar(i);
      const q = new VideoFrame(canvas, { timestamp: Math.round(i * passo), duration: Math.round(passo) });
      enc.encode(q, { keyFrame: i % (VIDEO_FPS * 2) === 0 });   // um quadro-chave a cada 2 s
      q.close();
      // não deixa a fila do codificador crescer sem limite (memória)
      while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
      if (i % 5 === 0 || i === total - 1) { aoProgredir?.({ quadro: i + 1, total }); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush();
    if (falha) throw falha;
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
}
