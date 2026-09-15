using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Media.Control;

class Program
{
    static async Task Main(string[] args)
    {
        string command = args.Length > 0 ? args[0] : "get";
        string appKey = args.Length > 1 ? args[1].ToLower() : "";

        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            var sessions = manager.GetSessions();

            if (command == "get")
            {
                var result = new List<object>();

                foreach (var session in sessions)
                {
                    try
                    {
                        var props = await session.TryGetMediaPropertiesAsync();
                        var info = session.GetPlaybackInfo();
                        string appId = session.SourceAppUserModelId.ToLower();

                        result.Add(new
                        {
                            app = session.SourceAppUserModelId,
                            app_key = appId,
                            title = props.Title,
                            artist = props.Artist,
                            status = info?.PlaybackStatus.ToString() ?? "Unknown"
                        });
                    }
                    catch { }
                }

                Console.WriteLine(JsonSerializer.Serialize(new { sessions = result }));
            }
            else if (command == "toggle")
            {
                foreach (var session in sessions)
                {
                    string appId = session.SourceAppUserModelId.ToLower();
                    if (appId.Contains(appKey))
                    {
                        var info = session.GetPlaybackInfo();
                        if (info?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                            await session.TryPauseAsync();
                        else
                            await session.TryPlayAsync();

                        Console.WriteLine(JsonSerializer.Serialize(new { success = true }));
                        return;
                    }
                }
                Console.WriteLine(JsonSerializer.Serialize(new { success = false }));
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { error = ex.Message }));
            Environment.Exit(1);
        }
    }
}