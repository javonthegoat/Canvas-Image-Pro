
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CanvasImage, AspectRatio, AnnotationTool, Rect, Annotation, TextAnnotation, Group } from '../types';
import { UploadIcon, ZoomInIcon, ZoomOutIcon, RotateCwIcon, CropIcon, PenToolIcon, TypeIcon, SquareIcon, CircleIcon, MousePointerIcon, TrashIcon, UndoIcon, RedoIcon, ArrowIcon, XIcon, SendToBackIcon, ChevronDownIcon, ChevronUpIcon, BringToFrontIcon, AlignLeftIcon, AlignHorizontalCenterIcon, AlignRightIcon, AlignTopIcon, AlignVerticalCenterIcon, AlignBottomIcon, CopyIcon, DownloadIcon, LineIcon, ArrangeHorizontalIcon, ArrangeVerticalIcon, EyedropperIcon, MaximizeIcon, SaveIcon, FolderOpenIcon, LayersIcon, DistributeHorizontalIcon, DistributeVerticalIcon, MatchWidthIcon, MatchHeightIcon, StackHorizontalIcon, StackVerticalIcon, SlidersIcon } from './icons';
import { ColorInput } from './ColorInput';

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
  onArrangeImages: (direction: 'horizontal' | 'vertical') => void;
  onStackImages: (direction: 'horizontal' | 'vertical') => void;
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


