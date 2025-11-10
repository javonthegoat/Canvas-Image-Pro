
import { CanvasImage, Rect, Point, Annotation, TextAnnotation } from '../types';

function hexToRgba(hex: string, opacity: number): string {
    if (!hex) hex = '#000000';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const transformLocalToGlobal = (localPoint: Point, image: CanvasImage): Point => {
    const imgCenterX = image.x + (image.width * image.scale) / 2;
    const imgCenterY = image.y + (image.height * image.scale) / 2;

    const p_rel_center = {
        x: localPoint.x - image.width / 2,
        y: localPoint.y - image.height / 2
    };

    const p_scaled = {
        x: p_rel_center.x * image.scale,
        y: p_rel_center.y * image.scale
    };
    
    const rad = image.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const p_rotated = {
        x: p_scaled.x * cos - p_scaled.y * sin,
        y: p_scaled.x * sin + p_scaled.y * cos
    };

    const globalPoint = {
        x: p_rotated.x + imgCenterX,
        y: p_rotated.y + imgCenterY
    };

    return globalPoint;
};

export const transformGlobalToLocal = (globalPoint: Point, image: CanvasImage): Point => {
    const imgCenterX = image.x + (image.width * image.scale) / 2;
    const imgCenterY = image.y + (image.height * image.scale) / 2;

    const p_rel_center = {
        x: globalPoint.x - imgCenterX,
        y: globalPoint.y - imgCenterY
    };

    const rad = -image.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const p_rotated = {
        x: p_rel_center.x * cos - p_rel_center.y * sin,
        y: p_rel_center.x * sin + p_rel_center.y * cos
    };

    const p_scaled = {
        x: p_rotated.x / image.scale,
        y: p_rotated.y / image.scale
    };
    
    const localPoint = {
        x: p_scaled.x + image.width / 2,
        y: p_scaled.y + image.height / 2
    };

    return localPoint;
};

export function getAnnotationPrimitiveBounds(annotation: Annotation, ctx: CanvasRenderingContext2D, options?: { ignoreStyles?: boolean }): Rect {
    switch (annotation.type) {
        case 'freehand': {
            if (annotation.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            annotation.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        case 'rect':
            return {
                x: annotation.x,
                y: annotation.y,
                width: annotation.width,
                height: annotation.height,
            };
        case 'circle':
            return {
                x: annotation.x - annotation.radius,
                y: annotation.y - annotation.radius,
                width: annotation.radius * 2,
                height: annotation.radius * 2,
            };
        case 'text': {
             if (options?.ignoreStyles) {
                return { x: annotation.x, y: annotation.y, width: 0, height: 0 };
            }
            ctx.save();
            const lines = annotation.text.split('\n');
            ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
            const metrics = ctx.measureText(lines[0] || ' ');
            const lineHeight = (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) * 1.5;
            const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
            const totalHeight = (lines.length * lineHeight) - (lineHeight - (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent));

            const padding = (annotation.backgroundOpacity ?? 0) > 0 ? annotation.fontSize * 0.2 : 0;
            const strokeW = (annotation.strokeOpacity ?? 0) > 0 ? (annotation.strokeWidth ?? 0) : 0;
            const extra = Math.max(padding, strokeW / 2);
            ctx.restore();

            return {
                x: annotation.x - extra,
                y: annotation.y - extra,
                width: maxWidth + extra * 2,
                height: totalHeight + extra * 2,
            };
        }
        case 'line':
        case 'arrow': {
            const minX = Math.min(annotation.start.x, annotation.end.x);
            const minY = Math.min(annotation.start.y, annotation.end.y);
            const maxX = Math.max(annotation.start.x, annotation.end.x);
            const maxY = Math.max(annotation.start.y, annotation.end.y);
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
    }
}

export function getAnnotationBounds(annotation: Annotation, ctx: CanvasRenderingContext2D, options?: { ignoreStyles?: boolean }): Rect {
    const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx, options);

    if (annotation.type === 'arrow' || annotation.type === 'line') {
        return primitiveBounds;
    }

    if (primitiveBounds.width === 0 || primitiveBounds.height === 0) {
        const normalized = { ...primitiveBounds };
        if (normalized.width < 0) { normalized.x += normalized.width; normalized.width *= -1; }
        if (normalized.height < 0) { normalized.y += normalized.height; normalized.height *= -1; }
        return normalized;
    }

    const center = {
        x: primitiveBounds.x + primitiveBounds.width / 2,
        y: primitiveBounds.y + primitiveBounds.height / 2,
    };

    const rad = annotation.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const corners = [
        { x: primitiveBounds.x, y: primitiveBounds.y },
        { x: primitiveBounds.x + primitiveBounds.width, y: primitiveBounds.y },
        { x: primitiveBounds.x + primitiveBounds.width, y: primitiveBounds.y + primitiveBounds.height },
        { x: primitiveBounds.x, y: primitiveBounds.y + primitiveBounds.height },
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    corners.forEach(corner => {
        const tx = (corner.x - center.x) * annotation.scale;
        const ty = (corner.y - center.y) * annotation.scale;
        
        const rx = tx * cos - ty * sin;
        const ry = tx * sin + ty * cos;

        const finalX = rx + center.x;
        const finalY = ry + center.y;

        minX = Math.min(minX, finalX);
        minY = Math.min(minY, finalY);
        maxX = Math.max(maxX, finalX);
        maxY = Math.max(maxY, finalY);
    });

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation) {
  ctx.save();
  
  const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);

  if (annotation.type !== 'arrow' && annotation.type !== 'line') {
    const centerX = primitiveBounds.x + primitiveBounds.width / 2;
    const centerY = primitiveBounds.y + primitiveBounds.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(annotation.rotation * Math.PI / 180);
    ctx.scale(annotation.scale, annotation.scale);
    ctx.translate(-centerX, -centerY);
  }

  const effectiveStrokeWidth = annotation.strokeWidth / (annotation.type === 'arrow' || annotation.type === 'line' ? 1 : annotation.scale);
  
  switch (annotation.type) {
    case 'freehand':
      if (annotation.points.length < 2) break;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const scaledStrokeWidth = annotation.strokeWidth / annotation.scale;
      const scaledOutlineWidth = (annotation.outlineWidth ?? 0) / annotation.scale;

      if (annotation.outlineColor && scaledOutlineWidth > 0) {
        ctx.strokeStyle = hexToRgba(annotation.outlineColor, annotation.outlineOpacity ?? 1);
        ctx.lineWidth = scaledStrokeWidth + scaledOutlineWidth * 2;
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++) {
          ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
        }
        ctx.stroke();
      }

      if (annotation.strokeWidth > 0) {
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = scaledStrokeWidth;
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++) {
          ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
        }
        ctx.stroke();
      }
      break;
    case 'rect':
      if (annotation.fillColor && (annotation.fillOpacity ?? 0) > 0) {
        ctx.fillStyle = hexToRgba(annotation.fillColor, annotation.fillOpacity ?? 1);
        ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
      }
      if (annotation.strokeWidth > 0) {
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = effectiveStrokeWidth;
        ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
      }
      break;
    case 'circle':
      if (annotation.fillColor && (annotation.fillOpacity ?? 0) > 0) {
        ctx.fillStyle = hexToRgba(annotation.fillColor, annotation.fillOpacity ?? 1);
        ctx.beginPath();
        ctx.arc(annotation.x, annotation.y, annotation.radius, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (annotation.strokeWidth > 0) {
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = effectiveStrokeWidth;
        ctx.beginPath();
        ctx.arc(annotation.x, annotation.y, annotation.radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
      break;
    case 'text': {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;

      const lines = annotation.text.split('\n');
      const metrics = ctx.measureText('M');
      const lineHeight = (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) * 1.5;
      const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      const totalHeight = (lines.length * lineHeight) - (lineHeight - (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent));
      
      const padding = annotation.fontSize * 0.2;
      if (annotation.backgroundColor && (annotation.backgroundOpacity ?? 0) > 0) {
          ctx.fillStyle = hexToRgba(annotation.backgroundColor, annotation.backgroundOpacity);
          ctx.fillRect(annotation.x - padding, annotation.y - padding, maxWidth + padding * 2, totalHeight + padding * 2);
      }
      
      lines.forEach((line, lineIndex) => {
        const lineY = annotation.y + (lineIndex * lineHeight);

        if ((annotation.strokeWidth ?? 0) > 0 && annotation.strokeColor && (annotation.strokeOpacity ?? 0) > 0) {
            ctx.strokeStyle = hexToRgba(annotation.strokeColor, annotation.strokeOpacity);
            ctx.lineWidth = annotation.strokeWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, annotation.x, lineY);
        }

        ctx.fillStyle = annotation.color;
        ctx.fillText(line, annotation.x, lineY);
      });
      break;
    }
    case 'line': {
      const { start, end } = annotation;
      const drawLinePart = (color: string, lineWidth: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      };
      if (annotation.outlineColor && (annotation.outlineWidth ?? 0) > 0) {
        const outlineWidth = annotation.strokeWidth + (annotation.outlineWidth * 2);
        drawLinePart(hexToRgba(annotation.outlineColor, annotation.outlineOpacity ?? 1), outlineWidth);
      }
      if (annotation.strokeWidth > 0) {
        drawLinePart(annotation.color, annotation.strokeWidth);
      }
      break;
    }
    case 'arrow': {
        const { start, end } = annotation;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const angle = Math.atan2(dy, dx);
        const length = Math.hypot(dx, dy);

        if (length === 0) break;

        const drawArrowPart = (color: string, lineWidth: number) => {
            const headLength = Math.max(10, lineWidth * 1.5);
            const wingAngle = Math.PI / 6;

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            
            ctx.moveTo(end.x - headLength * Math.cos(angle - wingAngle), end.y - headLength * Math.sin(angle - wingAngle));
            ctx.lineTo(end.x, end.y);
            ctx.lineTo(end.x - headLength * Math.cos(angle + wingAngle), end.y - headLength * Math.sin(angle + wingAngle));
            
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(start.x, start.y);

            ctx.stroke();
        };

        if (annotation.outlineColor && (annotation.outlineWidth ?? 0) > 0) {
            const outlineWidth = annotation.strokeWidth + (annotation.outlineWidth * 2);
            drawArrowPart(hexToRgba(annotation.outlineColor, annotation.outlineOpacity ?? 1), outlineWidth);
        }

        if (annotation.strokeWidth > 0) {
            drawArrowPart(annotation.color, annotation.strokeWidth);
        }
        
        break;
      }
  }
  ctx.restore();
}

function drawAnnotationHandles(ctx: CanvasRenderingContext2D, annotation: Annotation, image: CanvasImage, viewTransform: { scale: number; offset: Point }) {
    const handleSize = 8 / (viewTransform.scale * image.scale);

    if (annotation.type === 'arrow' || annotation.type === 'line') {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 / (viewTransform.scale * image.scale);

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(annotation.start.x, annotation.start.y, handleSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(annotation.end.x, annotation.end.y, handleSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

    } else {
        const bounds = getAnnotationPrimitiveBounds(annotation, ctx);
        const scaledHandleSize = handleSize / annotation.scale;
        const rotationHandleOffset = 20 / (viewTransform.scale * image.scale * annotation.scale);
        
        const corners = {
            br: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
            tr: { x: bounds.x + bounds.width, y: bounds.y }
        };

        ctx.beginPath();
        ctx.moveTo(corners.tr.x, corners.tr.y);
        ctx.lineTo(corners.tr.x, corners.tr.y - rotationHandleOffset);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1 / (viewTransform.scale * image.scale * annotation.scale);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 / (viewTransform.scale * image.scale * annotation.scale);

        ctx.beginPath();
        ctx.rect(corners.br.x - scaledHandleSize / 2, corners.br.y - scaledHandleSize / 2, scaledHandleSize, scaledHandleSize);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(corners.tr.x, corners.tr.y - rotationHandleOffset, scaledHandleSize / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
}

function drawCropArea(ctx: CanvasRenderingContext2D, cropArea: Rect, viewScale: number) {
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.lineWidth = 2 / viewScale;
    ctx.setLineDash([6 / viewScale, 4 / viewScale]);
    ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
    ctx.fillRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
    ctx.setLineDash([]);
    
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1 / viewScale;
    const thirdWidth = cropArea.width / 3;
    const thirdHeight = cropArea.height / 3;
    ctx.beginPath();
    ctx.moveTo(cropArea.x + thirdWidth, cropArea.y);
    ctx.lineTo(cropArea.x + thirdWidth, cropArea.y + cropArea.height);
    ctx.moveTo(cropArea.x + thirdWidth * 2, cropArea.y);
    ctx.lineTo(cropArea.x + thirdWidth * 2, cropArea.y + cropArea.height);
    ctx.moveTo(cropArea.x, cropArea.y + thirdHeight);
    ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + thirdHeight);
    ctx.moveTo(cropArea.x, cropArea.y + thirdHeight * 2);
    ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + thirdHeight * 2);
    ctx.stroke();

    const handleSize = 8 / viewScale;
    const halfHandleSize = handleSize / 2;
    const { x, y, width, height } = cropArea;
    const handles = [
        { x: x, y: y }, { x: x + width / 2, y: y }, { x: x + width, y: y },
        { x: x, y: y + height / 2 }, { x: x + width, y: y + height / 2 },
        { x: x, y: y + height }, { x: x + width / 2, y: y + height }, { x: x + width, y: y + height }
    ];
    
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1 / viewScale;
    
    handles.forEach(p => {
        ctx.fillRect(p.x - halfHandleSize, p.y - halfHandleSize, handleSize, handleSize);
        ctx.strokeRect(p.x - halfHandleSize, p.y - halfHandleSize, handleSize, handleSize);
    });
}

export function drawCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  images: CanvasImage[],
  selectedImageIds: string[],
  cropArea: Rect | null,
  viewTransform: { scale: number; offset: Point },
  drawingAnnotation: { annotation: Annotation | null, imageId: string | null },
  selectedAnnotations: Array<{ imageId: string; annotationId: string; }>,
  marqueeRect: Rect | null
) {
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.fillStyle = '#2d3748';
  ctx.fillRect(0, 0, width, height);
  
  ctx.save();
  ctx.translate(viewTransform.offset.x, viewTransform.offset.y);
  ctx.scale(viewTransform.scale, viewTransform.scale);
  
  images.forEach(img => {
    ctx.save();
    ctx.translate(img.x + (img.width * img.scale / 2), img.y + (img.height * img.scale / 2));
    ctx.rotate(img.rotation * Math.PI / 180);
    ctx.scale(img.scale, img.scale);
    
    ctx.drawImage(img.element, -img.width / 2, -img.height / 2, img.width, img.height);
    
    if (img.outlineWidth && img.outlineWidth > 0) {
      ctx.strokeStyle = hexToRgba(img.outlineColor || '#000000', img.outlineOpacity || 1);
      ctx.lineWidth = img.outlineWidth / img.scale;
      ctx.strokeRect(-img.width / 2, -img.height / 2, img.width, img.height);
    }
    
    ctx.save();
    ctx.translate(-img.width / 2, -img.height / 2);
    
    if (img.annotations) {
      img.annotations.forEach(anno => drawAnnotation(ctx, anno));
    }
    
    if (drawingAnnotation.annotation && drawingAnnotation.imageId === img.id) {
      drawAnnotation(ctx, drawingAnnotation.annotation);
    }
    
    ctx.restore();
    ctx.restore();
  });

  if (selectedImageIds.length > 0) {
    images.forEach(img => {
        if (selectedImageIds.includes(img.id)) {
            ctx.save();
            ctx.translate(img.x + (img.width * img.scale / 2), img.y + (img.height * img.scale / 2));
            ctx.rotate(img.rotation * Math.PI / 180);
            ctx.scale(img.scale, img.scale);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 4 / (viewTransform.scale * img.scale);
            ctx.strokeRect(-img.width / 2, -img.height / 2, img.width, img.height);
            ctx.restore();
        }
    });
  }

  if (selectedAnnotations.length > 0) {
    selectedAnnotations.forEach(selection => {
        const image = images.find(img => img.id === selection.imageId);
        const annotation = image?.annotations.find(anno => anno.id === selection.annotationId);
        if (image && annotation) {
            ctx.save();
            ctx.translate(image.x + (image.width * image.scale / 2), image.y + (image.height * image.scale / 2));
            ctx.rotate(image.rotation * Math.PI / 180);
            ctx.scale(image.scale, image.scale);
            ctx.translate(-image.width / 2, -image.height / 2);

            ctx.save();
            
            if (annotation.type !== 'arrow' && annotation.type !== 'line') {
                const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
                const center = { x: primitiveBounds.x + primitiveBounds.width / 2, y: primitiveBounds.y + primitiveBounds.height / 2 };
                ctx.translate(center.x, center.y);
                ctx.rotate(annotation.rotation * Math.PI / 180);
                ctx.scale(annotation.scale, annotation.scale);
                ctx.translate(-center.x, -center.y);
            }
            
            const scaleFactor = (annotation.type === 'arrow' || annotation.type === 'line' ? 1 : annotation.scale);
            const padding = 5 / (viewTransform.scale * image.scale * scaleFactor);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2 / (viewTransform.scale * image.scale * scaleFactor);
            ctx.setLineDash([4 / (viewTransform.scale * image.scale), 2 / (viewTransform.scale * image.scale)]);
            
            const selectionRect = getAnnotationPrimitiveBounds(annotation, ctx);
            ctx.strokeRect(selectionRect.x - padding, selectionRect.y - padding, selectionRect.width + padding * 2, selectionRect.height + padding * 2);
            
            if (selection === selectedAnnotations[0]) {
              drawAnnotationHandles(ctx, annotation, image, viewTransform);
            }

            ctx.restore();
            
            ctx.setLineDash([]);
            ctx.restore();
        }
    });
  }

  if (cropArea) {
    drawCropArea(ctx, cropArea, viewTransform.scale);
  }

  if (marqueeRect) {
    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 1 / viewTransform.scale;
    ctx.setLineDash([4 / viewTransform.scale, 2 / viewTransform.scale]);
    ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
    ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
    ctx.setLineDash([]);
  }

  ctx.restore();
}
