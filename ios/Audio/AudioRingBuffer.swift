//
//  AudioRingBuffer.swift
//

import Foundation

typealias ContinueCondition = () -> Bool

final class AudioRingBuffer {

    // MARK: - Constants

    private let TAG = "AudioRingBuffer"

    // MARK: - Storage

    private var buffer: [UInt8]

    // MARK: - Ring Buffer State

    private var readPosition = 0
    private var writePosition = 0
    private var size = 0

    // MARK: - Statistics

    private var totalRead: Int64 = 0
    private var totalWritten: Int64 = 0

    // MARK: - Synchronization

    private let condition = NSCondition()

    // MARK: - Initialization

    init(capacity: Int) {
        buffer = Array(repeating: 0, count: capacity)
    }

    // MARK: - Public API

    @discardableResult
    func write(_ data: [UInt8]) -> Int {

        condition.lock()
        defer {
            condition.broadcast()
            condition.unlock()
        }

        resizeIfNeeded(additionalBytes: data.count)

        var remaining = data.count
        var sourceOffset = 0

        while remaining > 0 {

            let writable = min(
                remaining,
                buffer.count - writePosition
            )

            buffer.replaceSubrange(
                writePosition..<(writePosition + writable),
                with: data[sourceOffset..<(sourceOffset + writable)]
            )

            writePosition =
                (writePosition + writable) % buffer.count

            size += writable

            sourceOffset += writable
            remaining -= writable

            totalWritten += Int64(writable)

            print(
                "[\(TAG)] write=\(writable) totalWritten=\(totalWritten) size=\(size)"
            )
        }

        return data.count
    }

    @discardableResult
    func read(
        into destination: inout [UInt8]
    ) -> Int {

        condition.lock()
        defer { condition.unlock() }

        return readInternal(into: &destination)
    }

    @discardableResult
    func blockingRead(
        into destination: inout [UInt8],
        shouldContinue: ContinueCondition
    ) -> Int {

        condition.lock()
        defer { condition.unlock() }

        while size == 0 && shouldContinue() {

            print("[\(TAG)] Waiting...")

            condition.wait()

            print("[\(TAG)] Woke up")
        }

        guard shouldContinue(),
            size > 0
        else {
            return 0
        }

        return readInternal(into: &destination)
    }

    @discardableResult
    func blockingReadThreshold(
        into destination: inout [UInt8],
        threshold: Int,
        shouldContinue: ContinueCondition
    ) -> Int {

        condition.lock()
        defer { condition.unlock() }

        while size < threshold && shouldContinue() {

            print(
                "[\(TAG)] Waiting for threshold size=\(size)"
            )

            condition.wait()
        }

        guard shouldContinue(),
            size > 0
        else {
            return 0
        }

        return readInternal(into: &destination)
    }

    func clear() {

        condition.lock()

        readPosition = 0
        writePosition = 0
        size = 0

        condition.broadcast()
        condition.unlock()
    }

    func wakeUp() {

        condition.lock()
        condition.broadcast()
        condition.unlock()
    }

    func availableBytes() -> Int {

        condition.lock()
        defer { condition.unlock() }

        return size
    }

    func remainingCapacity() -> Int {

        condition.lock()
        defer { condition.unlock() }

        return remainingCapacityInternal()
    }

    func capacity() -> Int {
        return buffer.count
    }

    func isEmpty() -> Bool {
        return availableBytes() == 0
    }

    func isFull() -> Bool {
        return remainingCapacity() == 0
    }

    // MARK: - Private Helpers

    private func remainingCapacityInternal() -> Int {
        return buffer.count - size
    }

    private func resizeIfNeeded(additionalBytes: Int) {

        guard additionalBytes > remainingCapacityInternal() else {
            return
        }

        let newCapacity =
            max(
                buffer.count * 2,
                buffer.count + additionalBytes
            )

        print("[\(TAG)] Resizing \(buffer.count) -> \(newCapacity)")

        var newBuffer = Array(
            repeating: UInt8(0),
            count: newCapacity
        )

        var destinationOffset = 0
        var remaining = size
        var tempRead = readPosition

        while remaining > 0 {

            let readable =
                min(
                    remaining,
                    buffer.count - tempRead
                )

            newBuffer.replaceSubrange(
                destinationOffset..<destinationOffset+readable,
                with: buffer[tempRead..<tempRead+readable]
            )

            tempRead =
                (tempRead + readable) % buffer.count

            destinationOffset += readable
            remaining -= readable
        }

        buffer = newBuffer

        readPosition = 0
        writePosition = size
    }

    @discardableResult
    private func readInternal(
        into destination: inout [UInt8]
    ) -> Int {

        guard size > 0 else {
            print("[\(TAG)] BUFFER EMPTY")
            return 0
        }

        let bytesToRead = min(
            destination.count,
            size
        )

        var remaining = bytesToRead
        var destinationOffset = 0

        while remaining > 0 {

            let readable = min(
                remaining,
                buffer.count - readPosition
            )

            destination.replaceSubrange(
                destinationOffset..<(destinationOffset + readable),
                with: buffer[readPosition..<(readPosition + readable)]
            )

            readPosition =
                (readPosition + readable) % buffer.count

            size -= readable

            destinationOffset += readable
            remaining -= readable
        }

        totalRead += Int64(bytesToRead)

        print(
            "[\(TAG)] read=\(bytesToRead) totalRead=\(totalRead) remaining=\(size)"
        )

        return bytesToRead
    }
}