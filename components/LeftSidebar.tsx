

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CanvasImage, AspectRatio, AnnotationTool, Rect, Annotation, TextAnnotation, Group } from '../types';
import { UploadIcon, ZoomInIcon, ZoomOutIcon, RotateCwIcon, CropIcon, PenToolIcon, TypeIcon, SquareIcon, CircleIcon, MousePointerIcon, TrashIcon, UndoIcon, RedoIcon, ArrowIcon, XIcon, SendToBackIcon, ChevronDownIcon, ChevronUpIcon, BringToFrontIcon, AlignLeftIcon, AlignHorizontalCenterIcon, AlignRightIcon, AlignTopIcon, AlignVerticalCenterIcon, AlignBottomIcon, CopyIcon, DownloadIcon, LineIcon, ArrangeHorizontalIcon, ArrangeVerticalIcon, EyedropperIcon, MaximizeIcon, SaveIcon, FolderOpenIcon, LayersIcon, DistributeHorizontalIcon, DistributeVerticalIcon, MatchWidthIcon, MatchHeightIcon, StackHorizontalIcon, StackVerticalIcon, SlidersIcon } from './icons';
import { ColorPicker } from './ColorInput';

interface LeftSidebarProps {
  onFileChange: (files: FileList | null) => void;
  selectedImage: CanvasImage | null;
  selectedImageIds: string[];
  onUpdateSelectedImages: (changes: Partial<CanvasImage>) => void;
  cropArea: Rect | null;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  activeTool: AnnotationTool;
  setActiveTool: (tool: AnnotationTool) => void;
  toolOptions: { color: string; strokeWidth: number; fontSize: number; fontFamily: string; backgroundColor: string; backgroundOpacity: number; strokeColor: string; strokeOpacity: number; fillColor: string; fillOpacity: number; outlineColor: string; outlineWidth: number; outlineOpacity: number; };
  setToolOptions: (options: any) => void;
  onCropToView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAlignImages: (alignment: 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom') => void;
  onArrangeImages: (direction: 'horizontal' | 'vertical', order: 'normal' | 'reverse') => void;
  onStackImages: (direction: 'horizontal' | 'vertical', order: 'normal' | 'reverse') => void;
  onMatchImageSizes: (dimension: 'width' | 'height') => void;
  exportFormat: 'png' | 'jpeg';
  setExportFormat: (format: 'png' | 'jpeg') => void;
  onFitCropToImage: () => void;
  isLocked?: boolean;
  onClearAllCanvas: () => void;
  onDownloadAllCanvas: () => void;
  onUncrop: (imageIds: string[]) => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  onCreateGroup: () => void;
  images: CanvasImage[];
  onDownloadSelectedImages: () => void;
  isDirty: boolean;
  selectedAnnotationObjects: Annotation[];
  onUpdateSelectedAnnotations: (changes: Partial<Annotation>) => void;
  deleteSelectedAnnotations: () => void;
  onCrop: () => void;
}

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}> = ({ isActive, onClick, title, children }) => (
    <button
        onClick={onClick}
        title={title}
        className={`flex-1 flex flex-col items-center justify-center p-2 text-xs font-medium transition-colors duration-200 border-b-2 ${
            isActive
                ? 'bg-gray-800 border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:bg-gray-700/50 hover:text-white'
        }`}
    >
        {children}
    </button>
);

const Accordion: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen }) => (
    <details className="group" open={defaultOpen}>
        <summary className="flex items-center justify-between p-2 text-sm font-semibold text-gray-100 bg-gray-800/50 rounded-md cursor-pointer hover:bg-gray-700/50">
            {title}
            <ChevronDownIcon className="w-5 h-5 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="p-3 space-y-4">
            {children}
        </div>
    </details>
);

type ColorTarget = 'stroke' | 'fill' | 'outline' | 'bg';

