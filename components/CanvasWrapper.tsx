
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import { CanvasImage, Rect, Point, AspectRatio, AnnotationTool, Annotation, FreehandAnnotation, RectAnnotation, CircleAnnotation, TextAnnotation, ArrowAnnotation, LineAnnotation, Group } from '../types';
import { readImageFile } from '../utils/fileUtils';
import { drawCanvas, getAnnotationBounds, getAnnotationPrimitiveBounds, transformLocalToGlobal } from '../utils/canvasUtils';
import { rgbToHex } from '../utils/colorUtils';

type AnnotationSelection = { imageId: string | null; annotationId: string; };

interface CanvasWrapperProps {
  images: CanvasImage[];
  groups: Group[];
  setImages: (updater: (prevImages: CanvasImage[]) => CanvasImage[]) => void;
  onInteractionEnd: () => void;
  selectedImageIds: string[];
  setSelectedImageId: (id: string | null, multiSelect?: boolean) => void;
  onSelectImages: (ids: string[], keepExisting: boolean) => void;
  cropArea: Rect | null;
  setCropArea: React.Dispatch<React.SetStateAction<Rect | null>>;
  aspectRatio: AspectRatio;
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  toolOptions: { color: string; strokeWidth: number; fontSize: number; fontFamily: string; backgroundColor: string; backgroundOpacity: number; strokeColor: string; strokeOpacity: number; fillColor: string, fillOpacity: number, outlineColor: string, outlineWidth: number, outlineOpacity: number };
  addAnnotation: (imageId: string, annotation: Annotation) => void;
  deleteSelectedAnnotations: () => void;
  viewTransform: { scale: number; offset: Point };
  setViewTransform: React.Dispatch<React.SetStateAction<{ scale: number; offset: Point }>>;
  selectedAnnotations: AnnotationSelection[];
  setSelectedAnnotations: (updater: (prev: AnnotationSelection[]) => AnnotationSelection[]) => void;
  updateAnnotation: (changes: Partial<Annotation>) => void;
  onColorPicked: (color: string) => void;
  canvasAnnotations: Annotation[];
  addCanvasAnnotation: (annotation: Annotation) => void;
  onMoveCanvasAnnotations: (delta: Point) => void;
  onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
  reparentImageAnnotationsToImage: (annotations: Array<{ annotationId: string; imageId: string }>, newImageId: string) => void;
  onMoveSelectedImages: (delta: Point) => void;
}

type CropHandle = 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
type InteractionMode = 'pan' | 'move' | 'crop' | 'resize-crop' | 'annotating' | 'move-crop' | 'move-annotation' | 'marquee-select' | 'scale-annotation' | 'rotate-annotation' | 'resize-arrow-start' | 'resize-arrow-end';

type InteractionState =
  | { mode: 'pan'; startPoint: Point }
  | { mode: 'move'; startPoint: Point }
  | { mode: 'crop'; startPoint: Point }
  | { mode: 'resize-crop'; handle: CropHandle; startPoint: Point; initialCropArea: Rect }
  | { mode: 'annotating'; startPoint: Point; shiftKey: boolean }
  | { mode: 'move-crop'; startPoint: Point; initialCropArea: Rect }
  | { mode: 'move-annotation'; startPoint: Point }
  | { mode: 'marquee-select'; startPoint: Point }
  | { mode: 'scale-annotation'; startPoint: Point; center: Point; annotationId: string; imageId: string | null; startScale: number; startDist: number; }
  | { mode: 'rotate-annotation'; startPoint: Point; center: Point; annotationId: string; imageId: string | null; startRotation: number; startAngle: number; }
  | { mode: 'resize-arrow-start'; startPoint: Point; annotationId: string; imageId: string | null; }
  | { mode: 'resize-arrow-end'; startPoint: Point; annotationId: string; imageId: string | null; };

