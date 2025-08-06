from flask import Blueprint, request, jsonify, send_file
from flask_cors import cross_origin
import yt_dlp
import os
import tempfile
import uuid
import threading
import time
from urllib.parse import urlparse

downloader_bp = Blueprint('downloader', __name__)

# Store download progress and status
download_status = {}

class ProgressHook:
    def __init__(self, download_id):
        self.download_id = download_id
    
    def __call__(self, d):
        if d['status'] == 'downloading':
            percent = d.get('_percent_str', '0%').strip()
            speed = d.get('_speed_str', 'N/A')
            download_status[self.download_id] = {
                'status': 'downloading',
                'progress': percent,
                'speed': speed,
                'filename': d.get('filename', '')
            }
        elif d['status'] == 'finished':
            download_status[self.download_id] = {
                'status': 'finished',
                'progress': '100%',
                'filename': d.get('filename', ''),
                'filepath': d.get('filename', '')
            }

@downloader_bp.route('/info', methods=['POST'])
@cross_origin()
def get_video_info():
    """Get video information without downloading"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        url = data.get('url')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Configure yt-dlp options for info extraction
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract relevant information
            video_info = {
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'uploader': info.get('uploader', 'Unknown'),
                'thumbnail': info.get('thumbnail', ''),
                'formats': []
            }
            
            # Extract available formats
            formats = info.get('formats', [])
            seen_qualities = set()
            
            for fmt in formats:
                if fmt.get('vcodec') != 'none':  # Video formats
                    quality = fmt.get('height', 0)
                    if quality and quality not in seen_qualities:
                        video_info['formats'].append({
                            'quality': f"{quality}p",
                            'format_id': fmt.get('format_id'),
                            'ext': fmt.get('ext', 'mp4'),
                            'filesize': fmt.get('filesize', 0)
                        })
                        seen_qualities.add(quality)
            
            # Add audio-only option
            video_info['formats'].append({
                'quality': 'Audio Only',
                'format_id': 'bestaudio',
                'ext': 'mp3',
                'filesize': 0
            })
            
            # Sort formats by quality
            video_info['formats'].sort(key=lambda x: int(x['quality'].replace('p', '')) if x['quality'] != 'Audio Only' else 0, reverse=True)
            
            return jsonify(video_info)
            
    except Exception as e:
        print(f"Error in get_video_info: {str(e)}")  # Add logging
        return jsonify({'error': f'Failed to get video info: {str(e)}'}), 500

@downloader_bp.route('/download', methods=['POST'])
@cross_origin()
def download_video():
    """Start video download"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        url = data.get('url')
        quality = data.get('quality', 'best')
        format_type = data.get('format', 'video')  # 'video' or 'audio'
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Generate unique download ID
        download_id = str(uuid.uuid4())
        
        # Create downloads directory
        downloads_dir = os.path.join(tempfile.gettempdir(), 'social_downloader')
        os.makedirs(downloads_dir, exist_ok=True)
        
        # Configure yt-dlp options
        if format_type == 'audio':
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': os.path.join(downloads_dir, f'{download_id}_%(title)s.%(ext)s'),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'progress_hooks': [ProgressHook(download_id)],
            }
        else:
            # Video download
            if quality == 'best':
                format_selector = 'best[height<=1080]'
            elif quality == '4K':
                format_selector = 'best[height<=2160]'
            elif quality == 'HD':
                format_selector = 'best[height<=720]'
            else:
                format_selector = 'best'
            
            ydl_opts = {
                'format': format_selector,
                'outtmpl': os.path.join(downloads_dir, f'{download_id}_%(title)s.%(ext)s'),
                'progress_hooks': [ProgressHook(download_id)],
            }
        
        # Initialize download status
        download_status[download_id] = {
            'status': 'starting',
            'progress': '0%',
            'speed': 'N/A',
            'filename': ''
        }
        
        # Start download in background thread
        def download_thread():
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as e:
                download_status[download_id] = {
                    'status': 'error',
                    'error': str(e)
                }
        
        thread = threading.Thread(target=download_thread)
        thread.start()
        
        return jsonify({
            'download_id': download_id,
            'status': 'started'
        })
        
    except Exception as e:
        print(f"Error in download_video: {str(e)}")  # Add logging
        return jsonify({'error': f'Failed to start download: {str(e)}'}), 500

@downloader_bp.route('/status/<download_id>', methods=['GET'])
@cross_origin()
def get_download_status(download_id):
    """Get download progress status"""
    status = download_status.get(download_id, {'status': 'not_found'})
    return jsonify(status)

@downloader_bp.route('/download-file/<download_id>', methods=['GET'])
@cross_origin()
def download_file(download_id):
    """Download the completed file"""
    try:
        status = download_status.get(download_id)
        if not status or status.get('status') != 'finished':
            return jsonify({'error': 'Download not finished or not found'}), 404
        
        filepath = status.get('filepath')
        if not filepath or not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        filename = os.path.basename(filepath)
        return send_file(filepath, as_attachment=True, download_name=filename)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@downloader_bp.route('/supported-sites', methods=['GET'])
@cross_origin()
def get_supported_sites():
    """Get list of supported platforms"""
    supported_sites = [
        {'name': 'YouTube', 'icon': 'youtube', 'domains': ['youtube.com', 'youtu.be']},
        {'name': 'TikTok', 'icon': 'tiktok', 'domains': ['tiktok.com']},
        {'name': 'Instagram', 'icon': 'instagram', 'domains': ['instagram.com']},
        {'name': 'Facebook', 'icon': 'facebook', 'domains': ['facebook.com', 'fb.watch']},
        {'name': 'Twitter/X', 'icon': 'twitter', 'domains': ['twitter.com', 'x.com']},
        {'name': 'Vimeo', 'icon': 'vimeo', 'domains': ['vimeo.com']},
        {'name': 'Dailymotion', 'icon': 'dailymotion', 'domains': ['dailymotion.com']},
        {'name': 'Reddit', 'icon': 'reddit', 'domains': ['reddit.com']},
        {'name': 'Twitch', 'icon': 'twitch', 'domains': ['twitch.tv']},
        {'name': 'LinkedIn', 'icon': 'linkedin', 'domains': ['linkedin.com']},
    ]
    
    return jsonify(supported_sites)

@downloader_bp.route('/detect-platform', methods=['POST'])
@cross_origin()
def detect_platform():
    """Detect platform from URL"""
    try:
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.lower()
        
        # Remove www. prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        
        platform_map = {
            'youtube.com': 'YouTube',
            'youtu.be': 'YouTube',
            'tiktok.com': 'TikTok',
            'instagram.com': 'Instagram',
            'facebook.com': 'Facebook',
            'fb.watch': 'Facebook',
            'twitter.com': 'Twitter/X',
            'x.com': 'Twitter/X',
            'vimeo.com': 'Vimeo',
            'dailymotion.com': 'Dailymotion',
            'reddit.com': 'Reddit',
            'twitch.tv': 'Twitch',
            'linkedin.com': 'LinkedIn'
        }
        
        platform = platform_map.get(domain, 'Unknown')
        
        return jsonify({
            'platform': platform,
            'domain': domain,
            'supported': platform != 'Unknown'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

