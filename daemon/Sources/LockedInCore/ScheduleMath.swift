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

    /// Occurrences of one schedule whose start day lies in [day(now) - 1, day(now) + daysAhead].
    public static func occurrences(_ s: Schedule, around now: Date, daysAhead: Int = 8) -> [Interval] {
        guard s.enabled, let sm = minutes(s.start), let em = minutes(s.end), sm != em else { return [] }
        let cal = calendar
        let today = cal.startOfDay(for: now)
        var out: [Interval] = []
        for k in -1...daysAhead {
            guard let day = cal.date(byAdding: .day, value: k, to: today) else { continue }
            guard s.weekdays.contains(isoWeekday(day)) else { continue }
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
