

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import { CanvasImage, Rect, Point, AspectRatio, AnnotationTool, Annotation, FreehandAnnotation, RectAnnotation, CircleAnnotation, TextAnnotation, ArrowAnnotation, LineAnnotation, Group } from '../types';
import { readImageFile } from '../utils/fileUtils';
import { drawCanvas, getAnnotationBounds, getAnnotationPrimitiveBounds, getMultiAnnotationBounds, transformLocalToGlobal, rectIntersect, getCropHandles, CropHandle } from '../utils/canvasUtils';
import { rgbToHex } from '../utils/colorUtils';

type AnnotationSelection = { imageId: string | null; annotationId: string; };

interface CanvasWrapperProps {
  images: CanvasImage[];
  groups: Group[];
  setImages: (updater: (prevImages: CanvasImage[]) => CanvasImage[]) => void;
  onInteractionEnd: () => void;
  selectedImageIds: string[];
  setSelectedImageId: (id: string | null, options: { shiftKey: boolean, ctrlKey: boolean }) => void;
  onSelectImages: (ids: string[], keepExisting: boolean) => void;
  onBoxSelect: (imageIds: string[], annotationSelections: AnnotationSelection[], keepExisting: boolean) => void;
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
  updateMultipleAnnotationsForInteraction: (updates: Array<{ selection: AnnotationSelection; changes: Partial<Annotation> }>) => void;
  selectedAnnotationObjects: Annotation[];
  onColorPicked: (color: string) => void;
  canvasAnnotations: Annotation[];
  addCanvasAnnotation: (annotation: Annotation) => void;
  onMoveSelectedAnnotations: (delta: Point) => void;
  onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
  reparentImageAnnotationsToImage: (annotations: Array<{ annotationId: string; imageId: string }>, newImageId: string) => void;
  onMoveSelectedImages: (delta: Point) => void;
  lastCanvasMousePosition: React.MutableRefObject<Point>;
  onReparentImageAnnotationsToCanvas: (selections: Array<{ annotationId: string; imageId: string }>) => void;
  selectedLayerId: string | null;
}

type InteractionMode = 'pan' | 'move' | 'crop' | 'resize-crop' | 'annotating' | 'move-crop' | 'move-annotation' | 'marquee-select' | 'scale-annotation' | 'rotate-annotation' | 'resize-arrow-start' | 'resize-arrow-end' | 'scale-multi-annotation' | 'rotate-multi-annotation';

type InteractionState =
  | { mode: 'pan'; startPoint: Point }
  | { mode: 'move'; startPoint: Point }
  | { mode: 'crop'; startPoint: Point }
  | { mode: 'resize-crop'; handle: CropHandle; startPoint: Point; initialCropArea: Rect }
  | { mode: 'annotating'; startPoint: Point; shiftKey: boolean }
  | { mode: 'move-crop'; startPoint: Point; initialCropArea: Rect }
  | { mode: 'move-annotation'; startPoint: Point }
  | { mode: 'marquee-select'; startPoint: Point; shiftKey: boolean }
  | { mode: 'scale-annotation'; startPoint: Point; center: Point; annotationId: string; imageId: string | null; startScale: number; startDist: number; }
  | { mode: 'rotate-annotation'; startPoint: Point; center: Point; annotationId: string; imageId: string | null; startRotation: number; startAngle: number; }
  | { mode: 'resize-arrow-start'; startPoint: Point; annotationId: string; imageId: string | null; }
  | { mode: 'resize-arrow-end'; startPoint: Point; annotationId: string; imageId: string | null; }
  | { mode: 'scale-multi-annotation'; startPoint: Point; center: Point; initialAnnotations: Annotation[]; initialSelections: AnnotationSelection[]; startDist: number; }
  | { mode: 'rotate-multi-annotation'; startPoint: Point; center: Point; initialAnnotations: Annotation[]; initialSelections: AnnotationSelection[]; startAngle: number; };

