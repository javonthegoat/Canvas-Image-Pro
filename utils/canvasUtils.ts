import { CanvasImage, Rect, Point, Annotation, TextAnnotation, Group } from '../types';

function hexToRgba(hex: string, opacity: number): string {
    if (!hex) hex = '#000000';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const getImagesBounds = (imagesToBound: CanvasImage[]): Rect | null => {
  if (imagesToBound.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  imagesToBound.forEach(image => {
      const { x, y, width, scale, rotation } = image;
      const w = width * scale;
      const h = image.height * scale;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rad = rotation * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const corners = [
          { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
      ];
      corners.forEach(corner => {
          const rx = corner.x * cos - corner.y * sin;
          const ry = corner.x * sin + corner.y * cos;
          minX = Math.min(minX, rx + cx);
          minY = Math.min(minY, ry + cy);
          maxX = Math.max(maxX, rx + cx);
          maxY = Math.max(maxY, ry + cy);
      });
  });

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getGroupBounds = (
    group: Group,
    allGroups: Group[],
    allImages: CanvasImage[]
): Rect | null => {
    const imageMap = new Map(allImages.map(i => [i.id, i]));
    const groupMap = new Map(allGroups.map(g => [g.id, g]));

    const boundsToCombine: Rect[] = [];

    // Bounds of direct child images
    const childImages = group.imageIds.map(id => imageMap.get(id)).filter(Boolean) as CanvasImage[];
    if (childImages.length > 0) {
        const imageBounds = getImagesBounds(childImages);
        if (imageBounds) boundsToCombine.push(imageBounds);
    }

    // Bounds of child groups
    group.groupIds.forEach(childGroupId => {
        const childGroup = groupMap.get(childGroupId);
        if (childGroup) {
            const childGroupBounds = getGroupBounds(childGroup, allGroups, allImages);
            if (childGroupBounds) boundsToCombine.push(childGroupBounds);
        }
    });

    if (boundsToCombine.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    boundsToCombine.forEach(rect => {
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
    });

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

export function getMultiAnnotationBounds(
    selections: Array<{ imageId: string | null; annotationId: string }>,
    images: CanvasImage[],
    canvasAnnotations: Annotation[],
    ctx: CanvasRenderingContext2D
): Rect | null {
    if (selections.length <= 1) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selections.forEach(sel => {
        const image = sel.imageId ? images.find(img => img.id === sel.imageId) : null;
        const annotation = image
            ? image.annotations.find(a => a.id === sel.annotationId)
            : canvasAnnotations.find(a => a.id === sel.annotationId);

        if (!annotation) return;

        const localBounds = getAnnotationBounds(annotation, ctx);
        const corners = [
            { x: localBounds.x, y: localBounds.y },
            { x: localBounds.x + localBounds.width, y: localBounds.y },
            { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
            { x: localBounds.x, y: localBounds.y + localBounds.height },
        ];

        corners.forEach(corner => {
            const globalPoint = image ? transformLocalToGlobal(corner, image) : corner;
            minX = Math.min(minX, globalPoint.x);
            minY = Math.min(minY, globalPoint.y);
            maxX = Math.max(maxX, globalPoint.x);
            maxY = Math.max(maxY, globalPoint.y);
        });
    });

    if (minX === Infinity) return null;

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
            
            // Line
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            // Head
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headLength * Math.cos(angle - wingAngle), end.y - headLength * Math.sin(angle - wingAngle));
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headLength * Math.cos(angle + wingAngle), end.y - headLength * Math.sin(angle + wingAngle));
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

export const drawCanvas = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    images: CanvasImage[],
    selectedImageIds: string[],
    cropArea: Rect | null,
    viewTransform: { scale: number; offset: Point },
    drawingAnnotation: { annotation: Annotation | null; imageId: string | null },
    selectedAnnotations: Array<{ imageId: string | null; annotationId: string }>,
    marqueeRect: Rect | null,
    groups: Group[],
    canvasAnnotations: Annotation[],
    dropTargetImageId: string | null
) => {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== canvas.clientWidth * dpr || canvas.height !== canvas.clientHeight * dpr) {
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(viewTransform.offset.x, viewTransform.offset.y);
    ctx.scale(viewTransform.scale, viewTransform.scale);
    
    // Draw group backgrounds
    const imageMap = new Map(images.map(img => [img.id, img]));
    groups.forEach(group => {
        const groupImages = group.imageIds.map(id => imageMap.get(id)).filter((img): img is CanvasImage => !!img);

        if (groupImages.length > 0 || group.groupIds.length > 0) {
            const bounds = getGroupBounds(group, groups, images);
            if (bounds) {
                const PADDING = 15;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 1 / viewTransform.scale;

                ctx.beginPath();
                ctx.roundRect(
                    bounds.x - PADDING,
                    bounds.y - PADDING,
                    bounds.width + PADDING * 2,
                    bounds.height + PADDING * 2,
                    10 // corner radius
                );
                ctx.fill();
                ctx.stroke();
            }
        }
    });
    
    // Draw images and their annotations
    images.forEach(img => {
        ctx.save();
        const centerX = img.x + (img.width * img.scale / 2);
        const centerY = img.y + (img.height * img.scale / 2);
        ctx.translate(centerX, centerY);
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
        img.annotations.forEach(anno => drawAnnotation(ctx, anno));
        ctx.restore();

        ctx.restore();

        if (selectedImageIds.includes(img.id) || dropTargetImageId === img.id) {
            ctx.save();
            const centerX = img.x + (img.width * img.scale / 2);
            const centerY = img.y + (img.height * img.scale / 2);
            ctx.translate(centerX, centerY);
            ctx.rotate(img.rotation * Math.PI / 180);
            ctx.strokeStyle = dropTargetImageId === img.id ? '#4ade80' : '#3b82f6';
            ctx.lineWidth = 2 / viewTransform.scale;
            ctx.strokeRect(-(img.width * img.scale) / 2, -(img.height * img.scale) / 2, img.width * img.scale, img.height * img.scale);
            ctx.restore();
        }
    });

    canvasAnnotations.forEach(anno => drawAnnotation(ctx, anno));
    
    if (drawingAnnotation.annotation) {
        const image = drawingAnnotation.imageId ? images.find(img => img.id === drawingAnnotation.imageId) : null;
        if (image) {
            ctx.save();
            const centerX = image.x + (image.width * image.scale / 2);
            const centerY = image.y + (image.height * image.scale / 2);
            ctx.translate(centerX, centerY);
            ctx.rotate(image.rotation * Math.PI / 180);
            ctx.scale(image.scale, image.scale);
            ctx.translate(-image.width / 2, -image.height / 2);
            drawAnnotation(ctx, drawingAnnotation.annotation);
            ctx.restore();
        } else {
             drawAnnotation(ctx, drawingAnnotation.annotation);
        }
    }

    if (selectedAnnotations.length > 1) {
        const multiBounds = getMultiAnnotationBounds(selectedAnnotations, images, canvasAnnotations, ctx);
        if (multiBounds) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5 / viewTransform.scale;
            ctx.strokeRect(multiBounds.x, multiBounds.y, multiBounds.width, multiBounds.height);

            ctx.fillStyle = '#3b82f6';
            const handleSize = 8 / viewTransform.scale;
            const halfHandleSize = handleSize / 2;

            ctx.fillRect(multiBounds.x + multiBounds.width - halfHandleSize, multiBounds.y + multiBounds.height - halfHandleSize, handleSize, handleSize);
            
            const rotationHandleOffset = 20 / viewTransform.scale;
            const rotationHandleX = multiBounds.x + multiBounds.width / 2;
            const rotationHandleY = multiBounds.y - rotationHandleOffset;
            
            ctx.beginPath();
            ctx.moveTo(multiBounds.x + multiBounds.width / 2, multiBounds.y);
            ctx.lineTo(rotationHandleX, rotationHandleY);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(rotationHandleX, rotationHandleY, halfHandleSize, 0, 2 * Math.PI);
            ctx.fill();
        }
    } else if (selectedAnnotations.length === 1) {
        const sel = selectedAnnotations[0];
        const image = sel.imageId ? images.find(img => img.id === sel.imageId) : null;
        const annotation = image
            ? image.annotations.find(a => a.id === sel.annotationId)
            : canvasAnnotations.find(a => a.id === sel.annotationId);
    
        if (annotation) {
            const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
            const isLineOrArrow = annotation.type === 'arrow' || annotation.type === 'line';
            
            ctx.save();
            if (image) {
                const centerX = image.x + (image.width * image.scale / 2);
                const centerY = image.y + (image.height * image.scale / 2);
                ctx.translate(centerX, centerY);
                ctx.rotate(image.rotation * Math.PI / 180);
                ctx.scale(image.scale, image.scale);
                ctx.translate(-image.width / 2, -image.height / 2);
            }
            
            ctx.save();
            const center = { x: primitiveBounds.x + primitiveBounds.width / 2, y: primitiveBounds.y + primitiveBounds.height / 2 };
            if (!isLineOrArrow) {
                ctx.translate(center.x, center.y);
                ctx.rotate(annotation.rotation * Math.PI / 180);
                ctx.scale(annotation.scale, annotation.scale);
                ctx.translate(-center.x, -center.y);
            }

            const totalScale = viewTransform.scale * (image?.scale ?? 1) * (isLineOrArrow ? 1 : annotation.scale);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5 / totalScale;
            ctx.strokeRect(primitiveBounds.x, primitiveBounds.y, primitiveBounds.width, primitiveBounds.height);
            
            if (!isLineOrArrow) {
                ctx.fillStyle = '#3b82f6';
                const handleSize = 8 / totalScale;
                const halfHandleSize = handleSize / 2;

                ctx.fillRect(primitiveBounds.x + primitiveBounds.width - halfHandleSize, primitiveBounds.y + primitiveBounds.height - halfHandleSize, handleSize, handleSize);
                
                const rotationHandleOffset = 20 / totalScale;
                ctx.beginPath();
                ctx.moveTo(primitiveBounds.x + primitiveBounds.width / 2, primitiveBounds.y);
                ctx.lineTo(primitiveBounds.x + primitiveBounds.width / 2, primitiveBounds.y - rotationHandleOffset);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(primitiveBounds.x + primitiveBounds.width / 2, primitiveBounds.y - rotationHandleOffset, halfHandleSize, 0, 2 * Math.PI);
                ctx.fill();
            }
            ctx.restore();
            
            if (isLineOrArrow) {
                 ctx.fillStyle = '#3b82f6';
                 const handleScale = viewTransform.scale * (image?.scale ?? 1);
                 const handleSize = 8 / handleScale;

                 ctx.beginPath();
                 ctx.arc(annotation.start.x, annotation.start.y, handleSize / 2, 0, 2 * Math.PI);
                 ctx.fill();
                 ctx.beginPath();
                 ctx.arc(annotation.end.x, annotation.end.y, handleSize / 2, 0, 2 * Math.PI);
                 ctx.fill();
            }
        
            ctx.restore();
        }
    }

    if (cropArea) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width / dpr, canvas.height / dpr);
        const screenCrop = {
            x: cropArea.x * viewTransform.scale + viewTransform.offset.x,
            y: cropArea.y * viewTransform.scale + viewTransform.offset.y,
            width: cropArea.width * viewTransform.scale,
            height: cropArea.height * viewTransform.scale,
        };
        ctx.rect(screenCrop.x, screenCrop.y, screenCrop.width, screenCrop.height);
        ctx.fill('evenodd');
        ctx.restore();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / viewTransform.scale;
        ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
    }
    
    if (marqueeRect) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
        ctx.lineWidth = 1 / viewTransform.scale;
        ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
        ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
    }

    ctx.restore();

    // Draw group labels in screen space after all world-space drawing
    groups.forEach(group => {
        if (group.showLabel && group.label) {
            const bounds = getGroupBounds(group, groups, images);
            if (bounds) {
                ctx.save();
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Reset transform to draw in screen space
                
                const FONT_SIZE = 12;
                const PADDING = 4;
                
                const boundsCenterScreenX = (bounds.x * viewTransform.scale + viewTransform.offset.x) + (bounds.width * viewTransform.scale / 2);
                const boundsTopScreenY = (bounds.y * viewTransform.scale + viewTransform.offset.y);

                ctx.font = `bold ${FONT_SIZE}px sans-serif`;
                const textMetrics = ctx.measureText(group.label);
                
                const boxWidth = textMetrics.width + PADDING * 2;
                const boxHeight = FONT_SIZE + PADDING * 2;
                
                const finalX = boundsCenterScreenX - (boxWidth / 2);
                const finalY = boundsTopScreenY - boxHeight - PADDING;
                
                ctx.fillStyle = 'rgba(23, 23, 23, 0.8)';
                ctx.strokeStyle = 'rgba(115, 115, 115, 0.5)';
                ctx.lineWidth = 1;

                ctx.beginPath();
                ctx.roundRect(finalX, finalY, boxWidth, boxHeight, 4);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#e5e5e5';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(group.label, finalX + PADDING, finalY + boxHeight / 2);

                ctx.restore();
            }
        }
    });
};