import React, { useRef, useEffect, useState } from 'react';
import { CanvasImage, Point, Rect, Group } from '../types';
import { getImagesBounds } from '../utils/canvasUtils';

interface MiniMapProps {
    images: CanvasImage[];
    viewTransform: { scale: number; offset: Point };
    setViewTransform: React.Dispatch<React.SetStateAction<{ scale: number; offset: Point }>>;
    viewportSize: { width: number; height: number };
    groups: Group[];
}

export const MiniMap: React.FC<MiniMapProps> = ({ images, viewTransform, setViewTransform, viewportSize }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Determine world bounds based on all images
    const getWorldBounds = (): Rect => {
        if (images.length === 0) return { x: 0, y: 0, width: 1000, height: 1000 };
        
        const bounds = getImagesBounds(images);
        if (!bounds) return { x: 0, y: 0, width: 1000, height: 1000 };
        
        // Add comfortable padding around the content
        const padding = Math.max(bounds.width, bounds.height) * 0.5;
        return {
            x: bounds.x - padding,
            y: bounds.y - padding,
            width: bounds.width + padding * 2,
            height: bounds.height + padding * 2
        };
    };

    const worldBounds = getWorldBounds();

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas.getBoundingClientRect();
        canvas.width = width;
        canvas.height = height;

        // Calculate scale to fit world bounds into minimap
        const scaleX = width / worldBounds.width;
        const scaleY = height / worldBounds.height;
        const mapScale = Math.min(scaleX, scaleY);

        // Clear background
        ctx.fillStyle = 'rgba(31, 41, 55, 0.9)'; // Tailwind gray-800
        ctx.fillRect(0, 0, width, height);

        // Center the map content within the minimap canvas
        const offsetX = (width - worldBounds.width * mapScale) / 2;
        const offsetY = (height - worldBounds.height * mapScale) / 2;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(mapScale, mapScale);
        ctx.translate(-worldBounds.x, -worldBounds.y);

        // Draw Images
        ctx.fillStyle = '#6b7280'; // Tailwind gray-500
        images.forEach(img => {
             ctx.fillRect(img.x, img.y, img.width * img.scale, img.height * img.scale);
        });

        // Draw Viewport Rectangle
        const vpX = -viewTransform.offset.x / viewTransform.scale;
        const vpY = -viewTransform.offset.y / viewTransform.scale;
        const vpW = viewportSize.width / viewTransform.scale;
        const vpH = viewportSize.height / viewTransform.scale;

        ctx.strokeStyle = '#3b82f6'; // Tailwind blue-500
        ctx.lineWidth = 2 / mapScale; // Keep border thickness constant visually
        ctx.strokeRect(vpX, vpY, vpW, vpH);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.fillRect(vpX, vpY, vpW, vpH);

        ctx.restore();
    };

    useEffect(() => {
        draw();
    }, [images, viewTransform, worldBounds.x, worldBounds.y, worldBounds.width, worldBounds.height, viewportSize]);

    const handleInput = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        const clickX = clientX - rect.left;
        const clickY = clientY - rect.top;

        const { width, height } = rect;
        const scaleX = width / worldBounds.width;
        const scaleY = height / worldBounds.height;
        const mapScale = Math.min(scaleX, scaleY);
        
        const mapOffsetX = (width - worldBounds.width * mapScale) / 2;
        const mapOffsetY = (height - worldBounds.height * mapScale) / 2;

        // Transform click coordinates back to world coordinates
        const targetWorldX = ((clickX - mapOffsetX) / mapScale) + worldBounds.x;
        const targetWorldY = ((clickY - mapOffsetY) / mapScale) + worldBounds.y;

        // Center main view on the clicked location
        const newOffsetX = (viewportSize.width / 2) - targetWorldX * viewTransform.scale;
        const newOffsetY = (viewportSize.height / 2) - targetWorldY * viewTransform.scale;

        setViewTransform(prev => ({ ...prev, offset: { x: newOffsetX, y: newOffsetY } }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleInput(e.clientX, e.clientY);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                handleInput(e.clientX, e.clientY);
            }
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, worldBounds, viewTransform.scale, viewportSize]);

    if (images.length === 0) return null;

    return (
        <div className="absolute bottom-4 right-4 w-48 h-36 bg-gray-900/90 border border-gray-700 shadow-lg rounded-lg overflow-hidden z-40 select-none">
            <canvas 
                ref={canvasRef} 
                className="w-full h-full block cursor-crosshair"
                onMouseDown={handleMouseDown}
            />
        </div>
    );
};