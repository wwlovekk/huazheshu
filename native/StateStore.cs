using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Jint;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Huazheshu;

internal sealed class StateStore : IDisposable
{
    private readonly Engine engine = new Engine();
    private readonly string backups;
    private readonly Sqlite database;
    public string DirectoryPath { get; }

    public StateStore(string directory, string enginePath)
    {
        DirectoryPath = directory;
        backups = Path.Combine(directory, "backups");
        Directory.CreateDirectory(backups);
        engine.Execute(File.ReadAllText(enginePath));
        engine.Execute("var {initialState,validateState,localDay,runCommand,runReminders,prepareRestore} = HuazheshuEngine;");
        database = new Sqlite(Path.Combine(directory, "huazheshu.sqlite"));
        try
        {
            database.Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
            if (int.Parse(database.Read("PRAGMA user_version") ?? "0") > 1)
                throw new InvalidOperationException("数据来自更新版本，请安装新版划着数。");
            database.Exec("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); PRAGMA user_version=1;");
            if (database.Read("SELECT data FROM app_state WHERE id=1") == null)
                Write(Invoke("initialState"));
            Invoke("validateState", Read());
            var path = Path.Combine(backups, $"daily-{Today}.json");
            if (!File.Exists(path))
            {
                Export(path);
                foreach (var old in Directory.GetFiles(backups, "daily-*.json")
                    .Where(file => Regex.IsMatch(Path.GetFileName(file), @"^daily-\d{4}-\d{2}-\d{2}\.json$"))
                    .OrderByDescending(file => file, StringComparer.Ordinal).Skip(7))
                    File.Delete(old);
            }
        }
        catch { database.Dispose(); throw; }
    }

    public string Today => Invoke("localDay");
    public string Read() => database.Read("SELECT data FROM app_state WHERE id=1")!;
    public void Write(string state) => database.Write("INSERT INTO app_state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", state);
    public string Command(string state, JToken command) => Invoke("runCommand", state, command.ToString(Formatting.None), Guid.NewGuid().ToString());
    public JObject Reminders() => JsonObject(Invoke("runReminders", Read()));
    public void Export(string path)
    {
        var backup = new JObject
        {
            ["format"] = "huazheshu-backup", ["version"] = 1,
            ["exportedAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            ["state"] = JsonObject(Read()),
        };
        File.WriteAllText(path, backup.ToString(Formatting.Indented));
    }
    public void Restore(string path)
    {
        var state = Invoke("prepareRestore", File.ReadAllText(path));
        Export(Path.Combine(backups, $"before-restore-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.json"));
        Write(state);
    }

    internal static JObject JsonObject(string json)
    {
        using var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None };
        return JObject.Load(reader);
    }

    private string Invoke(string name, params object[] arguments) => engine.Invoke(name, arguments).AsString();
    public void Dispose() => database.Dispose();
}

internal sealed class Sqlite : IDisposable
{
    private const string Library = "winsqlite3.dll";
    private IntPtr db;
    private const int Row = 100;
    private const int Done = 101;

    public Sqlite(string path)
    {
        var result = sqlite3_open16(path, out db);
        if (result != 0)
        {
            var error = Error(result);
            Dispose();
            throw error;
        }
        sqlite3_busy_timeout(db, 5000);
    }

    public void Exec(string sql)
    {
        var result = sqlite3_exec(db, sql, IntPtr.Zero, IntPtr.Zero, out var message);
        if (message != IntPtr.Zero) sqlite3_free(message);
        if (result != 0) throw Error(result);
    }

    public string? Read(string sql)
    {
        var statement = Prepare(sql);
        try
        {
            var result = sqlite3_step(statement);
            if (result == Done) return null;
            if (result != Row) throw Error(result);
            return Marshal.PtrToStringUni(sqlite3_column_text16(statement, 0));
        }
        finally { sqlite3_finalize(statement); }
    }

    public void Write(string sql, string value)
    {
        var statement = Prepare(sql);
        try
        {
            var result = sqlite3_bind_text16(statement, 1, value, checked(value.Length * 2), new IntPtr(-1));
            if (result != 0) throw Error(result);
            result = sqlite3_step(statement);
            if (result != Done) throw Error(result);
        }
        finally { sqlite3_finalize(statement); }
    }

    private IntPtr Prepare(string sql)
    {
        var result = sqlite3_prepare16_v2(db, sql, -1, out var statement, IntPtr.Zero);
        if (result != 0) throw Error(result);
        return statement;
    }

    private IOException Error(int result) => new IOException($"SQLite {result}: {Marshal.PtrToStringUni(sqlite3_errmsg16(db))}");

    public void Dispose()
    {
        if (db == IntPtr.Zero) return;
        sqlite3_close(db);
        db = IntPtr.Zero;
    }

    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int sqlite3_open16(string path, out IntPtr db);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_close(IntPtr db);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_busy_timeout(IntPtr db, int milliseconds);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_exec(IntPtr db, string sql, IntPtr callback, IntPtr context, out IntPtr error);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern void sqlite3_free(IntPtr pointer);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr sqlite3_errmsg16(IntPtr db);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int sqlite3_prepare16_v2(IntPtr db, string sql, int bytes, out IntPtr statement, IntPtr tail);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_finalize(IntPtr statement);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_step(IntPtr statement);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr sqlite3_column_text16(IntPtr statement, int column);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int sqlite3_bind_text16(IntPtr statement, int index, string value, int bytes, IntPtr destructor);
}
