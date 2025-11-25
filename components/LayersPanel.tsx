import React, { useState } from 'react';
import { CanvasImage, Annotation, Group } from '../types';
import { PenToolIcon, TypeIcon, SquareIcon, CircleIcon, TrashIcon, ArrowIcon, ChevronDownIcon, ChevronUpIcon, LayersIcon, LineIcon, EyeIcon, EyeOffIcon, LockIcon, UnlockIcon, DuplicateIcon } from './icons';

type AnnotationSelection = { imageId: string | null; annotationId: string; };

interface LayersPanelProps {
    images: CanvasImage[];
    visualLayerOrder: (Group | CanvasImage)[];
    onRenameImage: (id: string, newName: string) => void;
    onSelectLayer: (id: string, type: 'image' | 'group' | 'canvas-annotation' | 'image-annotation', options: { shiftKey: boolean, ctrlKey: boolean }, imageIdForAnnotation?: string | null) => void;
    onDeleteImage: (id: string) => void;
    selectedAnnotations: AnnotationSelection[];
    groups: Group[];
    onDeleteGroup: (id: string) => void;
    onRenameGroup: (groupId: string, newName: string) => void;
    onToggleGroupExpanded: (groupId: string) => void;
    canvasAnnotations: Annotation[];
    onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
    onReparentImageAnnotationsToCanvas: (selections: { annotationId: string, imageId: string }[]) => void;
    onReparentImageAnnotationsToImage: (annotations: { annotationId: string, imageId: string }[], newImageId: string) => void;
    selectedImageIds: string[];
    selectedGroupIds: string[];
    selectedLayerId: string | null;
    expandedImageAnnotationIds: string[];
    onToggleImageAnnotationsExpanded: (imageId: string) => void;
    appStateRef: React.MutableRefObject<any>; // To get fresh state
    onCenterOnLayer: () => void;
    onSelectImages: (ids: string[], keep: boolean) => void;
    onReorderTopLevelLayer: () => void;
    onReorderLayer: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
    onAddImageToGroup: () => void;
    onUngroupImages: () => void;
    onReparentGroup: () => void;
    onRenameGroupLabel: () => void;
    onToggleGroupLabel: () => void;
    onReverseLayerOrder: () => void;
    onAddTag: () => void;
    onRemoveTag: () => void;
    onToggleVisibility: (id: string, type: 'image' | 'group') => void;
    onToggleLock: (id: string, type: 'image' | 'group') => void;
    onDuplicateLayer: () => void;
    parentImageIds: Set<string>;
}

const getAnnotationIcon = (type: Annotation['type']) => {
    switch(type) {
        case 'freehand': return <PenToolIcon className="w-3 h-3 text-gray-400" />;
        case 'text': return <TypeIcon className="w-3 h-3 text-gray-400" />;
        case 'rect': return <SquareIcon className="w-3 h-3 text-gray-400" />;
        case 'circle': return <CircleIcon className="w-3 h-3 text-gray-400" />;
        case 'arrow': return <ArrowIcon className="w-3 h-3 text-gray-400" />;
        case 'line': return <LineIcon className="w-3 h-3 text-gray-400" />;
        default: return <LayersIcon className="w-3 h-3 text-gray-400" />;
    }
}

const AnnotationItem: React.FC<{
    annotation: Annotation;
    imageId: string | null;
    onSelect: (e: React.MouseEvent) => void;
    isSelected: boolean;
}> = ({ annotation, imageId, onSelect, isSelected }) => {
    
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('reparent-type', 'annotation');
        e.dataTransfer.setData('annotationId', annotation.id);
        if (imageId) {
            e.dataTransfer.setData('sourceImageId', imageId);
        }
        if (isSelected) {
            e.dataTransfer.setData('is-selected-annotation', 'true');
        }
        e.stopPropagation();
    }

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onClick={onSelect}
            className={`flex items-center space-x-2 p-1.5 pl-10 text-xs rounded-md cursor-pointer ${isSelected ? 'bg-blue-600/40' : 'hover:bg-gray-700/50'} transition-colors`}
        >
            {getAnnotationIcon(annotation.type)}
            <span className="truncate flex-1 text-gray-300">{annotation.type}</span>
        </div>
    );
};

