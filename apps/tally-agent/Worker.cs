using Microsoft.Extensions.Options;

namespace KailashTallyAgent;

/// <summary>
/// Main loop (docs/specs/tally.md, "Agent behaviour"):
///   every 30 s  pull the ERP queue → POST each XML to Tally → parse → ack (masters come first);
///   every 60 s  heartbeat (is Tally running, company, version);
///   every 5 min export ledgers + receipts with AlterID &gt; last → /inbound;
///   every 15 min export ledger closing balances → /inbound BALANCE.
/// Errors are logged and retried by the ERP's backoff; nothing is dropped silently.
/// </summary>
public sealed class Worker : BackgroundService
{
    private readonly ILogger<Worker> _log;
    private readonly ErpClient _erp;
    private readonly TallyClient _tally;
    private readonly AgentState _state;
    private readonly AgentOptions _opts;
    private DateTime _lastHeartbeat = DateTime.MinValue;
    private DateTime _lastExport = DateTime.MinValue;
    private DateTime _lastBalances = DateTime.MinValue;
    private readonly Dictionary<string, int> _attempts = new();

    public Worker(ILogger<Worker> log, ErpClient erp, TallyClient tally, AgentState state, IOptions<AgentOptions> opts)
    {
        _log = log;
        _erp = erp;
        _tally = tally;
        _state = state;
        _opts = opts.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _log.LogInformation("Kailash Tally agent started. ERP {Erp}, Tally {Tally}, company {Company}", _opts.ErpUrl, _opts.TallyUrl, _opts.CompanyName);
        while (!ct.IsCancellationRequested)
        {
            var tallyUp = false;
            try
            {
                tallyUp = await _tally.IsRunningAsync(ct);
                if (DateTime.UtcNow - _lastHeartbeat >= TimeSpan.FromSeconds(_opts.HeartbeatIntervalSeconds))
                {
                    _state.LastAlterId = await _erp.HeartbeatAsync(tallyUp, _opts.CompanyName, tallyUp ? await _tally.VersionAsync(ct) : null, ct);
                    _lastHeartbeat = DateTime.UtcNow;
                }
                if (tallyUp)
                {
                    await ProcessQueueAsync(ct);
                    if (DateTime.UtcNow - _lastExport >= TimeSpan.FromMinutes(_opts.ExportIntervalMinutes)) await ExportChangesAsync(ct);
                    if (DateTime.UtcNow - _lastBalances >= TimeSpan.FromMinutes(_opts.BalanceIntervalMinutes)) await ExportBalancesAsync(ct);
                }
                else
                {
                    _log.LogWarning("TallyPrime is not reachable at {Url}; is it running with the company loaded?", _opts.TallyUrl);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception e)
            {
                _log.LogError(e, "Sync cycle failed");
            }
            await Task.Delay(TimeSpan.FromSeconds(_opts.QueueIntervalSeconds), ct).ContinueWith(_ => { });
        }
        _log.LogInformation("Agent stopping");
    }

    private async Task ProcessQueueAsync(CancellationToken ct)
    {
        var batch = await _erp.PullQueueAsync(50, ct);
        if (batch.Items.Count == 0) return;
        _log.LogInformation("Pulled {Count} item(s) from ERP", batch.Items.Count);
        foreach (var item in batch.Items)
        {
            var attempt = _attempts.TryGetValue(item.QueueId, out var a) ? a + 1 : 1;
            _attempts[item.QueueId] = attempt;
            try
            {
                var result = await _tally.ImportAsync(item.Xml, ct);
                var guid = result.Guid;
                if (result.Ok && guid is null)
                {
                    guid = await _tally.GuidByRemoteIdAsync(item.RemoteId, item.EntityType switch
                    {
                        "LEDGER" => "Ledger",
                        "STOCK_ITEM" => "StockItem",
                        _ => "Voucher",
                    }, ct);
                }
                if (result.Ok)
                {
                    await _erp.AckAsync(item.QueueId, true, guid ?? item.RemoteId, Trim(result.Raw), null, attempt, ct);
                    _log.LogInformation("{Type} {Id} synced (created {C}, altered {A})", item.EntityType, item.EntityId, result.Created, result.Altered);
                    _attempts.Remove(item.QueueId);
                }
                else
                {
                    var error = result.LineError ?? $"Tally reported {result.Errors} error(s)";
                    await _erp.AckAsync(item.QueueId, false, null, Trim(result.Raw), error, attempt, ct);
                    _log.LogWarning("{Type} {Id} rejected by Tally: {Error}", item.EntityType, item.EntityId, error);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _log.LogError(e, "{Type} {Id} failed", item.EntityType, item.EntityId);
                try { await _erp.AckAsync(item.QueueId, false, null, null, e.Message, attempt, ct); } catch { /* ERP retries SENT items after 10 min */ }
            }
        }
    }

    private async Task ExportChangesAsync(CancellationToken ct)
    {
        var since = _state.LastAlterId;
        var (ledgers, maxL) = await _tally.ExportLedgersAsync(since, ct);
        if (ledgers.Count > 0) await _erp.InboundAsync("LEDGER", ledgers, null, ct);
        var (receipts, maxR) = await _tally.ExportReceiptsAsync(since, ct);
        var max = Math.Max(maxL, maxR);
        await _erp.InboundAsync("VOUCHER", receipts, max > since ? max : null, ct);
        _state.LastAlterId = max;
        _lastExport = DateTime.UtcNow;
        if (ledgers.Count + receipts.Count > 0) _log.LogInformation("Exported {L} ledger(s), {R} receipt(s) since AlterID {Since}", ledgers.Count, receipts.Count, since);
    }

    private async Task ExportBalancesAsync(CancellationToken ct)
    {
        var (ledgers, _) = await _tally.ExportLedgersAsync(0, ct);
        await _erp.InboundAsync("BALANCE", ledgers.Where(l => l.ClosingPaise is not null).ToList(), null, ct);
        _lastBalances = DateTime.UtcNow;
    }

    private static string? Trim(string? s) => s is null ? null : s.Length > 20000 ? s[..20000] : s;
}
