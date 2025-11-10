
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CanvasImage, AspectRatio, AnnotationTool, Rect, Annotation, TextAnnotation } from '../types';
import { UploadIcon, ZoomInIcon, ZoomOutIcon, RotateCwIcon, CropIcon, PenToolIcon, TypeIcon, SquareIcon, CircleIcon, MousePointerIcon, TrashIcon, UndoIcon, RedoIcon, ArrowIcon, XIcon, SendToBackIcon, ChevronDownIcon, ChevronUpIcon, BringToFrontIcon, AlignLeftIcon, AlignHorizontalCenterIcon, AlignRightIcon, AlignTopIcon, AlignVerticalCenterIcon, AlignBottomIcon, CopyIcon, DownloadIcon, LineIcon, ArrangeHorizontalIcon, ArrangeVerticalIcon, EyedropperIcon, MaximizeIcon, SaveIcon, FolderOpenIcon } from './icons';
import { ColorInput } from './ColorInput';

interface LeftSidebarProps {
  onFileChange: (files: FileList | null) => void;
  selectedImage: CanvasImage | null;
  selectedImageIds: string[];
  onUpdateSelectedImages: (changes: Partial<CanvasImage>) => void;
  cropArea: Rect | null;
  onCrop: () => void;
  onCopyToClipboard: () => Promise<void>;
  onResetCrop: () => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  toolOptions: { color: string; strokeWidth: number; fontSize: number; fontFamily: string; backgroundColor: string; backgroundOpacity: number; strokeColor: string; strokeOpacity: number; fillColor: string; fillOpacity: number; outlineColor: string; outlineWidth: number; outlineOpacity: number; };
  setToolOptions: (options: any) => void;
  images: CanvasImage[];
  onRenameImage: (id: string, newName: string) => void;
  setSelectedImageId: (id: string | null, multiSelect?: boolean) => void;
  onCropToView: () => void;
  onDeleteImage: (id: string) => void;
  onReorderImages: (dragId: string, dropId: string) => void;
  onReorderImageLayer: (imageId: string, direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAlignImages: (alignment: 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom') => void;
  onArrangeImages: (direction: 'horizontal' | 'vertical') => void;
  exportFormat: 'png' | 'jpeg';
  setExportFormat: (format: 'png' | 'jpeg') => void;
  onFitCropToImage: () => void;
  isLocked?: boolean;
  onClearAllCanvas: () => void;
  onDownloadAllCanvas: () => void;
  onUncrop: (imageIds: string[]) => void;
  onReparentAnnotation: (annotationId: string, oldImageId: string, newImageId: string) => void;
  selectedAnnotations: Array<{ imageId: string; annotationId: string; }>;
  setSelectedAnnotations: (selection: Array<{ imageId: string; annotationId: string; }>) => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
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
    imageId: string;
    isSelected: boolean;
    onSelect: (imageId: string, annotationId: string) => void;
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
                e.dataTransfer.setData('application/json', JSON.stringify({ annotationId: annotation.id, imageId }));
                e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(imageId, annotation.id);
            }}
            className={`flex items-center p-1.5 pl-4 rounded-md space-x-2 text-xs ml-4 transition-all duration-150 cursor-pointer ${isSelected ? 'bg-blue-900' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
            <span className="text-gray-400"><AnnotationIcon type={annotation.type} /></span>
            <span className="truncate flex-1" title={getAnnotationLabel(annotation)}>{getAnnotationLabel(annotation)}</span>
        </div>
    );
};


const CanvasImageItem: React.FC<{
    image: CanvasImage;
    isSelected: boolean;
    onSelect: (id: string, multiSelect?: boolean) => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
    onReorder: (dragId: string, dropId: string) => void;
    onReparentAnnotation: (annotationId: string, oldImageId: string, newImageId: string) => void;
    selectedAnnotations: Array<{ imageId: string; annotationId: string; }>;
    onSelectAnnotation: (imageId: string, annotationId: string) => void;
    isParentOfSelectedAnnotation: boolean;
}> = ({ image, isSelected, onSelect, onRename, onDelete, onReorder, onReparentAnnotation, selectedAnnotations, onSelectAnnotation, isParentOfSelectedAnnotation }) => {
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

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.annotationId && data.imageId) {
                onReparentAnnotation(data.annotationId, data.imageId, image.id);
            }
        } catch (error) {
            const dragId = e.dataTransfer.getData('text/plain');
            if (dragId && dragId !== image.id) {
                onReorder(dragId, image.id);
            }
        }
    };

    return (
        <div
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`bg-gray-800 rounded-md transition-all duration-150 ${ringClasses}`}
        >
            <div
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', image.id);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                className={`flex items-center justify-between p-2 rounded-t-md space-x-2 ${isSelected ? 'bg-blue-800' : 'hover:bg-gray-700'} ${isExpanded && 'rounded-b-none'}`}
            >
                <div 
                    onClick={(e) => onSelect(image.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                    className="flex items-center flex-1 min-w-0 space-x-3 cursor-pointer"
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
                    {image.annotations.map(anno => (
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

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onFileChange,
  selectedImage,
  selectedImageIds,
  onUpdateSelectedImages,
  cropArea,
  onCrop,
  onCopyToClipboard,
  onResetCrop,
  aspectRatio,
  setAspectRatio,
  activeTool,
  setActiveTool,
  toolOptions,
  setToolOptions,
  images,
  onRenameImage,
  setSelectedImageId,
  onCropToView,
  onDeleteImage,
  onReorderImages,
  onReorderImageLayer,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAlignImages,
  onArrangeImages,
  exportFormat,
  setExportFormat,
  onFitCropToImage,
  isLocked,
  onClearAllCanvas,
  onDownloadAllCanvas,
  onUncrop,
  onReparentAnnotation,
  selectedAnnotations,
  setSelectedAnnotations,
  onSaveProject,
  onLoadProject,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadProjectInputRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const confirmTimeoutRef = useRef<number | null>(null);
  const parentImageIds = useMemo(() => new Set(selectedAnnotations.map(sel => sel.imageId)), [selectedAnnotations]);

  useEffect(() => {
      return () => {
        if (confirmTimeoutRef.current) {
          clearTimeout(confirmTimeoutRef.current);
        }
      };
  }, []);

  const handleClearClick = () => {
    if (isConfirmingClear) {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
      onClearAllCanvas();
      setIsConfirmingClear(false);
    } else {
      setIsConfirmingClear(true);
      confirmTimeoutRef.current = window.setTimeout(() => {
        setIsConfirmingClear(false);
      }, 3000);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleLoadProjectClick = () => {
    loadProjectInputRef.current?.click();
  };

  const handleLoadProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadProject(file);
    }
    e.target.value = '';
  };
  
  const handleCopyClick = async () => {
    if (copyStatus !== 'idle') return;
    
    await onCopyToClipboard();
    
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  const handleNumericInputChange = (field: 'scale' | 'rotation', value: string) => {
    if (selectedImageIds.length > 0) {
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue)) {
        onUpdateSelectedImages({ [field]: numericValue });
      }
    }
  };

  const handleButtonClick = (field: 'scale' | 'rotation', change: number) => {
    if (selectedImage) {
      const currentValue = selectedImage[field];
      onUpdateSelectedImages({ [field]: currentValue + change });
    }
  };
  
  const aspectRatios: AspectRatio[] = ['free', '1:1', '4:3', '16:9'];
  const tools: { name: AnnotationTool, icon: React.ReactNode, title: string }[] = [
    { name: 'select', icon: <MousePointerIcon />, title: 'Select & Move (V)' },
    { name: 'eyedropper', icon: <EyedropperIcon />, title: 'Eyedropper (I)' },
    { name: 'line', icon: <LineIcon />, title: 'Draw Line' },
    { name: 'arrow', icon: <ArrowIcon />, title: 'Draw Arrow' },
    { name: 'freehand', icon: <PenToolIcon />, title: 'Freehand Draw' },
    { name: 'rect', icon: <SquareIcon />, title: 'Draw Rectangle' },
    { name: 'circle', icon: <CircleIcon />, title: 'Draw Circle' },
    { name: 'text', icon: <TypeIcon />, title: 'Add Text' },
  ];

  const getEditingLabel = () => {
    if (selectedImageIds.length === 0) return 'Select an image to edit.';
    if (selectedImageIds.length === 1 && selectedImage) return `Editing: ${selectedImage.name}`;
    return `Editing ${selectedImageIds.length} images.`;
  };

  const isDisabled = isLocked;
  const showUncrop = selectedImageIds.length > 0 && images.some(img => selectedImageIds.includes(img.id) && img.uncroppedFromId);

  const commonImageProps = useMemo(() => {
    if (selectedImageIds.length === 0) return null;
    const selected = images.filter(img => selectedImageIds.includes(img.id));
    if (selected.length === 0) return null;

    const first = selected[0];
    const common = {
        outlineColor: first.outlineColor ?? '#000000',
        outlineWidth: first.outlineWidth ?? 0,
    };

    for (let i = 1; i < selected.length; i++) {
        if ((selected[i].outlineColor ?? '#000000') !== common.outlineColor) {
            (common as any).outlineColor = 'multi';
        }
        if ((selected[i].outlineWidth ?? 0) !== common.outlineWidth) {
            (common as any).outlineWidth = 'multi';
        }
    }
    return common;
  }, [selectedImageIds, images]);

  const handleSelectAnnotation = (imageId: string, annotationId: string) => {
      setSelectedAnnotations([{ imageId, annotationId }]);
      setSelectedImageId(null);
  };

  return (
    <aside className={`w-64 bg-gray-900 text-gray-300 p-4 flex flex-col space-y-6 h-full shadow-lg z-10 border-r border-gray-700 transition-opacity duration-300 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ImagePro</h1>
        <div className="flex items-center space-x-1">
            <button onClick={onUndo} disabled={!canUndo || isDisabled} title="Undo (Ctrl+Z)" className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <UndoIcon />
            </button>
            <button onClick={onRedo} disabled={!canRedo || isDisabled} title="Redo (Ctrl+Y)" className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <RedoIcon />
            </button>
        </div>
      </div>


      <div>
        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => onFileChange(e.target.files)}
          disabled={isDisabled}
        />
        <input
          type="file"
          accept=".cpro"
          ref={loadProjectInputRef}
          className="hidden"
          onChange={handleLoadProjectFileChange}
          disabled={isDisabled}
        />
        <div className="flex space-x-2">
            <button
              onClick={handleUploadClick}
              disabled={isDisabled}
              className="flex-1 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              <UploadIcon />
              <span className="ml-2">Images</span>
            </button>
            <button
              onClick={handleLoadProjectClick}
              disabled={isDisabled}
              title="Load Project File (.cpro)"
              className="p-2 px-3 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              <FolderOpenIcon />
            </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">or drag & drop / paste from clipboard</p>
      </div>

