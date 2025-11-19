
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
        case 'text':
             ctx.save();
             ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
             const metrics = ctx.measureText(annotation.text);
             const height = annotation.fontSize;
             ctx.restore();
             return {
                x: annotation.x,
                y: annotation.y,
                width: metrics.width,
                height: height,
             };
        case 'arrow':
        case 'line':
             const minX = Math.min(annotation.start.x, annotation.end.x);
             const minY = Math.min(annotation.start.y, annotation.end.y);
             const maxX = Math.max(annotation.start.x, annotation.end.x);
             const maxY = Math.max(annotation.start.y, annotation.end.y);
             return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        default:
             return { x: 0, y: 0, width: 0, height: 0 };
    }
}

export function getAnnotationBounds(annotation: Annotation, ctx: CanvasRenderingContext2D, options?: { ignoreStyles?: boolean }): Rect {
    return getAnnotationPrimitiveBounds(annotation, ctx, options);
}

export const drawAnnotation = (ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    ctx.save();
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (annotation.type === 'arrow' || annotation.type === 'line') {
        const center = { x: (annotation.start.x + annotation.end.x)/2, y: (annotation.start.y + annotation.end.y)/2 };
        ctx.translate(center.x, center.y);
        ctx.rotate(annotation.rotation * Math.PI / 180);
        ctx.scale(annotation.scale, annotation.scale);
        ctx.translate(-center.x, -center.y);

        ctx.beginPath();
        ctx.moveTo(annotation.start.x, annotation.start.y);
        ctx.lineTo(annotation.end.x, annotation.end.y);
        ctx.stroke();

        if (annotation.type === 'arrow') {
             const angle = Math.atan2(annotation.end.y - annotation.start.y, annotation.end.x - annotation.start.x);
             const headLen = 10 * annotation.scale + annotation.strokeWidth;
             ctx.beginPath();
             ctx.moveTo(annotation.end.x, annotation.end.y);
             ctx.lineTo(annotation.end.x - headLen * Math.cos(angle - Math.PI / 6), annotation.end.y - headLen * Math.sin(angle - Math.PI / 6));
             ctx.moveTo(annotation.end.x, annotation.end.y);
             ctx.lineTo(annotation.end.x - headLen * Math.cos(angle + Math.PI / 6), annotation.end.y - headLen * Math.sin(angle + Math.PI / 6));
             ctx.stroke();
        }
    } else {
        let cx = 0, cy = 0;
        if (annotation.type === 'rect') { cx = annotation.x + annotation.width/2; cy = annotation.y + annotation.height/2; }
        else if (annotation.type === 'circle') { cx = annotation.x; cy = annotation.y; }
        else if (annotation.type === 'text') { cx = annotation.x; cy = annotation.y; } 
        else if (annotation.type === 'freehand') {
             let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
             annotation.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
             cx = minX + (maxX-minX)/2; cy = minY + (maxY-minY)/2;
        }

        ctx.translate(cx, cy);
        ctx.rotate(annotation.rotation * Math.PI / 180);
        ctx.scale(annotation.scale, annotation.scale);
        ctx.translate(-cx, -cy);

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
            if (annotation.fillColor) {
                ctx.fillStyle = hexToRgba(annotation.fillColor, annotation.fillOpacity ?? 1);
                ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
            }
            ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
        } else if (annotation.type === 'circle') {
            ctx.beginPath();
            ctx.arc(annotation.x, annotation.y, annotation.radius, 0, Math.PI * 2);
            if (annotation.fillColor) {
                ctx.fillStyle = hexToRgba(annotation.fillColor, annotation.fillOpacity ?? 1);
                ctx.fill();
            }
            ctx.stroke();
        } else if (annotation.type === 'text') {
            ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
            ctx.textBaseline = 'top';
            
            const lines = annotation.text.split('\n');
            const lineHeight = annotation.fontSize * 1.2;
            
            if (annotation.backgroundColor) {
                 const metrics = ctx.measureText(annotation.text);
                 ctx.fillStyle = hexToRgba(annotation.backgroundColor, annotation.backgroundOpacity ?? 1);
                 ctx.fillRect(annotation.x, annotation.y, metrics.width, lineHeight * lines.length);
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
            
            // Corners in local space
            const corners = [
                { x: localBounds.x, y: localBounds.y },
                { x: localBounds.x + localBounds.width, y: localBounds.y },
                { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
                { x: localBounds.x, y: localBounds.y + localBounds.height }
            ];

            corners.forEach(corner => {
                 let globalPoint = corner;
                 if (image) {
                     // First local rotation/scale of annotation (if any, usually handled in primitive bounds for simple shapes, but if rotated...)
                     // getAnnotationPrimitiveBounds returns UNROTATED bounds relative to parent.
                     // We need to apply annotation rotation/scale, THEN image rotation/scale.
                     
                     // Apply annotation transform
                     const center = { x: localBounds.x + localBounds.width/2, y: localBounds.y + localBounds.height/2 };
                     let p = { x: corner.x - center.x, y: corner.y - center.y };
                     const rad = annotation.rotation * Math.PI / 180;
                     const cos = Math.cos(rad);
                     const sin = Math.sin(rad);
                     p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
                     p = { x: p.x * annotation.scale, y: p.y * annotation.scale };
                     const p_local_image = { x: p.x + center.x, y: p.y + center.y };
                     
                     globalPoint = transformLocalToGlobal(p_local_image, image);
                 } else {
                     // Canvas annotation
                     const center = { x: localBounds.x + localBounds.width/2, y: localBounds.y + localBounds.height/2 };
                     let p = { x: corner.x - center.x, y: corner.y - center.y };
                     const rad = annotation.rotation * Math.PI / 180;
                     const cos = Math.cos(rad);
                     const sin = Math.sin(rad);
                     p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
                     p = { x: p.x * annotation.scale, y: p.y * annotation.scale };
                     globalPoint = { x: p.x + center.x, y: p.y + center.y };
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
    selectedLayerId: string | null
) => {
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#1f2937'; // gray-800
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(viewTransform.offset.x, viewTransform.offset.y);
    ctx.scale(viewTransform.scale, viewTransform.scale);

    // Draw Images
    const imageMap = new Map(images.map(i => [i.id, i]));
    const drawImageItem = (id: string) => {
        const image = imageMap.get(id);
        if (!image) return;

        ctx.save();
        const centerX = image.x + (image.width * image.scale) / 2;
        const centerY = image.y + (image.height * image.scale) / 2;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(image.rotation * Math.PI / 180);
        ctx.scale(image.scale, image.scale);
        
        ctx.drawImage(image.element, -image.width / 2, -image.height / 2, image.width, image.height);

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
                // Draw selection box
                 const bounds = getAnnotationPrimitiveBounds(anno, ctx); 
                 // This is unrotated primitive bounds. 
                 // We need to draw selection in the annotation's local space including rotation/scale
                 
                 ctx.save();
                 let cx = 0, cy = 0;
                 if (anno.type === 'rect') { cx = anno.x + anno.width/2; cy = anno.y + anno.height/2; }
                 else if (anno.type === 'circle') { cx = anno.x; cy = anno.y; }
                 else if (anno.type === 'text') { cx = anno.x; cy = anno.y; }
                 else if (anno.type === 'freehand') {
                      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                      anno.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
                      cx = minX + (maxX-minX)/2; cy = minY + (maxY-minY)/2;
                 }
                 
                 if (anno.type !== 'line' && anno.type !== 'arrow') {
                     ctx.translate(cx, cy);
                     ctx.rotate(anno.rotation * Math.PI / 180);
                     ctx.scale(anno.scale, anno.scale);
                     ctx.translate(-cx, -cy);
                 }

                 ctx.strokeStyle = '#ef4444';
                 ctx.lineWidth = 2 / (image.scale * anno.scale);
                 // Use primitive bounds x,y,w,h
                 ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                 ctx.restore();
            }
        });
        
        if (drawingAnnotation.imageId === image.id && drawingAnnotation.annotation) {
            drawAnnotation(ctx, drawingAnnotation.annotation);
        }

        ctx.restore();
    };

    // Draw all images in order of `images` array (bottom to top)
    images.forEach(img => drawImageItem(img.id));

    // Draw Groups Labels/Bounds
    groups.forEach(group => {
        if (group.showLabel || selectedLayerId === group.id) {
            const bounds = getGroupBounds(group, groups, images);
            if (bounds) {
                ctx.save();
                // Background/Frame for group
                ctx.strokeStyle = selectedLayerId === group.id ? '#3b82f6' : 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 2 / viewTransform.scale;
                ctx.setLineDash([5 / viewTransform.scale, 5 / viewTransform.scale]);
                
                // Optional: Light fill for "background" feel
                ctx.fillStyle = selectedLayerId === group.id ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)';
                ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                
                if (group.showLabel) {
                    // Label background
                    const fontSize = 14 / viewTransform.scale;
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    const textMetrics = ctx.measureText(group.label);
                    const padding = 4 / viewTransform.scale;
                    const labelHeight = fontSize + padding * 2;
                    const labelWidth = textMetrics.width + padding * 2;
                    
                    ctx.fillStyle = selectedLayerId === group.id ? '#3b82f6' : 'rgba(50, 50, 50, 0.8)';
                    ctx.fillRect(bounds.x, bounds.y - labelHeight, labelWidth, labelHeight);
                    
                    // Label Text
                    ctx.fillStyle = '#ffffff';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(group.label, bounds.x + padding, bounds.y - labelHeight / 2);
                }
                ctx.restore();
            }
        }
    });

    // Draw Canvas Annotations
    canvasAnnotations.forEach(anno => {
        drawAnnotation(ctx, anno);
        if (selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === null)) {
             const bounds = getAnnotationPrimitiveBounds(anno, ctx);
             ctx.save();
             let cx = 0, cy = 0;
             if (anno.type === 'rect') { cx = anno.x + anno.width/2; cy = anno.y + anno.height/2; }
             else if (anno.type === 'circle') { cx = anno.x; cy = anno.y; }
             else if (anno.type === 'text') { cx = anno.x; cy = anno.y; }
             else if (anno.type === 'freehand') {
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  anno.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
                  cx = minX + (maxX-minX)/2; cy = minY + (maxY-minY)/2;
             }

             if (anno.type !== 'line' && anno.type !== 'arrow') {
                 ctx.translate(cx, cy);
                 ctx.rotate(anno.rotation * Math.PI / 180);
                 ctx.scale(anno.scale, anno.scale);
                 ctx.translate(-cx, -cy);
             }
             
             ctx.strokeStyle = '#ef4444';
             ctx.lineWidth = 2;
             ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
             ctx.restore();
        }
    });

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
    }

    if (marqueeRect) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 / viewTransform.scale;
        ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
        ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
    }
    
    // Multi-selection bounds
    if (selectedAnnotations.length > 1) {
        const multiBounds = getMultiAnnotationBounds(selectedAnnotations, images, canvasAnnotations, ctx);
        if (multiBounds) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1 / viewTransform.scale;
            ctx.setLineDash([4 / viewTransform.scale, 2 / viewTransform.scale]);
            ctx.strokeRect(multiBounds.x, multiBounds.y, multiBounds.width, multiBounds.height);
            ctx.setLineDash([]);
        }
    }

    ctx.restore();
}
