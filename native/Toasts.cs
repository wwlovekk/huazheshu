using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

namespace Huazheshu;

internal sealed class Toasts : IDisposable
{
    private readonly HashSet<ToastNotification> active = new HashSet<ToastNotification>();

    public bool Send(string title, string body, string date, Action? failed = null)
    {
        try
        {
            var notifier = ToastNotificationManager.CreateToastNotifier(Program.AppId);
            if (notifier.Setting != NotificationSetting.Enabled) return false;
            var xml = new XmlDocument();
            xml.LoadXml(new XElement("toast", new XAttribute("activationType", "protocol"),
                new XAttribute("launch", "huazheshu://show/" + date),
                new XElement("visual", new XElement("binding", new XAttribute("template", "ToastGeneric"),
                    new XElement("text", title), new XElement("text", body)))).ToString(SaveOptions.DisableFormatting));
            var toast = new ToastNotification(xml) { Tag = Guid.NewGuid().ToString("N").Substring(0, 16) };
            toast.Activated += (_, _) => Forget(toast);
            toast.Dismissed += (_, _) => Forget(toast);
            toast.Failed += (_, _) => { Forget(toast); failed?.Invoke(); };
            lock (active) active.Add(toast);
            try { notifier.Show(toast); }
            catch { Forget(toast); throw; }
            return true;
        }
        catch (Exception) { return false; }
    }

    public IEnumerable<string> History() => ToastNotificationManager.History.GetHistory(Program.AppId)
        .Select(item => item.Content.GetElementsByTagName("text").FirstOrDefault()?.InnerText ?? "").ToArray();

    private void Forget(ToastNotification toast) { lock (active) active.Remove(toast); }
    public void Dispose() { lock (active) active.Clear(); }
}
