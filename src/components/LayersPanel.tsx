

import React, { useState } from 'react';
import { CanvasImage, Annotation, Group } from '../types';
import { PenToolIcon, TypeIcon, SquareIcon, CircleIcon, TrashIcon, ArrowIcon, ChevronDownIcon, ChevronUpIcon, LayersIcon, LineIcon } from './icons';

type AnnotationSelection = { imageId: string | null; annotationId: string; };

interface LayersPanelProps {
    images: CanvasImage[];
    visualLayerOrder: (Group | CanvasImage)[];
    onRenameImage: (id: string, newName: string) => void;
    onSelectLayer: (id: string, type: 'image' | 'group', options: { shiftKey: boolean, ctrlKey: boolean }) => void;
    onDeleteImage: (id: string) => void;
    selectedAnnotations: AnnotationSelection[];
    onSelectAnnotation: (imageId: string | null, annotationId: string, options: { shiftKey: boolean, ctrlKey: boolean }) => void;
    groups: Group[];
    onDeleteGroup: (id: string) => void;
    onRenameGroup: (groupId: string, newName: string) => void;
    onToggleGroupExpanded: (groupId: string) => void;
    canvasAnnotations: Annotation[];
    onReparentCanvasAnnotationsToImage: (annotationIds: string[], imageId: string) => void;
    onReparentImageAnnotationsToCanvas: (selections: { annotationId: string, imageId: string }[]) => void;
    onReparentImageAnnotationsToImage: (annotations: { annotationId: string, imageId: string }[], newImageId: string) => void;
    selectedImageIds: string[];
    selectedLayerId: string | null;
    expandedImageAnnotationIds: string[];
    onToggleImageAnnotationsExpanded: (imageId: string) => void;
    appStateRef: React.MutableRefObject<any>; // To get fresh state
}

const getAnnotationIcon = (type: Annotation['type']) => {
    switch(type) {
        case 'freehand': return <PenToolIcon className="w-4 h-4" />;
        case 'text': return <TypeIcon className="w-4 h-4" />;
        case 'rect': return <SquareIcon className="w-4 h-4" />;
        case 'circle': return <CircleIcon className="w-4 h-4" />;
        case 'arrow': return <ArrowIcon className="w-4 h-4" />;
        case 'line': return <LineIcon className="w-4 h-4" />;
        default: return <LayersIcon className="w-4 h-4" />;
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
        e.stopPropagation();
    }

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onClick={onSelect}
            className={`flex items-center space-x-2 p-1.5 pl-10 text-xs rounded-md cursor-pointer ${isSelected ? 'bg-blue-600/30' : 'hover:bg-gray-700/50'}`}
        >
            {getAnnotationIcon(annotation.type)}
            <span className="truncate flex-1">{annotation.type}</span>
        </div>
    );
};