       <div className="space-y-3 pt-3 border-t border-gray-800">
          <h2 className="text-lg font-semibold -mt-1 mb-2 text-gray-100">Canvas Actions</h2>
          <button
            onClick={onSaveProject}
            disabled={images.length === 0}
            className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            <SaveIcon />
            <span className="ml-2">Save Project</span>
          </button>
          <button
            onClick={onDownloadAllCanvas}
            disabled={images.length === 0}
            className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            <DownloadIcon />
            <span className="ml-2">Download All Layers</span>
          </button>
          <button
            onClick={handleClearClick}
            disabled={images.length === 0}
            className={`w-full flex items-center justify-center font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500 ${
              isConfirmingClear
                ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isConfirmingClear ? (
              'Confirm Clear'
            ) : (
              <>
                <TrashIcon />
                <span className="ml-2">Clear All Layers</span>
              </>
            )}
          </button>
        </div>
      
      <div className="flex-grow flex flex-col space-y-6 overflow-y-auto pr-2">
        {/* Annotation Tools */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 text-gray-100">Tools</h2>
          <div className="grid grid-cols-4 gap-2">
            {tools.map(tool => (
              <button
                key={tool.name}
                title={tool.title}
                onClick={() => setActiveTool(tool.name)}
                disabled={isDisabled}
                className={`p-2 flex justify-center items-center rounded-md transition-colors ${activeTool === tool.name ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'} disabled:bg-gray-800 disabled:cursor-not-allowed`}
              >
                {tool.icon}
              </button>
            ))}
          </div>
          
          {activeTool !== 'select' && activeTool !== 'eyedropper' && (
            <div className="space-y-3 pt-2 border-t border-gray-800">
               <ColorInput
                  label={activeTool === 'text' ? 'Text Color' : 'Stroke/Line Color'}
                  color={toolOptions.color}
                  onChange={newColor => setToolOptions((prev: any) => ({ ...prev, color: newColor }))}
                />

              {activeTool !== 'text' && (
                <div>
                  <label htmlFor="stroke-width" className="block text-sm font-medium mb-1">Stroke/Line Width ({toolOptions.strokeWidth}px)</label>
                  <input id="stroke-width" type="range" min="0" max="50" value={toolOptions.strokeWidth} onChange={e => setToolOptions((prev: any) => ({ ...prev, strokeWidth: parseInt(e.target.value, 10) }))} className="w-full" />
                </div>
              )}

              {(activeTool === 'rect' || activeTool === 'circle') && (
                <div className="space-y-3 pt-2 border-t border-gray-800">
                  <h3 className="text-sm font-medium">Fill</h3>
                  <ColorInput
                    label="Color"
                    color={toolOptions.fillColor}
                    onChange={newColor => setToolOptions((prev: any) => ({ ...prev, fillColor: newColor }))}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">Opacity</label>
                    <input id="fill-opacity" type="range" min="0" max="1" step="0.1" value={toolOptions.fillOpacity} onChange={e => setToolOptions((prev: any) => ({ ...prev, fillOpacity: parseFloat(e.target.value) }))} className="w-full" title={`Opacity: ${toolOptions.fillOpacity}`} />
                  </div>
                </div>
              )}

              {(activeTool === 'freehand' || activeTool === 'arrow' || activeTool === 'line') && (
                 <div className="space-y-3 pt-2 border-t border-gray-800">
                  <h3 className="text-sm font-medium">Outline</h3>
                   <ColorInput
                    label="Color"
                    color={toolOptions.outlineColor}
                    onChange={newColor => setToolOptions((prev: any) => ({ ...prev, outlineColor: newColor }))}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">Opacity</label>
                    <input id="outline-opacity" type="range" min="0" max="1" step="0.1" value={toolOptions.outlineOpacity} onChange={e => setToolOptions((prev: any) => ({ ...prev, outlineOpacity: parseFloat(e.target.value) }))} className="w-full" title={`Opacity: ${toolOptions.outlineOpacity}`} />
                  </div>
                  <div>
                    <label htmlFor="outline-width" className="block text-sm font-medium mb-1">Width ({toolOptions.outlineWidth}px)</label>
                    <input id="outline-width" type="range" min="0" max="50" value={toolOptions.outlineWidth} onChange={e => setToolOptions((prev: any) => ({ ...prev, outlineWidth: parseInt(e.target.value, 10) }))} className="w-full" />
                  </div>
                </div>
              )}

              {activeTool === 'text' && (
                <>
                  <div>
                    <label htmlFor="font-size" className="block text-sm font-medium mb-1">Font Size ({toolOptions.fontSize}px)</label>
                    <input id="font-size" type="range" min="8" max="128" value={toolOptions.fontSize} onChange={e => setToolOptions((prev: any) => ({ ...prev, fontSize: parseInt(e.target.value, 10) }))} className="w-full" />
                  </div>
                  <div>
                    <label htmlFor="font-family" className="block text-sm font-medium mb-1">Font Family</label>
                    <select id="font-family" value={toolOptions.fontFamily} onChange={e => setToolOptions((prev: any) => ({ ...prev, fontFamily: e.target.value }))} className="w-full bg-gray-800 rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500">
                      <option>Arial</option><option>Verdana</option><option>Times New Roman</option><option>Courier New</option><option>Comic Sans MS</option>
                    </select>
                  </div>
                  <div className="space-y-3 pt-2 border-t border-gray-800">
                    <h3 className="text-sm font-medium">Background</h3>
                    <ColorInput
                      label="Color"
                      color={toolOptions.backgroundColor}
                      onChange={newColor => setToolOptions((prev: any) => ({ ...prev, backgroundColor: newColor }))}
                    />
                    <div>
                      <label className="block text-sm font-medium mb-1">Opacity</label>
                      <input id="bg-opacity" type="range" min="0" max="1" step="0.1" value={toolOptions.backgroundOpacity} onChange={e => setToolOptions((prev: any) => ({ ...prev, backgroundOpacity: parseFloat(e.target.value) }))} className="w-full" title={`Opacity: ${toolOptions.backgroundOpacity}`} />
                    </div>
                  </div>
                   <div className="space-y-3 pt-2 border-t border-gray-800">
                    <h3 className="text-sm font-medium">Stroke</h3>
                     <ColorInput
                      label="Color"
                      color={toolOptions.strokeColor}
                      onChange={newColor => setToolOptions((prev: any) => ({ ...prev, strokeColor: newColor }))}
                    />
                    <div>
                      <label className="block text-sm font-medium mb-1">Opacity</label>
                      <input id="stroke-opacity" type="range" min="0" max="1" step="0.1" value={toolOptions.strokeOpacity} onChange={e => setToolOptions((prev: any) => ({ ...prev, strokeOpacity: parseFloat(e.target.value) }))} className="w-full" title={`Opacity: ${toolOptions.strokeOpacity}`} />
                    </div>
                     <div>
                      <label htmlFor="stroke-width-text" className="block text-sm font-medium mb-1">Thickness ({toolOptions.strokeWidth}px)</label>
                      <input id="stroke-width-text" type="range" min="0" max="20" value={toolOptions.strokeWidth} onChange={e => setToolOptions((prev: any) => ({ ...prev, strokeWidth: parseInt(e.target.value, 10) }))} className="w-full" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        
        {/* Crop Tools */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 text-gray-100">Crop Tools</h2>
          <p className="text-xs text-gray-400">Hold <kbd className="px-2 py-1 text-xs font-semibold text-gray-200 bg-gray-700 rounded-md">C</kbd> and drag on canvas to create a selection.</p>
          
          {cropArea && (
            <div className="text-sm text-gray-400 bg-gray-800 p-2 rounded-md">
              <p>Selection Size:</p>
              <p className="font-mono text-gray-200">{`${Math.round(cropArea.width)} x ${Math.round(cropArea.height)} px`}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
            <div className="grid grid-cols-2 gap-2">
              {aspectRatios.map(r => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${aspectRatio === r ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

           <div>
            <label className="block text-sm font-medium mb-1">Export Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setExportFormat('png')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${exportFormat === 'png' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                PNG
              </button>
              <button
                onClick={() => setExportFormat('jpeg')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${exportFormat === 'jpeg' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                JPEG
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
             <button
              onClick={onFitCropToImage}
              disabled={selectedImageIds.length !== 1}
              className="w-full text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500"
              title={selectedImageIds.length !== 1 ? "Select a single image to fit crop area" : "Fit crop area to selected image"}
            >
              Fit to Image
            </button>
            <button
              onClick={onCropToView}
              className="w-full text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200"
            >
              Fit to View
            </button>
          </div>
          
           <div className="grid grid-cols-1 gap-2">
            <button
                onClick={onResetCrop}
                disabled={!cropArea}
                className="w-full flex items-center justify-center text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500"
              >
              <XIcon />
              <span className="ml-2">Clear Selection</span>
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyClick}
              disabled={!cropArea && selectedImageIds.length === 0}
              title={selectedImageIds.length > 0 ? 'Copy selected image(s) as a single image' : (cropArea ? 'Copy content in crop area' : 'Select images or a crop area to copy')}
              className="w-full flex items-center justify-center bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              <CopyIcon />
              <span className="ml-2">{copyStatus === 'copied' ? 'Copied!' : 'Copy'}</span>
            </button>
            <button
              onClick={onCrop}
              disabled={!cropArea}
              className="w-full flex items-center justify-center bg-green-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              <CropIcon />
              <span className="ml-2">Crop & Replace</span>
            </button>
          </div>

        </div>

        {/* Image Transform Tools */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 text-gray-100">Transform Tools</h2>
          <p className="text-xs text-gray-400" title={getEditingLabel()}>{getEditingLabel()}</p>
          
          {selectedImage && selectedImageIds.length === 1 && (
             <div className="text-sm text-gray-400 bg-gray-800 p-2 rounded-md">
              <p>Image Dimensions:</p>
              <p className="font-mono text-gray-200">{`${Math.round(selectedImage.width)} x ${Math.round(selectedImage.height)} px`}</p>
            </div>
          )}
          
          {showUncrop && (
            <div className="pt-2">
               <button
                  onClick={() => onUncrop(selectedImageIds)}
                  className="w-full flex items-center justify-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-all duration-200"
                >
                  <MaximizeIcon />
                  <span className="ml-2">Uncrop Image</span>
                </button>
            </div>
          )}

          <div className={`${selectedImageIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div>
              <label className="block text-sm font-medium mb-1">Scale</label>
              <div className="flex items-center space-x-2">
                <button onClick={() => handleButtonClick('scale', -0.1)} disabled={!selectedImage} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50"><ZoomOutIcon /></button>
                <input type="number" step="0.1" min="0.1" value={selectedImage?.scale.toFixed(2) || ''} placeholder={selectedImageIds.length > 1 ? 'Multi' : '1.00'} onChange={(e) => handleNumericInputChange('scale', e.target.value)} disabled={selectedImageIds.length === 0} className="w-full bg-gray-800 text-center rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500" />
                <button onClick={() => handleButtonClick('scale', 0.1)} disabled={!selectedImage} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50"><ZoomInIcon /></button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1 mt-3">Rotation (°)</label>
              <div className="flex items-center space-x-2">
                <button onClick={() => handleButtonClick('rotation', -15)} disabled={!selectedImage} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50"><RotateCwIcon className="-scale-x-100" /></button>
                <input type="number" step="5" value={selectedImage ? Math.round(selectedImage.rotation) : ''} placeholder={selectedImageIds.length > 1 ? 'Multi' : '0'} onChange={(e) => handleNumericInputChange('rotation', e.target.value)} disabled={selectedImageIds.length === 0} className="w-full bg-gray-800 text-center rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500" />
                <button onClick={() => handleButtonClick('rotation', 15)} disabled={!selectedImage} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50"><RotateCwIcon /></button>
              </div>
            </div>
            {selectedImageIds.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-700">
                <label className="block text-sm font-medium mb-2">Outline</label>
                <ColorInput
                  label="Color"
                  color={commonImageProps?.outlineColor === 'multi' ? '#ffffff' : (commonImageProps?.outlineColor || '#000000')}
                  showMixed={commonImageProps?.outlineColor === 'multi'}
                  onChange={newColor => onUpdateSelectedImages({ outlineColor: newColor })}
                />
                <div className="mt-2">
                  <label className="block text-sm font-medium mb-1">
                    Width ({commonImageProps?.outlineWidth === 'multi' ? 'Mixed' : `${commonImageProps?.outlineWidth}px`})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={commonImageProps?.outlineWidth === 'multi' ? 0 : (commonImageProps?.outlineWidth || 0)}
                    onChange={e => onUpdateSelectedImages({ outlineWidth: parseInt(e.target.value, 10) })}
                    className="w-full"
                  />
                </div>
              </div>
            )}
            {selectedImageIds.length > 1 && (
              <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">Align Selection ({selectedImageIds.length})</label>
                  <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => onAlignImages('left')} title="Align Left" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><AlignLeftIcon /></button>
                      <button onClick={() => onAlignImages('h-center')} title="Align Horizontal Center" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><AlignHorizontalCenterIcon /></button>
                      <button onClick={() => onAlignImages('right')} title="Align Right" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><AlignRightIcon /></button>
                      <button onClick={() => onAlignImages('top')} title="Align Top" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><AlignTopIcon /></button>
                      <button onClick={() => onAlignImages('v-center')} title="Align Vertical Center" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><AlignVerticalCenterIcon /></button>
                      <button onClick={() => onAlignImages('bottom')} title="Align Bottom" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><AlignBottomIcon /></button>
                  </div>
                  <label className="block text-sm font-medium mt-3 mb-2">Arrange Selection</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => onArrangeImages('horizontal')} title="Arrange Side-by-Side" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><ArrangeHorizontalIcon /></button>
                    <button onClick={() => onArrangeImages('vertical')} title="Arrange Top-to-Bottom" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><ArrangeVerticalIcon /></button>
                  </div>
              </div>
            )}
            {selectedImage && (
              <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">Stacking Order</label>
                  <div className="grid grid-cols-4 gap-2">
                      <button onClick={() => onReorderImageLayer(selectedImage.id, 'back')} disabled={!selectedImage} title="Send to Back" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><SendToBackIcon /></button>
                      <button onClick={() => onReorderImageLayer(selectedImage.id, 'backward')} disabled={!selectedImage} title="Send Backward" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><ChevronDownIcon /></button>
                      <button onClick={() => onReorderImageLayer(selectedImage.id, 'forward')} disabled={!selectedImage} title="Bring Forward" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><ChevronUpIcon /></button>
                      <button onClick={() => onReorderImageLayer(selectedImage.id, 'front')} disabled={!selectedImage} title="Bring to Front" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><BringToFrontIcon /></button>
                  </div>
              </div>
            )}
          </div>
        </div>

        {/* Canvas Layers */}
        <div className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 text-gray-100">Canvas Layers</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
                {images.length > 0 ? (
                    images.map(img => (
                        <CanvasImageItem
                            key={img.id}
                            image={img}
                            isSelected={selectedImageIds.includes(img.id)}
                            onSelect={setSelectedImageId}
                            onRename={onRenameImage}
                            onDelete={onDeleteImage}
                            onReorder={onReorderImages}
                            onReparentAnnotation={onReparentAnnotation}
                            selectedAnnotations={selectedAnnotations}
                            onSelectAnnotation={handleSelectAnnotation}
                            isParentOfSelectedAnnotation={parentImageIds.has(img.id)}
                        />
                    ))
                ) : (
                    <p className="text-xs text-gray-500 text-center py-4">No images on canvas.</p>
                )}
            </div>
        </div>

      </div>
    </aside>
  );
};