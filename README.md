# Canvas Image Pro

This is an interactive web applet for advanced image manipulation, built by Google AI Studio. It features an infinite canvas for cropping, annotation, rotation, and scaling of multiple images with intuitive controls and a modern interface.

## Features

### Selection and Manipulation
- **Select Images**: Use the select tool to click on images. Hold `Shift` to select multiple images.
- **Drag and Drop**: Drag multiple selected images simultaneously. Images can also be dragged and dropped onto the canvas from your computer, or pasted from the clipboard.
- **Edit Annotations**: Use the select tool to edit annotations and change their individual properties. Multiple annotations can be selected and edited at the same time.
- **Scale and Rotate Annotations**: Scale annotations up or down by dragging the blue square when selected. Rotate them by dragging the blue circle.
- **Bulk Color Change**: Change the color of multiple annotations simultaneously.
- **Eyedropper Tool**: Use the color picker to change the color of multiple annotations. First, select the annotations, then press `I` to activate the color picker and click on any color on the canvas from images or other annotations.

### Annotation Tools

- **Line, Arrow, and Freehand Draw**: These tools have properties such as color, stroke/line width, outline color, outline opacity, and outline width.
- **Rectangle and Circle**: These tools have properties such as color, stroke/line width, fill color, and fill opacity.
- **Text Tool**: Options to change text color, font size, font family, background color and opacity, stroke color, stroke opacity, and stroke thickness.
- **Drag and Drop Annotations**: Drag and drop annotations from images in the layers panel into other images, or from the canvas onto images.

### Transform and Arrange Tools

- **Rotate and Scale**: Rotate images to any degree and scale them as large as you like.
- **Image Outline**: Add an outline to each image and change its width and color.
- **Grouping**: Select multiple images and group them together.
- **Align Selection**: Align images based on the last selected image. There are six alignment options: left, right, top, bottom, vertical center, and horizontal center.
- **Arrange Grid**: Arrange images in a grid. The order is based on the layer stack (oldest to newest by default). Clicking the arrange button again reverses the order.
- **Arrange Stack**: Stack images horizontally or vertically in a single line. Clicking the stack button again reverses the order.
- **Match Size**: Match the width or height of one image to another. The last image selected is the source for the size matching.

### Crop Tool

- **Activate Crop**: Hold `C` to start cropping. Click outside the crop area to cancel. Press `Enter` to confirm.
- **Multi-Image Crop**: Crop multiple images at once, which is useful for images with the same dimensions.
- **Aspect Ratios**: Choose from freeform, 1:1, 4:3, and 16:9 aspect ratios.
- **Copy Cropped Area**: Press `Ctrl + C` to copy the cropped area to your clipboard.
- **Uncrop**: You can uncrop an image after the crop has been confirmed.
- **Fit to Image/View**: `Fit to image` matches the crop area to the image dimensions. `Fit to view` matches the crop area to your current canvas view.

### Copy and Paste

- **Copy Image**: Select an image and press `Ctrl + C` to copy it.
- **Copy Cropped Area**: If a crop area is active, `Ctrl + C` will copy the cropped area instead of the selected image.
- **Copy Multiple Images**: If multiple images are selected, `Ctrl + C` will copy them as a single image.

### Project Management

- **Save and Load**: Save your entire project, including all images, annotations, and their properties. Load the project later to continue where you left off.
- **Export**: Export images to a ZIP file, or download them individually as PNG or JPG.
- **Clear Canvas**: Click "Clear Canvas" twice to remove all images from the canvas.
- **Numbered Export**: When exporting to a ZIP file, images are named and numbered based on their order in the layer stack.