const ImageItem: React.FC<Omit<LayersPanelProps, 'visualLayerOrder'> & { image: CanvasImage }> = (props) => {
    const { image, onRenameImage, selectedImageIds, onSelectLayer, expandedImageAnnotationIds, onToggleImageAnnotationsExpanded, selectedAnnotations, onSelectAnnotation, onDeleteImage } = props;
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(image.name);

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

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const type = e.dataTransfer.getData('reparent-type');
        if (type === 'annotation') {
            const annotationId = e.dataTransfer.getData('annotationId');
            const sourceImageId = e.dataTransfer.getData('sourceImageId');
            
            if (sourceImageId && sourceImageId !== image.id) {
                props.onReparentImageAnnotationsToImage([{ annotationId, imageId: sourceImageId }], image.id);
            } else if (!sourceImageId) {
                props.onReparentCanvasAnnotationsToImage([annotationId], image.id);
            }
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }

    const isExpanded = expandedImageAnnotationIds.includes(image.id);
    const formattedDate = new Date(image.createdAt).toLocaleString(undefined, {
        year: '2-digit', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });

    return (
        <div className="flex flex-col">
            <div 
                className={`flex items-center space-x-2 p-1.5 pl-4 rounded-md group ${selectedImageIds.includes(image.id) ? 'bg-blue-600/30' : 'hover:bg-gray-700/50'}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                {image.annotations.length > 0 ? (
                    <button onClick={() => onToggleImageAnnotationsExpanded(image.id)} className="p-0.5 rounded hover:bg-gray-600">
                        {isExpanded ? <ChevronDownIcon className="w-4 h-4"/> : <ChevronUpIcon className="w-4 h-4 -rotate-90"/>}
                    </button>
                ) : <div className="w-5" /> }
                
                <div className="flex-1 overflow-hidden">
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
                            className="truncate block text-sm cursor-pointer"
                            onClick={(e) => onSelectLayer(image.id, 'image', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                            onDoubleClick={() => setIsRenaming(true)}
                        >
                            {image.name}
                        </span>
                    )}
                    <span className="text-xs text-gray-500 block truncate">{formattedDate}</span>
                </div>
                 <button onClick={() => onDeleteImage(image.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 hover:bg-gray-600 transition-opacity">
                    <TrashIcon className="w-3 h-3" />
                 </button>
            </div>
            {isExpanded && image.annotations.length > 0 && (
                 <div className="flex flex-col">
                    {image.annotations.map(anno => (
                        <AnnotationItem
                            key={anno.id}
                            annotation={anno}
                            imageId={image.id}
                            isSelected={selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === image.id)}
                            onSelect={(e) => onSelectAnnotation(image.id, anno.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                        />
                    ))}
                 </div>
            )}
        </div>
    )
}

const GroupItem: React.FC<Omit<LayersPanelProps, 'visualLayerOrder'> & { group: Group }> = (props) => {
    const { group, selectedLayerId, onSelectLayer, onDeleteGroup, onToggleGroupExpanded, onRenameGroup } = props;
    const [isRenaming, setIsRenaming] = useState(false);
    const [name, setName] = useState(group.name);

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

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

    const childImages = group.imageIds.map(id => props.images.find(i => i.id === id)).filter((i): i is CanvasImage => !!i);
    const childGroups = group.groupIds.map(id => props.groups.find(g => g.id === id)).filter((g): g is Group => !!g);

    return (
        <div className="flex flex-col">
            <div 
                className={`flex items-center space-x-2 p-1.5 pl-4 rounded-md group ${selectedLayerId === group.id ? 'bg-blue-600/30' : 'hover:bg-gray-700/50'}`}
                onDragOver={handleDragOver}
            >
                {(childImages.length > 0 || childGroups.length > 0) ? (
                    <button onClick={() => onToggleGroupExpanded(group.id)} className="p-0.5 rounded hover:bg-gray-600">
                        {group.isExpanded ? <ChevronDownIcon className="w-4 h-4"/> : <ChevronUpIcon className="w-4 h-4 -rotate-90"/>}
                    </button>
                ) : <div className="w-5"/>}
                <LayersIcon className="w-4 h-4 text-indigo-400"/>
                {isRenaming ? (
                     <input 
                        type="text" value={name} onChange={handleNameChange} onBlur={handleNameBlur} onKeyDown={handleKeyDown}
                        autoFocus className="bg-gray-900 text-sm focus:ring-1 focus:ring-blue-500 outline-none rounded-sm flex-1"
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span 
                        className="truncate flex-1 text-sm cursor-pointer"
                        onClick={(e) => onSelectLayer(group.id, 'group', { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                        onDoubleClick={() => setIsRenaming(true)}
                    >
                        {group.name}
                    </span>
                )}
                <button onClick={() => onDeleteGroup(group.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 hover:bg-gray-600 transition-opacity">
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
            {group.isExpanded && (
                <div className="pl-4 border-l-2 border-gray-700 ml-6 space-y-1">
                    {childGroups.map(g => <GroupItem key={g.id} {...props} group={g} />)}
                    {childImages.map(img => <ImageItem key={img.id} {...props} image={img} />)}
                </div>
            )}
        </div>
    );
};

const LayersPanel: React.FC<LayersPanelProps> = (props) => {
    const { canvasAnnotations, visualLayerOrder, selectedAnnotations, onSelectAnnotation, onReparentImageAnnotationsToCanvas } = props;

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

    return (
        <aside className="w-80 bg-gray-900 text-gray-300 flex flex-col h-full shadow-lg z-10 border-l border-gray-700">
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold">Layers</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <div 
                    className="flex flex-col"
                    onDrop={handleCanvasDrop}
                    onDragOver={handleCanvasDragOver}
                >
                    <div className="px-2 py-1 text-xs font-bold uppercase text-gray-500">Canvas</div>
                    {canvasAnnotations.map(anno => (
                        <AnnotationItem 
                            key={anno.id}
                            annotation={anno}
                            imageId={null}
                            isSelected={selectedAnnotations.some(s => s.annotationId === anno.id && s.imageId === null)}
                            onSelect={(e) => onSelectAnnotation(null, anno.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                        />
                    ))}
                     {canvasAnnotations.length === 0 && <p className="text-xs text-gray-500 px-2 py-1">No canvas annotations</p>}
                </div>

                <div className="flex flex-col-reverse">
                    {[...visualLayerOrder].reverse().map(layer => {
                        if ('imageIds' in layer) { // It's a Group
                            return <GroupItem key={layer.id} {...props} group={layer} />;
                        } else { // It's a CanvasImage
                            return <ImageItem key={layer.id} {...props} image={layer} />;
                        }
                    })}
                </div>
            </div>
        </aside>
    );
};
// FIX: Changed from named to default export to resolve import error in App.tsx.
export default LayersPanel;