# Canvas Image Pro

An interactive web applet for advanced image manipulation, featuring an infinite canvas for cropping, annotation, rotation, and scaling of multiple images with intuitive controls and a modern interface.

<!-- ![Canvas Image Pro Screenshot](path/to/screenshot.png) -->

## Key Features

### Core Canvas Functionality
- **Infinite Canvas**: Work on a limitless, zoomable, and pannable canvas that adapts to your needs.
- **Multi-Image Support**: Load and manipulate multiple images simultaneously.
- **Flexible Image Loading**: Add images via a file dialog, drag & drop from your desktop, or paste directly from your clipboard.
- **Full History**: Never lose your work with a robust undo/redo system that tracks every action.

### Advanced Layering & Grouping
- **Intuitive Layer List**: Manage all images and canvas-level annotations in a clear, hierarchical list.
- **Drag & Drop Reordering**: Easily change the stacking order of images and groups by dragging them in the layer list.
- **Image Grouping**: Select multiple images and group them into collapsible folders for streamlined organization and manipulation.

### Precise Transformations & Alignment
- **Transform Tools**: Precisely scale, rotate, and position images using sidebar controls.
- **Image Outlines**: Add customizable outlines to any image.
- **Multi-Image Alignment**: Select multiple images to:
    - **Align**: Align edges (left, right, top, bottom) or centers (horizontal, vertical).
    - **Arrange**: Automatically place images in a smart grid layout.
    - **Stack**: Arrange images edge-to-edge in a horizontal or vertical stack.
    - **Distribute**: Evenly space three or more images.
    - **Match Size**: Match the width or height of all selected images to the last one selected.

### Powerful Annotation Suite
- **Comprehensive Toolset**:
    - **Select & Move**: The default tool for manipulating items.
    - **Drawing**: Line, Arrow, Freehand, Rectangle, and Circle tools.
    - **Text**: Add rich text with font, color, background, and stroke options.
    - **Eyedropper**: Quickly pick a color from anywhere on the canvas.
- **Flexible Annotation Targets**: Annotations can be attached to a specific image (moving and scaling with it) or placed directly on the canvas.
- **Annotation Re-parenting**: Seamlessly move an annotation from one image to another, or from the canvas to an image, via drag & drop in the layer list.
- **Floating Property Editor**: A context-aware floating menu appears for selected annotations, allowing for quick edits to color, stroke, fill, opacity, text content, and more.

### Non-Destructive Cropping
- **Dynamic Crop Box**: Create a crop selection that can be moved and resized.
- **Aspect Ratios**: Constrain your crop selection to freeform, 1:1, 4:3, or 16:9 ratios.
- **Crop & Replace**: Crop one or more images within the selection area. The original images are archived, allowing you to uncrop later.
- **Copy to Clipboard**: Copy the contents of the crop area or selected images directly to the clipboard.
- **Uncrop**: Revert a previously cropped image back to its original, uncropped state.

### Project Management
- **Save & Load**: Save your entire session (images, positions, annotations, groups) to a single `.cpro` JSON file and load it later to continue your work.
- **Export**: Download all image layers on the canvas as individual PNG or JPEG files.
- **Clear Canvas**: Reset the entire workspace with a single click.

## Keyboard Shortcuts

| Action                      | Shortcut Key                               |
| --------------------------- | ------------------------------------------ |
| Undo                        | `Ctrl/Cmd + Z`                             |
| Redo                        | `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z`   |
| Activate Crop Tool (Hold)   | `C`                                        |
| Activate Pan Tool (Hold)    | `Spacebar`                                 |
| Delete Selection            | `Delete` or `Backspace`                    |
| Copy Selection/Crop Area    | `Ctrl/Cmd + C`                             |
| Switch to Select Tool       | `S`                                        |
| Switch to Eyedropper Tool   | `I`                                        |

## How To Use

1.  **Load Images**: Click "Upload Images", drag files onto the canvas, or paste an image from your clipboard.
2.  **Select Items**: Use the Select tool (`S`) to click on images or annotations. Hold `Shift` to select multiple items. You can also drag a marquee box to select multiple images.
3.  **Manipulate**:
    - Use the handles in the sidebar to scale and rotate selected images.
    - Drag selected items on the canvas to move them.
    - Use the alignment and distribution tools in the sidebar for precise layouts.
4.  **Annotate**:
    - Select an annotation tool from the toolbar.
    - Click and drag on the canvas or an image to draw.
    - For the Text tool, simply click where you want to add text.
5.  **Crop**:
    - Hold the `C` key and drag on the canvas to create a crop selection.
    - Use the crop tools in the sidebar to apply the crop or copy the selection.

## Built With

- **React**: For building the user interface.
- **TypeScript**: For static typing and improved code quality.
- **Tailwind CSS**: For rapid, utility-first styling.
