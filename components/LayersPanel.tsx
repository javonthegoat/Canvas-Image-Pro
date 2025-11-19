import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CanvasImage, Annotation, Group } from '../types';
import { PenToolIcon, TypeIcon, SquareIcon, CircleIcon, MousePointerIcon, TrashIcon, ArrowIcon, ChevronDownIcon, ChevronUpIcon, LayersIcon, LineIcon, EyeIcon, EyeOffIcon, TagIcon, ChevronsUpDownIcon, SearchIcon, XIcon } from './icons';

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
        if (imageIds.length === 0) return -Infinity;
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
    const className = "w-3 h-3 flex-shrink-0";
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
    depth: number;
}> = ({ annotation, imageId, isSelected, onSelect, depth }) => {
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
            className={`relative flex items-center py-1 pr-2 cursor-pointer text-xs group hover:bg-gray-800`}
        >
             <div className={`absolute inset-0 ${isSelected ? 'bg-blue-900/50 border-l-2 border-blue-500' : 'border-l-2 border-transparent'}`}></div>
             <div className="relative flex items-center w-full" style={{ paddingLeft: `${(depth + 1) * 16 + 12}px` }}>
                <span className="text-gray-500 mr-2"><AnnotationIcon type={annotation.type} /></span>
                <span className="truncate flex-1 text-gray-400" title={getAnnotationLabel(annotation)}>{getAnnotationLabel(annotation)}</span>
             </div>
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
    existingTags: string[];
}> = ({ image, isSelected, onSelect, onCenter, onRename, onDelete, onReparentCanvasAnnotationsToImage, onReparentImageAnnotationsToCanvas, selectedAnnotations, onSelectAnnotation, isParentOfSelectedAnnotation, isGrouped, isExpanded, onToggleExpanded, depth = 0, onAddTag, onRemoveTag, existingTags }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(image.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [tagInput, setTagInput] = useState('');
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const tagInputRef = useRef<HTMLInputElement>(null);

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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (tagInputRef.current && !tagInputRef.current.contains(e.target as Node)) {
                setShowTagSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
            setShowTagSuggestions(false);
        }
    };

    const filteredTags = existingTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !image.tags?.includes(t));

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
                    if(!isDraggedSelected) {
                        onReparentImageAnnotationsToCanvas([{ annotationId: data.annotationId, imageId: data.imageId }]);
                    }
                }
            }
        } catch (error) {
           // Not an annotation drop
        }
    };

    const formatDateTime = (date: Date) => {
        if (!date) return '';
        return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="relative border-b border-gray-800/50">
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
                onDragEnter={handleDragEnter}
                onDragLeave={() => setIsDragOver(false)}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={(e) => onSelect(image.id, 'image', { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey })}
                className={`group relative flex items-center py-2 pr-2 cursor-pointer transition-colors ${isSelected ? 'text-white' : 'text-gray-300 hover:bg-gray-800'}`}
            >
                {/* Full width background for selection */}
                <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-blue-600' : ''} ${isDragOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-900/30' : ''}`}></div>
                
                {/* Indented Content */}
                <div className="relative flex items-center flex-1 min-w-0 z-10" style={{ paddingLeft: `${depth * 16 + 12}px` }}>
                    {image.annotations.length > 0 ? (
                        <button onClick={(e) => { e.stopPropagation(); onToggleExpanded(image.id); }} className="p-0.5 mr-1 hover:bg-gray-600/50 rounded text-gray-400">
                            {isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                        </button>
                    ) : <span className="w-4 mr-1"></span>}

                    {/* Thumbnail */}
                    <div className="mr-2 flex-shrink-0 text-gray-400 select-none pointer-events-none">
                        <div className="w-6 h-6 bg-gray-700 rounded-sm overflow-hidden flex items-center justify-center border border-gray-600/50">
                            <img src={image.element.src} className="w-full h-full object-cover" alt="" />
                        </div>
                    </div>

                    {/* Name or Input */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex flex-col">
                             {isRenaming ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onBlur={handleRename}
                                    onKeyDown={(e) => { if(e.key === 'Enter') handleRename(); }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full bg-gray-900 text-white px-1 py-0.5 rounded border border-blue-500 outline-none text-xs"
                                />
                            ) : (
                                <span onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }} className="block truncate text-xs font-medium select-none">
                                    {image.name}
                                </span>
                            )}
                            {/* Add Date Display */}
                            <span className="text-[10px] text-gray-500 truncate mt-0.5 select-none">
                                {formatDateTime(image.createdAt)}
                            </span>
                        </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); onDelete(image.id); }} className="p-1 hover:text-red-400 rounded"><TrashIcon className="w-3 h-3" /></button>
                    </div>
                </div>
            </div>

            {/* Tags */}
             {image.tags && image.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 my-1 relative z-10" style={{ paddingLeft: `${depth * 16 + 36}px` }}>
                  {image.tags.map((tag, index) => (
                    <span key={index} className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-gray-700 text-gray-300 border border-gray-600">
                      {tag}
                      <button onClick={() => onRemoveTag(image.id, index)} className="ml-1 text-gray-500 hover:text-gray-100"><XIcon className="w-2 h-2" /></button>
                    </span>
                  ))}
                </div>
             )}
             {/* Tag Input */}
             {isSelected && (
                 <div className="my-1 flex items-center relative z-10" style={{ paddingLeft: `${depth * 16 + 36}px` }} ref={tagInputRef}>
                     <TagIcon className="w-3 h-3 text-gray-500 mr-1" />
                     <input 
                        type="text" 
                        value={tagInput}
                        onFocus={() => setShowTagSuggestions(true)}
                        onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
                        onKeyDown={handleAddTag}
                        placeholder="Add tag..."
                        className="bg-transparent text-[10px] text-gray-300 placeholder-gray-600 outline-none w-full border-b border-gray-700 focus:border-blue-500 pb-0.5"
                     />
                     {showTagSuggestions && filteredTags.length > 0 && (
                         <div className="absolute top-full left-0 mt-1 min-w-[120px] bg-gray-800 border border-gray-700 rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                             {filteredTags.map(tag => (
                                 <div 
                                    key={tag}
                                    className="px-2 py-1 text-xs text-gray-300 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center"
                                    onClick={() => { onAddTag(image.id, tag); setTagInput(''); setShowTagSuggestions(false); }}
                                 >
                                     {tag}
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
             )}

            {/* Annotations */}
            {isExpanded && image.annotations.length > 0 && (
                 <div className="border-l border-gray-800/50 ml-[10px]">
                    {[...image.annotations].reverse().map(anno => (
                         <AnnotationListItem
                            key={anno.id}
                            annotation={anno}
                            imageId={image.id}
                            isSelected={selectedAnnotations.some(sel => sel.annotationId === anno.id)}
                            onSelect={onSelectAnnotation}
                            depth={depth}
                         />
                    ))}
                </div>
            )}
        </div>
    );
};

const GroupItem: React.FC<{
    group: Group;
    isSelected: boolean;
    onSelect: (id: string, type: 'group', options: { shiftKey: boolean, ctrlKey: boolean }) => void;
    onToggleExpanded: (id: string) => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
    children: React.ReactNode;
    depth?: number;
    onAddImageToGroup: (groupId: string, imageId: string) => void;
    onReparentGroup: (childGroupId: string, parentGroupId: string) => void;
    onRenameGroupLabel: (groupId: string, newLabel: string) => void;
    onToggleGroupLabel: (groupId: string, newLabel: string) => void;
}> = ({ group, isSelected, onSelect, onToggleExpanded, onRename, onDelete, children, depth = 0, onAddImageToGroup, onReparentGroup, onRenameGroupLabel, onToggleGroupLabel }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(group.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isRenaming]);

     const handleRename = () => {
        if (name.trim()) {
            onRename(group.id, name.trim());
        } else {
            setName(group.name);
        }
        setIsRenaming(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const layerType = e.dataTransfer.getData('layer-type');
        const layerId = e.dataTransfer.getData('layer-id');
        if (layerType === 'image' && layerId) {
            onAddImageToGroup(group.id, layerId);
        } else if (layerType === 'group' && layerId && layerId !== group.id) {
             onReparentGroup(layerId, group.id);
        }
    };

    return (
        <div className="relative">
            <div
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('layer-id', group.id);
                    e.dataTransfer.setData('layer-type', 'group');
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={(e) => onSelect(group.id, 'group', { shiftKey: e.shiftKey, ctrlKey: e.metaKey || e.ctrlKey })}
                className={`group relative flex items-center py-2 pr-2 cursor-pointer transition-colors ${isSelected ? 'text-white' : 'text-gray-300 hover:bg-gray-800'}`}
            >
                {/* Full width background */}
                <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-blue-600' : ''} ${isDragOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-900/30' : ''}`}></div>
                
                {/* Indented Content */}
                <div className="relative flex items-center flex-1 min-w-0 z-10" style={{ paddingLeft: `${depth * 16 + 12}px` }}>
                    <button onClick={(e) => { e.stopPropagation(); onToggleExpanded(group.id); }} className="p-0.5 mr-1 hover:bg-gray-600/50 rounded text-gray-400">
                        {group.isExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUpIcon className="w-3 h-3" />}
                    </button>
                    <LayersIcon className={`w-4 h-4 mr-2 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
                    
                    <div className="flex-1 min-w-0 truncate">
                        {isRenaming ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={(e) => { if(e.key === 'Enter') handleRename(); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-gray-900 text-white px-1 py-0.5 rounded border border-blue-500 outline-none text-xs"
                            />
                        ) : (
                            <span onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }} className="block truncate text-xs font-bold select-none">
                                {group.name}
                            </span>
                        )}
                    </div>

                     <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={(e) => { e.stopPropagation(); onToggleGroupLabel(group.id, group.label); }} className={`p-1 rounded ${group.showLabel ? 'text-blue-300' : 'text-gray-500 hover:text-gray-300'}`} title="Toggle Label on Canvas">
                             {group.showLabel ? <EyeIcon className="w-3 h-3" /> : <EyeOffIcon className="w-3 h-3" />}
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); onDelete(group.id); }} className="p-1 hover:text-red-400 rounded"><TrashIcon className="w-3 h-3" /></button>
                     </div>
                </div>
            </div>
            {group.isExpanded && children}
        </div>
    );
};


export const LayersPanel: React.FC<LayersPanelProps> = ({
  images,
  visualLayerOrder,
  onRenameImage,
  onSelectLayer,
  onCenterOnLayer,
  onSelectImages,
  onDeleteImage,
  onReorderTopLevelLayer,
  onReorderLayer,
  selectedAnnotations,
  onSelectAnnotation,
  groups,
  onDeleteGroup,
  onRenameGroup,
  onToggleGroupExpanded,
  onAddImageToGroup,
  onUngroupImages,
  canvasAnnotations,
  onReparentCanvasAnnotationsToImage,
  onReparentImageAnnotationsToCanvas,
  selectedImageIds,
  selectedLayerId,
  parentImageIds,
  expandedImageAnnotationIds,
  onToggleImageAnnotationsExpanded,
  onReparentGroup,
  onRenameGroupLabel,
  onToggleGroupLabel,
  onReverseLayerOrder,
  onAddTag,
  onRemoveTag
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
    const searchInputRef = useRef<HTMLDivElement>(null);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        images.forEach(img => img.tags?.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [images]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
                setShowSearchSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredSearchTags = useMemo(() => {
        if (!searchQuery) return allTags;
        return allTags.filter(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [allTags, searchQuery]);

    const renderLayerItem = (item: Group | CanvasImage, depth: number = 0) => {
        if ('imageIds' in item) { // It's a group
            const group = item as Group;
            let children = getOrderedChildrenOfGroup(group, images, groups);

            // Apply Search Filter to Group Children recursively
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                children = children.filter(child => {
                    const check = (node: Group | CanvasImage): boolean => {
                        const nMatch = node.name.toLowerCase().includes(query);
                        const tMatch = 'tags' in node && node.tags?.some(t => t.toLowerCase().includes(query));
                        if (nMatch || tMatch) return true;
                        
                        if ('imageIds' in node) { // is Group, check descendants
                            const kids = getOrderedChildrenOfGroup(node as Group, images, groups);
                            return kids.some(k => check(k));
                        }
                        return false;
                    };
                    return check(child);
                });
            }
            
            const hasMatchingChildren = children.length > 0;
            const groupMatches = group.name.toLowerCase().includes(searchQuery.toLowerCase());

            if (searchQuery && !groupMatches && !hasMatchingChildren) {
                return null;
            }

            // Always expand if searching and we have matches inside
            const isExpanded = searchQuery ? true : group.isExpanded;

            return (
                <GroupItem
                    key={group.id}
                    group={{...group, isExpanded}}
                    isSelected={selectedLayerId === group.id}
                    onSelect={onSelectLayer}
                    onToggleExpanded={onToggleGroupExpanded}
                    onRename={onRenameGroup}
                    onDelete={onDeleteGroup}
                    depth={depth}
                    onAddImageToGroup={onAddImageToGroup}
                    onReparentGroup={onReparentGroup}
                    onRenameGroupLabel={onRenameGroupLabel}
                    onToggleGroupLabel={onToggleGroupLabel}
                >
                    {children.map(child => renderLayerItem(child, depth + 1))}
                </GroupItem>
            );
        } else { // It's an image
            const image = item as CanvasImage;
            
            if (searchQuery) {
                 const query = searchQuery.toLowerCase();
                 const nameMatch = image.name.toLowerCase().includes(query);
                 const tagMatch = image.tags?.some(t => t.toLowerCase().includes(query));
                 if (!nameMatch && !tagMatch) return null;
            }

            return (
                <CanvasImageItem
                    key={image.id}
                    image={image}
                    isSelected={selectedImageIds.includes(image.id) && selectedLayerId !== null} 
                    onSelect={onSelectLayer}
                    onCenter={onCenterOnLayer}
                    onRename={onRenameImage}
                    onDelete={onDeleteImage}
                    onReparentCanvasAnnotationsToImage={onReparentCanvasAnnotationsToImage}
                    onReparentImageAnnotationsToCanvas={onReparentImageAnnotationsToCanvas}
                    selectedAnnotations={selectedAnnotations}
                    onSelectAnnotation={onSelectAnnotation}
                    isParentOfSelectedAnnotation={parentImageIds.has(image.id)}
                    isGrouped={groups.some(g => g.imageIds.includes(image.id))}
                    isExpanded={expandedImageAnnotationIds.includes(image.id)}
                    onToggleExpanded={onToggleImageAnnotationsExpanded}
                    depth={depth}
                    onAddTag={onAddTag}
                    onRemoveTag={onRemoveTag}
                    existingTags={allTags}
                />
            );
        }
    };

    // Canvas annotations list
    const renderCanvasAnnotations = () => {
        if (canvasAnnotations.length === 0) return null;
        if (searchQuery) return null; 
        return (
             <div className="mt-4 pt-4 border-t border-gray-800">
                <h3 className="px-4 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Canvas Annotations</h3>
                <div className="">
                    {[...canvasAnnotations].reverse().map(anno => (
                        <AnnotationListItem
                            key={anno.id}
                            annotation={anno}
                            imageId={null}
                            isSelected={selectedAnnotations.some(sel => sel.annotationId === anno.id)}
                            onSelect={onSelectAnnotation}
                            depth={-0.5} // Slight indent
                        />
                    ))}
                </div>
            </div>
        );
    };

  return (
    <div className="w-64 bg-gray-900 border-l border-gray-800 flex flex-col h-full shadow-2xl">
        <div className="p-4 border-b border-gray-800 bg-gray-900 z-20">
             <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-white flex items-center text-sm"><LayersIcon className="mr-2 w-4 h-4" /> Layers</h2>
                 <div className="flex space-x-1">
                     <button onClick={onReverseLayerOrder} title="Reverse Layer Order" className="p-1.5 hover:bg-gray-800 rounded text-gray-400 transition-colors">
                         <ChevronsUpDownIcon className="w-4 h-4" />
                     </button>
                 </div>
            </div>
            {/* Search Bar with Autocomplete */}
            <div className="relative" ref={searchInputRef}>
                <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                    type="text"
                    placeholder="Filter layers or tags..."
                    value={searchQuery}
                    onFocus={() => setShowSearchSuggestions(true)}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowSearchSuggestions(true); }}
                    className="w-full bg-gray-800 text-xs text-gray-200 pl-8 pr-8 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none transition-colors placeholder-gray-600"
                />
                {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setShowSearchSuggestions(false); }} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-white">
                        <XIcon className="w-3 h-3" />
                    </button>
                )}

                {/* Suggestions Dropdown */}
                {showSearchSuggestions && filteredSearchTags.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
                         <div className="px-2 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-800 sticky top-0">Tags</div>
                        {filteredSearchTags.map(tag => (
                            <div
                                key={tag}
                                className="px-3 py-1.5 text-xs text-gray-300 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center"
                                onClick={() => { setSearchQuery(tag); setShowSearchSuggestions(false); }}
                            >
                                <TagIcon className="w-3 h-3 mr-2 opacity-70" />
                                {tag}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
        
        <div 
            className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const type = e.dataTransfer.getData('layer-type');
                const id = e.dataTransfer.getData('layer-id');
                const ungroupImageId = e.dataTransfer.getData('image-id-for-ungrouping');
                
                if (type === 'image' && ungroupImageId) {
                    onUngroupImages([ungroupImageId]);
                } else if (type === 'group' && id) {
                     onReparentGroup(id, null); // Move to top level
                }
            }}
        >
            {visualLayerOrder.length === 0 && canvasAnnotations.length === 0 && (
                <div className="text-center text-gray-600 text-xs mt-10 italic">
                    No layers
                </div>
            )}
            
            {visualLayerOrder.map(item => renderLayerItem(item))}

            {renderCanvasAnnotations()}
        </div>
    </div>
  );
};