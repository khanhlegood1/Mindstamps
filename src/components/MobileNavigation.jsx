const MobileNavigation = ({ currentPage, totalPages, onPrevPage, onNextPage, onPageSelect, position = 'bottom' }) => {
  // Shown/hidden purely by CSS (.mobile-nav / .mobile-nav-top) so it
  // always matches the layout breakpoint. The bottom bar stays pinned
  // while scrolling a page; the top one sits in normal flow right
  // under the header, for a quick way to jump pages without scrolling
  // all the way down.
  return (
    <div className={position === 'top' ? 'mobile-nav-top' : 'mobile-nav'}>
      <div className="flex items-center justify-between">
        {/* Previous Button */}
        <button
          onClick={onPrevPage}
          disabled={currentPage === 0}
          className={`flex items-center space-x-1 px-3 py-2 min-h-[44px] rounded-full font-medium transition-all duration-300 ${
            currentPage === 0 
              ? 'opacity-30 cursor-not-allowed' 
              : 'btn-warm'
          }`}
        >
          <span>←</span>
          <span>Prev</span>
        </button>

        {/* Page Indicators -- capped at 4 (rather than 5) so Prev/Next
            never get pushed off a narrow phone screen */}
        <div className="flex space-x-2">
          {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => {
            // Slide a 4-wide window so the current page stays visible,
            // clamped so it never runs past the first/last page.
            const windowStart = Math.max(0, Math.min(currentPage - 1, totalPages - 4));
            const pageIndex = totalPages <= 4 ? i : windowStart + i;

            return (
              <button
                key={pageIndex}
                onClick={() => onPageSelect(pageIndex)}
                className={`w-9 h-9 rounded-full text-xs font-medium transition-all duration-300 ${
                  pageIndex === currentPage 
                    ? 'bg-gradient-to-r from-orange-300 to-yellow-300 text-white shadow-md' 
                    : 'bg-gradient-to-r from-orange-100 to-yellow-100 text-gray-700 hover:from-orange-200 hover:to-yellow-200'
                }`}
              >
                {pageIndex + 1}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          onClick={onNextPage}
          disabled={currentPage >= totalPages - 1}
          className={`flex items-center space-x-1 px-3 py-2 min-h-[44px] rounded-full font-medium transition-all duration-300 ${
            currentPage >= totalPages - 1 
              ? 'opacity-30 cursor-not-allowed' 
              : 'btn-warm'
          }`}
        >
          <span>Next</span>
          <span>→</span>
        </button>
      </div>

      {/* Swipe Hint (bottom bar only -- redundant right under the header) */}
      {position !== 'top' && (
        <div className="swipe-hint text-center mt-2">
          <p className="text-xs" style={{ color: 'var(--warm-brown)' }}>
            Swipe left/right to navigate pages
          </p>
        </div>
      )}
    </div>
  );
};

export default MobileNavigation;