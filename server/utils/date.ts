export function toISODate(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString()
}
export function addMonths(d: Date, n: number): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  date.setUTCMonth(date.getUTCMonth() + n)
  return date
}
export function firstOfMonthUTC(year: number, monthIndex0: number): Date {
  return new Date(Date.UTC(year, monthIndex0, 1))
}
export function lastOfMonthUTC(year: number, monthIndex0: number): Date {
  // Create date at first of next month, then subtract 1 day
  return new Date(Date.UTC(year, monthIndex0 + 1, 0))
}
export function lastWeekdayOfMonthUTC(year: number, monthIndex0: number): Date {
  let date = lastOfMonthUTC(year, monthIndex0)
  // Move to previous weekday if it falls on weekend
  // 0 = Sunday, 6 = Saturday
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date = new Date(date.getTime() - 24 * 60 * 60 * 1000) // subtract 1 day
  }
  return date
}
export function addMonthsEndOfMonth(d: Date, n: number): Date {
  const startYear = d.getUTCFullYear()
  const startMonth = d.getUTCMonth()
  const targetYear = startYear + Math.floor((startMonth + n) / 12)
  const targetMonth = (startMonth + n) % 12
  return lastWeekdayOfMonthUTC(targetYear, targetMonth)
}