const getCropHandles = (cropArea: Rect, scale: number): { name: CropHandle; rect: Rect; cursor: string }[] => {
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

const isPointInRect = (point: Point, rect: Rect) => {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
           point.y >= rect.y && point.y <= rect.y + rect.height;
};

export const CanvasWrapper = forwardRef<HTMLCanvasElement, CanvasWrapperProps>(({
  images,
  groups,
  setImages,
  onInteractionEnd,
  selectedImageIds,
  setSelectedImageId,
  onSelectImages,
  cropArea,
  setCropArea,
  aspectRatio,
  activeTool,
  toolOptions,
  addAnnotation,
  viewTransform,
  setViewTransform,
  selectedAnnotations,
  setSelectedAnnotations,
  updateAnnotation,
  setActiveTool,
  onColorPicked,
  canvasAnnotations,
  addCanvasAnnotation,
  onMoveCanvasAnnotations,
  onReparentCanvasAnnotationsToImage,
  reparentImageAnnotationsToImage,
  onMoveSelectedImages,
  deleteSelectedAnnotations,
}, ref) => {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => internalCanvasRef.current!);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const lastMousePosition = useRef<Point>({ x: 0, y: 0 });
  const [drawingAnnotation, setDrawingAnnotation] = useState<{ annotation: Annotation | null, imageId: string | null }>({ annotation: null, imageId: null });
  const [isCropKeyPressed, setIsCropKeyPressed] = useState(false);
  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [dropTargetImageId, setDropTargetImageId] = useState<string | null>(null);

  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (canvas && !contextRef.current) {
        contextRef.current = canvas.getContext('2d', { willReadFrequently: true });
    }
  }, []);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditingText = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;

      if (isEditingText) return;

      if (e.key.toLowerCase() === 'c' && !e.repeat) setIsCropKeyPressed(true);
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacebarPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') setIsCropKeyPressed(false);
      if (e.code === 'Space') setIsSpacebarPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getCanvasPoint = useCallback((screenPoint: Point): Point => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return screenPoint;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (screenPoint.x - rect.left - viewTransform.offset.x) / viewTransform.scale,
      y: (screenPoint.y - rect.top - viewTransform.offset.y) / viewTransform.scale,
    };
  }, [viewTransform]);

  const getUnboundedLocalPoint = useCallback((canvasPoint: Point, image: CanvasImage): Point => {
      const centerX = image.x + image.width * image.scale / 2;
      const centerY = image.y + image.height * image.scale / 2;
      const dx = canvasPoint.x - centerX;
      const dy = canvasPoint.y - centerY;
      const rad = -image.rotation * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotatedDx = dx * cos - dy * sin;
      const rotatedDy = dx * sin + dy * cos;
      const localX = (rotatedDx / image.scale) + image.width / 2;
      const localY = (rotatedDy / image.scale) + image.height / 2;
      return { x: localX, y: localY };
  }, []);

  const getLocalPoint = useCallback((canvasPoint: Point, image: CanvasImage): Point | null => {
      const localPoint = getUnboundedLocalPoint(canvasPoint, image);
      if(localPoint.x >= 0 && localPoint.x <= image.width && localPoint.y >= 0 && localPoint.y <= image.height) {
        return localPoint;
      }
      return null;
  }, [getUnboundedLocalPoint]);

  const findAnnotationAtPoint = useCallback((canvasPoint: Point): { imageId: string | null, annotationId: string } | null => {
    const ctx = contextRef.current;
    if (!ctx) return null;

    for (const image of [...images].reverse()) {
        const localPointInImage = getUnboundedLocalPoint(canvasPoint, image);

        for (const annotation of [...image.annotations].reverse()) {
            if (annotation.type === 'line' || annotation.type === 'arrow') {
                const { start, end } = annotation;
                const l2 = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
                if (l2 === 0) continue;

                let t = ((localPointInImage.x - start.x) * (end.x - start.x) + (localPointInImage.y - start.y) * (end.y - start.y)) / l2;
                t = Math.max(0, Math.min(1, t));

                const closestPointOnSegment = {
                    x: start.x + t * (end.x - start.x),
                    y: start.y + t * (end.y - start.y),
                };

                const distance = Math.hypot(localPointInImage.x - closestPointOnSegment.x, localPointInImage.y - closestPointOnSegment.y);
                const clickThreshold = (annotation.strokeWidth / 2) + (5 / (image.scale * viewTransform.scale));

                if (distance < clickThreshold) {
                    return { imageId: image.id, annotationId: annotation.id };
                }
            } else {
                const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
                const normalizedBounds = { ...primitiveBounds };
                if (normalizedBounds.width < 0) { normalizedBounds.x += normalizedBounds.width; normalizedBounds.width *= -1; }
                if (normalizedBounds.height < 0) { normalizedBounds.y += normalizedBounds.height; normalizedBounds.height *= -1; }

                const center = {
                    x: primitiveBounds.x + primitiveBounds.width / 2,
                    y: primitiveBounds.y + primitiveBounds.height / 2,
                };

                let p = { x: localPointInImage.x - center.x, y: localPointInImage.y - center.y };
                const rad = -annotation.rotation * Math.PI / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
                if (annotation.scale !== 0) {
                    p = { x: p.x / annotation.scale, y: p.y / annotation.scale };
                }
                const localPointInAnnotation = { x: p.x + center.x, y: p.y + center.y };

                if (isPointInRect(localPointInAnnotation, normalizedBounds)) {
                    return { imageId: image.id, annotationId: annotation.id };
                }
            }
        }
    }

    for (const annotation of [...canvasAnnotations].reverse()) {
        if (annotation.type === 'line' || annotation.type === 'arrow') {
            const { start, end } = annotation;
            const l2 = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
            if (l2 === 0) continue;

            let t = ((canvasPoint.x - start.x) * (end.x - start.x) + (canvasPoint.y - start.y) * (end.y - start.y)) / l2;
            t = Math.max(0, Math.min(1, t));

            const closestPointOnSegment = {
                x: start.x + t * (end.x - start.x),
                y: start.y + t * (end.y - start.y),
            };

            const distance = Math.hypot(canvasPoint.x - closestPointOnSegment.x, canvasPoint.y - closestPointOnSegment.y);
            const clickThreshold = (annotation.strokeWidth / 2) + (5 / viewTransform.scale);

            if (distance < clickThreshold) {
                return { imageId: null, annotationId: annotation.id };
            }
        } else {
            const primitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
            const normalizedBounds = { ...primitiveBounds };
            if (normalizedBounds.width < 0) { normalizedBounds.x += normalizedBounds.width; normalizedBounds.width *= -1; }
            if (normalizedBounds.height < 0) { normalizedBounds.y += normalizedBounds.height; normalizedBounds.height *= -1; }

            const center = {
                x: primitiveBounds.x + primitiveBounds.width / 2,
                y: primitiveBounds.y + primitiveBounds.height / 2,
            };

            let p = { x: canvasPoint.x - center.x, y: canvasPoint.y - center.y };
            const rad = -annotation.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
            if (annotation.scale !== 0) {
                p = { x: p.x / annotation.scale, y: p.y / annotation.scale };
            }
            const localPointInAnnotation = { x: p.x + center.x, y: p.y + center.y };

            if (isPointInRect(localPointInAnnotation, normalizedBounds)) {
                return { imageId: null, annotationId: annotation.id };
            }
        }
    }
    return null;
  }, [images, getUnboundedLocalPoint, viewTransform.scale, canvasAnnotations]);
  

  useLayoutEffect(() => {
    const canvas = internalCanvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    drawCanvas(ctx, canvas, images, selectedImageIds, cropArea, viewTransform, drawingAnnotation, selectedAnnotations, marqueeRect, groups, canvasAnnotations, dropTargetImageId);
  }, [images, selectedImageIds, cropArea, viewTransform, drawingAnnotation, selectedAnnotations, marqueeRect, groups, canvasAnnotations, dropTargetImageId]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = internalCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = 1.1;
    const scale = e.deltaY < 0 ? viewTransform.scale * zoomFactor : viewTransform.scale / zoomFactor;
    const newScale = Math.max(0.1, Math.min(scale, 10));

    const worldX = (mouseX - viewTransform.offset.x) / viewTransform.scale;
    const worldY = (mouseY - viewTransform.offset.y) / viewTransform.scale;

    const newOffsetX = mouseX - worldX * newScale;
    const newOffsetY = mouseY - worldY * newScale;

    setViewTransform({ scale: newScale, offset: { x: newOffsetX, y: newOffsetY } });
  }, [viewTransform, setViewTransform]);

    const getAnnotationLocalPoint = useCallback((canvasPoint: Point, annotation: Annotation, image: CanvasImage | null, ctx: CanvasRenderingContext2D): Point => {
        const annoPrimitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
        const center = { x: annoPrimitiveBounds.x + annoPrimitiveBounds.width / 2, y: annoPrimitiveBounds.y + annoPrimitiveBounds.height / 2 };

        let parentSpacePoint: Point;
        if (image) {
            parentSpacePoint = getUnboundedLocalPoint(canvasPoint, image);
        } else {
            parentSpacePoint = canvasPoint;
        }

        let p = { x: parentSpacePoint.x - center.x, y: parentSpacePoint.y - center.y };
        if (annotation.type !== 'arrow' && annotation.type !== 'line') {
            const rad = -annotation.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
            if (annotation.scale !== 0) {
                p = { x: p.x / annotation.scale, y: p.y / annotation.scale };
            }
        }
        return { x: p.x + center.x, y: p.y + center.y };
    }, [getUnboundedLocalPoint]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = internalCanvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    
    if (activeTool === 'eyedropper') {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dpr = window.devicePixelRatio;
      const pixel = ctx.getImageData(x * dpr, y * dpr, 1, 1).data;
      onColorPicked(rgbToHex({ r: pixel[0], g: pixel[1], b: pixel[2] }));
      return;
    }

    const startPoint = { x: e.clientX, y: e.clientY };
    lastMousePosition.current = startPoint;
    const canvasPoint = getCanvasPoint(startPoint);

    if (isSpacebarPressed) {
      setInteraction({ mode: 'pan', startPoint });
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (isCropKeyPressed) {
        setInteraction({ mode: 'crop', startPoint: canvasPoint });
        setCropArea({ x: canvasPoint.x, y: canvasPoint.y, width: 0, height: 0 });
        return;
    }
    
    if (activeTool === 'select' && selectedAnnotations.length === 1) {
        const selection = selectedAnnotations[0];
        const image = selection.imageId ? images.find(img => img.id === selection.imageId) : null;
        const annotation = image 
            ? image.annotations.find(anno => anno.id === selection.annotationId)
            : canvasAnnotations.find(anno => anno.id === selection.annotationId);
        
        if (annotation) {
            const localPointForAnnotation = getAnnotationLocalPoint(canvasPoint, annotation, image, ctx);
            
            const baseScale = image ? image.scale : 1;
            const handleSize = 8 / (viewTransform.scale * baseScale);
            const clickRadius = handleSize / (annotation.type === 'arrow' || annotation.type === 'line' ? 1 : annotation.scale) * 1.5;
    
            if (annotation.type === 'arrow' || annotation.type === 'line') {
                if (Math.hypot(localPointForAnnotation.x - annotation.start.x, localPointForAnnotation.y - annotation.start.y) < clickRadius) {
                     setInteraction({ mode: 'resize-arrow-start', startPoint: canvasPoint, annotationId: annotation.id, imageId: image?.id ?? null });
                     return;
                }
                if (Math.hypot(localPointForAnnotation.x - annotation.end.x, localPointForAnnotation.y - annotation.end.y) < clickRadius) {
                     setInteraction({ mode: 'resize-arrow-end', startPoint: canvasPoint, annotationId: annotation.id, imageId: image?.id ?? null });
                     return;
                }
            } else {
                const bounds = getAnnotationPrimitiveBounds(annotation, ctx);
                const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
                const rotationHandleOffset = 20 / (viewTransform.scale * baseScale * annotation.scale);
                const scaleHandlePos = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
                const rotationHandlePos = { x: center.x, y: bounds.y - rotationHandleOffset };
    
                if (Math.hypot(localPointForAnnotation.x - scaleHandlePos.x, localPointForAnnotation.y - scaleHandlePos.y) < clickRadius) {
                    const parentSpaceClickPoint = image ? getUnboundedLocalPoint(canvasPoint, image) : canvasPoint;
                    const startDist = Math.hypot(parentSpaceClickPoint.x - center.x, parentSpaceClickPoint.y - center.y);
                    setInteraction({ mode: 'scale-annotation', startPoint: canvasPoint, center: center, annotationId: annotation.id, imageId: image?.id ?? null, startScale: annotation.scale, startDist: startDist });
                    return;
                }
                if (Math.hypot(localPointForAnnotation.x - rotationHandlePos.x, localPointForAnnotation.y - rotationHandlePos.y) < clickRadius) {
                    const parentSpaceClickPoint = image ? getUnboundedLocalPoint(canvasPoint, image) : canvasPoint;
                    const startAngle = Math.atan2(parentSpaceClickPoint.y - center.y, parentSpaceClickPoint.x - center.x);
                    setInteraction({ mode: 'rotate-annotation', startPoint: canvasPoint, center: center, annotationId: annotation.id, imageId: image?.id ?? null, startRotation: annotation.rotation, startAngle: startAngle });
                    return;
                }
            }
        }
    }

    if (activeTool === 'text') {
      let targetImage: CanvasImage | undefined;
      if (selectedImageIds.length === 1) {
        targetImage = images.find(img => img.id === selectedImageIds[0]);
      } else {
        targetImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img));
      }

      if (targetImage) {
        const localPoint = getUnboundedLocalPoint(canvasPoint, targetImage);
        const newAnnotation: TextAnnotation = {
          id: `anno-${Date.now()}`, type: 'text', x: localPoint.x, y: localPoint.y, text: 'New Text',
          scale: 1, rotation: 0, color: toolOptions.color, strokeWidth: toolOptions.strokeWidth, fontSize: toolOptions.fontSize,
          fontFamily: toolOptions.fontFamily, backgroundColor: toolOptions.backgroundColor, backgroundOpacity: toolOptions.backgroundOpacity,
          strokeColor: toolOptions.strokeColor, strokeOpacity: toolOptions.strokeOpacity,
        };
        addAnnotation(targetImage.id, newAnnotation);
        setSelectedAnnotations(() => [{ imageId: targetImage.id, annotationId: newAnnotation.id }]);
        setActiveTool('select');
        return;
      } else {
        const newAnnotation: TextAnnotation = {
            id: `anno-${Date.now()}`, type: 'text', x: canvasPoint.x, y: canvasPoint.y, text: 'New Text',
            scale: 1, rotation: 0, color: toolOptions.color, strokeWidth: toolOptions.strokeWidth, fontSize: toolOptions.fontSize,
            fontFamily: toolOptions.fontFamily, backgroundColor: toolOptions.backgroundColor, backgroundOpacity: toolOptions.backgroundOpacity,
            strokeColor: toolOptions.strokeColor, strokeOpacity: toolOptions.strokeOpacity,
        };
        addCanvasAnnotation(newAnnotation);
        setSelectedAnnotations(() => [{ imageId: null, annotationId: newAnnotation.id }]);
        setActiveTool('select');
        return;
      }
    }

    // FIX: Removed redundant check for 'eyedropper' since it's handled at the start of the function.
    if (activeTool !== 'select') {
      let targetImage: CanvasImage | undefined;
      if (selectedImageIds.length === 1) {
        targetImage = images.find(img => img.id === selectedImageIds[0]);
      } else {
        targetImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img));
      }
      
      const startPointForAnnotation = targetImage ? getUnboundedLocalPoint(canvasPoint, targetImage) : canvasPoint;
      
      let newAnnotation: Annotation | null = null;
      const baseAnno = { id: `anno-${Date.now()}`, color: toolOptions.color, strokeWidth: toolOptions.strokeWidth, scale: 1, rotation: 0 };
      setInteraction({ mode: 'annotating', startPoint: startPointForAnnotation, shiftKey: e.shiftKey });
      
      switch (activeTool) {
        case 'freehand':
          newAnnotation = { ...baseAnno, type: 'freehand', points: [startPointForAnnotation], outlineColor: toolOptions.outlineColor, outlineWidth: toolOptions.outlineWidth, outlineOpacity: toolOptions.outlineOpacity } as FreehandAnnotation;
          break;
        case 'rect':
          newAnnotation = { ...baseAnno, type: 'rect', x: startPointForAnnotation.x, y: startPointForAnnotation.y, width: 0, height: 0, fillColor: toolOptions.fillColor, fillOpacity: toolOptions.fillOpacity } as RectAnnotation;
          break;
        case 'circle':
          newAnnotation = { ...baseAnno, type: 'circle', x: startPointForAnnotation.x, y: startPointForAnnotation.y, radius: 0, fillColor: toolOptions.fillColor, fillOpacity: toolOptions.fillOpacity } as CircleAnnotation;
          break;
        case 'arrow':
          newAnnotation = { ...baseAnno, type: 'arrow', start: startPointForAnnotation, end: startPointForAnnotation, outlineColor: toolOptions.outlineColor, outlineWidth: toolOptions.outlineWidth, outlineOpacity: toolOptions.outlineOpacity } as ArrowAnnotation;
          break;
        case 'line':
          newAnnotation = { ...baseAnno, type: 'line', start: startPointForAnnotation, end: startPointForAnnotation, outlineColor: toolOptions.outlineColor, outlineWidth: toolOptions.outlineWidth, outlineOpacity: toolOptions.outlineOpacity } as LineAnnotation;
          break;
      }

      if (newAnnotation) {
        if (targetImage && !selectedImageIds.includes(targetImage.id)) {
            setSelectedImageId(targetImage.id);
        }
        setDrawingAnnotation({ annotation: newAnnotation, imageId: targetImage?.id ?? null });
      }
      return;
    }

    if (cropArea) {
        const handles = getCropHandles(cropArea, viewTransform.scale);
        for (const handle of handles) {
            if (isPointInRect(canvasPoint, handle.rect)) {
                setInteraction({ mode: 'resize-crop', handle: handle.name, startPoint: canvasPoint, initialCropArea: cropArea });
                return;
            }
        }
        if (isPointInRect(canvasPoint, cropArea)) {
            setInteraction({ mode: 'move-crop', startPoint: canvasPoint, initialCropArea: cropArea });
            return;
        }
        // If click is outside crop area, clear it and continue processing the click
        setCropArea(null);
    }

    if (activeTool === 'select') {
      const clickedAnnotation = findAnnotationAtPoint(canvasPoint);
      if (clickedAnnotation) {
          const isMultiSelect = e.shiftKey;
          setSelectedAnnotations(prev => {
              const selection = { imageId: clickedAnnotation.imageId, annotationId: clickedAnnotation.annotationId };
              const isAlreadySelected = prev.some(s => s.annotationId === selection.annotationId);
              
              if (isMultiSelect) {
                  return isAlreadySelected 
                      ? prev.filter(s => s.annotationId !== selection.annotationId) 
                      : [...prev, selection];
              } else {
                  if (isAlreadySelected) {
                      return prev;
                  }
                  return [selection];
              }
          });
          setInteraction({ mode: 'move-annotation', startPoint: canvasPoint });
          return;
      }
  
      const clickedImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img) !== null);
  
      if (clickedImage) {
        const isMultiSelectModifier = e.shiftKey || e.metaKey || e.ctrlKey;
        const isAlreadySelected = selectedImageIds.includes(clickedImage.id);
  
        if (isAlreadySelected && !isMultiSelectModifier) {
        } else {
          setSelectedImageId(clickedImage.id, isMultiSelectModifier);
        }
        setInteraction({ mode: 'move', startPoint: canvasPoint });
      } else {
        setInteraction({ mode: 'marquee-select', startPoint: canvasPoint });
        setMarqueeRect({ x: canvasPoint.x, y: canvasPoint.y, width: 0, height: 0 });
      }
    }
  }, [getCanvasPoint, images, setSelectedImageId, cropArea, viewTransform.scale, activeTool, toolOptions, getLocalPoint, getUnboundedLocalPoint, addAnnotation, isCropKeyPressed, setCropArea, findAnnotationAtPoint, setSelectedAnnotations, isSpacebarPressed, onSelectImages, selectedImageIds, setActiveTool, onColorPicked, addCanvasAnnotation, selectedAnnotations, getAnnotationLocalPoint, canvasAnnotations]);

  const handleInteractionMove = useCallback((e: MouseEvent) => {
    if (!interaction) return;
    const ctx = contextRef.current;
    if(!ctx) return;

    const currentPoint = { x: e.clientX, y: e.clientY };
    const canvasPoint = getCanvasPoint(currentPoint);
    
    const lastCanvasPoint = getCanvasPoint(lastMousePosition.current);
    const canvasDelta = { x: canvasPoint.x - lastCanvasPoint.x, y: canvasPoint.y - lastCanvasPoint.y };

    if (interaction.mode === 'annotating') {
      if (!drawingAnnotation.annotation) return;
      const image = drawingAnnotation.imageId ? images.find(img => img.id === drawingAnnotation.imageId) : null;
      
      const localPoint = image ? getUnboundedLocalPoint(canvasPoint, image) : canvasPoint;
      if(!localPoint) return;

      const startPoint = interaction.startPoint;
      setDrawingAnnotation(prev => {
        if (!prev.annotation) return prev;
        let updatedAnnotation = { ...prev.annotation };
        switch(updatedAnnotation.type) {
          case 'freehand':
              (updatedAnnotation as FreehandAnnotation).points.push(localPoint);
              break;
          case 'rect':
              (updatedAnnotation as RectAnnotation).width = localPoint.x - startPoint.x;
              (updatedAnnotation as RectAnnotation).height = localPoint.y - startPoint.y;
              break;
          case 'circle':
              const dx = localPoint.x - startPoint.x;
              const dy = localPoint.y - startPoint.y;
              (updatedAnnotation as CircleAnnotation).radius = Math.sqrt(dx * dx + dy * dy);
              break;
          case 'line':
          case 'arrow':
              let endPoint = localPoint;
              if (interaction.shiftKey) { // Using interaction.shiftKey set on mousedown
                  const dx_total = endPoint.x - startPoint.x;
                  const dy_total = endPoint.y - startPoint.y;
                  const angle = Math.atan2(dy_total, dx_total);
                  const length = Math.hypot(dx_total, dy_total);
                  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                  endPoint = {
                      x: startPoint.x + length * Math.cos(snappedAngle),
                      y: startPoint.y + length * Math.sin(snappedAngle),
                  };
              }
              (updatedAnnotation as (ArrowAnnotation | LineAnnotation)).end = endPoint;
              break;
        }
        return { ...prev, annotation: updatedAnnotation };
      });
    } else if (interaction.mode === 'move-annotation') {
        const imageSelections = selectedAnnotations.filter(s => s.imageId);
        const canvasSelections = selectedAnnotations.filter(s => !s.imageId);

        if (imageSelections.length > 0) {
            setImages(prevImages => prevImages.map(image => {
                const annotationsOnThisImage = imageSelections.filter(sel => sel.imageId === image.id);
                if (annotationsOnThisImage.length === 0) return image;
                
                const rad = -image.rotation * Math.PI / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                const rotatedDeltaX = canvasDelta.x * cos - canvasDelta.y * sin;
                const rotatedDeltaY = canvasDelta.x * sin + canvasDelta.y * cos;

                const localDelta = { x: rotatedDeltaX / image.scale, y: rotatedDeltaY / image.scale };

                return { ...image, annotations: image.annotations.map(annotation => {
                    if (!annotationsOnThisImage.some(sel => sel.annotationId === annotation.id)) return annotation;
                    switch (annotation.type) {
                        case 'rect': case 'circle': case 'text':
                            return { ...annotation, x: annotation.x + localDelta.x, y: annotation.y + localDelta.y };
                        case 'freehand':
                            return { ...annotation, points: annotation.points.map(p => ({ x: p.x + localDelta.x, y: p.y + localDelta.y })) };
                        case 'line': case 'arrow':
                            return { ...annotation, start: { x: annotation.start.x + localDelta.x, y: annotation.start.y + localDelta.y }, end: { x: annotation.end.x + localDelta.x, y: annotation.end.y + localDelta.y } };
                        default: return annotation;
                    }
                })};
            }));
            const sourceImageId = imageSelections[0]?.imageId;
            const topMostImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img));

            if (topMostImage && topMostImage.id !== sourceImageId) {
                setDropTargetImageId(topMostImage.id);
            } else {
                setDropTargetImageId(null);
            }
        }
        
        if (canvasSelections.length > 0) {
            onMoveCanvasAnnotations(canvasDelta);
            const hoveredImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img) !== null);
            setDropTargetImageId(hoveredImage ? hoveredImage.id : null);
        }
    } else if (interaction.mode === 'resize-arrow-start' || interaction.mode === 'resize-arrow-end') {
        const { imageId, annotationId } = interaction;
        const image = imageId ? images.find(img => img.id === imageId) : null;
        const annotation = image 
            ? image.annotations.find(a => a.id === annotationId)
            : canvasAnnotations.find(a => a.id === annotationId);

        if (!annotation || (annotation.type !== 'arrow' && annotation.type !== 'line')) return;
        
        let localPoint = image ? getUnboundedLocalPoint(canvasPoint, image) : canvasPoint;
        
        if (e.shiftKey) {
            const anchorPoint = interaction.mode === 'resize-arrow-start' 
                ? annotation.end 
                : annotation.start;
            const dx_total = localPoint.x - anchorPoint.x;
            const dy_total = localPoint.y - anchorPoint.y;
            const angle = Math.atan2(dy_total, dx_total);
            const length = Math.hypot(dx_total, dy_total);
            const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            localPoint = {
                x: anchorPoint.x + length * Math.cos(snappedAngle),
                y: anchorPoint.y + length * Math.sin(snappedAngle),
            };
        }

        let changes: Partial<LineAnnotation | ArrowAnnotation> = {};
        if (interaction.mode === 'resize-arrow-start') {
            changes.start = localPoint;
        } else {
            changes.end = localPoint;
        }
        updateAnnotation(changes);
    } else if (interaction.mode === 'scale-annotation') {
        const { center, startDist, startScale, imageId } = interaction;
        const image = imageId ? images.find(img => img.id === imageId) : null;
        
        const parentSpacePoint = image ? getUnboundedLocalPoint(canvasPoint, image) : canvasPoint;
        const currentDist = Math.hypot(parentSpacePoint.x - center.x, parentSpacePoint.y - center.y);
        
        const scaleFactor = (startDist > 0.001) ? currentDist / startDist : 1;
        let newScale = startScale * scaleFactor;

        newScale = Math.max(0.1, newScale);
        updateAnnotation({ scale: newScale });
    } else if (interaction.mode === 'rotate-annotation') {
        const { center, startAngle, startRotation, imageId } = interaction;
        const image = imageId ? images.find(img => img.id === imageId) : null;
        
        const parentSpacePoint = image ? getUnboundedLocalPoint(canvasPoint, image) : canvasPoint;
        const currentAngle = Math.atan2(parentSpacePoint.y - center.y, parentSpacePoint.x - center.x);

        const angleDelta = currentAngle - startAngle;
        const newRotation = startRotation + (angleDelta * 180 / Math.PI);
        updateAnnotation({ rotation: newRotation });
    } else if (interaction.mode === 'pan') {
      const dx = currentPoint.x - lastMousePosition.current.x;
      const dy = currentPoint.y - lastMousePosition.current.y;
      setViewTransform(prev => ({ ...prev, offset: { x: prev.offset.x + dx, y: prev.offset.y + dy } }));
    } else if (interaction.mode === 'move' && selectedImageIds.length > 0) {
        onMoveSelectedImages(canvasDelta);
    } else if (interaction.mode === 'move-crop') {
      setCropArea(prev => prev ? ({ ...prev, x: prev.x + canvasDelta.x, y: prev.y + canvasDelta.y }) : null);
    } else if (interaction.mode === 'marquee-select') {
        const start = interaction.startPoint;
        const width = canvasPoint.x - start.x;
        const height = canvasPoint.y - start.y;
        setMarqueeRect({
            x: width > 0 ? start.x : start.x + width,
            y: height > 0 ? start.y : start.y + height,
            width: Math.abs(width),
            height: Math.abs(height),
        });
    } else if (interaction.mode === 'crop') {
        const start = interaction.startPoint;
        let width = canvasPoint.x - start.x;
        let height = canvasPoint.y - start.y;
        
        if (aspectRatio !== 'free') {
            const ratioValues = aspectRatio.split(':').map(Number);
            const ratio = ratioValues[0] / ratioValues[1];
            if (Math.abs(width) > Math.abs(height * ratio)) {
              height = width / ratio * Math.sign(height||1);
            } else {
              width = height * ratio * Math.sign(width||1);
            }
        }
        setCropArea({
            x: width > 0 ? start.x : start.x + width,
            y: height > 0 ? start.y : start.y + height,
            width: Math.abs(width),
            height: Math.abs(height),
        });
    } else if (interaction.mode === 'resize-crop') {
        const { handle, startPoint, initialCropArea } = interaction;
        const dx = canvasPoint.x - startPoint.x;
        const dy = canvasPoint.y - startPoint.y;
        let { x, y, width, height } = initialCropArea;

        if (handle.includes('left')) { x += dx; width -= dx; }
        if (handle.includes('right')) { width += dx; }
        if (handle.includes('top')) { y += dy; height -= dy; }
        if (handle.includes('bottom')) { height += dy; }

        if (aspectRatio !== 'free' && (handle.includes('left') || handle.includes('right')) && (handle.includes('top') || handle.includes('bottom'))) {
            const ratioValues = aspectRatio.split(':').map(Number);
            const ratio = ratioValues[0] / ratioValues[1];
            if (Math.abs(width) / Math.abs(height) > ratio) {
                const oldHeight = height;
                height = width / ratio * Math.sign(height);
                if (handle.includes('top')) { y -= (height - oldHeight); }
            } else {
                const oldWidth = width;
                width = height * ratio * Math.sign(width);
                if (handle.includes('left')) { x -= (width - oldWidth); }
            }
        }
        setCropArea({ x, y, width, height });
    }
    
    lastMousePosition.current = currentPoint;
  }, [interaction, getCanvasPoint, setImages, viewTransform.scale, images, setCropArea, aspectRatio, drawingAnnotation, getUnboundedLocalPoint, setViewTransform, selectedAnnotations, updateAnnotation, selectedImageIds, setDrawingAnnotation, setMarqueeRect, onMoveCanvasAnnotations, getLocalPoint, getAnnotationLocalPoint, canvasAnnotations, onMoveSelectedImages]);

  const handleInteractionEnd = useCallback((e: MouseEvent) => {
    const canvas = internalCanvasRef.current;
    if (canvas && interaction?.mode === 'pan') {
        canvas.style.cursor = 'grab';
    }

    let interactionCommitted = false;

    if (interaction?.mode === 'move-annotation' && dropTargetImageId) {
      const canvasAnnosToReparent = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);
      if (canvasAnnosToReparent.length > 0) {
          onReparentCanvasAnnotationsToImage(canvasAnnosToReparent, dropTargetImageId);
          interactionCommitted = true;
      }
      
      const imageAnnosToReparent = selectedAnnotations.filter((s): s is { imageId: string, annotationId: string } => s.imageId !== null && s.imageId !== dropTargetImageId);
      if (imageAnnosToReparent.length > 0) {
          reparentImageAnnotationsToImage(imageAnnosToReparent, dropTargetImageId);
          interactionCommitted = true;
      }
    }

    if (interaction?.mode === 'marquee-select' && marqueeRect) {
        if (marqueeRect.width > 5 || marqueeRect.height > 5) {
            const selectedIds = images.filter(img => {
                 const imgRect = {
                    x: img.x,
                    y: img.y,
                    width: img.width * img.scale,
                    height: img.height * img.scale
                 };
                 return marqueeRect.x < imgRect.x + imgRect.width &&
                        marqueeRect.x + marqueeRect.width > imgRect.x &&
                        marqueeRect.y < imgRect.y + imgRect.height &&
                        marqueeRect.y + marqueeRect.height > imgRect.y;
            }).map(img => img.id);
            onSelectImages(selectedIds, e.shiftKey || e.metaKey || e.ctrlKey);
        } else {
            if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
                onSelectImages([], false);
            }
        }
        setMarqueeRect(null);
    }
    
    if (interaction?.mode === 'annotating' && drawingAnnotation.annotation) {
        const finalAnnotation = { ...drawingAnnotation.annotation };
        if (finalAnnotation.type === 'rect') {
            if (finalAnnotation.width < 0) {
                finalAnnotation.x += finalAnnotation.width;
                finalAnnotation.width = Math.abs(finalAnnotation.width);
            }
            if (finalAnnotation.height < 0) {
                finalAnnotation.y += finalAnnotation.height;
                finalAnnotation.height = Math.abs(finalAnnotation.height);
            }
        }
        if (finalAnnotation.type === 'freehand' && finalAnnotation.points.length < 2) {
        } else {
           if (drawingAnnotation.imageId) {
             addAnnotation(drawingAnnotation.imageId, finalAnnotation);
           } else {
             addCanvasAnnotation(finalAnnotation);
           }
        }
        setDrawingAnnotation({ annotation: null, imageId: null });
    }

    if (interaction?.mode === 'resize-crop' && cropArea) {
      const normalizedCrop = { ...cropArea };
      if (normalizedCrop.width < 0) {
          normalizedCrop.x += normalizedCrop.width;
          normalizedCrop.width *= -1;
      }
      if (normalizedCrop.height < 0) {
          normalizedCrop.y += normalizedCrop.height;
          normalizedCrop.height *= -1;
      }
      setCropArea(normalizedCrop);
    }
    
    if (interaction && ['move', 'move-annotation', 'resize-arrow-start', 'resize-arrow-end', 'scale-annotation', 'rotate-annotation'].includes(interaction.mode)) {
        if (!interactionCommitted) {
          onInteractionEnd();
        }
    }

    setInteraction(null);
    setDropTargetImageId(null);
  }, [interaction, addAnnotation, drawingAnnotation, marqueeRect, images, onSelectImages, cropArea, setCropArea, onInteractionEnd, setDrawingAnnotation, setMarqueeRect, addCanvasAnnotation, dropTargetImageId, onReparentCanvasAnnotationsToImage, reparentImageAnnotationsToImage, selectedAnnotations]);

  useEffect(() => {
    if (interaction) {
        window.addEventListener('mousemove', handleInteractionMove);
        window.addEventListener('mouseup', handleInteractionEnd);
        return () => {
            window.removeEventListener('mousemove', handleInteractionMove);
            window.removeEventListener('mouseup', handleInteractionEnd);
        };
    }
  }, [interaction, handleInteractionMove, handleInteractionEnd]);
  
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (interaction) return; // Dragging is handled by global listeners

    const canvas = internalCanvasRef.current;
    if (!canvas) return;
    const canvasPoint = getCanvasPoint({ x: e.clientX, y: e.clientY });

    let newCursor = isSpacebarPressed ? 'grab' : 'default';
      
    if (activeTool === 'eyedropper') {
      newCursor = 'crosshair';
    } else if (!isSpacebarPressed) {
        if (cropArea) {
            const handles = getCropHandles(cropArea, viewTransform.scale);
            let handleHovered = false;
            for (const handle of handles) {
                if (isPointInRect(canvasPoint, handle.rect)) {
                    newCursor = handle.cursor;
                    handleHovered = true;
                    break;
                }
            }
            if (!handleHovered && isPointInRect(canvasPoint, cropArea)) {
                newCursor = 'move';
            }
        }
        if (activeTool !== 'select' && newCursor === 'default') {
            newCursor = 'crosshair';
        }
        if (activeTool === 'select' && newCursor === 'default') {
          const hoveredImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img) !== null);
          if (hoveredImage) newCursor = 'move';
          
          const hoveredAnnotation = findAnnotationAtPoint(canvasPoint);
          if(hoveredAnnotation) newCursor = 'move';
        }
    }
    canvas.style.cursor = newCursor;
  }, [interaction, getCanvasPoint, isSpacebarPressed, cropArea, viewTransform.scale, activeTool, images, getLocalPoint, findAnnotationAtPoint]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const dropPoint = getCanvasPoint({x: e.clientX, y: e.clientY});
    
    const newImages: CanvasImage[] = [];
    for (const file of Array.from(files)) {
        if (file instanceof File && file.type.startsWith('image/')) {
            const newImage = await readImageFile(file);
            newImage.x = dropPoint.x - (newImage.width * newImage.scale / 2);
            newImage.y = dropPoint.y - (newImage.height * newImage.scale / 2);
            newImages.push(newImage);
        }
    }
    setImages(prev => [...prev, ...newImages]);
  }, [getCanvasPoint, setImages]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <canvas
        ref={internalCanvasRef}
        className="absolute top-0 left-0 w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />
    </>
  );
});