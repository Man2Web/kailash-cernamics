namespace KailashTallyAgent;

public sealed class AgentOptions
{
    public string ErpUrl { get; set; } = "https://crm.kailashceramics.com";
    public string ApiKey { get; set; } = "";
    public string TallyUrl { get; set; } = "http://localhost:9000";
    public string CompanyName { get; set; } = "Kailash Ceramics";
    public int QueueIntervalSeconds { get; set; } = 30;
    public int HeartbeatIntervalSeconds { get; set; } = 60;
    public int ExportIntervalMinutes { get; set; } = 5;
    public int BalanceIntervalMinutes { get; set; } = 15;
    public string LogDirectory { get; set; } = "logs";
    public int LogRetainFiles { get; set; } = 14;
}

/// <summary>Last AlterID seen by the ERP (persisted server-side; cached here between exports).</summary>
public sealed class AgentState
{
    public long LastAlterId { get; set; }
}