export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const {
    onFileChange, selectedImage, selectedImageIds, onUpdateSelectedImages, cropArea, aspectRatio, setAspectRatio, activeTool, setActiveTool,
    toolOptions, setToolOptions, onCropToView,
    onUndo, onRedo, canUndo, canRedo,
    onAlignImages, onArrangeImages, onStackImages, onMatchImageSizes, exportFormat, setExportFormat, onFitCropToImage,
    isLocked, onClearAllCanvas, onDownloadAllCanvas, onUncrop,
    onSaveProject, onLoadProject, onCreateGroup, images, onDownloadSelectedImages, isDirty,
    selectedAnnotationObjects, onUpdateSelectedAnnotations, deleteSelectedAnnotations, onCrop
  } = props;

  const [activeTab, setActiveTab] = useState<'tools' | 'project'>('tools');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadProjectInputRef = useRef<HTMLInputElement>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const confirmTimeoutRef = useRef<number | null>(null);
  const [activeColorTarget, setActiveColorTarget] = useState<ColorTarget>('stroke');
  const [lastArrangeClick, setLastArrangeClick] = useState({ time: 0, direction: '' });
  const [lastStackClick, setLastStackClick] = useState({ time: 0, direction: '' });

  const isEditingAnnotation = selectedAnnotationObjects.length > 0;
  const isEditingImage = selectedImageIds.length > 0;
  
  const isText = activeTool === 'text' || (isEditingAnnotation && selectedAnnotationObjects.some(a => a.type === 'text'));

  // Helper to get common props for selection or active tool defaults
  const currentProps = useMemo(() => {
      if (isEditingAnnotation) {
          if (selectedAnnotationObjects.length === 0) return {};
          const first = selectedAnnotationObjects[0];
          const common: any = { ...first };
          
          for (let i = 1; i < selectedAnnotationObjects.length; i++) {
              const current = selectedAnnotationObjects[i] as any;
              Object.keys(common).forEach(key => {
                  if (current[key] !== common[key]) common[key] = 'multi';
              });
          }
          return common;
      } else {
          // Tool Defaults
          return toolOptions;
      }
  }, [isEditingAnnotation, selectedAnnotationObjects, toolOptions]);

  const commonImageProps = useMemo(() => {
      if (!isEditingImage) return null;
      const selected = images.filter(img => selectedImageIds.includes(img.id));
      if (selected.length === 0) return null;
  
      const first = selected[0];
      const common: {
          outlineColor: string | 'multi';
          outlineWidth: number | 'multi';
          outlineOpacity: number | 'multi';
      } = {
          outlineColor: first.outlineColor ?? '#000000',
          outlineWidth: first.outlineWidth ?? 0,
          outlineOpacity: first.outlineOpacity ?? 1,
      };
  
      for (let i = 1; i < selected.length; i++) {
          if ((selected[i].outlineColor ?? '#000000') !== common.outlineColor) {
              common.outlineColor = 'multi';
          }
          if ((selected[i].outlineWidth ?? 0) !== common.outlineWidth) {
              common.outlineWidth = 'multi';
          }
          if ((selected[i].outlineOpacity ?? 1) !== common.outlineOpacity) {
              common.outlineOpacity = 'multi';
          }
      }
      return common;
    }, [selectedImageIds, images, isEditingImage]);


  // Determine which color targets are available based on context
  const getAvailableColorTargets = (): ColorTarget[] => {
      const targets = new Set<ColorTarget>();

      // Annotation Editing
      if (isEditingAnnotation) {
          const types = selectedAnnotationObjects.map(a => a.type);
          targets.add('stroke');
          if (types.some(t => ['rect', 'circle'].includes(t))) targets.add('fill');
          if (types.some(t => t === 'text')) { targets.add('bg'); targets.add('outline'); }
          if (types.some(t => ['freehand', 'arrow', 'line'].includes(t))) targets.add('outline');
      } 
      // Image Editing
      else if (isEditingImage) {
          targets.add('outline');
      }
      // Active Tool
      else {
          targets.add('stroke');
          if (['rect', 'circle'].includes(activeTool)) targets.add('fill');
          if (activeTool === 'text') { targets.add('bg'); targets.add('outline'); }
          if (['freehand', 'arrow', 'line'].includes(activeTool)) targets.add('outline');
      }

      const order: ColorTarget[] = ['stroke', 'fill', 'bg', 'outline'];
      const result = order.filter(t => targets.has(t));
      return result.length > 0 ? result : ['stroke'];
  };

  const availableColorTargets = getAvailableColorTargets();

  // Ensure valid color target when selection/tool changes
  useEffect(() => {
      if (!availableColorTargets.includes(activeColorTarget)) {
          setActiveColorTarget(availableColorTargets[0] as ColorTarget);
      }
  }, [activeTool, selectedAnnotationObjects, selectedImageIds, activeColorTarget]); // eslint-disable-line react-hooks/exhaustive-deps

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
  
  const handleArrangeClick = (direction: 'horizontal' | 'vertical') => {
    const now = Date.now();
    const isDoubleClick = now - lastArrangeClick.time < 300 && lastArrangeClick.direction === direction;
    onArrangeImages(direction, isDoubleClick ? 'reverse' : 'normal');
    setLastArrangeClick({ time: now, direction });
  };

  const handleStackClick = (direction: 'horizontal' | 'vertical') => {
    const now = Date.now();
    const isDoubleClick = now - lastStackClick.time < 300 && lastStackClick.direction === direction;
    onStackImages(direction, isDoubleClick ? 'reverse' : 'normal');
    setLastStackClick({ time: now, direction });
  };
  
  const aspectRatios: AspectRatio[] = ['free', '1:1', '4:3', '16:9'];
  const tools: { name: AnnotationTool, icon: React.ReactNode, title: string }[] = [
    { name: 'select', icon: <MousePointerIcon />, title: 'Select & Move (S)' },
    { name: 'eyedropper', icon: <EyedropperIcon />, title: 'Eyedropper (I)' },
    { name: 'crop', icon: <CropIcon />, title: 'Crop Tool (C)' },
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

  const getActiveColorValue = (): string => {
      if (activeColorTarget === 'outline' && isEditingImage && !isEditingAnnotation) {
          return commonImageProps?.outlineColor === 'multi' ? '#ffffff' : (commonImageProps?.outlineColor || '#000000');
      }

      const val = (() => {
          switch(activeColorTarget) {
              case 'stroke': return currentProps.color;
              case 'fill': return currentProps.fillColor;
              case 'bg': return currentProps.backgroundColor;
              case 'outline': 
                  if (isText) return currentProps.strokeColor;
                  return currentProps.outlineColor;
              default: return '#000000';
          }
      })();
      return val === 'multi' ? '#ffffff' : (val || '#000000');
  };

  const getOpacityField = (target: ColorTarget): string | undefined => {
      switch(target) {
          case 'bg': return 'backgroundOpacity';
          case 'fill': return 'fillOpacity';
          case 'outline': 
              if (isText) return 'strokeOpacity';
              return 'outlineOpacity';
          case 'stroke':
            
              return undefined; 
          default: return undefined;
      }
  };

  const handleColorChange = (newColor: string) => {
      const changes: any = {};

      if (activeColorTarget === 'outline' && isEditingImage && !isEditingAnnotation) {
          onUpdateSelectedImages({ outlineColor: newColor });
          return;
      }

      switch(activeColorTarget) {
          case 'stroke': changes.color = newColor; break;
          case 'fill': changes.fillColor = newColor; break;
          case 'bg': changes.backgroundColor = newColor; break;
          case 'outline': 
              if (isText) {
                   changes.strokeColor = newColor; 
              } else {
                   changes.outlineColor = newColor;
              }
              break;
      }

      if (isEditingAnnotation) {
          onUpdateSelectedAnnotations(changes);
      } else {
          setToolOptions((prev: any) => ({ ...prev, ...changes }));
      }
  };

  const renderColorTargetButtons = () => (
      <div className="flex bg-gray-800 rounded-md p-1 space-x-1 mb-3 overflow-x-auto scrollbar-hide">
          {availableColorTargets.map(target => {
              let label = '';
              if (target === 'stroke') label = isText ? 'Text' : 'Stroke';
              else if (target === 'fill') label = 'Fill';
              else if (target === 'bg') label = 'BG';
              else if (target === 'outline') label = isText ? 'Stroke' : 'Outline';
              
              return (
                  <button
                      key={target}
                      onClick={() => setActiveColorTarget(target)}
                      className={`flex-1 px-2 py-1 text-xs rounded-sm transition-colors whitespace-nowrap ${activeColorTarget === target ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                      {label}
                  </button>
              );
          })}
      </div>
  );

  return (
    <aside className={`w-80 bg-gray-900 text-gray-300 flex flex-col h-full shadow-lg z-10 border-r border-gray-700 transition-opacity duration-300 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between p-4">
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
      
      <div className="flex border-b border-t border-gray-700">
        <TabButton title="Tools" isActive={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
            <SlidersIcon /> Tools
        </TabButton>
        <TabButton title="Project" isActive={activeTab === 'project'} onClick={() => setActiveTab('project')}>
            <FolderOpenIcon /> Project
        </TabButton>
      </div>
      
      <div className="flex-grow overflow-y-auto">
        {activeTab === 'tools' && (
            <div className="p-4 space-y-6">
                {/* Tool Selection Grid */}
                <div className="grid grid-cols-4 gap-2">
                    {tools.map(tool => (
                        <button
                            key={tool.name}
                            title={tool.title}
                            onClick={() => {
                                setActiveTool(tool.name);
                            }}
                            disabled={isDisabled || (isEditingAnnotation && tool.name !== 'select')}
                            className={`p-2 flex justify-center items-center rounded-md transition-colors ${activeTool === tool.name && !isEditingAnnotation ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            {tool.icon}
                        </button>
                    ))}
                </div>
                
                {/* Crop Tool Options */}
                {activeTool === 'crop' && (
                    <div className="space-y-4 bg-gray-800 p-3 rounded-md border border-gray-700">
                         <h3 className="text-xs font-bold text-gray-100 uppercase tracking-wide">Crop Options</h3>
                         <p className="text-xs text-gray-400">Drag to crop. Press Enter to Apply.</p>
                         <div>
                            <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
                            <div className="grid grid-cols-2 gap-2">
                            {aspectRatios.map(r => (
                                <button key={r} onClick={() => setAspectRatio(r)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${aspectRatio === r ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{r}</button>
                            ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button onClick={onFitCropToImage} disabled={selectedImageIds.length !== 1} className="w-full text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500">Fit to Image</button>
                            <button onClick={onCropToView} className="w-full text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200">Fit to View</button>
                        </div>
                        <button onClick={onCrop} disabled={!cropArea} className="w-full text-sm bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">Apply Crop (Enter)</button>
                    </div>
                )}

                {/* Universal Properties Section */}
                {(isEditingAnnotation || isEditingImage || (activeTool !== 'select' && activeTool !== 'eyedropper' && activeTool !== 'crop')) && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wide">
                                {isEditingAnnotation ? `Edit ${selectedAnnotationObjects.length > 1 ? 'Selection' : selectedAnnotationObjects[0].type}` : isEditingImage ? 'Edit Image Properties' : 'Tool Properties'}
                            </h3>
                            {isEditingAnnotation && (
                                <button onClick={deleteSelectedAnnotations} className="text-xs text-red-400 hover:text-red-300 flex items-center">
                                    <TrashIcon className="w-3 h-3 mr-1"/> Delete
                                </button>
                            )}
                        </div>
                        
                        {/* Universal Color Picker */}
                        <div className="bg-gray-800 p-3 rounded-md border border-gray-700">
                            {renderColorTargetButtons()}
                            <ColorPicker 
                                color={getActiveColorValue()} 
                                onChange={handleColorChange}
                            />
                        </div>

                        {/* Contextual Sliders & Inputs */}
                        <div className="space-y-4 border-t border-gray-800 pt-4">
                            {/* Width Slider (Stroke or Outline) */}
                            {/* Shows for: Shapes (target=stroke), Text (target=outline), Freehand/etc (target=outline) */}
                            {/* Does NOT show for: Text (target=stroke), Shapes (target=fill/bg) */}
                            {((!isText && activeColorTarget === 'stroke') || activeColorTarget === 'outline') && !isEditingImage && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        {isText ? 'Stroke Width' : (activeColorTarget === 'outline' ? 'Outline Width' : 'Stroke Width')}
                                        {` (${
                                            activeColorTarget === 'outline'
                                            ? (isText ? (currentProps.strokeWidth === 'multi' ? 'Mixed' : `${currentProps.strokeWidth}px`) : (currentProps.outlineWidth === 'multi' ? 'Mixed' : `${currentProps.outlineWidth}px`))
                                            : (currentProps.strokeWidth === 'multi' ? 'Mixed' : `${currentProps.strokeWidth}px`)
                                        })`}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        value={
                                            activeColorTarget === 'outline' 
                                                ? (isText 
                                                    ? (currentProps.strokeWidth === 'multi' ? 0 : currentProps.strokeWidth)
                                                    : (currentProps.outlineWidth === 'multi' ? 0 : currentProps.outlineWidth)
                                                  ) 
                                                : (currentProps.strokeWidth === 'multi' ? 0 : currentProps.strokeWidth)
                                        }
                                        onChange={e => {
                                            const val = parseInt(e.target.value, 10);
                                            if (activeColorTarget === 'outline') {
                                                if (isText) {
                                                     isEditingAnnotation ? onUpdateSelectedAnnotations({ strokeWidth: val }) : setToolOptions((p:any) => ({...p, strokeWidth: val}));
                                                } else {
                                                     isEditingAnnotation ? onUpdateSelectedAnnotations({ outlineWidth: val }) : setToolOptions((p:any) => ({...p, outlineWidth: val}));
                                                }
                                            } else {
                                                // Stroke target (Shapes)
                                                isEditingAnnotation ? onUpdateSelectedAnnotations({ strokeWidth: val }) : setToolOptions((p:any) => ({...p, strokeWidth: val}));
                                            }
                                        }}
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {/* Image Outline Width */}
                            {activeColorTarget === 'outline' && isEditingImage && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Outline Width {`(${commonImageProps?.outlineWidth === 'multi' ? 'Mixed' : `${commonImageProps?.outlineWidth}px`})`}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        value={commonImageProps?.outlineWidth === 'multi' ? 0 : commonImageProps?.outlineWidth}
                                        onChange={e => onUpdateSelectedImages({ outlineWidth: parseInt(e.target.value, 10) })}
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {/* Opacity Sliders */}
                            {activeColorTarget !== 'stroke' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Opacity</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={(() => {
                                            if (isEditingImage && activeColorTarget === 'outline') {
                                                const val = commonImageProps?.outlineOpacity;
                                                return val === 'multi' ? 0 : (val ?? 1); 
                                            }
                                            
                                            let field = getOpacityField(activeColorTarget);
                                            if (!field) return 1;
                                            const val = currentProps[field];
                                            return val === 'multi' ? 0 : (val ?? 1);
                                        })()}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            
                                            if (isEditingImage && activeColorTarget === 'outline') {
                                                 onUpdateSelectedImages({ outlineOpacity: val });
                                                 return;
                                            }

                                            let field = getOpacityField(activeColorTarget);
                                            if (field) {
                                                isEditingAnnotation ? onUpdateSelectedAnnotations({ [field]: val }) : setToolOptions((p:any) => ({...p, [field]: val}));
                                            }
                                        }}
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {/* Text Specifics */}
                            {isText && activeColorTarget === 'stroke' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Font Size ({currentProps.fontSize}px)</label>
                                        <input
                                            type="range"
                                            min="8"
                                            max="128"
                                            value={currentProps.fontSize === 'multi' ? 32 : currentProps.fontSize}
                                            onChange={e => {
                                                const val = parseInt(e.target.value, 10);
                                                isEditingAnnotation ? onUpdateSelectedAnnotations({ fontSize: val }) : setToolOptions((p:any) => ({...p, fontSize: val}));
                                            }}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Font Family</label>
                                        <select
                                            value={currentProps.fontFamily === 'multi' ? '' : currentProps.fontFamily}
                                            onChange={e => {
                                                const val = e.target.value;
                                                isEditingAnnotation ? onUpdateSelectedAnnotations({ fontFamily: val }) : setToolOptions((p:any) => ({...p, fontFamily: val}));
                                            }}
                                            className="w-full bg-gray-800 rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-xs p-1"
                                        >
                                            {currentProps.fontFamily === 'multi' && <option value="">Mixed</option>}
                                            <option>Arial</option><option>Verdana</option><option>Times New Roman</option><option>Courier New</option><option>Comic Sans MS</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            
                            {/* Text Content Editor */}
                            {isEditingAnnotation && selectedAnnotationObjects.length === 1 && selectedAnnotationObjects[0].type === 'text' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Content</label>
                                    <textarea
                                        value={(selectedAnnotationObjects[0] as TextAnnotation).text}
                                        onChange={e => onUpdateSelectedAnnotations({ text: e.target.value })}
                                        className="w-full bg-gray-800 text-sm text-gray-200 rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500 p-2"
                                        rows={3}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Transform & Arrange - Only show if images are selected */}
                {selectedImageIds.length > 0 && (
                 <Accordion title="Transform & Arrange" defaultOpen>
                   <p className="text-xs text-gray-400 -mt-2 mb-2" title={getEditingLabel()}>{getEditingLabel()}</p>
                    {selectedImage && selectedImageIds.length === 1 && (
                      <div className="text-sm text-gray-400 bg-gray-800 p-2 rounded-md mb-2">
                        <p>Dimensions: <span className="font-mono text-gray-200">{`${Math.round(selectedImage.width)}x${Math.round(selectedImage.height)}px`}</span></p>
                      </div>
                    )}
                    {showUncrop && (
                        <button onClick={() => onUncrop(selectedImageIds)} className="w-full flex items-center justify-center text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 mb-2">
                        <MaximizeIcon /> <span className="ml-2">Uncrop Image</span>
                        </button>
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
                         <div className="mt-3">
                          <label className="block text-sm font-medium mb-1">Rotation (°)</label>
                          <div className="flex items-center space-x-2">
                            <button onClick={() => handleButtonClick('rotation', -15)} disabled={!selectedImage} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50"><RotateCwIcon className="-scale-x-100" /></button>
                            <input type="number" step="5" value={selectedImage ? Math.round(selectedImage.rotation) : ''} placeholder={selectedImageIds.length > 1 ? 'Multi' : '0'} onChange={(e) => handleNumericInputChange('rotation', e.target.value)} disabled={selectedImageIds.length === 0} className="w-full bg-gray-800 text-center rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500" />
                            <button onClick={() => handleButtonClick('rotation', 15)} disabled={!selectedImage} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50"><RotateCwIcon /></button>
                          </div>
                        </div>

                        {selectedImageIds.length > 1 && (
                          <div className="mt-4 pt-3 border-t border-gray-700 space-y-3">
                              <button onClick={onCreateGroup} className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200">
                                  <LayersIcon /> <span className="ml-2">Group Selection</span>
                              </button>
                              <div>
                                <label className="block text-sm font-medium mb-2">Align Selection ({selectedImageIds.length})</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => onAlignImages('left')} title="Align Left" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><AlignLeftIcon /></button>
                                    <button onClick={() => onAlignImages('h-center')} title="Align Horizontal Center" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><AlignHorizontalCenterIcon /></button>
                                    <button onClick={() => onAlignImages('right')} title="Align Right" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><AlignRightIcon /></button>
                                    <button onClick={() => onAlignImages('top')} title="Align Top" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><AlignTopIcon /></button>
                                    <button onClick={() => onAlignImages('v-center')} title="Align Vertical Center" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><AlignVerticalCenterIcon /></button>
                                    <button onClick={() => onAlignImages('bottom')} title="Align Bottom" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><AlignBottomIcon /></button>
                                </div>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-2">Arrange (Grid)</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      <button onClick={() => handleArrangeClick('horizontal')} title="Arrange Side-by-Side (Grid)" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><ArrangeHorizontalIcon /></button>
                                      <button onClick={() => handleArrangeClick('vertical')} title="Arrange Top-to-Bottom (Grid)" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><ArrangeVerticalIcon /></button>
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-2">Arrange (Stack)</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      <button onClick={() => handleStackClick('horizontal')} title="Stack Side-by-Side" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><StackHorizontalIcon /></button>
                                      <button onClick={() => handleStackClick('vertical')} title="Stack Top-to-Bottom" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><StackVerticalIcon /></button>
                                  </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-2">Match Size</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => onMatchImageSizes('width')} disabled={selectedImageIds.length < 2} title="Match Width" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><MatchWidthIcon /></button>
                                    <button onClick={() => onMatchImageSizes('height')} disabled={selectedImageIds.length < 2} title="Match Height" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 flex justify-center items-center"><MatchHeightIcon /></button>
                                </div>
                              </div>
                          </div>
                        )}
                    </div>
                 </Accordion>
                )}
            </div>
        )}

        {activeTab === 'project' && (
             <div className="p-4 space-y-4">
                <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={(e) => onFileChange(e.target.files)} disabled={isDisabled}/>
                <input type="file" accept=".cpro,.json" ref={loadProjectInputRef} className="hidden" onChange={handleLoadProjectFileChange} disabled={isDisabled}/>
                
                <button onClick={handleUploadClick} disabled={isDisabled} className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                    <UploadIcon /> <span className="ml-2">Upload Images</span>
                </button>
                
                <button onClick={handleLoadProjectClick} disabled={isDisabled} className="w-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                    <FolderOpenIcon /> <span className="ml-2">Load Project</span>
                </button>
                
                <div className="pt-4 border-t border-gray-700">
                    <label className="block text-sm font-medium mb-2">Export Format</label>
                    <div className="flex rounded-md bg-gray-800 p-1">
                        <button onClick={() => setExportFormat('png')} className={`flex-1 text-sm py-1 rounded-sm transition-colors ${exportFormat === 'png' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}>PNG</button>
                        <button onClick={() => setExportFormat('jpeg')} className={`flex-1 text-sm py-1 rounded-sm transition-colors ${exportFormat === 'jpeg' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}>JPEG</button>
                    </div>
                </div>
                
                <div className="space-y-2">
                    <button onClick={onSaveProject} className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200">
                        <SaveIcon /> <span className="ml-2">Save Project</span>
                    </button>
                    <button onClick={onDownloadSelectedImages} disabled={selectedImageIds.length === 0} className="w-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                        <DownloadIcon /> <span className="ml-2">{selectedImageIds.length > 0 ? 'Download Selection' : 'Download Selection'}</span>
                    </button>
                    <button onClick={onDownloadAllCanvas} className="w-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200">
                        <DownloadIcon /> <span className="ml-2">Download All</span>
                    </button>
                </div>

                 <div className="pt-4 border-t border-gray-700 mt-auto">
                    <button onClick={handleClearClick} disabled={isDisabled} className={`w-full flex items-center justify-center text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isConfirmingClear ? 'bg-red-600 hover:bg-red-700' : 'bg-red-900/50 hover:bg-red-800 text-red-200'}`}>
                        <TrashIcon /> <span className="ml-2">{isConfirmingClear ? 'Confirm Clear?' : 'Clear Canvas'}</span>
                    </button>
                </div>
             </div>
        )}
      </div>
    </aside>
  );
};