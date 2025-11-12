import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CanvasImage, Annotation, Group } from '../types';
import { PenToolIcon, TypeIcon, SquareIcon, CircleIcon, MousePointerIcon, TrashIcon, ArrowIcon, ChevronDownIcon, ChevronUpIcon, LayersIcon, LineIcon, ChevronsUpIcon, ChevronsDownIcon } from './icons';

type AnnotationSelection = { imageId: string | null; annotationId: string; };

interface LayersPanelProps {
  images: CanvasImage[];
  onRenameImage: (id: string, newName: string) => void;
  onSelectLayer: (layerId: string, layerType: 'image' | 'group', multiSelect?: boolean) => void;
  onCenterOnLayer: (layerId: string, layerType: 'image' | 'group') => void;
  onSelectImages: (ids: string[], keepExisting: boolean) => void;
  onDeleteImage: (id: string) => void;
  onReorderTopLevelLayer: (dragId: string, dropId: string) => void;
  onReorderLayer: (layerId: string, move: 'up' | 'down' | 'top' | 'bottom') => void;
  selectedAnnotations: AnnotationSelection[];
  setSelectedAnnotations: (updater: (prev: AnnotationSelection[]) => AnnotationSelection[]) => void;
  onReparentAnnotation: (annotationId: string, oldImageId: string, newImageId: string) => void;
  groups: Group[];
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onAddImageToGroup: (groupId: string, imageId: string) => void;
  canvasAnnotations: Annotation[];
  onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
  selectedImageIds: string[];
  selectedLayerId: string | null;
}

const AnnotationIcon: React.FC<{ type: Annotation['type'] }> = ({ type }) => {
    const className = "w-4 h-4 flex-shrink-0";
    switch (type) {
        case 'freehand': return <PenToolIcon className={className} />;
        case 'text': return <TypeIcon className={className} />;
        case 'rect': return <SquareIcon className={className} />;
        case 'circle': return <CircleIcon className={className} />;
        case 'arrow': return <ArrowIcon className={className} />;
        case 'line': return <LineIcon className={className} />;
        default: return <MousePointerIcon className={className} />;
    }
};

