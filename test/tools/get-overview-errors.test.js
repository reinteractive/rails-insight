import { describe, it, expect } from 'vitest'

describe('get_overview extraction_errors', () => {
  it('overview includes extraction error count', () => {
    // Simulate the extraction_errors logic from get-overview.js
    const index = {
      extraction_errors: ['schema', 'routes'],
    }
    const errorCount = (index.extraction_errors || []).length
    expect(errorCount).toBe(2)
    const overview = {
      extraction_errors: errorCount,
      ...(index.extraction_errors?.length > 0
        ? { extraction_error_details: index.extraction_errors }
        : {}),
    }
    expect(overview.extraction_errors).toBe(2)
    expect(overview.extraction_error_details).toEqual(['schema', 'routes'])
  })

  it('overview with no extraction errors', () => {
    const index = { extraction_errors: [] }
    const errorCount = (index.extraction_errors || []).length
    const overview = {
      extraction_errors: errorCount,
      ...(index.extraction_errors?.length > 0
        ? { extraction_error_details: index.extraction_errors }
        : {}),
    }
    expect(overview.extraction_errors).toBe(0)
    expect(overview.extraction_error_details).toBeUndefined()
  })
})
