import { TallyParsedResponse } from "./types";

/**
 * Parses Tally XML response.
 * Works across both Node.js server environments and browser environments without heavy DOM dependencies.
 */
export function parseTallyResponse(xmlStr: string): TallyParsedResponse {
  if (!xmlStr || typeof xmlStr !== "string") {
    return {
      success: false,
      created: 0,
      altered: 0,
      errors: 1,
      errorMessage: "Empty or invalid response from Tally",
      rawResponse: String(xmlStr),
    };
  }

  // Extract <CREATED>, <ALTERED>, <ERRORS>
  const createdMatch = xmlStr.match(/<CREATED>(\d+)<\/CREATED>/i);
  const alteredMatch = xmlStr.match(/<ALTERED>(\d+)<\/ALTERED>/i);
  const errorsMatch = xmlStr.match(/<ERRORS>(\d+)<\/ERRORS>/i);
  const lastVchIdMatch = xmlStr.match(/<LASTVCHID>([^<]+)<\/LASTVCHID>/i);
  const guidMatch = xmlStr.match(/<GUID>([^<]+)<\/GUID>/i);
  const lineErrorMatch = xmlStr.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i);
  const descMatch = xmlStr.match(/<DESC>([^<]+)<\/DESC>/i);

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

  // Check overall success
  // If created > 0 or altered > 0 and errors === 0, it's successful
  // If errors > 0 or both created and altered are 0 (and it was an import attempt)
  const isSuccess = (created > 0 || altered > 0) && errors === 0;

  if (!isSuccess && !errorMessage) {
    if (errors > 0) {
      errorMessage = `Tally reported ${errors} error(s) during import.`;
    } else if (xmlStr.includes("FAILED") || xmlStr.includes("Error")) {
      errorMessage = "Tally import failed. Check Tally server logs.";
    } else {
      // Check if it's already existing ledger/item (often marked altered: 1 or created: 0)
      if (xmlStr.toLowerCase().includes("already exists")) {
        errorMessage = "Entity already exists in Tally";
      } else {
        errorMessage = "No records were created or altered by Tally.";
      }
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
    rawResponse: xmlStr,
  };
}
