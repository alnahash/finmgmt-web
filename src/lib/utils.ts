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

  // End date = one day before the NEXT period starts (next period starts same day, next month)
  let nextMonth = month + 1
  let nextYear = year
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear = year + 1
  }

  let endDay = day - 1
  let endMonth = nextMonth
  let endYear = nextYear

  if (endDay < 1) {
    // day=1 means end is the last day of the month before nextMonth
    endMonth = nextMonth - 1
    if (endMonth < 1) {
      endMonth = 12
      endYear = nextYear - 1
    }
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

// Period type utilities for different time granularities
export type PeriodType = 'yearly' | 'quarterly' | 'monthly' | 'weekly' | 'daily' | 'custom'

/**
 * Generate yearly period key (e.g., "2025")
 */
export const getYearlyPeriodKey = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.getFullYear().toString()
}

/**
 * Generate quarterly period key (e.g., "2025-Q1")
 */
export const getQuarterlyPeriodKey = (dateStr: string): string => {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const quarter = Math.floor(date.getMonth() / 3) + 1
  return `${year}-Q${quarter}`
}

/**
 * Generate weekly period key (e.g., "2025-W15" for week 15)
 */
export const getWeeklyPeriodKey = (dateStr: string): string => {
  const date = new Date(dateStr)
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - startOfYear.getTime()
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  const week = Math.floor(diff / oneWeek) + 1
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Generate daily period key (e.g., "2025-03-15")
 */
export const getDailyPeriodKey = (dateStr: string): string => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Generate period key based on period type
 */
export const getPeriodKeyByType = (dateStr: string, periodType: PeriodType, monthStartDay: number = 1): string => {
  switch (periodType) {
    case 'yearly':
      return getYearlyPeriodKey(dateStr)
    case 'quarterly':
      return getQuarterlyPeriodKey(dateStr)
    case 'monthly':
      return getMonthPeriodKey(dateStr, monthStartDay)
    case 'weekly':
      return getWeeklyPeriodKey(dateStr)
    case 'daily':
      return getDailyPeriodKey(dateStr)
    case 'custom':
      return getMonthPeriodKey(dateStr, monthStartDay)
    default:
      return getMonthPeriodKey(dateStr, monthStartDay)
  }
}

/**
 * Get date range for yearly period (e.g., "2025" -> Jan 1 - Dec 31)
 */
export const getYearlyDateRange = (periodKey: string): { startDate: string; endDate: string } => {
  const year = parseInt(periodKey)
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  }
}

/**
 * Get date range for quarterly period (e.g., "2025-Q1" -> Jan 1 - Mar 31)
 */
export const getQuarterlyDateRange = (periodKey: string): { startDate: string; endDate: string } => {
  const [year, quarter] = periodKey.split('-')
  const q = parseInt(quarter.replace('Q', ''))
  const startMonth = (q - 1) * 3 + 1
  const endMonth = q * 3

  const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const lastDay = new Date(parseInt(year), endMonth, 0).getDate()
  const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`

  return { startDate, endDate }
}

/**
 * Get date range for weekly period (e.g., "2025-W15")
 */
export const getWeeklyDateRange = (periodKey: string): { startDate: string; endDate: string } => {
  const [yearStr, weekStr] = periodKey.split('-')
  const year = parseInt(yearStr)
  const week = parseInt(weekStr.replace('W', ''))

  const startOfYear = new Date(year, 0, 1)
  const daysToAdd = (week - 1) * 7
  const startDate = new Date(startOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000)
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)

  const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
  const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

  return { startDate: startDateStr, endDate: endDateStr }
}

/**
 * Get date range for daily period (e.g., "2025-03-15")
 */
export const getDailyDateRange = (periodKey: string): { startDate: string; endDate: string } => {
  return { startDate: periodKey, endDate: periodKey }
}

/**
 * Get date range based on period type
 */
export const getPeriodDateRangeByType = (
  periodKey: string,
  periodType: PeriodType
): { startDate: string; endDate: string } => {
  switch (periodType) {
    case 'yearly':
      return getYearlyDateRange(periodKey)
    case 'quarterly':
      return getQuarterlyDateRange(periodKey)
    case 'weekly':
      return getWeeklyDateRange(periodKey)
    case 'daily':
      return getDailyDateRange(periodKey)
    case 'monthly':
    case 'custom':
      return getPeriodDateRange(periodKey)
    default:
      return getPeriodDateRange(periodKey)
  }
}

/**
 * Format period label based on period type
 */
export const formatPeriodLabel = (periodKey: string, periodType: PeriodType): string => {
  switch (periodType) {
    case 'yearly':
      return periodKey
    case 'quarterly': {
      const [year, quarter] = periodKey.split('-')
      return `${quarter} ${year}`
    }
    case 'weekly': {
      const [year, week] = periodKey.split('-')
      const weekNum = week.replace('W', '')
      return `Week ${weekNum}, ${year}`
    }
    case 'daily': {
      const date = new Date(periodKey)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    case 'monthly':
    case 'custom':
      return getPeriodLabel(periodKey)
    default:
      return getPeriodLabel(periodKey)
  }
}

/**
 * Get unique period keys based on period type from a list of dates
 */
export const getUniquePeriodKeysByType = (dates: string[], periodType: PeriodType, monthStartDay: number = 1): string[] => {
  const periodSet = new Set<string>()

  dates.forEach((dateStr) => {
    if (dateStr) {
      const key = getPeriodKeyByType(dateStr, periodType, monthStartDay)
      if (key && key.trim()) {
        periodSet.add(key)
      }
    }
  })

  return Array.from(periodSet)
    .filter((p) => p && p.length > 0)
    .sort()
    .reverse()
}
