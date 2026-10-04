// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "LockedIn",
    platforms: [.macOS(.v13)],
    targets: [
        // Pure logic + system adapters. No AppKit here.
        .target(name: "LockedInCore"),
        .executableTarget(name: "lockedind", dependencies: ["LockedInCore"]),
        .executableTarget(name: "LockedInMenu", dependencies: ["LockedInCore"]),
        // XCTest is not available with Command Line Tools only, so tests are a plain executable.
        .executableTarget(name: "CoreTests", dependencies: ["LockedInCore"]),
    ]
)
