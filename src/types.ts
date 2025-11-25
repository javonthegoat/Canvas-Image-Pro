
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnnotationTool = 'select' | 'freehand' | 'text' | 'rect' | 'circle' | 'arrow' | 'line' | 'eyedropper' | 'crop';

export interface AnnotationBase {
  id: string;
  color: string;
  strokeWidth: number;
  scale: number;
  rotation: number; // in degrees
}

export interface FreehandAnnotation extends AnnotationBase {
  type: 'freehand';
  points: Point[];
  outlineColor?: string;
  outlineWidth?: number;
  outlineOpacity?: number;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  backgroundColor: string;
  backgroundOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
}

export interface RectAnnotation extends AnnotationBase {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  fillOpacity?: number;
}

export interface CircleAnnotation extends AnnotationBase {
  type: 'circle';
  x: number; // center x
  y: number; // center y
  radius: number;
  fillColor?: string;
  fillOpacity?: number;
}

export interface ArrowAnnotation extends AnnotationBase {
    type: 'arrow';
    start: Point;
    end: Point;
    outlineColor?: string;
    outlineWidth?: number;
    outlineOpacity?: number;
}

export interface LineAnnotation extends AnnotationBase {
  type: 'line';
  start: Point;
  end: Point;
  outlineColor?: string;
  outlineWidth?: number;
  outlineOpacity?: number;
}

export type Annotation = FreehandAnnotation | TextAnnotation | RectAnnotation | CircleAnnotation | ArrowAnnotation | LineAnnotation;

export interface CanvasImage {
  id: string;
  name: string;
  element: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number; // in degrees
  annotations: Annotation[];
  createdAt: Date;
  outlineColor?: string;
  outlineWidth?: number;
  outlineOpacity?: number;
  uncroppedFromId?: string;
  originalWidth: number;
  originalHeight: number;
  cropRect: Rect | null;
  groups?: Group[];
  tags?: string[];
  visible?: boolean;
  locked?: boolean;
}

export type AspectRatio = 'free' | '1:1' | '4:3' | '16:9';

export interface Group {
  id: string;
  name: string;
  label: string;
  showLabel: boolean;
  imageIds: string[];
  groupIds: string[];
  isExpanded: boolean;
  parentId: string | null;
  visible?: boolean;
  locked?: boolean;
}

export type AnnotationSelection = { imageId: string | null; annotationId: string; };