const isPointInRect = (point: Point, rect: Rect) => {
    const rx = rect.width < 0 ? rect.x + rect.width : rect.x;
    const ry = rect.height < 0 ? rect.y + rect.height : rect.y;
    const rw = Math.abs(rect.width);
    const rh = Math.abs(rect.height);
    return point.x >= rx && point.x <= rx + rw &&
           point.y >= ry && point.y <= ry + rh;
};

export const CanvasWrapper = forwardRef<HTMLCanvasElement, CanvasWrapperProps>(({
  images,
  groups,
  setImages,
  onInteractionEnd,
  selectedImageIds,
  setSelectedImageId,
  onSelectImages,
  onBoxSelect,
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
  onMoveSelectedAnnotations,
  onReparentCanvasAnnotationsToImage,
  reparentImageAnnotationsToImage,
  onMoveSelectedImages,
  deleteSelectedAnnotations,
  lastCanvasMousePosition,
  onReparentImageAnnotationsToCanvas,
  updateMultipleAnnotationsForInteraction,
  selectedAnnotationObjects,
  selectedLayerId,
}, ref) => {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => internalCanvasRef.current!);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

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

  // Add Resize Observer to handle canvas sizing properly
  useEffect(() => {
      const updateSize = () => {
          if (internalCanvasRef.current?.parentElement) {
              const { clientWidth, clientHeight } = internalCanvasRef.current.parentElement;
              setCanvasSize({ width: clientWidth, height: clientHeight });
          }
      };
      window.addEventListener('resize', updateSize);
      updateSize();

      const resizeObserver = new ResizeObserver(() => {
          updateSize();
      });
      if (internalCanvasRef.current?.parentElement) {
          resizeObserver.observe(internalCanvasRef.current.parentElement);
      }

      return () => {
          window.removeEventListener('resize', updateSize);
          resizeObserver.disconnect();
      };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditingText = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;

      if (isEditingText) return;

      if (e.key.toLowerCase() === 'c' && !e.repeat && activeTool !== 'crop') setIsCropKeyPressed(true);
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
  }, [activeTool]);

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

    const getAnnotationLocalPoint = useCallback((canvasPoint: Point, annotation: Annotation, image: CanvasImage | null, ctx: CanvasRenderingContext2D): Point => {
        const annoPrimitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
        
        let center = { x: 0, y: 0 };
        if (annotation.type === 'arrow' || annotation.type === 'line') {
             center = { x: (annotation.start.x + annotation.end.x) / 2, y: (annotation.start.y + annotation.end.y) / 2 };
        } else if (annotation.type === 'text') {
             center = { x: annoPrimitiveBounds.x + annoPrimitiveBounds.width / 2, y: annoPrimitiveBounds.y + annoPrimitiveBounds.height / 2 };
        } else if (annotation.type === 'rect') {
             center = { x: annotation.x + annotation.width / 2, y: annotation.y + annotation.height / 2 };
        } else if (annotation.type === 'circle') {
             center = { x: annotation.x, y: annotation.y };
        } else if (annotation.type === 'freehand') {
             center = { x: annoPrimitiveBounds.x + annoPrimitiveBounds.width / 2, y: annoPrimitiveBounds.y + annoPrimitiveBounds.height / 2 };
        }

        let parentSpacePoint: Point;
        if (image) {
            parentSpacePoint = getUnboundedLocalPoint(canvasPoint, image);
        } else {
            parentSpacePoint = canvasPoint;
        }

        let p = { x: parentSpacePoint.x - center.x, y: parentSpacePoint.y - center.y };
        
        const rad = -annotation.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
        if (annotation.scale !== 0) {
            p = { x: p.x / annotation.scale, y: p.y / annotation.scale };
        }
        
        return { x: p.x + center.x, y: p.y + center.y };
    }, [getUnboundedLocalPoint]);

  const findAnnotationAtPoint = useCallback((canvasPoint: Point): { imageId: string | null, annotationId: string } | null => {
    const ctx = contextRef.current;
    if (!ctx) return null;

    const checkAnnotation = (annotation: Annotation, parentPoint: Point, imageScale: number = 1): boolean => {
         const annoPrimitiveBounds = getAnnotationPrimitiveBounds(annotation, ctx);
         let center = { x: 0, y: 0 };
         
         if (annotation.type === 'arrow' || annotation.type === 'line') {
             center = { x: (annotation.start.x + annotation.end.x) / 2, y: (annotation.start.y + annotation.end.y) / 2 };
         } else if (annotation.type === 'text') {
             center = { x: annoPrimitiveBounds.x + annoPrimitiveBounds.width / 2, y: annoPrimitiveBounds.y + annoPrimitiveBounds.height / 2 };
         } else if (annotation.type === 'rect') {
             center = { x: annotation.x + annotation.width / 2, y: annotation.y + annotation.height / 2 };
         } else if (annotation.type === 'circle') {
             center = { x: annotation.x, y: annotation.y };
         } else if (annotation.type === 'freehand') {
             center = { x: annoPrimitiveBounds.x + annoPrimitiveBounds.width / 2, y: annoPrimitiveBounds.y + annoPrimitiveBounds.height / 2 };
         }

         // Transform point to annotation local space (undoing rotation/scale)
         let p = { x: parentPoint.x - center.x, y: parentPoint.y - center.y };
         const rad = -annotation.rotation * Math.PI / 180;
         const cos = Math.cos(rad);
         const sin = Math.sin(rad);
         p = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
         if (annotation.scale !== 0) {
             p = { x: p.x / annotation.scale, y: p.y / annotation.scale };
         }
         const localPointInAnnotation = { x: p.x + center.x, y: p.y + center.y };

         if (annotation.type === 'line' || annotation.type === 'arrow' || annotation.type === 'freehand') {
            const points = annotation.type === 'freehand' ? annotation.points : [annotation.start, annotation.end];
            if (points.length < 2) return false;

            const clickThreshold = (annotation.strokeWidth / 2) + (5 / (imageScale * viewTransform.scale * annotation.scale));

            for (let i = 0; i < points.length - 1; i++) {
                const start = points[i];
                const end = points[i + 1];

                const l2 = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
                if (l2 === 0) continue;

                let t = ((localPointInAnnotation.x - start.x) * (end.x - start.x) + (localPointInAnnotation.y - start.y) * (end.y - start.y)) / l2;
                t = Math.max(0, Math.min(1, t));

                const closestPointOnSegment = {
                    x: start.x + t * (end.x - start.x),
                    y: start.y + t * (end.y - start.y),
                };
                const distance = Math.hypot(localPointInAnnotation.x - closestPointOnSegment.x, localPointInAnnotation.y - closestPointOnSegment.y);
                if (distance < clickThreshold) return true;
            }
            return false;
         } else {
            const normalizedBounds = { ...annoPrimitiveBounds };
            if (normalizedBounds.width < 0) { normalizedBounds.x += normalizedBounds.width; normalizedBounds.width *= -1; }
            if (normalizedBounds.height < 0) { normalizedBounds.y += normalizedBounds.height; normalizedBounds.height *= -1; }
            
            return isPointInRect(localPointInAnnotation, normalizedBounds);
         }
    };

    for (const image of [...images].reverse()) {
        const localPointInImage = getUnboundedLocalPoint(canvasPoint, image);
        for (const annotation of [...image.annotations].reverse()) {
            if (checkAnnotation(annotation, localPointInImage, image.scale)) {
                return { imageId: image.id, annotationId: annotation.id };
            }
        }
    }

    for (const annotation of [...canvasAnnotations].reverse()) {
        if (checkAnnotation(annotation, canvasPoint, 1)) {
             return { imageId: null, annotationId: annotation.id };
        }
    }
    return null;
  }, [images, getUnboundedLocalPoint, viewTransform.scale, canvasAnnotations]);
  

  useLayoutEffect(() => {
    const canvas = internalCanvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    drawCanvas(ctx, canvas, images, selectedImageIds, cropArea, viewTransform, drawingAnnotation, selectedAnnotations, marqueeRect, groups, canvasAnnotations, dropTargetImageId, selectedLayerId);
  }, [images, selectedImageIds, cropArea, viewTransform, drawingAnnotation, selectedAnnotations, marqueeRect, groups, canvasAnnotations, dropTargetImageId, selectedLayerId, canvasSize]);

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
        if (!isCropKeyPressed && activeTool !== 'crop') {
            setCropArea(null);
        }
    }

    if (isCropKeyPressed || activeTool === 'crop') {
        setInteraction({ mode: 'crop', startPoint: canvasPoint });
        setCropArea({ x: canvasPoint.x, y: canvasPoint.y, width: 0, height: 0 });
        return;
    }
    
    if (activeTool === 'select') {
      if (selectedAnnotations.length > 1) {
          const multiBounds = getMultiAnnotationBounds(selectedAnnotations, images, canvasAnnotations, ctx);
          if (multiBounds) {
              const center = { x: multiBounds.x + multiBounds.width / 2, y: multiBounds.y + multiBounds.height / 2 };
              const handleSize = 8 / viewTransform.scale;
              const clickRadius = handleSize * 1.5;

              // Check rotation handle
              const rotationHandleOffset = 20 / viewTransform.scale;
              const rotationHandlePos = { x: multiBounds.x + multiBounds.width / 2, y: multiBounds.y - rotationHandleOffset };
              if (Math.hypot(canvasPoint.x - rotationHandlePos.x, canvasPoint.y - rotationHandlePos.y) < clickRadius) {
                  const startAngle = Math.atan2(canvasPoint.y - center.y, canvasPoint.x - center.x);
                  setInteraction({ 
                      mode: 'rotate-multi-annotation', 
                      startPoint: canvasPoint, 
                      center,
                      initialAnnotations: JSON.parse(JSON.stringify(selectedAnnotationObjects)),
                      initialSelections: selectedAnnotations,
                      startAngle
                  });
                  return;
              }

              // Check scale handle
              const scaleHandlePos = { x: multiBounds.x + multiBounds.width, y: multiBounds.y + multiBounds.height };
              if (Math.hypot(canvasPoint.x - scaleHandlePos.x, canvasPoint.y - scaleHandlePos.y) < clickRadius) {
                  const startDist = Math.hypot(canvasPoint.x - center.x, canvasPoint.y - center.y);
                  setInteraction({
                      mode: 'scale-multi-annotation',
                      startPoint: canvasPoint,
                      center,
                      initialAnnotations: JSON.parse(JSON.stringify(selectedAnnotationObjects)),
                      initialSelections: selectedAnnotations,
                      startDist
                  });
                  return;
              }
          }
      }
      if (selectedAnnotations.length === 1) {
          const selection = selectedAnnotations[0];
          const image = selection.imageId ? images.find(img => img.id === selection.imageId) : null;
          const annotation = image 
              ? image.annotations.find(anno => anno.id === selection.annotationId)
              : canvasAnnotations.find(anno => anno.id === selection.annotationId);
          
          if (annotation) {
              const localPointForAnnotation = getAnnotationLocalPoint(canvasPoint, annotation, image, ctx);
              const baseScale = image ? image.scale : 1;
              const handleSize = 8 / (viewTransform.scale * baseScale);
              const clickRadius = handleSize / annotation.scale * 1.5;
      
              if (annotation.type === 'arrow' || annotation.type === 'line') {
                  if (Math.hypot(localPointForAnnotation.x - annotation.start.x, localPointForAnnotation.y - annotation.start.y) < clickRadius) {
                       setInteraction({ mode: 'resize-arrow-start', startPoint: canvasPoint, annotationId: annotation.id, imageId: image?.id ?? null });
                       return;
                  }
                  if (Math.hypot(localPointForAnnotation.x - annotation.end.x, localPointForAnnotation.y - annotation.end.y) < clickRadius) {
                       setInteraction({ mode: 'resize-arrow-end', startPoint: canvasPoint, annotationId: annotation.id, imageId: image?.id ?? null });
                       return;
                  }
              } 
              
              const bounds = getAnnotationPrimitiveBounds(annotation, ctx);
              let center = { x: 0, y: 0 };
              if (annotation.type === 'arrow' || annotation.type === 'line') {
                  center = { x: (annotation.start.x + annotation.end.x) / 2, y: (annotation.start.y + annotation.end.y) / 2 };
              } else if (annotation.type === 'text') {
                  center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
              } else if (annotation.type === 'rect') {
                  center = { x: annotation.x + annotation.width / 2, y: annotation.y + annotation.height / 2 };
              } else if (annotation.type === 'circle') {
                  center = { x: annotation.x, y: annotation.y };
              } else if (annotation.type === 'freehand') {
                  center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
              }
              
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
            setSelectedImageId(targetImage.id, { shiftKey: false, ctrlKey: false });
        }
        setDrawingAnnotation({ annotation: newAnnotation, imageId: targetImage?.id ?? null });
      }
      return;
    }

    if (activeTool === 'select') {
      const clickedAnnotation = findAnnotationAtPoint(canvasPoint);
      if (clickedAnnotation) {
          const isMultiSelect = e.shiftKey;
          
          if (!isMultiSelect) {
              setSelectedImageId(null, { shiftKey: false, ctrlKey: false });
          }

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
          setSelectedImageId(clickedImage.id, { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey });
        }
        setInteraction({ mode: 'move', startPoint: canvasPoint });
      } else {
        setInteraction({ mode: 'marquee-select', startPoint: canvasPoint, shiftKey: e.shiftKey });
        setMarqueeRect({ x: canvasPoint.x, y: canvasPoint.y, width: 0, height: 0 });
      }
    }
  }, [getCanvasPoint, images, setSelectedImageId, cropArea, viewTransform.scale, activeTool, toolOptions, getLocalPoint, getUnboundedLocalPoint, addAnnotation, isCropKeyPressed, setCropArea, findAnnotationAtPoint, setSelectedAnnotations, isSpacebarPressed, onSelectImages, selectedImageIds, setActiveTool, onColorPicked, addCanvasAnnotation, selectedAnnotations, getAnnotationLocalPoint, canvasAnnotations, selectedAnnotationObjects]);

  const handleCanvasMouseMove = useCallback((e: MouseEvent) => {
      if (!interaction) return;
      const currentPoint = { x: e.clientX, y: e.clientY };
      const canvasPoint = getCanvasPoint(currentPoint);
      const deltaX = (currentPoint.x - lastMousePosition.current.x) / viewTransform.scale;
      const deltaY = (currentPoint.y - lastMousePosition.current.y) / viewTransform.scale;
      lastMousePosition.current = currentPoint;
      lastCanvasMousePosition.current = canvasPoint;

      if (interaction.mode === 'pan') {
          setViewTransform(prev => ({ ...prev, offset: { x: prev.offset.x + (currentPoint.x - interaction.startPoint.x), y: prev.offset.y + (currentPoint.y - interaction.startPoint.y) } }));
          setInteraction(prev => prev && prev.mode === 'pan' ? { ...prev, startPoint: currentPoint } : prev);
      } else if (interaction.mode === 'move') {
           onMoveSelectedImages({ x: deltaX, y: deltaY });
      } else if (interaction.mode === 'move-annotation') {
            onMoveSelectedAnnotations({ x: deltaX, y: deltaY });

            const topmostImage = [...images].reverse().find(img => getLocalPoint(canvasPoint, img) !== null);
            const sourceImageIds = new Set(selectedAnnotations.map(s => s.imageId));

            if (topmostImage) {
                if (!sourceImageIds.has(topmostImage.id) || (sourceImageIds.size > 1 && Array.from(sourceImageIds).some(id => id !== topmostImage.id))) {
                    setDropTargetImageId(topmostImage.id);
                } else {
                    setDropTargetImageId(null);
                }
            } else {
                setDropTargetImageId(null);
            }
      } else if (interaction.mode === 'annotating') {
          if (drawingAnnotation.annotation) {
               const newAnno = { ...drawingAnnotation.annotation };
               
               const parentImage = drawingAnnotation.imageId ? images.find(i => i.id === drawingAnnotation.imageId) : null;
               const currentPointInParent = parentImage ? getUnboundedLocalPoint(canvasPoint, parentImage) : canvasPoint;

               if (newAnno.type === 'freehand') {
                   newAnno.points = [...newAnno.points, currentPointInParent];
               } else if (newAnno.type === 'rect') {
                   const w = currentPointInParent.x - interaction.startPoint.x;
                   const h = currentPointInParent.y - interaction.startPoint.y;
                   if (interaction.shiftKey) {
                       const s = Math.max(Math.abs(w), Math.abs(h));
                       newAnno.width = w < 0 ? -s : s;
                       newAnno.height = h < 0 ? -s : s;
                   } else {
                       newAnno.width = w;
                       newAnno.height = h;
                   }
               } else if (newAnno.type === 'circle') {
                   const r = Math.hypot(currentPointInParent.x - interaction.startPoint.x, currentPointInParent.y - interaction.startPoint.y);
                   newAnno.radius = r;
               } else if (newAnno.type === 'arrow' || newAnno.type === 'line') {
                   if (interaction.shiftKey) {
                        const dx = currentPointInParent.x - interaction.startPoint.x;
                        const dy = currentPointInParent.y - interaction.startPoint.y;
                        const angle = Math.atan2(dy, dx);
                        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                        const dist = Math.hypot(dx, dy);
                        newAnno.end = {
                            x: interaction.startPoint.x + dist * Math.cos(snapAngle),
                            y: interaction.startPoint.y + dist * Math.sin(snapAngle)
                        };
                   } else {
                       newAnno.end = currentPointInParent;
                   }
               }
               setDrawingAnnotation(prev => ({ ...prev, annotation: newAnno }));
          }
      } else if (interaction.mode === 'crop') {
          const w = canvasPoint.x - interaction.startPoint.x;
          const h = canvasPoint.y - interaction.startPoint.y;
          let finalW = w, finalH = h;

          if (aspectRatio !== 'free') {
              const [rw, rh] = aspectRatio === '1:1' ? [1,1] : aspectRatio === '4:3' ? [4,3] : [16,9];
              const ratio = rw / rh;
              if (Math.abs(w / h) > ratio) {
                  finalW = h * ratio * (w < 0 ? -1 : 1) * (h < 0 ? -1 : 1);
              } else {
                  finalH = w / ratio * (w < 0 ? -1 : 1) * (h < 0 ? -1 : 1);
              }
              if (w < 0) finalW = -Math.abs(finalW);
              if (h < 0) finalH = -Math.abs(finalH);
          }
          
          setCropArea({
              x: interaction.startPoint.x,
              y: interaction.startPoint.y,
              width: finalW,
              height: finalH,
          });
      } else if (interaction.mode === 'move-crop') {
          const dx = canvasPoint.x - interaction.startPoint.x;
          const dy = canvasPoint.y - interaction.startPoint.y;
          setCropArea({
              ...interaction.initialCropArea,
              x: interaction.initialCropArea.x + dx,
              y: interaction.initialCropArea.y + dy,
          });
      } else if (interaction.mode === 'resize-crop') {
           const dx = canvasPoint.x - interaction.startPoint.x;
           const dy = canvasPoint.y - interaction.startPoint.y;
           let { x, y, width, height } = interaction.initialCropArea;
           
           switch (interaction.handle) {
               case 'right': width += dx; break;
               case 'bottom': height += dy; break;
               case 'left': x += dx; width -= dx; break;
               case 'top': y += dy; height -= dy; break;
               case 'bottom-right': width += dx; height += dy; break;
               case 'bottom-left': x += dx; width -= dx; height += dy; break;
               case 'top-right': y += dy; width += dx; height -= dy; break;
               case 'top-left': x += dx; y += dy; width -= dx; height -= dy; break;
           }
           
           if (aspectRatio !== 'free') {
                const [rw, rh] = aspectRatio === '1:1' ? [1,1] : aspectRatio === '4:3' ? [4,3] : [16,9];
                const ratio = rw / rh;
                if (['top', 'bottom'].includes(interaction.handle)) width = height * ratio;
                else height = width / ratio;
           }

           setCropArea({ x, y, width, height });
      } else if (interaction.mode === 'marquee-select') {
           const w = canvasPoint.x - interaction.startPoint.x;
           const h = canvasPoint.y - interaction.startPoint.y;
           setMarqueeRect({ x: interaction.startPoint.x, y: interaction.startPoint.y, width: w, height: h });
      } else if (interaction.mode === 'scale-annotation') {
          const parentPoint = interaction.imageId 
            ? getUnboundedLocalPoint(canvasPoint, images.find(i => i.id === interaction.imageId)!) 
            : canvasPoint;
          const currentDist = Math.hypot(parentPoint.x - interaction.center.x, parentPoint.y - interaction.center.y);
          const scaleFactor = currentDist / interaction.startDist;
          updateAnnotation({ scale: interaction.startScale * scaleFactor });
      } else if (interaction.mode === 'rotate-annotation') {
          const parentPoint = interaction.imageId 
            ? getUnboundedLocalPoint(canvasPoint, images.find(i => i.id === interaction.imageId)!) 
            : canvasPoint;
          const currentAngle = Math.atan2(parentPoint.y - interaction.center.y, parentPoint.x - interaction.center.y);
          const deltaAngle = (currentAngle - interaction.startAngle) * 180 / Math.PI;
          updateAnnotation({ rotation: interaction.startRotation + deltaAngle });
      } else if (interaction.mode === 'resize-arrow-start' || interaction.mode === 'resize-arrow-end') {
           const parentPoint = interaction.imageId 
            ? getUnboundedLocalPoint(canvasPoint, images.find(i => i.id === interaction.imageId)!) 
            : canvasPoint;
           if (interaction.mode === 'resize-arrow-start') {
               updateAnnotation({ start: parentPoint });
           } else {
               updateAnnotation({ end: parentPoint });
           }
      } else if (interaction.mode === 'scale-multi-annotation') {
          const currentDist = Math.hypot(canvasPoint.x - interaction.center.x, canvasPoint.y - interaction.center.y);
          const scaleRatio = currentDist / interaction.startDist;
          
          const updates: Array<{ selection: AnnotationSelection; changes: Partial<Annotation> }> = [];
          interaction.initialAnnotations.forEach((initialAnno, i) => {
               updates.push({ selection: interaction.initialSelections[i], changes: { scale: initialAnno.scale * scaleRatio } });
          });
          updateMultipleAnnotationsForInteraction(updates);
      } else if (interaction.mode === 'rotate-multi-annotation') {
          const currentAngle = Math.atan2(canvasPoint.y - interaction.center.y, canvasPoint.x - interaction.center.x);
          const deltaAngle = (currentAngle - interaction.startAngle) * 180 / Math.PI;
          
          const updates: Array<{ selection: AnnotationSelection; changes: Partial<Annotation> }> = [];
          interaction.initialAnnotations.forEach((initialAnno, i) => {
               updates.push({ selection: interaction.initialSelections[i], changes: { rotation: initialAnno.rotation + deltaAngle } });
          });
          updateMultipleAnnotationsForInteraction(updates);
      } else {
        if (dropTargetImageId) setDropTargetImageId(null);
      }

  }, [interaction, getCanvasPoint, viewTransform.scale, onMoveSelectedImages, onMoveSelectedAnnotations, drawingAnnotation.annotation, aspectRatio, getUnboundedLocalPoint, images, updateAnnotation, updateMultipleAnnotationsForInteraction, lastMousePosition, dropTargetImageId, selectedAnnotations, getLocalPoint, drawingAnnotation.imageId]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!interaction) {
        internalCanvasRef.current!.style.cursor = '';
        return;
    }

    let historyPushed = false;

    if (interaction.mode === 'move-annotation') {
        const currentPoint = lastCanvasMousePosition.current;
        const imageUnderCursor = [...images].reverse().find(img => getLocalPoint(currentPoint, img) !== null);

        if (imageUnderCursor && dropTargetImageId === imageUnderCursor.id) {
            const targetId = imageUnderCursor.id;
            const fromCanvas = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);
            const fromOtherImages = selectedAnnotations.filter(s => s.imageId !== null && s.imageId !== targetId) as { annotationId: string, imageId: string }[];
            
            if (fromCanvas.length > 0) {
                onReparentCanvasAnnotationsToImage(fromCanvas, targetId);
                historyPushed = true;
            }
            if (fromOtherImages.length > 0) {
                reparentImageAnnotationsToImage(fromOtherImages, targetId);
                historyPushed = true;
            }
        } else if (!imageUnderCursor) {
            const fromImages = selectedAnnotations.filter(s => s.imageId !== null) as { annotationId: string, imageId: string }[];
            if (fromImages.length > 0) {
                onReparentImageAnnotationsToCanvas(fromImages);
                historyPushed = true;
            }
        }
    } else if (interaction.mode === 'annotating' && drawingAnnotation.annotation) {
        const finalAnnotation = { ...drawingAnnotation.annotation };
        if (finalAnnotation.type === 'rect') {
            if (finalAnnotation.width < 0) { finalAnnotation.x += finalAnnotation.width; finalAnnotation.width *= -1; }
            if (finalAnnotation.height < 0) { finalAnnotation.y += finalAnnotation.height; finalAnnotation.height *= -1; }
        }
        if (drawingAnnotation.imageId) {
            addAnnotation(drawingAnnotation.imageId, finalAnnotation);
            setSelectedAnnotations(() => [{ imageId: drawingAnnotation.imageId, annotationId: finalAnnotation.id }]);
        } else {
            addCanvasAnnotation(finalAnnotation);
            setSelectedAnnotations(() => [{ imageId: null, annotationId: finalAnnotation.id }]);
        }
        setActiveTool('select');
        historyPushed = true; // addAnnotation/Canvas pushes history
    } else if (interaction.mode === 'marquee-select' && marqueeRect) {
        const { x, y, width, height } = marqueeRect;
        const rx = width < 0 ? x + width : x;
        const ry = height < 0 ? y + height : y;
        const rw = Math.abs(width);
        const rh = Math.abs(height);
        const selectionRect = { x: rx, y: ry, width: rw, height: rh };
        const selectedImages = images.filter(img => rectIntersect(selectionRect, { x: img.x, y: img.y, width: img.width * img.scale, height: img.height * img.scale })).map(img => img.id);
        const selectedAnnos: AnnotationSelection[] = [];
        canvasAnnotations.forEach(anno => {
            if (rectIntersect(selectionRect, getAnnotationPrimitiveBounds(anno, contextRef.current!))) {
                selectedAnnos.push({ imageId: null, annotationId: anno.id });
            }
        });
        onBoxSelect(selectedImages, selectedAnnos, interaction.shiftKey);
    }

    if (!historyPushed) {
        onInteractionEnd();
    }
    
    setDrawingAnnotation({ annotation: null, imageId: null });
    setMarqueeRect(null);
    setDropTargetImageId(null);
    setInteraction(null);
    internalCanvasRef.current!.style.cursor = '';
}, [interaction, drawingAnnotation, lastCanvasMousePosition, images, getLocalPoint, dropTargetImageId, selectedAnnotations, onReparentCanvasAnnotationsToImage, reparentImageAnnotationsToImage, onReparentImageAnnotationsToCanvas, onInteractionEnd, addAnnotation, setSelectedAnnotations, addCanvasAnnotation, activeTool, setActiveTool, marqueeRect, canvasAnnotations, onBoxSelect]);

  useEffect(() => {
      window.addEventListener('mousemove', handleCanvasMouseMove);
      window.addEventListener('mouseup', handleCanvasMouseUp);
      return () => {
          window.removeEventListener('mousemove', handleCanvasMouseMove);
          window.removeEventListener('mouseup', handleCanvasMouseUp);
      };
  }, [handleCanvasMouseMove, handleCanvasMouseUp]);

  return (
    <canvas
      ref={internalCanvasRef}
      className={`block w-full h-full touch-none select-none outline-none ${interaction?.mode === 'pan' || isSpacebarPressed ? 'cursor-grabbing' : activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
    />
  );
});