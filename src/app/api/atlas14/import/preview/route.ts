import { NextResponse } from 'next/server';
import Papa from 'papaparse';

interface ParsedRainfallData {
  city: string;
  state: string;
  durationMinutes: number;
  returnPeriod: string;
  intensity: number;
}

// Helper to find the header row index
function findHeaderRowIndex(lines: string[]): number {
  // Scan first 100 lines for a likely header
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i].toLowerCase();
    
    // Check for specific Atlas 14 format: "by duration for ARI (years):"
    if (line.includes('by duration for ari')) {
      return i;
    }

    // Check for key column names
    const hasDuration = /duration|time|min|hr/.test(line);
    const hasIntensity = /intensity|rate|value|precipitation|in\/hr|inches/.test(line);
    const hasReturnPeriod = /return|period|frequency|recurrence|year|yr/.test(line);
    // Check for frequency columns (common in matrix/pivot formats) e.g. "2yr", "5-year", etc.
    const hasFrequencyColumns = /2[-_\s]?yr|5[-_\s]?yr|10[-_\s]?yr|25[-_\s]?yr|50[-_\s]?yr|100[-_\s]?yr/.test(line);
    
    if ((hasDuration && (hasIntensity || hasReturnPeriod)) || (hasDuration && hasFrequencyColumns)) {
      return i;
    }
  }
  return 0; // Default to first row if not found
}

