/* Conversa com a API do GitHub usando a chave (token fine-grained, só deste repositório, com
   permissão Contents: leitura e escrita). Publicar = um commit na main com o conteudo.json e as
   fotos novas juntos; o GitHub Pages republica o site em cerca de um minuto. */
export const REPO = "rafeiguer/vai-de-rural", RAMO = "main", ARQUIVO = "conteudo.json", PASTA_FOTOS = "assets/fotos";
const API = `https://api.github.com/repos/${REPO}`;

export class ErroGitHub extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

export function cliente(chave) {
  async function chamar(caminho, { metodo = "GET", corpo } = {}) {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${chave}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(corpo ? { "Content-Type": "application/json" } : {})
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: "no-store"
    });
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).message || msg; } catch {}
      throw new ErroGitHub(r.status, msg);
    }
    return r.status === 204 ? null : r.json();
  }

  const decodificar = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
  const base64DeBlob = blob => new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(",")[1]);
    fr.onerror = () => erro(fr.error);
    fr.readAsDataURL(blob);
  });

  return {
    // Confere se a chave abre o repositório.
    testar: () => chamar(""),

    // Conteúdo publicado agora: { conteudo, sha } (sha do arquivo, para saber se alguém mudou depois).
    async lerConteudo() {
      const j = await chamar(`/contents/${ARQUIVO}?ref=${RAMO}`);
      return { conteudo: JSON.parse(decodificar(j.content)), sha: j.sha };
    },

    // Nomes de arquivo em assets/fotos (para numerar fotos novas sem repetir).
    async listarFotos() {
      const j = await chamar(`/contents/${PASTA_FOTOS}?ref=${RAMO}`);
      return j.map(a => a.name);
    },

    // sha do conteudo.json publicado agora (sem baixar o texto), para conferir antes de publicar.
    async shaConteudo() {
      const j = await chamar(`/contents/${ARQUIVO}?ref=${RAMO}`);
      return j.sha;
    },

    /* Um commit com tudo: arquivos = [{ caminho, texto } | { caminho, blob }].
       Se outro commit entrar no meio (ref andou), tenta de novo sobre o novo topo. */
    async publicar(arquivos, mensagem, aoProgredir = () => {}) {
      const itens = [];
      for (const [k, a] of arquivos.entries()) {
        aoProgredir(`Enviando ${k + 1} de ${arquivos.length}…`);
        const blob = a.blob
          ? await chamar("/git/blobs", { metodo: "POST", corpo: { content: await base64DeBlob(a.blob), encoding: "base64" } })
          : await chamar("/git/blobs", { metodo: "POST", corpo: { content: a.texto, encoding: "utf-8" } });
        itens.push({ path: a.caminho, mode: "100644", type: "blob", sha: blob.sha });
      }
      aoProgredir("Gravando…");
      for (let tentativa = 0; ; tentativa++) {
        const ref = await chamar(`/git/ref/heads/${RAMO}`);
        const topo = await chamar(`/git/commits/${ref.object.sha}`);
        const arvore = await chamar("/git/trees", { metodo: "POST", corpo: { base_tree: topo.tree.sha, tree: itens } });
        const commit = await chamar("/git/commits", { metodo: "POST", corpo: { message: mensagem, tree: arvore.sha, parents: [topo.sha] } });
        try {
          await chamar(`/git/refs/heads/${RAMO}`, { metodo: "PATCH", corpo: { sha: commit.sha } });
          // sha de cada arquivo gravado (o do conteudo.json vira a nova base da edição)
          return Object.fromEntries(itens.map(i => [i.path, i.sha]));
        } catch (e) {
          if (e.status !== 422 || tentativa >= 2) throw e;
        }
      }
    }
  };
}
