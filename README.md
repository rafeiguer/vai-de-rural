# Vai de Rural

Site da Mostra Cultural Itinerante, publicado em https://vaiderural.com/ (GitHub Pages, domínio no arquivo CNAME).

## Estrutura

- `index.html`: o site inteiro (layout e código).
- `conteudo.json`: textos, fotos e vídeos. Campos que começam com `_` são notas internas.
- `configuracoes.html` + `configuracoes/`: tela Configurações, onde a produção edita o conteúdo e publica.

## Tela Configurações (edição pela Denise)

Link discreto "Configurações" no rodapé do site (ou `/configuracoes.html`). Lá dá para mudar textos,
trocar e enviar fotos (o navegador converte para WebP 800/1600, sem metadados), mandar o PDF do release,
colar links do YouTube e montar Mural, Tripulantes, Equipe e Comunidades. "Ver prévia" mostra o site
com as mudanças só naquele aparelho; "Publicar" faz um commit na `main` com o `conteudo.json` e as fotos
novas, e o GitHub Pages atualiza em cerca de um minuto. O rascunho fica guardado no navegador até publicar.

Chave de acesso (uma por pessoa, você gera):

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → `vai-de-rural`.
3. Permissions → Repository permissions → **Contents: Read and write** (o resto fica sem acesso).
4. Escolha a validade (ex.: 1 ano), gere e mande o token para a pessoa colar na tela de entrada.

Para cortar o acesso, apague o token no GitHub. Os commits saem no seu nome, com a mensagem
"Configurações: …". Para desfazer uma publicação: `git revert <commit>`.

Antes de editar o `conteudo.json` à mão, faça `git pull`: a Denise pode ter publicado mudanças.
- `assets/fotos/`: fotos em WebP, cada uma em dois tamanhos (`-800` e `-1600`).
- `assets/cartazes/`: recortes dos cartazes usados no fundo.
- `assets/og-7.jpg`: imagem da prévia ao compartilhar no WhatsApp e nas redes (cartaz da 7ª, 1200×630).
  Ao trocar, use um nome novo (og-8.jpg…) e atualize `og:image` no index.html: o WhatsApp guarda a antiga pelo endereço.
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
e imprime os nomes para colar em `edicoes[].fotos` no `conteudo.json` (ou use a tela Configurações).

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

Cole a linha impressa (`release: [...]`) na edição correspondente em `edicoes` no `conteudo.json`.

## Tripulantes

Para a página Tripulantes, use o prefixo `tripulantes` e preencha `tripulantes` no `conteudo.json`
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
