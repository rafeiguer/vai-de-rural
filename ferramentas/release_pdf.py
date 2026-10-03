"""Converte as páginas de um release em PDF em imagens WebP para o site.

Cada página vira dois arquivos em assets/fotos/:
  <prefixo>-release-01-800.webp   miniatura
  <prefixo>-release-01-1600.webp  ampliação (lightbox)

A página é desenhada como está no PDF (texto, ilustrações e diagramação), na largura
de 1600 px; a miniatura sai da mesma imagem.

Uso:
  python ferramentas/release_pdf.py ed3 "C:/caminho/release.pdf"
  Depois, copie a linha impressa para edicoes[].release no index.html.
Precisa de PyMuPDF e Pillow (pip install pymupdf pillow).
"""
import sys
from pathlib import Path

import pymupdf
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "assets" / "fotos"
LARGURA = 1600
QUALIDADE = 82


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    prefixo, pdf = sys.argv[1], sys.argv[2]
    DESTINO.mkdir(parents=True, exist_ok=True)
    nomes = []
    with pymupdf.open(pdf) as doc:
        for i, pg in enumerate(doc, start=1):
            escala = LARGURA / pg.rect.width
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            nome = f"{prefixo}-release-{i:02d}"
            for largura in (800, 1600):
                copia = im.copy()
                copia.thumbnail((largura, largura * 4), Image.LANCZOS)
                copia.save(DESTINO / f"{nome}-{largura}.webp", "WEBP", quality=QUALIDADE, method=6)
            print(f"página {i} -> {nome}")
            nomes.append(nome)
    print("\nPara o index.html:\n    release: [" + ", ".join(f'"{n}"' for n in nomes) + "],")


if __name__ == "__main__":
    main()
