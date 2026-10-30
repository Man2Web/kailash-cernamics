using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace KailashTallyAgent;

public sealed record QueueItem(string QueueId, string EntityType, string EntityId, string RemoteId, string Xml);
public sealed record QueueResponse(List<QueueItem> Items, string Company);
public sealed record BillRef(string Name, long AmountPaise);
public sealed record InboundItem
{
    public string? Guid { get; init; }
    public string? Name { get; init; }
    public long? AlterId { get; init; }
    public string? VoucherType { get; init; }
    public string? VoucherNumber { get; init; }
    public string? Date { get; init; }
    public string? PartyName { get; init; }
    public string? PartyGuid { get; init; }
    public long? AmountPaise { get; init; }
    public long? ClosingPaise { get; init; }
    public List<BillRef>? BillRefs { get; init; }
    public string? Parent { get; init; }
    public string? Gstin { get; init; }
}

/// <summary>Outbound HTTPS client for the ERP agent API (X-Agent-Key auth, Idempotency-Key on writes).</summary>
public sealed class ErpClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private readonly HttpClient _http;
    private readonly AgentOptions _opts;

    public ErpClient(IHttpClientFactory factory, IOptions<AgentOptions> opts)
    {
        _opts = opts.Value;
        _http = factory.CreateClient("erp");
        _http.BaseAddress = new Uri(_opts.ErpUrl.TrimEnd('/') + "/api/");
        _http.Timeout = TimeSpan.FromSeconds(60);
        _http.DefaultRequestHeaders.Add("X-Agent-Key", _opts.ApiKey);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("KailashTallyAgent/0.1");
    }

    private HttpRequestMessage Post(string path, object body, string? idempotencyKey = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: Json) };
        req.Headers.Add("Idempotency-Key", idempotencyKey ?? Guid.NewGuid().ToString());
        return req;
    }

    public async Task<QueueResponse> PullQueueAsync(int limit, CancellationToken ct)
    {
        var res = await _http.GetAsync($"tally/queue?limit={limit}", ct);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<QueueResponse>(Json, ct)) ?? new QueueResponse(new(), _opts.CompanyName);
    }

    public async Task AckAsync(string queueId, bool success, string? guid, string? raw, string? error, int attempt, CancellationToken ct)
    {
        var body = new { queueId, status = success ? "SUCCESS" : "FAILED", tallyGuid = guid, rawResponse = raw, error };
        using var req = Post("tally/ack", body, $"ack-{queueId}-{attempt}-{(success ? "ok" : "err")}");
        var res = await _http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
    }

    public async Task InboundAsync(string kind, List<InboundItem> items, long? lastAlterId, CancellationToken ct)
    {
        if (items.Count == 0 && lastAlterId is null) return;
        using var req = Post("tally/inbound", new { kind, items, lastAlterId });
        var res = await _http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
    }

    /// <returns>last AlterID the ERP has stored for this agent</returns>
    public async Task<long> HeartbeatAsync(bool tallyRunning, string company, string? version, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "tally/heartbeat")
        {
            Content = JsonContent.Create(new { tallyRunning, companyLoaded = tallyRunning, companyName = company, version }, options: Json),
        };
        var res = await _http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        return doc.RootElement.TryGetProperty("lastAlterId", out var v) ? v.GetInt64() : 0;
    }
}