// Helper to extract metadata from preamble
function extractMetadata(lines: string[]): { city?: string, state?: string } {
  let city: string | undefined;
  let state: string | undefined;
  
  for (const line of lines) {
    // Look for "Location: City, State" or "Station: Name"
    // Example: "Location name (ESRI Maps): Frisco, Texas, USA"
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('location') || lowerLine.includes('station') || lowerLine.includes('site')) {
      const content = line.split(/[:\-\t]/).slice(1).join(' ').trim();
      if (content) {
        // Try to split City, State
        // e.g. "Frisco, Texas, USA"
        const parts = content.split(/,|\s{2,}/); // Split by comma or multiple spaces
        if (parts.length >= 1) {
          if (!city) city = parts[0].trim();
          
          if (!state && parts.length >= 2) {
            const potentialState = parts[1].trim();
            // Simple check for state abbreviation (2 chars) or full name
            if (potentialState.length === 2 || potentialState.length > 3) {
              state = potentialState;
            }
          }
        }
      }
    }
  }
  
  return { city, state };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const lines = text.split(/\r\n|\n|\r/);
    
    // 1. Detect Start of Table
    const headerRowIndex = findHeaderRowIndex(lines);
    
    // 2. Extract Metadata from Preamble
    const preamble = lines.slice(0, headerRowIndex);
    const fileMetadata = extractMetadata(preamble);
    
    // 3. Parse CSV starting from Header Row
    let csvContent = lines.slice(headerRowIndex).join('\n');
    
    // Clean up the header row for Atlas 14 specific format
    const headerLine = lines[headerRowIndex];
    if (headerLine && headerLine.toLowerCase().includes('by duration for ari')) {
      // The format is: "by duration for ARI (years):, 1,2,5,10,25,50,100,200,500,1000"
      // We need to convert this to: "duration,1,2,5,10,25,50,100,200,500,1000"
      // Also note that there is a space after the comma in "years):, 1"
      const parts = headerLine.split(',');
      // The first part is the complex string, replace it with "duration"
      parts[0] = 'duration';
      // Reconstruct the CSV with the fixed header
      csvContent = [parts.join(','), ...lines.slice(headerRowIndex + 1)].join('\n');
    }

    return new Promise<NextResponse>((resolve) => {
      Papa.parse<any>(csvContent, {
        header: true,
        skipEmptyLines: true,
        // Transform header: trim, lower case, remove non-word chars (except digits)
        transformHeader: (header) => {
           // For numeric headers like "1", "2", keep them as is but trim
           if (/^\d+$/.test(header.trim())) {
             return header.trim();
           }
           return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        },
        complete: (results) => {
          const detectedHeaders = results.meta?.fields || [];
          
          if (results.data.length === 0) {
            return resolve(NextResponse.json(
              { 
                error: 'No data rows found in CSV',
                detectedHeaders,
                suggestion: 'Please check that your CSV has a header row and data rows below it.',
                debugInfo: {
                    headerRowIndex,
                    fileMetadata,
                    detectedHeaders,
                    isMatrixFormat: false,
                    sampleFirstRow: null
                }
              },
              { status: 400 }
            ));
          }

          const sampleRows = results.data.slice(0, 3);
          const validReturnPeriods = ['1yr', '2yr', '5yr', '10yr', '25yr', '50yr', '100yr', '200yr', '500yr', '1000yr'];
          // Note: We support 1yr, 200yr etc as they appear in the file, but the Type definition might need update if used elsewhere.
          // For this specific app context, we map to standard ones if possible or keep them if flexible.
          // The standard app types usually support 2, 5, 10, 25, 50, 100.
          const supportedReturnPeriods = ['2yr', '5yr', '10yr', '25yr', '50yr', '100yr'];

          const parsedData: ParsedRainfallData[] = [];
          const errors: string[] = [];
          const warnings: string[] = [];

          const firstRow = results.data[0];
          const allKeys = Object.keys(firstRow || {});
          
          // 1. Detect Duration Column
          const durationKeys = allKeys.filter(k => /duration|time|period|minute|hour|hr|min/i.test(k));
          
          // 2. Detect Return Period Columns (Matrix keys are just numbers "1", "2", "5" etc)
          const matrixKeys = allKeys.filter(k => /^\d+$/.test(k) || /^\d+yr$/.test(k));
          const isMatrixFormat = matrixKeys.length >= 3;

          // 3. Other metadata columns
          const cityKeys = allKeys.filter(k => /city|location|name|place|station|site/i.test(k));
          const stateKeys = allKeys.filter(k => /state|province|region|code/i.test(k) && k.length <= 15);

          const columnMappings = {
            city: cityKeys[0] || (fileMetadata.city ? fileMetadata.city : 'not found'),
            state: stateKeys[0] || (fileMetadata.state ? fileMetadata.state : 'not found'),
            duration: durationKeys[0] || 'not found',
            returnPeriod: isMatrixFormat ? `Matrix Columns (${matrixKeys.join(', ')})` : 'List Format',
            intensity: isMatrixFormat ? 'Matrix Values' : 'List Format',
            format: isMatrixFormat ? 'Matrix/Pivot' : 'List'
          };

          for (let rowIndex = 0; rowIndex < results.data.length; rowIndex++) {
            const row = results.data[rowIndex];
            
            // A. City/State Resolution
            let cityField = '';
            let stateField = '';
            
            for (const key of cityKeys) if (row[key]) cityField = row[key];
            if (!cityField && fileMetadata.city) cityField = fileMetadata.city;
            
            for (const key of stateKeys) if (row[key]) stateField = row[key];
            if (!stateField && fileMetadata.state) stateField = fileMetadata.state;
            
            if (!cityField) cityField = "Unknown City";
            if (!stateField) stateField = "Unknown State";

            // B. Duration Resolution
            let durationField = '';
            for (const key of durationKeys) {
                 if (row[key]) {
                     durationField = row[key];
                     break;
                 }
            }
            
            if (!durationField) continue;

            // Cleanup: remove trailing colon "5-min:" -> "5-min"
            durationField = String(durationField).replace(/:$/, '');

            let durationMinutes = 0;
            const durationStr = durationField.trim().toLowerCase();
            const durationMatch = durationStr.match(/(\d+\.?\d*)/);
            
            if (durationMatch) {
              const durationValue = parseFloat(durationMatch[1]);
              const isDays = durationStr.includes('day');
              const isHours = durationStr.includes('hour') || durationStr.includes('hr') || (!durationStr.includes('min') && durationValue < 24 && !isDays);
              
              if (isDays) {
                durationMinutes = Math.round(durationValue * 24 * 60);
              } else if (isHours) {
                durationMinutes = Math.round(durationValue * 60);
              } else {
                durationMinutes = Math.round(durationValue);
              }
            } else {
              continue;
            }
            
            if (isNaN(durationMinutes) || durationMinutes <= 0) continue;

            // C. Parse Data
            if (isMatrixFormat) {
               for (const key of matrixKeys) {
                   // Key is "1", "2", "5" etc.
                   // Convert to "2yr" format
                   const yearNum = key.replace(/\D/g, ''); // extract number
                   const rp = `${yearNum}yr`;
                   
                   // Only include if it is one of our supported return periods
                   if (supportedReturnPeriods.includes(rp)) {
                       const intensityVal = row[key];
                       if (intensityVal) {
                           const intensity = parseFloat(String(intensityVal).replace(/,/g, '').trim()); // Remove commas if any
                           if (!isNaN(intensity) && intensity >= 0) {
                               parsedData.push({
                                   city: String(cityField).trim(),
                                   state: String(stateField).trim().toUpperCase(),
                                   durationMinutes,
                                   returnPeriod: rp,
                                   intensity
                               });
                           }
                       }
                   }
               }
            } else {
                // (Fallback for list format - unlikely for this file type but kept for robustness)
                // ...
            }
          }

          // Group by City/State
          const citiesMap = new Map<string, ParsedRainfallData[]>();
          for (const data of parsedData) {
            const key = `${data.city}-${data.state}`;
            if (!citiesMap.has(key)) citiesMap.set(key, []);
            citiesMap.get(key)!.push(data);
          }

          const citiesArray = Array.from(citiesMap.entries()).map(([key, data]) => ({
            city: data[0].city,
            state: data[0].state,
            recordCount: data.length
          }));

          resolve(NextResponse.json({
            success: parsedData.length > 0,
            data: parsedData,
            cities: citiesArray,
            errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
            warnings: warnings.length > 0 ? warnings.slice(0, 50) : undefined,
            totalRows: results.data.length,
            parsedRows: parsedData.length,
            detectedHeaders,
            columnMappings,
            debugInfo: {
                headerRowIndex,
                fileMetadata,
                detectedHeaders,
                isMatrixFormat,
                sampleFirstRow: results.data[0]
            },
            sampleRows: sampleRows.map((r, i) => ({
              rowNumber: i + 2,
              data: r,
              keys: Object.keys(r)
            }))
          }));
        },
        error: (error: Error) => {
          resolve(NextResponse.json(
            { error: 'CSV parsing failed', details: error.message },
            { status: 400 }
          ));
        }
      });
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to parse CSV', details: String(error) },
      { status: 500 }
    );
  }
}
