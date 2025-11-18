

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { LayersPanel } from './components/LayersPanel';
import { CanvasWrapper } from './components/CanvasWrapper';
import { FloatingAnnotationEditor } from './components/FloatingAnnotationEditor';
import { CanvasImage, Rect, AspectRatio, Annotation, AnnotationTool, Point, TextAnnotation, Group } from './types';
import { readImageFile, downloadDataUrl, createImageElementFromDataUrl } from './utils/fileUtils';
import { drawAnnotation, getAnnotationBounds, transformGlobalToLocal, transformLocalToGlobal, getImagesBounds, getGroupBounds } from './utils/canvasUtils';

declare var JSZip: any;

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

const arrangeRectsInGrid = (
    rects: (Rect & { id: string })[], 
    direction: 'horizontal' | 'vertical',
    startX: number,
    startY: number,
    spacing: number
): { [id: string]: { x: number; y: number } } => {
    if (rects.length === 0) return {};

    const newPositions: { [id: string]: { x: number; y: number } } = {};
    const n = rects.length;
    
    let currentX = startX;
    let currentY = startY;

    if (direction === 'horizontal') {
        const cols = Math.ceil(Math.sqrt(n));
        let rowMaxHeight = 0;

        for (let i = 0; i < n; i++) {
            const rect = rects[i];
            const colIndex = i % cols;

            if (i > 0 && colIndex === 0) { // New row
                currentY += rowMaxHeight + spacing;
                currentX = startX;
                rowMaxHeight = 0;
            }
            
            newPositions[rect.id] = { x: currentX, y: currentY };
            
            currentX += rect.width + spacing;
            rowMaxHeight = Math.max(rowMaxHeight, rect.height);
        }
    } else { // vertical
        const rows = Math.ceil(Math.sqrt(n));
        let colMaxWidth = 0;

        for (let i = 0; i < n; i++) {
            const rect = rects[i];
            const rowIndex = i % rows;

            if (i > 0 && rowIndex === 0) { // New column
                currentX += colMaxWidth + spacing;
                currentY = startY;
                colMaxWidth = 0;
            }

            newPositions[rect.id] = { x: currentX, y: currentY };
            
            currentY += rect.height + spacing;
            colMaxWidth = Math.max(colMaxWidth, rect.width);
        }
    }
    return newPositions;
};


type AnnotationSelection = { imageId: string | null; annotationId: string; };
type LastArrangement = { type: 'arrange' | 'stack'; direction: 'horizontal' | 'vertical'; } | null;

interface HistoryEntry {
    images: CanvasImage[];
    groups: Group[];
    canvasAnnotations: Annotation[];
}

interface AppState {
    history: HistoryEntry[];
    historyIndex: number;
    savedHistoryIndex: number;
    liveImages: CanvasImage[] | null;
    liveCanvasAnnotations: Annotation[] | null;
    archivedImages: Record<string, CanvasImage>;
    selectedImageIds: string[];
    selectedAnnotations: AnnotationSelection[];
    selectedLayerId: string | null;
    lastClickedLayerId: string | null;
    lastClickedAnnotation: AnnotationSelection | null;
    cropArea: Rect | null;
    viewTransform: { scale: number; offset: Point };
    selectionMethod: 'click' | 'box';
    expandedImageAnnotationIds: string[];
}

const initialHistoryEntry: HistoryEntry = { images: [], groups: [], canvasAnnotations: [] };
const initialAppState: AppState = {
    history: [initialHistoryEntry],
    historyIndex: 0,
    savedHistoryIndex: 0,
    liveImages: null,
    liveCanvasAnnotations: null,
    archivedImages: {},
    selectedImageIds: [],
    selectedAnnotations: [],
    selectedLayerId: null,
    lastClickedLayerId: null,
    lastClickedAnnotation: null,
    cropArea: null,
    viewTransform: { scale: 1, offset: { x: 0, y: 0 } },
    selectionMethod: 'box',
    expandedImageAnnotationIds: [],
};

const getAllImageIdsInGroup = (groupId: string, allGroups: Group[]): string[] => {
    const groupMap = new Map(allGroups.map(g => [g.id, g]));
    const visited = new Set<string>();
    const imageIds: string[] = [];
    const q = [groupId];
    visited.add(groupId);

    while (q.length > 0) {
        const currentId = q.shift()!;
        const currentGroup = groupMap.get(currentId);
        if (!currentGroup) continue;
        
        imageIds.push(...currentGroup.imageIds);
        currentGroup.groupIds.forEach(childId => {
            if (!visited.has(childId)) {
                q.push(childId);
                visited.add(childId);
            }
        });
    }
    return imageIds;
};

