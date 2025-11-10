
import { CanvasImage } from '../types';

export const readImageFile = (file: File): Promise<CanvasImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const newImage: CanvasImage = {
          id: `img-${Date.now()}-${Math.random()}`,
          name: file.name,
          element: img,
          x: 100, // Default position
          y: 100,
          width: img.width,
          height: img.height,
          originalWidth: img.width,
          originalHeight: img.height,
          cropRect: null,
          scale: 1.0,
          rotation: 0,
          annotations: [],
          createdAt: new Date(),
          outlineColor: '#000000',
          outlineWidth: 0,
          outlineOpacity: 1,
        };
        resolve(newImage);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const createImageElementFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
};