const ImageItem: React.FC<Omit<LayersPanelProps, 'visualLayerOrder' | 'onSelectAnnotation'>> = (props) => {
    const { image, onRenameImage, selectedImageIds, onSelectLayer, expandedImageAnnotationIds, onToggleImageAnnotationsExpanded, selectedAnnotations, onDeleteImage, onToggleVisibility, onToggleLock, onReorderLayer, selectedAnnotations: allSelectedAnnotations } = props;
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(image.name);
    const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | 'inside' | null>(null);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
    const handleNameBlur = () => {
        setIsRenaming(false);
        if (name.trim() && name !== image.name) {
            onRenameImage(image.id, name);
        } else {
            setName(image.name);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
            setIsRenaming(false);
            setName(image.name);
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('layer-type', 'image');
        e.dataTransfer.setData('layer-id', image.id);
        e.stopPropagation(); // Prevent group from handling it
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverPosition(null);

        const reparentType = e.dataTransfer.getData('reparent-type');
        if (reparentType === 'annotation') {
            const annotationId = e.dataTransfer.getData('annotationId');
            const isSelected = e.dataTransfer.getData('is-selected-annotation') === 'true';
            const sourceImageId = e.dataTransfer.getData('sourceImageId');

            if (isSelected) {
                // Move all selected annotations
                const annotationsToMove = allSelectedAnnotations.filter(sel => sel.imageId !== image.id);
                const imageAnnos = annotationsToMove.filter(a => a.imageId !== null) as { annotationId: string, imageId: string }[];
                const canvasAnnos = annotationsToMove.filter(a => a.imageId === null).map(a => a.annotationId);

                if (imageAnnos.length > 0) {
                    props.onReparentImageAnnotationsToImage(imageAnnos, image.id);
                }
                if (canvasAnnos.length > 0) {
                    props.onReparentCanvasAnnotationsToImage(canvasAnnos, image.id);
                }
            } else {
                // Single annotation move
                if (sourceImageId && sourceImageId !== image.id) {
                    props.onReparentImageAnnotationsToImage([{ annotationId, imageId: sourceImageId }], image.id);
                } else if (!sourceImageId) {
                    props.onReparentCanvasAnnotationsToImage([annotationId], image.id);
                }
            }
            return;
        }

        const layerType = e.dataTransfer.getData('layer-type');
        const layerId = e.dataTransfer.getData('layer-id');
        if (layerType === 'image' && layerId && layerId !== image.id) {
            // Reordering
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const position = y < rect.height / 2 ? 'before' : 'after';
            onReorderLayer(layerId, image.id, position);
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const reparentType = e.dataTransfer.getData('reparent-type');
        
        if (reparentType) return; 

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (y < rect.height / 2) setDragOverPosition('before');
        else setDragOverPosition('after');
    }

    const handleDragLeave = () => {
        setDragOverPosition(null);
    }

    const isExpanded = expandedImageAnnotationIds.includes(image.id);
    const isSelected = selectedImageIds.includes(image.id);

    return (
        <div 
            className="flex flex-col relative"
            draggable
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            {/* Drag Indicators */}
            {dragOverPosition === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-20" />}
            {dragOverPosition === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-20" />}

            <div className={`flex items-center p-1 pr-2 rounded-md group ${isSelected ? 'bg-blue-600/30' : 'hover:bg-gray-800'} transition-colors border border-transparent ${isSelected ? 'border-blue-500/30' : ''}`}>
                
                {/* Visibility Toggle */}
                <button onClick={() => onToggleVisibility(image.id, 'image')} className="p-1.5 text-gray-500 hover:text-gray-200 focus:outline-none">
                    {image.visible === false ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>

                {/* Expand/Collapse Annotations */}
                {image.annotations.length > 0 ? (
                    <button onClick={() => onToggleImageAnnotationsExpanded(image.id)} className="p-0.5 rounded hover:bg-gray-600 text-gray-400">
                        {isExpanded ? <ChevronDownIcon className="w-3 h-3"/> : <ChevronUpIcon className="w-3 h-3 -rotate-90"/>}
                    </button>
                ) : <div className="w-4" /> }
                
                <div className="flex-1 overflow-hidden px-2">
                    {isRenaming ? (
                        <input 
                            type="text"
                            value={name}
                            onChange={handleNameChange}
                            onBlur={handleNameBlur}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="bg-gray-900 text-sm focus:ring-1 focus:ring-blue-500 outline-none rounded-sm w-full"
                            onClick={e => e.stopPropagation()}
                        />
                    ) : (
                        <span 
                            className="truncate block text-sm cursor-pointer select-none"
                            onClick={(e) => onSelectLayer(image.id, 'image', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                            onDoubleClick={() => setIsRenaming(true)}
                        >
                            {image.name}
                        </span>
                    )}
                </div>

                {/* Lock Toggle */}
                <button onClick={() => onToggleLock(image.id, 'image')} className={`p-1.5 focus:outline-none ${image.locked ? 'text-yellow-500' : 'text-gray-600 hover:text-gray-400'}`}>
                    {image.locked ? <LockIcon className="w-3 h-3" /> : <UnlockIcon className="w-3 h-3" />}
                </button>
            </div>
            {isExpanded && image.annotations.length > 0 && (
                 <div className="flex flex-col border-l border-gray-700 ml-4 pl-1 my-1">
                    {image.annotations.map(anno => (
                        <AnnotationItem
                            key={anno.id}
                            annotation={anno}
                            imageId={image.id}
                            isSelected={selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === image.id)}
                            onSelect={(e) => onSelectLayer(anno.id, 'image-annotation', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }, image.id)}
                        />
                    ))}
                 </div>
            )}
        </div>
    )
}

const GroupItem: React.FC<Omit<LayersPanelProps, 'visualLayerOrder'>> = (props) => {
    const { group, selectedGroupIds, onSelectLayer, onDeleteGroup, onToggleGroupExpanded, onRenameGroup, onToggleVisibility, onToggleLock, onReorderLayer } = props;
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(group.name);
    const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | 'inside' | null>(null);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
    const handleNameBlur = () => {
        setIsRenaming(false);
        if (name.trim() && name !== group.name) {
            onRenameGroup(group.id, name);
        } else {
            setName(group.name);
        }
    };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
            setIsRenaming(false);
            setName(group.name);
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.preventDefault();
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverPosition(null);
        
        const layerType = e.dataTransfer.getData('layer-type');
        const layerId = e.dataTransfer.getData('layer-id');
        
        if (layerType === 'image') {
             onReorderLayer(layerId, group.id, 'inside');
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverPosition('inside');
    }
    
    const handleDragLeave = () => setDragOverPosition(null);

    const childImages = group.imageIds.map(id => props.images.find(i => i.id === id)).filter((i): i is CanvasImage => !!i);
    const childGroups = group.groupIds.map(id => props.groups.find(g => g.id === id)).filter((g): g is Group => !!g);

    const isSelected = selectedGroupIds.includes(group.id);

    return (
        <div 
            className="flex flex-col relative"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            {dragOverPosition === 'inside' && <div className="absolute inset-0 border-2 border-blue-500 rounded-md z-20 pointer-events-none bg-blue-500/10" />}

            <div className={`flex items-center p-1 pr-2 rounded-md group ${isSelected ? 'bg-blue-600/30' : 'hover:bg-gray-800'} transition-colors border border-transparent`}>
                
                <button onClick={() => onToggleVisibility(group.id, 'group')} className="p-1.5 text-gray-500 hover:text-gray-200 focus:outline-none">
                    {group.visible === false ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>

                <button onClick={() => onToggleGroupExpanded(group.id)} className="p-0.5 rounded hover:bg-gray-600 text-gray-400">
                    {group.isExpanded ? <ChevronDownIcon className="w-3 h-3"/> : <ChevronUpIcon className="w-3 h-3 -rotate-90"/>}
                </button>
                
                <LayersIcon className="w-4 h-4 text-indigo-400 mx-1"/>
                
                <div className="flex-1 overflow-hidden px-2">
                    {isRenaming ? (
                        <input 
                            type="text" value={name} onChange={handleNameChange} onBlur={handleNameBlur} onKeyDown={handleKeyDown}
                            autoFocus className="bg-gray-900 text-sm focus:ring-1 focus:ring-blue-500 outline-none rounded-sm w-full"
                            onClick={e => e.stopPropagation()}
                        />
                    ) : (
                        <span 
                            className="truncate block text-sm cursor-pointer font-medium text-gray-300 select-none"
                            onClick={(e) => onSelectLayer(group.id, 'group', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                            onDoubleClick={() => setIsRenaming(true)}
                        >
                            {group.name}
                        </span>
                    )}
                </div>

                <button onClick={() => onToggleLock(group.id, 'group')} className={`p-1.5 focus:outline-none ${group.locked ? 'text-yellow-500' : 'text-gray-600 hover:text-gray-400'}`}>
                    {group.locked ? <LockIcon className="w-3 h-3" /> : <UnlockIcon className="w-3 h-3" />}
                </button>
            </div>
            {group.isExpanded && (
                <div className="pl-3 ml-3 border-l border-gray-700 space-y-0.5">
                    {childGroups.map(g => <GroupItem key={g.id} {...props} group={g} />)}
                    {childImages.map(img => <ImageItem key={img.id} {...props} image={img} />)}
                </div>
            )}
        </div>
    );
};

export const LayersPanel: React.FC<LayersPanelProps> = (props) => {
    const { canvasAnnotations, visualLayerOrder, selectedAnnotations, onSelectLayer, onReparentImageAnnotationsToCanvas, onReorderLayer, selectedLayerId, onDeleteImage, onDeleteGroup, onDuplicateLayer, selectedGroupIds, selectedImageIds } = props;

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const type = e.dataTransfer.getData('reparent-type');
        if (type === 'annotation') {
            const annotationId = e.dataTransfer.getData('annotationId');
            const sourceImageId = e.dataTransfer.getData('sourceImageId');
            if (sourceImageId) {
                onReparentImageAnnotationsToCanvas([{ annotationId, imageId: sourceImageId }]);
            }
        }
    }
    const handleCanvasDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }

    const renderedOrder = [...visualLayerOrder].reverse();

    const handleMoveLayer = (direction: 'up' | 'down') => {
        if (!selectedLayerId) return;
        
        // visualLayerOrder[0] is Bottom. renderedOrder[0] is Top.
        // "Up" arrow means visually higher (lower index in renderedOrder, higher index in visualLayerOrder).
        // "Down" arrow means visually lower (higher index in renderedOrder, lower index in visualLayerOrder).
        // We use onReorderLayer(draggedId, targetId, position).
        
        const currentIndex = renderedOrder.findIndex(l => l.id === selectedLayerId);
        if (currentIndex === -1) return;

        if (direction === 'up') {
            // Move before (visually above) the previous sibling in rendered list
            // index 0 is top. So move to index-1.
            if (currentIndex > 0) {
                const target = renderedOrder[currentIndex - 1];
                onReorderLayer(selectedLayerId, target.id, 'before'); // 'before' in visual list means HIGHER z-index
            }
        } else {
            // Move after (visually below) the next sibling in rendered list
            if (currentIndex < renderedOrder.length - 1) {
                const target = renderedOrder[currentIndex + 1];
                onReorderLayer(selectedLayerId, target.id, 'after'); // 'after' in visual list means LOWER z-index?
                // Reorder logic in App.tsx: 
                // 'before': insert after target index (higher index)
                // 'after': insert at target index (pushing target up, so dragged is lower)
                // Wait, visualLayerOrder is bottom-to-top.
                // If renderedOrder is top-to-bottom.
                // target = renderedOrder[currentIndex + 1] (visually below).
                // dragging 'after' target in terms of Z-index? No.
                // If we want current to go below target.
                // Current is at Z=10. Target is at Z=9.
                // We want Current at Z=8 (or 8.5).
                // 'after' implies lower index.
                // App.tsx logic: 'after' -> splice(targetImageIndex, 0, dragged).
                // If target is at index 5. Dragged inserted at 5. Target becomes 6.
                // So dragged is lower than target. This is correct for 'Down'.
            }
        }
    };

    const handleDelete = () => {
        if (!selectedLayerId && selectedImageIds.length === 0 && selectedGroupIds.length === 0) return;
        
        if (selectedGroupIds.length > 0) {
            selectedGroupIds.forEach(id => onDeleteGroup(id));
            return;
        }
        if (selectedImageIds.length > 0) {
            // This might be handled by parent but here we can trigger standard delete
            // The button uses selectedLayerId logic mainly.
            // But let's support multi-delete.
            // We don't have bulk delete exposed directly via props except via onDeleteImage called multiple times?
            // App.tsx usually handles 'Delete' key for bulk.
            // For this button, let's stick to single delete or primary active layer if multiple selection logic isn't exposed here.
            // Actually, onDeleteImage removes one.
        }

        if (selectedLayerId) {
            const isGroup = props.groups.some(g => g.id === selectedLayerId);
            if (isGroup) onDeleteGroup(selectedLayerId);
            else onDeleteImage(selectedLayerId);
        }
    }

    return (
        <aside className="w-80 bg-gray-900 text-gray-300 flex flex-col h-full shadow-lg z-10 border-l border-gray-700 select-none">
            <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                <h2 className="text-xs font-bold uppercase text-gray-400 tracking-wide">Layers & Objects</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
                <div 
                    className="flex flex-col"
                    onDrop={handleCanvasDrop}
                    onDragOver={handleCanvasDragOver}
                >
                    <div className="px-2 py-1 text-xs font-bold uppercase text-gray-500 flex items-center">
                        <span>Canvas Annotations</span>
                        <span className="ml-auto text-gray-600">{canvasAnnotations.length}</span>
                    </div>
                    {canvasAnnotations.map(anno => (
                        <AnnotationItem 
                            key={anno.id}
                            annotation={anno}
                            imageId={null}
                            isSelected={selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === null)}
                            onSelect={(e) => onSelectLayer(anno.id, 'canvas-annotation', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey }, null)}
                        />
                    ))}
                     {canvasAnnotations.length === 0 && <div className="h-1" />}
                </div>

                <div className="border-t border-gray-700 my-2"></div>

                <div className="flex flex-col space-y-0.5">
                    {renderedOrder.map(layer => {
                        if ('imageIds' in layer) { // It's a Group
                            return <GroupItem key={layer.id} {...props} group={layer} />;
                        } else { // It's a CanvasImage
                            return <ImageItem key={layer.id} {...props} image={layer} />;
                        }
                    })}
                </div>
            </div>
            
            {/* Bottom Toolbar */}
            <div className="p-2 border-t border-gray-700 bg-gray-800 flex justify-around items-center">
                <button onClick={onDuplicateLayer} title="Duplicate Layer" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedLayerId && selectedAnnotations.length === 0}>
                    <DuplicateIcon className="w-5 h-5" />
                </button>
                <button onClick={() => handleMoveLayer('up')} title="Move Layer Up" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedLayerId}>
                    <ChevronUpIcon className="w-5 h-5" />
                </button>
                <button onClick={() => handleMoveLayer('down')} title="Move Layer Down" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedLayerId}>
                    <ChevronDownIcon className="w-5 h-5" />
                </button>
                <button onClick={handleDelete} title="Delete Layer" className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedLayerId && selectedImageIds.length === 0 && selectedGroupIds.length === 0}>
                    <TrashIcon className="w-5 h-5" />
                </button>
            </div>
        </aside>
    );
};

export default LayersPanel;
