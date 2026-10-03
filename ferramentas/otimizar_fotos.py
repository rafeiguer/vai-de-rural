"""Converte fotos originais em WebP otimizado para o site.

Cada foto vira dois arquivos em assets/fotos/:
  <nome>-800.webp   miniaturas, grade e colagem
  <nome>-1600.webp  destaque e ampliação (lightbox)

Os metadados (EXIF, incluindo GPS) são removidos; a rotação do celular é aplicada antes.

Uso:
  python ferramentas/otimizar_fotos.py ed7 caminho/das/fotos/*.jpg
    -> numera a partir da última foto existente da edição: ed7-15, ed7-16, ...
  Depois, copie os nomes impressos para edicoes[].fotos no index.html.
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "assets" / "fotos"
TAMANHOS = (800, 1600)
QUALIDADE = 80


def otimizar(origem, nome):
    """Gera <nome>-800.webp e <nome>-1600.webp a partir de uma imagem."""
    DESTINO.mkdir(parents=True, exist_ok=True)
    with Image.open(origem) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        for largura in TAMANHOS:
            copia = im.copy()
            copia.thumbnail((largura, largura * 4), Image.LANCZOS)
            copia.save(DESTINO / f"{nome}-{largura}.webp", "WEBP", quality=QUALIDADE, method=6)


def proximo_numero(prefixo):
    usados = [int(m.group(1)) for p in DESTINO.glob(f"{prefixo}-*-800.webp")
              if (m := re.fullmatch(rf"{re.escape(prefixo)}-(\d+)-800\.webp", p.name))]
    return max(usados, default=0) + 1


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    prefixo, arquivos = sys.argv[1], sys.argv[2:]
    n = proximo_numero(prefixo)
    nomes = []
    for arq in arquivos:
        nome = f"{prefixo}-{n:02d}"
        otimizar(arq, nome)
        print(f"{arq} -> {nome}")
        nomes.append(nome)
        n += 1
    print("\nPara o index.html:", ", ".join(f'"{x}"' for x in nomes))


if __name__ == "__main__":
    main()
