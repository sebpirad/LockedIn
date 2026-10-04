import Foundation

public struct Interval: Equatable {
    public var start: Date
    public var end: Date
    public var source: String
    public init(start: Date, end: Date, source: String) { self.start = start; self.end = end; self.source = source }
}

/// All schedule arithmetic happens in Europe/Copenhagen, never in the system time zone (the user could change that).
/// DST rules, applied by Foundation's matching policies:
/// - a wall time that does not exist (spring forward, 02:00–03:00) moves forward to the next valid time;
/// - a wall time that exists twice (fall back, 02:00–03:00) resolves to the FIRST occurrence.
public enum ScheduleMath {
    public static let zone = TimeZone(identifier: "Europe/Copenhagen")!

    public static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zone
        c.firstWeekday = 2
        return c
    }

    /// "HH:MM" → minutes after midnight, or nil.
    public static func minutes(_ hhmm: String) -> Int? {
        let p = hhmm.split(separator: ":", omittingEmptySubsequences: false)
        guard p.count == 2, p[0].count == 2, p[1].count == 2,
              let h = Int(p[0]), let m = Int(p[1]), (0...23).contains(h), (0...59).contains(m) else { return nil }
        return h * 60 + m
    }

    /// ISO weekday (1 = Monday … 7 = Sunday) of a Copenhagen calendar day.
    public static func isoWeekday(_ date: Date) -> Int {
        let w = calendar.component(.weekday, from: date) // 1 = Sunday
        return (w + 5) % 7 + 1
    }

    static func wallTime(_ minutes: Int, on day: Date) -> Date? {
        calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day,
                      matchingPolicy: .nextTime, repeatedTimePolicy: .first, direction: .forward)
    }

    /// "YYYY-MM-DD" → that Copenhagen calendar day (its start), or nil.
    public static func day(_ ymd: String) -> Date? {
        let p = ymd.split(separator: "-")
        guard p.count == 3, p[0].count == 4, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return nil }
        let date = calendar.date(from: DateComponents(year: y, month: m, day: d))
        // Reject 2026-02-31 and the like (Calendar would roll it over).
        guard let date, calendar.component(.day, from: date) == d, calendar.component(.month, from: date) == m else { return nil }
        return date
    }

    /// Occurrences of one schedule whose start day lies in [day(now) - 1, day(now) + daysAhead].
    /// A one-time period (`date`) occurs only on that day.
    public static func occurrences(_ s: Schedule, around now: Date, daysAhead: Int = 14) -> [Interval] {
        guard s.enabled, let sm = minutes(s.start), let em = minutes(s.end), sm != em else { return [] }
        let cal = calendar
        let today = cal.startOfDay(for: now)
        let once = s.date.flatMap(day)
        if s.date != nil && once == nil { return [] }
        var out: [Interval] = []
        // A one-time period is computed for its own day however far ahead it lies; weekly ones within the window.
        let days: [Date] = once.map { [$0] } ?? (-1...daysAhead).compactMap { cal.date(byAdding: .day, value: $0, to: today) }
        let fmt = DateFormatter()
        fmt.calendar = cal; fmt.timeZone = zone; fmt.locale = Locale(identifier: "en_US_POSIX"); fmt.dateFormat = "yyyy-MM-dd"
        for day in days {
            if once == nil { guard s.weekdays.contains(isoWeekday(day)) else { continue } }
            if !s.skip.isEmpty && s.skip.contains(fmt.string(from: day)) { continue }
            let endDay = em > sm ? day : (cal.date(byAdding: .day, value: 1, to: day) ?? day)
            guard let a = wallTime(sm, on: day), let b = wallTime(em, on: endDay), b > a else { continue }
            out.append(Interval(start: a, end: b, source: "schedule:\(s.id)"))
        }
        return out
    }

    public static func allOccurrences(_ schedules: [Schedule], around now: Date) -> [Interval] {
        schedules.flatMap { occurrences($0, around: now) }.sorted { $0.start < $1.start }
    }

    /// Given intervals active at `now` (and any that start before the chain ends), the end of the merged lock.
    /// Back-to-back or overlapping windows (and a timer) form one continuous lock.
    public static func mergedEnd(active: [Interval], all: [Interval], now: Date) -> Date? {
        guard var end = active.map(\.end).max() else { return nil }
        var changed = true
        while changed {
            changed = false
            for iv in all where iv.start <= end && iv.end > end {
                end = iv.end
                changed = true
            }
        }
        return end
    }
}
