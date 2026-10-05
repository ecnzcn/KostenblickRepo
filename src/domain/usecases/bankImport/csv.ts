/**
 * Minimal RFC-4180-style CSV reader for bank exports: quoted fields may
 * contain the delimiter, line breaks and doubled quotes (""). LF and CRLF
 * both end a record. Returns each record with the 1-based line it starts on,
 * so errors can point at the right place in the file.
 */
export interface CsvRecord {
  line: number
  fields: string[]
}

export function parseCsv(text: string, delimiter = ';'): CsvRecord[] {
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let recordHasContent = false

  const endField = () => {
    fields.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    if (recordHasContent || fields.length > 1 || fields[0] !== '') records.push({ line: recordLine, fields })
    fields = []
    recordHasContent = false
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        if (char === '\n') line += 1
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      recordHasContent = true
    } else if (char === delimiter) {
      endField()
      recordHasContent = true
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      endRecord()
      line += 1
      recordLine = line
    } else {
      field += char
      recordHasContent = true
    }
  }
  if (field !== '' || fields.length > 0 || recordHasContent) endRecord()
  return records
}
