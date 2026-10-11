/* Tela Configurações: edita conteudo.json por formulários, prepara fotos novas no navegador e publica
   tudo num commit (github.js). O rascunho fica no IndexedDB (rascunho.js) a cada mudança, então dá para
   fechar a aba e continuar depois, e a prévia (index.html?previa) mostra o site com ele. */
import { lerRascunho, gravarRascunho, apagarRascunho } from "./rascunho.js";
import { cliente, ErroGitHub, REPO, RAMO, ARQUIVO, PASTA_FOTOS } from "./github.js";
import { prepararFoto, paginasDoPdf } from "./imagens.js";

const CHAVE_LOCAL = "vdr-chave";
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const est = {
  gh: null, conteudo: null, publicado: null, base: null,
  fotos: {},          // fotos novas: { id: { 800: Blob, 1600: Blob } }
  urls: {},           // miniaturas das fotos novas (continuam valendo depois de publicar)
  nomes: new Set(),   // ids que já existem em assets/fotos
  listou: false, alterado: false, aba: "inicio", ed: null
};

/* ---------- Montar elementos ---------- */
function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value" || k === "checked") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...filhos.flat(Infinity).filter(f => f != null && f !== false));
  return el;
}
const clonar = o => JSON.parse(JSON.stringify(o));
const ordinal = n => `${n}ª`;
let idCampo = 0;
const novoIdCampo = () => `c${++idCampo}`;

/* ---------- Rascunho e estado ---------- */
let tempoGuardar, porGuardar = false;
function mudou({ redesenhar = false } = {}) {
  est.alterado = porGuardar = true;
  barra();
  clearTimeout(tempoGuardar);
  tempoGuardar = setTimeout(guardar, 400);
  if (redesenhar) desenharAba();
}
const guardar = () => {
  clearTimeout(tempoGuardar);
  porGuardar = false;
  return gravarRascunho({ conteudo: est.conteudo, fotos: est.fotos, base: est.base, alterado: est.alterado })
    .catch(e => { porGuardar = true; console.warn("Rascunho não gravado", e); });
};
// Sair da aba ou trocar de app no celular: grava o que ainda estava esperando os 400 ms.
document.addEventListener("visibilitychange", () => { if (document.hidden && porGuardar) guardar(); });

/* ---------- Avisos e progresso ---------- */
function aviso(texto, tipo = "info") {
  const caixa = $("#avisos");
  const el = h("div", { class: `aviso aviso--${tipo}`, role: tipo === "erro" ? "alert" : "status" }, texto,
    h("button", { class: "aviso__fechar", "aria-label": "Fechar aviso", onclick: () => el.remove() }, "×"));
  caixa.append(el);
  if (tipo !== "erro") setTimeout(() => el.remove(), 6000);
}
function progresso(texto) {
  const el = $("#progresso");
  el.hidden = !texto;
  $(".progresso__texto", el).textContent = texto || "";
}
async function comProgresso(texto, fazer) {
  progresso(texto);
  try { return await fazer(); }
  catch (e) { console.error(e); aviso(mensagemErro(e), "erro"); }
  finally { progresso(""); }
}
function mensagemErro(e) {
  if (e instanceof ErroGitHub) {
    if (e.status === 401) return "A chave de acesso não vale mais (venceu ou foi apagada). Peça uma nova ao Rafa e entre de novo.";
    if (e.status === 403 || e.status === 404) return "Esta chave não tem permissão para gravar no site. Peça ao Rafa para conferir.";
    return `O GitHub respondeu com um erro (${e.status}): ${e.message}`;
  }
  if (e instanceof TypeError) return "Sem conexão com a internet. Suas mudanças estão guardadas neste aparelho; tente de novo daqui a pouco.";
  return e.message || String(e);
}

