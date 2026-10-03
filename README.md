# Vai de Rural

Site da Mostra Audiovisual Itinerante, publicado em https://rafeiguer.github.io/vai-de-rural/

## Estrutura

- `index.html`: o site inteiro. Textos, fotos e vídeos ficam no objeto `CONTEUDO`.
- `assets/fotos/`: fotos em WebP, cada uma em dois tamanhos (`-800` e `-1600`).
- `assets/cartazes/`: recortes dos cartazes usados no fundo.
- `assets/og.jpg`: imagem da prévia ao compartilhar no WhatsApp e nas redes.
- `ferramentas/otimizar_fotos.py`: converte fotos originais para o site (precisa de Pillow).

## Preview local

```
python -m http.server 8080
```

Abra http://localhost:8080 e recarregue a página depois de salvar.

## Fotos novas

```
python ferramentas/otimizar_fotos.py ed4 "C:/caminho/das/fotos/"*.jpg
```

O script numera as fotos a partir da última da edição, remove os metadados (inclusive GPS)
e imprime os nomes para colar em `edicoes[].fotos` no `index.html`.

Para a página Mural, use o prefixo `mural` e cole os nomes em `mural` (cada um como `{ id: "mural-01" }`,
com `edicao` opcional para entrar no filtro):

```
python ferramentas/otimizar_fotos.py mural "C:/caminho/das/fotos/"*.jpg
```

## Releases em PDF

Cada página do PDF vira uma imagem, mostrada no bloco "Release" da página da edição
(precisa de PyMuPDF: `pip install pymupdf`):

```
python ferramentas/release_pdf.py ed3 "C:/caminho/release.pdf"
```

Cole a linha impressa (`release: [...]`) na edição correspondente em `edicoes` no `index.html`.

## Tripulantes

Para a página Tripulantes, use o prefixo `tripulantes` e preencha `tripulantes` no `index.html`
com `{ nome, funcao, texto, foto }` (só `nome` é obrigatório; sem foto, o cartão mostra as iniciais).
Não suba os originais: só os `.webp` gerados vão para o repositório.

## Mostrar à cliente sem publicar

Com o preview rodando, um túnel temporário gera um link público:

```
npx localtunnel --port 8080
```

O link deixa de funcionar quando o comando é encerrado.

## Publicar

Um commit e um push por rodada de revisão. O GitHub Pages atualiza em cerca de um minuto.
