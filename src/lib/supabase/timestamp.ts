export class Timestamp {
  readonly seconds: number
  readonly nanoseconds: number

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }

  static now(): Timestamp {
    return Timestamp.fromDate(new Date())
  }

  static fromDate(date: Date): Timestamp {
    const milliseconds = date.getTime()

    if (!Number.isFinite(milliseconds)) {
      throw new Error('Invalid date supplied to Timestamp.fromDate()')
    }

    const seconds = Math.floor(milliseconds / 1000)
    const nanoseconds = Math.floor(
      (milliseconds - seconds * 1000) * 1_000_000,
    )

    return new Timestamp(seconds, nanoseconds)
  }

  static fromMillis(milliseconds: number): Timestamp {
    if (!Number.isFinite(milliseconds)) {
      throw new Error('Invalid milliseconds supplied to Timestamp.fromMillis()')
    }

    return Timestamp.fromDate(new Date(milliseconds))
  }

  toDate(): Date {
    return new Date(this.toMillis())
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1_000_000
  }

  isEqual(other: Timestamp): boolean {
    return (
      this.seconds === other.seconds &&
      this.nanoseconds === other.nanoseconds
    )
  }

  toJSON(): {
    seconds: number
    nanoseconds: number
  } {
    return {
      seconds: this.seconds,
      nanoseconds: this.nanoseconds,
    }
  }
}

/**
 * Converts values returned by PostgreSQL/Supabase into the small
 * Timestamp compatibility object used by the ArtVault UI.
 *
 * PostgreSQL timestamptz values normally arrive as ISO strings, but
 * accepting Date, number and timestamp-shaped objects makes this helper
 * safe for tests and migration data too.
 */
export function timestamp(value: unknown): Timestamp {
  if (value instanceof Timestamp) {
    return value
  }

  if (value instanceof Date) {
    return Timestamp.fromDate(value)
  }

  if (typeof value === 'number') {
    return Timestamp.fromMillis(value)
  }

  if (typeof value === 'string') {
    const milliseconds = Date.parse(value)

    if (!Number.isFinite(milliseconds)) {
      throw new Error(`Invalid timestamp string: ${value}`)
    }

    return Timestamp.fromMillis(milliseconds)
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>

    const secondsValue =
      typeof record.seconds === 'number'
        ? record.seconds
        : typeof record._seconds === 'number'
          ? record._seconds
          : null

    const nanosecondsValue =
      typeof record.nanoseconds === 'number'
        ? record.nanoseconds
        : typeof record._nanoseconds === 'number'
          ? record._nanoseconds
          : 0

    if (secondsValue !== null) {
      return new Timestamp(secondsValue, nanosecondsValue)
    }
  }

  throw new Error('Invalid timestamp value')
}