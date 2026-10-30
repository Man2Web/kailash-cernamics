using System.Globalization;
using System.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.Extensions.Options;

namespace KailashTallyAgent;

public sealed record ImportResult(int Created, int Altered, int Errors, string? LineError, string? Guid, string Raw)
{
    public bool Ok => Errors == 0 && LineError is null && (Created + Altered) > 0;
}

/// <summary>Talks XML to TallyPrime on localhost:9000 ("TallyPrime acts as server").</summary>
public sealed class TallyClient
{
    private readonly HttpClient _http;
    private readonly AgentOptions _opts;

    public TallyClient(IHttpClientFactory factory, IOptions<AgentOptions> opts)
    {
        _opts = opts.Value;
        _http = factory.CreateClient("tally");
        _http.BaseAddress = new Uri(_opts.TallyUrl);
        _http.Timeout = TimeSpan.FromSeconds(120);
    }

    private async Task<string> PostAsync(string xml, CancellationToken ct)
    {
        using var content = new StringContent(xml, Encoding.UTF8, "text/xml");
        var res = await _http.PostAsync("", content, ct);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadAsStringAsync(ct);
    }

    public async Task<bool> IsRunningAsync(CancellationToken ct)
    {
        try
        {
            var res = await _http.GetAsync("", ct);
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<string?> VersionAsync(CancellationToken ct)
    {
        try
        {
            var xml = await PostAsync(ExportEnvelope("$$SysInfo:Version", "Function"), ct);
            return Regex.Match(xml, "<RESULT[^>]*>([^<]+)</RESULT>").Groups[1].Value is { Length: > 0 } v ? v : "TallyPrime";
        }
        catch
        {
            return null;
        }
    }

    public async Task<ImportResult> ImportAsync(string envelopeXml, CancellationToken ct)
    {
        var raw = await PostAsync(envelopeXml, ct);
        int Num(string tag) => int.TryParse(Regex.Match(raw, $"<{tag}>(\\d+)</{tag}>").Groups[1].Value, out var n) ? n : 0;
        var lineError = Regex.Match(raw, "<LINEERROR>([\\s\\S]*?)</LINEERROR>").Groups[1].Value.Trim();
        var guid = Regex.Match(raw, "<LASTVCHID>([^<]+)</LASTVCHID>").Groups[1].Value;
        if (string.IsNullOrEmpty(guid)) guid = Regex.Match(raw, "<GUID>([^<]+)</GUID>").Groups[1].Value;
        return new ImportResult(Num("CREATED"), Num("ALTERED"), Num("ERRORS"), lineError.Length > 0 ? lineError : null, guid.Length > 0 ? guid : null, raw);
    }

    /// <summary>After a voucher import, read back the GUID by REMOTEID when Tally didn't return it.</summary>
    public async Task<string?> GuidByRemoteIdAsync(string remoteId, string collectionType, CancellationToken ct)
    {
        var xml = CollectionEnvelope("ErpLookup", collectionType, new[] { "GUID", "REMOTEID" }, $"$RemoteID = \"{SecurityElement.Escape(remoteId)}\"");
        var raw = await PostAsync(xml, ct);
        return Regex.Match(raw, "<GUID[^>]*>([^<]+)</GUID>").Groups[1].Value is { Length: > 0 } g ? g : null;
    }

    /// <summary>Ledgers changed since the last AlterID (Sundry Debtors/Creditors) with closing balances.</summary>
    public async Task<(List<InboundItem> Items, long MaxAlterId)> ExportLedgersAsync(long sinceAlterId, CancellationToken ct)
    {
        var raw = await PostAsync(CollectionEnvelope("ErpLedgers", "Ledger", new[] { "GUID", "NAME", "PARENT", "PARTYGSTIN", "CLOSINGBALANCE", "ALTERID" }, $"$AlterID > {sinceAlterId} AND ($Parent = \"Sundry Debtors\" OR $Parent = \"Sundry Creditors\")"), ct);
        var items = new List<InboundItem>();
        long max = sinceAlterId;
        foreach (var l in Parse(raw).Descendants("LEDGER"))
        {
            var alter = ParseLong(l.Element("ALTERID")?.Value);
            max = Math.Max(max, alter);
            items.Add(new InboundItem
            {
                Guid = l.Element("GUID")?.Value,
                Name = l.Attribute("NAME")?.Value ?? l.Element("NAME")?.Value,
                Parent = l.Element("PARENT")?.Value,
                Gstin = l.Element("PARTYGSTIN")?.Value,
                ClosingPaise = ToPaise(l.Element("CLOSINGBALANCE")?.Value),
                AlterId = alter,
            });
        }
        return (items, max);
    }

    /// <summary>Receipt vouchers entered in Tally (since AlterID) with bill-wise allocations.</summary>
    public async Task<(List<InboundItem> Items, long MaxAlterId)> ExportReceiptsAsync(long sinceAlterId, CancellationToken ct)
    {
        var raw = await PostAsync(CollectionEnvelope("ErpReceipts", "Voucher", new[] { "GUID", "DATE", "VOUCHERNUMBER", "VOUCHERTYPENAME", "PARTYLEDGERNAME", "AMOUNT", "ALTERID", "REMOTEID", "ALLLEDGERENTRIES.LIST" }, $"$AlterID > {sinceAlterId} AND $VoucherTypeName = \"Receipt\""), ct);
        var items = new List<InboundItem>();
        long max = sinceAlterId;
        foreach (var v in Parse(raw).Descendants("VOUCHER"))
        {
            var alter = ParseLong(v.Element("ALTERID")?.Value);
            max = Math.Max(max, alter);
            if ((v.Element("REMOTEID")?.Value ?? "").StartsWith("erp-")) continue; // created by the ERP
            var party = v.Element("PARTYLEDGERNAME")?.Value;
            var bills = v.Descendants("BILLALLOCATIONS.LIST")
                .Select(b => new BillRef(b.Element("NAME")?.Value ?? "", Math.Abs(ToPaise(b.Element("AMOUNT")?.Value) ?? 0)))
                .Where(b => b.Name.Length > 0)
                .ToList();
            var amount = v.Descendants("ALLLEDGERENTRIES.LIST")
                .Where(e => e.Element("LEDGERNAME")?.Value == party)
                .Select(e => Math.Abs(ToPaise(e.Element("AMOUNT")?.Value) ?? 0))
                .FirstOrDefault();
            items.Add(new InboundItem
            {
                Guid = v.Element("GUID")?.Value,
                VoucherType = "Receipt",
                VoucherNumber = v.Element("VOUCHERNUMBER")?.Value,
                Date = v.Element("DATE")?.Value,
                PartyName = party,
                AmountPaise = amount,
                BillRefs = bills,
                AlterId = alter,
            });
        }
        return (items, max);
    }

    private string ExportEnvelope(string id, string type) => $"""
        <ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>{type}</TYPE><ID>{id}</ID></HEADER>
        <BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>{SecurityElement.Escape(_opts.CompanyName)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC></BODY></ENVELOPE>
        """;

    /// <summary>Export Data request with an inline TDL collection and a filter formula.</summary>
    private string CollectionEnvelope(string name, string type, string[] fetch, string filter) => $"""
        <ENVELOPE>
          <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>{name}</ID></HEADER>
          <BODY><DESC>
            <STATICVARIABLES><SVCURRENTCOMPANY>{SecurityElement.Escape(_opts.CompanyName)}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
            <TDL><TDLMESSAGE>
              <COLLECTION NAME="{name}" ISINITIALIZE="Yes">
                <TYPE>{type}</TYPE>
                <FETCH>{string.Join(", ", fetch)}</FETCH>
                <FILTERS>ErpFilter</FILTERS>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="ErpFilter">{SecurityElement.Escape(filter)}</SYSTEM>
            </TDLMESSAGE></TDL>
          </DESC></BODY>
        </ENVELOPE>
        """;

    private static XDocument Parse(string raw)
    {
        // Tally sometimes emits control characters that XML parsers reject.
        var clean = Regex.Replace(raw, "&#(?:[0-8]|1[1-2]|1[4-9]|2[0-9]|3[0-1]);|[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]", "");
        return XDocument.Parse(clean);
    }

    private static long ParseLong(string? s) => long.TryParse(s?.Trim(), out var v) ? v : 0;

    /// <summary>"-1234.50" or "1234.50 Dr" → paise (debit positive).</summary>
    public static long? ToPaise(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var t = s.Trim();
        var sign = 1;
        if (t.EndsWith("Cr", StringComparison.OrdinalIgnoreCase)) { sign = -1; t = t[..^2].Trim(); }
        else if (t.EndsWith("Dr", StringComparison.OrdinalIgnoreCase)) { t = t[..^2].Trim(); }
        if (!decimal.TryParse(t.Replace(",", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var d)) return null;
        // Tally exports debit balances as negative numbers
        return (long)Math.Round(-d * 100m * sign, MidpointRounding.AwayFromZero);
    }
}
