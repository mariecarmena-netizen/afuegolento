export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type)) {
    throw new Error('Usa una foto JPG, PNG, WebP o AVIF. Para fotos HEIC, expórtalas como JPG.');
  }
  if (file.size > 20000000) throw new Error('La foto supera los 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se ha podido preparar la foto.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.84;
    let photo = canvas.toDataURL('image/webp', quality);
    while (photo.length > 550000 && quality > 0.3) { quality -= 0.12; photo = canvas.toDataURL('image/webp', quality); }
    if (photo.length > 550000) throw new Error('Esta foto es demasiado grande. Prueba con una imagen más pequeña.');
    return photo;
  } finally { URL.revokeObjectURL(url); }
}
