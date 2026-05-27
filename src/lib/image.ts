export function createSquareImage(file: File, size = 400): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;

      // Lado menor da imagem original
      const minSide = Math.min(img.width, img.height);
      // Recorte centralizado
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      const sWidth = minSide;
      const sHeight = minSide;

      // Desenha o recorte redimensionado
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            const resizedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          } else {
            reject(new Error("Falha ao processar imagem"));
          }
        },
        "image/jpeg",
        0.9
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Erro ao carregar imagem"));
    };
    img.src = url;
  });
}
