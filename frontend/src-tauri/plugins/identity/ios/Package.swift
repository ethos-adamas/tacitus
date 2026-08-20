// swift-tools-version:5.9

import PackageDescription

let package = Package(
    name: "tauri-plugin-identity",
    platforms: [
        .iOS(.v13),
    ],
    products: [
        .library(
            name: "tauri-plugin-identity",
            type: .static,
            targets: ["tauri-plugin-identity"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        // Targets are the basic building blocks of a package. A target can define a module or a test suite.
        .target(
            name: "tauri-plugin-identity",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
