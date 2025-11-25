import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { CanvasImage, Group, Annotation, Rect, Point, AspectRatio, AnnotationTool, AnnotationSelection, TextAnnotation, RectAnnotation, CircleAnnotation } from './types';
import { CanvasWrapper } from './components/CanvasWrapper';
import { LeftSidebar } from './components/LeftSidebar';
import { LayersPanel } from './components/LayersPanel';
import { MiniMap } from './components/MiniMap';
import { FloatingAnnotationEditor } from './components/FloatingAnnotationEditor';
import { readImageFile, downloadDataUrl } from './utils/fileUtils';
import { getImagesBounds, transformGlobalToLocal, transformLocalToGlobal, rectIntersect, getAnnotationBounds, drawAnnotation } from './utils/canvasUtils';

interface AppState {
    images: CanvasImage[];
    groups: Group[];
    canvasAnnotations: Annotation[];
    selectedImageIds: string[];
    selectedGroupIds: string[];
    selectedAnnotations: AnnotationSelection[];
    selectedLayerId: string | null;
}

const App: React.FC = () => {
    // State
    const [images, setImages] = useState<CanvasImage[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [canvasAnnotations, setCanvasAnnotations] = useState<Annotation[]>([]);
    const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [selectedAnnotations, setSelectedAnnotations] = useState<AnnotationSelection[]>([]);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [cropArea, setCropArea] = useState<Rect | null>(null);
    const [viewTransform, setViewTransform] = useState<{ scale: number; offset: Point }>({ scale: 1, offset: { x: 0, y: 0 } });
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
    const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
    const [toolOptions, setToolOptions] = useState({
        color: '#ff0000',
        strokeWidth: 2,
        fontSize: 16,
        fontFamily: 'Arial',
        backgroundColor: '#000000',
        backgroundOpacity: 0,
        strokeColor: '#000000',
        strokeOpacity: 1,
        fillColor: 'transparent',
        fillOpacity: 0,
        outlineColor: '#000000',
        outlineWidth: 0,
        outlineOpacity: 1
    });
    const [archivedImages, setArchivedImages] = useState<Record<string, CanvasImage>>({});
    const [clipboard, setClipboard] = useState<{ selections: AnnotationSelection[] } | null>(null);
    const [history, setHistory] = useState<AppState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
    const [expandedImageAnnotationIds, setExpandedImageAnnotationIds] = useState<string[]>([]);
    const [isLocked, setIsLocked] = useState(false);

    const lastCanvasMousePosition = useRef<Point>({ x: 0, y: 0 });
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appStateRef = useRef<AppState>({
        images: [],
        groups: [],
        canvasAnnotations: [],
        selectedImageIds: [],
        selectedGroupIds: [],
        selectedAnnotations: [],
        selectedLayerId: null
    });
    appStateRef.current = { images, groups, canvasAnnotations, selectedImageIds, selectedGroupIds, selectedAnnotations, selectedLayerId };

    // Helpers
    const pushHistory = useCallback((newState: Partial<AppState>) => {
        const current = appStateRef.current!;
        const next = { ...current, ...newState };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(next);
        if(newHistory.length > 20) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        if (newState.images) setImages(newState.images);
        if (newState.groups) setGroups(newState.groups);
        if (newState.canvasAnnotations) setCanvasAnnotations(newState.canvasAnnotations);
        if (newState.selectedImageIds) setSelectedImageIds(newState.selectedImageIds);
        if (newState.selectedGroupIds) setSelectedGroupIds(newState.selectedGroupIds);
        if (newState.selectedAnnotations) setSelectedAnnotations(newState.selectedAnnotations);
        if (newState.selectedLayerId !== undefined) setSelectedLayerId(newState.selectedLayerId);
    }, [history, historyIndex]);

    const setAppState = useCallback((updater: (prev: AppState) => Partial<AppState>) => {
        const current = appStateRef.current!;
        const updates = updater(current);
        if (updates.selectedImageIds !== undefined) setSelectedImageIds(updates.selectedImageIds);
        if (updates.selectedGroupIds !== undefined) setSelectedGroupIds(updates.selectedGroupIds);
        if (updates.selectedAnnotations !== undefined) setSelectedAnnotations(updates.selectedAnnotations);
        if (updates.selectedLayerId !== undefined) setSelectedLayerId(updates.selectedLayerId);
        if (updates.images !== undefined) setImages(updates.images);
        if (updates.groups !== undefined) setGroups(updates.groups);
        if (updates.canvasAnnotations !== undefined) setCanvasAnnotations(updates.canvasAnnotations);
    }, []);

    const resetLastArrangement = useCallback(() => {}, []);
    
    // Layer Manipulation Handlers
    const reorderLayers = useCallback((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
        const allImages = [...images];
        const draggedImageIndex = allImages.findIndex(i => i.id === draggedId);
        
        if (draggedImageIndex !== -1) {
            // Moving an image
            const [draggedImage] = allImages.splice(draggedImageIndex, 1);
            
            if (position === 'inside') {
                const targetGroup = groups.find(g => g.id === targetId);
                if (targetGroup) {
                    const newGroups = groups.map(g => g.id === targetId ? { ...g, imageIds: [...g.imageIds, draggedId] } : g);
                    setGroups(newGroups); 
                    allImages.push(draggedImage);
                    pushHistory({ images: allImages, groups: newGroups });
                }
                return;
            }

            const targetImageIndex = allImages.findIndex(i => i.id === targetId);
            if (targetImageIndex !== -1) {
                if (position === 'before') {
                    allImages.splice(targetImageIndex + 1, 0, draggedImage);
                } else {
                    allImages.splice(targetImageIndex, 0, draggedImage);
                }
                pushHistory({ images: allImages });
            }
        }
    }, [images, groups, pushHistory]);

    const toggleLayerVisibility = useCallback((id: string, type: 'image' | 'group') => {
        if (type === 'image') {
            const newImages = images.map(img => img.id === id ? { ...img, visible: img.visible === undefined ? false : !img.visible } : img);
            setImages(newImages); 
        } else {
            const newGroups = groups.map(g => g.id === id ? { ...g, visible: g.visible === undefined ? false : !g.visible } : g);
            setGroups(newGroups);
        }
    }, [images, groups]);

    const toggleLayerLock = useCallback((id: string, type: 'image' | 'group') => {
        if (type === 'image') {
            const newImages = images.map(img => img.id === id ? { ...img, locked: img.locked === undefined ? true : !img.locked } : img);
            setImages(newImages);
        } else {
            const newGroups = groups.map(g => g.id === id ? { ...g, locked: g.locked === undefined ? true : !g.locked } : g);
            setGroups(newGroups);
        }
    }, [images, groups]);

    const duplicateLayer = useCallback(() => {
        if (selectedLayerId) {
            // Duplicating a specific layer (Image or Group)
            const imageToDup = images.find(i => i.id === selectedLayerId);
            const groupToDup = groups.find(g => g.id === selectedLayerId);

            if (imageToDup) {
                const newImage = { ...imageToDup, id: `img-${Date.now()}-${Math.random()}`, name: `${imageToDup.name} Copy`, x: imageToDup.x + 10, y: imageToDup.y + 10 };
                newImage.annotations = newImage.annotations.map(a => ({ ...a, id: `anno-${Date.now()}-${Math.random()}` }));
                
                let newImages = [...images];
                const index = newImages.findIndex(i => i.id === imageToDup.id);
                newImages.splice(index + 1, 0, newImage); // Insert after

                let newGroups = [...groups];
                // Check if original was in a group
                newGroups = newGroups.map(g => {
                    if (g.imageIds.includes(imageToDup.id)) {
                        return { ...g, imageIds: [...g.imageIds, newImage.id] };
                    }
                    return g;
                });

                pushHistory({ images: newImages, groups: newGroups, selectedImageIds: [newImage.id], selectedLayerId: newImage.id });
            } else if (groupToDup) {
               // Simplified group duplication: Create new group, copy direct children images.
               // Does not support deep nested groups yet for simplicity.
               const newGroupId = `group-${Date.now()}-${Math.random()}`;
               const newImages = [...images];
               const newChildIds: string[] = [];

               groupToDup.imageIds.forEach(childId => {
                   const originalImg = images.find(i => i.id === childId);
                   if (originalImg) {
                       const newImg = { ...originalImg, id: `img-${Date.now()}-${Math.random()}`, name: `${originalImg.name} Copy`, x: originalImg.x + 10, y: originalImg.y + 10 };
                       newImg.annotations = newImg.annotations.map(a => ({...a, id: `anno-${Date.now()}-${Math.random()}`}));
                       newImages.push(newImg); // Add to top
                       newChildIds.push(newImg.id);
                   }
               });

               const newGroup: Group = {
                   ...groupToDup,
                   id: newGroupId,
                   name: `${groupToDup.name} Copy`,
                   imageIds: newChildIds,
                   groupIds: [] // Not deep copying nested groups for now
               };

               pushHistory({ images: newImages, groups: [...groups, newGroup], selectedLayerId: newGroupId });
            }
        } else if (selectedAnnotations.length > 0) {
             // Reuse clipboard copy/paste logic essentially
             const newSelections: AnnotationSelection[] = [];
             const canvasAnnosToAdd: Annotation[] = [];
             let newImages = [...images];

             selectedAnnotations.forEach(sel => {
                 let anno: Annotation | undefined;
                 let sourceImageId: string | null = sel.imageId;
                 
                 if (sel.imageId) {
                     const img = newImages.find(i => i.id === sel.imageId);
                     anno = img?.annotations.find(a => a.id === sel.annotationId);
                 } else {
                     anno = canvasAnnotations.find(a => a.id === sel.annotationId);
                 }
                 
                 if (anno) {
                     const newAnno: any = { ...anno, id: `anno-${Date.now()}-${Math.random()}` };
                     if ('x' in newAnno) { newAnno.x += 20; newAnno.y += 20; }
                     else if ('points' in newAnno) { newAnno.points = newAnno.points.map((p: Point) => ({ x: p.x + 20, y: p.y + 20 })); }
                     else if ('start' in newAnno) { 
                         newAnno.start = { x: newAnno.start.x + 20, y: newAnno.start.y + 20 }; 
                         newAnno.end = { x: newAnno.end.x + 20, y: newAnno.end.y + 20 }; 
                     }

                     if (sourceImageId && newImages.some(i => i.id === sourceImageId)) {
                         newImages = newImages.map(i => i.id === sourceImageId ? { ...i, annotations: [...i.annotations, newAnno as Annotation] } : i);
                         newSelections.push({ imageId: sourceImageId, annotationId: newAnno.id });
                     } else {
                         canvasAnnosToAdd.push(newAnno as Annotation);
                         newSelections.push({ imageId: null, annotationId: newAnno.id });
                     }
                 }
             });
             
             setSelectedAnnotations(newSelections);
             pushHistory({ images: newImages, canvasAnnotations: [...canvasAnnotations, ...canvasAnnosToAdd] });
        }
    }, [selectedLayerId, images, groups, selectedAnnotations, canvasAnnotations, pushHistory]);

    const renderAndDownload = useCallback(async (
        itemsToDraw: CanvasImage[], 
        canvasAnnosToDraw: Annotation[], 
        specificBounds: Rect | null,
        filename: string
    ) => {
        let bounds = specificBounds;
        
        if (!bounds) {
            bounds = getImagesBounds(itemsToDraw);
            // Expand with canvas annotations
            const tempCtx = document.createElement('canvas').getContext('2d');
            if (tempCtx) {
                 canvasAnnosToDraw.forEach(anno => {
                    const b = getAnnotationBounds(anno, tempCtx);
                    if (!bounds) bounds = b;
                    else {
                        const minX = Math.min(bounds.x, b.x);
                        const minY = Math.min(bounds.y, b.y);
                        const maxX = Math.max(bounds.x + bounds.width, b.x + b.width);
                        const maxY = Math.max(bounds.y + bounds.height, b.y + b.height);
                        bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                    }
                 });
            }
        }
        
        if (!bounds) return;

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = bounds.width;
        offscreenCanvas.height = bounds.height;
        const ctx = offscreenCanvas.getContext('2d');
        if (!ctx) return;
        
        // Draw Background
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, bounds.width, bounds.height);
        
        ctx.save();
        ctx.translate(-bounds.x, -bounds.y);

        // Draw Images
        itemsToDraw.forEach(image => {
            if (image.visible === false) return;
            ctx.save();
            const centerX = image.x + (image.width * image.scale) / 2;
            const centerY = image.y + (image.height * image.scale) / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(image.rotation * Math.PI / 180);
            ctx.scale(image.scale, image.scale);
            
            const sx = image.cropRect ? image.cropRect.x : 0;
            const sy = image.cropRect ? image.cropRect.y : 0;
            const sWidth = image.cropRect ? image.cropRect.width : image.originalWidth;
            const sHeight = image.cropRect ? image.cropRect.height : image.originalHeight;
            
            ctx.drawImage(image.element, sx, sy, sWidth, sHeight, -image.width / 2, -image.height / 2, image.width, image.height);
    
            ctx.translate(-image.width / 2, -image.height / 2);
            image.annotations.forEach(anno => drawAnnotation(ctx, anno));
    
            ctx.restore();
        });
        
        // Draw Canvas Annotations
        canvasAnnosToDraw.forEach(anno => drawAnnotation(ctx, anno));
        ctx.restore();

        const dataUrl = offscreenCanvas.toDataURL(exportFormat === 'png' ? 'image/png' : 'image/jpeg');
        downloadDataUrl(dataUrl, filename);

    }, [exportFormat]);

    const handleCopyToClipboard = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
    
        let bounds: Rect | null = null;
        let itemsToDraw: CanvasImage[] = [];
        let canvasAnnosToDraw: Annotation[] = [];
    
        if (cropArea) {
            const normalizedCrop = {
                x: cropArea.width < 0 ? cropArea.x + cropArea.width : cropArea.x,
                y: cropArea.height < 0 ? cropArea.y + cropArea.height : cropArea.y,
                width: Math.abs(cropArea.width),
                height: Math.abs(cropArea.height),
            };
            bounds = normalizedCrop;
            itemsToDraw = images.filter(img => {
                if (img.visible === false) return false;
                const imgRect = { x: img.x, y: img.y, width: img.width * img.scale, height: img.height * img.scale };
                return rectIntersect(normalizedCrop, imgRect);
            });
            const tempCtx = document.createElement('canvas').getContext('2d');
            if (tempCtx) {
                canvasAnnosToDraw = canvasAnnotations.filter(anno => {
                    const annoBounds = getAnnotationBounds(anno, tempCtx);
                    return rectIntersect(normalizedCrop, annoBounds);
                });
            }
        } else if (selectedImageIds.length > 0) {
            itemsToDraw = images.filter(img => selectedImageIds.includes(img.id) && img.visible !== false);
            bounds = getImagesBounds(itemsToDraw);
        }
        
        if (!bounds || (itemsToDraw.length === 0 && canvasAnnosToDraw.length === 0)) return;
    
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = bounds.width;
        offscreenCanvas.height = bounds.height;
        const ctx = offscreenCanvas.getContext('2d');
        if (!ctx) return;
        
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, bounds.width, bounds.height);
        
        ctx.save();
        ctx.translate(-bounds.x, -bounds.y);
    
        if (cropArea) {
            ctx.beginPath();
            ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.clip();
        }

        itemsToDraw.forEach(image => {
            ctx.save();
            const centerX = image.x + (image.width * image.scale) / 2;
            const centerY = image.y + (image.height * image.scale) / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(image.rotation * Math.PI / 180);
            ctx.scale(image.scale, image.scale);
            
            const sx = image.cropRect ? image.cropRect.x : 0;
            const sy = image.cropRect ? image.cropRect.y : 0;
            const sWidth = image.cropRect ? image.cropRect.width : image.originalWidth;
            const sHeight = image.cropRect ? image.cropRect.height : image.originalHeight;
            
            ctx.drawImage(image.element, sx, sy, sWidth, sHeight, -image.width / 2, -image.height / 2, image.width, image.height);
    
            ctx.translate(-image.width / 2, -image.height / 2);
            image.annotations.forEach(anno => drawAnnotation(ctx, anno));
    
            ctx.restore();
        });
    
        canvasAnnosToDraw.forEach(anno => drawAnnotation(ctx, anno));
    
        ctx.restore();
    
        offscreenCanvas.toBlob(async (blob) => {
            if (blob) {
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                } catch (err) {
                    console.error('Failed to copy image to clipboard:', err);
                }
            }
        }, 'image/png');
    }, [cropArea, selectedImageIds, images, canvasAnnotations]);
    
    const handleUndo = useCallback(() => {
        if (historyIndex > 0) {
            const prevState = history[historyIndex - 1];
            setImages(prevState.images);
            setGroups(prevState.groups);
            setCanvasAnnotations(prevState.canvasAnnotations);
            setSelectedImageIds(prevState.selectedImageIds);
            setSelectedGroupIds(prevState.selectedGroupIds);
            setSelectedAnnotations(prevState.selectedAnnotations);
            setSelectedLayerId(prevState.selectedLayerId);
            setHistoryIndex(historyIndex - 1);
        }
    }, [history, historyIndex]);
    
    const handleRedo = useCallback(() => {
         if (historyIndex < history.length - 1) {
            const nextState = history[historyIndex + 1];
            setImages(nextState.images);
            setGroups(nextState.groups);
            setCanvasAnnotations(nextState.canvasAnnotations);
            setSelectedImageIds(nextState.selectedImageIds);
            setSelectedGroupIds(nextState.selectedGroupIds);
            setSelectedAnnotations(nextState.selectedAnnotations);
            setSelectedLayerId(nextState.selectedLayerId);
            setHistoryIndex(historyIndex + 1);
        }
    }, [history, historyIndex]);

    const deleteGroup = useCallback((id: string) => {
        const newGroups = groups.filter(g => g.id !== id);
        pushHistory({ groups: newGroups });
        setSelectedLayerId(null);
    }, [groups, pushHistory]);

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

        pushHistory({ images: newImages });
        setAppState(prev => {
          const remaining = prev.selectedImageIds.filter(id => !idsToUncrop.has(id));
          return { ...prev, selectedImageIds: [...remaining, ...newSelection] };
        });
    }, [pushHistory, images, archivedImages, setAppState]);

    const updateSelectedImages = useCallback((changes: Partial<Omit<CanvasImage, 'id' | 'annotations' | 'createdAt' | 'name' | 'element' | 'width' | 'height'>>) => {
      resetLastArrangement();
      const newImages = images.map(img => selectedImageIds.includes(img.id) ? { ...img, ...changes } : img);
      pushHistory({ images: newImages });
    }, [pushHistory, images, selectedImageIds, resetLastArrangement]);
  
    const renameCanvasImage = useCallback((id: string, newName: string) => {
      const newImages = images.map(img => img.id === id ? { ...img, name: newName } : img);
      pushHistory({ images: newImages });
    }, [pushHistory, images]);
    
    const deleteImage = useCallback((id: string) => {
      const newImages = images.filter(img => img.id !== id);
      const newGroups = groups.map(g => ({ ...g, imageIds: g.imageIds.filter(imgId => imgId !== id) })).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);
      pushHistory({ images: newImages, groups: newGroups, selectedImageIds: selectedImageIds.filter(selId => selId !== id), selectedLayerId: null });
    }, [pushHistory, images, groups, selectedImageIds]);
  
    const deleteSelectedImages = useCallback(() => {
      if (selectedImageIds.length === 0) return;
      const newImages = images.filter(img => !selectedImageIds.includes(img.id));
      const newGroups = groups.map(g => ({ ...g, imageIds: g.imageIds.filter(id => !selectedImageIds.includes(id)) })).filter(g => g.imageIds.length > 0 || g.groupIds.length > 0);
      
      pushHistory({ images: newImages, groups: newGroups, selectedImageIds: [], selectedLayerId: null });
    }, [pushHistory, images, groups, selectedImageIds]);

    const deleteSelectedGroups = useCallback(() => {
        if (selectedGroupIds.length === 0) return;
        const newGroups = groups.filter(g => !selectedGroupIds.includes(g.id));
        pushHistory({ groups: newGroups, selectedGroupIds: [], selectedLayerId: null });
    }, [pushHistory, groups, selectedGroupIds]);
  
    const addAnnotation = useCallback((imageId: string, annotation: Annotation) => {
      const newImages = images.map(img => {
        if (img.id === imageId) {
          return { ...img, annotations: [...img.annotations, annotation] };
        }
        return img;
      });
      pushHistory({ images: newImages });
    }, [pushHistory, images]);

    const addCanvasAnnotation = useCallback((annotation: Annotation) => {
        const newAnnotations = [...canvasAnnotations, annotation];
        pushHistory({ canvasAnnotations: newAnnotations });
    }, [pushHistory, canvasAnnotations]);

    const updateSelectedAnnotations = useCallback((changes: Partial<Annotation>) => {
         const newImages = images.map(img => ({
             ...img,
             annotations: img.annotations.map(anno => 
                 selectedAnnotations.some(s => s.imageId === img.id && s.annotationId === anno.id) 
                 ? { ...anno, ...changes } as Annotation
                 : anno
             )
         }));
         const newCanvasAnnotations = canvasAnnotations.map(anno => 
             selectedAnnotations.some(s => s.imageId === null && s.annotationId === anno.id)
             ? { ...anno, ...changes } as Annotation
             : anno
         );
         pushHistory({ images: newImages, canvasAnnotations: newCanvasAnnotations });
    }, [images, canvasAnnotations, selectedAnnotations, pushHistory]);
  
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
  
      pushHistory({ images: newImages, canvasAnnotations: newCanvasAnnotations, selectedAnnotations: [] });
    }, [pushHistory, images, canvasAnnotations, selectedAnnotations]);

    const handleApplyCrop = useCallback(() => {
        if (!cropArea) return;

        const newArchived = { ...archivedImages };
        let hasChanges = false;

        const newImages = images.map(img => {
             if (img.visible === false || img.locked) return img;

             const p1 = transformGlobalToLocal({x: cropArea.x, y: cropArea.y}, img);
             const p2 = transformGlobalToLocal({x: cropArea.x + cropArea.width, y: cropArea.y}, img);
             const p3 = transformGlobalToLocal({x: cropArea.x, y: cropArea.y + cropArea.height}, img);
             const p4 = transformGlobalToLocal({x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height}, img);

             const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
             const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
             const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
             const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

             const imgW = img.width;
             const imgH = img.height;

             const cropX = Math.max(0, minX);
             const cropY = Math.max(0, minY);
             const cropR = Math.min(imgW, maxX);
             const cropB = Math.min(imgH, maxY);

             if (cropX >= cropR || cropY >= cropB) {
                 return img;
             }
             
             hasChanges = true;

             if (!newArchived[img.id]) {
                 newArchived[img.id] = { ...img };
             }

             const newWidth = cropR - cropX;
             const newHeight = cropB - cropY;

             const cropCenterX = cropX + newWidth / 2;
             const cropCenterY = cropY + newHeight / 2;
             const newGlobalCenter = transformLocalToGlobal({ x: cropCenterX, y: cropCenterY }, img);

             const newX = newGlobalCenter.x - (newWidth * img.scale) / 2;
             const newY = newGlobalCenter.y - (newHeight * img.scale) / 2;

             // Adjust Annotations: Shift them by crop offset
             const newAnnotations = img.annotations.map(anno => {
                 const newAnno = { ...anno };
                 if (newAnno.type === 'arrow' || newAnno.type === 'line') {
                     newAnno.start = { x: newAnno.start.x - cropX, y: newAnno.start.y - cropY };
                     newAnno.end = { x: newAnno.end.x - cropX, y: newAnno.end.y - cropY };
                 } else if (newAnno.type === 'freehand') {
                     newAnno.points = newAnno.points.map(p => ({ x: p.x - cropX, y: p.y - cropY }));
                 } else {
                     newAnno.x -= cropX;
                     newAnno.y -= cropY;
                 }
                 return newAnno;
             });

             return {
                 ...img,
                 width: newWidth,
                 height: newHeight,
                 x: newX,
                 y: newY,
                 annotations: newAnnotations,
                 cropRect: {
                     x: (img.cropRect?.x ?? 0) + cropX,
                     y: (img.cropRect?.y ?? 0) + cropY,
                     width: newWidth,
                     height: newHeight
                 },
                 uncroppedFromId: img.uncroppedFromId || img.id
             };
        });

        if (hasChanges) {
            setArchivedImages(newArchived);
            pushHistory({ images: newImages });
        }
        
        setCropArea(null);
        setActiveTool('select');
    }, [cropArea, images, archivedImages, pushHistory]);

    const onReparentCanvasAnnotationsToImage = useCallback((annotationIds: string[], targetImageId: string) => {
        const targetImage = images.find(i => i.id === targetImageId);
        if (!targetImage) return;

        const annosToMove = canvasAnnotations.filter(a => annotationIds.includes(a.id));
        if (annosToMove.length === 0) return;

        const transformedAnnos = annosToMove.map(anno => {
            const newAnno: any = { ...anno };
            const toLocal = (p: Point) => transformGlobalToLocal(p, targetImage);

            if (newAnno.type === 'arrow' || newAnno.type === 'line') {
                newAnno.start = toLocal(newAnno.start);
                newAnno.end = toLocal(newAnno.end);
            } else if (newAnno.type === 'freehand') {
                newAnno.points = newAnno.points.map(toLocal);
            } else {
                const p = toLocal({ x: newAnno.x, y: newAnno.y });
                newAnno.x = p.x;
                newAnno.y = p.y;
                if ('radius' in newAnno) newAnno.radius /= targetImage.scale;
                if ('fontSize' in newAnno) newAnno.fontSize /= targetImage.scale;
                if ('width' in newAnno) {
                    newAnno.width /= targetImage.scale;
                    newAnno.height /= targetImage.scale;
                }
            }
            newAnno.rotation -= targetImage.rotation;
            newAnno.scale /= targetImage.scale;
            return newAnno as Annotation;
        });

        const newImages = images.map(img => img.id === targetImageId ? { ...img, annotations: [...img.annotations, ...transformedAnnos] } : img);
        const newCanvasAnnos = canvasAnnotations.filter(a => !annotationIds.includes(a.id));
        pushHistory({ images: newImages, canvasAnnotations: newCanvasAnnos });
    }, [images, canvasAnnotations, pushHistory]);

    const onReparentImageAnnotationsToCanvas = useCallback((selections: { annotationId: string; imageId: string }[]) => {
        const newCanvasAnnos = [...canvasAnnotations];
        let newImages = [...images];

        selections.forEach(sel => {
            const imgIndex = newImages.findIndex(i => i.id === sel.imageId);
            if (imgIndex === -1) return;
            const img = newImages[imgIndex];
            const anno = img.annotations.find(a => a.id === sel.annotationId);
            if (!anno) return;

            const newAnno: any = { ...anno };
            const toGlobal = (p: Point) => transformLocalToGlobal(p, img);

            if (newAnno.type === 'arrow' || newAnno.type === 'line') {
                newAnno.start = toGlobal(newAnno.start);
                newAnno.end = toGlobal(newAnno.end);
            } else if (newAnno.type === 'freehand') {
                newAnno.points = newAnno.points.map(toGlobal);
            } else {
                const p = toGlobal({ x: newAnno.x, y: newAnno.y });
                newAnno.x = p.x;
                newAnno.y = p.y;
                if ('radius' in newAnno) newAnno.radius *= img.scale;
                if ('fontSize' in newAnno) newAnno.fontSize *= img.scale;
                if ('width' in newAnno) {
                    newAnno.width *= img.scale;
                    newAnno.height *= img.scale;
                }
            }
            newAnno.rotation += img.rotation;
            newAnno.scale *= img.scale;
            
            newCanvasAnnos.push(newAnno as Annotation);
            newImages[imgIndex] = { ...img, annotations: img.annotations.filter(a => a.id !== sel.annotationId) };
        });
        pushHistory({ images: newImages, canvasAnnotations: newCanvasAnnos });
    }, [images, canvasAnnotations, pushHistory]);
    
    const reparentImageAnnotationsToImage = useCallback((annotations: Array<{ annotationId: string; imageId: string }>, newImageId: string) => {
        const targetImage = images.find(i => i.id === newImageId);
        if (!targetImage) return;
        
        let newImages = [...images];
        const movedAnnos: Annotation[] = [];

        annotations.forEach(sel => {
            const sourceImg = newImages.find(i => i.id === sel.imageId);
            if (!sourceImg) return;
            const anno = sourceImg.annotations.find(a => a.id === sel.annotationId);
            if (!anno) return;

            const toGlobal = (p: Point) => transformLocalToGlobal(p, sourceImg);
            const toTarget = (p: Point) => transformGlobalToLocal(p, targetImage);
            const transform = (p: Point) => toTarget(toGlobal(p));

            const newAnno: any = { ...anno };
             if (newAnno.type === 'arrow' || newAnno.type === 'line') {
                newAnno.start = transform(newAnno.start);
                newAnno.end = transform(newAnno.end);
            } else if (newAnno.type === 'freehand') {
                newAnno.points = newAnno.points.map(transform);
            } else {
                const p = transform({ x: newAnno.x, y: newAnno.y });
                newAnno.x = p.x;
                newAnno.y = p.y;
                const scaleFactor = sourceImg.scale / targetImage.scale;
                if ('radius' in newAnno) newAnno.radius *= scaleFactor;
                if ('fontSize' in newAnno) newAnno.fontSize *= scaleFactor;
                if ('width' in newAnno) {
                    newAnno.width *= scaleFactor;
                    newAnno.height *= scaleFactor;
                }
            }
            newAnno.rotation = (anno.rotation + sourceImg.rotation) - targetImage.rotation;
            newAnno.scale = (anno.scale * sourceImg.scale) / targetImage.scale;
            
            movedAnnos.push(newAnno as Annotation);
            newImages = newImages.map(i => i.id === sel.imageId ? { ...i, annotations: i.annotations.filter(a => a.id !== sel.annotationId) } : i);
        });

        newImages = newImages.map(i => i.id === newImageId ? { ...i, annotations: [...i.annotations, ...movedAnnos] } : i);
        pushHistory({ images: newImages });
    }, [images, pushHistory]);

    const handlePaste = useCallback(async (e: ClipboardEvent) => {
        // 1. Handle Images (Files or Items)
        if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const newImages: CanvasImage[] = [];
            const viewportCenter = {
                 x: (window.innerWidth / 2 - viewTransform.offset.x) / viewTransform.scale,
                 y: (window.innerHeight / 2 - viewTransform.offset.y) / viewTransform.scale
            };

            for (let i = 0; i < e.clipboardData.files.length; i++) {
                const file = e.clipboardData.files[i];
                if (file.type.startsWith('image/')) {
                    try {
                        const img = await readImageFile(file);
                        img.x = viewportCenter.x - img.width / 2 + (i * 20);
                        img.y = viewportCenter.y - img.height / 2 + (i * 20);
                        newImages.push(img);
                    } catch (err) { console.error(err); }
                }
            }
            if (newImages.length > 0) {
                pushHistory({ images: [...images, ...newImages] });
            }
            return;
        } else if (e.clipboardData?.items) {
             const items = e.clipboardData.items;
             const newImages: CanvasImage[] = [];
             const viewportCenter = {
                 x: (window.innerWidth / 2 - viewTransform.offset.x) / viewTransform.scale,
                 y: (window.innerHeight / 2 - viewTransform.offset.y) / viewTransform.scale
             };
             
             let hasImage = false;
             for (let i = 0; i < items.length; i++) {
                 if (items[i].type.indexOf('image') !== -1) {
                     const blob = items[i].getAsFile();
                     if (blob) {
                         hasImage = true;
                         try {
                            const img = await readImageFile(blob);
                            img.x = viewportCenter.x - img.width / 2;
                            img.y = viewportCenter.y - img.height / 2;
                            newImages.push(img);
                         } catch(err) { console.error(err); }
                     }
                 }
             }
             if (hasImage && newImages.length > 0) {
                 e.preventDefault();
                 pushHistory({ images: [...images, ...newImages] });
                 return;
             }
        }

        // 2. Handle Annotations
        const text = e.clipboardData?.getData('text');
        if (text === "app-annotation-copy" && clipboard) {
             e.preventDefault();
             const newSelections: AnnotationSelection[] = [];
             const canvasAnnosToAdd: Annotation[] = [];
             let newImages = [...images];

             clipboard.selections.forEach(sel => {
                 let anno: Annotation | undefined;
                 let sourceImageId: string | null = sel.imageId;
                 
                 if (sel.imageId) {
                     const img = newImages.find(i => i.id === sel.imageId);
                     anno = img?.annotations.find(a => a.id === sel.annotationId);
                 } else {
                     anno = canvasAnnotations.find(a => a.id === sel.annotationId);
                 }
                 
                 if (anno) {
                     const newAnno: any = { ...anno, id: `anno-${Date.now()}-${Math.random()}` };
                     // Offset slightly
                     if ('x' in newAnno) { newAnno.x += 20; newAnno.y += 20; }
                     else if ('points' in newAnno) { newAnno.points = newAnno.points.map((p: Point) => ({ x: p.x + 20, y: p.y + 20 })); }
                     else if ('start' in newAnno) { 
                         newAnno.start = { x: newAnno.start.x + 20, y: newAnno.start.y + 20 }; 
                         newAnno.end = { x: newAnno.end.x + 20, y: newAnno.end.y + 20 }; 
                     }

                     if (sourceImageId && newImages.some(i => i.id === sourceImageId)) {
                         newImages = newImages.map(i => i.id === sourceImageId ? { ...i, annotations: [...i.annotations, newAnno as Annotation] } : i);
                         newSelections.push({ imageId: sourceImageId, annotationId: newAnno.id });
                     } else {
                         canvasAnnosToAdd.push(newAnno as Annotation);
                         newSelections.push({ imageId: null, annotationId: newAnno.id });
                     }
                 }
             });
             
             setSelectedAnnotations(newSelections);
             pushHistory({ images: newImages, canvasAnnotations: [...canvasAnnotations, ...canvasAnnosToAdd] });
        }
    }, [clipboard, images, canvasAnnotations, viewTransform, pushHistory]);

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handlePaste]);
  
    // Add global key listener hook
    useEffect(() => {
      const handleKeyDown = async (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
  
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Prioritize deleting annotations if any are selected
            if (selectedAnnotations.length > 0) {
                e.preventDefault();
                deleteSelectedAnnotations();
            } else if (selectedImageIds.length > 0) {
                e.preventDefault();
                deleteSelectedImages();
            } else if (selectedGroupIds.length > 0) {
                e.preventDefault();
                deleteSelectedGroups();
            } else if (selectedLayerId && groups.some(g => g.id === selectedLayerId)) {
                e.preventDefault();
                deleteGroup(selectedLayerId);
            }
        }

        if (e.key === 'Enter' && cropArea) {
            e.preventDefault();
            handleApplyCrop();
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedImageIds.length > 0 || cropArea) {
               handleCopyToClipboard();
            } else if (selectedAnnotations.length > 0) {
               setClipboard({ selections: selectedAnnotations });
               navigator.clipboard.writeText("app-annotation-copy"); 
            }
        }
  
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) handleRedo();
            else handleUndo();
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            handleRedo();
        }
        
        if (e.key.toLowerCase() === 's') setActiveTool('select');
        if (e.key.toLowerCase() === 'i') setActiveTool('eyedropper');
      };
  
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImageIds, selectedAnnotations, selectedLayerId, selectedGroupIds, groups, deleteSelectedImages, deleteSelectedAnnotations, deleteGroup, deleteSelectedGroups, handleCopyToClipboard, handleUndo, handleRedo, cropArea, setActiveTool, handleApplyCrop]);

    // Derived props for components
    const selectedAnnotationObjects = useMemo(() => {
        const objects: Annotation[] = [];
        selectedAnnotations.forEach(sel => {
            if (sel.imageId) {
                const img = images.find(i => i.id === sel.imageId);
                const anno = img?.annotations.find(a => a.id === sel.annotationId);
                if (anno) objects.push(anno);
            } else {
                const anno = canvasAnnotations.find(a => a.id === sel.annotationId);
                if (anno) objects.push(anno);
            }
        });
        return objects;
    }, [selectedAnnotations, images, canvasAnnotations]);

    const visualLayerOrder = useMemo(() => {
        const imageIdToParent = new Map<string, string>();
        const groupIdToParent = new Map<string, string>();
        groups.forEach(g => {
            g.imageIds.forEach(id => imageIdToParent.set(id, g.id));
            g.groupIds.forEach(id => groupIdToParent.set(id, g.id));
        });
        
        const itemsWithIndices: { item: (CanvasImage | Group), index: number }[] = [];
        images.forEach((img, index) => {
            if (!imageIdToParent.has(img.id)) {
                itemsWithIndices.push({ item: img, index });
            }
        });
        groups.forEach((group, index) => {
            if (!groupIdToParent.has(group.id)) {
                itemsWithIndices.push({ item: group, index: images.length + groups.length + index });
            }
        });
        
        itemsWithIndices.sort((a, b) => a.index - b.index);
    
        return itemsWithIndices.map(i => i.item);
    }, [groups, images]);

    // IMPLEMENTATION OF MISSING HANDLERS

    const handleFileChange = useCallback(async (files: FileList | null) => {
        if (!files) return;
        const newImages: CanvasImage[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const img = await readImageFile(file);
                 // Center image in view
                 const viewportCenter = {
                     x: (window.innerWidth / 2 - viewTransform.offset.x) / viewTransform.scale,
                     y: (window.innerHeight / 2 - viewTransform.offset.y) / viewTransform.scale
                 };
                 img.x = viewportCenter.x - img.width / 2;
                 img.y = viewportCenter.y - img.height / 2;
                newImages.push(img);
            } catch (e) {
                console.error(e);
            }
        }
        if (newImages.length > 0) {
             pushHistory({ images: [...images, ...newImages] });
        }
    }, [images, viewTransform, pushHistory]);

    const onBoxSelect = useCallback((ids: string[], annos: AnnotationSelection[], opts: { shiftKey: boolean, ctrlKey: boolean }) => {
         if (opts.ctrlKey) {
             // Subtract Selection
             setSelectedImageIds(prev => prev.filter(id => !ids.includes(id)));
             setSelectedAnnotations(prev => prev.filter(a => !annos.some(na => na.annotationId === a.annotationId && na.imageId === a.imageId)));
         } else if (opts.shiftKey) {
             // Union Selection
             setSelectedImageIds(prev => Array.from(new Set([...prev, ...ids])));
             setSelectedAnnotations(prev => {
                 const currentIds = new Set(prev.map(a => a.annotationId));
                 return [...prev, ...annos.filter(a => !currentIds.has(a.annotationId))];
             });
         } else {
             // Replace Selection
             setSelectedImageIds(ids);
             setSelectedAnnotations(annos);
         }
    }, []);

    const fullFlatLayerList = useMemo(() => {
        const list: { id: string; type: 'canvas-annotation' | 'image' | 'group' | 'image-annotation'; imageId?: string | null }[] = [];
        
        [...canvasAnnotations].reverse().forEach(anno => {
            list.push({ id: anno.id, type: 'canvas-annotation', imageId: null });
        });

        const topLevelRenderOrder = [...visualLayerOrder].reverse();

        function processGroup(group: Group) {
            list.push({ id: group.id, type: 'group' });
            if (group.isExpanded) {
                const childGroups = group.groupIds.map(id => groups.find(g => g.id === id)).filter(Boolean) as Group[];
                const childImages = group.imageIds.map(id => images.find(i => i.id === id)).filter(Boolean) as CanvasImage[];
                
                childGroups.forEach(processGroup);
                childImages.forEach(processImage);
            }
        }

        function processImage(image: CanvasImage) {
            list.push({ id: image.id, type: 'image' });
            if (expandedImageAnnotationIds.includes(image.id)) {
                image.annotations.forEach(anno => {
                    list.push({ id: anno.id, type: 'image-annotation', imageId: image.id });
                });
            }
        }
        
        topLevelRenderOrder.forEach(item => {
            if ('imageIds' in item) { // is Group
                processGroup(item);
            } else { // is Image
                processImage(item as CanvasImage);
            }
        });

        return list;
    }, [canvasAnnotations, visualLayerOrder, groups, images, expandedImageAnnotationIds]);


    const handleSelectLayerItem = useCallback((id: string, type: 'image' | 'group' | 'canvas-annotation' | 'image-annotation', opts: { shiftKey: boolean, ctrlKey: boolean }, imageIdForAnnotation?: string | null) => {
        if (opts.shiftKey && selectedLayerId) {
            const anchorIndex = fullFlatLayerList.findIndex(item => item.id === selectedLayerId);
            const currentIndex = fullFlatLayerList.findIndex(item => item.id === id && (item.type !== 'image-annotation' || item.imageId === imageIdForAnnotation));

            if (anchorIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(anchorIndex, currentIndex);
                const end = Math.max(anchorIndex, currentIndex);
                const range = fullFlatLayerList.slice(start, end + 1);

                let newSelectedImageIds = opts.ctrlKey ? [...selectedImageIds] : [];
                let newSelectedGroupIds = opts.ctrlKey ? [...selectedGroupIds] : [];
                let newSelectedAnnotations = opts.ctrlKey ? [...selectedAnnotations] : [];

                range.forEach(item => {
                    if (item.type === 'image') newSelectedImageIds.push(item.id);
                    else if (item.type === 'group') newSelectedGroupIds.push(item.id);
                    else if (item.type === 'canvas-annotation') newSelectedAnnotations.push({ imageId: null, annotationId: item.id });
                    else if (item.type === 'image-annotation') newSelectedAnnotations.push({ imageId: item.imageId || null, annotationId: item.id });
                });

                setSelectedImageIds(Array.from(new Set(newSelectedImageIds)));
                setSelectedGroupIds(Array.from(new Set(newSelectedGroupIds)));
                setSelectedAnnotations(Array.from(new Map(newSelectedAnnotations.map(item => [`${item.imageId}-${item.annotationId}`, item])).values()));
                return;
            }
        }
        
        let newSelectedImageIds = selectedImageIds;
        let newSelectedGroupIds = selectedGroupIds;
        let newSelectedAnnotations = selectedAnnotations;

        if (!opts.ctrlKey && !opts.shiftKey) { // Single click resets all
            newSelectedImageIds = [];
            newSelectedGroupIds = [];
            newSelectedAnnotations = [];
        }

        const toggle = (arr: any[], val: any) => arr.includes(val) ? arr.filter(i => i !== val) : [...arr, val];
        const toggleAnno = (arr: AnnotationSelection[], val: AnnotationSelection) => {
            const idx = arr.findIndex(i => i.imageId === val.imageId && i.annotationId === val.annotationId);
            if (idx > -1) {
                return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
            }
            return [...arr, val];
        };

        switch (type) {
            case 'image':
                newSelectedImageIds = opts.ctrlKey ? toggle(selectedImageIds, id) : [id];
                break;
            case 'group':
                newSelectedGroupIds = opts.ctrlKey ? toggle(selectedGroupIds, id) : [id];
                break;
            case 'canvas-annotation':
            case 'image-annotation':
                const sel = { imageId: imageIdForAnnotation || null, annotationId: id };
                newSelectedAnnotations = opts.ctrlKey ? toggleAnno(selectedAnnotations, sel) : [sel];
                break;
        }

        if (!opts.ctrlKey && !opts.shiftKey) {
            if (type !== 'image') newSelectedImageIds = [];
            if (type !== 'group') newSelectedGroupIds = [];
            if (type !== 'canvas-annotation' && type !== 'image-annotation') newSelectedAnnotations = [];
        }
        
        setSelectedImageIds(newSelectedImageIds);
        setSelectedGroupIds(newSelectedGroupIds);
        setSelectedAnnotations(newSelectedAnnotations);
        setSelectedLayerId(id);
    }, [fullFlatLayerList, selectedLayerId, selectedImageIds, selectedGroupIds, selectedAnnotations]);
    
    const onInteractionEnd = useCallback(() => {
        pushHistory({});
    }, [pushHistory]);
    
    const handleAlignImages = useCallback((alignment: 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom') => {
        if (selectedImageIds.length < 2) return;
        const selected = images.filter(img => selectedImageIds.includes(img.id));
        const bounds = selected.map(img => ({ image: img, bounds: getImagesBounds([img])! }));
        if (bounds.some(b => !b.bounds)) return;

        let newImages = [...images];
        switch (alignment) {
            case 'left': {
                const targetX = Math.min(...bounds.map(b => b.bounds.x));
                newImages = newImages.map(img => {
                    const boundItem = bounds.find(b => b.image.id === img.id);
                    if (boundItem) {
                        const deltaX = targetX - boundItem.bounds.x;
                        return { ...img, x: img.x + deltaX };
                    }
                    return img;
                });
                break;
            }
            case 'right': {
                const targetX = Math.max(...bounds.map(b => b.bounds.x + b.bounds.width));
                newImages = newImages.map(img => {
                    const boundItem = bounds.find(b => b.image.id === img.id);
                    if (boundItem) {
                        const deltaX = targetX - (boundItem.bounds.x + boundItem.bounds.width);
                        return { ...img, x: img.x + deltaX };
                    }
                    return img;
                });
                break;
            }
             case 'h-center': {
                const totalBounds = getImagesBounds(selected)!;
                const targetX = totalBounds.x + totalBounds.width / 2;
                newImages = newImages.map(img => {
                    const boundItem = bounds.find(b => b.image.id === img.id);
                    if (boundItem) {
                        const imgCenterX = boundItem.bounds.x + boundItem.bounds.width / 2;
                        const deltaX = targetX - imgCenterX;
                        return { ...img, x: img.x + deltaX };
                    }
                    return img;
                });
                break;
            }
             case 'top': {
                const targetY = Math.min(...bounds.map(b => b.bounds.y));
                newImages = newImages.map(img => {
                    const boundItem = bounds.find(b => b.image.id === img.id);
                    if (boundItem) {
                        const deltaY = targetY - boundItem.bounds.y;
                        return { ...img, y: img.y + deltaY };
                    }
                    return img;
                });
                break;
            }
            case 'bottom': {
                const targetY = Math.max(...bounds.map(b => b.bounds.y + b.bounds.height));
                newImages = newImages.map(img => {
                    const boundItem = bounds.find(b => b.image.id === img.id);
                    if (boundItem) {
                        const deltaY = targetY - (boundItem.bounds.y + boundItem.bounds.height);
                        return { ...img, y: img.y + deltaY };
                    }
                    return img;
                });
                break;
            }
            case 'v-center': {
                const totalBounds = getImagesBounds(selected)!;
                const targetY = totalBounds.y + totalBounds.height / 2;
                newImages = newImages.map(img => {
                    const boundItem = bounds.find(b => b.image.id === img.id);
                    if (boundItem) {
                        const imgCenterY = boundItem.bounds.y + boundItem.bounds.height / 2;
                        const deltaY = targetY - imgCenterY;
                        return { ...img, y: img.y + deltaY };
                    }
                    return img;
                });
                break;
            }
        }
        pushHistory({ images: newImages });

    }, [selectedImageIds, images, pushHistory]);

    const handleArrangeImages = useCallback((direction: 'horizontal' | 'vertical', order: 'normal' | 'reverse' = 'normal') => {
        if (selectedImageIds.length < 2) return;

        const selectedImagesWithIndices = images
            .map((img, index) => ({ img, index }))
            .filter(({ img }) => selectedImageIds.includes(img.id));

        if (order === 'normal') {
            selectedImagesWithIndices.sort((a, b) => b.index - a.index); // Top-most layer first
        } else {
            selectedImagesWithIndices.sort((a, b) => a.index - b.index); // Bottom-most layer first
        }

        const sortedImages = selectedImagesWithIndices.map(item => item.img);
        const selectionBounds = getImagesBounds(sortedImages)!;
        let currentX = selectionBounds.x;
        let currentY = selectionBounds.y;
        const padding = 10;

        const updates = new Map<string, { x: number, y: number }>();

        sortedImages.forEach(img => {
            const imgBounds = getImagesBounds([img])!;
            const deltaX = currentX - imgBounds.x;
            const deltaY = currentY - imgBounds.y;
            updates.set(img.id, { x: img.x + deltaX, y: img.y + deltaY });
            
            if (direction === 'horizontal') {
                currentX += imgBounds.width + padding;
            } else {
                currentY += imgBounds.height + padding;
            }
        });

        const newImages = images.map(img => {
            if (updates.has(img.id)) {
                return { ...img, ...updates.get(img.id)! };
            }
            return img;
        });
        pushHistory({ images: newImages });
    }, [selectedImageIds, images, pushHistory]);

    const handleStackImages = useCallback((direction: 'horizontal' | 'vertical', order: 'normal' | 'reverse' = 'normal') => {
        if (selectedImageIds.length < 2) return;

        const selectedImagesWithIndices = images
            .map((img, index) => ({ img, index }))
            .filter(({ img }) => selectedImageIds.includes(img.id));

        if (order === 'normal') {
            selectedImagesWithIndices.sort((a, b) => b.index - a.index); // Top-most layer first
        } else {
            selectedImagesWithIndices.sort((a, b) => a.index - b.index); // Bottom-most layer first
        }

        const sortedImages = selectedImagesWithIndices.map(item => item.img);
        const selectionBounds = getImagesBounds(sortedImages)!;
        let currentX = selectionBounds.x;
        let currentY = selectionBounds.y;
        const padding = 0; // Stacked edge-to-edge

        const updates = new Map<string, { x: number, y: number }>();

        sortedImages.forEach(img => {
            const imgBounds = getImagesBounds([img])!;
            const deltaX = currentX - imgBounds.x;
            const deltaY = currentY - imgBounds.y;
            updates.set(img.id, { x: img.x + deltaX, y: img.y + deltaY });
            
            if (direction === 'horizontal') {
                currentX += imgBounds.width + padding;
            } else {
                currentY += imgBounds.height + padding;
            }
        });

        const newImages = images.map(img => {
            if (updates.has(img.id)) {
                return { ...img, ...updates.get(img.id)! };
            }
            return img;
        });
        pushHistory({ images: newImages });
    }, [selectedImageIds, images, pushHistory]);

    const handleMatchImageSizes = useCallback((dimension: 'width' | 'height') => {
        if (selectedImageIds.length < 2) return;
        const targetImage = images.find(img => img.id === selectedImageIds[0]);
        if (!targetImage) return;

        const newImages = images.map(img => {
            if (selectedImageIds.includes(img.id) && img.id !== targetImage.id) {
                let newScale = img.scale;
                if (dimension === 'width') {
                    newScale = (targetImage.width * targetImage.scale) / img.width;
                } else {
                    newScale = (targetImage.height * targetImage.scale) / img.height;
                }
                return { ...img, scale: newScale };
            }
            return img;
        });
        pushHistory({ images: newImages });
    }, [selectedImageIds, images, pushHistory]);

    const onCreateGroup = useCallback(() => {
        if (selectedImageIds.length < 2) return;

        const newGroupId = `group-${Date.now()}-${Math.random()}`;
        
        const existingGroupNames = new Set(groups.map(g => g.name));
        let groupNum = 1;
        while(existingGroupNames.has(`New Group ${groupNum}`)) {
            groupNum++;
        }

        const newGroup: Group = {
            id: newGroupId,
            name: `New Group ${groupNum}`,
            label: `New Group ${groupNum}`,
            showLabel: false,
            imageIds: selectedImageIds,
            groupIds: [],
            isExpanded: true,
            parentId: null,
        };
        
        const selectedImageIdSet = new Set(selectedImageIds);
        const updatedGroups = groups.map(g => ({
            ...g,
            imageIds: g.imageIds.filter(id => !selectedImageIdSet.has(id))
        }));

        pushHistory({
            groups: [...updatedGroups, newGroup].filter(g => g.imageIds.length > 0 || g.groupIds.length > 0),
            selectedImageIds: [],
            selectedAnnotations: [],
            selectedLayerId: newGroupId,
        });
    }, [selectedImageIds, groups, pushHistory]);

    const updateMultipleAnnotationsForInteraction = useCallback((updates: Array<{ selection: AnnotationSelection; changes: Partial<Annotation> }>) => {
        const imageUpdates = new Map<string, Map<string, Partial<Annotation>>>();
        const canvasUpdates = new Map<string, Partial<Annotation>>();

        for (const update of updates) {
            if (update.selection.imageId) {
                if (!imageUpdates.has(update.selection.imageId)) {
                    imageUpdates.set(update.selection.imageId, new Map());
                }
                imageUpdates.get(update.selection.imageId)!.set(update.selection.annotationId, update.changes);
            } else {
                canvasUpdates.set(update.selection.annotationId, update.changes);
            }
        }

        if (imageUpdates.size > 0) {
            setImages(prevImages => prevImages.map(img => {
                if (imageUpdates.has(img.id)) {
                    const annoUpdates = imageUpdates.get(img.id)!;
                    return {
                        ...img,
                        annotations: img.annotations.map(anno => {
                            if (annoUpdates.has(anno.id)) {
                                return { ...anno, ...annoUpdates.get(anno.id)! } as Annotation;
                            }
                            return anno;
                        })
                    };
                }
                return img;
            }));
        }

        if (canvasUpdates.size > 0) {
            setCanvasAnnotations(prevAnnos => prevAnnos.map(anno => {
                if (canvasUpdates.has(anno.id)) {
                    return { ...anno, ...canvasUpdates.get(anno.id)! } as Annotation;
                }
                return anno;
            }));
        }
    }, [setImages, setCanvasAnnotations]);

    const onToggleImageAnnotationsExpanded = useCallback((imageId: string) => {
        setExpandedImageAnnotationIds(prev =>
            prev.includes(imageId)
                ? prev.filter(id => id !== imageId)
                : [...prev, imageId]
        );
    }, []);
    
    const onToggleGroupExpanded = useCallback((groupId: string) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g));
    }, []);

    const onRenameGroup = useCallback((groupId: string, newName: string) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g));
    }, []);

    const handleColorPicked = useCallback((color: string) => {
        if (selectedAnnotations.length > 0) {
            updateSelectedAnnotations({ color });
        } else {
            setToolOptions(prev => ({ ...prev, color }));
        }
        setActiveTool('select');
    }, [selectedAnnotations, updateSelectedAnnotations]);

    return (
        <div className="flex h-screen w-screen bg-gray-900 text-white overflow-hidden">
            <LeftSidebar 
                onFileChange={handleFileChange}
                selectedImage={images.find(i => i.id === selectedImageIds[0]) || null}
                selectedImageIds={selectedImageIds}
                onUpdateSelectedImages={updateSelectedImages}
                cropArea={cropArea}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                toolOptions={toolOptions}
                setToolOptions={setToolOptions}
                onCropToView={() => { /* impl */ }}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
                onAlignImages={handleAlignImages}
                onArrangeImages={handleArrangeImages}
                onStackImages={handleStackImages}
                onMatchImageSizes={handleMatchImageSizes}
                exportFormat={exportFormat}
                setExportFormat={setExportFormat}
                onFitCropToImage={() => { /* impl */ }}
                isLocked={isLocked}
                onClearAllCanvas={() => {
                    setImages([]);
                    setGroups([]);
                    setCanvasAnnotations([]);
                    setSelectedImageIds([]);
                    setSelectedGroupIds([]);
                    setSelectedAnnotations([]);
                    setCropArea(null);
                    pushHistory({ images: [], groups: [], canvasAnnotations: [], selectedImageIds: [], selectedGroupIds: [], selectedAnnotations: [] });
                }}
                onDownloadAllCanvas={() => renderAndDownload(images, canvasAnnotations, null, `canvas-export.${exportFormat}`)}
                onUncrop={handleUncrop}
                onSaveProject={() => { /* impl */ }}
                onLoadProject={() => { /* impl */ }}
                onCreateGroup={onCreateGroup}
                images={images}
                onDownloadSelectedImages={() => {
                     const selectedImages = images.filter(i => selectedImageIds.includes(i.id));
                     const selectedCanvasAnnos = canvasAnnotations.filter(a => selectedAnnotations.some(s => s.annotationId === a.id && s.imageId === null));
                     
                     if (selectedImages.length === 0 && selectedCanvasAnnos.length === 0) return;

                     renderAndDownload(selectedImages, selectedCanvasAnnos, null, `selection-export.${exportFormat}`);
                }}
                isDirty={historyIndex >= 0}
                selectedAnnotationObjects={selectedAnnotationObjects}
                onUpdateSelectedAnnotations={updateSelectedAnnotations}
                deleteSelectedAnnotations={deleteSelectedAnnotations}
                onCrop={handleApplyCrop}
            />
            <div className="flex-1 relative flex flex-col">
                <div className="flex-1 relative overflow-hidden">
                     <CanvasWrapper
                        ref={canvasRef}
                        appStateRef={appStateRef}
                        images={images}
                        groups={groups}
                        setImages={setImages}
                        onInteractionEnd={onInteractionEnd}
                        selectedImageIds={selectedImageIds}
                        setSelectedImageId={(id, opts) => handleSelectLayerItem(id!, 'image', opts, null)}
                        onSelectImages={(ids, keep) => { 
                            if(keep) setSelectedImageIds(prev => Array.from(new Set([...prev, ...ids])));
                            else setSelectedImageIds(ids);
                        }}
                        onBoxSelect={onBoxSelect}
                        cropArea={cropArea}
                        setCropArea={setCropArea}
                        aspectRatio={aspectRatio}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        toolOptions={toolOptions}
                        addAnnotation={addAnnotation}
                        deleteSelectedAnnotations={deleteSelectedAnnotations}
                        viewTransform={viewTransform}
                        setViewTransform={setViewTransform}
                        selectedAnnotations={selectedAnnotations}
                        setSelectedAnnotations={setSelectedAnnotations}
                        updateAnnotation={updateSelectedAnnotations}
                        updateMultipleAnnotationsForInteraction={updateMultipleAnnotationsForInteraction}
                        selectedAnnotationObjects={selectedAnnotationObjects}
                        onColorPicked={handleColorPicked}
                        canvasAnnotations={canvasAnnotations}
                        addCanvasAnnotation={addCanvasAnnotation}
                        onReparentCanvasAnnotationsToImage={onReparentCanvasAnnotationsToImage}
                        reparentImageAnnotationsToImage={reparentImageAnnotationsToImage}
                        lastCanvasMousePosition={lastCanvasMousePosition}
                        onReparentImageAnnotationsToCanvas={onReparentImageAnnotationsToCanvas}
                        selectedLayerId={selectedLayerId}
                     />
                     <FloatingAnnotationEditor
                        style={{}}
                        selectedAnnotations={selectedAnnotationObjects}
                        onUpdate={updateSelectedAnnotations}
                        onDelete={deleteSelectedAnnotations}
                     />
                     <MiniMap
                        images={images}
                        viewTransform={viewTransform}
                        setViewTransform={setViewTransform}
                        viewportSize={{ width: 1920, height: 1080 }} // Stub
                        groups={groups}
                     />
                </div>
            </div>
            <LayersPanel
                appStateRef={appStateRef}
                images={images}
                visualLayerOrder={visualLayerOrder}
                onRenameImage={renameCanvasImage}
                onSelectLayer={handleSelectLayerItem}
                onCenterOnLayer={() => { /* impl */ }}
                onSelectImages={(ids, keep) => { /* impl */ }}
                onDeleteImage={deleteImage}
                onReorderTopLevelLayer={() => { /* impl */ }}
                onReorderLayer={reorderLayers}
                selectedAnnotations={selectedAnnotations}
                groups={groups}
                onDeleteGroup={deleteGroup}
                onRenameGroup={onRenameGroup}
                onToggleGroupExpanded={onToggleGroupExpanded}
                onAddImageToGroup={() => { /* impl */ }}
                onUngroupImages={() => { /* impl */ }}
                canvasAnnotations={canvasAnnotations}
                onReparentCanvasAnnotationsToImage={onReparentCanvasAnnotationsToImage}
                onReparentImageAnnotationsToCanvas={onReparentImageAnnotationsToCanvas}
                onReparentImageAnnotationsToImage={reparentImageAnnotationsToImage}
                selectedImageIds={selectedImageIds}
                selectedGroupIds={selectedGroupIds}
                selectedLayerId={selectedLayerId}
                parentImageIds={new Set()}
                expandedImageAnnotationIds={expandedImageAnnotationIds}
                onToggleImageAnnotationsExpanded={onToggleImageAnnotationsExpanded}
                onReparentGroup={() => { /* impl */ }}
                onRenameGroupLabel={() => { /* impl */ }}
                onToggleGroupLabel={() => { /* impl */ }}
                onReverseLayerOrder={() => { /* impl */ }}
                onAddTag={() => { /* impl */ }}
                onRemoveTag={() => { /* impl */ }}
                onToggleVisibility={toggleLayerVisibility}
                onToggleLock={toggleLayerLock}
                onDuplicateLayer={duplicateLayer}
            />
        </div>
    );
};

export default App;