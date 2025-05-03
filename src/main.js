// Main entry point for the application
// This script will automatically redirect to the main application page

// If we're on the root page, redirect to the main app
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  window.location.href = '/html/index.html';
}

// Export for Vite to bundle properly
export default {}; 