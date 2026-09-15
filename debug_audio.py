from pycaw.pycaw import AudioUtilities

sessions = AudioUtilities.GetAllSessions()
for session in sessions:
    try:
        app = session.Process.name() if session.Process else 'Unknown'
        print(f"\n{app}:")
        print(f"  State: {session.State}")
        
        # Try channelAudioVolume
        try:
            ch_vol = session.channelAudioVolume
            methods = [m for m in dir(ch_vol) if not m.startswith('_')]
            print(f"  channelAudioVolume methods: {methods}")
        except Exception as e:
            print(f"  channelAudioVolume error: {e}")
        
        # Try to access each method on channelAudioVolume
        try:
            ch_vol = session.channelAudioVolume
            if hasattr(ch_vol, 'GetPeakValue'):
                print(f"    GetPeakValue exists!")
                peak = ch_vol.GetPeakValue()
                print(f"    Peak value: {peak}")
        except Exception as e:
            print(f"    GetPeakValue error: {e}")
            
    except Exception as e:
        print(f"Error processing session: {e}")
