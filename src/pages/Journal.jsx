import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import CreateMemory from './CreateMemory';
import { replaceSampleMemories } from '../utils/sampleData';
import MobileNavigation from '../components/MobileNavigation';
import MemoryLocationMap from '../components/MemoryLocationMap';
import StreetView from '../components/StreetView';
import useSwipeGesture from '../hooks/useSwipeGesture';
import { fileToStoredImageDataUrl } from '../utils/imageStorage';

const MemorySpread = ({ memory, onEdit, onSave, onCancelEdit, onDelete, isEditing = false }) => {
  const [editTitle, setEditTitle] = useState(memory.title);
  const [editStory, setEditStory] = useState(memory.story);
  const [editLocation, setEditLocation] = useState(memory.location || null);
  const [editImageryType, setEditImageryType] = useState(memory.imageType || 'photo');
  const [editImage, setEditImage] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(memory.imageData || null);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync edit state with current memory when memory prop changes
  useEffect(() => {
    setEditTitle(memory.title);
    setEditStory(memory.story);
    setEditLocation(memory.location || null);
    setEditImageryType(memory.imageType || 'photo');
    setEditImage(null);
    setEditImagePreview(memory.imageData || null);
  }, [memory.id, memory.title, memory.story, memory.location, memory.imageType, memory.imageData]);

  const handleEditImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEditImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setEditImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  // Log when MemorySpread receives isEditing prop changes
  useEffect(() => {
    if (isEditing) {
      console.log('MemorySpread: Entering edit mode for memory:', {
        id: memory.id,
        title: memory.title
      });
    }
  }, [isEditing, memory.id, memory.title]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'A moment in time';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSave = async () => {
    if (!editTitle.trim() || !editStory.trim()) {
      alert('Please fill in both the title and story');
      return;
    }

    setSaving(true);
    try {
      // Street View mode never stores a photo; photo mode keeps the existing
      // image unless a new one was picked.
      let imageData = memory.imageData || null;
      if (editImageryType === 'streetview') {
        imageData = null;
      } else if (editImage) {
        // Resize/re-compress only as much as needed to fit Firestore's
        // per-field size limit, keeping the best quality that still fits.
        imageData = await fileToStoredImageDataUrl(editImage);
      }

      await onSave(memory.id, {
        title: editTitle.trim(),
        story: editStory.trim(),
        location: editLocation,
        imageType: editImageryType,
        imageData,
      });
    } catch (error) {
      console.error('Error saving memory:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(memory.title);
    setEditStory(memory.story);
    setEditLocation(memory.location || null);
    setEditImageryType(memory.imageType || 'photo');
    setEditImage(null);
    setEditImagePreview(memory.imageData || null);
    setShowDeleteConfirm(false);
    onCancelEdit();
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setSaving(true);
    try {
      await onDelete(memory.id);
    } catch (error) {
      console.error('Error deleting memory:', error);
      alert('Failed to delete memory. Please try again.');
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isEditing) {
    return (
      <>
        {/* LEFT physical page - content (editable) */}
        <div className="journal-page paper-texture min-h-full p-5 md:p-8 flex flex-col border-r border-opacity-20 relative"
             style={{
               borderColor: 'var(--warm-brown)',
               boxShadow: '0 0 0 3px rgba(255, 165, 0, 0.3), 0 0 20px rgba(255, 165, 0, 0.2)',
               background: 'linear-gradient(135deg, rgba(255, 248, 220, 0.8), rgba(255, 245, 238, 0.9))'
             }}>
          {/* Visual editing indicator */}
          <div className="absolute top-1 left-1 right-1 bottom-1 border-2 border-dashed rounded-lg pointer-events-none animate-pulse"
               style={{ borderColor: 'var(--dusty-rose)' }} />

          {/* Page header with date */}
          <div className="mb-6 pb-4 border-b border-opacity-20 flex-shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--warm-brown)' }}>
            <div className="text-sm font-journal italic" style={{ color: 'var(--warm-brown)' }}>
              {formatDate(memory.createdAt)} • Editing
            </div>
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium"
                 style={{
                   background: 'var(--dusty-rose)',
                   color: 'white',
                   boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                 }}>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span>EDITING</span>
            </div>
          </div>

          {/* Edit form - constrained to available height */}
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Title input */}
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-2xl font-journal font-semibold leading-tight bg-transparent border-none outline-none w-full flex-shrink-0"
              style={{ color: 'var(--deep-brown)' }}
              placeholder="Memory title..."
            />

            {/* Imagery: photo or Street View */}
            <div className="flex-shrink-0">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setEditImageryType('photo')}
                  className="rounded-lg py-2 text-center text-sm font-medium transition-all duration-300"
                  style={{
                    border: `2px solid ${editImageryType === 'photo' ? 'var(--dusty-rose)' : 'var(--soft-beige)'}`,
                    background: editImageryType === 'photo' ? 'var(--warm-cream)' : 'transparent',
                    color: 'var(--deep-brown)',
                  }}
                >
                  📷 Photo
                </button>
                <button
                  type="button"
                  onClick={() => setEditImageryType('streetview')}
                  className="rounded-lg py-2 text-center text-sm font-medium transition-all duration-300"
                  style={{
                    border: `2px solid ${editImageryType === 'streetview' ? 'var(--dusty-rose)' : 'var(--soft-beige)'}`,
                    background: editImageryType === 'streetview' ? 'var(--warm-cream)' : 'transparent',
                    color: 'var(--deep-brown)',
                  }}
                >
                  🧭 Street View
                </button>
              </div>

              {editImageryType === 'photo' ? (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditImageChange}
                    className="vintage-input w-full text-sm"
                  />
                  {editImagePreview && (
                    <div className="relative mt-2">
                      <img
                        src={editImagePreview}
                        alt={editTitle}
                        className="w-full h-32 object-cover rounded-lg shadow-md"
                        style={{ filter: 'sepia(10%) saturate(90%)' }}
                      />
                      <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--dusty-rose)' }}></div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <StreetView lat={editLocation?.lat} lng={editLocation?.lng} height="8rem" />
              )}
            </div>

            {/* Story textarea - takes remaining space */}
            <textarea
              value={editStory}
              onChange={(e) => setEditStory(e.target.value)}
              className="flex-1 font-journal leading-relaxed text-base bg-transparent border-none outline-none resize-none w-full min-h-[10rem]"
              style={{ color: 'var(--ink-black)' }}
              placeholder="Tell your story..."
            />

            {/* Edit buttons - fixed within page content area */}
            <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-opacity-20 flex-shrink-0" style={{ borderColor: 'var(--warm-brown)' }}>
              <div className="flex space-x-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-warm px-4 py-2 rounded-full font-medium text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-full font-medium text-sm transition-all duration-300"
                  style={{
                    background: 'var(--paper-white)',
                    color: 'var(--warm-brown)',
                    border: '2px solid var(--soft-beige)'
                  }}
                >
                  Cancel
                </button>
              </div>

              {/* Delete button */}
              <button
                onClick={handleDelete}
                disabled={saving}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 disabled:opacity-50 ${
                  showDeleteConfirm
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'text-red-500 hover:bg-red-50 border border-red-200'
                }`}
              >
                {showDeleteConfirm ? 'Click again to delete' : '🗑️ Delete'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT physical page - map (editable), always on the right */}
        <div className="journal-page paper-texture min-h-full p-5 md:p-8 flex flex-col relative"
             style={{
               boxShadow: '0 0 0 3px rgba(255, 165, 0, 0.3), 0 0 20px rgba(255, 165, 0, 0.2)',
               background: 'linear-gradient(135deg, rgba(255, 248, 220, 0.8), rgba(255, 245, 238, 0.9))'
             }}>
          <div className="absolute top-1 left-1 right-1 bottom-1 border-2 border-dashed rounded-lg pointer-events-none animate-pulse"
               style={{ borderColor: 'var(--dusty-rose)' }} />
          <div className="mb-4 text-sm font-medium flex-shrink-0" style={{ color: 'var(--warm-brown)' }}>
            Pin this memory's location
          </div>
          <div className="flex-1 min-h-0 flex flex-col space-y-2">
            <div className="journal-map-box">
              <MemoryLocationMap
                location={editLocation}
                editable
                onLocationChange={setEditLocation}
                height="100%"
              />
            </div>
            <div className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--warm-brown)' }}>
              {editLocation?.name || 'No location set'}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* LEFT physical page - content */}
      <div className="journal-page paper-texture min-h-full p-5 md:p-8 border-r border-opacity-20 relative group hover:shadow-lg transition-all duration-300"
           style={{ borderColor: 'var(--warm-brown)' }}>
        {/* Edit button */}
        <button
          onClick={() => {
            console.log('Edit button clicked for memory:', {
              id: memory.id,
              title: memory.title
            });
            onEdit(memory.id);
          }}
          className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 opacity-60 hover:opacity-100 group-hover:opacity-90 hover:scale-105"
          style={{
            background: 'var(--soft-beige)',
            color: 'var(--warm-brown)',
            border: '1px solid var(--warm-brown)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          ✏️ Edit
        </button>

        {/* Page header with date */}
        <div className="mb-6 pb-4 pr-20 border-b border-opacity-20" style={{ borderColor: 'var(--warm-brown)' }}>
          <div className="text-sm font-journal italic" style={{ color: 'var(--warm-brown)' }}>
            {formatDate(memory.createdAt)}
          </div>
        </div>

        {/* Memory content */}
        <div className="space-y-6">
          <h3 className="text-2xl font-journal font-semibold leading-tight" style={{ color: 'var(--deep-brown)' }}>
            {memory.title}
          </h3>

          {memory.imageType === 'streetview' ? (
            <StreetView lat={memory.location?.lat} lng={memory.location?.lng} height="12rem" />
          ) : memory.imageData && (
            <div className="relative">
              <img
                src={memory.imageData}
                alt={memory.title}
                className="w-full h-48 object-cover rounded-lg shadow-md"
                style={{ filter: 'sepia(10%) saturate(90%)' }}
              />
              <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--dusty-rose)' }}></div>
              </div>
            </div>
          )}

          <div className="prose prose-sm">
            <p className="font-journal leading-relaxed text-base" style={{ color: 'var(--ink-black)' }}>
              {memory.story}
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT physical page - map, always on the right regardless of which memory/side this is */}
      <div className="journal-page paper-texture min-h-full p-5 md:p-8 relative flex flex-col">
        <div className="mb-6 pb-4 border-b border-opacity-20 flex-shrink-0" style={{ borderColor: 'var(--warm-brown)' }}>
          <div className="text-sm font-journal italic" style={{ color: 'var(--warm-brown)' }}>
            Where it happened
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col space-y-2">
          <div className="journal-map-box">
            <MemoryLocationMap location={memory.location} editable={false} height="100%" />
          </div>
          <div className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--warm-brown)' }}>
            {memory.location?.name || 'Somewhere special'}
          </div>
        </div>
      </div>
    </>
  );
};


// Navigation Footer Component
const NavigationFooter = ({ currentPage, totalPages, onPrevPage, onNextPage, onPageSelect, showKeyboardHint = true }) => (
  <div className="paper-texture border-t border-opacity-20 px-4 md:px-8 py-4 md:py-5 flex justify-between items-center gap-3 flex-shrink-0 bg-opacity-95" style={{ borderColor: 'var(--warm-brown)', backgroundColor: 'var(--paper-white)' }}>
    <div className="flex items-center space-x-4">
      <button
        onClick={onPrevPage}
        disabled={currentPage === 0}
        className={`flex items-center space-x-2 px-5 py-3 rounded-full font-medium transition-all duration-300 ${
          currentPage === 0 
            ? 'opacity-30 cursor-not-allowed' 
            : 'hover:bg-gradient-to-r hover:from-orange-100 hover:to-yellow-100 hover:shadow-md'
        }`}
        style={{ color: 'var(--warm-brown)' }}
      >
        <span className="text-lg">←</span>
        <span>Previous</span>
      </button>
      
      {showKeyboardHint && (
        <div className="keyboard-hint hidden lg:block text-sm font-medium px-3 py-2 rounded-full bg-gradient-to-r from-orange-50 to-yellow-50" style={{ color: 'var(--warm-brown)' }}>
          Use arrow keys or A/D to flip pages
        </div>
      )}
    </div>

    <div className="flex flex-wrap justify-center gap-3 min-w-0">
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          onClick={() => onPageSelect(i)}
          className={`page-dot w-4 h-4 rounded-full transition-all duration-300 ${
            i === currentPage 
              ? 'bg-gradient-to-r from-orange-300 to-yellow-300 shadow-md' 
              : 'bg-gradient-to-r from-orange-100 to-yellow-100 hover:from-orange-200 hover:to-yellow-200'
          }`}
        />
      ))}
    </div>

    <button
      onClick={onNextPage}
      disabled={currentPage >= totalPages - 1}
      className={`flex items-center space-x-2 px-5 py-3 rounded-full font-medium transition-all duration-300 ${
        currentPage >= totalPages - 1 
          ? 'opacity-30 cursor-not-allowed' 
          : 'hover:bg-gradient-to-r hover:from-orange-100 hover:to-yellow-100 hover:shadow-md'
      }`}
      style={{ color: 'var(--warm-brown)' }}
    >
      <span>Next</span>
      <span className="text-lg">→</span>
    </button>
  </div>
);

const Journal = () => {
  const [user] = useAuthState(auth);
  const [view, setView] = useState('list'); // 'list' or 'create'
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [editingMemoryId, setEditingMemoryId] = useState(null);

  // Swipe gesture handlers
  const swipeHandlers = useSwipeGesture(
    () => nextPage(), // Swipe left = next page
    () => prevPage()  // Swipe right = previous page
  );

  useEffect(() => {
    if (user) {
      loadMemories();
    }
  }, [user]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Never hijack typing (editing a memory) or browser shortcuts like Cmd/Ctrl+A
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Only handle navigation if we're in list view and have memories
      if (view !== 'list' || memories.length === 0) return;
      
      // Prevent default behavior for arrow keys to avoid page scrolling
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }
      
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setCurrentPage(prev => prev > 0 ? prev - 1 : prev);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        const totalPages = memories.length;
        setCurrentPage(prev => prev < totalPages - 1 ? prev + 1 : prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [view, memories.length]); // Removed currentPage dependency

  // Clear editing state when navigating between pages to prevent stale edit state
  useEffect(() => {
    if (editingMemoryId) {
      console.log('Page changed while editing memory ID:', editingMemoryId, 'Clearing edit state');
      setEditingMemoryId(null);
    }
  }, [currentPage]); // Only depend on currentPage, not editingMemoryId to avoid infinite loops

  // Additional safety check: Clear edit state if the memory being edited is no longer on current page
  useEffect(() => {
    if (editingMemoryId && memories.length > 0) {
      const currentMemory = memories[currentPage];
      const isEditingMemoryOnCurrentPage = currentMemory && currentMemory.id === editingMemoryId;
      
      if (!isEditingMemoryOnCurrentPage) {
        console.log('Editing memory not found on current page, clearing edit state:', {
          editingMemoryId,
          currentPage,
          currentMemoryId: currentMemory?.id
        });
        setEditingMemoryId(null);
      }
    }
  }, [editingMemoryId, memories, currentPage]);

  const loadMemories = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'memories'), 
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const memoriesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMemories(memoriesData);
    } catch (error) {
      console.error('Error loading memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextPage = () => {
    if (currentPage < memories.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleEditMemory = (memoryId) => {
    // Console logging to track which memory ID is being edited
    console.log('handleEditMemory called with memoryId:', memoryId);
    
    // Calculate current page memory for validation
    const currentPageMemory = memories[currentPage];
    
    console.log('Current memory on page:', {
      memory: currentPageMemory?.id || 'none',
      currentPage: currentPage,
      memoryTitle: currentPageMemory?.title || 'none'
    });
    
    // Validation to ensure the correct memory is being edited
    if (!memoryId) {
      console.error('handleEditMemory: No memory ID provided');
      return;
    }
    
    // Defensive check to prevent editing wrong memory
    const memoryExists = memories.find(memory => memory.id === memoryId);
    if (!memoryExists) {
      console.error('handleEditMemory: Memory with ID', memoryId, 'not found in memories array');
      return;
    }
    
    console.log('handleEditMemory: Found memory to edit:', {
      id: memoryExists.id,
      title: memoryExists.title
    });
    
    // Additional validation to ensure the memory is on the current page
    const isOnCurrentPage = currentPageMemory && currentPageMemory.id === memoryId;
    
    if (!isOnCurrentPage) {
      console.error('handleEditMemory: CRITICAL - Memory', memoryId, 'is not on current page. Refusing to edit to prevent wrong memory editing.');
      console.log('Expected memory on current page:', {
        id: currentPageMemory?.id,
        title: currentPageMemory?.title
      });
      console.log('Attempted to edit memory:', {
        id: memoryExists.id,
        title: memoryExists.title
      });
      // Don't set editing state if memory is not on current page
      return;
    }
    
    // Clear any existing edit state first to prevent conflicts
    if (editingMemoryId && editingMemoryId !== memoryId) {
      console.log('handleEditMemory: Clearing previous edit state for memory:', editingMemoryId);
    }
    
    console.log('handleEditMemory: Setting editingMemoryId to:', memoryId, 'for memory titled:', memoryExists.title);
    setEditingMemoryId(memoryId);
  };

  const handleSaveMemory = async (memoryId, updates) => {
    console.log('handleSaveMemory: Saving memory ID:', memoryId, 'with updates:', updates);
    
    // Validation to ensure we're saving the correct memory
    if (editingMemoryId !== memoryId) {
      console.error('handleSaveMemory: Mismatch between editingMemoryId and memoryId being saved', {
        editingMemoryId,
        memoryId
      });
      throw new Error('Memory ID mismatch during save operation');
    }
    
    try {
      const memoryRef = doc(db, 'memories', memoryId);
      await updateDoc(memoryRef, {
        ...updates,
        updatedAt: new Date()
      });
      
      // Update local state
      setMemories(prevMemories => 
        prevMemories.map(memory => 
          memory.id === memoryId 
            ? { ...memory, ...updates, updatedAt: new Date() }
            : memory
        )
      );
      
      console.log('handleSaveMemory: Successfully saved memory ID:', memoryId, 'Clearing edit state');
      
      // Ensure edit state is properly reset after successful save
      setEditingMemoryId(null);
    } catch (error) {
      console.error('Error updating memory:', error);
      // Don't clear edit state on error so user can retry
      throw error;
    }
  };

  const handleCancelEdit = () => {
    console.log('handleCancelEdit: Canceling edit for memory ID:', editingMemoryId);
    
    // Ensure edit state is properly reset
    if (editingMemoryId) {
      console.log('handleCancelEdit: Clearing edit state and resetting form data');
      setEditingMemoryId(null);
    } else {
      console.warn('handleCancelEdit: No memory was being edited');
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    console.log('handleDeleteMemory: Deleting memory ID:', memoryId);
    
    // Validation to ensure we're deleting the correct memory
    if (editingMemoryId !== memoryId) {
      console.error('handleDeleteMemory: Mismatch between editingMemoryId and memoryId being deleted', {
        editingMemoryId,
        memoryId
      });
      throw new Error('Memory ID mismatch during delete operation');
    }
    
    try {
      const memoryRef = doc(db, 'memories', memoryId);
      await deleteDoc(memoryRef);
      
      // Update local state - remove the deleted memory
      setMemories(prevMemories => 
        prevMemories.filter(memory => memory.id !== memoryId)
      );
      
      console.log('handleDeleteMemory: Successfully deleted memory ID:', memoryId, 'Clearing edit state');
      
      // Clear edit state after successful deletion
      setEditingMemoryId(null);
      
      // Adjust current page if necessary (if we deleted the memory on the last page)
      const newTotalPages = memories.length - 1;
      if (currentPage >= newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages - 1);
      }
    } catch (error) {
      console.error('Error deleting memory:', error);
      throw error;
    }
  };

  const handleLoadSampleData = async () => {
    if (!user) return;
    
    const confirmed = window.confirm(
      'This will replace all your current memories with sample family-friendly stories. Are you sure you want to continue?'
    );
    
    if (!confirmed) return;
    
    try {
      setLoading(true);
      const result = await replaceSampleMemories(user.uid);
      console.log('Sample data loaded:', result);
      
      // Reload memories to show the new sample data
      await loadMemories();
      
      // Reset to first page
      setCurrentPage(0);
      setEditingMemoryId(null);
      
      alert(`Successfully replaced ${result.deleted} memories with ${result.added} sample stories!`);
    } catch (error) {
      console.error('Error loading sample data:', error);
      alert('Failed to load sample data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
            You'll need to sign in first
          </h1>
          <p className="text-base" style={{ color: 'var(--warm-brown)' }}>
            This journal is just for you
          </p>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return <CreateMemory onBack={() => setView('list')} onSuccess={() => {
      setView('list');
      loadMemories();
    }} />;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="paper-texture cozy-shadow rounded-2xl p-6 sm:p-8 flex items-center space-x-4">
          <div className="animate-spin w-8 h-8 border-3 border-t-transparent rounded-full" style={{ borderColor: 'var(--dusty-rose)' }}></div>
          <div className="text-xl font-journal" style={{ color: 'var(--deep-brown)' }}>
            Finding your pages...
          </div>
        </div>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Journal Header */}
        <div className="paper-texture border-b border-opacity-20 px-4 sm:px-8 py-3 sm:py-4 gap-3 flex justify-between items-center flex-shrink-0" style={{ borderColor: 'var(--warm-brown)' }}>
          <div>
            <h1 className="text-2xl font-journal font-semibold" style={{ color: 'var(--deep-brown)' }}>
              Your journal
            </h1>
            <p className="text-sm" style={{ color: 'var(--warm-brown)' }}>
              Ready for your first story
            </p>
          </div>
          
          <button
            onClick={() => setView('create')}
            className="btn-warm px-4 sm:px-6 py-2 rounded-full font-medium whitespace-nowrap"
          >
            Write something
          </button>
        </div>

        {/* Empty Journal Pages */}
        <div className="side-by-side spiral-holes">
          {/* Left page - Empty journal */}
          <div className="paper-texture flex flex-col justify-center items-center p-6 md:p-12 border-r border-opacity-20" style={{ borderColor: 'var(--warm-brown)' }}>
            <div className="text-center">
              <h2 className="text-2xl md:text-3xl font-journal font-semibold mb-4" style={{ color: 'var(--deep-brown)' }}>
                These pages are waiting
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: 'var(--warm-brown)' }}>
                Every memory you write down becomes part of your story. Start with something simple - a place you went, a moment that mattered.
              </p>
            </div>
          </div>

          {/* Right page - Create invitation */}
          <div className="paper-texture flex flex-col justify-center items-center p-6 md:p-12">
            <div className="text-center">
              <h3 className="text-2xl font-journal font-semibold mb-6" style={{ color: 'var(--deep-brown)' }}>
                What's your first memory?
              </h3>
              <button
                onClick={() => setView('create')}
                className="btn-warm px-8 py-4 rounded-full font-medium text-lg transition-all duration-300"
              >
                Start writing
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Footer - Even for empty state (tablet / laptop only) */}
        <div className="regular-only">
          <NavigationFooter
            currentPage={0}
            totalPages={1}
            onPrevPage={() => {}}
            onNextPage={() => {}}
            onPageSelect={() => {}}
            showKeyboardHint={false}
          />
        </div>
      </div>
    );
  }

  const currentMemory = memories[currentPage];
  const totalPages = memories.length;

  return (
    <div className="h-full flex flex-col">
      {/* Journal Header */}
      <div className="paper-texture border-b border-opacity-20 px-4 sm:px-8 py-3 sm:py-4 gap-3 flex justify-between items-center flex-shrink-0" style={{ borderColor: 'var(--warm-brown)' }}>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-journal font-semibold" style={{ color: 'var(--deep-brown)' }}>
            Your journal
          </h1>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--warm-brown)' }}>
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'} • Page {currentPage + 1} of {totalPages}
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <button
            onClick={() => setView('create')}
            className="btn-warm px-4 sm:px-6 py-2 rounded-full font-medium text-sm sm:text-base whitespace-nowrap"
          >
            Add Memory
          </button>
        </div>
      </div>

      {/* Journal Pages - left physical page = content, right physical page = map, always */}
      <div 
        className={`side-by-side spiral-holes flex-1 ${editingMemoryId ? 'editing-mode' : ''}`}
        {...swipeHandlers}
      >
        {currentMemory ? (
          <MemorySpread 
            memory={currentMemory} 
            onEdit={handleEditMemory}
            onSave={handleSaveMemory}
            onCancelEdit={handleCancelEdit}
            onDelete={handleDeleteMemory}
            isEditing={editingMemoryId === currentMemory.id}
          />
        ) : (
          <>
            <div className="paper-texture h-full p-6 sm:p-8 border-r border-opacity-20 flex items-center justify-center" style={{ borderColor: 'var(--warm-brown)' }}>
              <div className="text-center opacity-30">
                <p className="font-journal" style={{ color: 'var(--warm-brown)' }}>Empty page</p>
              </div>
            </div>
            <div className="paper-texture h-full p-6 sm:p-8 flex items-center justify-center">
              <div className="text-center opacity-30">
                <p className="font-journal" style={{ color: 'var(--warm-brown)' }}>Empty page</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigation Footer - tablet / laptop */}
      <div className="regular-only">
        <NavigationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={prevPage}
          onNextPage={nextPage}
          onPageSelect={setCurrentPage}
          showKeyboardHint={true}
        />
      </div>

      {/* Mobile Navigation */}
      <MobileNavigation
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onPageSelect={setCurrentPage}
      />
    </div>
  );
};

export default Journal;