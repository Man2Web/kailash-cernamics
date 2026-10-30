namespace KailashTallyAgent;

/// <summary>Minimal daily rolling file logger: logs/agent-yyyyMMdd.log, keeps the newest N files.</summary>
public sealed class RollingFileLoggerProvider : ILoggerProvider
{
    private readonly string _dir;
    private readonly int _retain;
    private readonly object _lock = new();

    public RollingFileLoggerProvider(string dir, int retain)
    {
        _dir = dir;
        _retain = Math.Max(1, retain);
        Directory.CreateDirectory(_dir);
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(this, categoryName);

    internal void Write(string line)
    {
        lock (_lock)
        {
            var file = Path.Combine(_dir, $"agent-{DateTime.Now:yyyyMMdd}.log");
            var isNew = !File.Exists(file);
            File.AppendAllText(file, line + Environment.NewLine);
            if (isNew) Prune();
        }
    }

    private void Prune()
    {
        foreach (var old in Directory.GetFiles(_dir, "agent-*.log").OrderByDescending(f => f).Skip(_retain))
        {
            try { File.Delete(old); } catch { /* in use */ }
        }
    }

    public void Dispose() { }

    private sealed class FileLogger(RollingFileLoggerProvider provider, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var shortCat = category[(category.LastIndexOf('.') + 1)..];
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{logLevel.ToString()[..4].ToUpperInvariant()}] {shortCat}: {formatter(state, exception)}";
            if (exception is not null) line += Environment.NewLine + exception;
            provider.Write(line);
        }
    }
}
