#!/usr/bin/env python3
"""
Query and control Windows media sessions using Windows Media Control API
"""

import json
import sys
import subprocess
import time

try:
    import psutil
    from pycaw.pycaw import AudioUtilities
    from comtypes import CoCreateInstance, GUID
    from comtypes.gen import MediaControl
except ImportError as e:
    try:
        import psutil
        from pycaw.pycaw import AudioUtilities
    except ImportError as e2:
        print(json.dumps({"error": str(e2), "sessions": []}))
        sys.exit(1)


def get_playback_state(app_key):
    """Get current playback state by sampling peak values over time"""
    try:
        sessions = AudioUtilities.GetAllSessions()
        
        for session in sessions:
            try:
                app_name = session.Process.name() if session.Process else None
                if not app_name:
                    continue
                
                app_lower = app_name.lower().replace('.exe', '')
                
                if app_lower == app_key or app_key in app_lower:
                    # Sample peak values over 200ms to detect activity
                    peaks = []
                    for i in range(4):
                        try:
                            meter = session.AudioMeterInformation
                            peak = meter.GetPeakValue() if meter else 0.0
                            peaks.append(peak)
                        except:
                            peaks.append(0.0)
                        time.sleep(0.05)  # 50ms between samples
                    
                    # Check if muted
                    try:
                        volume = session.SimpleAudioVolume
                        is_muted = volume.GetMute() if volume else False
                        level = volume.GetMasterVolume() if volume else 0.0
                    except Exception as vol_err:
                        is_muted = False
                        level = 0.0
                    
                    # Audio is playing if:
                    # 1. Peak values show variation (audio flowing)
                    # 2. OR any single peak > 0.001
                    # 3. AND not muted AND level > 0
                    max_peak = max(peaks) if peaks else 0.0
                    peak_variation = max(peaks) - min(peaks) if peaks else 0.0
                    
                    # Is playing if we see peak values changing or any peak above threshold
                    is_playing = ((max_peak > 0.001 or peak_variation > 0.0001) and not is_muted and level > 0.0)
                    
                    return {
                        "app_key": app_key,
                        "is_playing": is_playing,
                        "peak_value": float(max_peak),
                        "peak_variation": float(peak_variation),
                        "is_muted": int(is_muted),
                        "level": float(level),
                    }
            except Exception as e:
                pass
        
        return {
            "app_key": app_key,
            "is_playing": False,
            "peak_value": 0.0,
            "peak_variation": 0.0,
            "is_muted": 0,
            "level": 0.0,
        }
        
    except Exception as e:
        return {
            "app_key": app_key,
            "is_playing": False,
            "peak_value": 0.0,
            "peak_variation": 0.0,
            "is_muted": 0,
            "level": 0.0,
        }


def get_media_sessions():
    """Get all active media sessions - state detection done via change tracking"""
    try:
        result = []
        seen_apps = set()
        
        media_apps = {
            "spotify": "Spotify",
            "chrome": "Chrome",
            "msedge": "Microsoft Edge",
            "firefox": "Firefox",
            "vlc": "VLC",
            "mpv": "MPV",
        }
        
        # Use pycaw to get available audio sessions
        sessions = AudioUtilities.GetAllSessions()
        
        for session in sessions:
            try:
                app_name = session.Process.name() if session.Process else None
                if not app_name:
                    continue
                
                app_lower = app_name.lower().replace('.exe', '')
                
                if any(media_app in app_lower for media_app in media_apps.keys()):
                    if app_lower in seen_apps:
                        continue
                    
                    seen_apps.add(app_lower)
                    
                    # Note: We can't reliably detect pause state with available APIs
                    # So we'll just report the session exists and let sync handle it
                    session_data = {
                        "app": media_apps.get(app_lower, app_name.replace('.exe', '')),
                        "app_key": app_lower,
                        "title": "Media Session",
                        "artist": "",
                        "album": "",
                        "status": "Active",  # We'll track state via sync logic instead
                        "is_active": True,
                        "process_id": session.Process.pid if session.Process else None,
                    }
                    result.append(session_data)
            except Exception as e:
                pass
        
        return result
        
    except Exception as e:
        print(f"Error in get_media_sessions: {e}", file=sys.stderr)
        return []


def toggle_playback(app_key):
    """Toggle playback for a specific app using media keys"""
    try:
        import ctypes
        import time
        
        # Virtual key codes
        VK_MEDIA_PLAY_PAUSE = 0xB3
        
        user32 = ctypes.windll.user32
        
        # Send media play/pause key globally
        # Press the key
        user32.keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0)
        time.sleep(0.1)
        # Release the key
        user32.keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 2, 0)
        
        return True
    except Exception as e:
        print(f"Error in toggle_playback: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "get":
            sessions = get_media_sessions()
            print(json.dumps({"sessions": sessions}))
        elif command == "toggle" and len(sys.argv) > 2:
            app_key = sys.argv[2]
            success = toggle_playback(app_key)
            print(json.dumps({"success": success}))
        elif command == "state" and len(sys.argv) > 2:
            app_key = sys.argv[2]
            state = get_playback_state(app_key)
            print(json.dumps(state))
    else:
        sessions = get_media_sessions()
        print(json.dumps({"sessions": sessions}))
