



import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { CanvasWrapper } from './components/CanvasWrapper';
import { FloatingAnnotationEditor } from './components/FloatingAnnotationEditor';
import { CanvasImage, Rect, AspectRatio, Annotation, AnnotationTool, Point, TextAnnotation, Group } from './types';
import { readImageFile, downloadDataUrl, createImageElementFromDataUrl } from './utils/fileUtils';
import { drawAnnotation, getAnnotationBounds, transformGlobalToLocal, transformLocalToGlobal, getImagesBounds } from './utils/canvasUtils';

const hexToRgba = (hex: string, opacity: number): string => {
    if (!hex) hex = '#000000';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const trimCanvas = (canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; bounds: Rect | null } => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { canvas, bounds: null };

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    const emptyCanvas = document.createElement('canvas');
    emptyCanvas.width = 1;
    emptyCanvas.height = 1;
    return { canvas: emptyCanvas, bounds: null };
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  if (!trimmedCtx) return { canvas, bounds: null };

  trimmedCtx.drawImage(
    canvas,
    minX, minY, trimmedWidth, trimmedHeight,
    0, 0, trimmedWidth, trimmedHeight
  );

  return { canvas: trimmedCanvas, bounds: { x: minX, y: minY, width: trimmedWidth, height: trimmedHeight } };
};

const arrangeImagesInGrid = (
    images: CanvasImage[], 
    direction: 'horizontal' | 'vertical',
    startX: number,
    startY: number
): { [id: string]: { x: number; y: number } } => {
    if (images.length === 0) return {};

    const SPACING = 10;
    const newPositions: { [id: string]: { x: number; y: number } } = {};
    const n = images.length;
    
    let currentX = startX;
    let currentY = startY;

    if (direction === 'horizontal') {
        const cols = Math.ceil(Math.sqrt(n));
        let rowMaxHeight = 0;

        for (let i = 0; i < n; i++) {
            const image = images[i];
            const colIndex = i % cols;

            if (i > 0 && colIndex === 0) { // New row
                currentY += rowMaxHeight + SPACING;
                currentX = startX;
                rowMaxHeight = 0;
            }
            
            newPositions[image.id] = { x: currentX, y: currentY };
            
            currentX += image.width * image.scale + SPACING;
            rowMaxHeight = Math.max(rowMaxHeight, image.height * image.scale);
        }
    } else { // vertical
        const rows = Math.ceil(Math.sqrt(n));
        let colMaxWidth = 0;

        for (let i = 0; i < n; i++) {
            const image = images[i];
            const rowIndex = i % rows;

            if (i > 0 && rowIndex === 0) { // New column
                currentX += colMaxWidth + SPACING;
                currentY = startY;
                colMaxWidth = 0;
            }

            newPositions[image.id] = { x: currentX, y: currentY };
            
            currentY += image.height * image.scale + SPACING;
            colMaxWidth = Math.max(colMaxWidth, image.width * image.scale);
        }
    }
    return newPositions;
};

const calculateArrangedBounds = (
    images: CanvasImage[], 
    direction: 'horizontal' | 'vertical'
): { bounds: Rect | null } => {
    if (images.length === 0) return { bounds: null };

    const positions = arrangeImagesInGrid(images, direction, 0, 0);

    const virtualImages = images.map(img => ({
        ...img,
        x: positions[img.id].x,
        y: positions[img.id].y
    }));
    
    return { bounds: getImagesBounds(virtualImages) };
};

type AnnotationSelection = { imageId: string | null; annotationId: string; };
interface AppState {
    historyState: { history: CanvasImage[][], index: number };
    liveImages: CanvasImage[] | null;
    archivedImages: Record<string, CanvasImage>;
    selectedImageIds: string[];
    selectedAnnotations: AnnotationSelection[];
    cropArea: Rect | null;
    viewTransform: { scale: number; offset: Point };
    groups: Group[];
    canvasAnnotations: Annotation[];
}