export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const {
    onFileChange, selectedImage, selectedImageIds, onUpdateSelectedImages, cropArea, aspectRatio, setAspectRatio, activeTool, setActiveTool,
    toolOptions, setToolOptions, onCropToView,
    onUndo, onRedo, canUndo, canRedo,
    onAlignImages, onArrangeImages, onStackImages, onMatchImageSizes, exportFormat, setExportFormat, onFitCropToImage,
    isLocked, onClearAllCanvas, onDownloadAllCanvas, onUncrop,
    onSaveProject, onLoadProject, onCreateGroup, images, onDownloadSelectedImages, isDirty,
  } = props;

  const [activeTab, setActiveTab] = useState<'tools' | 'project'>('tools');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadProjectInputRef = useRef<HTMLInputElement>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const confirmTimeoutRef = useRef<number | null>(null);

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
    const common: {
        outlineColor: string | 'multi';
        outlineWidth: number | 'multi';
    } = {
        outlineColor: first.outlineColor ?? '#000000',
        outlineWidth: first.outlineWidth ?? 0,
    };

    for (let i = 1; i < selected.length; i++) {
        if ((selected[i].outlineColor ?? '#000000') !== common.outlineColor) {
            common.outlineColor = 'multi';
        }
        if ((selected[i].outlineWidth ?? 0) !== common.outlineWidth) {
            common.outlineWidth = 'multi';
        }
    }
    return common;
  }, [selectedImageIds, images]);

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
            <div className="p-4 space-y-4">
                <Accordion title="Annotation Tools" defaultOpen>
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
                </Accordion>

                 <Accordion title="Transform & Arrange">
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
                         {selectedImageIds.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-gray-700">
                            <label className="block text-sm font-medium mb-2">Outline</label>
                            <ColorInput label="Color" color={commonImageProps?.outlineColor === 'multi' ? '#ffffff' : (commonImageProps?.outlineColor || '#000000')} showMixed={commonImageProps?.outlineColor === 'multi'} onChange={newColor => onUpdateSelectedImages({ outlineColor: newColor })} />
                            <div className="mt-2">
                              <label className="block text-sm font-medium mb-1">Width ({commonImageProps?.outlineWidth === 'multi' ? 'Mixed' : `${commonImageProps?.outlineWidth}px`})</label>
                              <input type="range" min="0" max="50" value={commonImageProps?.outlineWidth === 'multi' ? 0 : (commonImageProps?.outlineWidth || 0)} onChange={e => onUpdateSelectedImages({ outlineWidth: parseInt(e.target.value, 10) })} className="w-full"/>
                            </div>
                          </div>
                        )}
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
                                      <button onClick={() => onArrangeImages('horizontal')} title="Arrange Side-by-Side (Grid)" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><ArrangeHorizontalIcon /></button>
                                      <button onClick={() => onArrangeImages('vertical')} title="Arrange Top-to-Bottom (Grid)" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><ArrangeVerticalIcon /></button>
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-2">Arrange (Stack)</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      <button onClick={() => onStackImages('horizontal')} title="Stack Side-by-Side" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><StackHorizontalIcon /></button>
                                      <button onClick={() => onStackImages('vertical')} title="Stack Top-to-Bottom" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex justify-center items-center"><StackVerticalIcon /></button>
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

                 <Accordion title="Crop">
                    <p className="text-xs text-gray-400 -mt-2 mb-2">Hold <kbd className="px-2 py-1 text-xs font-semibold text-gray-200 bg-gray-700 rounded-md">C</kbd> and drag on canvas to create a selection. Press <kbd className="px-2 py-1 text-xs font-semibold text-gray-200 bg-gray-700 rounded-md">Enter</kbd> to crop.</p>
                     {cropArea && (
                        <div className="text-sm text-gray-400 bg-gray-800 p-2 rounded-md">
                        <p>Selection: <span className="font-mono text-gray-200">{`${Math.round(cropArea.width)}x${Math.round(cropArea.height)}px`}</span></p>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
                        <div className="grid grid-cols-2 gap-2">
                        {aspectRatios.map(r => (
                            <button key={r} onClick={() => setAspectRatio(r)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${aspectRatio === r ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{r}</button>
                        ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <button onClick={onFitCropToImage} disabled={selectedImageIds.length !== 1} className="w-full text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500" title={selectedImageIds.length !== 1 ? "Select a single image" : "Fit to Image"}>Fit to Image</button>
                        <button onClick={onCropToView} className="w-full text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-all duration-200">Fit to View</button>
                    </div>
                 </Accordion>
            </div>
        )}

        {activeTab === 'project' && (
             <div className="p-4 space-y-4">
                <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={(e) => onFileChange(e.target.files)} disabled={isDisabled}/>
                <input type="file" accept=".cpro" ref={loadProjectInputRef} className="hidden" onChange={handleLoadProjectFileChange} disabled={isDisabled}/>
                
                <div>
                    <button onClick={handleUploadClick} disabled={isDisabled} className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <UploadIcon /> <span className="ml-2">Upload Images</span>
                    </button>
                     <p className="text-xs text-gray-500 mt-2 text-center">or drag & drop / paste from clipboard</p>
                </div>

                 <div className="space-y-3 pt-3 border-t border-gray-800">
                    <div className="grid grid-cols-2 gap-2">
                         <button onClick={handleLoadProjectClick} disabled={isDisabled} title="Load Project File (.cpro)" className="flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed">
                            <FolderOpenIcon /> <span className="ml-2">Load</span>
                        </button>
                        <button onClick={onSaveProject} disabled={images.length === 0} className="relative flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed">
                            <SaveIcon /> <span className="ml-2">Save</span>
                            {isDirty && <span title="Unsaved changes" className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-400 rounded-full"></span>}
                        </button>
                    </div>
                </div>

                 <div className="space-y-3 pt-3 border-t border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-100">Export</h3>
                    <div>
                        <label className="block text-sm font-medium mb-1">Format</label>
                        <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setExportFormat('png')} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${exportFormat === 'png' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>PNG</button>
                        <button onClick={() => setExportFormat('jpeg')} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${exportFormat === 'jpeg' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>JPEG</button>
                        </div>
                    </div>
                  <button onClick={onDownloadSelectedImages} disabled={selectedImageIds.length === 0} className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed">
                    <DownloadIcon /> <span className="ml-2">Download Selection</span>
                  </button>
                  <button onClick={onDownloadAllCanvas} disabled={images.length === 0} className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed">
                    <DownloadIcon /> <span className="ml-2">Download All (Zip)</span>
                  </button>
                  <button onClick={handleClearClick} disabled={images.length === 0} className={`w-full flex items-center justify-center font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500 ${isConfirmingClear? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900': 'bg-red-600 hover:bg-red-700 text-white'}`}>
                    {isConfirmingClear ? 'Confirm Clear' : <><TrashIcon /> <span className="ml-2">Clear Canvas</span></>}
                  </button>
                </div>
            </div>
        )}
      </div>

    </aside>
  );
};
