import React, { useMemo, useState, forwardRef, useEffect, useCallback } from 'react';
import { Annotation, TextAnnotation } from '../types';
import { ColorInput } from './ColorInput';
import { TrashIcon } from './icons';

interface FloatingAnnotationEditorProps {
  style: React.CSSProperties;
  selectedAnnotations: Annotation[];
  onUpdate: (changes: Partial<Annotation>) => void;
  onDelete: () => void;
}

export const FloatingAnnotationEditor = forwardRef<HTMLDivElement, FloatingAnnotationEditorProps>(({
  style,
  selectedAnnotations,
  onUpdate,
  onDelete,
}, ref) => {
  // State for dragging
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Create a stable dependency based on the IDs of the selected annotations.
  // This ensures the position only resets when the selection actually changes,
  // not when a property of a selected annotation is updated.
  const selectedAnnotationIds = useMemo(() => selectedAnnotations.map(a => a.id).sort().join(','), [selectedAnnotations]);

  // Reset custom position when the selection changes, so it defaults to the calculated position
  useEffect(() => {
    setPosition(null);
  }, [selectedAnnotationIds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const editor = (ref as React.RefObject<HTMLDivElement>)?.current;
    if (!editor) return;

    // Prevent default to avoid text selection while dragging
    e.preventDefault();
    
    const rect = editor.getBoundingClientRect();
    
    // The key fix: Immediately set the position based on the current rendered position.
    // This transitions it to a controlled `position: fixed` state without a visual jump.
    setPosition({
        top: rect.top,
        left: rect.left,
    });
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, [ref]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        left: e.clientX - dragOffset.x,
        top: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const finalStyle = useMemo(() => {
    // If a custom position is set by dragging, use it.
    if (position) {
      return {
        ...style,
        // Switch to fixed positioning and use the state for top/left.
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        // Remove the original transform to prevent conflicts.
        transform: 'none',
      };
    }
    // Otherwise, use the calculated style from props.
    return style;
  }, [style, position]);


  const commonProps = useMemo(() => {
    if (selectedAnnotations.length === 0) return {};
    
    const first = selectedAnnotations[0];
    const common: any = {
      color: first.color,
      strokeWidth: first.strokeWidth,
      fillColor: (first as any).fillColor,
      fillOpacity: (first as any).fillOpacity,
      backgroundColor: (first as any).backgroundColor,
      backgroundOpacity: (first as any).backgroundOpacity,
      strokeColor: (first as any).strokeColor,
      strokeOpacity: (first as any).strokeOpacity,
      fontSize: (first as any).fontSize,
      fontFamily: (first as any).fontFamily,
    };

    for (let i = 1; i < selectedAnnotations.length; i++) {
      const current = selectedAnnotations[i] as any;
      if (current.color !== common.color) common.color = 'multi';
      if (current.strokeWidth !== common.strokeWidth) common.strokeWidth = 'multi';
      if (current.fillColor !== common.fillColor) common.fillColor = 'multi';
      if (current.fillOpacity !== common.fillOpacity) common.fillOpacity = 'multi';
      if (current.backgroundColor !== common.backgroundColor) common.backgroundColor = 'multi';
      if (current.backgroundOpacity !== common.backgroundOpacity) common.backgroundOpacity = 'multi';
      if (current.strokeColor !== common.strokeColor) common.strokeColor = 'multi';
      if (current.strokeOpacity !== common.strokeOpacity) common.strokeOpacity = 'multi';
      if (current.fontSize !== common.fontSize) common.fontSize = 'multi';
      if (current.fontFamily !== common.fontFamily) common.fontFamily = 'multi';
    }
    return common;
  }, [selectedAnnotations]);

  const hasFill = useMemo(() => selectedAnnotations.some(a => a.type === 'rect' || a.type === 'circle'), [selectedAnnotations]);
  const hasTextProps = useMemo(() => selectedAnnotations.some(a => a.type === 'text'), [selectedAnnotations]);
  const hasBackground = useMemo(() => selectedAnnotations.some(a => a.type === 'text'), [selectedAnnotations]);
  const hasTextStroke = useMemo(() => selectedAnnotations.some(a => a.type === 'text'), [selectedAnnotations]);

  const isSingleTextAnnotation = useMemo(() => selectedAnnotations.length === 1 && selectedAnnotations[0].type === 'text', [selectedAnnotations]);

  if (selectedAnnotations.length === 0) {
    return null;
  }
  
  return (
    <div
      ref={ref}
      style={finalStyle}
      className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-20 p-3 w-60 space-y-3 text-sm"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div 
        className="flex items-center justify-between pb-2 border-b border-gray-700 cursor-move"
        onMouseDown={handleMouseDown}
      >
        <h3 className="font-bold text-gray-200">
          {selectedAnnotations.length > 1 ? `Editing ${selectedAnnotations.length} Items` : 'Edit'}
        </h3>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md"
          title="Delete Selection"
        >
          <TrashIcon />
        </button>
      </div>

      {isSingleTextAnnotation && (
        <div className="pt-2 border-t border-gray-700 space-y-2">
          <h4 className="text-xs font-bold uppercase text-gray-400">Text Content</h4>
          <textarea
            value={(selectedAnnotations[0] as TextAnnotation).text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            rows={4}
            className="w-full bg-gray-900 text-sm text-gray-200 rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500 p-2"
            // Prevent canvas-level keyboard shortcuts like backspace/delete from firing while typing
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()} // Also stop propagation for mousedown
          />
        </div>
      )}

      <ColorInput
        label="Color"
        color={commonProps.color === 'multi' ? '#ffffff' : commonProps.color}
        showMixed={commonProps.color === 'multi'}
        onChange={newColor => onUpdate({ color: newColor })}
      />
      
      {!hasTextProps && (
        <div>
          <label className="block text-xs font-medium mb-1">
            Border/Line Width ({commonProps.strokeWidth === 'multi' ? 'Mixed' : `${commonProps.strokeWidth}px`})
          </label>
          <input
            type="range"
            min="0"
            max="50"
            value={commonProps.strokeWidth === 'multi' ? 0 : commonProps.strokeWidth}
            onChange={e => onUpdate({ strokeWidth: parseInt(e.target.value, 10) })}
            className="w-full"
          />
        </div>
      )}

      {hasFill && (
        <div className="pt-2 border-t border-gray-700 space-y-2">
            <h4 className="text-xs font-bold uppercase text-gray-400">Fill</h4>
             <ColorInput
                label="Color"
                color={commonProps.fillColor === 'multi' ? '#ffffff' : (commonProps.fillColor || '#ffffff')}
                showMixed={commonProps.fillColor === 'multi'}
                onChange={newColor => onUpdate({ fillColor: newColor })}
            />
            <div>
                <label className="block text-xs font-medium mb-1">Opacity</label>
                <input type="range" min="0" max="1" step="0.1" 
                    value={commonProps.fillOpacity === 'multi' ? 0 : (commonProps.fillOpacity || 0)}
                    onChange={e => onUpdate({ fillOpacity: parseFloat(e.target.value) })} className="w-full" />
            </div>
        </div>
      )}

      {hasTextProps && (
        <div className="pt-2 border-t border-gray-700 space-y-2">
             <h4 className="text-xs font-bold uppercase text-gray-400">Text</h4>
            <div>
                <label className="block text-xs font-medium mb-1">Font Size ({commonProps.fontSize === 'multi' ? 'Mixed' : `${commonProps.fontSize}px`})</label>
                <input type="range" min="8" max="128" 
                    value={commonProps.fontSize === 'multi' ? 32 : commonProps.fontSize}
                    onChange={e => onUpdate({ fontSize: parseInt(e.target.value, 10) })} className="w-full" />
            </div>
             <div>
                <label className="block text-xs font-medium mb-1">Font Family</label>
                <select 
                    value={commonProps.fontFamily === 'multi' ? '' : commonProps.fontFamily}
                    onChange={e => onUpdate({ fontFamily: e.target.value })}
                    className="w-full bg-gray-700 text-xs rounded-md border border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                >
                    {commonProps.fontFamily === 'multi' && <option value="" disabled>Mixed</option>}
                    <option>Arial</option><option>Verdana</option><option>Times New Roman</option><option>Courier New</option><option>Comic Sans MS</option>
                </select>
            </div>
        </div>
      )}

      {hasBackground && (
         <div className="pt-2 border-t border-gray-700 space-y-2">
             <h4 className="text-xs font-bold uppercase text-gray-400">Background</h4>
             <ColorInput
                label="Color"
                color={commonProps.backgroundColor === 'multi' ? '#ffffff' : (commonProps.backgroundColor || '#000000')}
                showMixed={commonProps.backgroundColor === 'multi'}
                onChange={newColor => onUpdate({ backgroundColor: newColor })}
            />
            <div>
                <label className="block text-xs font-medium mb-1">Opacity</label>
                <input type="range" min="0" max="1" step="0.1" 
                    value={commonProps.backgroundOpacity === 'multi' ? 0 : (commonProps.backgroundOpacity || 0)}
                    onChange={e => onUpdate({ backgroundOpacity: parseFloat(e.target.value) })} className="w-full" />
            </div>
        </div>
      )}

      {hasTextStroke && (
         <div className="pt-2 border-t border-gray-700 space-y-2">
             <h4 className="text-xs font-bold uppercase text-gray-400">Text Stroke</h4>
             <ColorInput
                label="Color"
                color={commonProps.strokeColor === 'multi' ? '#ffffff' : (commonProps.strokeColor || '#000000')}
                showMixed={commonProps.strokeColor === 'multi'}
                onChange={newColor => onUpdate({ strokeColor: newColor })}
            />
            <div>
                <label className="block text-xs font-medium mb-1">Opacity</label>
                <input type="range" min="0" max="1" step="0.1" 
                    value={commonProps.strokeOpacity === 'multi' ? 0 : (commonProps.strokeOpacity || 0)}
                    onChange={e => onUpdate({ strokeOpacity: parseFloat(e.target.value) })} className="w-full" />
            </div>
             <div>
                <label className="block text-xs font-medium mb-1">
                    Width ({commonProps.strokeWidth === 'multi' ? 'Mixed' : `${commonProps.strokeWidth}px`})
                </label>
                <input
                    type="range"
                    min="0"
                    max="20"
                    value={commonProps.strokeWidth === 'multi' ? 0 : commonProps.strokeWidth}
                    onChange={e => onUpdate({ strokeWidth: parseInt(e.target.value, 10) })}
                    className="w-full"
                />
            </div>
        </div>
      )}
    </div>
  );
});