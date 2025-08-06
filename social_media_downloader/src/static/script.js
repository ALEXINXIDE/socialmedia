// Global variables
let currentDownloadId = null;
let progressInterval = null;

// DOM elements
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const downloadBtn = document.getElementById('downloadBtn');
const qualitySelect = document.getElementById('qualitySelect');
const formatSelect = document.getElementById('formatSelect');
const progressSection = document.getElementById('progressSection');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const videoInfoSection = document.getElementById('videoInfoSection');
const platformIcons = document.querySelectorAll('.platform-icon');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadSupportedSites();
});

// Setup event listeners
function setupEventListeners() {
    // Paste button functionality
    pasteBtn.addEventListener('click', async function() {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text;
            detectPlatform(text);
        } catch (err) {
            console.error('Failed to read clipboard:', err);
            showError('Failed to access clipboard. Please paste manually.');
        }
    });

    // URL input change detection
    urlInput.addEventListener('input', function() {
        const url = this.value.trim();
        if (url) {
            detectPlatform(url);
        } else {
            clearPlatformSelection();
        }
        hideAllSections();
    });

    // Download button
    downloadBtn.addEventListener('click', function() {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please enter a video URL');
            return;
        }
        startDownload(url);
    });

    // Format selector change
    formatSelect.addEventListener('change', function() {
        const format = this.value;
        updateQualityOptions(format);
    });

    // Platform icon clicks
    platformIcons.forEach(icon => {
        icon.addEventListener('click', function() {
            const platform = this.dataset.platform;
            selectPlatform(platform);
        });
    });

    // Download file button (will be set up when needed)
    document.getElementById('downloadFileBtn').addEventListener('click', function() {
        if (currentDownloadId) {
            downloadFile(currentDownloadId);
        }
    });
}

// Load supported sites from API
async function loadSupportedSites() {
    try {
        const response = await fetch('/api/supported-sites');
        const sites = await response.json();
        console.log('Supported sites loaded:', sites);
    } catch (error) {
        console.error('Failed to load supported sites:', error);
    }
}

// Detect platform from URL
async function detectPlatform(url) {
    try {
        const response = await fetch('/api/detect-platform', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        });

        const result = await response.json();
        
        if (result.supported) {
            selectPlatformByName(result.platform);
            // Optionally get video info
            getVideoInfo(url);
        } else {
            clearPlatformSelection();
            showError(`Platform "${result.platform}" is not supported`);
        }
    } catch (error) {
        console.error('Platform detection failed:', error);
        clearPlatformSelection();
    }
}

// Get video information
async function getVideoInfo(url) {
    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        });

        if (response.ok) {
            const info = await response.json();
            displayVideoInfo(info);
        }
    } catch (error) {
        console.error('Failed to get video info:', error);
        // Don't show error for info failure, it's optional
    }
}