/* ---------- Fotos ---------- */
const RAW = `https://raw.githubusercontent.com/${REPO}/${RAMO}/${PASTA_FOTOS}/`;
function urlFoto(id) {
  if (est.urls[id]) return est.urls[id];
  if (est.fotos[id]) return (est.urls[id] = URL.createObjectURL(est.fotos[id][800]));
  return `${PASTA_FOTOS}/${encodeURIComponent(id)}-800.webp`;
}
// Foto recém-publicada ainda não está no site (o Pages leva um minuto): busca direto no GitHub.
const miniatura = (id, alt = "") => h("img", {
  src: urlFoto(id), alt, loading: "lazy", decoding: "async",
  onerror: ev => { const i = ev.currentTarget; if (!i.dataset.raw) { i.dataset.raw = "1"; i.src = `${RAW}${encodeURIComponent(id)}-800.webp`; } }
});

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function novoId(prefixo) {
  if (!est.listou) return `${prefixo}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const re = new RegExp(`^${escRe(prefixo)}-(\\d+)$`);
  let max = 0;
  for (const id of [...est.nomes, ...Object.keys(est.fotos)]) { const m = id.match(re); if (m) max = Math.max(max, Number(m[1])); }
  const id = `${prefixo}-${String(max + 1).padStart(2, "0")}`;
  est.nomes.add(id);
  return id;
}
const idsDeArquivos = nomes => new Set(nomes.map(n => n.replace(/-(800|1600)\.webp$/, "")));

// Lê os arquivos escolhidos e devolve os ids das fotos novas (as que deram erro são avisadas e puladas).
async function receberFotos(arquivos, prefixo) {
  const ids = [];
  for (const [k, arq] of [...arquivos].entries()) {
    progresso(arquivos.length > 1 ? `Preparando foto ${k + 1} de ${arquivos.length}…` : "Preparando a foto…");
    try {
      const v = await prepararFoto(arq);
      const id = novoId(prefixo);
      est.fotos[id] = v;
      ids.push(id);
    } catch (e) { aviso(e.message, "erro"); }
  }
  progresso("");
  return ids;
}
const botaoArquivo = (rotulo, { multiplo = true, aceitar = "image/*", aoEscolher }) => {
  const id = novoIdCampo();
  return h("span", { class: "arquivo" },
    h("input", { type: "file", id, accept: aceitar, multiple: multiplo, class: "sr",
      onchange: async ev => { const fs = [...ev.target.files]; ev.target.value = ""; if (fs.length) await aoEscolher(fs); } }),
    h("label", { for: id, class: "botao botao--claro" }, rotulo));
};

/* ---------- Componentes de formulário ---------- */
// Campo de texto ligado a obj[chave].
function campo(rotulo, obj, chave, { area = false, dica, tipo = "text", placeholder, aoMudar } = {}) {
  const id = novoIdCampo();
  const entrada = area
    ? h("textarea", { id, rows: 3, value: obj[chave] ?? "", placeholder })
    : h("input", { id, type: tipo, value: obj[chave] ?? "", placeholder });
  entrada.addEventListener("input", () => { obj[chave] = entrada.value; aoMudar && aoMudar(entrada.value); mudou(); });
  if (area) autoAltura(entrada);
  return h("div", { class: "campo" }, h("label", { for: id }, rotulo), dica && h("p", { class: "dica" }, dica), entrada);
}
function autoAltura(t) {
  const ajustar = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + 4 + "px"; };
  t.addEventListener("input", ajustar);
  requestAnimationFrame(ajustar);
}
function caixaMarcar(rotulo, obj, chave, { dica } = {}) {
  const id = novoIdCampo();
  return h("div", { class: "campo campo--marcar" },
    h("input", { type: "checkbox", id, checked: !!obj[chave], onchange: ev => { obj[chave] = ev.target.checked; mudou(); } }),
    h("label", { for: id }, rotulo), dica && h("p", { class: "dica" }, dica));
}
function seletorEdicao(valor, aoMudar, { rotulo = "Edição", vazio = "Nenhuma" } = {}) {
  const id = novoIdCampo();
  return h("div", { class: "campo campo--curto" }, h("label", { for: id }, rotulo),
    h("select", { id, onchange: ev => aoMudar(ev.target.value ? Number(ev.target.value) : null) },
      vazio != null && h("option", { value: "" }, vazio),
      est.conteudo.edicoes.map(e => h("option", { value: e.n, selected: e.n === valor }, `${ordinal(e.n)} edição`))));
}
// Botões de mover e apagar um item de uma lista.
function controles(lista, k, { rotulo = "item", confirmar } = {}) {
  // preventDefault: dentro do título de um cartão (summary), o clique não abre nem fecha o cartão.
  const mover = (ev, d) => { ev.preventDefault(); const [x] = lista.splice(k, 1); lista.splice(k + d, 0, x); mudou({ redesenhar: true }); };
  return h("span", { class: "controles" },
    h("button", { type: "button", class: "icone", title: "Subir", "aria-label": `Subir ${rotulo}`, disabled: k === 0, onclick: ev => mover(ev, -1) }, "↑"),
    h("button", { type: "button", class: "icone", title: "Descer", "aria-label": `Descer ${rotulo}`, disabled: k === lista.length - 1, onclick: ev => mover(ev, 1) }, "↓"),
    h("button", { type: "button", class: "icone icone--apagar", title: "Apagar", "aria-label": `Apagar ${rotulo}`,
      onclick: ev => { ev.preventDefault(); if (confirmar && !confirm(confirmar)) return; lista.splice(k, 1); mudou({ redesenhar: true }); } }, "✕"));
}
// Lista de parágrafos (ou linhas curtas) em obj[chave]. Depois de "Adicionar", o cursor vai para o novo.
let focarLista = null;
function paragrafos(rotulo, obj, chave, { dica, curto = false, novo = "Adicionar parágrafo" } = {}) {
  const lista = obj[chave] ??= [];
  const ents = lista.map((_, k) => {
    const ent = curto ? h("input", { type: "text", value: lista[k], "aria-label": `${rotulo}, ${k + 1}` })
                      : h("textarea", { rows: 3, value: lista[k], "aria-label": `${rotulo}, parágrafo ${k + 1}` });
    ent.addEventListener("input", () => { lista[k] = ent.value; mudou(); });
    if (!curto) autoAltura(ent);
    return ent;
  });
  if (focarLista === lista && ents.length) { focarLista = null; requestAnimationFrame(() => ents[ents.length - 1].focus()); }
  return h("fieldset", { class: "grupo" }, h("legend", {}, rotulo), dica && h("p", { class: "dica" }, dica),
    ents.map((ent, k) => h("div", { class: "linha" }, ent, controles(lista, k, { rotulo: curto ? "linha" : "parágrafo" }))),
    h("button", { type: "button", class: "botao botao--claro", onclick: () => { lista.push(""); focarLista = lista; mudou({ redesenhar: true }); } }, `+ ${novo}`));
}
// Pares de textos (ex.: [lugar, município]).
function pares(rotulo, lista, [r1, r2], { dica, novo = "Adicionar", area2 = false } = {}) {
  return h("fieldset", { class: "grupo" }, h("legend", {}, rotulo), dica && h("p", { class: "dica" }, dica),
    lista.map((par, k) => h("div", { class: "linha linha--par" },
      h("div", { class: "par" },
        h("input", { type: "text", value: par[0] ?? "", "aria-label": `${r1} ${k + 1}`, placeholder: r1, oninput: ev => { par[0] = ev.target.value; mudou(); } }),
        area2 ? (() => { const t = h("textarea", { rows: 2, value: par[1] ?? "", "aria-label": `${r2} ${k + 1}`, placeholder: r2, oninput: ev => { par[1] = ev.target.value; mudou(); } }); autoAltura(t); return t; })()
              : h("input", { type: "text", value: par[1] ?? "", "aria-label": `${r2} ${k + 1}`, placeholder: r2, oninput: ev => { par[1] = ev.target.value; mudou(); } })),
      controles(lista, k))),
    h("button", { type: "button", class: "botao botao--claro", onclick: () => { lista.push(["", ""]); mudou({ redesenhar: true }); } }, `+ ${novo}`));
}

/* Grade de fotos. lista: ids (texto) ou objetos { id, legenda, edicao }.
   prefixo: nome das fotos novas (ed7 -> ed7-63). legenda/edicao: mostra esses campos. */
function grade(rotulo, lista, { prefixo, objetos = false, legenda = false, edicao = false, escolher = false, pdf = false, dica } = {}) {
  const idDe = it => objetos ? it.id : it;
  const novos = ids => { if (!ids.length) return; lista.push(...ids.map(id => objetos ? { id } : id)); mudou({ redesenhar: true }); };
  return h("fieldset", { class: "grupo" }, h("legend", {}, rotulo), dica && h("p", { class: "dica" }, dica),
    lista.length ? h("ol", { class: "fotos" }, lista.map((it, k) => h("li", { class: "foto" },
      h("div", { class: "foto__img" }, miniatura(idDe(it)), est.fotos[idDe(it)] && h("span", { class: "selo" }, "nova")),
      legenda && (() => {
        const t = h("textarea", { rows: 2, value: it.legenda || "", placeholder: "Legenda (opcional)", "aria-label": `Legenda da foto ${k + 1}`,
          oninput: ev => { ev.target.value ? it.legenda = ev.target.value : delete it.legenda; mudou(); } });
        autoAltura(t);
        return t;
      })(),
      edicao && seletorEdicao(it.edicao ?? null, n => { n ? it.edicao = n : delete it.edicao; mudou(); }),
      controles(lista, k, { rotulo: "foto" }))))
    : h("p", { class: "vazio" }, "Nenhuma foto ainda."),
    h("div", { class: "acoes" },
      botaoArquivo(pdf ? "+ Enviar páginas (fotos)" : "+ Enviar fotos", { aoEscolher: async fs => novos(await receberFotos(fs, prefixo)) }),
      pdf && botaoArquivo("+ Enviar o PDF do release", { multiplo: false, aceitar: "application/pdf", aoEscolher: async ([arq]) => {
        if (lista.length && !confirm("Trocar as páginas atuais pelas do PDF?")) return;
        const paginas = await comProgresso("Abrindo o PDF…", () => paginasDoPdf(arq, progresso));
        if (!paginas) return;
        const ids = paginas.map(v => { const id = novoId(prefixo); est.fotos[id] = v; return id; });
        lista.splice(0, lista.length, ...ids);
        mudou({ redesenhar: true });
        aviso(`${ids.length} páginas prontas. Confira e clique em Publicar.`);
      } }),
      escolher && h("button", { type: "button", class: "botao botao--claro", onclick: () => escolherExistentes(ids => novos(ids)) }, "+ Escolher das fotos do site")));
}

// Uma foto só (cartaz, retrato): obj[chave] = id.
function fotoUnica(rotulo, obj, chave, prefixo, { dica } = {}) {
  return h("fieldset", { class: "grupo" }, h("legend", {}, rotulo), dica && h("p", { class: "dica" }, dica),
    obj[chave] ? h("div", { class: "foto foto--unica" }, h("div", { class: "foto__img" }, miniatura(obj[chave]))) : h("p", { class: "vazio" }, "Sem foto."),
    h("div", { class: "acoes" },
      botaoArquivo(obj[chave] ? "Trocar" : "+ Enviar", { multiplo: false, aoEscolher: async fs => {
        const [id] = await receberFotos(fs, prefixo);
        if (id) { obj[chave] = id; mudou({ redesenhar: true }); }
      } }),
      obj[chave] && h("button", { type: "button", class: "botao botao--claro", onclick: () => { obj[chave] = ""; mudou({ redesenhar: true }); } }, "Tirar")));
}

// Janela com todas as fotos já usadas no site, para reaproveitar (Mural, colagem, artistas).
function escolherExistentes(aoEscolher) {
  const C = est.conteudo, grupos = [
    ...C.edicoes.map(e => [`${ordinal(e.n)} edição`, e.fotos.map(f => f.id)]),
    ["Mural", C.mural.map(f => f.id)],
    ["Tripulantes", C.artistas.flatMap(a => a.fotos)]
  ].map(([t, ids]) => [t, [...new Set(ids)]]).filter(([, ids]) => ids.length);
  const marcadas = new Set();
  const dlg = h("dialog", { class: "escolher", "aria-label": "Escolher fotos" },
    h("div", { class: "escolher__topo" }, h("h2", {}, "Escolha as fotos"),
      h("button", { type: "button", class: "icone", "aria-label": "Fechar", onclick: () => dlg.close() }, "×")),
    h("div", { class: "escolher__lista" }, grupos.map(([t, ids]) => [h("h3", {}, t), h("div", { class: "escolher__fotos" },
      ids.map(id => h("button", { type: "button", class: "escolher__foto", "aria-pressed": "false", onclick: ev => {
        const b = ev.currentTarget, sim = !marcadas.has(id);
        sim ? marcadas.add(id) : marcadas.delete(id);
        b.setAttribute("aria-pressed", String(sim));
      } }, miniatura(id))))])),
    h("div", { class: "escolher__base" },
      h("button", { type: "button", class: "botao", onclick: () => { dlg.close(); if (marcadas.size) aoEscolher([...marcadas]); } }, "Adicionar as escolhidas")));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

/* ---------- Abas ---------- */
const ABAS = [
  ["inicio", "Início e Sobre", "#/"],
  ["edicoes", "Edições", null],
  ["videos", "Vídeos", "#/videos"],
  ["mural", "Mural", "#/mural"],
  ["artistas", "Tripulantes", "#/tripulantes"],
  ["equipe", "Equipe e créditos", "#/creditos"],
  ["comunidades", "Comunidades", "#/edicoes"]
];
const rotaPrevia = () => est.aba === "edicoes" ? `#/edicao/${est.ed}` : ABAS.find(a => a[0] === est.aba)[2];

const PAGINAS = {
  inicio() {
    const P = est.conteudo.projeto;
    return [
      h("p", { class: "intro" }, "Textos da página inicial, da página Sobre e do rodapé."),
      campo("Frase de chamada", P, "chamada", { area: true, dica: "Aparece embaixo do título, na abertura do site." }),
      campo("Lema", P, "lema"),
      paragrafos("Resumo (A Rural em poucas palavras)", P, "resumo", { dica: "Frases curtas e simples: é o texto que o botão “Ouvir” lê em voz alta." }),
      paragrafos("Sobre a mostra (página inicial)", P, "sobre"),
      paragrafos("Texto da página Sobre", P, "textoSobre"),
      pares("Números", P.fatos, ["Número", "O que é"], { dica: "Só use números confirmados pela produção.", novo: "Adicionar número" }),
      h("fieldset", { class: "grupo" }, h("legend", {}, "O que a Rural leva"),
        P.linguagens.map(l => h("div", { class: "sub" }, campo("Nome", l, "nome"), campo("Texto", l, "texto", { area: true })))),
      grade("Fotos da abertura", P.colagem, { prefixo: "capa", escolher: true, dica: "Giram no carrossel da página inicial, junto com a primeira foto de cada edição." }),
      paragrafos("Palavras da faixa que corre", P, "faixa", { curto: true, novo: "Adicionar palavra" }),
      campo("E-mail de contato", P, "contato", { tipo: "email" }),
      pares("Quem faz (rodapé)", P.parceiros, ["Título", "Texto"], { area2: true, novo: "Adicionar" })
    ];
  },

  edicoes() {
    const EDS = est.conteudo.edicoes;
    est.ed = EDS.some(e => e.n === est.ed) ? est.ed : EDS[EDS.length - 1].n;
    const e = EDS.find(x => x.n === est.ed);
    const escolher = h("div", { class: "chips", role: "group", "aria-label": "Escolha a edição" },
      EDS.map(x => h("button", { type: "button", class: "chip", style: `--c:${x.cor}`, "aria-pressed": String(x.n === est.ed),
        onclick: () => { est.ed = x.n; desenharAba(true); } }, `${ordinal(x.n)} ${x.ano ? `(${x.ano})` : ""}`)),
      h("button", { type: "button", class: "chip chip--novo", onclick: novaEdicao }, "+ Nova edição"));
    return [
      escolher,
      h("h2", { class: "titulo-ed" }, `${ordinal(e.n)} edição`),
      h("div", { class: "duas" },
        campo("Título (os lugares)", e, "titulo"),
        campo("Ano", e, "ano", { placeholder: "2026" })),
      h("div", { class: "campo campo--curto" }, h("label", { for: "cor-ed" }, "Cor da edição"),
        h("input", { type: "color", id: "cor-ed", value: e.cor, oninput: ev => { e.cor = ev.target.value; mudou(); } })),
      paragrafos("Ficha (datas e informações curtas)", e, "ficha", { curto: true, novo: "Adicionar linha" }),
      pares("Por onde a Rural passou", e.locais ??= [], ["Lugar", "Município"], {
        dica: "Na ordem da viagem. Se o lugar tiver texto na aba Comunidades, escreva o nome igualzinho para o texto aparecer.", novo: "Adicionar parada" }),
      paragrafos("Texto da edição", e, "texto", { dica: "Para linkar um nome: [Nome](#/tripulantes) leva à página Tripulantes; [Nome](https://site.com) abre outro site." }),
      caixaMarcar("Mostrar o aviso “Página em montagem”", e, "pendente"),
      fotoUnica("Cartaz", e, "cartaz", `ed${e.n}-cartaz`),
      grade("Fotos", e.fotos, { prefixo: `ed${e.n}`, objetos: true, legenda: true, escolher: true,
        dica: "A primeira foto é a capa da edição. Sem legenda, aparece o título da edição." }),
      grade("Release (páginas)", e.release ??= [], { prefixo: `ed${e.n}-release`, pdf: true, dica: "Envie o PDF do release: cada página vira uma imagem." })
    ];
  },

  videos() {
    const V = est.conteudo.videos, entrada = h("input", { type: "url", id: "novo-video", placeholder: "https://www.youtube.com/watch?v=…" });
    const adicionar = () => {
      const id = idYouTube(entrada.value);
      if (!id) return aviso("Não reconheci esse link. Copie o endereço do vídeo no YouTube (botão Compartilhar).", "erro");
      if (V.some(v => v.id === id)) return aviso("Esse vídeo já está na lista.", "erro");
      V.unshift({ id, edicao: null });
      mudou({ redesenhar: true });
      aviso("Vídeo adicionado no começo da lista.");
    };
    return [
      h("p", { class: "intro" }, "Os vídeos ficam no YouTube; aqui você cola o link. O título vem do YouTube, a não ser que você escreva outro."),
      h("div", { class: "campo novo-video" }, h("label", { for: "novo-video" }, "Link do vídeo no YouTube"),
        h("div", { class: "linha" }, entrada, h("button", { type: "button", class: "botao", onclick: adicionar }, "Adicionar"))),
      h("ol", { class: "videos" }, V.map((v, k) => h("li", { class: "video" },
        h("img", { src: `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`, alt: "", loading: "lazy" }),
        h("div", { class: "video__campos" },
          campo("Título", v, "titulo", { placeholder: "(o título do YouTube)" }),
          seletorEdicao(v.edicao, n => { v.edicao = n; mudou(); }, { vazio: "Descobrir pelo título" }),
          h("a", { href: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`, target: "_blank", rel: "noopener", class: "link" }, "Abrir no YouTube")),
        controles(V, k, { rotulo: "vídeo", confirmar: "Tirar este vídeo do site?" }))))
    ];
  },

  mural() {
    return [
      h("p", { class: "intro" }, "Fotos da página Mural, na ordem em que aparecem. Com a edição marcada, a foto entra no filtro daquela edição."),
      grade("Fotos do Mural", est.conteudo.mural, { prefixo: "mural", objetos: true, legenda: true, edicao: true, escolher: true })
    ];
  },

  artistas() {
    const A = est.conteudo.artistas;
    return [
      h("p", { class: "intro" }, "Cartões dos artistas na página Tripulantes, com fotos e texto. A primeira foto é a capa."),
      A.map((a, k) => h("details", { class: "cartao", open: a._aberto },
        h("summary", {}, a.fotos[0] ? miniatura(a.fotos[0]) : h("span", { class: "sem-foto" }), h("strong", {}, a.nome || "(sem nome)"), controles(A, k, { rotulo: "artista", confirmar: `Apagar o cartão de ${a.nome || "este artista"}?` })),
        h("div", { class: "cartao__corpo" },
          campo("Nome", a, "nome"),
          campo("Legenda embaixo da foto", a, "legenda", { placeholder: "Tripulante …" }),
          campo("Instagram (sem o @)", a, "instagram"),
          paragrafos("Texto", a, "texto", { dica: "Para linkar um site: [www.site.com](https://www.site.com)." }),
          grade("Fotos", a.fotos, { prefixo: "trip", escolher: true })))),
      h("button", { type: "button", class: "botao", onclick: () => { A.push({ nome: "", texto: [], fotos: [] }); mudou({ redesenhar: true }); abrirUltimo(); } }, "+ Novo artista")
    ];
  },

  equipe() {
    const T = est.conteudo.tripulantes;
    const funcoes = (p, chave, rotulo) => {
      const mapa = p[chave] ??= {};
      const linhas = Object.entries(mapa);
      return h("fieldset", { class: "grupo" }, h("legend", {}, rotulo),
        linhas.map(([n, f]) => h("div", { class: "linha linha--funcao" },
          seletorEdicao(Number(n), novo => {
            if (!novo || mapa[novo] != null) return desenharAba();
            const novoMapa = {}; for (const [k, v] of Object.entries(mapa)) novoMapa[k === n ? novo : k] = v;
            p[chave] = novoMapa; mudou({ redesenhar: true });
          }, { vazio: null }),
          h("input", { type: "text", value: f, "aria-label": `${rotulo} na ${ordinal(n)} edição`, oninput: ev => { mapa[n] = ev.target.value; mudou(); } }),
          h("button", { type: "button", class: "icone icone--apagar", "aria-label": "Apagar", onclick: () => { delete mapa[n]; mudou({ redesenhar: true }); } }, "✕"))),
        h("button", { type: "button", class: "botao botao--claro", onclick: () => {
          const livre = est.conteudo.edicoes.map(e => e.n).reverse().find(n => mapa[n] == null);
          if (livre == null) return;
          mapa[livre] = ""; mudou({ redesenhar: true });
        } }, "+ Adicionar edição"));
    };
    return [
      h("p", { class: "intro" }, "Equipe e convidados de cada edição. Quem está marcado “só nos créditos” aparece na página Créditos, e não em cartão."),
      T.map((p, k) => h("details", { class: "cartao", open: p._aberto },
        h("summary", {}, h("strong", {}, p.nome || "(sem nome)"), p.creditos && h("span", { class: "selo selo--leve" }, "créditos"),
          controles(T, k, { rotulo: "pessoa", confirmar: `Tirar ${p.nome || "esta pessoa"} do site?` })),
        h("div", { class: "cartao__corpo" },
          campo("Nome", p, "nome"),
          caixaMarcar("Só nos créditos (sem cartão)", p, "creditos"),
          funcoes(p, "equipe", "Equipe (função em cada edição)"),
          funcoes(p, "convidado", "Convidado (descrição em cada edição)"),
          fotoUnica("Foto do cartão", p, "foto", "trip", { dica: "Sem foto, usa a do cartão de artista com o mesmo nome, ou as iniciais." })))),
      h("button", { type: "button", class: "botao", onclick: () => { T.push({ nome: "", foto: "", equipe: {} }); mudou({ redesenhar: true }); abrirUltimo(); } }, "+ Nova pessoa")
    ];
  },

  comunidades() {
    const C = est.conteudo.comunidades, nomes = Object.keys(C);
    const renomear = (antigo, novo) => {
      const copia = {}; for (const [k, v] of Object.entries(C)) copia[k === antigo ? novo : k] = v;
      for (const k of Object.keys(C)) delete C[k];
      Object.assign(C, copia);
    };
    return [
      h("p", { class: "intro" }, "Texto sobre cada lugar. Aparece na página de toda edição que passou por ali; o nome tem que ser igual ao da parada na aba Edições."),
      nomes.map(nome => h("details", { class: "cartao" },
        h("summary", {}, h("strong", {}, nome),
          h("span", { class: "controles" }, h("button", { type: "button", class: "icone icone--apagar", "aria-label": `Apagar ${nome}`,
            onclick: ev => { ev.preventDefault(); if (confirm(`Apagar o texto de ${nome}?`)) { delete C[nome]; mudou({ redesenhar: true }); } } }, "✕"))),
        h("div", { class: "cartao__corpo" },
          h("div", { class: "campo" }, h("label", {}, "Nome do lugar",
            h("input", { type: "text", value: nome, onchange: ev => {
              const novo = ev.target.value.trim();
              if (!novo || novo === nome) return;
              if (C[novo]) { aviso("Já existe um lugar com esse nome.", "erro"); return desenharAba(); }
              renomear(nome, novo); mudou({ redesenhar: true });
            } }))),
          paragrafos("Texto", C, nome)))),
      h("button", { type: "button", class: "botao", onclick: () => {
        const nome = prompt("Nome do lugar (igual ao da parada na aba Edições):");
        if (!nome || !nome.trim()) return;
        if (C[nome.trim()]) return aviso("Já existe um lugar com esse nome.", "erro");
        C[nome.trim()] = [""]; mudou({ redesenhar: true });
      } }, "+ Nova comunidade")
    ];
  }
};

function abrirUltimo() {
  requestAnimationFrame(() => {
    const d = [...document.querySelectorAll("#painel details.cartao")].pop();
    if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); const i = d.querySelector("input"); i && i.focus({ preventScroll: true }); }
  });
}

function novaEdicao() {
  const EDS = est.conteudo.edicoes, n = Math.max(...EDS.map(e => e.n)) + 1;
  if (!confirm(`Criar a ${ordinal(n)} edição?`)) return;
  EDS.push({ n, cor: "#1571ad", ano: String(new Date().getFullYear()), titulo: "", ficha: [], locais: [], texto: [], cartaz: "", pendente: true, fotos: [] });
  est.ed = n;
  mudou({ redesenhar: true });
}

// Aceita youtu.be/ID, watch?v=ID, shorts/ID, embed/ID, live/ID ou o ID sozinho.
function idYouTube(texto) {
  const t = texto.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1, 12) || null;
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      const v = u.searchParams.get("v");
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      return m ? m[1] : null;
    }
  } catch {}
  return null;
}

/* ---------- Desenho da tela ---------- */
function desenharAba(topo = false) {
  const painel = $("#painel"), y = scrollY;
  // Cartões abertos continuam abertos depois de redesenhar.
  const abertos = [...painel.querySelectorAll("details.cartao")].map(d => d.open);
  const lista = { artistas: est.conteudo.artistas, equipe: est.conteudo.tripulantes }[est.aba];
  if (lista) lista.forEach((x, k) => { Object.defineProperty(x, "_aberto", { value: abertos[k], configurable: true, enumerable: false }); });
  painel.replaceChildren(...PAGINAS[est.aba]().flat());
  document.querySelectorAll("[data-aba]").forEach(b => b.setAttribute("aria-current", String(b.dataset.aba === est.aba)));
  scrollTo(0, topo ? 0 : y);
}

function barra() {
  const s = $("#situacao"), pub = $("#publicar"), desc = $("#descartar");
  s.textContent = est.alterado ? "Mudanças ainda não publicadas" : "Tudo publicado";
  s.classList.toggle("situacao--pendente", est.alterado);
  pub.disabled = !est.alterado;
  desc.hidden = !est.alterado;
}

function montar() {
  app.replaceChildren(
    h("header", { class: "topo" },
      h("div", { class: "topo__linha" },
        h("a", { href: "./", class: "marca" }, "Vai de Rural"),
        h("span", { class: "topo__titulo" }, "Configurações"),
        h("span", { id: "situacao", class: "situacao", role: "status" })),
      h("div", { class: "topo__acoes" },
        h("button", { type: "button", class: "botao botao--claro", onclick: previa }, "Ver prévia"),
        h("button", { type: "button", id: "publicar", class: "botao botao--publicar", onclick: publicar }, "Publicar"),
        h("button", { type: "button", id: "descartar", class: "botao botao--texto", onclick: descartar }, "Descartar mudanças")),
      h("nav", { class: "abas", "aria-label": "Partes do site" },
        ABAS.map(([id, rotulo]) => h("button", { type: "button", class: "aba", "data-aba": id, onclick: () => { est.aba = id; desenharAba(true); } }, rotulo)))),
    h("main", { id: "painel" }),
    h("footer", { class: "pe" },
      h("button", { type: "button", class: "botao botao--texto", onclick: sair }, "Sair deste aparelho")));
  barra();
  desenharAba();
}

/* ---------- Ações ---------- */
async function previa() {
  await guardar();
  location.href = `./?previa${rotaPrevia()}`;
}

function descartar() {
  if (!confirm("Descartar tudo o que foi mudado desde a última publicação?")) return;
  est.conteudo = clonar(est.publicado);
  est.fotos = {};
  est.alterado = false;
  apagarRascunho().catch(() => {});
  barra(); desenharAba();
  aviso("Mudanças descartadas. Esta é a versão que está no site.");
}

function sair() {
  if (est.alterado && !confirm("Há mudanças não publicadas. Elas ficam guardadas neste aparelho. Sair mesmo assim?")) return;
  try { localStorage.removeItem(CHAVE_LOCAL); } catch {}
  location.href = "./";
}

// Seções que mudaram, para a mensagem do commit.
function resumoMudancas() {
  const nomes = { projeto: "Início e Sobre", edicoes: "Edições", videos: "Vídeos", mural: "Mural", artistas: "Tripulantes", tripulantes: "Equipe e créditos", comunidades: "Comunidades" };
  return Object.keys(nomes).filter(k => JSON.stringify(est.conteudo[k]) !== JSON.stringify(est.publicado[k])).map(k => nomes[k]);
}

// Troca um id de foto em todo o conteúdo (quando o nome já foi usado por outra publicação).
function renomearFoto(antigo, novo) {
  const trocar = o => {
    for (const [k, v] of Object.entries(o)) {
      if (v === antigo) o[k] = novo;
      else if (v && typeof v === "object") trocar(v);
    }
  };
  trocar(est.conteudo);
  est.fotos[novo] = est.fotos[antigo]; delete est.fotos[antigo];
  if (est.urls[antigo]) { est.urls[novo] = est.urls[antigo]; delete est.urls[antigo]; }
}

async function publicar() {
  if (!est.alterado) return;
  progresso("Conferindo o site…");
  try {
    const shaAgora = await est.gh.shaConteudo();
    if (shaAgora !== est.base && !confirm("O site foi atualizado por outra pessoa depois que você começou a editar. Se publicar, as suas mudanças substituem as dela. Publicar mesmo assim?")) return;

    // Só as fotos novas que continuam em uso; se um nome já existir no site, ganha outro número.
    const json = () => JSON.stringify(est.conteudo);
    const existentes = idsDeArquivos(await est.gh.listarFotos());
    est.nomes = existentes; est.listou = true;
    for (const id of Object.keys(est.fotos)) {
      if (!json().includes(JSON.stringify(id))) { delete est.fotos[id]; continue; }
      if (existentes.has(id)) renomearFoto(id, novoId(id.replace(/-[^-]+$/, "")));
    }
    const novas = Object.keys(est.fotos);
    const texto = JSON.stringify(est.conteudo, null, 2) + "\n";
    const arquivos = [
      { caminho: ARQUIVO, texto },
      ...novas.flatMap(id => [800, 1600].map(w => ({ caminho: `${PASTA_FOTOS}/${id}-${w}.webp`, blob: est.fotos[id][w] })))
    ];
    const partes = resumoMudancas();
    const mensagem = `Configurações: ${partes.length ? partes.join(", ") : "ajustes"}${novas.length ? ` (${novas.length} ${novas.length > 1 ? "fotos novas" : "foto nova"})` : ""}\n\nPublicado pela tela Configurações do site.`;
    const shas = await est.gh.publicar(arquivos, mensagem, progresso);

    est.base = shas[ARQUIVO];
    est.publicado = clonar(est.conteudo);
    novas.forEach(id => est.nomes.add(id));
    est.fotos = {};
    est.alterado = false;
    await apagarRascunho().catch(() => {});
    barra(); desenharAba();
    esperarNoAr(texto);
  } catch (e) {
    console.error(e);
    aviso(mensagemErro(e), "erro");
  } finally { progresso(""); }
}

// Depois de publicar, confere de 5 em 5 segundos se o site já mostra o conteúdo novo.
async function esperarNoAr(texto) {
  const el = h("div", { class: "aviso aviso--ok", role: "status" }, "Publicado! O site leva cerca de um minuto para atualizar…");
  $("#avisos").append(el);
  const limite = Date.now() + 4 * 60e3;
  while (Date.now() < limite) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const r = await fetch(`${ARQUIVO}?t=${Date.now()}`, { cache: "no-store" });
      if (r.ok && (await r.text()) === texto) {
        el.replaceChildren("Pronto, já está no ar! ", h("a", { href: `./${rotaPrevia()}`, class: "link" }, "Ver o site"),
          h("button", { class: "aviso__fechar", "aria-label": "Fechar aviso", onclick: () => el.remove() }, "×"));
        return;
      }
    } catch {}
  }
  el.textContent = "Publicado. Se o site ainda não mostrar a mudança, recarregue a página daqui a alguns minutos.";
  setTimeout(() => el.remove(), 15000);
}

/* ---------- Entrada ---------- */
function telaEntrada(erro) {
  const ent = h("input", { type: "password", id: "chave", autocomplete: "current-password", required: true, spellcheck: "false" });
  app.replaceChildren(h("main", { class: "entrada" },
    h("h1", {}, "Configurações do site"),
    h("p", {}, "Aqui você muda os textos, as fotos e os vídeos do Vai de Rural. Para entrar, cole a chave de acesso que o Rafa te passou. Este aparelho vai lembrar dela."),
    erro && h("p", { class: "aviso aviso--erro", role: "alert" }, erro),
    h("form", { onsubmit: async ev => {
      ev.preventDefault();
      const chave = ent.value.trim();
      if (!chave) return;
      const gh = cliente(chave);
      progresso("Conferindo a chave…");
      try { await gh.testar(); }
      catch (e) { progresso(""); return telaEntrada(mensagemErro(e)); }
      progresso("");
      try { localStorage.setItem(CHAVE_LOCAL, chave); } catch {}
      iniciar(gh);
    } },
      h("label", { for: "chave" }, "Chave de acesso"), ent,
      h("button", { class: "botao" }, "Entrar")),
    h("p", {}, h("a", { href: "./", class: "link" }, "Voltar ao site"))));
  ent.focus();
}

async function iniciar(gh) {
  est.gh = gh;
  progresso("Abrindo o conteúdo do site…");
  try {
    const [remoto, rascunho, nomes] = await Promise.all([
      gh.lerConteudo(),
      lerRascunho().catch(() => null),
      gh.listarFotos().catch(() => null)
    ]);
    est.publicado = remoto.conteudo;
    if (nomes) { est.nomes = idsDeArquivos(nomes); est.listou = true; }
    if (rascunho && rascunho.alterado) {
      Object.assign(est, { conteudo: rascunho.conteudo, fotos: rascunho.fotos || {}, base: rascunho.base, alterado: true });
      montar();
      aviso(rascunho.base !== remoto.sha
        ? "Você tem mudanças guardadas neste aparelho, mas o site foi atualizado depois. Confira antes de publicar, ou descarte para começar da versão nova."
        : "Continuando de onde você parou: há mudanças ainda não publicadas.");
    } else {
      Object.assign(est, { conteudo: clonar(remoto.conteudo), base: remoto.sha, alterado: false });
      montar();
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ErroGitHub && e.status === 401) {
      try { localStorage.removeItem(CHAVE_LOCAL); } catch {}
      return telaEntrada(mensagemErro(e));
    }
    app.replaceChildren(h("main", { class: "entrada" }, h("h1", {}, "Não consegui abrir"), h("p", { class: "aviso aviso--erro" }, mensagemErro(e)),
      h("button", { class: "botao", onclick: () => location.reload() }, "Tentar de novo")));
  } finally { progresso(""); }
}

let chave = null;
try { chave = localStorage.getItem(CHAVE_LOCAL); } catch {}
chave ? iniciar(cliente(chave)) : telaEntrada();
