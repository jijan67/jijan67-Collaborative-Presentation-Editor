import React, { useEffect, useRef, useState } from 'react';
import { Canvas, IText, Rect, Circle, Path, Image, PencilBrush } from 'fabric';

// Add font options
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const FONT_FAMILIES = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
  'Helvetica',
  'Comic Sans MS',
  'Impact',
  'Trebuchet MS',
  'Roboto'
];

const SlideEditor = ({ slide, canEdit, onUpdate, isPreview }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(2);
  const [selectedFontSize, setSelectedFontSize] = useState(20);
  const [selectedFontFamily, setSelectedFontFamily] = useState('Arial');

  // Add font handling functions
  const handleFontSizeChange = (size) => {
    if (!fabricRef.current) return;
    const activeObject = fabricRef.current.getActiveObject();
    if (activeObject && activeObject.type === 'i-text') {
      activeObject.set('fontSize', parseInt(size));
      fabricRef.current.renderAll();
      if (canEdit) {
        onUpdate(fabricRef.current.toJSON());
      }
    }
    setSelectedFontSize(parseInt(size));
  };

  const handleFontFamilyChange = (family) => {
    if (!fabricRef.current) return;
    const activeObject = fabricRef.current.getActiveObject();
    if (activeObject && activeObject.type === 'i-text') {
      activeObject.set('fontFamily', family);
      fabricRef.current.renderAll();
      if (canEdit) {
        onUpdate(fabricRef.current.toJSON());
      }
    }
    setSelectedFontFamily(family);
  };

  // Update text formatting function to include font properties
  const handleTextFormatting = (format) => {
    if (!fabricRef.current) return;
    const activeObject = fabricRef.current.getActiveObject();
    if (activeObject && activeObject.type === 'i-text') {
      switch (format) {
        case 'bold':
          activeObject.set('fontWeight', activeObject.fontWeight === 'bold' ? 'normal' : 'bold');
          break;
        case 'italic':
          activeObject.set('fontStyle', activeObject.fontStyle === 'italic' ? 'normal' : 'italic');
          break;
        case 'underline':
          activeObject.set('underline', !activeObject.underline);
          break;
        default:
          break;
      }
      fabricRef.current.renderAll();
      if (canEdit) {
        onUpdate(fabricRef.current.toJSON());
      }
    }
  };

  // Cleanup function to properly dispose of the canvas
  const cleanupCanvas = () => {
    if (fabricRef.current) {
      try {
        const canvas = fabricRef.current;
        
        // Remove all event listeners first
        canvas.off();
        
        // Clear all objects
        canvas.clear();
        
        // Dispose the canvas
        canvas.dispose();
        
        // Clear the reference
        fabricRef.current = null;
      } catch (error) {
        console.error('Error disposing canvas:', error);
      }
    }
  };

  // Initialize the canvas
  const initializeCanvas = () => {
    if (!canvasRef.current || !containerRef.current) return;

    setIsLoading(true);

    // Clean up existing canvas if any
    cleanupCanvas();

    try {
      // Create a fresh canvas element
      const oldCanvas = canvasRef.current;
      const newCanvas = document.createElement('canvas');
      newCanvas.width = isPreview ? 240 : 960;
      newCanvas.height = isPreview ? 135 : 540;
      newCanvas.style = oldCanvas.style;
      oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
      canvasRef.current = newCanvas;

      // Initialize Fabric.js canvas
      fabricRef.current = new Canvas(newCanvas, {
        width: isPreview ? 240 : 960,
        height: isPreview ? 135 : 540,
        backgroundColor: 'white',
        preserveObjectStacking: true,
        selection: canEdit && !isPreview,
        renderOnAddRemove: true,
        stateful: true,
        isDrawingMode: false
      });

      const fabricCanvas = fabricRef.current;

      // Load slide content
      if (slide.content) {
        try {
          const content = typeof slide.content === 'string' 
            ? JSON.parse(slide.content) 
            : slide.content;

          fabricCanvas.loadFromJSON(content, () => {
            fabricCanvas.forEachObject(obj => {
              obj.selectable = canEdit && !isPreview;
              obj.evented = canEdit && !isPreview;
              if (obj.type === 'i-text') {
                obj.editable = canEdit && !isPreview;
              }
              // Scale objects for preview
              if (isPreview) {
                obj.scale(0.25);
              }
            });
            fabricCanvas.requestRenderAll();
            setIsLoading(false);
          });
        } catch (error) {
          console.error('Error loading slide content:', error);
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }

      // Set up event listeners for changes
      const handleModification = () => {
        if (canEdit && fabricRef.current) {
          onUpdate(fabricRef.current.toJSON());
        }
      };

      // Add event listeners for all modifications
      fabricCanvas.on({
        'object:modified': handleModification,
        'object:added': handleModification,
        'object:removed': handleModification,
        'text:changed': handleModification,
        'selection:created': handleModification,
        'selection:updated': handleModification,
        'selection:cleared': handleModification,
        'mouse:dblclick': (options) => {
          if (canEdit && options.target && options.target.type === 'i-text') {
            options.target.enterEditing();
            if (options.target.hiddenTextarea) {
              options.target.hiddenTextarea.focus();
            }
          }
        }
      });

      // Enable keyboard delete
      const handleKeyDown = (e) => {
        if (!canEdit || !fabricRef.current) return;
        
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const activeObject = fabricRef.current.getActiveObject();
          
          // If we're editing text, let the default behavior handle it
          if (activeObject && activeObject.type === 'i-text' && activeObject.isEditing) {
            return;
          }

          // Otherwise, delete selected objects
          const activeObjects = fabricRef.current.getActiveObjects();
          if (activeObjects.length > 0) {
            activeObjects.forEach(obj => fabricRef.current.remove(obj));
            fabricRef.current.discardActiveObject();
            fabricRef.current.requestRenderAll();
            handleModification();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      // Add text editing events
      fabricCanvas.on('text:editing:entered', (options) => {
        if (options.target) {
          options.target.hiddenTextarea?.focus();
        }
      });

      fabricCanvas.on('text:changed', (options) => {
        if (options.target) {
          handleModification();
        }
      });

      // Set up drawing brush
      if (fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.color = brushColor;
        fabricCanvas.freeDrawingBrush.width = brushWidth;
      }

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    } catch (error) {
      console.error('Error initializing canvas:', error);
      setIsLoading(false);
    }
  };

  // Initialize canvas when component mounts or slide changes
  useEffect(() => {
    const cleanup = initializeCanvas();
    return () => {
      if (cleanup) cleanup();
      cleanupCanvas();
    };
  }, [slide.id]); // Only reinitialize on slide ID change

  // Update canvas properties when canEdit changes
  useEffect(() => {
    if (fabricRef.current) {
      const canvas = fabricRef.current;
      canvas.selection = canEdit;
      canvas.forEachObject(obj => {
        obj.selectable = canEdit;
        obj.evented = canEdit;
        if (obj.type === 'i-text') {
          obj.editable = canEdit;
        }
      });
      canvas.requestRenderAll();
    }
  }, [canEdit]);

  const addObject = (object) => {
    if (!fabricRef.current || !canEdit) return;

    try {
      // Make object draggable and selectable
      object.set({
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
      });
      
      // Apply font properties if it's a text object
      if (object.type === 'i-text') {
        object.set({
          fontSize: selectedFontSize,
          fontFamily: selectedFontFamily
        });
      }
      
      fabricRef.current.add(object);
      fabricRef.current.setActiveObject(object);
      fabricRef.current.renderAll();
      onUpdate(fabricRef.current.toJSON());
    } catch (error) {
      console.error('Error adding object:', error);
    }
  };

  // Toggle drawing mode
  const toggleDrawingMode = () => {
    if (!fabricRef.current || !canEdit) return;
    
    const canvas = fabricRef.current;
    const newMode = !isDrawingMode;
    setIsDrawingMode(newMode);
    
    // Initialize the brush if it doesn't exist
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new PencilBrush(canvas);
    }
    
    canvas.isDrawingMode = newMode;
    
    if (newMode && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = brushColor;
      canvas.freeDrawingBrush.width = brushWidth;
    }
  };

  return (
    <div className={`slide-editor-container ${isPreview ? 'preview' : ''}`} ref={containerRef}>
      <div className="canvas-wrapper" style={{ position: 'relative' }}>
        <canvas 
          ref={canvasRef} 
          style={{ 
            opacity: isLoading ? 0 : 1, 
            transition: 'opacity 0.3s ease',
            width: isPreview ? '240px' : '960px',
            height: isPreview ? '135px' : '540px'
          }} 
        />
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'white'
          }}>
            Loading slide content...
          </div>
        )}
      </div>
      {canEdit && !isPreview && (
        <div className="editor-tools">
          <button onClick={() => {
            try {
              const text = new IText('Edit text', {
                left: 100,
                top: 100,
                fontSize: selectedFontSize,
                fontFamily: selectedFontFamily,
                fill: '#000000',
                editable: true,
                selectable: true,
                hasControls: true,
                hasBorders: true
              });
              addObject(text);
              text.enterEditing();
            } catch (error) {
              console.error('Error adding text:', error);
            }
          }}>Add Text</button>

          <div className="text-formatting-tools">
            <select 
              value={selectedFontFamily}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="font-family-select"
            >
              {FONT_FAMILIES.map(font => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </option>
              ))}
            </select>

            <select 
              value={selectedFontSize}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="font-size-select"
            >
              {FONT_SIZES.map(size => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>

            <button 
              onClick={() => handleTextFormatting('bold')}
              className="format-btn"
            >B</button>
            <button 
              onClick={() => handleTextFormatting('italic')}
              className="format-btn"
            >I</button>
            <button 
              onClick={() => handleTextFormatting('underline')}
              className="format-btn"
            >U</button>
          </div>

          <button onClick={() => {
            try {
              const rect = new Rect({
                left: 100,
                top: 100,
                width: 100,
                height: 100,
                fill: '#4f46e5',
                opacity: 0.7,
                strokeWidth: 1,
                stroke: '#000000'
              });
              addObject(rect);
            } catch (error) {
              console.error('Error adding rectangle:', error);
            }
          }}>Add Rectangle</button>

          <button onClick={() => {
            try {
              const circle = new Circle({
                left: 100,
                top: 100,
                radius: 50,
                fill: '#4f46e5',
                opacity: 0.7,
                strokeWidth: 1,
                stroke: '#000000'
              });
              addObject(circle);
            } catch (error) {
              console.error('Error adding circle:', error);
            }
          }}>Add Circle</button>

          <button onClick={() => {
            try {
              const arrow = new Path('M 0 0 L 200 0 L 190 -10 M 200 0 L 190 10', {
                left: 100,
                top: 100,
                stroke: '#4f46e5',
                strokeWidth: 2,
                fill: '',
                strokeLineJoin: 'round',
                strokeLineCap: 'round'
              });
              addObject(arrow);
            } catch (error) {
              console.error('Error adding arrow:', error);
            }
          }}>Add Arrow</button>

          <button 
            onClick={toggleDrawingMode}
            className={`drawing-btn ${isDrawingMode ? 'active' : ''}`}
          >
            {isDrawingMode ? 'Stop Drawing' : 'Draw'}
          </button>

          {isDrawingMode && (
            <div className="drawing-tools">
              <input
                type="color"
                value={brushColor}
                onChange={(e) => {
                  setBrushColor(e.target.value);
                  if (fabricRef.current?.freeDrawingBrush) {
                    fabricRef.current.freeDrawingBrush.color = e.target.value;
                  }
                }}
              />
              <input
                type="range"
                min="1"
                max="20"
                value={brushWidth}
                onChange={(e) => {
                  setBrushWidth(parseInt(e.target.value));
                  if (fabricRef.current?.freeDrawingBrush) {
                    fabricRef.current.freeDrawingBrush.width = parseInt(e.target.value);
                  }
                }}
              />
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                try {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const imgElement = new window.Image();
                    imgElement.onload = () => {
                      const fabricImage = new Image(imgElement, {
                        left: 100,
                        top: 100
                      });
                      
                      // Scale image to reasonable size if too large
                      if (fabricImage.width > 300) {
                        fabricImage.scaleToWidth(300, true);
                      }
                      
                      addObject(fabricImage);
                    };
                    imgElement.src = event.target.result;
                  };
                  reader.readAsDataURL(file);
                } catch (error) {
                  console.error('Error adding image:', error);
                }
              }
            }}
          />

          <button onClick={() => {
            if (!fabricRef.current) return;
            try {
              const activeObjects = fabricRef.current.getActiveObjects();
              if (activeObjects.length > 0) {
                activeObjects.forEach(obj => fabricRef.current.remove(obj));
                fabricRef.current.discardActiveObject();
                fabricRef.current.renderAll();
                onUpdate(fabricRef.current.toJSON());
              }
            } catch (error) {
              console.error('Error deleting objects:', error);
            }
          }}>Delete Selected</button>

          <input
            type="color"
            onChange={(e) => {
              if (!fabricRef.current) return;
              try {
                const activeObject = fabricRef.current.getActiveObject();
                if (activeObject) {
                  if (activeObject.type === 'path') {
                    activeObject.set('stroke', e.target.value);
                  } else {
                    activeObject.set('fill', e.target.value);
                  }
                  fabricRef.current.renderAll();
                  onUpdate(fabricRef.current.toJSON());
                }
              } catch (error) {
                console.error('Error changing color:', error);
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SlideEditor; 