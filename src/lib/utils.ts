// Period and date utilities for custom month start day

/**
 * Generate a period key from a date string
 * Returns format like "202404-25" meaning the period starting on the 25th
 * @param dateStr ISO date string (YYYY-MM-DD)
 * @param monthStartDay The day of month when the period starts (1-28)
 * @returns Period key string
 */
export const getMonthPeriodKey = (dateStr: string, monthStartDay: number): string => {
  const date = new Date(dateStr)
  let year = date.getFullYear()
  let month = date.getMonth() + 1
  const day = date.getDate()

  // If the day is before the month start day, it belongs to the previous month's period
  if (day < monthStartDay) {
    if (month === 1) {
      month = 12
      year = year - 1  // Go back a year when rolling from January to December
    } else {
      month = month - 1
    }
  }

  return `${year}${String(month).padStart(2, '0')}-${monthStartDay}`
}

/**
 * Format a period key into a human-readable label
 * @param periodKey Period key string (e.g., "202404-25")
 * @returns Formatted label (e.g., "Apr 25 - May 24, 2024")
 */
export const getPeriodLabel = (periodKey: string): string => {
  if (!periodKey) return ''
  const [yearMonth, startDay] = periodKey.split('-')
  const year = parseInt(yearMonth.substring(0, 4))
  const month = parseInt(yearMonth.substring(4, 6))

  const startDate = new Date(year, month - 1, parseInt(startDay))
  const endDate = new Date(year, month, parseInt(startDay) - 1)

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const startLabel = `${months[startDate.getMonth()]} ${startDate.getDate()}`
  const endLabel = `${months[endDate.getMonth()]} ${endDate.getDate()}`

  // Include year if period spans two different years
  const endYear = endDate.getFullYear()
  if (year !== endYear) {
    return `${startLabel} ${year} - ${endLabel} ${endYear}`
  }
  return `${startLabel} - ${endLabel} ${year}`
}

/**
 * Get the date range for a period key
 * @param periodKey Period key string (e.g., "202404-25")
 * @returns Object with startDate and endDate as ISO strings
 */
export const getPeriodDateRange = (periodKey: string): { startDate: string; endDate: string } => {
  if (!periodKey) return { startDate: '', endDate: '' }
  const [yearMonth, startDay] = periodKey.split('-')
  const year = parseInt(yearMonth.substring(0, 4))
  const month = parseInt(yearMonth.substring(4, 6))
  const day = parseInt(startDay)

  // Build start date string directly (no timezone conversion)
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // Calculate end date (last day of the period, one day before next period starts)
  let endMonth = month
  let endYear = year
  let endDay = day - 1

  if (endDay < 1) {
    endMonth--
    if (endMonth < 1) {
      endMonth = 12
      endYear--
    }
    // Get the last day of the previous month
    const lastDayOfMonth = new Date(endYear, endMonth, 0).getDate()
    endDay = lastDayOfMonth
  }

  const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`

  return {
    startDate: startDateStr,
    endDate: endDateStr,
  }
}

/**
 * Get unique period keys from a list of dates
 * @param dates Array of ISO date strings
 * @param monthStartDay The day of month when the period starts (1-28)
 * @returns Sorted array of unique period keys (newest first)
 */
export const getUniquePeriodKeys = (dates: string[], monthStartDay: number): string[] => {
  const periodSet = new Set<string>()

  dates.forEach((dateStr) => {
    if (dateStr) {
      const key = getMonthPeriodKey(dateStr, monthStartDay)
      if (key && key.trim()) {
        periodSet.add(key)
      }
    }
  })

  return Array.from(periodSet)
    .filter(p => p && p.length > 0)
    .sort()
    .reverse()
}

/**
 * Currency formatting helper
 * @param amount Numeric amount
 * @param currency Currency code (e.g., "USD", "EUR", "BHD")
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(amount)
}

/**
 * Get currency symbol from currency code
 * @param currency Currency code (e.g., "USD", "EUR", "BHD")
 * @returns Currency symbol
 */
export const getCurrencySymbol = (currency: string = 'USD'): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  })

  // Format 0 to get the currency symbol
  return formatter.format(0).replace(/[\d.,]/g, '').trim()
}
