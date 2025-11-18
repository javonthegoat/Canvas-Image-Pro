
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { CanvasImage, Annotation, Group } from '../types';
import { PenToolIcon, TypeIcon, SquareIcon, CircleIcon, MousePointerIcon, TrashIcon, ArrowIcon, ChevronDownIcon, ChevronUpIcon, LayersIcon, LineIcon, ChevronsUpIcon, ChevronsDownIcon, EyeIcon, EyeOffIcon, PencilIcon, SearchIcon, XIcon, ChevronsUpDownIcon, TagIcon, SortDescendingIcon, SortAscendingIcon } from './icons';

type AnnotationSelection = { imageId: string | null; annotationId: string; };

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
        if (imageIds.length === 0) return -Infinity; // Group with no images
        return Math.max(...imageIds.map(id => imageZIndexMap.get(id) ?? -Infinity));
    };

    allChildren.sort((a, b) => getItemMaxZ(b) - getItemMaxZ(a));
    return allChildren;
};

interface LayersPanelProps {
  images: CanvasImage[];
  visualLayerOrder: (Group | CanvasImage)[];
  onRenameImage: (id: string, newName: string) => void;
  onSelectLayer: (layerId: string, layerType: 'image' | 'group', options: { shiftKey: boolean, ctrlKey: boolean }) => void;
  onCenterOnLayer: (layerId: string, layerType: 'image' | 'group') => void;
  onSelectImages: (ids: string[], keepExisting: boolean) => void;
  onDeleteImage: (id: string) => void;
  onReorderTopLevelLayer: (dragId: string, dropId: string) => void;
  onReorderLayer: (layerId: string, move: 'up' | 'down' | 'top' | 'bottom') => void;
  selectedAnnotations: AnnotationSelection[];
  onSelectAnnotation: (imageId: string | null, annotationId: string, options: { shiftKey: boolean; ctrlKey: boolean }) => void;
  groups: Group[];
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onAddImageToGroup: (groupId: string, imageId: string) => void;
  onUngroupImages: (imageIds: string[]) => void;
  canvasAnnotations: Annotation[];
  onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
  onReparentImageAnnotationsToCanvas: (selections: Array<{ annotationId: string; imageId: string }>) => void;
  selectedImageIds: string[];
  selectedLayerId: string | null;
  parentImageIds: Set<string>;
  expandedImageAnnotationIds: string[];
  onToggleImageAnnotationsExpanded: (imageId: string) => void;
  onReparentGroup: (childGroupId: string, parentGroupId: string | null) => void;
  onRenameGroupLabel: (groupId: string, newLabel: string) => void;
  onToggleGroupLabel: (groupId: string, newLabel: string) => void;
  onReverseLayerOrder: () => void;
  onAddTag: (imageId: string, tag: string) => void;
  onRemoveTag: (imageId: string, tagIndex: number) => void;
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
    onSelect: (id: string, type: 'image', options: { shiftKey: boolean, ctrlKey: boolean }) => void;
    onCenter: (id: string, type: 'image') => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
    onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
    onReparentImageAnnotationsToCanvas: (selections: Array<{ annotationId: string, imageId: string }>) => void;
    selectedAnnotations: AnnotationSelection[];
    onSelectAnnotation: (imageId: string | null, annotationId: string, options: { shiftKey: boolean; ctrlKey: boolean }) => void;
    isParentOfSelectedAnnotation: boolean;
    isGrouped?: boolean;
    isExpanded: boolean;
    onToggleExpanded: (id: string) => void;
    depth?: number;
    onAddTag: (imageId: string, tag: string) => void;
    onRemoveTag: (imageId: string, tagIndex: number) => void;
}> = ({ image, isSelected, onSelect, onCenter, onRename, onDelete, onReparentCanvasAnnotationsToImage, onReparentImageAnnotationsToCanvas, selectedAnnotations, onSelectAnnotation, isParentOfSelectedAnnotation, isGrouped, isExpanded, onToggleExpanded, depth = 0, onAddTag, onRemoveTag }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(image.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [tagInput, setTagInput] = useState('');

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

    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            onAddTag(image.id, tagInput.trim());
            setTagInput('');
        }
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
                const isDraggedSelected = selectedAnnotations.some(sel => sel.annotationId === data.annotationId);
                if (data.imageId === null) { // From canvas
                    const idsToMove = isDraggedSelected 
                        ? selectedAnnotations.filter(s => s.imageId === null).map(s => s.annotationId)
                        : [data.annotationId];
                    if (idsToMove.length > 0) onReparentCanvasAnnotationsToImage(idsToMove, image.id);
                } else if (data.imageId !== image.id) { // From another image
                    const selectionsToMove = isDraggedSelected
                      ? selectedAnnotations.filter(s => s.imageId !== null && s.imageId !== image.id) as {imageId: string, annotationId: string}[]
                      : [{ annotationId: data.annotationId, imageId: data.imageId }];
                    if (selectionsToMove.length > 0) onReparentImageAnnotationsToCanvas(selectionsToMove); // First move to canvas...
                    // A follow up action should move them to the new image. This is complex.
                    // For now, let's simplify to single item drag.
                    if(!isDraggedSelected) {
                        onReparentImageAnnotationsToCanvas([{ annotationId: data.annotationId, imageId: data.imageId }]);
                    }
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
            className={`bg-gray-800 rounded-md transition-all duration-150 ${ringClasses}`}
            style={{ marginLeft: `${depth * 16}px`}}
        >
            <div
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('layer-id', image.id);
                    e.dataTransfer.setData('layer-type', 'image');
                    if (isGrouped) {
                      e.dataTransfer.setData('image-id-for-ungrouping', image.id);
                    }
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={(e) => onSelect(image.id, 'image', { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey })}
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
                    <button onClick={(e) => { e.stopPropagation(); onToggleExpanded(image.id); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors flex-shrink-0" title={isExpanded ? 'Collapse' : 'Expand'}>
                        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md transition-colors flex-shrink-0"
                        title="Delete Image"
                    >
                        <TrashIcon />
                    </button>
                </div>
            </div>
             {isExpanded && (
                <div className="p-2 space-y-2 rounded-b-md bg-gray-800">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 flex items-center">
                            <TagIcon className="w-3 h-3 mr-1" /> Tags
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {image.tags?.map((tag, index) => (
                                <span key={index} className="bg-teal-800 text-teal-200 text-xs font-medium px-2 py-0.5 rounded-full flex items-center">
                                    {tag}
                                    <button onClick={(e) => { e.stopPropagation(); onRemoveTag(image.id, index); }} className="ml-1 text-teal-400 hover:text-white">
                                        <XIcon className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <input
                            type="text"
                            placeholder="Add tag & press Enter"
                            value={tagInput}
                            onClick={e => e.stopPropagation()}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            className="w-full bg-gray-900 text-xs p-1 rounded-sm border border-gray-600 focus:ring-blue-500 focus:border-blue-500 mt-1"
                        />
                    </div>
                    {image.annotations.length > 0 && (
                        <div className="pt-2 border-t border-gray-700/50 space-y-1">
                            {[...image.annotations].sort((a, b) => a.id.localeCompare(b.id)).map(anno => (
                                <AnnotationListItem
                                    key={anno.id}
                                    annotation={anno}
                                    imageId={image.id}
                                    isSelected={selectedAnnotations.some(sel => sel.annotationId === anno.id)}
                                    onSelect={(imageId, annotationId, e) => onSelectAnnotation(imageId, annotationId, { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey })}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const GroupListItem: React.FC<Omit<LayersPanelProps, 'visualLayerOrder' | 'canvasAnnotations' | 'onReorderTopLevelLayer' | 'onReverseLayerOrder'> & {
    group: Group;
    depth?: number;
}> = (props) => {
    const { group, images, groups, selectedImageIds, onRenameGroup, onDeleteGroup, onToggleGroupExpanded, onAddImageToGroup, onSelectLayer, onCenterOnLayer, selectedLayerId, onReparentGroup, onRenameGroupLabel, onToggleGroupLabel, depth = 0 } = props;
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(group.name);
    const [isRenamingLabel, setIsRenamingLabel] = useState(false);
    const [label, setLabel] = useState(group.label);
    const [isDragOver, setIsDragOver] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const labelInputRef = useRef<HTMLInputElement>(null);

    const isSelected = selectedLayerId === group.id;

    useEffect(() => {
        if (isRenaming) nameInputRef.current?.focus();
    }, [isRenaming]);
    
    useEffect(() => {
        if (isRenamingLabel) labelInputRef.current?.focus();
    }, [isRenamingLabel]);

    useEffect(() => {
      setName(group.name);
      setLabel(group.label);
    }, [group.name, group.label]);

    const handleRename = () => {
        if (name.trim()) onRenameGroup(group.id, name.trim());
        else setName(group.name);
        setIsRenaming(false);
    };
    
    const handleRenameLabel = () => {
        if (label.trim()) onRenameGroupLabel(group.id, label.trim());
        else setLabel(group.label);
        setIsRenamingLabel(false);
    };

    const handleDragEnter = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('layer-id')) {
            e.preventDefault();
            setIsDragOver(true);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('layer-id')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    };
    
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const layerType = e.dataTransfer.getData('layer-type');
        const draggedId = e.dataTransfer.getData('layer-id');
        if (layerType === 'image' && draggedId && !group.imageIds.includes(draggedId)) {
            onAddImageToGroup(group.id, draggedId);
        } else if (layerType === 'group' && draggedId && draggedId !== group.id) {
            onReparentGroup(draggedId, group.id);
        }
    };

    const sortedChildren = useMemo(() => {
        return getOrderedChildrenOfGroup(group, images, groups);
    }, [group, images, groups]);
    
    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`bg-gray-800/50 rounded-md transition-all duration-150 ${isDragOver ? 'ring-2 ring-blue-500' : ''}`}
            style={{ marginLeft: `${depth * 16}px`}}
        >
            <div 
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('layer-id', group.id);
                    e.dataTransfer.setData('layer-type', 'group');
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={(e) => onSelectLayer(group.id, 'group', { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey })}
                onDoubleClick={() => onCenterOnLayer(group.id, 'group')}
                className={`flex items-center justify-between p-2 rounded-t-md space-x-2 cursor-pointer ${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} ${group.isExpanded && 'rounded-b-none'}`}
            >
                <div className="flex items-center flex-1 min-w-0 space-x-3">
                    <LayersIcon className="w-5 h-5 text-gray-400" />
                    <div className="flex-1 min-w-0">
                        {isRenaming ? (
                             <input ref={nameInputRef} type="text" value={name} onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)} onBlur={handleRename} onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setIsRenaming(false); setName(group.name); }}} className="w-full bg-gray-900 text-sm p-1 rounded-sm border border-blue-500"/>
                        ) : (
                            <p onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }} className="text-sm font-bold truncate" title={group.name}>{group.name}</p>
                        )}
                         <p className="text-xs text-gray-400 truncate">{group.imageIds.length + group.groupIds.length} item(s)</p>
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
                <div className="p-1 space-y-1">
                    <div className="flex items-center bg-gray-900/50 rounded-md p-1.5 space-x-2 text-xs">
                        <span className="font-semibold text-gray-400">Canvas Label:</span>
                        {isRenamingLabel ? (
                            <input ref={labelInputRef} type="text" value={label} onClick={(e) => e.stopPropagation()} onChange={(e) => setLabel(e.target.value)} onBlur={handleRenameLabel} onKeyDown={(e) => { if (e.key === 'Enter') handleRenameLabel(); if (e.key === 'Escape') { setIsRenamingLabel(false); setLabel(group.label); }}} className="flex-1 bg-gray-800 text-xs p-1 rounded-sm border border-blue-500"/>
                        ) : (
                            <p className="truncate flex-1" title={group.label}>{group.label}</p>
                        )}
                        <button onClick={(e) => {e.stopPropagation(); setIsRenamingLabel(true)}} className="p-1 text-gray-400 hover:text-white"><PencilIcon className="w-3 h-3"/></button>
                        <button onClick={(e) => {e.stopPropagation(); onToggleGroupLabel(group.id);}} className="p-1 text-gray-400 hover:text-white" title={group.showLabel ? 'Hide Label' : 'Show Label'}>
                            {group.showLabel ? <EyeIcon className="w-4 h-4"/> : <EyeOffIcon className="w-4 h-4"/>}
                        </button>
                    </div>

                    {sortedChildren.map(child => {
                        const isGroup = 'groupIds' in child;
                        return isGroup ? (
                           <GroupListItem key={child.id} {...props} group={child as Group} depth={depth + 1} />
                        ) : (
                           <CanvasImageItem
                                key={child.id}
                                image={child as CanvasImage}
                                isSelected={selectedImageIds.includes(child.id)}
                                onSelect={props.onSelectLayer}
                                onCenter={props.onCenterOnLayer}
                                onRename={props.onRenameImage}
                                onDelete={props.onDeleteImage}
                                onReparentCanvasAnnotationsToImage={props.onReparentCanvasAnnotationsToImage}
                                onReparentImageAnnotationsToCanvas={props.onReparentImageAnnotationsToCanvas}
                                selectedAnnotations={props.selectedAnnotations}
                                onSelectAnnotation={props.onSelectAnnotation}
                                isParentOfSelectedAnnotation={props.parentImageIds.has(child.id)}
                                isGrouped
                                isExpanded={props.expandedImageAnnotationIds.includes(child.id)}
                                onToggleExpanded={props.onToggleImageAnnotationsExpanded}
                                onAddTag={props.onAddTag}
                                onRemoveTag={props.onRemoveTag}
                            />
                        )
                    })}
                </div>
            )}
        </div>
    );
};

export const LayersPanel: React.FC<LayersPanelProps> = (props) => {
    const {
      images, visualLayerOrder, onRenameImage, onSelectLayer, onCenterOnLayer, onSelectImages, onDeleteImage, onReorderTopLevelLayer,
      selectedAnnotations, onSelectAnnotation, groups,
      onDeleteGroup, onRenameGroup, onToggleGroupExpanded, onAddImageToGroup, onUngroupImages,
      canvasAnnotations, onReparentCanvasAnnotationsToImage, selectedImageIds, onReorderLayer,
      selectedLayerId, onReparentImageAnnotationsToCanvas, parentImageIds, expandedImageAnnotationIds, onToggleImageAnnotationsExpanded, onReparentGroup,
      onReverseLayerOrder, onAddTag, onRemoveTag,
    } = props;

    const [isMainDragOver, setIsMainDragOver] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [dateSort, setDateSort] = useState<'newest' | 'oldest'>('newest');
    const [tagInputFocused, setTagInputFocused] = useState(false);

    const imageMap = useMemo(() => new Map(images.map(i => [i.id, i])), [images]);

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        images.forEach(image => {
            image.tags?.forEach(tag => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    }, [images]);

    const filteredTags = useMemo(() => {
        if (!tagFilter) return allTags;
        return allTags.filter(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()));
    }, [allTags, tagFilter]);

    const getGroupDate = useCallback((group: Group): Date | null => {
        const imageIds = getAllImageIdsInGroup(group.id, groups);
        if (imageIds.length === 0) return null;
        
        const dates = imageIds
            .map(id => imageMap.get(id)?.createdAt)
            .filter((d): d is Date => !!d);

        if (dates.length === 0) return null;

        // Use the newest date for the group
        return new Date(Math.max(...dates.map(d => new Date(d).getTime())));
    }, [groups, imageMap]);

    const displayLayers = useMemo(() => {
        // 1. Sort
        let sortedLayers = [...visualLayerOrder];
        if (dateSort !== 'newest') { // 'newest' is the default visual order
             sortedLayers.sort((a, b) => {
                const dateA = 'element' in a ? new Date(a.createdAt) : getGroupDate(a);
                const dateB = 'element' in b ? new Date(b.createdAt) : getGroupDate(b);
                if (!dateA || !dateB) return 0;
                
                const timeA = dateA.getTime();
                const timeB = dateB.getTime();

                return dateSort === 'oldest' ? timeA - timeB : timeB - timeA;
            });
        }
       
        // 2. Filter
        const lowerCaseNameSearch = searchTerm.trim().toLowerCase();
        const lowerCaseTagFilter = tagFilter.trim().toLowerCase();

        if (!lowerCaseNameSearch && !lowerCaseTagFilter) {
            return sortedLayers;
        }
        
        const filterRecursive = (items: (Group | CanvasImage)[]): (Group | CanvasImage)[] => {
            const result: (Group | CanvasImage)[] = [];
            for (const item of items) {
                if ('groupIds' in item) { // Is Group
                    const children = getOrderedChildrenOfGroup(item, images, groups);
                    const filteredChildren = filterRecursive(children);
                    
                    const groupNameMatches = !lowerCaseNameSearch || item.name.toLowerCase().includes(lowerCaseNameSearch);

                    if (filteredChildren.length > 0) {
                        result.push(item);
                    } else if (groupNameMatches && !lowerCaseTagFilter) {
                        result.push(item);
                    }
                } else { // Is CanvasImage
                    const imageNameMatches = !lowerCaseNameSearch || item.name.toLowerCase().includes(lowerCaseNameSearch);
                    const imageTagMatches = !lowerCaseTagFilter || (item.tags?.some(tag => tag.toLowerCase().includes(lowerCaseTagFilter)) ?? false);

                    if (imageNameMatches && imageTagMatches) {
                        result.push(item);
                    }
                }
            }
            return result;
        };

        return filterRecursive(sortedLayers);
    }, [searchTerm, tagFilter, dateSort, visualLayerOrder, images, groups, getGroupDate]);

    const { isFirst, isLast } = useMemo(() => {
        if (!selectedLayerId) return { isFirst: true, isLast: true };

        const movedItemIsGroup = groups.some(g => g.id === selectedLayerId);
        const movedGroup = movedItemIsGroup ? groups.find(g => g.id === selectedLayerId) : undefined;
        const parentGroup = movedGroup
            ? groups.find(g => g.id === movedGroup.parentId)
            : groups.find(g => g.imageIds.includes(selectedLayerId));

        const items = parentGroup
            ? getOrderedChildrenOfGroup(parentGroup, images, groups)
            : visualLayerOrder;
        
        const currentIndex = items.findIndex(l => l.id === selectedLayerId);
        
        if (currentIndex === -1) return { isFirst: true, isLast: true };
        
        return {
            isFirst: currentIndex === 0,
            isLast: currentIndex === items.length - 1
        };
    }, [selectedLayerId, visualLayerOrder, groups, images]);

    const handleAnnotationSelect = (imageId: string | null, annotationId: string, e: React.MouseEvent) => {
        onSelectAnnotation(imageId, annotationId, { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey });
    };

    const handleMainDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsMainDragOver(false);

      const annotationPayload = e.dataTransfer.getData('application/json');
      if (annotationPayload) {
          try {
              const data = JSON.parse(annotationPayload);
              if (data.annotationId && data.imageId) { // From an image
                  const isDraggedSelected = selectedAnnotations.some(s => s.annotationId === data.annotationId);
                  const selectionsToMove = isDraggedSelected 
                      ? selectedAnnotations.filter(s => s.imageId !== null) as { imageId: string; annotationId: string }[]
                      : [{ annotationId: data.annotationId, imageId: data.imageId }];
                  
                  if (selectionsToMove.length > 0) onReparentImageAnnotationsToCanvas(selectionsToMove);
              }
          } catch {}
          return;
      }

      const layerId = e.dataTransfer.getData('layer-id');
      const layerType = e.dataTransfer.getData('layer-type');

      if (layerType === 'group' && layerId) {
          onReparentGroup(layerId, null); // Drop group to top level
          return;
      }

      const imageIdForUngrouping = e.dataTransfer.getData('image-id-for-ungrouping');
      if (imageIdForUngrouping) {
          onUngroupImages([imageIdForUngrouping]);
          return;
      }
    };

    return (
        <aside className="absolute bottom-4 right-4 z-20 w-80 h-[400px] bg-gray-900/80 backdrop-blur-sm text-gray-300 flex flex-col rounded-lg border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between p-2 border-b border-gray-700">
                <div className="flex items-center">
                    <LayersIcon className="w-5 h-5 mr-2 text-gray-400" />
                    <h2 className="text-sm font-bold text-white">Layers</h2>
                </div>
                <div className="flex items-center">
                    <button onClick={onReverseLayerOrder} title="Reverse Layer Order" className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors">
                        <ChevronsUpDownIcon />
                    </button>
                </div>
            </div>

            <div className="p-2 border-b border-gray-700 space-y-2 relative z-10">
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2">
                        <SearchIcon className="w-4 h-4 text-gray-500" />
                    </span>
                    <input
                        type="text"
                        placeholder="Search by name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-800 text-sm text-gray-200 rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500 pl-8 pr-8 py-1"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 hover:text-white">
                            <XIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
                 <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2">
                        <TagIcon className="w-4 h-4 text-gray-500" />
                    </span>
                    <input
                        type="text"
                        placeholder="Filter by tag..."
                        value={tagFilter}
                        onFocus={() => setTagInputFocused(true)}
                        onBlur={() => setTagInputFocused(false)}
                        onChange={(e) => setTagFilter(e.target.value)}
                        className="w-full bg-gray-800 text-sm text-gray-200 rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500 pl-8 pr-8 py-1"
                    />
                    {tagFilter && (
                        <button onClick={() => setTagFilter('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 hover:text-white">
                            <XIcon className="w-4 h-4" />
                        </button>
                    )}
                    
                    {tagInputFocused && (allTags.length > 0 || tagFilter) && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-xl max-h-40 overflow-y-auto z-50">
                             {filteredTags.length > 0 ? (
                                filteredTags.map(tag => (
                                    <button
                                        key={tag}
                                        className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-blue-600 hover:text-white transition-colors border-b border-gray-700 last:border-0"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setTagFilter(tag);
                                            setTagInputFocused(false);
                                        }}
                                    >
                                        {tag}
                                    </button>
                                ))
                             ) : (
                                 <div className="px-3 py-2 text-xs text-gray-500 italic">No matching tags</div>
                             )}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end text-xs">
                    <button 
                      onClick={() => setDateSort(d => d === 'newest' ? 'oldest' : 'newest')} 
                      className="flex items-center space-x-1 p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white"
                      title={dateSort === 'newest' ? "Sort: Newest to Oldest" : "Sort: Oldest to Newest"}
                    >
                      {dateSort === 'newest' ? <SortDescendingIcon className="w-4 h-4" /> : <SortAscendingIcon className="w-4 h-4" />}
                      <span>Sort by Date</span>
                    </button>
                </div>
            </div>

            <div 
                className={`flex-grow overflow-y-auto p-2 space-y-2 transition-colors ${isMainDragOver ? 'bg-blue-900/20' : ''}`}
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/json') || e.dataTransfer.types.includes('layer-id')) {
                        e.preventDefault();
                        setIsMainDragOver(true);
                        e.dataTransfer.dropEffect = 'move';
                    }
                }}
                onDragLeave={() => setIsMainDragOver(false)}
                onDrop={handleMainDrop}
            >
                {displayLayers.length === 0 && canvasAnnotations.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">{searchTerm || tagFilter ? 'No matching layers found.' : 'Canvas is empty.'}</p>
                ) : (
                    <>
                        {displayLayers.map((layer) => {
                            const isGroup = 'groupIds' in layer;
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
                                            expandedImageAnnotationIds={expandedImageAnnotationIds}
                                            onToggleImageAnnotationsExpanded={onToggleImageAnnotationsExpanded}
                                            onAddTag={onAddTag}
                                            onRemoveTag={onRemoveTag}
                                        />
                                    ) : (
                                        <CanvasImageItem
                                            image={layer as CanvasImage}
                                            isSelected={selectedImageIds.includes(layer.id)}
                                            onSelect={onSelectLayer}
                                            onCenter={onCenterOnLayer}
                                            onRename={onRenameImage}
                                            onDelete={onDeleteImage}
                                            onReparentCanvasAnnotationsToImage={onReparentCanvasAnnotationsToImage}
                                            onReparentImageAnnotationsToCanvas={onReparentImageAnnotationsToCanvas}
                                            selectedAnnotations={selectedAnnotations}
                                            onSelectAnnotation={handleAnnotationSelect}
                                            isParentOfSelectedAnnotation={parentImageIds.has(layer.id)}
                                            isExpanded={expandedImageAnnotationIds.includes(layer.id)}
                                            onToggleExpanded={onToggleImageAnnotationsExpanded}
                                            onAddTag={onAddTag}
                                            onRemoveTag={onRemoveTag}
                                        />
                                    )}
                                </div>
                            );
                        })}
                        
                        {[...canvasAnnotations].sort((a,b) => a.id.localeCompare(b.id)).map(anno => (
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
                <button onClick={() => onReorderLayer(selectedLayerId!, 'top')} disabled={!selectedLayerId || isFirst} title="Bring to Front" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsUpIcon/></button>
                <button onClick={() => onReorderLayer(selectedLayerId!, 'up')} disabled={!selectedLayerId || isFirst} title="Move Forward" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUpIcon/></button>
                <button onClick={() => onReorderLayer(selectedLayerId!, 'down')} disabled={!selectedLayerId || isLast} title="Move Backward" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDownIcon/></button>
                <button onClick={() => onReorderLayer(selectedLayerId!, 'bottom')} disabled={!selectedLayerId || isLast} title="Send to Back" className="p-2 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsDownIcon/></button>
            </div>
        </aside>
    );
};
