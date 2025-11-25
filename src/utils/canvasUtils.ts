

import { CanvasImage, Rect, Point, Annotation, TextAnnotation, Group, AspectRatio, FreehandAnnotation, RectAnnotation, CircleAnnotation, ArrowAnnotation, LineAnnotation } from '../types';

function hexToRgba(hex: string, opacity: number): string {
    if (!hex) hex = '#000000';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const rectIntersect = (r1: Rect, r2: Rect): boolean => {
    return !(r2.x > r1.x + r1.width || 
             r2.x + r2.width < r1.x || 
             r2.y > r1.y + r1.height || 
             r2.y + r2.height < r1.y);
};

export const getImagesBounds = (imagesToBound: CanvasImage[]): Rect | null => {
  if (imagesToBound.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  imagesToBound.forEach(image => {
      if (image.visible === false) return;
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
    const strokePadding = (annotation.strokeWidth || 1) / 2;
    const hitPadding = 15; // Increased hit area for easier selection
    const totalPadding = strokePadding + hitPadding;

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
            return { 
                x: minX - totalPadding, 
                y: minY - totalPadding, 
                width: (maxX - minX) + totalPadding * 2, 
                height: (maxY - minY) + totalPadding * 2 
            };
        }
        case 'rect':
            const rX = annotation.width < 0 ? annotation.x + annotation.width : annotation.x;
            const rY = annotation.height < 0 ? annotation.y + annotation.height : annotation.y;
            const rW = Math.abs(annotation.width);
            const rH = Math.abs(annotation.height);
            return {
                x: rX - totalPadding,
                y: rY - totalPadding,
                width: rW + totalPadding * 2,
                height: rH + totalPadding * 2,
            };
        case 'circle':
             return {
                x: annotation.x - annotation.radius - totalPadding,
                y: annotation.y - annotation.radius - totalPadding,
                width: (annotation.radius * 2) + totalPadding * 2,
                height: (annotation.radius * 2) + totalPadding * 2,
            };
        case 'text': {
             ctx.save();
             ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
             const lines = annotation.text.split('\n');
             const lineHeight = annotation.fontSize * 1.2;
             const widths = lines.map(line => ctx.measureText(line).width);
             const maxWidth = Math.max(0, ...widths);
             const height = lineHeight * lines.length;
             ctx.restore();
             return {
                x: annotation.x - hitPadding,
                y: annotation.y - hitPadding,
                width: maxWidth + hitPadding * 2,
                height: height + hitPadding * 2,
             };
        }
        case 'arrow':
        case 'line':
             const minX = Math.min(annotation.start.x, annotation.end.x);
             const minY = Math.min(annotation.start.y, annotation.end.y);
             const maxX = Math.max(annotation.start.x, annotation.end.x);
             const maxY = Math.max(annotation.start.y, annotation.end.y);
             
             let extraHeadPadding = 0;
             if (annotation.type === 'arrow') {
                 // Account for arrowhead size + rotation possibilities
                 extraHeadPadding = 25 + (annotation.strokeWidth || 0);
             }

             return { 
                 x: minX - totalPadding - extraHeadPadding, 
                 y: minY - totalPadding - extraHeadPadding, 
                 width: (maxX - minX) + (totalPadding + extraHeadPadding) * 2, 
                 height: (maxY - minY) + (totalPadding + extraHeadPadding) * 2 
             };
        default:
             return { x: 0, y: 0, width: 0, height: 0 };
    }
}

export function getAnnotationBounds(annotation: Annotation, ctx: CanvasRenderingContext2D, options?: { ignoreStyles?: boolean }): Rect {
    const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx, options);
    
    let { x, y, width, height } = primitiveBounds;
    // Ensure bounds are normalized
    if (width < 0) { x += width; width = Math.abs(width); }
    if (height < 0) { y += height; height = Math.abs(height); }

    if (annotation.rotation === 0 && annotation.scale === 1) {
        return { x, y, width, height };
    }

    // Calculate center of rotation
    let cx = 0, cy = 0;
    if (annotation.type === 'rect') { 
        // Re-calculate center from raw properties to be consistent with draw
        cx = annotation.x + annotation.width/2; 
        cy = annotation.y + annotation.height/2; 
    } else if (annotation.type === 'circle') { 
        cx = annotation.x; 
        cy = annotation.y; 
    } else if (annotation.type === 'text') { 
        // Approximate center from primitive bounds (which includes padding, but should be close enough)
        cx = x + width/2; 
        cy = y + height/2; 
    } else if (annotation.type === 'freehand') {
         cx = x + width/2; 
         cy = y + height/2;
    } else if (annotation.type === 'arrow' || annotation.type === 'line') {
         cx = (annotation.start.x + annotation.end.x) / 2;
         cy = (annotation.start.y + annotation.end.y) / 2;
    }

    // Get 4 corners of the AABB
    const corners = [
        { x: x, y: y },
        { x: x + width, y: y },
        { x: x + width, y: y + height },
        { x: x, y: y + height }
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    corners.forEach(p => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        
        const rad = annotation.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        const fx = cx + rx * annotation.scale;
        const fy = cy + ry * annotation.scale;

        minX = Math.min(minX, fx);
        minY = Math.min(minY, fy);
        maxX = Math.max(maxX, fx);
        maxY = Math.max(maxY, fy);
    });

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const drawAnnotation = (ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    ctx.save();
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let cx = 0, cy = 0;
    
    if (annotation.type === 'rect') { 
        cx = annotation.x + annotation.width/2; 
        cy = annotation.y + annotation.height/2; 
    } else if (annotation.type === 'circle') { 
        cx = annotation.x; 
        cy = annotation.y; 
    } else if (annotation.type === 'text') { 
        // Measure text to find center
        ctx.save();
        ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
        const lines = annotation.text.split('\n');
        const widths = lines.map(line => ctx.measureText(line).width);
        const maxWidth = Math.max(0, ...widths);
        const lineHeight = annotation.fontSize * 1.2;
        const height = lineHeight * lines.length;
        ctx.restore();
        cx = annotation.x + maxWidth / 2; 
        cy = annotation.y + height / 2; 
    } else if (annotation.type === 'freehand') {
         let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
         annotation.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
         cx = minX + (maxX-minX)/2; cy = minY + (maxY-minY)/2;
    } else if (annotation.type === 'arrow' || annotation.type === 'line') {
         cx = (annotation.start.x + annotation.end.x) / 2;
         cy = (annotation.start.y + annotation.end.y) / 2;
    }

    ctx.translate(cx, cy);
    ctx.rotate(annotation.rotation * Math.PI / 180);
    ctx.scale(annotation.scale, annotation.scale);
    ctx.translate(-cx, -cy);

    if (annotation.type === 'arrow' || annotation.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(annotation.start.x, annotation.start.y);
        ctx.lineTo(annotation.end.x, annotation.end.y);
        ctx.stroke();

        if (annotation.type === 'arrow') {
             const angle = Math.atan2(annotation.end.y - annotation.start.y, annotation.end.x - annotation.start.x);
             const headLen = 10 + annotation.strokeWidth;
             ctx.beginPath();
             ctx.moveTo(annotation.end.x, annotation.end.y);
             ctx.lineTo(annotation.end.x - headLen * Math.cos(angle - Math.PI / 6), annotation.end.y - headLen * Math.sin(angle - Math.PI / 6));
             ctx.moveTo(annotation.end.x, annotation.end.y);
             ctx.lineTo(annotation.end.x - headLen * Math.cos(angle + Math.PI / 6), annotation.end.y - headLen * Math.sin(angle + Math.PI / 6));
             ctx.stroke();
        }
    } else {
        if (annotation.type === 'freehand') {
             ctx.strokeStyle = annotation.color;
             ctx.lineWidth = annotation.strokeWidth;
             if (annotation.outlineWidth && annotation.outlineWidth > 0) {
                 ctx.save();
                 ctx.strokeStyle = annotation.outlineColor || '#000000';
                 ctx.lineWidth = annotation.strokeWidth + annotation.outlineWidth * 2;
                 ctx.globalAlpha = annotation.outlineOpacity ?? 1;
                 ctx.beginPath();
                 annotation.points.forEach((p, i) => { if(i===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
                 ctx.stroke();
                 ctx.restore();
             }
             ctx.beginPath();
             annotation.points.forEach((p, i) => { if(i===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
             ctx.stroke();
        } else if (annotation.type === 'rect') {
            if (annotation.fillColor && annotation.fillColor !== 'transparent') {
                ctx.fillStyle = hexToRgba(annotation.fillColor, annotation.fillOpacity ?? 1);
                ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
            }
            ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
        } else if (annotation.type === 'circle') {
            ctx.beginPath();
            ctx.arc(annotation.x, annotation.y, annotation.radius, 0, Math.PI * 2);
            if (annotation.fillColor && annotation.fillColor !== 'transparent') {
                ctx.fillStyle = hexToRgba(annotation.fillColor, annotation.fillOpacity ?? 1);
                ctx.fill();
            }
            ctx.stroke();
        } else if (annotation.type === 'text') {
            ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
            ctx.textBaseline = 'top';
            
            const lines = annotation.text.split('\n');
            const lineHeight = annotation.fontSize * 1.2;
            
            if (annotation.backgroundColor && annotation.backgroundOpacity > 0) {
                 const widths = lines.map(line => ctx.measureText(line).width);
                 const maxWidth = Math.max(0, ...widths);
                 const yPadding = annotation.fontSize * 0.15;
                 const xPadding = annotation.fontSize * 0.1;
                 const totalHeight = lineHeight * lines.length;
                 ctx.fillStyle = hexToRgba(annotation.backgroundColor, annotation.backgroundOpacity ?? 1);
                 ctx.fillRect(
                     annotation.x - xPadding, 
                     annotation.y - yPadding, 
                     maxWidth + xPadding * 2, 
                     totalHeight + yPadding * 2
                 );
            }

            ctx.fillStyle = annotation.color;
            lines.forEach((line, i) => {
                if (annotation.strokeWidth > 0 && annotation.strokeColor) {
                    ctx.lineWidth = annotation.strokeWidth;
                    ctx.strokeStyle = hexToRgba(annotation.strokeColor, annotation.strokeOpacity ?? 1);
                    ctx.strokeText(line, annotation.x, annotation.y + i * lineHeight);
                }
                ctx.fillText(line, annotation.x, annotation.y + i * lineHeight);
            });
        }
    }
    ctx.restore();
}

export const getMultiAnnotationBounds = (selections: { imageId: string | null; annotationId: string }[], images: CanvasImage[], canvasAnnotations: Annotation[], ctx: CanvasRenderingContext2D): Rect | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    selections.forEach(sel => {
        const image = sel.imageId ? images.find(img => img.id === sel.imageId) : null;
        const annotation = image ? image.annotations.find(a => a.id === sel.annotationId) : canvasAnnotations.find(a => a.id === sel.annotationId);
        
        if (annotation) {
            const localBounds = getAnnotationPrimitiveBounds(annotation, ctx);
            
            // Corners in local space (untransformed primitive space)
            const corners = [
                { x: localBounds.x, y: localBounds.y },
                { x: localBounds.x + localBounds.width, y: localBounds.y },
                { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
                { x: localBounds.x, y: localBounds.y + localBounds.height }
            ];

            corners.forEach(corner => {
                 let globalPoint = corner;

                 // Apply Annotation Transform
                 const center = { x: localBounds.x + localBounds.width/2, y: localBounds.y + localBounds.height/2 };
                 let p = { x: corner.x - center.x, y: corner.y - center.y };
                 const rad = annotation.rotation * Math.PI / 180;
                 const cos = Math.cos(rad);
                 const sin = Math.sin(rad);
                 p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
                 p = { x: p.x * annotation.scale, y: p.y * annotation.scale };
                 const p_local_image = { x: p.x + center.x, y: p.y + center.y };

                 if (image) {
                     // Apply Image Transform
                     globalPoint = transformLocalToGlobal(p_local_image, image);
                 } else {
                     // Canvas annotation (already global)
                     globalPoint = p_local_image;
                 }
                 
                 minX = Math.min(minX, globalPoint.x);
                 minY = Math.min(minY, globalPoint.y);
                 maxX = Math.max(maxX, globalPoint.x);
                 maxY = Math.max(maxY, globalPoint.y);
                 found = true;
            });
        }
    });

    if (!found) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export type CropHandle = 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export const getCropHandles = (cropArea: Rect, scale: number): { name: CropHandle; rect: Rect; cursor: string }[] => {
    const handleSize = 10 / scale;
    const halfHandleSize = handleSize / 2;
    const { x, y, width, height } = cropArea;

    return [
        { name: 'top-left', rect: { x: x - halfHandleSize, y: y - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'nwse-resize' },
        { name: 'top', rect: { x: x + width / 2 - halfHandleSize, y: y - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'ns-resize' },
        { name: 'top-right', rect: { x: x + width - halfHandleSize, y: y - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'nesw-resize' },
        { name: 'left', rect: { x: x - halfHandleSize, y: y + height / 2 - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'ew-resize' },
        { name: 'right', rect: { x: x + width - halfHandleSize, y: y + height / 2 - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'ew-resize' },
        { name: 'bottom-left', rect: { x: x - halfHandleSize, y: y + height - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'nesw-resize' },
        { name: 'bottom', rect: { x: x + width / 2 - halfHandleSize, y: y + height - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'ns-resize' },
        { name: 'bottom-right', rect: { x: x + width - halfHandleSize, y: y + height - halfHandleSize, width: handleSize, height: handleSize }, cursor: 'nwse-resize' },
    ];
};

export const drawCanvas = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    images: CanvasImage[],
    selectedImageIds: string[],
    cropArea: Rect | null,
    viewTransform: { scale: number; offset: Point },
    drawingAnnotation: { annotation: Annotation | null, imageId: string | null },
    selectedAnnotations: { imageId: string | null; annotationId: string }[],
    marqueeRect: Rect | null,
    groups: Group[],
    canvasAnnotations: Annotation[],
    dropTargetImageId: string | null,
    selectedLayerId: string | null,
    layerOrder: string[]
) => {
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#1f2937'; // gray-800
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(viewTransform.offset.x, viewTransform.offset.y);
    ctx.scale(viewTransform.scale, viewTransform.scale);

    const imageMap = new Map(images.map(i => [i.id, i]));
    const groupMap = new Map(groups.map(g => [g.id, g]));
    const annotationMap = new Map(canvasAnnotations.map(a => [a.id, a]));

    // Helper to draw an image
    const drawImageItem = (id: string) => {
        const image = imageMap.get(id);
        if (!image || image.visible === false) return;

        ctx.save();
        const centerX = image.x + (image.width * image.scale) / 2;
        const centerY = image.y + (image.height * image.scale) / 2;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(image.rotation * Math.PI / 180);
        ctx.scale(image.scale, image.scale);
        
        // Draw with crop logic
        const sx = image.cropRect ? image.cropRect.x : 0;
        const sy = image.cropRect ? image.cropRect.y : 0;
        const sWidth = image.cropRect ? image.cropRect.width : image.originalWidth;
        const sHeight = image.cropRect ? image.cropRect.height : image.originalHeight;
        
        ctx.drawImage(image.element, sx, sy, sWidth, sHeight, -image.width / 2, -image.height / 2, image.width, image.height);

        if (dropTargetImageId === image.id) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 4 / image.scale;
            ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height);
        }

        if (selectedImageIds.includes(image.id)) {
            ctx.strokeStyle = '#3b82f6'; // blue-500
            ctx.lineWidth = 2 / image.scale;
            ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height);
        } else if (image.outlineWidth && image.outlineWidth > 0) {
             ctx.strokeStyle = hexToRgba(image.outlineColor || '#000000', image.outlineOpacity || 1);
             ctx.lineWidth = image.outlineWidth / image.scale;
             ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height);
        }

        // Annotations
        ctx.translate(-image.width / 2, -image.height / 2);
        image.annotations.forEach(anno => {
            drawAnnotation(ctx, anno);
            if (selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === image.id)) {
                 const bounds = getAnnotationPrimitiveBounds(anno, ctx);
                 let cx = 0, cy = 0;
                 if (anno.type === 'rect') { cx = anno.x + anno.width/2; cy = anno.y + anno.height/2; }
                 else if (anno.type === 'circle') { cx = anno.x; cy = anno.y; }
                 else if (anno.type === 'text') { cx = bounds.x + bounds.width/2; cy = bounds.y + bounds.height/2; }
                 else if (anno.type === 'freehand') {
                      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                      anno.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
                      cx = minX + (maxX-minX)/2; cy = minY + (maxY-minY)/2;
                 } else if (anno.type === 'arrow' || anno.type === 'line') {
                      cx = (anno.start.x + anno.end.x) / 2;
                      cy = (anno.start.y + anno.end.y) / 2;
                 }

                 ctx.save();
                 ctx.translate(cx, cy);
                 ctx.rotate(anno.rotation * Math.PI / 180);
                 ctx.scale(anno.scale, anno.scale);
                 ctx.translate(-cx, -cy);

                 if (anno.type === 'arrow' || anno.type === 'line') {
                     const handleSize = 8 / (image.scale * anno.scale * viewTransform.scale);
                     ctx.fillStyle = '#ffffff';
                     ctx.strokeStyle = '#ef4444';
                     ctx.lineWidth = 1 / (image.scale * viewTransform.scale);
                     
                     ctx.beginPath(); ctx.arc(anno.start.x, anno.start.y, handleSize/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                     ctx.beginPath(); ctx.arc(anno.end.x, anno.end.y, handleSize/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                 } else {
                     ctx.strokeStyle = '#ef4444';
                     ctx.lineWidth = 2 / (image.scale * anno.scale);
                     ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                     if (selectedAnnotations.length === 1) {
                         const handleSize = 8 / (image.scale * anno.scale * viewTransform.scale);
                         ctx.fillStyle = '#ffffff';
                         ctx.fillRect(bounds.x + bounds.width - handleSize/2, bounds.y + bounds.height - handleSize/2, handleSize, handleSize);
                         ctx.fillRect(bounds.x + bounds.width/2 - handleSize/2, bounds.y - 20/(image.scale * anno.scale * viewTransform.scale) - handleSize/2, handleSize, handleSize);
                         ctx.beginPath();
                         ctx.moveTo(bounds.x + bounds.width/2, bounds.y);
                         ctx.lineTo(bounds.x + bounds.width/2, bounds.y - 20/(image.scale * anno.scale * viewTransform.scale));
                         ctx.stroke();
                     }
                 }
                 ctx.restore();
            }
        });
        
        if (drawingAnnotation.imageId === image.id && drawingAnnotation.annotation) {
            drawAnnotation(ctx, drawingAnnotation.annotation);
        }

        ctx.restore();
    };

    // Helper to draw canvas annotation
    const drawCanvasAnnotationItem = (id: string) => {
        const anno = annotationMap.get(id);
        if (!anno) return;

        drawAnnotation(ctx, anno);
        if (selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === null)) {
             const bounds = getAnnotationPrimitiveBounds(anno, ctx);
             let cx = 0, cy = 0;
             if (anno.type === 'rect') { cx = anno.x + anno.width/2; cy = anno.y + anno.height/2; }
             else if (anno.type === 'circle') { cx = anno.x; cy = anno.y; }
             else if (anno.type === 'text') { cx = bounds.x + bounds.width/2; cy = bounds.y + bounds.height/2; }
             else if (anno.type === 'freehand') {
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  anno.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
                  cx = minX + (maxX-minX)/2; cy = minY + (maxY-minY)/2;
             } else if (anno.type === 'arrow' || anno.type === 'line') {
                  cx = (anno.start.x + anno.end.x) / 2;
                  cy = (anno.start.y + anno.end.y) / 2;
             }
             
             ctx.save();
             ctx.translate(cx, cy);
             ctx.rotate(anno.rotation * Math.PI / 180);
             ctx.scale(anno.scale, anno.scale);
             ctx.translate(-cx, -cy);

             if (anno.type === 'arrow' || anno.type === 'line') {
                 const handleSize = 8 / (anno.scale * viewTransform.scale);
                 ctx.fillStyle = '#ffffff';
                 ctx.strokeStyle = '#ef4444';
                 ctx.lineWidth = 1 / viewTransform.scale;
                 
                 ctx.beginPath(); ctx.arc(anno.start.x, anno.start.y, handleSize/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                 ctx.beginPath(); ctx.arc(anno.end.x, anno.end.y, handleSize/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
             } else {
                 ctx.strokeStyle = '#ef4444';
                 ctx.lineWidth = 2 / viewTransform.scale;
                 ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    
                 if (selectedAnnotations.length === 1) {
                     const handleSize = 8 / (anno.scale * viewTransform.scale);
                     ctx.fillStyle = '#ffffff';
                     ctx.fillRect(bounds.x + bounds.width - handleSize/2, bounds.y + bounds.height - handleSize/2, handleSize, handleSize);
                     ctx.fillRect(bounds.x + bounds.width/2 - handleSize/2, bounds.y - 20/(anno.scale * viewTransform.scale) - handleSize/2, handleSize, handleSize);
                     ctx.beginPath();
                     ctx.moveTo(bounds.x + bounds.width/2, bounds.y);
                     ctx.lineTo(bounds.x + bounds.width/2, bounds.y - 20/(anno.scale * viewTransform.scale));
                     ctx.stroke();
                 }
             }
             ctx.restore();
        }
    };

    // Helper to draw group
    const drawGroupItem = (id: string) => {
        const group = groupMap.get(id);
        if (!group || group.visible === false) return;
        
        // Draw children recursively? 
        // NOTE: layerOrder contains top-level items. If a group is top-level, its children are rendered here.
        // However, `images` list contains ALL images. `groups` contains ALL groups.
        // If we render nested structure, we rely on `group.imageIds` order (z-index).
        // Since `reorderLayers` updates `group.imageIds`, we can trust that order.
        
        group.groupIds.forEach(childGroupId => drawGroupItem(childGroupId));
        group.imageIds.forEach(childImageId => drawImageItem(childImageId));

        // Draw Group Bounding Box / Label if selected or configured
        const bounds = getGroupBounds(group, groups, images);
        if (bounds) {
            ctx.save();
            // Only draw dashed box if selected to reduce clutter, or if debug/ui logic requires it.
            // Matching previous behavior:
            ctx.strokeStyle = selectedLayerId === group.id ? '#3b82f6' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2 / viewTransform.scale;
            ctx.setLineDash([5 / viewTransform.scale, 5 / viewTransform.scale]);
            ctx.fillStyle = selectedLayerId === group.id ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)';
            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            
            if (group.showLabel) {
                const fontSize = 14 / viewTransform.scale;
                ctx.font = `bold ${fontSize}px sans-serif`;
                const textMetrics = ctx.measureText(group.label);
                const padding = 4 / viewTransform.scale;
                const labelHeight = fontSize + padding * 2;
                const labelWidth = textMetrics.width + padding * 2;
                ctx.fillStyle = selectedLayerId === group.id ? '#3b82f6' : 'rgba(50, 50, 50, 0.8)';
                ctx.fillRect(bounds.x, bounds.y - labelHeight, labelWidth, labelHeight);
                ctx.fillStyle = '#ffffff';
                ctx.textBaseline = 'middle';
                ctx.fillText(group.label, bounds.x + padding, bounds.y - labelHeight / 2);
            }
            ctx.restore();
        }
    };

    // Main Draw Loop based on Layer Order
    layerOrder.forEach(id => {
        if (groupMap.has(id)) {
            drawGroupItem(id);
        } else if (imageMap.has(id)) {
            drawImageItem(id);
        } else if (annotationMap.has(id)) {
            drawCanvasAnnotationItem(id);
        }
    });

    // Draw active drawing
    if (drawingAnnotation.imageId === null && drawingAnnotation.annotation) {
        drawAnnotation(ctx, drawingAnnotation.annotation);
    }

    if (cropArea) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / viewTransform.scale;
        ctx.setLineDash([5 / viewTransform.scale, 5 / viewTransform.scale]);
        ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
        ctx.setLineDash([]);

        // Draw Crop Handles
        const handles = getCropHandles(cropArea, viewTransform.scale);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3b82f6'; // blue-500
        ctx.lineWidth = 2 / viewTransform.scale;
        
        handles.forEach(handle => {
            ctx.fillRect(handle.rect.x, handle.rect.y, handle.rect.width, handle.rect.height);
            ctx.strokeRect(handle.rect.x, handle.rect.y, handle.rect.width, handle.rect.height);
        });
    }

    if (marqueeRect) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 / viewTransform.scale;
        ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
        ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
    }
    
    // Multi-selection bounds handles
    if (selectedAnnotations.length > 1) {
        const multiBounds = getMultiAnnotationBounds(selectedAnnotations, images, canvasAnnotations, ctx);
        if (multiBounds) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1 / viewTransform.scale;
            ctx.setLineDash([4 / viewTransform.scale, 2 / viewTransform.scale]);
            ctx.strokeRect(multiBounds.x, multiBounds.y, multiBounds.width, multiBounds.height);
            ctx.setLineDash([]);

            // Draw Handles
            const handleSize = 8 / viewTransform.scale;
            ctx.fillStyle = '#ffffff';
            // Scale Handle
            ctx.fillRect(multiBounds.x + multiBounds.width - handleSize/2, multiBounds.y + multiBounds.height - handleSize/2, handleSize, handleSize);
            // Rotation Handle
            ctx.fillRect(multiBounds.x + multiBounds.width/2 - handleSize/2, multiBounds.y - 20/viewTransform.scale - handleSize/2, handleSize, handleSize);
            // Line to rotation handle
            ctx.beginPath();
            ctx.moveTo(multiBounds.x + multiBounds.width/2, multiBounds.y);
            ctx.lineTo(multiBounds.x + multiBounds.width/2, multiBounds.y - 20/viewTransform.scale);
            ctx.stroke();
        }
    }

    ctx.restore();
}