const AnnotationListItem: React.FC<{
    annotation: Annotation;
    imageId: string | null;
    isSelected: boolean;
    onSelect: (imageId: string | null, annotationId: string, e: React.MouseEvent) => void;
}> = ({ annotation, imageId, isSelected, onSelect }) => {
    const getAnnotationLabel = (anno: Annotation): string => {
        if (anno.type === 'text') {
            return anno.text.substring(0, 20) + (anno.text.length > 20 ? '...' : '');
        }
        return anno.type.charAt(0).toUpperCase() + anno.type.slice(1);
    };

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData('application/json', JSON.stringify({ annotationId: annotation.id, imageId: imageId }));
                e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(imageId, annotation.id, e);
            }}
            className={`flex items-center p-1.5 rounded-md space-x-2 text-xs transition-all duration-150 cursor-pointer ${imageId !== null ? 'ml-4' : ''} ${isSelected ? 'bg-blue-900' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
            <span className="text-gray-400"><AnnotationIcon type={annotation.type} /></span>
            <span className="truncate flex-1" title={getAnnotationLabel(annotation)}>{getAnnotationLabel(annotation)}</span>
        </div>
    );
};


const CanvasImageItem: React.FC<{
    image: CanvasImage;
    isSelected: boolean;
    onSelect: (id: string, type: 'image', multiSelect?: boolean) => void;
    onCenter: (id: string, type: 'image') => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
    onReparentAnnotation: (annotationId: string, oldImageId: string, newImageId: string) => void;
    onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
    selectedAnnotations: AnnotationSelection[];
    onSelectAnnotation: (imageId: string | null, annotationId: string, e: React.MouseEvent) => void;
    isParentOfSelectedAnnotation: boolean;
    isGrouped?: boolean;
}> = ({ image, isSelected, onSelect, onCenter, onRename, onDelete, onReparentAnnotation, onReparentCanvasAnnotationsToImage, selectedAnnotations, onSelectAnnotation, isParentOfSelectedAnnotation, isGrouped }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(image.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const ringClasses = useMemo(() => {
        if (isDragOver) {
            return 'ring-2 ring-blue-500';
        }
        if (!isSelected && isParentOfSelectedAnnotation) {
            return 'ring-2 ring-teal-500';
        }
        return '';
    }, [isDragOver, isSelected, isParentOfSelectedAnnotation]);

    useEffect(() => {
        if (isRenaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isRenaming]);
    
    useEffect(() => {
        if (!isRenaming) {
            setName(image.name);
        }
    }, [image.name, isRenaming]);

    const handleRename = () => {
        if (name.trim()) {
            onRename(image.id, name.trim());
        } else {
            setName(image.name); // revert if empty
        }
        setIsRenaming(false);
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        const isAnnotation = e.dataTransfer.types.includes('application/json');
        if (isAnnotation) {
            setIsDragOver(true);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        const isAnnotation = e.dataTransfer.types.includes('application/json');
        if (isAnnotation) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.annotationId) {
                if(data.imageId === null) { // from canvas
                    onReparentCanvasAnnotationsToImage([data.annotationId], image.id);
                } else if (data.imageId !== image.id) { // from another image
                    onReparentAnnotation(data.annotationId, data.imageId, image.id);
                }
            }
        } catch (error) {
           // Not an annotation drop
        }
    };

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`bg-gray-800 rounded-md transition-all duration-150 ${ringClasses} ${isGrouped ? 'ml-4' : ''}`}
        >
            <div
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('layer-id', image.id);
                    e.dataTransfer.setData('image-id-for-grouping', image.id);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={(e) => onSelect(image.id, 'image', e.shiftKey || e.metaKey || e.ctrlKey)}
                onDoubleClick={() => onCenter(image.id, 'image')}
                className={`flex items-center justify-between p-2 rounded-t-md space-x-2 cursor-pointer ${isSelected ? 'bg-blue-800' : 'hover:bg-gray-700'} ${isExpanded && 'rounded-b-none'}`}
            >
                <div 
                    className="flex items-center flex-1 min-w-0 space-x-3"
                >
                    <img src={image.element.src} alt={image.name} className="w-10 h-10 object-contain rounded-sm bg-gray-700 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        {isRenaming ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={name}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename();
                                    if (e.key === 'Escape') { setIsRenaming(false); setName(image.name); }
                                }}
                                className="w-full bg-gray-900 text-xs p-1 rounded-sm border border-blue-500"
                            />
                        ) : (
                            <p
                                onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
                                className="text-sm font-medium truncate"
                                title={image.name}
                            >
                                {image.name}
                            </p>
                        )}
                        <p className="text-xs text-gray-400 truncate" title={`${image.annotations.length} annotation(s)`}>
                            {image.annotations.length} annotation(s)
                        </p>
                        <p className="text-xs text-gray-500 truncate" title={new Date(image.createdAt).toLocaleString()}>
                            {new Date(image.createdAt).toLocaleString([], { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center">
                    {image.annotations.length > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors flex-shrink-0" title={isExpanded ? 'Collapse' : 'Expand'}>
                            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md transition-colors flex-shrink-0"
                        title="Delete Image"
                    >
                        <TrashIcon />
                    </button>
                </div>
            </div>
            {isExpanded && image.annotations.length > 0 && (
                <div className="p-1 pb-2 space-y-1 rounded-b-md">
                    {image.annotations.sort((a, b) => (a.id > b.id ? 1 : -1)).map(anno => (
                        <AnnotationListItem
                            key={anno.id}
                            annotation={anno}
                            imageId={image.id}
                            isSelected={selectedAnnotations.some(sel => sel.annotationId === anno.id)}
                            onSelect={onSelectAnnotation}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const GroupListItem: React.FC<{
  group: Group;
  images: CanvasImage[];
  selectedImageIds: string[];
  onSelectLayer: (id: string, type: 'group' | 'image', multiSelect?: boolean) => void;
  onCenterOnLayer: (id: string, type: 'image' | 'group') => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onAddImageToGroup: (groupId: string, imageId: string) => void;
  onRenameImage: (id: string, newName: string) => void;
  onDeleteImage: (id: string) => void;
  onReparentAnnotation: (annotationId: string, oldImageId: string, newImageId: string) => void;
  onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
  selectedAnnotations: AnnotationSelection[];
  onSelectAnnotation: (imageId: string | null, annotationId: string, e: React.MouseEvent) => void;
  parentImageIds: Set<string>;
  selectedLayerId: string | null;
}> = (props) => {
    const { group, images, selectedImageIds, onRenameGroup, onDeleteGroup, onToggleGroupExpanded, onAddImageToGroup, onSelectLayer, onCenterOnLayer, selectedLayerId } = props;
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(group.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const groupImages = useMemo(() => {
        const imageMap = new Map(images.map(img => [img.id, img]));
        return group.imageIds
            .map(id => imageMap.get(id))
            .filter((img): img is CanvasImage => !!img);
    }, [group.imageIds, images]);
    
    const isSelected = selectedLayerId === group.id;

    useEffect(() => {
        if (isRenaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isRenaming]);

    const handleRename = () => {
        if (name.trim()) {
            onRenameGroup(group.id, name.trim());
        } else {
            setName(group.name);
        }
        setIsRenaming(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const imageId = e.dataTransfer.getData('image-id-for-grouping');
        if (imageId && !group.imageIds.includes(imageId)) {
            onAddImageToGroup(group.id, imageId);
        }
    };
    
    return (
        <div
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`bg-gray-800/50 rounded-md transition-all duration-150 ${isDragOver ? 'ring-2 ring-blue-500' : ''}`}
        >
            <div 
                draggable
                onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('layer-id', group.id);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={(e) => onSelectLayer(group.id, 'group', e.shiftKey || e.metaKey || e.ctrlKey)} 
                onDoubleClick={() => onCenterOnLayer(group.id, 'group')}
                className={`flex items-center justify-between p-2 rounded-t-md space-x-2 cursor-pointer ${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} ${group.isExpanded && 'rounded-b-none'}`}
            >
                <div 
                    className="flex items-center flex-1 min-w-0 space-x-3"
                >
                    <LayersIcon className="w-5 h-5 text-gray-400" />
                    <div className="flex-1 min-w-0">
                        {isRenaming ? (
                             <input ref={inputRef} type="text" value={name} onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)} onBlur={handleRename} onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setIsRenaming(false); setName(group.name); }}} className="w-full bg-gray-900 text-sm p-1 rounded-sm border border-blue-500"/>
                        ) : (
                            <p onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }} className="text-sm font-bold truncate" title={group.name}>{group.name}</p>
                        )}
                         <p className="text-xs text-gray-400 truncate">{group.imageIds.length} item(s)</p>
                    </div>
                </div>
                 <div className="flex items-center">
                    <button onClick={(e) => { e.stopPropagation(); onToggleGroupExpanded(group.id); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors flex-shrink-0" title={group.isExpanded ? 'Collapse' : 'Expand'}>
                        {group.isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md transition-colors flex-shrink-0" title="Delete Group">
                        <TrashIcon />
                    </button>
                </div>
            </div>
            {group.isExpanded && (
                <div className="p-1 pb-2 space-y-1">
                    {groupImages.map((img) => (
                        <CanvasImageItem
                            key={img.id}
                            image={img}
                            isSelected={selectedImageIds.includes(img.id)}
                            onSelect={props.onSelectLayer}
                            onCenter={props.onCenterOnLayer}
                            onRename={props.onRenameImage}
                            onDelete={props.onDeleteImage}
                            onReparentAnnotation={props.onReparentAnnotation}
                            onReparentCanvasAnnotationsToImage={props.onReparentCanvasAnnotationsToImage}
                            selectedAnnotations={props.selectedAnnotations}
                            onSelectAnnotation={props.onSelectAnnotation}
                            isParentOfSelectedAnnotation={props.parentImageIds.has(img.id)}
                            isGrouped
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const LayersPanel: React.FC<LayersPanelProps> = (props) => {
    const {
      images, onRenameImage, onSelectLayer, onCenterOnLayer, onSelectImages, onDeleteImage, onReorderTopLevelLayer,
      selectedAnnotations, setSelectedAnnotations, onReparentAnnotation, groups,
      onDeleteGroup, onRenameGroup, onToggleGroupExpanded, onAddImageToGroup,
      canvasAnnotations, onReparentCanvasAnnotationsToImage, selectedImageIds, onReorderLayer,
      selectedLayerId
    } = props;

    const parentImageIds = useMemo(() => new Set(selectedAnnotations.map(sel => sel.imageId)), [selectedAnnotations]);

    const displayedLayers = useMemo(() => {
        const layerItems: (Group | CanvasImage)[] = [];
        const processedImageIds = new Set<string>();
        
        images.forEach(img => {
            if (processedImageIds.has(img.id)) return;
            const group = groups.find(g => g.imageIds.includes(img.id));
            if (group) {
                if (!layerItems.some(item => item.id === group.id)) {
                    layerItems.push(group);
                }
                group.imageIds.forEach(id => processedImageIds.add(id));
            } else {
                layerItems.push(img);
            }
        });
        return layerItems;
    }, [groups, images]);

    const { isFirst, isLast } = useMemo(() => {
        if (!selectedLayerId) return { isFirst: true, isLast: true };

        const parentGroup = groups.find(g => g.imageIds.includes(selectedLayerId));
        
        if (parentGroup) {
            const imageIds = parentGroup.imageIds;
            const index = imageIds.indexOf(selectedLayerId);
            return {
                isFirst: index === 0,
                isLast: index === imageIds.length - 1
            };
        } else {
            const index = displayedLayers.findIndex(item => item.id === selectedLayerId);
            if (index === -1) return { isFirst: true, isLast: true };
            return {
                isFirst: index === 0,
                isLast: index === displayedLayers.length - 1
            };
        }
    }, [selectedLayerId, displayedLayers, groups]);

    const handleAnnotationSelect = (imageId: string | null, annotationId: string, e: React.MouseEvent) => {
        const isMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey;
        setSelectedAnnotations(prev => {
            const selection = { imageId, annotationId };
            const isSelected = prev.some(s => s.annotationId === annotationId);
            if (isMultiSelect) {
                return isSelected ? prev.filter(s => s.annotationId !== annotationId) : [...prev, selection];
            } else {
                return isSelected && prev.length === 1 ? prev : [selection];
            }
        });
    };

    return (
        <aside className="absolute bottom-4 right-4 z-20 w-80 h-[400px] bg-gray-900/80 backdrop-blur-sm text-gray-300 flex flex-col rounded-lg border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between p-2 border-b border-gray-700">
                <div className="flex items-center">
                    <LayersIcon className="w-5 h-5 mr-2 text-gray-400" />
                    <h2 className="text-sm font-bold text-white">Layers</h2>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {displayedLayers.length === 0 && canvasAnnotations.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">Canvas is empty.</p>
                ) : (
                    <>
                        {displayedLayers.map((layer) => {
                            const isGroup = 'imageIds' in layer;
                            const id = layer.id;

                            return (
                                <div
                                    key={id}
                                    onDragOver={e => {
                                        if (e.dataTransfer.types.includes('layer-id')) {
                                            e.preventDefault();
                                        }
                                    }}
                                    onDrop={e => {
                                        if (e.dataTransfer.types.includes('layer-id')) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const dragId = e.dataTransfer.getData('layer-id');
                                            if (dragId && dragId !== id) {
                                                onReorderTopLevelLayer(dragId, id);
                                            }
                                        }
                                    }}
                                >
                                    {isGroup ? (
                                        <GroupListItem
                                            {...props}
                                            group={layer as Group}
                                            onSelectLayer={onSelectLayer}
                                            onCenterOnLayer={onCenterOnLayer}
                                            onToggleGroupExpanded={onToggleGroupExpanded}
                                            onSelectAnnotation={handleAnnotationSelect}
                                            parentImageIds={parentImageIds}
                                        />
                                    ) : (
                                        <CanvasImageItem
                                            image={layer as CanvasImage}
                                            isSelected={selectedImageIds.includes(layer.id)}
                                            onSelect={onSelectLayer}
                                            onCenter={onCenterOnLayer}
                                            onRename={onRenameImage}
                                            onDelete={onDeleteImage}
                                            onReparentAnnotation={onReparentAnnotation}
                                            onReparentCanvasAnnotationsToImage={onReparentCanvasAnnotationsToImage}
                                            selectedAnnotations={selectedAnnotations}
                                            onSelectAnnotation={handleAnnotationSelect}
                                            isParentOfSelectedAnnotation={parentImageIds.has(layer.id)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                        {[...canvasAnnotations].sort((a,b) => (a.id > b.id ? 1 : -1)).map(anno => (
                            <AnnotationListItem
                                key={anno.id}
                                annotation={anno}
                                imageId={null}
                                isSelected={selectedAnnotations.some(s => s.annotationId === anno.id)}
                                onSelect={handleAnnotationSelect}
                            />
                        ))}
                    </>
                )}
            </div>
            <div className="flex items-center justify-center p-1 border-t border-gray-700 space-x-2">
                <button onClick={() => onReorderLayer(selectedLayerId!, 'bottom')} disabled={!selectedLayerId || isFirst} title="Send to Back" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsUpIcon/></button>
                <button onClick={() => onReorderLayer(selectedLayerId!, 'down')} disabled={!selectedLayerId || isFirst} title="Move Backward" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUpIcon/></button>
                <button onClick={() => onReorderLayer(selectedLayerId!, 'up')} disabled={!selectedLayerId || isLast} title="Move Forward" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDownIcon/></button>
                <button onClick={() => onReorderLayer(selectedLayerId!, 'top')} disabled={!selectedLayerId || isLast} title="Bring to Front" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsDownIcon/></button>
            </div>
        </aside>
    );
};
