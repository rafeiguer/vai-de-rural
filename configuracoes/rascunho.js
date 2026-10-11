/* Rascunho da tela Configurações, guardado no IndexedDB deste navegador: o conteúdo em edição,
   as fotos novas (Blobs WebP de 800 e 1600 px, ainda não publicadas) e o sha do conteudo.json
   de onde a edição partiu. Sobrevive a fechar a aba; a prévia (index.html?previa) lê daqui. */
const BANCO = "vai-de-rural-configuracoes", LOJA = "rascunho", CHAVE = "atual";

function abrir() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function operar(modo, fazer) {
  const db = await abrir();
  try {
    return await new Promise((ok, erro) => {
      const tx = db.transaction(LOJA, modo), req = fazer(tx.objectStore(LOJA));
      tx.oncomplete = () => ok(req.result);
      tx.onerror = tx.onabort = () => erro(tx.error);
    });
  } finally { db.close(); }
}

/* As fotos são guardadas como bytes (ArrayBuffer) e voltam como Blob: alguns WebKit recusam Blob no IndexedDB. */
const fotosEmBytes = async fotos => Object.fromEntries(await Promise.all(Object.entries(fotos || {}).map(async ([id, f]) =>
  [id, { 800: { tipo: f[800].type, bytes: await f[800].arrayBuffer() }, 1600: { tipo: f[1600].type, bytes: await f[1600].arrayBuffer() } }])));
const fotosEmBlob = fotos => Object.fromEntries(Object.entries(fotos || {}).map(([id, f]) =>
  [id, { 800: new Blob([f[800].bytes], { type: f[800].tipo }), 1600: new Blob([f[1600].bytes], { type: f[1600].tipo }) }]));

// { conteudo, fotos: { id: { 800: Blob, 1600: Blob } }, base, alterado } ou null
export const lerRascunho = () => operar("readonly", loja => loja.get(CHAVE)).then(r => r ? { ...r, fotos: fotosEmBlob(r.fotos) } : null);
export async function gravarRascunho(r) {
  const fotos = await fotosEmBytes(r.fotos);
  return operar("readwrite", loja => loja.put({ ...r, fotos }, CHAVE));
}
export const apagarRascunho = () => operar("readwrite", loja => loja.delete(CHAVE));
