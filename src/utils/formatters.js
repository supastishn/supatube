// Helper function to format view counts (e.g., 1.2M, 10K)
export const formatViews = (views) => {
  if (isNaN(views) || views < 0) return '0';
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (views >= 1000) {
    // Show one decimal place only if views are between 1000 and 9999
    return (views / 1000).toFixed(views < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  }
  return views.toString();
};

// Optional: You could also move formatDuration and formatTimeAgo here later
// export const formatDuration = (seconds) => { ... };
// export const formatTimeAgo = (dateString) => { ... };
