import React, { useState, useEffect, createRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, 
  Plus, Minus, Users, Edit3, Eye, 
  Save, Download, Play, ZoomIn, ZoomOut,
  FileDown
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { Canvas } from 'fabric';
import SlideEditor from './components/SlideEditor';
import './App.css';

// Mock database using localStorage
const getFromStorage = (key, defaultValue) => {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : defaultValue;
};

const saveToStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Updated exportToPDF function
const exportToPDF = async (slides, currentPresentation) => {
  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '960px';
    container.style.height = '540px';
    container.style.backgroundColor = 'white';
    container.style.zIndex = '-9999';
    document.body.appendChild(container);

    // Create a temporary root for React rendering
    const tempRoot = document.createElement('div');
    container.appendChild(tempRoot);

    for (let i = 0; i < slides.length; i++) {
      try {
        // Create a promise to handle the image capture
        const slideImage = await new Promise((resolve, reject) => {
          // Create temporary SlideEditor instance
          const slideEditor = document.createElement('div');
          slideEditor.style.width = '960px';
          slideEditor.style.height = '540px';
          tempRoot.appendChild(slideEditor);

          // Render the SlideEditor component
          const slide = slides[i];
          const editor = <SlideEditor
            slide={slide}
            canEdit={false}
            onUpdate={() => {}}
            isPreview={false}
          />;

          // Render using ReactDOM
          const root = require('react-dom/client');
          const reactRoot = root.createRoot(slideEditor);
          
          reactRoot.render(editor);

          // Wait for the content to be rendered
          setTimeout(async () => {
            try {
              // Find the canvas element within the rendered component
              const canvas = slideEditor.querySelector('canvas');
              if (!canvas) {
                reject(new Error('Canvas not found'));
                return;
              }

              // Use html-to-image to capture the slide
              const dataUrl = await toPng(slideEditor, {
                width: 960,
                height: 540,
                quality: 1.0,
                backgroundColor: 'white'
              });

              // Clean up
              reactRoot.unmount();
              tempRoot.removeChild(slideEditor);
              
              resolve(dataUrl);
            } catch (err) {
              reject(err);
            }
          }, 500); // Wait for rendering to complete
        });

        // Add new page if not first slide
        if (i > 0) {
          pdf.addPage();
        }

        // Add image to PDF
        pdf.addImage(
          slideImage,
          'PNG',
          0,
          0,
          pageWidth,
          pageHeight
        );

      } catch (slideError) {
        console.error(`Error processing slide ${i + 1}:`, slideError);
        continue;
      }
    }

    // Save the PDF
    const fileName = `${currentPresentation.title || 'presentation'}.pdf`;
    pdf.save(fileName);

    // Clean up
    document.body.removeChild(container);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    alert('Error exporting to PDF: ' + error.message);
  }
};

