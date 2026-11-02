export async function watermarkImage(file: File): Promise<string> {
  const source = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / source.width);
  canvas.width = source.width * scale;
  canvas.height = source.height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const fontSize = Math.max(22, canvas.width / 18);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(-Math.PI / 14);
  context.font = `700 ${fontSize}px Arial`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.shadowColor = 'rgba(0,0,0,0.25)';
  context.shadowBlur = fontSize / 6;
  context.fillText('درة الهجرة للعقارات', 0, 0);
  context.restore();
  return canvas.toDataURL('image/jpeg', 0.82);
}
