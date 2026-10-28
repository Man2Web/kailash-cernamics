export interface TallyResponseSummary {
  success: boolean;
  created: number;
  altered: number;
  errors: number;
  lastVchId?: string;
  guid?: string;
  errorMessage?: string;
}

export function parseTallyXml(xml: string): TallyResponseSummary {
  if (!xml) {
    return {
      success: false,
      created: 0,
      altered: 0,
      errors: 1,
      errorMessage: "No response received from Tally",
    };
  }

  const createdMatch = xml.match(/<CREATED>(\d+)<\/CREATED>/i);
  const alteredMatch = xml.match(/<ALTERED>(\d+)<\/ALTERED>/i);
  const errorsMatch = xml.match(/<ERRORS>(\d+)<\/ERRORS>/i);
  const lastVchIdMatch = xml.match(/<LASTVCHID>([^<]+)<\/LASTVCHID>/i);
  const guidMatch = xml.match(/<GUID>([^<]+)<\/GUID>/i);
  const lineErrorMatch = xml.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i);
  const descMatch = xml.match(/<DESC>([^<]+)<\/DESC>/i);

  const created = createdMatch ? parseInt(createdMatch[1], 10) : 0;
  const altered = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
  const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;
  const lastVchId = lastVchIdMatch ? lastVchIdMatch[1].trim() : undefined;
  const guid = guidMatch ? guidMatch[1].trim() : undefined;

  let errorMessage: string | undefined;

  if (lineErrorMatch) {
    errorMessage = lineErrorMatch[1].trim();
  } else if (descMatch) {
    errorMessage = descMatch[1].trim();
  }

  const isSuccess = (created > 0 || altered > 0) && errors === 0;

  if (!isSuccess && !errorMessage) {
    if (errors > 0) {
      errorMessage = `Tally reported ${errors} error(s). Check Tally error log.`;
    } else if (xml.toLowerCase().includes("already exists")) {
      errorMessage = "Record already exists in Tally";
    } else {
      errorMessage = "Tally import was rejected or produced 0 changes.";
    }
  }

  return {
    success: isSuccess,
    created,
    altered,
    errors,
    lastVchId,
    guid,
    errorMessage,
  };
}