const initialAppState: AppState = {
    historyState: { history: [[]], index: 0 },
    liveImages: null,
    archivedImages: {},
    selectedImageIds: [],
    selectedAnnotations: [],
    cropArea: null,
    viewTransform: { scale: 1, offset: { x: 0, y: 0 } },
    groups: [],
    canvasAnnotations: [],
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(initialAppState);
  
  const { 
    historyState, liveImages, archivedImages, selectedImageIds, 
    selectedAnnotations, cropArea, viewTransform, groups,
    canvasAnnotations
  } = appState;

  const images = liveImages ?? historyState.history[historyState.index];

  const setImages = useCallback((updater: (prevImages: CanvasImage[]) => CanvasImage[]) => {
      setAppState(current => {
          const currentImages = current.liveImages ?? current.historyState.history[current.historyState.index];
          const newImages = updater(currentImages);
          
          if (newImages === currentImages) {
              return current;
          }

          const newHistory = current.historyState.history.slice(0, current.historyState.index + 1);
          newHistory.push(newImages);
          
          return {
              ...current,
              historyState: {
                  history: newHistory,
                  index: newHistory.length - 1
              },
              liveImages: null
          };
      });
  }, []);

  const setImagesForInteraction = useCallback((updater: (prevImages: CanvasImage[]) => CanvasImage[]) => {
    setAppState(current => {
      const baseImages = current.liveImages ?? current.historyState.history[current.historyState.index];
      return { ...current, liveImages: updater(baseImages) };
    });
  }, []);

  const handleMoveSelectedImages = useCallback((delta: Point) => {
    setImagesForInteraction(prevImages => {
        return prevImages.map(img => {
            if (selectedImageIds.includes(img.id)) {
                return { ...img, x: img.x + delta.x, y: img.y + delta.y };
            }
            return img;
        });
    });
}, [selectedImageIds, setImagesForInteraction]);
  
  const commitInteraction = useCallback(() => {
    if (liveImages) {
      setAppState(current => {
        if (!current.liveImages) return current;
        const newHistory = current.historyState.history.slice(0, current.historyState.index + 1);
        newHistory.push(current.liveImages);
        return { 
          ...current,
          historyState: { history: newHistory, index: newHistory.length - 1 },
          liveImages: null 
        };
      });
    }
  }, [liveImages]);
  
  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.history.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setAppState(prev => ({ 
        ...prev, 
        liveImages: null,
        historyState: { ...prev.historyState, index: prev.historyState.index - 1 }
      }));
    }
  }, [canUndo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      setAppState(prev => ({ 
        ...prev, 
        liveImages: null,
        historyState: { ...prev.historyState, index: prev.historyState.index + 1 }
      }));
    }
  }, [canRedo]);


  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [toolOptions, setToolOptions] = useState({
    color: '#ef4444', // red-500
    strokeWidth: 4,
    fillColor: '#ffffff',
    fillOpacity: 0,
    outlineColor: '#000000',
    outlineWidth: 0,
    outlineOpacity: 1,
    fontSize: 32,
    fontFamily: 'Arial',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    strokeColor: '#000000',
    strokeOpacity: 0,
  });
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floatingEditorRef = useRef<HTMLDivElement>(null);

  const selectedImage = useMemo(() => {
    const lastId = selectedImageIds[selectedImageIds.length - 1];
    return images.find(img => img.id === lastId) || null;
  }, [images, selectedImageIds]);

  const handleFileChange = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newImages: CanvasImage[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        try {
          const newImage = await readImageFile(file);
          newImages.push(newImage);
        } catch (error) {
          console.error("Error reading image file:", error);
        }
      }
    }
    setImages(prev => [...prev, ...newImages]);
  }, [setImages]);

  const updateSelectedImages = useCallback((changes: Partial<Omit<CanvasImage, 'id' | 'annotations' | 'createdAt' | 'name' | 'element' | 'width' | 'height'>>) => {
    setImages(prev => prev.map(img => selectedImageIds.includes(img.id) ? { ...img, ...changes } : img));
  }, [setImages, selectedImageIds]);

  const renameCanvasImage = useCallback((id: string, newName: string) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, name: newName } : img));
  }, [setImages]);
  
  const deleteImage = useCallback((id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    setAppState(prev => ({
        ...prev,
        selectedImageIds: prev.selectedImageIds.filter(selId => selId !== id),
        groups: prev.groups.map(g => ({ ...g, imageIds: g.imageIds.filter(imgId => imgId !== id) })).filter(g => g.imageIds.length > 0)
    }));
  }, [setImages]);

  const deleteSelectedImages = useCallback(() => {
    if (selectedImageIds.length === 0) return;
    setImages(prev => prev.filter(img => !selectedImageIds.includes(img.id)));
    setAppState(prev => ({
        ...prev,
        selectedImageIds: [],
        groups: prev.groups.map(g => ({ ...g, imageIds: g.imageIds.filter(id => !selectedImageIds.includes(id)) })).filter(g => g.imageIds.length > 0)
    }));
  }, [selectedImageIds, setImages]);

  const addAnnotation = useCallback((imageId: string, annotation: Annotation) => {
    setImages(prev => prev.map(img => {
      if (img.id === imageId) {
        return { ...img, annotations: [...img.annotations, annotation] };
      }
      return img;
    }));
  }, [setImages]);

  const updateSelectedAnnotations = useCallback((changes: Partial<Annotation>) => {
    if (selectedAnnotations.length === 0) return;

    const imageAnnotationSelections = selectedAnnotations.filter(s => s.imageId !== null);
    const canvasAnnotationIds = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);
    
    if (imageAnnotationSelections.length > 0) {
        setImages(prev => prev.map(img => {
            const relevantSelections = imageAnnotationSelections.filter(sel => sel.imageId === img.id).map(sel => sel.annotationId);
            if (relevantSelections.length === 0) return img;

            return {
                ...img,
                annotations: img.annotations.map(anno => {
                    if (relevantSelections.includes(anno.id)) {
                        return { ...anno, ...changes } as Annotation;
                    }
                    return anno;
                })
            };
        }));
    }

    if (canvasAnnotationIds.length > 0) {
        setAppState(prev => ({
            ...prev,
            canvasAnnotations: prev.canvasAnnotations.map(anno =>
                canvasAnnotationIds.includes(anno.id) ? { ...anno, ...changes } as Annotation : anno
            )
        }));
    }
  }, [setImages, selectedAnnotations]);

  const updateSelectedAnnotationsForInteraction = useCallback((changes: Partial<Annotation>) => {
    if (selectedAnnotations.length === 0) return;
    
    const imageAnnotationSelections = selectedAnnotations.filter(s => s.imageId !== null);
    const canvasAnnotationIds = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);

    if (imageAnnotationSelections.length > 0) {
        setImagesForInteraction(prev => prev.map(img => {
            const relevantSelections = imageAnnotationSelections.filter(sel => sel.imageId === img.id).map(sel => sel.annotationId);
            if (relevantSelections.length === 0) return img;

            return {
                ...img,
                annotations: img.annotations.map(anno => {
                    if (relevantSelections.includes(anno.id)) {
                        return { ...anno, ...changes } as Annotation;
                    }
                    return anno;
                })
            };
        }));
    }

    if (canvasAnnotationIds.length > 0) {
        setAppState(prev => ({
            ...prev,
            canvasAnnotations: prev.canvasAnnotations.map(anno =>
                canvasAnnotationIds.includes(anno.id) ? { ...anno, ...changes } as Annotation : anno
            )
        }));
    }
  }, [setImagesForInteraction, selectedAnnotations]);

  const deleteSelectedAnnotations = useCallback(() => {
    if (selectedAnnotations.length === 0) return;

    const imageAnnotationSelections = selectedAnnotations.filter(s => s.imageId !== null);
    const canvasAnnotationIds = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);

    if (imageAnnotationSelections.length > 0) {
        setImages(prev => prev.map(img => {
            const annotationsToDelete = imageAnnotationSelections
                .filter(sel => sel.imageId === img.id)
                .map(sel => sel.annotationId);

            if (annotationsToDelete.length > 0) {
                return {
                    ...img,
                    annotations: img.annotations.filter(anno => !annotationsToDelete.includes(anno.id))
                };
            }
            return img;
        }));
    }

    if (canvasAnnotationIds.length > 0) {
        setAppState(prev => ({
            ...prev,
            canvasAnnotations: prev.canvasAnnotations.filter(anno => !canvasAnnotationIds.includes(anno.id)),
        }));
    }
    setAppState(prev => ({ ...prev, selectedAnnotations: [] }));
  }, [setImages, selectedAnnotations]);

  const addCanvasAnnotation = useCallback((annotation: Annotation) => {
    setAppState(prev => ({
        ...prev,
        canvasAnnotations: [...prev.canvasAnnotations, annotation]
    }));
  }, []);

  const reparentCanvasAnnotationsToImage = useCallback((annotationIds: string[], newImageId: string) => {
    if (annotationIds.length === 0) return;

    setAppState(prev => {
        const annotationsToMove = prev.canvasAnnotations.filter(a => annotationIds.includes(a.id));
        if (annotationsToMove.length === 0) return prev;

        const currentImages = prev.liveImages ?? prev.historyState.history[prev.historyState.index];
        const targetImage = currentImages.find(img => img.id === newImageId);
        if (!targetImage) return prev;

        const newAnnotationsForImage: Annotation[] = [];
        const newSelection: AnnotationSelection[] = [];

        for (const annotationToMove of annotationsToMove) {
            const newAnnotation = JSON.parse(JSON.stringify(annotationToMove)) as Annotation;

            const transformPoint = (p: Point): Point => transformGlobalToLocal(p, targetImage);
            
            switch (newAnnotation.type) {
                case 'rect': case 'text': case 'circle': {
                    const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
                    newAnnotation.x = x; newAnnotation.y = y;
                    break;
                }
                case 'freehand': {
                    newAnnotation.points = newAnnotation.points.map(transformPoint);
                    break;
                }
                case 'arrow': case 'line': {
                    newAnnotation.start = transformPoint(newAnnotation.start);
                    newAnnotation.end = transformPoint(newAnnotation.end);
                    break;
                }
            }
            
            newAnnotation.scale /= targetImage.scale;
            newAnnotation.rotation -= targetImage.rotation;
            
            newAnnotationsForImage.push(newAnnotation);
            newSelection.push({ imageId: newImageId, annotationId: newAnnotation.id });
        }
        
        const nextImages = currentImages.map(img => {
            if (img.id === newImageId) {
                return { ...img, annotations: [...img.annotations, ...newAnnotationsForImage] };
            }
            return img;
        });

        const newHistory = prev.historyState.history.slice(0, prev.historyState.index + 1);
        newHistory.push(nextImages);

        return {
            ...prev,
            historyState: { history: newHistory, index: newHistory.length - 1 },
            liveImages: null,
            canvasAnnotations: prev.canvasAnnotations.filter(a => !annotationIds.includes(a.id)),
            selectedAnnotations: newSelection,
        };
    });
  }, []);

  const reparentImageAnnotationsToImage = useCallback((annotationsToReparent: Array<{ annotationId: string, imageId: string }>, newImageId: string) => {
    setAppState(prev => {
        const currentImages = prev.liveImages ?? prev.historyState.history[prev.historyState.index];
        const newImage = currentImages.find(img => img.id === newImageId);
        if (!newImage) return prev;

        let annotationsToAdd: Annotation[] = [];
        const annotationIdsToRemoveByImage: Record<string, Set<string>> = {};

        for (const { annotationId, imageId } of annotationsToReparent) {
            if (imageId === newImageId) continue;

            const oldImage = currentImages.find(img => img.id === imageId);
            const annotationToMove = oldImage?.annotations.find(anno => anno.id === annotationId);

            if (!oldImage || !annotationToMove) continue;

            if (!annotationIdsToRemoveByImage[imageId]) {
                annotationIdsToRemoveByImage[imageId] = new Set();
            }
            annotationIdsToRemoveByImage[imageId].add(annotationId);

            const newAnnotation = JSON.parse(JSON.stringify(annotationToMove)) as Annotation;

            const transformPoint = (p: Point): Point => {
                const globalP = transformLocalToGlobal(p, oldImage);
                return transformGlobalToLocal(globalP, newImage);
            };

            newAnnotation.scale = (oldImage.scale * newAnnotation.scale) / newImage.scale;
            newAnnotation.rotation = (oldImage.rotation + newAnnotation.rotation) - newImage.rotation;

            switch (newAnnotation.type) {
                case 'rect': case 'text': case 'circle': {
                    const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
                    newAnnotation.x = x;
                    newAnnotation.y = y;
                    break;
                }
                case 'freehand': {
                    newAnnotation.points = newAnnotation.points.map(transformPoint);
                    break;
                }
                case 'arrow': case 'line': {
                    newAnnotation.start = transformPoint(newAnnotation.start);
                    newAnnotation.end = transformPoint(newAnnotation.end);
                    break;
                }
            }
            annotationsToAdd.push(newAnnotation);
        }

        if (annotationsToAdd.length === 0) return prev;
        
        const nextImages = currentImages.map(img => {
            if (img.id === newImageId) {
                return { ...img, annotations: [...img.annotations, ...annotationsToAdd] };
            }
            if (annotationIdsToRemoveByImage[img.id]) {
                const idsToRemove = annotationIdsToRemoveByImage[img.id];
                return { ...img, annotations: img.annotations.filter(anno => !idsToRemove.has(anno.id)) };
            }
            return img;
        });

        const newHistory = prev.historyState.history.slice(0, prev.historyState.index + 1);
        newHistory.push(nextImages);

        return {
            ...prev,
            historyState: { history: newHistory, index: newHistory.length - 1 },
            liveImages: null,
            selectedAnnotations: annotationsToAdd.map(anno => ({ imageId: newImageId, annotationId: anno.id }))
        };
    });
}, []);

  const reorderImages = useCallback((dragId: string, dropId: string) => {
    setImages(prevImages => {
      const dragIndex = prevImages.findIndex(img => img.id === dragId);
      const dropIndex = prevImages.findIndex(img => img.id === dropId);
      if (dragIndex === -1 || dropIndex === -1 || dragIndex === dropIndex) return prevImages;
      
      const newImages = [...prevImages];
      const [draggedImage] = newImages.splice(dragIndex, 1);
      newImages.splice(dropIndex, 0, draggedImage);
      return newImages;
    });
  }, [setImages]);

  const reparentAnnotation = useCallback((annotationId: string, oldImageId: string, newImageId: string) => {
    if (oldImageId === newImageId) return;

    setImages(prevImages => {
      const oldImage = prevImages.find(img => img.id === oldImageId);
      const newImage = prevImages.find(img => img.id === newImageId);
      const annotationToMove = oldImage?.annotations.find(anno => anno.id === annotationId);

      if (!oldImage || !newImage || !annotationToMove) return prevImages;
      
      const newAnnotation = JSON.parse(JSON.stringify(annotationToMove));

      const globalRotation = oldImage.rotation + annotationToMove.rotation;
      newAnnotation.rotation = globalRotation - newImage.rotation;

      const globalScale = oldImage.scale * annotationToMove.scale;
      newAnnotation.scale = globalScale / newImage.scale;

      const transformPoint = (p: Point): Point => {
          const globalP = transformLocalToGlobal(p, oldImage);
          return transformGlobalToLocal(globalP, newImage);
      };

      switch (newAnnotation.type) {
        case 'rect':
        case 'text':
        case 'circle': {
            const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
            newAnnotation.x = x;
            newAnnotation.y = y;
            break;
        }
        case 'freehand': {
            newAnnotation.points = newAnnotation.points.map(transformPoint);
            break;
        }
        case 'arrow':
        case 'line': {
            newAnnotation.start = transformPoint(newAnnotation.start);
            newAnnotation.end = transformPoint(newAnnotation.end);
            break;
        }
      }
      
      const nextImages = prevImages.map(img => {
          if (img.id === oldImageId) {
              return { ...img, annotations: img.annotations.filter(anno => anno.id !== annotationId) };
          }
          if (img.id === newImageId) {
              return { ...img, annotations: [...img.annotations, newAnnotation] };
          }
          return img;
      });

      setAppState(prev => ({ ...prev, selectedAnnotations: [{ imageId: newImageId, annotationId: newAnnotation.id }] }));
      
      return nextImages;
    });
  }, [setImages]);

  const reorderImageLayer = useCallback((imageId: string, direction: 'forward' | 'backward' | 'front' | 'back') => {
    setAppState(prev => {
        const currentImages = prev.liveImages ?? prev.historyState.history[prev.historyState.index];
        const imageInGroup = prev.groups.find(g => g.imageIds.includes(imageId));

        let nextImages: CanvasImage[] = currentImages;
        let nextGroups = prev.groups;

        if (imageInGroup) {
            nextGroups = prev.groups.map(g => {
                if (g.id === imageInGroup.id) {
                    const newImageIds = [...g.imageIds];
                    const index = newImageIds.indexOf(imageId);
                    if (index === -1) return g;
                    const [item] = newImageIds.splice(index, 1);
                    switch (direction) {
                        case 'forward': newImageIds.splice(Math.min(index + 1, newImageIds.length), 0, item); break;
                        case 'backward': newImageIds.splice(Math.max(index - 1, 0), 0, item); break;
                        case 'front': newImageIds.push(item); break;
                        case 'back': newImageIds.unshift(item); break;
                    }
                    return { ...g, imageIds: newImageIds };
                }
                return g;
            });

            const imageMap = new Map(currentImages.map(img => [img.id, img]));
            const allGroupedIdsOrder: string[] = nextGroups.flatMap(g => g.imageIds);
            const allGroupedIdsSet = new Set(allGroupedIdsOrder);

            const newOrderedGroupedImages = allGroupedIdsOrder.map(id => imageMap.get(id)).filter(Boolean) as CanvasImage[];
            const ungroupedImages = currentImages.filter(img => !allGroupedIdsSet.has(img.id));
            
            nextImages = [...newOrderedGroupedImages, ...ungroupedImages];

        } else { // Ungrouped image
            const groupedIds = new Set(prev.groups.flatMap(g => g.imageIds));
            const ungrouped = currentImages.filter(img => !groupedIds.has(img.id));
            const allGroupedImages = currentImages.filter(img => groupedIds.has(img.id));

            const index = ungrouped.findIndex(img => img.id === imageId);
            if (index === -1) return prev;
            const [image] = ungrouped.splice(index, 1);

            switch (direction) {
                case 'forward': ungrouped.splice(Math.min(index + 1, ungrouped.length), 0, image); break;
                case 'backward': ungrouped.splice(Math.max(index - 1, 0), 0, image); break;
                case 'front': ungrouped.push(image); break;
                case 'back': ungrouped.unshift(image); break;
            }
            nextImages = [...allGroupedImages, ...ungrouped];
        }

        if (nextImages === currentImages) return prev;

        const newHistory = prev.historyState.history.slice(0, prev.historyState.index + 1);
        newHistory.push(nextImages);
        
        return {
            ...prev,
            groups: nextGroups,
            historyState: { history: newHistory, index: newHistory.length - 1 },
            liveImages: null
        };
    });
  }, []);
  
  const reorderTopLevelLayer = useCallback((dragId: string, dropId: string) => {
    setAppState(prev => {
        const currentImages = prev.liveImages ?? prev.historyState.history[prev.historyState.index];
        const groupedImageIds = new Set(prev.groups.flatMap(g => g.imageIds));
        const ungroupedImages = currentImages.filter(img => !groupedImageIds.has(img.id));
        
        const layers: (Group | CanvasImage)[] = [...prev.groups, ...ungroupedImages];
        
        const dragIndex = layers.findIndex(l => l.id === dragId);
        const dropIndex = layers.findIndex(l => l.id === dropId);

        if (dragIndex === -1 || dropIndex === -1 || dragIndex === dragIndex) return prev;

        const newLayers = [...layers];
        const [draggedItem] = newLayers.splice(dragIndex, 1);
        newLayers.splice(dropIndex, 0, draggedItem);

        const nextGroups = newLayers.filter((l): l is Group => 'imageIds' in l);
        
        const imageMap = new Map(currentImages.map(img => [img.id, img]));
        const nextImages: CanvasImage[] = newLayers.flatMap(layer => {
            if ('imageIds' in layer) { // Group
                return layer.imageIds.map(id => imageMap.get(id)).filter(Boolean) as CanvasImage[];
            } else { // CanvasImage
                return [layer];
            }
        });

        const newHistory = prev.historyState.history.slice(0, prev.historyState.index + 1);
        newHistory.push(nextImages);
        
        return {
            ...prev,
            groups: nextGroups,
            historyState: { history: newHistory, index: newHistory.length - 1 },
            liveImages: null
        };
    });
  }, []);

  const handleSelectImage = useCallback((id: string | null, multiSelect = false) => {
    setAppState(prev => {
        if (id === null) {
            return { ...prev, selectedImageIds: [], selectedAnnotations: [] };
        }
        
        const idsToSelect = [id];
    
        let newSelection: string[];
        if (multiSelect) {
            const currentSelection = new Set(prev.selectedImageIds);
            if (currentSelection.has(id)) {
                currentSelection.delete(id);
            } else {
                currentSelection.add(id);
            }
            newSelection = Array.from(currentSelection);
        } else {
            const isAlreadySelected = prev.selectedImageIds.length === 1 && prev.selectedImageIds.includes(id);
            newSelection = isAlreadySelected ? prev.selectedImageIds : idsToSelect;
        }

        return { ...prev, selectedImageIds: newSelection, selectedAnnotations: [] };
    });
  }, []);

  const handleSelectImages = useCallback((ids: string[], keepExisting = false) => {
    setAppState(prev => {
        let newSelection: string[];
        if (keepExisting) {
            const combined = new Set([...prev.selectedImageIds, ...ids]);
            newSelection = Array.from(combined);
        } else {
            newSelection = ids;
        }
        return { ...prev, selectedImageIds: newSelection, selectedAnnotations: [] };
    });
  }, []);

  const handleSelectAnnotation = useCallback((updater: (prev: AnnotationSelection[]) => AnnotationSelection[]) => {
    setAppState(prev => ({
        ...prev,
        selectedAnnotations: updater(prev.selectedAnnotations),
        selectedImageIds: [],
    }));
  }, []);

  const alignImages = useCallback((alignment: 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom') => {
    if (selectedImageIds.length < 2) return;

    setImages(currentImages => {
        const selected = selectedImageIds.map(id => currentImages.find(img => img.id === id)).filter(Boolean) as CanvasImage[];
        if (selected.length < 2) return currentImages;

        const referenceImage = selected[selected.length - 1];
        
        const refX = referenceImage.x;
        const refY = referenceImage.y;
        const refCX = referenceImage.x + (referenceImage.width * referenceImage.scale / 2);
        const refCY = referenceImage.y + (referenceImage.height * referenceImage.scale / 2);
        const refRight = referenceImage.x + (referenceImage.width * referenceImage.scale);
        const refBottom = referenceImage.y + (referenceImage.height * referenceImage.scale);

        return currentImages.map(img => {
            if (selectedImageIds.includes(img.id) && img.id !== referenceImage.id) {
                const newImg = { ...img };
                const imgWidth = newImg.width * newImg.scale;
                const imgHeight = newImg.height * newImg.scale;

                switch(alignment) {
                    case 'left': newImg.x = refX; break;
                    case 'h-center': newImg.x = refCX - (imgWidth / 2); break;
                    case 'right': newImg.x = refRight - imgWidth; break;
                    case 'top': newImg.y = refY; break;
                    case 'v-center': newImg.y = refCY - (imgHeight / 2); break;
                    case 'bottom': newImg.y = refBottom - imgHeight; break;
                }
                return newImg;
            }
            return img;
        });
    });
  }, [selectedImageIds, setImages]);

  const arrangeImages = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedImageIds.length < 2) return;

    setImages(currentImages => {
        const selectedImagesInOrder = selectedImageIds
            .map(id => currentImages.find(img => img.id === id))
            .filter((img): img is CanvasImage => !!img);

        if (selectedImagesInOrder.length < 2) return currentImages;

        const partitions: { [key: string]: CanvasImage[] } = {};
        const partitionOrder: string[] = [];
        const imageIdToGroupId: { [key:string]: string } = {};
        groups.forEach(g => g.imageIds.forEach(id => imageIdToGroupId[id] = g.id));
        
        selectedImagesInOrder.forEach(img => {
            const partitionKey = imageIdToGroupId[img.id] ?? 'ungrouped';
            if (!partitions[partitionKey]) {
                partitions[partitionKey] = [];
                partitionOrder.push(partitionKey);
            }
            partitions[partitionKey].push(img);
        });

        const allNewPositions: { [id: string]: { x: number; y: number } } = {};
        const BLOCK_SPACING = 30;

        const partitionBlocks = partitionOrder.map(key => {
            const images = partitions[key];
            const { bounds } = calculateArrangedBounds(images, direction);
            return { key, images, bounds };
        }).filter(block => block.bounds);

        if (partitionBlocks.length < 1) return currentImages;

        const anchor = selectedImagesInOrder[0];
        let currentX = anchor.x;
        let currentY = anchor.y;
        
        if (direction === 'horizontal') {
            const n = partitionBlocks.length;
            const cols = Math.ceil(Math.sqrt(n));
            let rowMaxHeight = 0;

            for (let i = 0; i < n; i++) {
                const block = partitionBlocks[i]!;
                const colIndex = i % cols;

                if (i > 0 && colIndex === 0) {
                    currentY += rowMaxHeight + BLOCK_SPACING;
                    currentX = anchor.x;
                    rowMaxHeight = 0;
                }
                
                const newPositions = arrangeImagesInGrid(block.images, direction, currentX, currentY);
                Object.assign(allNewPositions, newPositions);
                
                currentX += block.bounds!.width + BLOCK_SPACING;
                rowMaxHeight = Math.max(rowMaxHeight, block.bounds!.height);
            }
        } else { // vertical
            const n = partitionBlocks.length;
            const rows = Math.ceil(Math.sqrt(n));
            let colMaxWidth = 0;
            
            for (let i = 0; i < n; i++) {
                const block = partitionBlocks[i]!;
                const rowIndex = i % rows;

                if (i > 0 && rowIndex === 0) {
                    currentX += colMaxWidth + BLOCK_SPACING;
                    currentY = anchor.y;
                    colMaxWidth = 0;
                }

                const newPositions = arrangeImagesInGrid(block.images, direction, currentX, currentY);
                Object.assign(allNewPositions, newPositions);

                currentY += block.bounds!.height + BLOCK_SPACING;
                colMaxWidth = Math.max(colMaxWidth, block.bounds!.width);
            }
        }
        
        return currentImages.map(img => allNewPositions[img.id] ? { ...img, ...allNewPositions[img.id] } : img);
    });
}, [selectedImageIds, setImages, groups]);

  const stackImages = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedImageIds.length < 2) return;

    setImages(currentImages => {
        const selectedImagesInOrder = selectedImageIds
            .map(id => currentImages.find(img => img.id === id))
            .filter((img): img is CanvasImage => !!img);

        if (selectedImagesInOrder.length < 2) return currentImages;

        const SPACING = 10;
        const allNewPositions: { [id: string]: { x: number; y: number } } = {};
        
        const anchor = selectedImagesInOrder[0];
        let currentX = anchor.x;
        let currentY = anchor.y;
        
        allNewPositions[anchor.id] = { x: currentX, y: currentY };

        let previousImage = anchor;
        for (let i = 1; i < selectedImagesInOrder.length; i++) {
            const image = selectedImagesInOrder[i];
            if (direction === 'horizontal') {
                currentX += previousImage.width * previousImage.scale + SPACING;
                allNewPositions[image.id] = { x: currentX, y: anchor.y };
            } else { // vertical
                currentY += previousImage.height * previousImage.scale + SPACING;
                allNewPositions[image.id] = { x: anchor.x, y: currentY };
            }
            previousImage = image;
        }
        
        return currentImages.map(img => allNewPositions[img.id] ? { ...img, ...allNewPositions[img.id] } : img);
    });
  }, [selectedImageIds, setImages]);

  const distributeImages = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedImageIds.length < 3) return;

    setImages(currentImages => {
        const selected = selectedImageIds.map(id => currentImages.find(img => img.id === id)).filter((img): img is CanvasImage => !!img);
        if (selected.length < 3) return currentImages;

        if (direction === 'horizontal') {
            selected.sort((a, b) => a.x - b.x);
            const leftImage = selected[0];
            const rightImage = selected[selected.length - 1];
            const totalWidthOfInnerImages = selected.slice(1, -1).reduce((sum, img) => sum + img.width * img.scale, 0);
            
            const span = (rightImage.x) - (leftImage.x + leftImage.width * leftImage.scale);
            const totalSpacing = span - totalWidthOfInnerImages;
            
            if (totalSpacing < 0) return currentImages; // Not enough space to distribute
            
            const spacing = totalSpacing / (selected.length - 1);
            
            let currentX = leftImage.x + leftImage.width * leftImage.scale + spacing;
            
            const newPositions: { [id: string]: { x: number } } = {};
            selected.slice(1, -1).forEach(img => {
                newPositions[img.id] = { x: currentX };
                currentX += img.width * img.scale + spacing;
            });

            return currentImages.map(img => {
                if (newPositions[img.id]) {
                    return { ...img, ...newPositions[img.id] };
                }
                return img;
            });

        } else { // vertical
            selected.sort((a, b) => a.y - b.y);
            const topImage = selected[0];
            const bottomImage = selected[selected.length - 1];
            const totalHeightOfInnerImages = selected.slice(1, -1).reduce((sum, img) => sum + img.height * img.scale, 0);

            const span = (bottomImage.y) - (topImage.y + topImage.height * topImage.scale);
            const totalSpacing = span - totalHeightOfInnerImages;
            
            if (totalSpacing < 0) return currentImages;

            const spacing = totalSpacing / (selected.length - 1);

            let currentY = topImage.y + topImage.height * topImage.scale + spacing;

            const newPositions: { [id: string]: { y: number } } = {};
            selected.slice(1, -1).forEach(img => {
                newPositions[img.id] = { y: currentY };
                currentY += img.height * img.scale + spacing;
            });
            
            return currentImages.map(img => {
                if (newPositions[img.id]) {
                    return { ...img, ...newPositions[img.id] };
                }
                return img;
            });
        }
    });
  }, [selectedImageIds, setImages]);

  const matchImageSizes = useCallback((dimension: 'width' | 'height') => {
    if (selectedImageIds.length < 2) return;
    
    setImages(currentImages => {
        const selected = selectedImageIds.map(id => currentImages.find(img => img.id === id)).filter((img): img is CanvasImage => !!img);
        if (selected.length < 2) return currentImages;

        const referenceImage = selected[selected.length - 1];
        
        return currentImages.map(img => {
            if (selectedImageIds.includes(img.id) && img.id !== referenceImage.id) {
                const newImg = { ...img };
                if (dimension === 'width') {
                    const targetWidth = referenceImage.width * referenceImage.scale;
                    newImg.scale = targetWidth / newImg.width;
                } else { // height
                    const targetHeight = referenceImage.height * referenceImage.scale;
                    newImg.scale = targetHeight / newImg.height;
                }
                return newImg;
            }
            return img;
        });
    });
  }, [selectedImageIds, setImages]);
  
  const handleCrop = useCallback(async () => {
    if (!cropArea || cropArea.width === 0 || cropArea.height === 0) return;

    const mimeType = `image/${exportFormat}`;
    const extension = exportFormat === 'png' ? '.png' : '.jpg';

    const intersects = (img: CanvasImage) => {
      const imgRight = img.x + img.width * img.scale;
      const imgBottom = img.y + img.height * img.scale;
      const cropRight = cropArea.x + cropArea.width;
      const cropBottom = cropArea.y + cropArea.height;
      return !(cropArea.x > imgRight || cropRight < img.x || cropArea.y > imgBottom || cropBottom < img.y);
    };

    const imagesToCrop = selectedImageIds.length > 0
      ? images.filter(img => selectedImageIds.includes(img.id) && intersects(img))
      : images.filter(intersects);

    if (imagesToCrop.length === 0) {
      alert("No image found within the crop area.");
      setAppState(prev => ({...prev, cropArea: null}));
      return;
    }
    
    const originalsToArchive = Object.fromEntries(imagesToCrop.map(img => [img.id, img]));
    setAppState(prev => ({...prev, archivedImages: { ...prev.archivedImages, ...originalsToArchive }}));

    const dpr = window.devicePixelRatio || 1;
    const newCroppedImages: CanvasImage[] = [];
    const idsToRemove = imagesToCrop.map(img => img.id);
    const idMap: { [oldId: string]: string } = {};

    for (const imageToCrop of imagesToCrop) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cropArea.width * dpr;
      tempCanvas.height = cropArea.height * dpr;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) continue;
      ctx.scale(dpr, dpr);

      ctx.save();
      const centerX = imageToCrop.x + (imageToCrop.width * imageToCrop.scale / 2);
      const centerY = imageToCrop.y + (imageToCrop.height * imageToCrop.scale / 2);
      
      ctx.translate(centerX - cropArea.x, centerY - cropArea.y);
      ctx.rotate(imageToCrop.rotation * Math.PI / 180);
      ctx.scale(imageToCrop.scale, imageToCrop.scale);
      
      ctx.drawImage(imageToCrop.element, -imageToCrop.width / 2, -imageToCrop.height / 2, imageToCrop.width, imageToCrop.height);
      
      if (imageToCrop.outlineWidth && imageToCrop.outlineWidth > 0) {
        ctx.strokeStyle = hexToRgba(imageToCrop.outlineColor || '#000000', imageToCrop.outlineOpacity || 1);
        ctx.lineWidth = imageToCrop.outlineWidth / imageToCrop.scale;
        ctx.strokeRect(-imageToCrop.width / 2, -imageToCrop.height / 2, imageToCrop.width, imageToCrop.height);
      }
      ctx.restore();
      
      const { canvas: trimmedCanvas, bounds: trimBounds } = trimCanvas(tempCanvas);
      
      if (!trimBounds) continue;

      const dataUrl = trimmedCanvas.toDataURL(mimeType);
      const element = await createImageElementFromDataUrl(dataUrl);

      const baseName = imageToCrop.name.replace(/\.[^/.]+$/, "");
      
      const newImageOrigin = {
        x: cropArea.x + (trimBounds.x / dpr),
        y: cropArea.y + (trimBounds.y / dpr)
      };

      const transformedAnnotations: Annotation[] = (imageToCrop.annotations || []).map(annotation => {
          const newAnno = JSON.parse(JSON.stringify(annotation));

          const transformPoint = (p: Point): Point => {
              const imgCenterX_canvas = imageToCrop.x + (imageToCrop.width * imageToCrop.scale) / 2;
              const imgCenterY_canvas = imageToCrop.y + (imageToCrop.height * imageToCrop.scale) / 2;
              
              let x = p.x - imageToCrop.width / 2;
              let y = p.y - imageToCrop.height / 2;
              
              x *= imageToCrop.scale;
              y *= imageToCrop.scale;
              
              const rad = imageToCrop.rotation * Math.PI / 180;
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              
              const canvasX = (x * cos - y * sin) + imgCenterX_canvas;
              const canvasY = (x * sin + y * cos) + imgCenterY_canvas;
              
              const newLocalX = canvasX - newImageOrigin.x;
              const newLocalY = canvasY - newImageOrigin.y;
              
              return { x: newLocalX, y: newLocalY };
          };

          newAnno.scale = (annotation.scale || 1) * imageToCrop.scale;
          newAnno.rotation = (annotation.rotation || 0) + imageToCrop.rotation;

          switch (newAnno.type) {
              case 'rect':
              case 'text':
              case 'circle': {
                  const transformedPos = transformPoint({ x: newAnno.x, y: newAnno.y });
                  newAnno.x = transformedPos.x;
                  newAnno.y = transformedPos.y;
                  break;
              }
              case 'freehand': {
                  newAnno.points = newAnno.points.map(transformPoint);
                  break;
              }
              case 'arrow':
              case 'line': {
                  newAnno.start = transformPoint(newAnno.start);
                  newAnno.end = transformPoint(newAnno.end);
                  break;
              }
          }
          return newAnno;
      });

      const newImage: CanvasImage = {
        id: `img-${Date.now()}-${Math.random()}`,
        name: `${baseName}_crop${extension}`,
        element,
        x: newImageOrigin.x,
        y: newImageOrigin.y,
        width: element.width,
        height: element.height,
        scale: 1,
        rotation: 0,
        annotations: transformedAnnotations,
        createdAt: imageToCrop.createdAt,
        outlineColor: '#000000',
        outlineWidth: 0,
        outlineOpacity: 1,
        uncroppedFromId: imageToCrop.id,
        originalHeight: imageToCrop.originalHeight,
        originalWidth: imageToCrop.originalWidth,
        cropRect: null,
      };
      newCroppedImages.push(newImage);
      idMap[imageToCrop.id] = newImage.id;
    }
    
    if (newCroppedImages.length > 0) {
        setImages(prev => {
            const newImageMap = new Map(newCroppedImages.map(img => [img.uncroppedFromId!, img]));
            const nextImages: CanvasImage[] = [];
            prev.forEach(img => {
                if (newImageMap.has(img.id)) {
                    nextImages.push(newImageMap.get(img.id)!);
                } else if (!idsToRemove.includes(img.id)) {
                    nextImages.push(img);
                }
            });
            return nextImages;
        });
        setAppState(prev => ({
            ...prev,
            selectedImageIds: newCroppedImages.map(img => img.id),
            groups: prev.groups.map(g => {
                const newImageIds: string[] = [];
                g.imageIds.forEach(oldId => {
                    if (idMap[oldId]) {
                        newImageIds.push(idMap[oldId]);
                    } else if (!idsToRemove.includes(oldId)) {
                        newImageIds.push(oldId);
                    }
                });
                return { ...g, imageIds: newImageIds };
            }).filter(g => g.imageIds.length > 0)
        }));
    } else {
      setImages(prev => prev.filter(img => !idsToRemove.includes(img.id)));
      setAppState(prev => ({
        ...prev,
        selectedImageIds: [],
        groups: prev.groups.map(g => ({
            ...g,
            imageIds: g.imageIds.filter(id => !idsToRemove.includes(id))
        })).filter(g => g.imageIds.length > 0)
      }));
    }
    setAppState(prev => ({...prev, cropArea: null}));

  }, [cropArea, images, selectedImageIds, exportFormat, setImages, groups]);

  const handleUncrop = useCallback((imageIds: string[]) => {
      const idsToUncrop = new Set(imageIds);
      const newSelection: string[] = [];

      setImages(currentImages => {
          const restoredImages = new Map<string, CanvasImage>();
          
          const updatedImages = currentImages.map(img => {
              if (idsToUncrop.has(img.id) && img.uncroppedFromId && archivedImages[img.uncroppedFromId]) {
                  const original = { ...archivedImages[img.uncroppedFromId] };
                  original.x = img.x + (img.width / 2) - (original.width * original.scale / 2);
                  original.y = img.y + (img.height / 2) - (original.height * original.scale / 2);
                  restoredImages.set(img.id, original);
                  newSelection.push(original.id);
                  return original;
              }
              return img;
          });

          return updatedImages;
      });

      setAppState(prev => {
        const remaining = prev.selectedImageIds.filter(id => !idsToUncrop.has(id));
        return { ...prev, selectedImageIds: [...remaining, ...newSelection] };
      });

  }, [archivedImages, setImages]);
  
  const handleCopyToClipboard = useCallback(async () => {
    const mimeType = `image/${exportFormat}`;
    let areaToCopy: Rect | null = null;
    let imagesToComposite: CanvasImage[] = [];

    const selectedImages = images.filter(img => selectedImageIds.includes(img.id));

    if (cropArea) {
        areaToCopy = cropArea;
        const intersects = (img: CanvasImage) => {
            const imgRight = img.x + img.width * img.scale;
            const imgBottom = img.y + img.height * img.scale;
            const cropRight = areaToCopy!.x + areaToCopy!.width;
            const cropBottom = areaToCopy!.y + areaToCopy!.height;
            return !(areaToCopy!.x > imgRight || cropRight < img.x || areaToCopy!.y > imgBottom || cropBottom < img.y);
        };
        imagesToComposite = images.filter(intersects);
    } else if (selectedImages.length > 0) {
        imagesToComposite = selectedImages;
        areaToCopy = getImagesBounds(imagesToComposite);
    }
    
    if (!areaToCopy || imagesToComposite.length === 0 || areaToCopy.width < 1 || areaToCopy.height < 1) {
        alert("Select an image or create a crop area to copy.");
        return;
    }
    
    const tempCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    tempCanvas.width = areaToCopy.width * dpr;
    tempCanvas.height = areaToCopy.height * dpr;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    images.forEach(img => {
      if (imagesToComposite.some(copyImg => copyImg.id === img.id)) {
        ctx.save();
        const centerX = img.x + (img.width * img.scale / 2);
        const centerY = img.y + (img.height * img.scale / 2);
        
        ctx.translate(centerX - areaToCopy!.x, centerY - areaToCopy!.y);
        ctx.rotate(img.rotation * Math.PI / 180);
        ctx.scale(img.scale, img.scale);
        
        ctx.drawImage(img.element, -img.width / 2, -img.height / 2, img.width, img.height);
        
        if (img.outlineWidth && img.outlineWidth > 0) {
          ctx.strokeStyle = hexToRgba(img.outlineColor || '#000000', img.outlineOpacity || 1);
          ctx.lineWidth = img.outlineWidth / img.scale;
          ctx.strokeRect(-img.width / 2, -img.height / 2, img.width, img.height);
        }
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(-img.width / 2, -img.height / 2, img.width, img.height);
        ctx.clip();

        ctx.translate(-img.width / 2, -img.height / 2);
        if (img.annotations) {
          img.annotations.forEach(anno => drawAnnotation(ctx, anno));
        }
        ctx.restore();

        ctx.restore();
      }
    });
    
    try {
      const { canvas: trimmedCanvas } = trimCanvas(tempCanvas);
      const blob = await new Promise<Blob | null>((resolve) => trimmedCanvas.toBlob(resolve, mimeType));
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ [mimeType]: blob }),
        ]);
      } else {
        throw new Error('Canvas toBlob returned null.');
      }
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      alert('Failed to copy image to clipboard. Your browser might not support this feature or permissions may be denied.');
    }
  }, [cropArea, images, exportFormat, selectedImageIds]);

  const handleFitCropToImage = useCallback(() => {
    if (selectedImageIds.length !== 1) return;
    const imageId = selectedImageIds[0];
    const image = images.find(img => img.id === imageId);
    if (!image) return;

    const { x, y, width, scale, rotation } = image;
    const w = width * scale;
    const h = image.height * scale;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const rad = rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const corners = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 },
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    corners.forEach(corner => {
        const rx = corner.x * cos - corner.y * sin;
        const ry = corner.x * sin + corner.y * cos;
        const finalX = rx + cx;
        const finalY = ry + cy;
        minX = Math.min(minX, finalX);
        minY = Math.min(minY, finalY);
        maxX = Math.max(maxX, finalX);
        maxY = Math.max(maxY, finalY);
    });
    
    setAppState(prev => ({
        ...prev,
        cropArea: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        }
    }));
  }, [selectedImageIds, images]);

  const handleCropToView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height } = canvas.getBoundingClientRect();

    const getCanvasPoint = (screenPoint: Point): Point => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (screenPoint.x - rect.left - viewTransform.offset.x) / viewTransform.scale,
          y: (screenPoint.y - rect.top - viewTransform.offset.y) / viewTransform.scale,
        };
    };

    const topLeft = getCanvasPoint({ x: 0, y: 0 });
    const bottomRight = getCanvasPoint({ x: width, y: height});

    setAppState(prev => ({
        ...prev,
        cropArea: {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
        }
    }));
  }, [viewTransform]);

  const handleResetCrop = useCallback(() => {
    setAppState(prev => ({ ...prev, cropArea: null }));
  }, []);

  const handleClearAllCanvas = useCallback(() => {
    setAppState(initialAppState);
  }, []);

  const handleDownloadAllCanvas = useCallback(async () => {
    if (images.length === 0) {
      alert("No images on canvas to download.");
      return;
    }

    const mimeType = `image/${exportFormat}`;
    const extension = exportFormat === 'png' ? '.png' : '.jpg';
    
    for (const image of images) {
      const tempCanvas = document.createElement('canvas');
      const tempCanvasCtx = tempCanvas.getContext('2d');
      if (!tempCanvasCtx) continue;

      tempCanvas.width = image.width;
      tempCanvas.height = image.height;
      
      tempCanvasCtx.drawImage(image.element, 0, 0);
      image.annotations.forEach(anno => drawAnnotation(tempCanvasCtx, anno));
      
      const dataUrl = tempCanvas.toDataURL(mimeType);
      const filename = image.name.replace(/\.[^/.]+$/, "") + extension;
      downloadDataUrl(dataUrl, filename);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, [images, exportFormat]);

  const handleColorPicked = useCallback((color: string) => {
    if (selectedAnnotations.length > 0) {
      updateSelectedAnnotations({ color });
    } else if (selectedImageIds.length > 0) {
      updateSelectedImages({ outlineColor: color });
    }
    setActiveTool('select');
  }, [selectedAnnotations, selectedImageIds, updateSelectedAnnotations, updateSelectedImages]);

  const handleSaveProject = useCallback(async () => {
    if (images.length === 0) {
        alert("Canvas is empty. Nothing to save.");
        return;
    }

    const serializeImageObject = (img: CanvasImage) => {
        const { element, ...rest } = img;
        return { ...rest, annotations: img.annotations || [], dataUrl: img.element.src };
    };

    const serializableImages = images.map(serializeImageObject);
    const serializableArchivedImages: Record<string, any> = {};
    for (const key in archivedImages) {
        serializableArchivedImages[key] = serializeImageObject(archivedImages[key]);
    }

    const projectState = {
        version: "1.0",
        state: {
            images: serializableImages,
            archivedImages: serializableArchivedImages,
            viewTransform,
            cropArea,
            groups,
            canvasAnnotations,
        }
    };

    const jsonString = JSON.stringify(projectState, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, 'canvas-project.cpro');
    URL.revokeObjectURL(url);
  }, [images, archivedImages, viewTransform, cropArea, groups, canvasAnnotations]);

  const handleLoadProject = useCallback(async (file: File) => {
      if (!window.confirm("Loading a project will clear your current canvas. Are you sure you want to continue?")) {
          return;
      }

      try {
          const fileContent = await file.text();
          const projectState = JSON.parse(fileContent);

          if (!projectState || projectState.version !== "1.0" || !projectState.state) {
              throw new Error("Invalid or unsupported project file.");
          }

          const { images: loadedImagesData, archivedImages: loadedArchivedData, viewTransform: loadedViewTransform, cropArea: loadedCropArea, groups: loadedGroups, canvasAnnotations: loadedCanvasAnnotations } = projectState.state;

          type SerializedImage = Omit<CanvasImage, 'element'> & { dataUrl: string };

          const deserializeImageData = async (data: SerializedImage): Promise<CanvasImage> => {
              const element = await createImageElementFromDataUrl(data.dataUrl);
              const { dataUrl, ...rest } = data;

              if (rest.groups && Array.isArray(rest.groups)) {
                  (rest as any).groups = (rest.groups as any[]).map((g: any): Group => ({
                      id: typeof g.id === 'string' ? g.id : `group-${Date.now()}-${Math.random()}`,
                      name: typeof g.name === 'string' ? g.name : 'Untitled Group',
// FIX: Cast imageIds to unknown[] to allow TypeScript to correctly infer the type after filtering.
                      imageIds: Array.isArray(g.imageIds) ? (g.imageIds as unknown[]).filter((id: unknown): id is string => typeof id === 'string') : [],
                      isExpanded: typeof g.isExpanded === 'boolean' ? g.isExpanded : true,
                  }));
              }

              return { ...rest, annotations: data.annotations || [], createdAt: new Date(rest.createdAt), element };
          };
          
          const deserializeArchived = async (archivedData: Record<string, SerializedImage>) => {
              if (!archivedData) return {};
              const result: Record<string, CanvasImage> = {};
              const promises = Object.entries(archivedData).map(async ([key, data]) => {
                  result[key] = await deserializeImageData(data);
              });
              await Promise.all(promises);
              return result;
          };
          
          const newImagesPromises = (loadedImagesData || []).map(deserializeImageData);
          const [newImages, newArchivedImages] = await Promise.all([
              Promise.all(newImagesPromises),
              deserializeArchived(loadedArchivedData)
          ]);
          
          const sanitizedGroups: Group[] = Array.isArray(loadedGroups) ? loadedGroups.map((g: any): Group => ({
            id: typeof g.id === 'string' ? g.id : `group-${Date.now()}-${Math.random()}`,
            name: typeof g.name === 'string' ? g.name : 'Untitled Group',
// FIX: Cast imageIds to unknown[] to allow TypeScript to correctly infer the type after filtering.
            imageIds: Array.isArray(g.imageIds) ? (g.imageIds as unknown[]).filter((id: unknown): id is string => typeof id === 'string') : [],
            isExpanded: typeof g.isExpanded === 'boolean' ? g.isExpanded : true,
          })) : [];

          const newState: AppState = {
              historyState: { history: [newImages], index: 0 },
              liveImages: null,
              archivedImages: newArchivedImages || {},
              selectedImageIds: [],
              selectedAnnotations: [],
              cropArea: loadedCropArea || null,
              viewTransform: loadedViewTransform || { scale: 1, offset: { x: 0, y: 0 } },
              groups: sanitizedGroups,
              canvasAnnotations: loadedCanvasAnnotations || [],
          };

          setAppState(() => newState);
          
      } catch (error) {
          console.error("Failed to load project:", error);
          alert("Failed to load project file. It might be corrupted or in an invalid format.");
      }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditingText = target.tagName.toUpperCase() === 'INPUT' || target.tagName.toUpperCase() === 'TEXTAREA' || target.isContentEditable;
      
      if (e.key.toLowerCase() === 's' && !isEditingText) {
        e.preventDefault();
        setActiveTool('select');
      }

      if (e.key.toLowerCase() === 'i' && !isEditingText) {
        e.preventDefault();
        setActiveTool('eyedropper');
      }

      if (e.ctrlKey || e.metaKey) {
          if (e.key.toLowerCase() === 'z') {
              e.preventDefault();
              handleUndo();
          } else if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
              e.preventDefault();
              handleRedo();
          } else if (e.key.toLowerCase() === 'c' && !isEditingText && (cropArea || selectedImageIds.length > 0)) {
              e.preventDefault();
              handleCopyToClipboard();
          }
          return;
      }
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
        if (selectedImageIds.length > 0) {
          e.preventDefault();
          deleteSelectedImages();
        } else if (selectedAnnotations.length > 0) {
          e.preventDefault();
          deleteSelectedAnnotations();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImageIds, deleteSelectedImages, handleUndo, handleRedo, selectedAnnotations, deleteSelectedAnnotations, cropArea, handleCopyToClipboard, setActiveTool]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            try {
              const newImage = await readImageFile(file);
              
              const canvas = canvasRef.current;
              if (canvas) {
                const { width, height } = canvas.getBoundingClientRect();
                const centerX = (width / 2 - viewTransform.offset.x) / viewTransform.scale - (newImage.width * newImage.scale / 2);
                const centerY = (height / 2 - viewTransform.offset.y) / viewTransform.scale - (newImage.height * newImage.scale / 2);
                newImage.x = centerX;
                newImage.y = centerY;
              }

              setImages(prev => [...prev, newImage]);
              handleSelectImage(newImage.id);
            } catch (error) {
              console.error("Error reading pasted image:", error);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [setImages, viewTransform, handleSelectImage]);
  
  const selectedAnnotationObjects = useMemo(() => {
    const annotations: Annotation[] = [];
    for (const sel of selectedAnnotations) {
        if (sel.imageId) {
            const image = images.find(img => img.id === sel.imageId);
            const annotation = image?.annotations.find(anno => anno.id === sel.annotationId);
            if (annotation) {
                annotations.push(annotation);
            }
        } else { // Canvas annotation
            const annotation = canvasAnnotations.find(anno => anno.id === sel.annotationId);
            if (annotation) {
                annotations.push(annotation);
            }
        }
    }
    return annotations;
  }, [selectedAnnotations, images, canvasAnnotations]);
  
  const floatingEditorPosition = useMemo((): React.CSSProperties => {
    if (selectedAnnotations.length === 0) return { display: 'none' };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const canvas = canvasRef.current;
    const tempCtx = canvas?.getContext('2d');
    if (!canvas || !tempCtx) return { display: 'none' };

    selectedAnnotations.forEach(sel => {
        const image = sel.imageId ? images.find(img => img.id === sel.imageId) : null;
        const annotation = image
            ? image.annotations.find(a => a.id === sel.annotationId)
            : canvasAnnotations.find(a => a.id === sel.annotationId);
        
        if (!annotation) return;

        const localBounds = getAnnotationBounds(annotation, tempCtx, { ignoreStyles: true });
        const corners = [
            { x: localBounds.x, y: localBounds.y },
            { x: localBounds.x + localBounds.width, y: localBounds.y },
            { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
            { x: localBounds.x, y: localBounds.y + localBounds.height },
        ];

        if (image) { // It's an image annotation
            corners.forEach(corner => {
                const globalPoint = transformLocalToGlobal(corner, image);
                minX = Math.min(minX, globalPoint.x);
                minY = Math.min(minY, globalPoint.y);
                maxX = Math.max(maxX, globalPoint.x);
                maxY = Math.max(maxY, globalPoint.y);
            });
        } else { // It's a canvas annotation
            corners.forEach(corner => {
                minX = Math.min(minX, corner.x);
                minY = Math.min(minY, corner.y);
                maxX = Math.max(maxX, corner.x);
                maxY = Math.max(maxY, corner.y);
            });
        }
    });

    if (minX === Infinity) return { display: 'none' };
    
    const minScreenX = (minX * viewTransform.scale) + viewTransform.offset.x;
    const maxScreenX = (maxX * viewTransform.scale) + viewTransform.offset.x;
    const maxScreenY = (maxY * viewTransform.scale) + viewTransform.offset.y;

    const PADDING = 25;
    
    const centerScreenX = minScreenX + (maxScreenX - minScreenX) / 2;

    return {
        display: 'block',
        position: 'absolute',
        left: `${centerScreenX}px`,
        top: `${maxScreenY + PADDING}px`,
        transform: 'translateX(-50%)',
    };
  }, [selectedAnnotations, images, canvasAnnotations, viewTransform]);

  const createGroupFromSelection = useCallback(() => {
    if (selectedImageIds.length < 1) return;
    setAppState(prev => {
        const newGroup: Group = {
            id: `group-${Date.now()}`,
            name: `Group ${prev.groups.length + 1}`,
            imageIds: selectedImageIds,
            isExpanded: true,
        };
        const updatedGroups = prev.groups.map(g => ({
            ...g,
            imageIds: g.imageIds.filter(id => !selectedImageIds.includes(id)),
        })).filter(g => g.imageIds.length > 0);
        return {
            ...prev,
            groups: [...updatedGroups, newGroup],
            selectedImageIds: [],
        };
    });
  }, [selectedImageIds]);

  const deleteGroup = useCallback((groupId: string) => {
    setAppState(prev => ({
        ...prev,
        groups: prev.groups.filter(g => g.id !== groupId)
    }));
  }, []);

  const renameGroup = useCallback((groupId: string, newName: string) => {
    setAppState(prev => ({
        ...prev,
        groups: prev.groups.map(g => g.id === groupId ? { ...g, name: newName } : g)
    }));
  }, []);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setAppState(prev => ({
        ...prev,
        groups: prev.groups.map(g => g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g)
    }));
  }, []);

  const addImageToGroup = useCallback((groupId: string, imageId: string) => {
    setAppState(prev => {
        const imageToAdd = prev.historyState.history[prev.historyState.index].find(img => img.id === imageId);
        if (!imageToAdd) return prev;

        const groupsWithoutImage = prev.groups.map(g => ({
            ...g,
            imageIds: g.imageIds.filter(id => id !== imageId)
        }));

        const targetGroup = groupsWithoutImage.find(g => g.id === groupId);
        if (!targetGroup) return prev;

        const updatedGroups = groupsWithoutImage.map(g =>
            g.id === groupId ? { ...g, imageIds: [...g.imageIds, imageId] } : g
        );

        return { ...prev, groups: updatedGroups };
    });
  }, []);

  return (
    <div className="flex h-screen w-screen bg-gray-900 font-sans overflow-hidden">
      <LeftSidebar
        onFileChange={handleFileChange}
        selectedImage={selectedImage}
        selectedImageIds={selectedImageIds}
        onUpdateSelectedImages={updateSelectedImages}
        cropArea={cropArea}
        onCrop={handleCrop}
        onCopyToClipboard={handleCopyToClipboard}
        onResetCrop={handleResetCrop}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        toolOptions={toolOptions}
        setToolOptions={setToolOptions}
        images={images}
        onRenameImage={renameCanvasImage}
        setSelectedImageId={handleSelectImage}
        onSelectImages={handleSelectImages}
        onCropToView={handleCropToView}
        onDeleteImage={deleteImage}
        onReorderTopLevelLayer={reorderTopLevelLayer}
        onReorderImageLayer={reorderImageLayer}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAlignImages={alignImages}
        onArrangeImages={arrangeImages}
        onStackImages={stackImages}
        onDistributeImages={distributeImages}
        onMatchImageSizes={matchImageSizes}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        onFitCropToImage={handleFitCropToImage}
        onClearAllCanvas={handleClearAllCanvas}
        onDownloadAllCanvas={handleDownloadAllCanvas}
        onUncrop={handleUncrop}
        selectedAnnotations={selectedAnnotations}
        setSelectedAnnotations={handleSelectAnnotation}
        onReparentAnnotation={reparentAnnotation}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        groups={groups}
        onCreateGroup={createGroupFromSelection}
        onDeleteGroup={deleteGroup}
        onRenameGroup={renameGroup}
        onToggleGroupExpanded={toggleGroupExpanded}
        onAddImageToGroup={addImageToGroup}
        canvasAnnotations={canvasAnnotations}
        onReparentCanvasAnnotationsToImage={reparentCanvasAnnotationsToImage}
      />
      <main className="flex-1 h-full bg-gray-800 relative">
        <CanvasWrapper
          ref={canvasRef}
          images={images}
          groups={groups}
          selectedImageIds={selectedImageIds}
          setSelectedImageId={handleSelectImage}
          onSelectImages={handleSelectImages}
          cropArea={cropArea}
          setCropArea={(area) => setAppState(prev => ({ ...prev, cropArea: typeof area === 'function' ? area(prev.cropArea) : area }))}
          aspectRatio={aspectRatio}
          setImages={setImagesForInteraction}
          onInteractionEnd={commitInteraction}
          onMoveSelectedImages={handleMoveSelectedImages}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          toolOptions={toolOptions}
          addAnnotation={addAnnotation}
          deleteAnnotation={deleteSelectedAnnotations}
          viewTransform={viewTransform}
          setViewTransform={(transform) => setAppState(prev => ({...prev, viewTransform: typeof transform === 'function' ? transform(prev.viewTransform) : transform}))}
          selectedAnnotations={selectedAnnotations}
          setSelectedAnnotations={handleSelectAnnotation}
          updateAnnotation={updateSelectedAnnotationsForInteraction}
          onColorPicked={handleColorPicked}
          canvasAnnotations={canvasAnnotations}
          addCanvasAnnotation={addCanvasAnnotation}
          onMoveCanvasAnnotations={(delta) => setAppState(prev => ({...prev, canvasAnnotations: prev.canvasAnnotations.map(anno => {
              const isSelected = prev.selectedAnnotations.some(s => s.imageId === null && s.annotationId === anno.id);
              if (!isSelected) return anno;
              switch (anno.type) {
                  case 'rect': case 'circle': case 'text':
                      return { ...anno, x: anno.x + delta.x, y: anno.y + delta.y };
                  case 'freehand':
                      return { ...anno, points: anno.points.map(p => ({ x: p.x + delta.x, y: p.y + delta.y })) };
                  case 'line': case 'arrow':
                      return { ...anno, start: { x: anno.start.x + delta.x, y: anno.start.y + delta.y }, end: { x: anno.end.x + delta.x, y: anno.end.y + delta.y } };
                  default: return anno;
              }
          })}))}
          onReparentCanvasAnnotationsToImage={reparentCanvasAnnotationsToImage}
          reparentImageAnnotationsToImage={reparentImageAnnotationsToImage}
        />
        <FloatingAnnotationEditor
          ref={floatingEditorRef}
          style={floatingEditorPosition}
          selectedAnnotations={selectedAnnotationObjects}
          onUpdate={updateSelectedAnnotations}
          onDelete={deleteSelectedAnnotations}
        />
      </main>
    </div>
  );
};

export default App;