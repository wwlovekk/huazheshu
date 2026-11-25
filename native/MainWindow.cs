using System;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Huazheshu;

internal sealed class MainWindow : Form
{
    private const string Origin = "https://app.huazheshu.invalid";
    private const string StartPage = Origin + "/index.html";
    private readonly StateStore store;
    private readonly string uiPath;
    private readonly string profile;
    private readonly bool startHidden;
    private readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill };
    private readonly NotifyIcon tray;
    private readonly Timer timer = new Timer { Interval = 30000 };
    private readonly Toasts toasts = new Toasts();
    private bool initialized;
    private bool ready;
    private bool quitting;
    private string? pendingDate;

    public MainWindow(StateStore store, string uiPath, string profile, bool startHidden, string? date)
    {
        this.store = store;
        this.uiPath = uiPath;
        this.profile = profile;
        this.startHidden = startHidden;
        pendingDate = date;
        Text = Program.TestMode ? Program.AppName + " [测试]" : Program.AppName;
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var area = Screen.PrimaryScreen.WorkingArea;
        Size = new Size(Math.Min(1320, area.Width), Math.Min(920, area.Height));
        MinimumSize = new Size(960, 660);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(250, 249, 245);
        web.DefaultBackgroundColor = BackColor;
        Controls.Add(web);
        var menu = new ContextMenuStrip();
        menu.Items.Add("打开划着数", null, (_, _) => ShowWindow());
        menu.Items.Add("记一笔", null, (_, _) => ShowWindow("new"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出（停止提醒）", null, (_, _) => Quit());
        tray = new NotifyIcon { Icon = Icon, Text = Program.AppName, ContextMenuStrip = menu, Visible = true };
        tray.MouseClick += (_, args) => { if (args.Button == MouseButtons.Left) ShowWindow(); };
        timer.Tick += (_, _) => CheckRemindersSafely();
        Load += (_, _) =>
        {
            if (startHidden) BeginInvoke(new Action(Hide));
            _ = InitializeAsync();
            timer.Start();
            SystemEvents.PowerModeChanged += PowerChanged;
            SystemEvents.SessionSwitch += SessionChanged;
            CheckRemindersSafely();
            try { ApplyLoginSetting(StateStore.JsonObject(store.Read())["settings"]!.Value<bool>("startAtLogin")); }
            catch (Exception error) { LogError(error); }
        };
        FormClosing += (_, eventArgs) =>
        {
            if (!quitting && eventArgs.CloseReason == CloseReason.UserClosing)
            {
                eventArgs.Cancel = true;
                Hide();
            }
        };
    }

    private async System.Threading.Tasks.Task InitializeAsync()
    {
        try
        {
            var arguments = "--disk-cache-size=8388608 --disable-gpu-shader-disk-cache";
            var debugPort = Program.TestMode ? Environment.GetEnvironmentVariable("HUAZHESHU_CDP_PORT") : null;
            if (int.TryParse(debugPort, out var port) && port > 1024 && port <= 65535)
                arguments += " --remote-debugging-port=" + port;
            var environment = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions(arguments));
            await web.EnsureCoreWebView2Async(environment);
            var core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = Program.TestMode;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.SetVirtualHostNameToFolderMapping("app.huazheshu.invalid", uiPath, CoreWebView2HostResourceAccessKind.Deny);
            core.NavigationStarting += (_, args) => { if (args.Uri != StartPage) args.Cancel = true; };
            core.FrameNavigationStarting += (_, args) => args.Cancel = true;
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.PermissionRequested += (_, args) => args.State = CoreWebView2PermissionState.Deny;
            core.WebMessageReceived += OnMessage;
            initialized = true;
            core.Navigate(StartPage);
        }
        catch (Exception error)
        {
            LogError(error);
            if (!Program.TestMode)
            {
                var message = error is WebView2RuntimeNotFoundException
                    ? "需要 Microsoft Edge WebView2 Runtime。安装该 Windows 组件后即可使用。"
                    : error.Message;
                MessageBox.Show(this, message, "划着数暂时无法启动", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            Environment.ExitCode = 1;
            Quit();
        }
    }

    private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (quitting || args.Source != StartPage) return;
        int? requestId = null;
        try
        {
            var request = StateStore.JsonObject(args.WebMessageAsJson);
            requestId = request.Value<int?>("id");
            if (!requestId.HasValue) return;
            var method = request.Value<string>("method");
            var result = Dispatch(method, request["argument"]);
            Post(new JObject { ["id"] = requestId.Value, ["result"] = result ?? JValue.CreateNull() });
        }
        catch (Exception error)
        {
            if (requestId.HasValue)
                Post(new JObject { ["id"] = requestId.Value, ["error"] = error.Message });
        }
    }

    private JToken? Dispatch(string? method, JToken? argument)
    {
        switch (method)
        {
            case "state:get":
                if (!ready)
                {
                    ready = true;
                    // React registers its navigation listener in the same effect as the request.
                    if (pendingDate != null)
                    {
                        Navigate(pendingDate);
                        pendingDate = null;
                    }
                }
                return StateStore.JsonObject(store.Read());
            case "state:command":
                if (argument is not JObject) throw new ArgumentException("操作格式无效");
                var before = store.Read();
                var after = store.Command(before, argument);
                var state = StateStore.JsonObject(after);
                var login = state["settings"]!.Value<bool>("startAtLogin");
                if (login != StateStore.JsonObject(before)["settings"]!.Value<bool>("startAtLogin")) ApplyLoginSetting(login);
                store.Write(after);
                Broadcast(state);
                return state;
            case "backup:export":
                using (var save = new SaveFileDialog { Title = "导出划着数备份", FileName = $"划着数备份-{store.Today}.json", Filter = "划着数备份 (*.json)|*.json" })
                {
                    if (save.ShowDialog(this) != DialogResult.OK) return null;
                    store.Export(save.FileName);
                    return save.FileName;
                }
            case "backup:import":
                using (var open = new OpenFileDialog { Title = "选择划着数备份", Filter = "划着数备份 (*.json)|*.json" })
                {
                    if (open.ShowDialog(this) != DialogResult.OK || MessageBox.Show(this, "用备份中的记录替换当前记录？恢复前会自动保存当前数据。", "恢复备份", MessageBoxButtons.OKCancel, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.OK)
                        return new JObject { ["cancelled"] = true };
                    store.Restore(open.FileName);
                    var restored = StateStore.JsonObject(store.Read());
                    ApplyLoginSetting(restored["settings"]!.Value<bool>("startAtLogin"));
                    Broadcast(restored);
                    return new JObject { ["cancelled"] = false, ["path"] = open.FileName };
                }
            case "data:open":
                Process.Start(new ProcessStartInfo(store.DirectoryPath) { UseShellExecute = true });
                return null;
            case "notification:test":
                return toasts.Send("划着数提醒测试", "关闭主窗口后仍可接收托盘提醒。", store.Today);
            case "app:info":
                return new JObject { ["version"] = typeof(Program).Assembly.GetName().Version.ToString(3), ["dataPath"] = store.DirectoryPath, ["platform"] = "win32" };
            default:
                if (Program.TestMode) return TestCommand(method, argument);
                throw new ArgumentException("操作无效");
        }
    }

    private void CheckRemindersSafely()
    {
        if (quitting) return;
        try
        {
            var result = store.Reminders();
            var state = (JObject)result["state"]!;
            var notices = (JArray)result["notices"]!;
            store.Write(state.ToString(Formatting.None));
            foreach (var notice in notices)
            {
                var ids = notice["ids"]!.Values<string>().ToArray();
                if (!toasts.Send(notice.Value<string>("title")!, notice.Value<string>("body")!, notice.Value<string>("date")!, () => Queue(() => FailDeliveries(ids))))
                {
                    FailDeliveries(ids);
                }
            }
            if (notices.Count != 0) Broadcast(StateStore.JsonObject(store.Read()));
        }
        catch (Exception error) { LogError(error); }
    }

    private void FailDeliveries(string?[] ids)
    {
        var state = StateStore.JsonObject(store.Read());
        foreach (var delivery in state["deliveries"]!.Where(item => ids.Contains(item.Value<string>("id"))))
            delivery["failed"] = true;
        store.Write(state.ToString(Formatting.None));
        Broadcast(state);
    }

    private void Queue(Action action)
    {
        if (!quitting && IsHandleCreated) BeginInvoke(new Action(() => { if (!quitting) action(); }));
    }

    private void PowerChanged(object sender, PowerModeChangedEventArgs args) { if (args.Mode == PowerModes.Resume) Queue(CheckRemindersSafely); }
    private void SessionChanged(object sender, SessionSwitchEventArgs args) { if (args.Reason == SessionSwitchReason.SessionUnlock) Queue(CheckRemindersSafely); }
    private void Post(JObject message) { if (initialized && !quitting) web.CoreWebView2.PostWebMessageAsJson(message.ToString(Formatting.None)); }
    private void Broadcast(JObject state) { if (ready) Post(new JObject { ["event"] = "state", ["value"] = state }); }
    private void Navigate(string date) => Post(new JObject { ["event"] = "navigate", ["value"] = date });
    private void ShowWindow(string? date = null)
    {
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
        if (date == null) return;
        if (ready) Navigate(date); else pendingDate = date;
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == Program.ActivationMessage)
        {
            var payload = message.WParam.ToInt64();
            if (payload == -1) { Quit(); return; }
            var date = DateTime.TryParseExact(payload.ToString(CultureInfo.InvariantCulture), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
                ? Program.ParseDate(parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)) : null;
            ShowWindow(date);
            return;
        }
        base.WndProc(ref message);
    }

    private static void ApplyLoginSetting(bool on)
    {
        if (Program.TestMode) return;
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        if (on) key.SetValue(Program.AppId, $"\"{Application.ExecutablePath}\" --hidden");
        else key.DeleteValue(Program.AppId, false);
    }

    private JToken? TestCommand(string? method, JToken? argument)
    {
        switch (method)
        {
            case "test:size": ClientSize = new Size(argument!.Value<int>("width"), argument.Value<int>("height")); return null;
            case "test:zoom": web.ZoomFactor = argument!.Value<double>(); return null;
            case "test:hide": Close(); return null;
            case "test:visible": return Visible;
            case "test:reminders": CheckRemindersSafely(); return null;
            case "test:toast-history": return new JArray(toasts.History());
            case "test:backup-export": store.Export(argument!.Value<string>()!); return null;
            case "test:backup-restore": store.Restore(argument!.Value<string>()!); return null;
            case "test:quit": BeginInvoke(new Action(Quit)); return null;
            default: throw new ArgumentException("操作无效");
        }
    }

    private void LogError(Exception error)
    {
        try { File.AppendAllText(Path.Combine(store.DirectoryPath, "desktop-error.log"), $"{DateTimeOffset.Now:O} {error}\r\n"); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private void Quit() { quitting = true; Close(); }
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            quitting = true;
            SystemEvents.PowerModeChanged -= PowerChanged;
            SystemEvents.SessionSwitch -= SessionChanged;
            timer.Dispose();
            tray?.ContextMenuStrip?.Dispose();
            tray?.Dispose();
            toasts.Dispose();
        }
        base.Dispose(disposing);
    }
}