const getOrderedChildrenOfGroup = (group: Group, allImages: CanvasImage[], allGroups: Group[]): (Group | CanvasImage)[] => {
    const childImageItems = group.imageIds.map(id => allImages.find(i => i.id === id)).filter((i): i is CanvasImage => !!i);
    const childGroupItems = group.groupIds.map(id => allGroups.find(g => g.id === id)).filter((g): g is Group => !!g);
    const allChildren = [...childImageItems, ...childGroupItems];
    
    const imageZIndexMap = new Map(allImages.map((img, i) => [img.id, i]));
    const getItemMaxZ = (item: Group | CanvasImage): number => {
        if ('element' in item) {
            return imageZIndexMap.get(item.id) ?? -Infinity;
        }
        const imageIds = getAllImageIdsInGroup(item.id, allGroups);
        if (imageIds.length === 0) return -Infinity;
        return Math.max(...imageIds.map(id => imageZIndexMap.get(id) ?? -Infinity));
    };

    allChildren.sort((a, b) => getItemMaxZ(a) - getItemMaxZ(b));
    return allChildren;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(initialAppState);
  
  const { 
    history, historyIndex, savedHistoryIndex, liveImages, liveCanvasAnnotations, archivedImages, selectedImageIds, 
    selectedAnnotations, selectedLayerId, cropArea, viewTransform, selectionMethod, 
    lastClickedLayerId, expandedImageAnnotationIds, lastClickedAnnotation
  } = appState;

  const isDirty = historyIndex !== savedHistoryIndex;

  const currentHistoryState = history[historyIndex];
  const images = liveImages ?? currentHistoryState.images;
  const groups = currentHistoryState.groups;
  const canvasAnnotations = liveCanvasAnnotations ?? currentHistoryState.canvasAnnotations;

  const [lastArrangement, setLastArrangement] = useState<LastArrangement>(null);
  const [clipboard, setClipboard] = useState<{ selections: AnnotationSelection[] } | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floatingEditorRef = useRef<HTMLDivElement>(null);
  const lastCanvasMousePosition = useRef<Point>({ x: 0, y: 0 });

  const pushHistory = useCallback((newState: HistoryEntry) => {
    setAppState(current => {
        const newHistory = current.history.slice(0, current.historyIndex + 1);
        newHistory.push(newState);
        
        return {
            ...current,
            history: newHistory,
            historyIndex: newHistory.length - 1,
            liveImages: null,
            liveCanvasAnnotations: null,
        };
    });
  }, []);
  
  const setImagesForInteraction = useCallback((updater: (prevImages: CanvasImage[]) => CanvasImage[]) => {
    setAppState(current => {
      const baseImages = current.liveImages ?? current.history[current.historyIndex].images;
      return { ...current, liveImages: updater(baseImages) };
    });
  }, []);

  const setCanvasAnnotationsForInteraction = useCallback((updater: (prevAnnos: Annotation[]) => Annotation[]) => {
    setAppState(current => {
        const baseAnnos = current.liveCanvasAnnotations ?? current.history[current.historyIndex].canvasAnnotations;
        return { ...current, liveCanvasAnnotations: updater(baseAnnos) };
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
  
  const resetLastArrangement = useCallback(() => {
    setLastArrangement(null);
  }, []);

  const commitInteraction = useCallback(() => {
    resetLastArrangement();
    if (liveImages || liveCanvasAnnotations) {
        pushHistory({
            images: liveImages ?? images,
            groups: groups,
            canvasAnnotations: liveCanvasAnnotations ?? canvasAnnotations,
        });
    }
  }, [liveImages, liveCanvasAnnotations, images, groups, canvasAnnotations, pushHistory, resetLastArrangement]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setAppState(prev => ({ 
        ...prev, 
        liveImages: null,
        liveCanvasAnnotations: null,
        historyIndex: prev.historyIndex - 1,
        selectedImageIds: [],
        selectedAnnotations: [],
        selectedLayerId: null,
        lastClickedLayerId: null,
      }));
    }
  }, [canUndo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      setAppState(prev => ({ 
        ...prev, 
        liveImages: null,
        liveCanvasAnnotations: null,
        historyIndex: prev.historyIndex + 1,
        selectedImageIds: [],
        selectedAnnotations: [],
        selectedLayerId: null,
        lastClickedLayerId: null,
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
          let newImage = await readImageFile(file);
          
          if (canvasRef.current) {
            const { width, height } = canvasRef.current.getBoundingClientRect();
            const centerX = (width / 2 - viewTransform.offset.x) / viewTransform.scale;
            const centerY = (height / 2 - viewTransform.offset.y) / viewTransform.scale;
            newImage = {
                ...newImage,
                x: centerX - (newImage.width * newImage.scale / 2),
                y: centerY - (newImage.height * newImage.scale / 2),
            };
          }
          newImages.push(newImage);
        } catch (error) {
          console.error("Error reading image file:", error);
        }
      }
    }
    pushHistory({ images: [...images, ...newImages], groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations, viewTransform]);

  const updateSelectedImages = useCallback((changes: Partial<Omit<CanvasImage, 'id' | 'annotations' | 'createdAt' | 'name' | 'element' | 'width' | 'height'>>) => {
    resetLastArrangement();
    const newImages = images.map(img => selectedImageIds.includes(img.id) ? { ...img, ...changes } : img);
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations, selectedImageIds, resetLastArrangement]);

  const renameCanvasImage = useCallback((id: string, newName: string) => {
    const newImages = images.map(img => img.id === id ? { ...img, name: newName } : img);
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);
  
  const deleteImage = useCallback((id: string) => {
    const newImages = images.filter(img => img.id !== id);
    const newGroups = groups.map(g => ({ ...g, imageIds: g.imageIds.filter(imgId => imgId !== id) })).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);
    pushHistory({ images: newImages, groups: newGroups, canvasAnnotations });
    setAppState(prev => ({
        ...prev,
        selectedImageIds: prev.selectedImageIds.filter(selId => selId !== id),
        selectedLayerId: null,
    }));
  }, [pushHistory, images, groups, canvasAnnotations]);

  const deleteSelectedImages = useCallback(() => {
    if (selectedImageIds.length === 0) return;
    const newImages = images.filter(img => !selectedImageIds.includes(img.id));
    const newGroups = groups.map(g => ({ ...g, imageIds: g.imageIds.filter(id => !selectedImageIds.includes(id)) })).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);
    pushHistory({ images: newImages, groups: newGroups, canvasAnnotations });
    setAppState(prev => ({
        ...prev,
        selectedImageIds: [],
        selectedLayerId: null,
    }));
  }, [selectedImageIds, pushHistory, images, groups, canvasAnnotations]);

  const addAnnotation = useCallback((imageId: string, annotation: Annotation) => {
    const newImages = images.map(img => {
      if (img.id === imageId) {
        return { ...img, annotations: [...img.annotations, annotation] };
      }
      return img;
    });
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const updateSelectedAnnotations = useCallback((changes: Partial<Annotation>) => {
    if (selectedAnnotations.length === 0) return;

    const imageAnnotationSelections = selectedAnnotations.filter(s => s.imageId !== null);
    const canvasAnnotationIds = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);
    
    const newImages = images.map(img => {
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
    });

    const newCanvasAnnotations = canvasAnnotations.map(anno =>
        canvasAnnotationIds.includes(anno.id) ? { ...anno, ...changes } as Annotation : anno
    );

    pushHistory({ images: newImages, groups, canvasAnnotations: newCanvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations, selectedAnnotations]);

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
        setCanvasAnnotationsForInteraction(prev => 
            prev.map(anno =>
                canvasAnnotationIds.includes(anno.id) ? { ...anno, ...changes } as Annotation : anno
            )
        );
    }
  }, [setImagesForInteraction, setCanvasAnnotationsForInteraction, selectedAnnotations]);

  const updateMultipleAnnotationsForInteraction = useCallback((updates: Array<{ selection: AnnotationSelection; changes: Partial<Annotation> }>) => {
    const updatesByImageId: Record<string, Array<{ annotationId: string; changes: Partial<Annotation> }>> = {};
    const canvasUpdates: Array<{ annotationId: string; changes: Partial<Annotation> }> = [];

    updates.forEach(({ selection, changes }) => {
        if (selection.imageId) {
            if (!updatesByImageId[selection.imageId]) {
                updatesByImageId[selection.imageId] = [];
            }
            updatesByImageId[selection.imageId].push({ annotationId: selection.annotationId, changes });
        } else {
            canvasUpdates.push({ annotationId: selection.annotationId, changes });
        }
    });

    if (Object.keys(updatesByImageId).length > 0) {
        setImagesForInteraction(prev => prev.map(img => {
            if (updatesByImageId[img.id]) {
                const annoUpdates = new Map(updatesByImageId[img.id].map(u => [u.annotationId, u.changes]));
                return {
                    ...img,
                    annotations: img.annotations.map(anno =>
                        annoUpdates.has(anno.id) ? { ...anno, ...annoUpdates.get(anno.id) } as Annotation : anno
                    )
                };
            }
            return img;
        }));
    }

    if (canvasUpdates.length > 0) {
        setCanvasAnnotationsForInteraction(prev => {
            const annoUpdates = new Map(canvasUpdates.map(u => [u.annotationId, u.changes]));
            return prev.map(anno =>
                annoUpdates.has(anno.id) ? { ...anno, ...annoUpdates.get(anno.id) } as Annotation : anno
            );
        });
    }
  }, [setImagesForInteraction, setCanvasAnnotationsForInteraction]);

  const deleteSelectedAnnotations = useCallback(() => {
    if (selectedAnnotations.length === 0) return;

    const imageAnnotationSelections = selectedAnnotations.filter(s => s.imageId !== null);
    const canvasAnnotationIds = selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId);

    const newImages = images.map(img => {
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
    });

    const newCanvasAnnotations = canvasAnnotations.filter(anno => !canvasAnnotationIds.includes(anno.id));

    pushHistory({ images: newImages, groups, canvasAnnotations: newCanvasAnnotations });
    setAppState(prev => ({ ...prev, selectedAnnotations: [] }));
  }, [pushHistory, images, groups, canvasAnnotations, selectedAnnotations]);

  const addCanvasAnnotation = useCallback((annotation: Annotation) => {
    pushHistory({ images, groups, canvasAnnotations: [...canvasAnnotations, annotation] });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const reparentCanvasAnnotationsToImage = useCallback((annotationIds: string[], newImageId: string) => {
    if (annotationIds.length === 0) return;

    const annotationsToMove = canvasAnnotations.filter(a => annotationIds.includes(a.id));
    if (annotationsToMove.length === 0) return;

    const targetImage = images.find(img => img.id === newImageId);
    if (!targetImage) return;

    const newAnnotationsForImage: Annotation[] = [];
    const newSelection: AnnotationSelection[] = [];

    for (const annotationToMove of annotationsToMove) {
        const newAnnotation = JSON.parse(JSON.stringify(annotationToMove)) as Annotation;
        const transformPoint = (p: Point): Point => transformGlobalToLocal(p, targetImage);
        
        switch (newAnnotation.type) {
            case 'rect': case 'text': case 'circle':
                const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
                newAnnotation.x = x; newAnnotation.y = y;
                break;
            case 'freehand':
                newAnnotation.points = newAnnotation.points.map(transformPoint);
                break;
            case 'arrow': case 'line':
                newAnnotation.start = transformPoint(newAnnotation.start);
                newAnnotation.end = transformPoint(newAnnotation.end);
                break;
        }
        
        newAnnotation.scale /= targetImage.scale;
        newAnnotation.rotation -= targetImage.rotation;
        
        newAnnotationsForImage.push(newAnnotation);
        newSelection.push({ imageId: newImageId, annotationId: newAnnotation.id });
    }
    
    const nextImages = images.map(img => {
        if (img.id === newImageId) {
            return { ...img, annotations: [...img.annotations, ...newAnnotationsForImage] };
        }
        return img;
    });
    
    const newCanvasAnnotations = canvasAnnotations.filter(a => !annotationIds.includes(a.id));
    pushHistory({ images: nextImages, groups, canvasAnnotations: newCanvasAnnotations });
    setAppState(prev => ({...prev, selectedAnnotations: newSelection }));
  }, [pushHistory, images, groups, canvasAnnotations]);

  const reparentImageAnnotationsToCanvas = useCallback((selections: Array<{ annotationId: string; imageId: string }>) => {
    if (selections.length === 0) return;

    const newCanvasAnnotations: Annotation[] = [];
    const annotationIdsToRemoveByImage: Record<string, Set<string>> = {};
    const newSelection: AnnotationSelection[] = [];

    for (const { annotationId, imageId } of selections) {
        const sourceImage = images.find(img => img.id === imageId);
        const annotationToMove = sourceImage?.annotations.find(anno => anno.id === annotationId);
        if (!sourceImage || !annotationToMove) continue;

        if (!annotationIdsToRemoveByImage[imageId]) {
            annotationIdsToRemoveByImage[imageId] = new Set();
        }
        annotationIdsToRemoveByImage[imageId].add(annotationId);

        const newAnnotation = JSON.parse(JSON.stringify(annotationToMove)) as Annotation;
        const transformPoint = (p: Point): Point => transformLocalToGlobal(p, sourceImage);

        newAnnotation.scale = sourceImage.scale * newAnnotation.scale;
        newAnnotation.rotation = sourceImage.rotation + newAnnotation.rotation;

        switch (newAnnotation.type) {
            case 'rect': case 'text': case 'circle':
                const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
                newAnnotation.x = x;
                newAnnotation.y = y;
                break;
            case 'freehand':
                newAnnotation.points = newAnnotation.points.map(transformPoint);
                break;
            case 'arrow': case 'line':
                newAnnotation.start = transformPoint(newAnnotation.start);
                newAnnotation.end = transformPoint(newAnnotation.end);
                break;
        }
        newCanvasAnnotations.push(newAnnotation);
        newSelection.push({ imageId: null, annotationId: newAnnotation.id });
    }

    if (newCanvasAnnotations.length === 0) return;

    const nextImages = images.map(img => {
        if (annotationIdsToRemoveByImage[img.id]) {
            const idsToRemove = annotationIdsToRemoveByImage[img.id];
            return { ...img, annotations: img.annotations.filter(anno => !idsToRemove.has(anno.id)) };
        }
        return img;
    });

    const nextCanvasAnnotations = [...canvasAnnotations, ...newCanvasAnnotations];

    pushHistory({ images: nextImages, groups, canvasAnnotations: nextCanvasAnnotations });
    setAppState(prev => ({ ...prev, selectedAnnotations: newSelection }));
}, [pushHistory, images, groups, canvasAnnotations]);

  const reparentImageAnnotationsToImage = useCallback((annotationsToReparent: Array<{ annotationId: string, imageId: string }>, newImageId: string) => {
    const newImage = images.find(img => img.id === newImageId);
    if (!newImage) return;

    let annotationsToAdd: Annotation[] = [];
    const annotationIdsToRemoveByImage: Record<string, Set<string>> = {};

    for (const { annotationId, imageId } of annotationsToReparent) {
        if (imageId === newImageId) continue;
        const oldImage = images.find(img => img.id === imageId);
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
        // Cast properties to Number and add fallbacks to prevent arithmetic errors on potentially non-numeric types from deserialized data.
        newAnnotation.scale = (Number((oldImage.scale || 1) as any) * Number((newAnnotation.scale || 1) as any)) / Number((newImage.scale || 1) as any);
        newAnnotation.rotation = (Number((oldImage.rotation || 0) as any) + Number((newAnnotation.rotation || 0) as any)) - Number((newImage.rotation || 0) as any);

        switch (newAnnotation.type) {
            case 'rect': case 'text': case 'circle':
                const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
                newAnnotation.x = x; newAnnotation.y = y;
                break;
            case 'freehand':
                newAnnotation.points = newAnnotation.points.map(transformPoint);
                break;
            case 'arrow': case 'line':
                newAnnotation.start = transformPoint(newAnnotation.start);
                newAnnotation.end = transformPoint(newAnnotation.end);
                break;
        }
        annotationsToAdd.push(newAnnotation);
    }

    if (annotationsToAdd.length === 0) return;
    
    const nextImages = images.map(img => {
        if (img.id === newImageId) {
            return { ...img, annotations: [...img.annotations, ...annotationsToAdd] };
        }
        if (annotationIdsToRemoveByImage[img.id]) {
            const idsToRemove = annotationIdsToRemoveByImage[img.id];
            return { ...img, annotations: img.annotations.filter(anno => !idsToRemove.has(anno.id)) };
        }
        return img;
    });

    pushHistory({ images: nextImages, groups, canvasAnnotations });
    setAppState(prev => ({ ...prev, selectedAnnotations: annotationsToAdd.map(anno => ({ imageId: newImageId, annotationId: anno.id })) }));
}, [pushHistory, images, groups, canvasAnnotations]);

  const handleReorderLayer = useCallback((layerId: string, move: 'up' | 'down' | 'top' | 'bottom') => {
    // 1. Find the item being moved and its parent context
    const movedItemIsGroup = groups.some(g => g.id === layerId);
    const movedGroup = movedItemIsGroup ? groups.find(g => g.id === layerId) : undefined;
    const parentGroup = movedGroup
        ? groups.find(g => g.id === movedGroup.parentId)
        : groups.find(g => g.imageIds.includes(layerId));

    // 2. Get the correctly ordered list of siblings for the context
    let siblings: (Group | CanvasImage)[];
    if (parentGroup) {
        siblings = getOrderedChildrenOfGroup(parentGroup, images, groups);
    } else {
        // If no parent, get ordered top-level items
        const topLevelItems: (Group | CanvasImage)[] = [];
        const processedIds = new Set<string>();
        const findRootAncestor = (image: CanvasImage, allGroups: Group[]): CanvasImage | Group => {
            const groupMap = new Map(allGroups.map(g => [g.id, g]));
            let parent = allGroups.find(g => g.imageIds.includes(image.id));
            if (!parent) return image;
            let root = parent;
            while (root.parentId) {
                const nextParent = groupMap.get(root.parentId);
                if (!nextParent) break;
                root = nextParent;
            }
            return root;
        };
        [...images].reverse().forEach(img => {
            if (processedIds.has(img.id)) return;
            const ancestor = findRootAncestor(img, groups);
            if (!topLevelItems.some(item => item.id === ancestor.id)) {
                topLevelItems.push(ancestor);
            }
            if ('groupIds' in ancestor) {
                getAllImageIdsInGroup(ancestor.id, groups).forEach(id => processedIds.add(id));
            } else {
                processedIds.add(ancestor.id);
            }
        });
        siblings = topLevelItems.reverse(); // reverse to get bottom-to-top order
    }
    
    // 3. Perform the reorder on the list of siblings
    const currentIndex = siblings.findIndex(item => item.id === layerId);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;
    if (move === 'up') newIndex = Math.min(currentIndex + 1, siblings.length - 1);
    else if (move === 'down') newIndex = Math.max(0, currentIndex - 1);
    else if (move === 'top') newIndex = siblings.length - 1;
    else if (move === 'bottom') newIndex = 0;

    if (newIndex === currentIndex) return;

    const [movedItem] = siblings.splice(currentIndex, 1);
    siblings.splice(newIndex, 0, movedItem);

    // 4. Extract all image IDs from the reordered context
    const allImageIdsInContext = siblings.flatMap(item => 'element' in item ? [item.id] : getAllImageIdsInGroup(item.id, groups));

    // 5. Create a new master `images` array by replacing the old block of images with the new one
    const originalContextImageIds = new Set(allImageIdsInContext);
    const imagesOutsideContext = images.filter(img => !originalContextImageIds.has(img.id));
    const reorderedContextImages = allImageIdsInContext.map(id => images.find(img => img.id === id)).filter((i): i is CanvasImage => !!i);

    // To preserve overall z-order, find where the block of context images should be re-inserted.
    // The imagesOutsideContext are already in order. We need to find the right splice index.
    const imageZIndexMap = new Map(images.map((img, i) => [img.id, i]));
    const minZOfContext = Math.min(...allImageIdsInContext.map(id => Number(imageZIndexMap.get(id) ?? Infinity)));
    
    let insertionIndex = imagesOutsideContext.findIndex(img => (Number(imageZIndexMap.get(img.id) ?? -1)) > minZOfContext);
    if (insertionIndex === -1) insertionIndex = imagesOutsideContext.length;
    
    const newImages = [...imagesOutsideContext];
    newImages.splice(insertionIndex, 0, ...reorderedContextImages);
    
    pushHistory({ images: newImages, groups, canvasAnnotations });
}, [images, groups, canvasAnnotations, pushHistory]);
  
  const reorderTopLevelLayer = useCallback((dragId: string, dropId: string) => {
    // 1. Build top-level items to get current visual order
    const topLevelItems: (Group | CanvasImage)[] = [];
    const processedImageIds = new Set<string>();
    images.forEach(img => {
        if (processedImageIds.has(img.id)) return;
        const groupForImage = groups.find(g => g.imageIds.includes(img.id));
        if (groupForImage) {
            if (!topLevelItems.some(item => 'imageIds' in item && item.id === groupForImage.id)) {
                topLevelItems.push(groupForImage);
            }
            groupForImage.imageIds.forEach(id => processedImageIds.add(id));
        } else {
            topLevelItems.push(img);
        }
    });

    const dragIndex = topLevelItems.findIndex(l => l.id === dragId);
    const dropIndex = topLevelItems.findIndex(l => l.id === dropId);
    if (dragIndex === -1 || dropIndex === -1 || dragIndex === dragIndex) return;
    
    // 2. Reorder
    const [draggedItem] = topLevelItems.splice(dragIndex, 1);
    topLevelItems.splice(dropIndex, 0, draggedItem);
    
    // 3. Re-flatten
    const nextGroups = topLevelItems.filter((l): l is Group => 'imageIds' in l);
    const imageMap = new Map(images.map(img => [img.id, img]));
    const nextImages = topLevelItems.flatMap(layer => 
        'imageIds' in layer 
            ? layer.imageIds.map(id => imageMap.get(id)!).filter(Boolean) 
            : [layer as CanvasImage]
    ) as CanvasImage[];
    
    pushHistory({ images: nextImages, groups: nextGroups, canvasAnnotations });
}, [pushHistory, images, groups, canvasAnnotations]);

  const centerViewOn = useCallback((bounds: Rect | null) => {
    if (!bounds || !canvasRef.current) return;
    const { width: viewportWidth, height: viewportHeight } = canvasRef.current.getBoundingClientRect();
    const PADDING = 50; // pixels

    const targetScaleX = (viewportWidth - PADDING * 2) / bounds.width;
    const targetScaleY = (viewportHeight - PADDING * 2) / bounds.height;
    const newScale = Math.min(targetScaleX, targetScaleY, 2); // Cap zoom at 2x

    const newOffsetX = (viewportWidth / 2) - (bounds.x + bounds.width / 2) * newScale;
    const newOffsetY = (viewportHeight / 2) - (bounds.y + bounds.height / 2) * newScale;

    setAppState(prev => ({ ...prev, viewTransform: { scale: newScale, offset: { x: newOffsetX, y: newOffsetY } } }));
  }, []);

    const visualLayerOrder = useMemo(() => {
        const layerItems: (Group | CanvasImage)[] = [];
        const processedIds = new Set<string>();
        const imageIdToGroupMap = new Map<string, Group>();
        groups.forEach(g => {
            g.imageIds.forEach(id => imageIdToGroupMap.set(id, g));
        });

        [...images].reverse().forEach(img => {
            if (processedIds.has(img.id)) return;
            
            const parentGroup = imageIdToGroupMap.get(img.id);

            if (parentGroup) {
                let ancestor = parentGroup;
                while(ancestor.parentId) {
                    const parent = groups.find(g => g.id === ancestor.parentId);
                    if (!parent) break;
                    ancestor = parent;
                }

                if (!layerItems.some(item => item.id === ancestor.id)) {
                    layerItems.push(ancestor);
                }
                const q = [ancestor];
                while(q.length > 0) {
                    const current = q.shift()!;
                    processedIds.add(current.id);
                    current.imageIds.forEach(id => processedIds.add(id));
                    current.groupIds.forEach(id => {
                        const child = groups.find(g => g.id === id);
                        if (child) q.push(child);
                    });
                }
            } else {
                layerItems.push(img);
                processedIds.add(img.id);
            }
        });
        return layerItems;
    }, [groups, images]);

    const flatVisualLayerOrder = useMemo(() => {
        const flatList: { id: string; type: 'group' | 'image' }[] = [];
        visualLayerOrder.forEach(item => {
            const isGroup = 'imageIds' in item;
            flatList.push({ id: item.id, type: isGroup ? 'group' : 'image' });

            if (isGroup && item.isExpanded) {
                const groupImages = item.imageIds
                    .map(id => images.find(img => img.id === id))
                    .filter((i): i is CanvasImage => !!i);
                [...groupImages].reverse().forEach(img => {
                    flatList.push({ id: img.id, type: 'image' });
                });
            }
        });
        return flatList;
    }, [visualLayerOrder, images]);

    const flatVisualAnnotationOrder = useMemo(() => {
        const flatList: AnnotationSelection[] = [];
        
        visualLayerOrder.forEach(layer => {
            if ('imageIds' in layer) { // is Group
                if (layer.isExpanded) {
                    const imageMap = new Map(images.map(img => [img.id, img]));
                    const groupImages = layer.imageIds
                        .map(id => imageMap.get(id))
                        .filter((img): img is CanvasImage => !!img);

                    [...groupImages].reverse().forEach(img => {
                        if (expandedImageAnnotationIds.includes(img.id)) {
                            [...img.annotations].sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(anno => {
                                flatList.push({ imageId: img.id, annotationId: anno.id });
                            });
                        }
                    });
                }
            } else { // is CanvasImage
                const img = layer as CanvasImage;
                if (expandedImageAnnotationIds.includes(img.id)) {
                    [...img.annotations].sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(anno => {
                        flatList.push({ imageId: img.id, annotationId: anno.id });
                    });
                }
            }
        });
    
        [...canvasAnnotations].sort((a,b) => String(b.id).localeCompare(String(a.id))).forEach(anno => {
            flatList.push({ imageId: null, annotationId: anno.id });
        });
    
        return flatList;
    }, [visualLayerOrder, images, expandedImageAnnotationIds, canvasAnnotations]);

  const handleSelectLayer = useCallback((layerId: string, layerType: 'image' | 'group', options: { shiftKey: boolean; ctrlKey: boolean }) => {
    setAppState(prev => {
        const { selectedImageIds, lastClickedLayerId: prevLastClickedLayerId } = prev;
        
        const clickedGroup = layerType === 'group' ? groups.find(g => g.id === layerId) : null;

        let newSelectedImageIds: string[] = [];
        
        if (options.shiftKey && prevLastClickedLayerId) {
            const lastIndex = flatVisualLayerOrder.findIndex(l => l.id === prevLastClickedLayerId);
            const currentIndex = flatVisualLayerOrder.findIndex(l => l.id === layerId);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);
                const layersInRange = flatVisualLayerOrder.slice(start, end + 1);
                
                const imageIdsInRange = new Set<string>();
                layersInRange.forEach(layer => {
                    if (layer.type === 'image') {
                        imageIdsInRange.add(layer.id);
                    } else { // group
                        const group = groups.find(g => g.id === layer.id);
                        group?.imageIds.forEach(id => imageIdsInRange.add(id));
                    }
                });
                newSelectedImageIds = Array.from(imageIdsInRange);
            } else {
                 newSelectedImageIds = clickedGroup ? clickedGroup.imageIds : [layerId];
            }
        } else if (options.ctrlKey) {
            const currentSelection = new Set(selectedImageIds);
            const idsToToggle = new Set(clickedGroup ? clickedGroup.imageIds : [layerId]);
            
            const areAllSelected = [...idsToToggle].every(id => currentSelection.has(id));

            if (areAllSelected) {
                idsToToggle.forEach(id => currentSelection.delete(id));
            } else {
                idsToToggle.forEach(id => currentSelection.add(id));
            }
            newSelectedImageIds = Array.from(currentSelection);
        } else {
             newSelectedImageIds = clickedGroup ? getAllImageIdsInGroup(clickedGroup.id, groups) : [layerId];
        }

        return {
            ...prev,
            selectedImageIds: newSelectedImageIds,
            selectedLayerId: layerId,
            lastClickedLayerId: layerId,
            selectedAnnotations: [],
            selectionMethod: 'click',
        };
    });
  }, [groups, flatVisualLayerOrder]);

  const handleCenterOnLayer = useCallback((layerId: string, layerType: 'image' | 'group') => {
    let bounds: Rect | null = null;
    if (layerType === 'image') {
      const image = images.find(img => img.id === layerId);
      if (image) bounds = getImagesBounds([image]);
    } else {
      const group = groups.find(g => g.id === layerId);
      if (group) bounds = getGroupBounds(group, groups, images);
    }
    if (bounds) {
        centerViewOn(bounds);
    }
  }, [images, groups, centerViewOn]);

  const handleSelectImages = useCallback((ids: string[], keepExisting = false) => {
    setAppState(prev => {
        let newSelection: string[];
        if (keepExisting) {
            const existingSet = new Set(prev.selectedImageIds);
            const newIds = ids.filter(id => !existingSet.has(id));
            newSelection = [...prev.selectedImageIds, ...newIds];
        } else {
            newSelection = ids;
        }
        return { ...prev, selectedImageIds: newSelection, selectedAnnotations: [], selectedLayerId: null, selectionMethod: 'box' };
    });
  }, []);

  const handleSelectAnnotation = useCallback((imageId: string | null, annotationId: string, options: { shiftKey: boolean; ctrlKey: boolean }) => {
    setAppState(prev => {
        let newSelectedAnnotations: AnnotationSelection[] = [];
        const selection = { imageId, annotationId };

        if (options.shiftKey && prev.lastClickedAnnotation) {
            const lastIndex = flatVisualAnnotationOrder.findIndex(a => a.annotationId === prev.lastClickedAnnotation?.annotationId);
            const currentIndex = flatVisualAnnotationOrder.findIndex(a => a.annotationId === annotationId);
            
            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);
                newSelectedAnnotations = flatVisualAnnotationOrder.slice(start, end + 1);
            } else {
                newSelectedAnnotations = [selection];
            }
        } else if (options.ctrlKey) {
            const isAlreadySelected = prev.selectedAnnotations.some(s => s.annotationId === annotationId);
            if (isAlreadySelected) {
                newSelectedAnnotations = prev.selectedAnnotations.filter(s => s.annotationId !== annotationId);
            } else {
                newSelectedAnnotations = [...prev.selectedAnnotations, selection];
            }
        } else {
            newSelectedAnnotations = [selection];
        }

        const newExpanded = new Set(prev.expandedImageAnnotationIds);
        newSelectedAnnotations.forEach(sel => {
            if (sel.imageId) {
                newExpanded.add(sel.imageId);
            }
        });

        return {
            ...prev,
            selectedAnnotations: newSelectedAnnotations,
            lastClickedAnnotation: selection,
            selectedImageIds: [],
            selectedLayerId: null,
            expandedImageAnnotationIds: Array.from(newExpanded),
        };
    });
  }, [flatVisualAnnotationOrder]);

  const alignImages = useCallback((alignment: 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom') => {
    if (selectedImageIds.length < 2) return;
    resetLastArrangement();
    
    const selected = selectedImageIds.map(id => images.find(img => img.id === id)).filter(Boolean) as CanvasImage[];
    if (selected.length < 2) return;

    const referenceImage = selected[selected.length - 1];
    
    const refX = referenceImage.x;
    const refY = referenceImage.y;
    const refCX = referenceImage.x + (referenceImage.width * referenceImage.scale / 2);
    const refCY = referenceImage.y + (referenceImage.height * referenceImage.scale / 2);
    const refRight = referenceImage.x + (referenceImage.width * referenceImage.scale);
    const refBottom = referenceImage.y + (referenceImage.height * referenceImage.scale);

    const newImages = images.map(img => {
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
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [selectedImageIds, pushHistory, images, groups, canvasAnnotations, resetLastArrangement]);

  const arrangeImages = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedImageIds.length === 0) return;

    const currentArrangement = { type: 'arrange' as const, direction };
    const isSameAsLast = lastArrangement?.type === 'arrange' && lastArrangement?.direction === direction;

    let selectedImagesInOrder = selectedImageIds
        .map(id => images.find(img => img.id === id))
        .filter((img): img is CanvasImage => !!img);

    if (selectedImagesInOrder.length === 0) {
      return;
    }

    const imageIndexMap = new Map(images.map((img, i) => [img.id, i]));
    selectedImagesInOrder.sort((a, b) => (imageIndexMap.get(a.id) ?? 0) - (imageIndexMap.get(b.id) ?? 0));

    if (isSameAsLast) {
        selectedImagesInOrder.reverse();
    }
    
    const selectionBounds = getImagesBounds(selectedImagesInOrder);
    if (!selectionBounds) return;
    
    const newPositions = arrangeImagesInGrid(selectedImagesInOrder, direction, 0, 0);

    const virtualImages = selectedImagesInOrder.map(img => ({ ...img, ...newPositions[img.id] }));
    const newLayoutBounds = getImagesBounds(virtualImages);
    if (!newLayoutBounds) return;

    const finalDx = selectionBounds.x - newLayoutBounds.x;
    const finalDy = selectionBounds.y - newLayoutBounds.y;

    for (const id in newPositions) {
        newPositions[id].x += finalDx;
        newPositions[id].y += finalDy;
    }

    const newImages = images.map(img =>
        newPositions[img.id] ? { ...img, ...newPositions[img.id] } : img
    );
    
    pushHistory({ images: newImages, groups, canvasAnnotations });
    setLastArrangement(isSameAsLast ? null : currentArrangement);
  }, [selectedImageIds, pushHistory, images, groups, canvasAnnotations, lastArrangement]);

  const stackImages = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedImageIds.length < 2) return;

    const currentArrangement = { type: 'stack' as const, direction };
    
    let selectedImagesInOrder = selectedImageIds
        .map(id => images.find(img => img.id === id))
        .filter((img): img is CanvasImage => !!img);

    // Always sort by layer order (top-most layer first)
    const imageIndexMap = new Map(images.map((img, i) => [img.id, i]));
    selectedImagesInOrder.sort((a, b) => (imageIndexMap.get(b.id) ?? 0) - (imageIndexMap.get(a.id) ?? 0));
    
    const isSameAsLast = lastArrangement?.type === 'stack' && lastArrangement?.direction === direction;
    if (isSameAsLast) {
        selectedImagesInOrder.reverse(); // Reverse order on second click
    }

    if (selectedImagesInOrder.length < 2) return;

    const selectionBounds = getImagesBounds(selectedImagesInOrder);
    if (!selectionBounds) return;

    const SPACING = 10;
    const allNewPositions: { [id: string]: { x: number; y: number } } = {};
    
    let currentX = 0;
    let currentY = 0;
    
    for (let i = 0; i < selectedImagesInOrder.length; i++) {
        const image = selectedImagesInOrder[i];
        allNewPositions[image.id] = { x: currentX, y: currentY };
        if (direction === 'horizontal') {
            currentX += image.width * image.scale + SPACING;
        } else { // vertical
            currentY += image.height * image.scale + SPACING;
        }
    }

    const virtualImages = selectedImagesInOrder.map(img => ({ ...img, ...allNewPositions[img.id]! }));
    const newLayoutBounds = getImagesBounds(virtualImages);
    if (!newLayoutBounds) return;
    
    const dx = selectionBounds.x - newLayoutBounds.x;
    const dy = selectionBounds.y - newLayoutBounds.y;
    
    for (const id in allNewPositions) {
        allNewPositions[id].x += dx;
        allNewPositions[id].y += dy;
    }
    
    const newImages = images.map(img => allNewPositions[img.id] ? { ...img, ...allNewPositions[img.id] } : img);
    pushHistory({ images: newImages, groups, canvasAnnotations });
    
    if (isSameAsLast) {
        setLastArrangement(null);
    } else {
        setLastArrangement(currentArrangement);
    }
  }, [selectedImageIds, pushHistory, images, groups, canvasAnnotations, lastArrangement]);

  const matchImageSizes = useCallback((dimension: 'width' | 'height') => {
    if (selectedImageIds.length < 2) return;
    resetLastArrangement();
    
    const selected = selectedImageIds.map(id => images.find(img => img.id === id)).filter((img): img is CanvasImage => !!img);
    if (selected.length < 2) return;

    const referenceImage = selected[selected.length - 1];
    
    const newImages = images.map(img => {
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
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [selectedImageIds, pushHistory, images, groups, canvasAnnotations, resetLastArrangement]);
  
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
          const newAnno = JSON.parse(JSON.stringify(annotation)) as Annotation;

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

          newAnno.scale = annotation.scale * imageToCrop.scale;
          newAnno.rotation = annotation.rotation + imageToCrop.rotation;

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
        tags: imageToCrop.tags,
      };
      newCroppedImages.push(newImage);
      idMap[imageToCrop.id] = newImage.id;
    }
    
    const newImageMap = new Map(newCroppedImages.map(img => [img.uncroppedFromId!, img]));
    let nextImages: CanvasImage[] = [];
    images.forEach(img => {
        if (newImageMap.has(img.id)) {
            nextImages.push(newImageMap.get(img.id)!);
        } else if (!idsToRemove.includes(img.id)) {
            nextImages.push(img);
        }
    });

    const nextGroups = groups.map(g => {
        const newImageIds: string[] = [];
        g.imageIds.forEach(oldId => {
            if (idMap[oldId]) {
                newImageIds.push(idMap[oldId]);
            } else if (!idsToRemove.includes(oldId)) {
                newImageIds.push(oldId);
            }
        });
        return { ...g, imageIds: newImageIds };
    }).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);

    pushHistory({ images: nextImages, groups: nextGroups, canvasAnnotations });
    
    setAppState(prev => ({
        ...prev,
        selectedImageIds: newCroppedImages.map(img => img.id),
        cropArea: null
    }));

  }, [cropArea, images, groups, canvasAnnotations, selectedImageIds, exportFormat, pushHistory]);

  const handleUncrop = useCallback((imageIds: string[]) => {
      const idsToUncrop = new Set(imageIds);
      const newSelection: string[] = [];

      const newImages = images.map(img => {
          if (idsToUncrop.has(img.id) && img.uncroppedFromId && archivedImages[img.uncroppedFromId]) {
              const original = { ...archivedImages[img.uncroppedFromId] };
              original.x = img.x + (img.width / 2) - (original.width * original.scale / 2);
              original.y = img.y + (img.height / 2) - (original.height * original.scale / 2);
              newSelection.push(original.id);
              return original;
          }
          return img;
      });

      pushHistory({ images: newImages, groups, canvasAnnotations });
      setAppState(prev => {
        const remaining = prev.selectedImageIds.filter(id => !idsToUncrop.has(id));
        return { ...prev, selectedImageIds: [...remaining, ...newSelection] };
      });
  }, [pushHistory, images, groups, canvasAnnotations, archivedImages]);
  
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

  const handleClearAllCanvas = useCallback(() => {
    const isPristine =
        historyIndex === 0 &&
        history.length === 1 &&
        images.length === 0 &&
        groups.length === 0 &&
        canvasAnnotations.length === 0;

    if (!isPristine) {
        pushHistory(initialHistoryEntry);
        setAppState(prev => ({
            ...prev,
            selectedImageIds: [],
            selectedAnnotations: [],
            selectedLayerId: null,
            lastClickedLayerId: null,
            lastClickedAnnotation: null,
            cropArea: null,
        }));
    }
  }, [history, historyIndex, images, groups, canvasAnnotations, pushHistory]);

  const generateImageWithAnnotations = useCallback((image: CanvasImage, mimeType: string): string => {
    const tempCanvas = document.createElement('canvas');
    const tempCanvasCtx = tempCanvas.getContext('2d');
    if (!tempCanvasCtx) return '';

    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    
    tempCanvasCtx.drawImage(image.element, 0, 0);
    image.annotations.forEach(anno => drawAnnotation(tempCanvasCtx, anno));
    
    return tempCanvas.toDataURL(mimeType);
  }, []);

  const handleDownloadSelectedImages = useCallback(async () => {
    if (selectedImageIds.length === 0) return;
    const mimeType = `image/${exportFormat}`;
    const extension = exportFormat === 'png' ? '.png' : '.jpg';
    const selected = images.filter(img => selectedImageIds.includes(img.id));

    if (selected.length === 1) {
        const image = selected[0];
        const dataUrl = generateImageWithAnnotations(image, mimeType);
        const filename = image.name.replace(/\.[^/.]+$/, "") + extension;
        downloadDataUrl(dataUrl, filename);
    } else {
        if (typeof JSZip === 'undefined') {
            alert('Could not create zip file. JSZip library not found.');
            return;
        }
        const zip = new JSZip();
        const nameCounts: { [key: string]: number } = {};
        const totalImages = selected.length;
        const padding = String(totalImages).length;

        for (let i = 0; i < totalImages; i++) {
            const image = selected[i];
            const dataUrl = generateImageWithAnnotations(image, mimeType);
            const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
            
            const prefix = String(i + 1).padStart(padding, '0');
            const originalName = image.name.replace(/\.[^/.]+$/, "");
            let filename = `${prefix}_${originalName}${extension}`;

            if (nameCounts[filename]) {
                const count = nameCounts[filename]++;
                const base = filename.replace(extension, '');
                filename = `${base}_(${count})${extension}`;
            } else {
                nameCounts[filename] = 1;
            }
            
            zip.file(filename, base64Data, { base64: true });
        }

        const content = await zip.generateAsync({ type: "blob" });
        downloadDataUrl(URL.createObjectURL(content), 'selection_export.zip');
    }
  }, [selectedImageIds, images, exportFormat, generateImageWithAnnotations]);
  
  const handleDownloadAllCanvas = useCallback(async () => {
    if (images.length === 0) {
      alert("No images on canvas to download.");
      return;
    }
    if (typeof JSZip === 'undefined') {
        alert('Could not create zip file. JSZip library not found.');
        return;
    }

    const mimeType = `image/${exportFormat}`;
    const extension = exportFormat === 'png' ? '.png' : '.jpg';
    
    const zip = new JSZip();
    const nameCounts: { [key: string]: number } = {};
    const totalImages = images.length;
    const padding = String(totalImages).length;

    for (let i = 0; i < totalImages; i++) {
        const image = images[i];
        const dataUrl = generateImageWithAnnotations(image, mimeType);
        const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);

        const prefix = String(i + 1).padStart(padding, '0');
        const originalName = image.name.replace(/\.[^/.]+$/, "");
        let filename = `${prefix}_${originalName}${extension}`;
        
        if (nameCounts[filename]) {
            const count = nameCounts[filename]++;
            const base = filename.replace(extension, '');
            filename = `${base}_(${count})${extension}`;
        } else {
            nameCounts[filename] = 1;
        }
        
        zip.file(filename, base64Data, { base64: true });
    }
    
    const content = await zip.generateAsync({ type: "blob" });
    downloadDataUrl(URL.createObjectURL(content), 'canvas_export.zip');
  }, [images, exportFormat, generateImageWithAnnotations]);

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
        return { ...rest, annotations: img.annotations || [], tags: img.tags || [], dataUrl: img.element.src };
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
    setAppState(prev => ({ ...prev, savedHistoryIndex: prev.historyIndex }));
  }, [images, groups, canvasAnnotations, archivedImages, viewTransform, cropArea]);

  const handleLoadProject = useCallback(async (file: File) => {
      if (isDirty && !window.confirm("Loading a project will clear your current unsaved changes. Are you sure you want to continue?")) {
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
              return { ...rest, annotations: data.annotations || [], tags: Array.isArray(data.tags) ? data.tags : [], createdAt: new Date(rest.createdAt), element };
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
          
          const imageIdSet = new Set(newImages.map(img => img.id));
          const groupIdSet = new Set(
            Array.isArray(loadedGroups)
              ? loadedGroups
                  .map((g: any) => g?.id)
                  .filter((id: any): id is string => typeof id === 'string')
              : []
          );
          const sanitizedGroups: Group[] = Array.isArray(loadedGroups) ? loadedGroups.map((g: any): Group | null => {
            if (typeof g !== 'object' || g === null) return null;
            return {
              id: typeof g.id === 'string' ? g.id : `group-${Date.now()}-${Math.random()}`,
              name: typeof g.name === 'string' ? g.name : 'Untitled Group',
              label: typeof g.label === 'string' ? g.label : (g.name || 'Untitled Group'),
              showLabel: typeof g.showLabel === 'boolean' ? g.showLabel : true,
              // Ensure properties from deserialized data are of the correct type and valid.
              imageIds: Array.isArray(g.imageIds) ? g.imageIds.filter((id: unknown): id is string => typeof id === 'string' && imageIdSet.has(id as string)) : [],
              groupIds: Array.isArray(g.groupIds) ? g.groupIds.filter((id: unknown): id is string => typeof id === 'string' && groupIdSet.has(id as string)) : [],
              isExpanded: typeof g.isExpanded === 'boolean' ? g.isExpanded : true,
              parentId: typeof g.parentId === 'string' && groupIdSet.has(g.parentId) ? g.parentId : null,
            };
          }).filter((g): g is Group => g !== null) : [];

          const newHistoryEntry: HistoryEntry = {
              images: newImages,
              groups: sanitizedGroups,
              canvasAnnotations: loadedCanvasAnnotations || [],
          };

          setAppState({
              history: [newHistoryEntry],
              historyIndex: 0,
              savedHistoryIndex: 0,
              liveImages: null,
              liveCanvasAnnotations: null,
              archivedImages: newArchivedImages || {},
              selectedImageIds: [],
              selectedAnnotations: [],
              selectedLayerId: null,
              lastClickedLayerId: null,
              lastClickedAnnotation: null,
              cropArea: loadedCropArea || null,
              viewTransform: loadedViewTransform || { scale: 1, offset: { x: 0, y: 0 } },
              selectionMethod: 'box',
              expandedImageAnnotationIds: [],
          });
          
      } catch (error) {
          console.error("Failed to load project:", error);
          alert("Failed to load project file. It might be corrupted or in an invalid format.");
      }
  }, [isDirty]);

  const handleCopy = useCallback(() => {
    if (selectedAnnotations.length > 0) {
      setClipboard({ selections: [...selectedAnnotations] });
    }
  }, [selectedAnnotations]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;

    const { selections } = clipboard;
    if (selections.length === 0) return;

    const newAnnotations: Annotation[] = [];
    const newSelections: AnnotationSelection[] = [];

    const getLocalPoint = (canvasPoint: Point, image: CanvasImage): Point | null => {
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
        if(localX >= 0 && localX <= image.width && localY >= 0 && localY <= image.height) {
          return { x: localX, y: localY };
        }
        return null;
    };
    
    const targetImage = [...images].reverse().find(img => getLocalPoint(lastCanvasMousePosition.current, img) !== null);
    const OFFSET = 10 / viewTransform.scale;

    for (const selection of selections) {
        const originalAnnotation = selection.imageId
            ? images.find(i => i.id === selection.imageId)?.annotations.find(a => a.id === selection.annotationId)
            : canvasAnnotations.find(a => a.id === selection.annotationId);
        
        if (!originalAnnotation) continue;

        const newId = `anno-${Date.now()}-${Math.random()}`;
        const newAnnotation = JSON.parse(JSON.stringify(originalAnnotation)) as Annotation;
        newAnnotation.id = newId;

        const sourceImage: CanvasImage | null = selection.imageId ? images.find(i => i.id === selection.imageId) || null : null;

        const transformPoint = (p: Point): Point => {
            const globalPoint = sourceImage ? transformLocalToGlobal(p, sourceImage) : p;
            const targetPoint = targetImage ? transformGlobalToLocal(globalPoint, targetImage) : globalPoint;
            return { x: targetPoint.x + OFFSET, y: targetPoint.y + OFFSET };
        };

        switch (newAnnotation.type) {
            case 'rect': case 'text': case 'circle':
                const { x, y } = transformPoint({ x: newAnnotation.x, y: newAnnotation.y });
                newAnnotation.x = x;
                newAnnotation.y = y;
                break;
            case 'freehand':
                newAnnotation.points = newAnnotation.points.map(transformPoint);
                break;
            case 'arrow': case 'line':
                newAnnotation.start = transformPoint(newAnnotation.start);
                newAnnotation.end = transformPoint(newAnnotation.end);
                break;
        }

        const sourceRotation = sourceImage?.rotation ?? 0;
        const sourceScale = sourceImage?.scale ?? 1;
        const targetRotation = targetImage?.rotation ?? 0;
        const targetScale = targetImage?.scale ?? 1;

        // Cast properties to Number to prevent arithmetic errors on potentially non-numeric types from deserialized data.
        newAnnotation.rotation = (Number(sourceRotation as any) + Number((newAnnotation.rotation || 0) as any)) - Number(targetRotation as any);
        newAnnotation.scale = (Number(sourceScale as any) * Number((newAnnotation.scale || 1) as any)) / Number(targetScale as any);

        newAnnotations.push(newAnnotation);
        newSelections.push({ imageId: targetImage?.id ?? null, annotationId: newId });
    }

    if (newAnnotations.length === 0) return;

    if (targetImage) {
        const nextImages = images.map(img => {
            if (img.id === targetImage.id) {
                return { ...img, annotations: [...img.annotations, ...newAnnotations] };
            }
            return img;
        });
        pushHistory({ images: nextImages, groups, canvasAnnotations });
    } else {
        pushHistory({ images, groups, canvasAnnotations: [...canvasAnnotations, ...newAnnotations] });
    }
    
    setAppState(prev => ({ ...prev, selectedAnnotations: newSelections, selectedImageIds: [] }));

}, [clipboard, images, groups, canvasAnnotations, pushHistory, viewTransform.scale]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = ''; // Required for Chrome.
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

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
          } else if (e.key.toLowerCase() === 'c' && !isEditingText) {
              e.preventDefault();
              if (selectedAnnotations.length > 0) {
                  handleCopy();
              } else if (cropArea || selectedImageIds.length > 0) {
                  handleCopyToClipboard();
              }
          } else if (e.key.toLowerCase() === 'v' && !isEditingText) {
            if (clipboard) {
              e.preventDefault();
              handlePaste();
            }
          }
          return;
      }
      
      if (!isEditingText && e.key === 'Enter' && cropArea) {
        e.preventDefault();
        handleCrop();
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
  }, [selectedImageIds, deleteSelectedImages, handleUndo, handleRedo, selectedAnnotations, deleteSelectedAnnotations, cropArea, handleCopyToClipboard, setActiveTool, handleCrop, handleCopy, handlePaste, clipboard]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let isPastingImage = false;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          isPastingImage = true;
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

              pushHistory({ images: [...images, newImage], groups, canvasAnnotations });
              handleSelectLayer(newImage.id, 'image', { shiftKey: false, ctrlKey: false });
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
  }, [pushHistory, images, groups, canvasAnnotations, viewTransform, handleSelectLayer]);
  
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
    
    const newName = `Group ${groups.length + 1}`;
    const newGroup: Group = {
        id: `group-${Date.now()}`,
        name: newName,
        label: newName,
        showLabel: true,
        imageIds: selectedImageIds,
        groupIds: [],
        isExpanded: true,
        parentId: null,
    };
    const updatedGroups = groups.map(g => ({
        ...g,
        imageIds: g.imageIds.filter(id => !selectedImageIds.includes(id)),
    })).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);
    
    pushHistory({ images, groups: [...updatedGroups, newGroup], canvasAnnotations });
    
    setAppState(prev => ({
        ...prev,
        selectedImageIds: [],
        selectedLayerId: null,
    }));
  }, [selectedImageIds, pushHistory, images, groups, canvasAnnotations]);

  const deleteGroup = useCallback((groupId: string) => {
    const groupToDelete = groups.find(g => g.id === groupId);
    if (!groupToDelete) return;

    let nextGroups = [...groups];

    // Reparent children to the deleted group's parent
    const newParentId = groupToDelete.parentId;

    // Reparent child groups
    nextGroups = nextGroups.map(g => 
        groupToDelete.groupIds.includes(g.id) ? { ...g, parentId: newParentId } : g
    );

    // Add children to the new parent's lists (if it exists)
    if (newParentId) {
        nextGroups = nextGroups.map(g => {
            if (g.id === newParentId) {
                return {
                    ...g,
                    imageIds: [...g.imageIds, ...groupToDelete.imageIds],
                    groupIds: [...g.groupIds, ...groupToDelete.groupIds],
                };
            }
            return g;
        });
    }

    // Finally, filter out the deleted group
    nextGroups = nextGroups.filter(g => g.id !== groupId);

    pushHistory({ images, groups: nextGroups, canvasAnnotations });
}, [pushHistory, images, groups, canvasAnnotations]);


  const renameGroup = useCallback((groupId: string, newName: string) => {
    const newGroups = groups.map(g => g.id === groupId ? { ...g, name: newName } : g);
    pushHistory({ images: newGroups, groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const renameGroupLabel = useCallback((groupId: string, newLabel: string) => {
    const newGroups = groups.map(g => g.id === groupId ? { ...g, label: newLabel } : g);
    pushHistory({ images, groups: newGroups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const toggleGroupLabel = useCallback((groupId: string) => {
    const newGroups = groups.map(g => g.id === groupId ? { ...g, showLabel: !g.showLabel } : g);
    pushHistory({ images, groups: newGroups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setAppState(prev => {
        const currentGroups = prev.history[prev.historyIndex].groups;
        const newGroups = currentGroups.map(g => g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g);
        const newHistory = [...prev.history];
        newHistory[prev.historyIndex] = { ...newHistory[prev.historyIndex], groups: newGroups };
        return { ...prev, history: newHistory };
    });
  }, []);

  const toggleImageAnnotationsExpanded = useCallback((imageId: string) => {
    setAppState(prev => {
        const current = new Set(prev.expandedImageAnnotationIds);
        if (current.has(imageId)) {
            current.delete(imageId);
        } else {
            current.add(imageId);
        }
        return { ...prev, expandedImageAnnotationIds: Array.from(current) };
    });
  }, []);

  const addImageToGroup = useCallback((groupId: string, imageId: string) => {
    const imageToAdd = images.find(img => img.id === imageId);
    if (!imageToAdd) return;

    // Remove from all other groups
    const groupsWithoutImage = groups.map(g => ({
        ...g,
        imageIds: g.imageIds.filter(id => id !== imageId)
    }));

    // Add to target group
    const updatedGroups = groupsWithoutImage.map(g =>
        g.id === groupId ? { ...g, imageIds: [...g.imageIds, imageId] } : g
    );

    pushHistory({ images, groups: updatedGroups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const reparentGroup = useCallback((childGroupId: string, newParentId: string | null) => {
    let nextGroups = [...groups];
    const childGroup = nextGroups.find(g => g.id === childGroupId);
    if (!childGroup) return;

    let current = newParentId;
    while(current) {
        if (current === childGroupId) return; // invalid move
        current = nextGroups.find(g => g.id === current)?.parentId ?? null;
    }

    const oldParentId = childGroup.parentId;

    // 1. Update child's parentId
    nextGroups = nextGroups.map(g => g.id === childGroupId ? { ...g, parentId: newParentId } : g);

    // 2. Remove from old parent
    if (oldParentId) {
        nextGroups = nextGroups.map(g => 
            g.id === oldParentId ? { ...g, groupIds: g.groupIds.filter(id => id !== childGroupId) } : g
        );
    }
    
    // 3. Add to new parent
    if (newParentId) {
         nextGroups = nextGroups.map(g => 
            g.id === newParentId && !g.groupIds.includes(childGroupId) ? { ...g, groupIds: [...g.groupIds, childGroupId] } : g
        );
    }

    pushHistory({ images, groups: nextGroups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const ungroupImages = useCallback((imageIdsToUngroup: string[]) => {
    if (imageIdsToUngroup.length === 0) return;
    const idsSet = new Set(imageIdsToUngroup);

    const nextGroups = groups.map(g => {
        const newImageIds = g.imageIds.filter(id => !idsSet.has(id));
        return { ...g, imageIds: newImageIds };
    }).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);

    pushHistory({ images, groups: nextGroups, canvasAnnotations });
    setAppState(prev => ({ ...prev, selectedImageIds: imageIdsToUngroup, selectedLayerId: imageIdsToUngroup.length === 1 ? imageIdsToUngroup[0] : null }));
  }, [pushHistory, images, groups, canvasAnnotations]);
  
  const parentImageIds = useMemo(() => new Set(selectedAnnotations.filter(sel => sel.imageId).map(sel => sel.imageId!)), [selectedAnnotations]);

  const handleReverseLayerOrder = useCallback(() => {
    pushHistory({ images: [...images].reverse(), groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);
  
  const handleAddTag = useCallback((imageId: string, tag: string) => {
    const newImages = images.map(img => {
      if (img.id === imageId) {
        const newTags = [...(img.tags || [])];
        if (!newTags.includes(tag)) {
          newTags.push(tag);
        }
        return { ...img, tags: newTags };
      }
      return img;
    });
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  const handleRemoveTag = useCallback((imageId: string, tagIndex: number) => {
    const newImages = images.map(img => {
      if (img.id === imageId) {
        const newTags = [...(img.tags || [])];
        newTags.splice(tagIndex, 1);
        return { ...img, tags: newTags };
      }
      return img;
    });
    pushHistory({ images: newImages, groups, canvasAnnotations });
  }, [pushHistory, images, groups, canvasAnnotations]);

  return (
    <div className="flex h-screen w-screen bg-gray-900 font-sans overflow-hidden">
      <LeftSidebar
        onFileChange={handleFileChange}
        selectedImage={selectedImage}
        selectedImageIds={selectedImageIds}
        onUpdateSelectedImages={updateSelectedImages}
        cropArea={cropArea}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        toolOptions={toolOptions}
        setToolOptions={setToolOptions}
        onCropToView={handleCropToView}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAlignImages={alignImages}
        onArrangeImages={arrangeImages}
        onStackImages={stackImages}
        onMatchImageSizes={matchImageSizes}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        onFitCropToImage={handleFitCropToImage}
        onClearAllCanvas={handleClearAllCanvas}
        onDownloadAllCanvas={handleDownloadAllCanvas}
        onUncrop={handleUncrop}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onCreateGroup={createGroupFromSelection}
        images={images}
        onDownloadSelectedImages={handleDownloadSelectedImages}
        isDirty={isDirty}
      />
      <main className="flex-1 h-full bg-gray-800 relative">
        <CanvasWrapper
          ref={canvasRef}
          images={images}
          groups={groups}
          selectedImageIds={selectedImageIds}
          setSelectedImageId={(id, opts) => handleSelectLayer(id!, 'image', opts)}
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
          deleteSelectedAnnotations={deleteSelectedAnnotations}
          viewTransform={viewTransform}
          setViewTransform={(transform) => setAppState(prev => ({...prev, viewTransform: typeof transform === 'function' ? transform(prev.viewTransform) : transform}))}
          selectedAnnotations={selectedAnnotations}
          setSelectedAnnotations={(updater) => setAppState(prev => ({...prev, selectedAnnotations: updater(prev.selectedAnnotations), selectedImageIds: [], selectedLayerId: null }))}
          updateAnnotation={updateSelectedAnnotationsForInteraction}
          updateMultipleAnnotationsForInteraction={updateMultipleAnnotationsForInteraction}
          selectedAnnotationObjects={selectedAnnotationObjects}
          onColorPicked={handleColorPicked}
          canvasAnnotations={canvasAnnotations}
          addCanvasAnnotation={addCanvasAnnotation}
          lastCanvasMousePosition={lastCanvasMousePosition}
          onMoveCanvasAnnotations={(delta) => {
            const selectedCanvasAnnos = new Set(selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId));
            setCanvasAnnotationsForInteraction(prevAnnos => prevAnnos.map(anno => {
                if (!selectedCanvasAnnos.has(anno.id)) return anno;
                switch (anno.type) {
                    case 'rect': case 'circle': case 'text':
                        return { ...anno, x: anno.x + delta.x, y: anno.y + delta.y };
                    case 'freehand':
                        return { ...anno, points: anno.points.map(p => ({ x: p.x + delta.x, y: p.y + delta.y })) };
                    case 'line': case 'arrow':
                        return { ...anno, start: { x: anno.start.x + delta.x, y: anno.start.y + delta.y }, end: { x: anno.end.x + delta.x, y: anno.end.y + delta.y } };
                    default: return anno;
                }
            }));
          }}
          onReparentCanvasAnnotationsToImage={reparentCanvasAnnotationsToImage}
          onReparentImageAnnotationsToCanvas={reparentImageAnnotationsToCanvas}
          reparentImageAnnotationsToImage={reparentImageAnnotationsToImage}
        />
        <LayersPanel
          images={images}
          visualLayerOrder={visualLayerOrder}
          onRenameImage={renameCanvasImage}
          onSelectLayer={handleSelectLayer}
          onCenterOnLayer={handleCenterOnLayer}
          onSelectImages={handleSelectImages}
          onDeleteImage={deleteImage}
          onReorderTopLevelLayer={reorderTopLevelLayer}
          onReorderLayer={handleReorderLayer}
          selectedAnnotations={selectedAnnotations}
          onSelectAnnotation={handleSelectAnnotation}
          groups={groups}
          onDeleteGroup={deleteGroup}
          onRenameGroup={renameGroup}
          onToggleGroupExpanded={toggleGroupExpanded}
          onAddImageToGroup={addImageToGroup}
          onUngroupImages={ungroupImages}
          canvasAnnotations={canvasAnnotations}
          onReparentCanvasAnnotationsToImage={reparentCanvasAnnotationsToImage}
          onReparentImageAnnotationsToCanvas={reparentImageAnnotationsToCanvas}
          selectedImageIds={selectedImageIds}
          selectedLayerId={selectedLayerId}
          parentImageIds={parentImageIds}
          expandedImageAnnotationIds={expandedImageAnnotationIds}
          onToggleImageAnnotationsExpanded={toggleImageAnnotationsExpanded}
          onReparentGroup={reparentGroup}
          onRenameGroupLabel={renameGroupLabel}
          onToggleGroupLabel={toggleGroupLabel}
          onReverseLayerOrder={handleReverseLayerOrder}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
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
