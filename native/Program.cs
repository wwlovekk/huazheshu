using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Huazheshu;

internal static class Program
{
    internal const string AppId = "local.huazheshu.desktop";
    internal const string AppName = "划着数";
    internal static readonly bool TestMode = Environment.GetEnvironmentVariable("HUAZHESHU_TEST") == "1";
    internal static readonly uint ActivationMessage = RegisterWindowMessage("Huazheshu.Activate.2B8535D7");

    [STAThread]
    public static void Main(string[] args)
    {
        var quit = args.Contains("--quit");
        var date = args.Select(ParseActivation).FirstOrDefault(value => value != null);
        using var mutex = new Mutex(true, @"Local\Huazheshu.App.2B8535D7" + (TestMode ? ".Test." + Guid.NewGuid() : ""), out var first);
        if (!first)
        {
            // The first process may still be creating its window during startup.
            for (var attempt = 0; attempt < 40; attempt++)
            {
                var handle = FindWindow(null, AppName);
                if (handle != IntPtr.Zero)
                {
                    PostMessage(handle, ActivationMessage, new IntPtr(quit ? -1 : date == null ? 0 : int.Parse(date.Replace("-", ""), CultureInfo.InvariantCulture)), IntPtr.Zero);
                    if (quit)
                    {
                        try
                        {
                            if (mutex.WaitOne(TimeSpan.FromSeconds(10))) mutex.ReleaseMutex();
                            else Environment.ExitCode = 1;
                        }
                        catch (AbandonedMutexException) { mutex.ReleaseMutex(); }
                    }
                    return;
                }
                Thread.Sleep(50);
            }
            Environment.ExitCode = 1;
            return;
        }
        if (quit) return;

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        SetCurrentProcessExplicitAppUserModelID(AppId);
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var data = TestMode ? Environment.GetEnvironmentVariable("HUAZHESHU_DATA_DIR") : null;
        data ??= Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), AppName);
        var profile = TestMode ? Path.Combine(data, "WebView2") : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Huazheshu", "WebView2");
        try
        {
            using var store = new StateStore(data, Path.Combine(root, "engine.js"));
            using var window = new MainWindow(store, Path.Combine(root, "ui"), profile, args.Contains("--hidden") && date == null, date);
            Application.Run(window);
        }
        catch (Exception error)
        {
            Environment.ExitCode = 1;
            if (TestMode) File.WriteAllText(Path.Combine(data, "startup-error.txt"), error.ToString());
            else MessageBox.Show(error.Message, "划着数暂时无法启动", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { mutex.ReleaseMutex(); }
    }

    private static string? ParseActivation(string argument)
    {
        if (!Uri.TryCreate(argument, UriKind.Absolute, out var uri) || uri.Scheme != "huazheshu" || uri.Host != "show") return null;
        return ParseDate(uri.AbsolutePath.Trim('/'));
    }

    internal static string? ParseDate(string value) => DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) && date.Year >= 1900 && date.Year <= 2100 ? value : null;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string? className, string title);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
}
