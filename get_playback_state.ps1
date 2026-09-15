[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null

try {
    $manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
    $sessions = $manager.GetSessions()

    foreach ($session in $sessions) {
        try {
            $props = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
            $info = $session.GetPlaybackInfo()
            
            $appId = $session.SourceAppUserModelId
            $status = $info.PlaybackStatus
            $title = $props.Title
            
            $output = $appId + "~~~" + $title + "~~~" + $status
            Write-Output $output
        } catch { }
    }
} catch {
    Write-Error $_
}
