/* Prepara fotos no próprio navegador, como ferramentas/otimizar_fotos.py: WebP com 800 e 1600 px de
   largura (sem aumentar foto pequena), girada como o celular tirou e sem metadados (o canvas não
   copia EXIF nem GPS). O Safari não grava WebP pelo canvas; nele, um codificador WebP em WebAssembly
   é baixado só na primeira foto. PDFs de release viram uma imagem por página, como release_pdf.py. */
const LARGURAS = [800, 1600];
// O codec do jsquash direto (o encode.js do pacote importa um módulo pelo nome, que o navegador não resolve).
const WASM_WEBP = "https://cdn.jsdelivr.net/npm/@jsquash/webp@1.4.0/";
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";

// Reduz pela metade até chegar perto da largura final: um passo só, de 4000 para 800 px, serrilha.
function reduzir(fonte, largura) {
  let w = fonte.naturalWidth || fonte.width, h = fonte.naturalHeight || fonte.height, atual = fonte;
  const alvoW = Math.min(largura, w), alvoH = Math.round(h * alvoW / w);
  while (w / 2 >= alvoW * 1.5) {
    w = Math.round(w / 2); h = Math.round(h / 2);
    atual = desenhar(atual, w, h);
  }
  return desenhar(atual, alvoW, alvoH);
}
function desenhar(fonte, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);   // PNG com transparência: fundo branco
  ctx.drawImage(fonte, 0, 0, w, h);
  return c;
}

let wasm = null;
async function webp(canvas, qualidade) {
  const b = await new Promise(ok => canvas.toBlob(ok, "image/webp", qualidade));
  if (b && b.type === "image/webp") return b;
  try {
    wasm ??= Promise.all([import(WASM_WEBP + "codec/enc/webp_enc.js"), import(WASM_WEBP + "meta.js")])
      .then(async ([codec, meta]) => ({ modulo: await codec.default({ noInitialRun: true }), opcoes: meta.defaultOptions }));
    const { modulo, opcoes } = await wasm;
    const dados = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const saida = modulo.encode(dados.data, dados.width, dados.height, { ...opcoes, quality: Math.round(qualidade * 100) });
    if (!saida) throw new Error("falha ao codificar");
    return new Blob([saida.buffer], { type: "image/webp" });
  } catch (e) {
    wasm = null;
    console.warn("WebP em WebAssembly indisponível; gravando JPEG (o navegador abre igual)", e);
    return new Promise(ok => canvas.toBlob(ok, "image/jpeg", qualidade));
  }
}

async function versoes(fonte, qualidade) {
  const saida = {};
  for (const w of LARGURAS) saida[w] = await webp(reduzir(fonte, w), qualidade);
  return saida;
}

// Foto (JPG, PNG, WebP; HEIC só onde o navegador abre) -> { 800: Blob, 1600: Blob }
export async function prepararFoto(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); }
    catch { throw new Error(`Não consegui abrir “${arquivo.name}”. Envie a foto em JPG ou PNG.`); }
    return await versoes(img, 0.8);
  } finally { URL.revokeObjectURL(url); }
}

let pdfjs = null;
function carregarPdfjs() {
  return pdfjs ??= new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = PDFJS + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjs = null; erro(new Error("Não consegui carregar o leitor de PDF. Confira a internet e tente de novo.")); };
    document.head.append(s);
  });
}

// PDF do release -> [{ 800: Blob, 1600: Blob }, ...], uma por página.
export async function paginasDoPdf(arquivo, aoProgredir = () => {}) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    aoProgredir(`Lendo a página ${i} de ${doc.numPages}…`);
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: 1600 / pg.getViewport({ scale: 1 }).width });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    paginas.push(await versoes(c, 0.82));
  }
  return paginas;
}