// Main App Component
function App() {
  const [nickname, setNickname] = useState('');
  const [showNicknameModal, setShowNicknameModal] = useState(true);
  const [currentView, setCurrentView] = useState('presentationsList');
  const [presentations, setPresentations] = useState(getFromStorage('presentations', []));
  const [currentPresentation, setCurrentPresentation] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPresenting, setIsPresenting] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showUserPanel, setShowUserPanel] = useState(true);
  const [slides, setSlides] = useState([
    { id: 1, content: null },
  ]);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  // Mock websocket connection
  useEffect(() => {
    // Simulate receiving updates from other users
    const interval = setInterval(() => {
      if (currentPresentation) {
        const updatedPresentations = getFromStorage('presentations', []);
        const updatedPresentation = updatedPresentations.find(p => p.id === currentPresentation.id);
        if (updatedPresentation) {
          setCurrentPresentation(updatedPresentation);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPresentation]);

  // Save presentations to localStorage whenever they change
  useEffect(() => {
    saveToStorage('presentations', presentations);
  }, [presentations]);

  const handleJoinWithNickname = () => {
    if (nickname.trim()) {
      setShowNicknameModal(false);
    }
  };

  const createNewPresentation = () => {
    const newPresentation = {
      id: uuidv4(),
      title: 'Untitled Presentation',
      createdAt: new Date().toISOString(),
      creator: nickname,
      users: [{ name: nickname, role: 'creator' }],
      slides: [{
        id: uuidv4(),
        content: null
      }]
    };
    
    setPresentations([...presentations, newPresentation]);
    setCurrentPresentation(newPresentation);
    setCurrentView('editor');
    setCurrentSlide(0);
  };

  const joinPresentation = (presentation) => {
    const updatedPresentation = { ...presentation };
    if (!updatedPresentation.users.some(user => user.name === nickname)) {
      updatedPresentation.users.push({ name: nickname, role: 'viewer' });
    }

    const updatedPresentations = presentations.map(p => 
      p.id === updatedPresentation.id ? updatedPresentation : p
    );
    
    setPresentations(updatedPresentations);
    setCurrentPresentation(updatedPresentation);
    setCurrentView('editor');
    setCurrentSlide(0);
  };

  const addSlide = () => {
    if (getCurrentUserRole() !== 'creator') return;
    
    const newSlide = {
      id: uuidv4(),
      content: null
    };
    
    const updatedPresentation = {
      ...currentPresentation,
      slides: [...currentPresentation.slides, newSlide]
    };
    
    updatePresentation(updatedPresentation);
    setCurrentSlide(updatedPresentation.slides.length - 1);
  };

  const removeSlide = (index) => {
    if (getCurrentUserRole() !== 'creator' || currentPresentation.slides.length <= 1) return;
    
    const updatedSlides = [...currentPresentation.slides];
    updatedSlides.splice(index, 1);
    
    const updatedPresentation = {
      ...currentPresentation,
      slides: updatedSlides
    };
    
    updatePresentation(updatedPresentation);
    if (currentSlide >= updatedSlides.length) {
      setCurrentSlide(updatedSlides.length - 1);
    }
  };

  const updateSlideContent = (content) => {
    if (!canEdit()) return;
    
    const updatedSlides = [...currentPresentation.slides];
    updatedSlides[currentSlide] = {
      ...updatedSlides[currentSlide],
      content
    };
    
    updatePresentation({
      ...currentPresentation,
      slides: updatedSlides
    });
  };

  const updatePresentation = (updatedPresentation) => {
    setCurrentPresentation(updatedPresentation);
    
    const updatedPresentations = presentations.map(p => 
      p.id === updatedPresentation.id ? updatedPresentation : p
    );
    
    setPresentations(updatedPresentations);
  };

  const getCurrentUserRole = () => {
    if (!currentPresentation) return null;
    const user = currentPresentation.users.find(user => user.name === nickname);
    return user ? user.role : null;
  };

  const toggleUserRole = (userName) => {
    if (getCurrentUserRole() !== 'creator') return;
    
    const updatedUsers = currentPresentation.users.map(user => {
      if (user.name === userName && user.role !== 'creator') {
        return { 
          ...user, 
          role: user.role === 'editor' ? 'viewer' : 'editor' 
        };
      }
      return user;
    });
    
    updatePresentation({
      ...currentPresentation,
      users: updatedUsers
    });
  };

  const canEdit = () => {
    const role = getCurrentUserRole();
    return role === 'creator' || role === 'editor';
  };

  const handleSlideUpdate = (content) => {
    setSlides(slides.map(slide => 
      slide.id === currentSlide ? { ...slide, content } : slide
    ));
  };

  const addNewSlide = () => {
    const newSlide = {
      id: Math.max(...slides.map(s => s.id)) + 1,
      content: null
    };
    setSlides([...slides, newSlide]);
  };

  const deleteSlide = (id) => {
    if (slides.length > 1) {
      setSlides(slides.filter(slide => slide.id !== id));
      if (currentSlide === id) {
        setCurrentSlide(slides[0].id);
      }
    }
  };

  const togglePresentationMode = () => {
    setIsPresentationMode(!isPresentationMode);
    setCurrentSlide(slides[0].id);
  };

  const nextSlide = () => {
    const currentIndex = slides.findIndex(slide => slide.id === currentSlide);
    if (currentIndex < slides.length - 1) {
      setCurrentSlide(slides[currentIndex + 1].id);
    }
  };

  const previousSlide = () => {
    const currentIndex = slides.findIndex(slide => slide.id === currentSlide);
    if (currentIndex > 0) {
      setCurrentSlide(slides[currentIndex - 1].id);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (isPresentationMode) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          nextSlide();
        } else if (e.key === 'ArrowLeft') {
          previousSlide();
        } else if (e.key === 'Escape') {
          setIsPresentationMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPresentationMode, currentSlide]);

  // Render functions
  const renderPresentationsList = () => (
    <motion.div 
      className="presentations-list"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="header">
        <h1>Collaborative Presentations</h1>
        <p>Welcome, {nickname}</p>
      </div>
      
      <div className="presentations-grid">
        <motion.div 
          className="new-presentation-card"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={createNewPresentation}
        >
          <div className="card-content">
            <Plus size={48} />
            <h3>Create New Presentation</h3>
          </div>
        </motion.div>
        
        {presentations.map(presentation => (
          <motion.div 
            key={presentation.id}
            className="presentation-card"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => joinPresentation(presentation)}
          >
            <div className="thumbnail">
              {presentation.slides && presentation.slides[0] && (
                <div className="slide-preview">
                  <SlideEditor
                    slide={presentation.slides[0]}
                    canEdit={false}
                    onUpdate={() => {}}
                  />
                </div>
              )}
            </div>
            <div className="card-info">
              <h3>{presentation.title}</h3>
              <p>Created by: {presentation.creator}</p>
              <p>Users: {presentation.users.length}</p>
              <p>Slides: {presentation.slides.length}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  const renderNicknameModal = () => (
    <motion.div 
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div 
        className="modal"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h2>Welcome to Collaborative Presentations</h2>
        <p>Please enter your nickname to continue</p>
        <input
          type="text"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleJoinWithNickname()}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleJoinWithNickname}
          disabled={!nickname.trim()}
        >
          Join
        </motion.button>
      </motion.div>
    </motion.div>
  );

  const renderEditor = () => (
    <div className={`editor-container ${isPresenting ? 'presenting' : ''}`}>
      {!isPresenting && (
        <>
          <div className="top-toolbar">
            <div className="left-group">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setCurrentView('presentationsList')}
              >
                Back
              </motion.button>
              <input 
                type="text" 
                value={currentPresentation?.title || ''} 
                onChange={(e) => {
                  if (canEdit()) {
                    updatePresentation({
                      ...currentPresentation,
                      title: e.target.value
                    });
                  }
                }}
                disabled={!canEdit()}
              />
            </div>
            
            <div className="right-group">
              <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 2))}>
                <ZoomIn size={16} />
              </button>
              <span>{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.5))}>
                <ZoomOut size={16} />
              </button>
              <button onClick={() => setIsPresenting(true)}>
                <Play size={16} />
              </button>
              <button onClick={() => setShowUserPanel(!showUserPanel)}>
                <Users size={16} />
              </button>
              <button 
                onClick={() => exportToPDF(currentPresentation.slides, currentPresentation)}
                title="Export to PDF"
              >
                <FileDown size={16} />
                Export PDF
              </button>
            </div>
          </div>
          
          <div className="main-content">
            <div className="slides-panel">
              {currentPresentation?.slides.map((slide, index) => (
                <motion.div 
                  key={slide.id}
                  className={`slide-thumbnail ${index === currentSlide ? 'active' : ''}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCurrentSlide(index)}
                >
                  <div className="slide-number">{index + 1}</div>
                  {getCurrentUserRole() === 'creator' && (
                    <button 
                      className="remove-slide" 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSlide(index);
                      }}
                    >
                      <Minus size={12} />
                    </button>
                  )}
                </motion.div>
              ))}
              
              {getCurrentUserRole() === 'creator' && (
                <motion.div 
                  className="add-slide"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={addSlide}
                >
                  <Plus size={24} />
                </motion.div>
              )}
            </div>
            
            <div className="slide-editor">
              <div 
                className="slide-container"
                style={{ 
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'center center'
                }}
              >
                {currentPresentation?.slides[currentSlide] && (
                  <SlideEditor
                    slide={currentPresentation.slides[currentSlide]}
                    canEdit={canEdit()}
                    onUpdate={updateSlideContent}
                  />
                )}
              </div>
            </div>
            
            {showUserPanel && (
              <div className="users-panel">
                <h3>Users</h3>
                <ul>
                  {currentPresentation?.users.map(user => (
                    <li key={user.name} className={user.role}>
                      <span>{user.name}</span>
                      <span className="role-badge">
                        {user.role === 'creator' ? (
                          <Save size={14} />
                        ) : user.role === 'editor' ? (
                          <Edit3 size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                        {user.role}
                      </span>
                      {getCurrentUserRole() === 'creator' && user.role !== 'creator' && (
                        <button onClick={() => toggleUserRole(user.name)}>
                          {user.role === 'viewer' ? 'Make Editor' : 'Make Viewer'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
      
      {isPresenting && (
        <div className="presentation-mode">
          <div className="presentation-controls">
            <button 
              disabled={currentSlide === 0} 
              onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
            >
              <ArrowLeft size={24} />
            </button>
            <span>{currentSlide + 1} / {currentPresentation?.slides.length}</span>
            <button 
              disabled={currentSlide === currentPresentation?.slides.length - 1} 
              onClick={() => setCurrentSlide(prev => Math.min(currentPresentation.slides.length - 1, prev + 1))}
            >
              <ArrowRight size={24} />
            </button>
            <button onClick={() => setIsPresenting(false)}>
              Exit
            </button>
          </div>
          
          <div className="presentation-slide">
            {currentPresentation?.slides[currentSlide] && (
              <SlideEditor
                slide={currentPresentation.slides[currentSlide]}
                canEdit={false}
                onUpdate={() => {}}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      {showNicknameModal && renderNicknameModal()}
      {!showNicknameModal && currentView === 'presentationsList' && renderPresentationsList()}
      {!showNicknameModal && currentView === 'editor' && renderEditor()}
    </div>
  );
}

export default App;