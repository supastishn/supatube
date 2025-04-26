import { v4 as uuidv4 } from 'uuid';

// Constants for localStorage
export const PENDING_COMMENT_KEY = 'pendingComments';
export const PENDING_COMMENT_TIMEOUT_MS = 30 * 1000; // 30 seconds

/**
 * Retrieve pending comments from localStorage
 */
export const getPendingCommentsFromStorage = () => {
    try {
        const stored = localStorage.getItem(PENDING_COMMENT_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Error reading pending comments from localStorage:", e);
        return [];
    }
};

/**
 * Save pending comments to localStorage
 */
export const savePendingCommentsToStorage = (pendingComments) => {
    try {
        localStorage.setItem(PENDING_COMMENT_KEY, JSON.stringify(pendingComments));
    } catch (e) {
        console.error("Error saving pending comments to localStorage:", e);
    }
};

/**
 * Create temporary comment object for optimistic updates
 */
export const createTempComment = (videoId, commentText, parentCommentId, currentUser) => {
    const temporaryClientId = `temp-${uuidv4()}`;
    
    return {
        commentId: temporaryClientId,
        userId: currentUser.$id,
        userName: currentUser.name || 'You',
        userAvatarUrl: currentUser.profileImageUrl,
        commentText,
        timestamp: new Date().toISOString(),
        replies: [],
        pending: true,
        temporaryClientId,
        parentCommentId,
        videoId,
        createdAt: Date.now()
    };
};

/**
 * Add temporary comment to localStorage and update state
 */
export const addPendingComment = (tempComment) => {
    const currentPending = getPendingCommentsFromStorage();
    savePendingCommentsToStorage([...currentPending, tempComment]);
};

/**
 * Remove expired pending comments from localStorage
 */
export const cleanupExpiredComments = () => {
    const currentPending = getPendingCommentsFromStorage();
    const now = Date.now();
    const stillValidPending = currentPending.filter(p => 
        now - p.createdAt < PENDING_COMMENT_TIMEOUT_MS
    );
    
    if (stillValidPending.length < currentPending.length) {
        savePendingCommentsToStorage(stillValidPending);
        return {
            expired: currentPending.filter(p => 
                now - p.createdAt >= PENDING_COMMENT_TIMEOUT_MS
            ),
            valid: stillValidPending
        };
    }
    
    return { expired: [], valid: currentPending };
};
