using KailashTallyAgent;

// Kailash Ceramics Tally sync agent. Runs as a Windows Service on the Tally PC, always initiating
// outbound HTTPS to the ERP and talking to TallyPrime on localhost:9000 (docs/specs/tally.md).
//
//   KailashTallyAgent.exe            run (console, or as a service when started by the SCM)
//   KailashTallyAgent.exe --status   print config + connectivity check and exit
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o => o.ServiceName = "KailashTallyAgent");
builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection("Agent"));

var opts = builder.Configuration.GetSection("Agent").Get<AgentOptions>() ?? new AgentOptions();
var logDir = Path.IsPathRooted(opts.LogDirectory) ? opts.LogDirectory : Path.Combine(AppContext.BaseDirectory, opts.LogDirectory);
builder.Logging.AddProvider(new RollingFileLoggerProvider(logDir, opts.LogRetainFiles));

builder.Services.AddHttpClient();
builder.Services.AddSingleton<ErpClient>();
builder.Services.AddSingleton<TallyClient>();
builder.Services.AddSingleton<AgentState>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();

if (args.Contains("--status"))
{
    var erp = host.Services.GetRequiredService<ErpClient>();
    var tally = host.Services.GetRequiredService<TallyClient>();
    Console.WriteLine($"ERP URL:   {opts.ErpUrl}");
    Console.WriteLine($"Tally URL: {opts.TallyUrl}  company: {opts.CompanyName}");
    var running = await tally.IsRunningAsync(CancellationToken.None);
    Console.WriteLine($"Tally reachable: {running}");
    try
    {
        var hb = await erp.HeartbeatAsync(running, opts.CompanyName, await tally.VersionAsync(CancellationToken.None), CancellationToken.None);
        Console.WriteLine($"ERP heartbeat OK (last AlterID {hb})");
    }
    catch (Exception e)
    {
        Console.WriteLine($"ERP heartbeat FAILED: {e.Message}");
        return 1;
    }
    return 0;
}

await host.RunAsync();
return 0;
