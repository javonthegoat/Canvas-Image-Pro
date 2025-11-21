import React, { useState, useRef, useEffect, useCallback } from 'react';
import { hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, HSV } from '../utils/colorUtils';

export interface ColorPickerProps {
  color: string;
  onChange: (newColor: string) => void;
  onClose?: () => void;
  onCommit?: () => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, onClose, onCommit }) => {
  const safeColor = color && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i.test(color) ? color : '#000000';
  
  const [hsv, setHsv] = useState<HSV>(() => {
    const rgb = hexToRgb(safeColor);
    return rgb ? rgbToHsv(rgb) : { h: 0, s: 0, v: 0 };
  });
  const [hex, setHex] = useState(safeColor);
  const satValRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSafeColor = color && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i.test(color) ? color : '#000000';
    if (newSafeColor.toLowerCase() !== hex.toLowerCase()) {
        const rgb = hexToRgb(newSafeColor);
        if (rgb) {
            setHsv(rgbToHsv(rgb));
        }
        setHex(newSafeColor);
    }
  }, [color, hex]);

  const handleHsvChange = useCallback((newHsvPart: Partial<HSV>) => {
    setHsv(currentHsv => {
      const updatedHsv = { ...currentHsv, ...newHsvPart };
      const newRgb = hsvToRgb(updatedHsv);
      const newHex = rgbToHex(newRgb);
      
      setHex(newHex);
      onChange(newHex);
      return updatedHsv;
    });
  }, [onChange]);
  
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHexValue = e.target.value;
    const fullHex = `#${newHexValue}`;
    setHex(fullHex);

    if (/^#([A-Fa-f0-9]{6})$/i.test(fullHex)) {
      const rgb = hexToRgb(fullHex);
      if (rgb) {
          const newHsv = rgbToHsv(rgb);
          setHsv(newHsv);
          onChange(fullHex);
      }
    }
  };

  const handleSatValMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    
    const updateColor = (event: MouseEvent) => {
        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;
        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        const s = (x / rect.width) * 100;
        const v = 100 - (y / rect.height) * 100;
        handleHsvChange({ s, v });
    };

    updateColor(e.nativeEvent);

    const onMouseMove = (event: MouseEvent) => updateColor(event);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (onCommit) onCommit();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

  }, [handleHsvChange, onCommit]);

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 }));
  const satValStyle = {
    backgroundColor: hueColor,
  };

  return (
    <div className="flex flex-col space-y-3 w-full">
        <div 
            ref={satValRef}
            className="w-full h-32 rounded-sm cursor-crosshair relative border border-gray-600"
            style={satValStyle}
            onMouseDown={handleSatValMouseDown}
        >
            <div className="absolute inset-0" style={{background: 'linear-gradient(to right, white, transparent)'}}/>
            <div className="absolute inset-0" style={{background: 'linear-gradient(to top, black, transparent)'}}/>
            <div
                className="w-3 h-3 rounded-full border-2 border-white shadow-md absolute pointer-events-none"
                style={{
                    left: `${hsv.s}%`,
                    top: `${100 - hsv.v}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: hex,
                }}
            />
        </div>
        <div className="w-full h-4">
           <input
            ref={hueRef}
            type="range"
            min="0"
            max="359"
            value={hsv.h}
            onChange={(e) => handleHsvChange({ h: parseInt(e.target.value, 10) })}
            onMouseUp={onCommit}
            onTouchEnd={onCommit}
            className="w-full h-full appearance-none rounded-md cursor-pointer hue-slider"
            style={{'--thumb-color': hueColor } as React.CSSProperties}
          />
        </div>
        <div className="flex items-center space-x-2">
            <div className="flex-1 flex items-center bg-gray-900 rounded-md border border-gray-600 focus-within:ring-1 focus-within:ring-blue-500">
                <span className="pl-2 text-sm text-gray-400">#</span>
                <input 
                    type="text"
                    value={hex.substring(1)}
                    onChange={handleHexChange}
                    onBlur={onCommit}
                    className="w-full bg-transparent p-1 text-sm text-white focus:outline-none"
                    maxLength={6}
                />
            </div>
        </div>
         <style>{`
            .hue-slider {
                background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
            }
            .hue-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: var(--thumb-color);
                border: 2px solid white;
                cursor: pointer;
            }
            .hue-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: var(--thumb-color);
                border: 2px solid white;
                cursor: pointer;
            }
        `}</style>
    </div>
  );
};

export const ColorInput: React.FC<{ label: string; color: string; onChange: (newColor: string) => void; showMixed?: boolean; preventFocusSteal?: boolean; onCommit?: () => void; }> = ({ label, color, onChange, showMixed, preventFocusSteal, onCommit }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div
        className="w-full h-8 p-1 border border-gray-600 rounded-md cursor-pointer bg-gray-800 flex items-center"
        onMouseDown={preventFocusSteal ? (e) => { e.preventDefault(); setIsOpen(!isOpen); } : undefined}
        onClick={!preventFocusSteal ? () => setIsOpen(!isOpen) : undefined}
      >
        <div style={{ backgroundColor: showMixed ? 'transparent' : color }} className={`w-full h-full rounded-sm ${showMixed ? 'multi-color-bg' : ''}`} >
          {showMixed && <span className="text-xs text-center block text-gray-400 leading-6">Mixed</span>}
        </div>
      </div>
      {isOpen && (
        <div 
            className="absolute top-full mt-2 z-20 p-2 bg-gray-800 rounded-md shadow-lg border border-gray-700 w-56"
            onMouseDown={preventFocusSteal ? (e) => {
                const target = e.target as HTMLElement;
                if (!(target.tagName.toLowerCase() === 'input' && target.getAttribute('type') === 'range')) {
                    e.preventDefault();
                }
            } : undefined}
        >
          <ColorPicker color={color} onChange={onChange} onClose={() => setIsOpen(false)} onCommit={onCommit}/>
        </div>
      )}
      <style>{`
        .multi-color-bg {
          background: repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 
          50% / 10px 10px;
        }
      `}</style>
    </div>
  );
};