// Display video information
function displayVideoInfo(info) {
    const thumbnail = document.getElementById('videoThumbnail');
    const title = document.getElementById('videoTitle');
    const uploader = document.getElementById('videoUploader');
    const duration = document.getElementById('videoDuration');

    if (info.thumbnail) {
        thumbnail.src = info.thumbnail;
        thumbnail.style.display = 'block';
    } else {
        thumbnail.style.display = 'none';
    }

    title.textContent = info.title || 'Unknown Title';
    uploader.textContent = `By: ${info.uploader || 'Unknown'}`;
    
    if (info.duration) {
        const minutes = Math.floor(info.duration / 60);
        const seconds = info.duration % 60;
        duration.textContent = `Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
        duration.textContent = 'Duration: Unknown';
    }

    videoInfoSection.classList.remove('hidden');
}

// Select platform by name
function selectPlatformByName(platformName) {
    clearPlatformSelection();
    
    const platformMap = {
        'YouTube': 'youtube',
        'TikTok': 'tiktok',
        'Instagram': 'instagram',
        'Facebook': 'facebook',
        'Twitter/X': 'twitter',
        'Vimeo': 'vimeo'
    };

    const platformKey = platformMap[platformName];
    if (platformKey) {
        selectPlatform(platformKey);
    }
}

// Select platform icon
function selectPlatform(platform) {
    clearPlatformSelection();
    const icon = document.querySelector(`[data-platform="${platform}"]`);
    if (icon) {
        icon.classList.add('active');
    }
}

// Clear platform selection
function clearPlatformSelection() {
    platformIcons.forEach(icon => {
        icon.classList.remove('active');
    });
}

// Update quality options based on format
function updateQualityOptions(format) {
    const qualitySelect = document.getElementById('qualitySelect');
    
    if (format === 'audio') {
        qualitySelect.innerHTML = `
            <option value="audio">Audio Only (MP3)</option>
        `;
    } else {
        qualitySelect.innerHTML = `
            <option value="best">Best Quality</option>
            <option value="HD">HD (720p)</option>
            <option value="4K">4K (2160p)</option>
        `;
    }
}

// Start download process
async function startDownload(url) {
    const quality = qualitySelect.value;
    const format = formatSelect.value;

    hideAllSections();
    showProgress();
    setDownloadButtonState(true);

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                quality: quality,
                format: format
            })
        });

        const result = await response.json();

        if (response.ok) {
            currentDownloadId = result.download_id;
            startProgressMonitoring(currentDownloadId);
        } else {
            throw new Error(result.error || 'Download failed');
        }
    } catch (error) {
        console.error('Download failed:', error);
        showError(error.message);
        setDownloadButtonState(false);
    }
}

// Start monitoring download progress
function startProgressMonitoring(downloadId) {
    progressInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/status/${downloadId}`);
            const status = await response.json();

            updateProgress(status);

            if (status.status === 'finished') {
                clearInterval(progressInterval);
                showResult();
                setDownloadButtonState(false);
            } else if (status.status === 'error') {
                clearInterval(progressInterval);
                showError(status.error || 'Download failed');
                setDownloadButtonState(false);
            }
        } catch (error) {
            console.error('Failed to get download status:', error);
            clearInterval(progressInterval);
            showError('Failed to get download status');
            setDownloadButtonState(false);
        }
    }, 1000);
}

// Update progress display
function updateProgress(status) {
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    const downloadSpeed = document.getElementById('downloadSpeed');

    switch (status.status) {
        case 'starting':
            progressText.textContent = 'Preparing download...';
            progressPercent.textContent = '0%';
            progressFill.style.width = '0%';
            downloadSpeed.textContent = 'Speed: N/A';
            break;
        case 'downloading':
            progressText.textContent = 'Downloading...';
            progressPercent.textContent = status.progress || '0%';
            const percent = parseInt(status.progress) || 0;
            progressFill.style.width = `${percent}%`;
            downloadSpeed.textContent = `Speed: ${status.speed || 'N/A'}`;
            break;
        case 'finished':
            progressText.textContent = 'Download completed!';
            progressPercent.textContent = '100%';
            progressFill.style.width = '100%';
            downloadSpeed.textContent = 'Speed: Complete';
            break;
    }
}

// Download the completed file
async function downloadFile(downloadId) {
    try {
        const response = await fetch(`/api/download-file/${downloadId}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Get filename from Content-Disposition header or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'download';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Failed to download file');
        }
    } catch (error) {
        console.error('File download failed:', error);
        showError(error.message);
    }
}

// UI state management functions
function hideAllSections() {
    progressSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    errorSection.classList.add('hidden');
}

function showProgress() {
    hideAllSections();
    progressSection.classList.remove('hidden');
}

function showResult() {
    hideAllSections();
    resultSection.classList.remove('hidden');
}

function showError(message) {
    hideAllSections();
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorSection.classList.remove('hidden');
}

function setDownloadButtonState(disabled) {
    downloadBtn.disabled = disabled;
    if (disabled) {
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
    }
}

// Utility functions
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// Handle keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + V to paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement !== urlInput) {
        e.preventDefault();
        pasteBtn.click();
    }
    
    // Enter to download
    if (e.key === 'Enter' && document.activeElement === urlInput) {
        e.preventDefault();
        downloadBtn.click();
    }
});

// Handle paste events
urlInput.addEventListener('paste', function(e) {
    setTimeout(() => {
        const url = this.value.trim();
        if (url) {
            detectPlatform(url);
        }
    }, 100);
});

