package com.margelo.nitro.nitrorealtimeaudio.audio

import android.util.Log

class AudioRingBuffer(
    capacity: Int
) {

    companion object {
        const val TAG = "AudioRingBuffer"
    }

    private var buffer = ByteArray(capacity)

    private var readPos = 0
    private var writePos = 0
    private var size = 0
    private var totalRead = 0L
    private var totalWritten = 0L
    private val monitor = Object()

    fun blockingRead(
        destination: ByteArray,
        offset: Int = 0,
        length: Int = destination.size,
        shouldContinue: () -> Boolean
    ): Int {
        synchronized(monitor) {
            while (size == 0 && shouldContinue()) {
                try {
                    Log.d(TAG, "Waiting... size=$size")
                    monitor.wait()
                    Log.d(TAG, "Woke up size=$size")
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
                Log.d(TAG, "blockingRead waiting")
            }

            if (!shouldContinue() || size == 0) {
                return 0
            }

            val bytesRead = readInternal(destination, offset, length)
            totalRead += bytesRead
            Log.d(TAG,"read=$bytesRead totalRead=$totalRead remaining=$size")
            return bytesRead
        }
    }

    fun blockingReadThreshold(
        destination: ByteArray,
        offset: Int = 0,
        length: Int = destination.size,
        threshold: Int,
        shouldContinue: () -> Boolean
    ): Int {
        synchronized(monitor) {
            while (size < threshold && shouldContinue()) {
                try {
                    Log.d(TAG, "Waiting for threshold... size=$size threshold=$threshold")
                    monitor.wait()
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }

            if (!shouldContinue() || size == 0) {
                return 0
            }

            val bytesRead = readInternal(destination, offset, length)
            totalRead += bytesRead
            Log.d(TAG,"read=$bytesRead totalRead=$totalRead remaining=$size")
            return bytesRead
        }
    }

    fun write(data: ByteArray, offset: Int = 0, length: Int = data.size): Int {
        synchronized(monitor) {
            if (length > remainingCapacityInternal()) {
                val newCapacity = maxOf(buffer.size * 2, buffer.size + length)
                Log.d(TAG, "Resizing buffer from ${buffer.size} to $newCapacity (size=$size, length=$length)")
                val newBuffer = ByteArray(newCapacity)

                var destOffset = 0
                var remainingToCopy = size
                var tempReadPos = readPos
                while (remainingToCopy > 0) {
                    val readable = minOf(remainingToCopy, buffer.size - tempReadPos)
                    System.arraycopy(buffer, tempReadPos, newBuffer, destOffset, readable)
                    tempReadPos = (tempReadPos + readable) % buffer.size
                    destOffset += readable
                    remainingToCopy -= readable
                }

                buffer = newBuffer
                readPos = 0
                writePos = size
            }

            var remaining = length
            var srcOffset = offset

            while (remaining > 0) {
                val writable = minOf(remaining, buffer.size - writePos)
                System.arraycopy(data, srcOffset, buffer, writePos, writable)
                writePos = (writePos + writable) % buffer.size
                size += writable
                srcOffset += writable
                remaining -= writable
                totalWritten += writable
                Log.d(TAG,"write bytes=$writable totalWritten=$totalWritten size=$size")
            }

            monitor.notifyAll()
            return length
        }
    }

    fun read(
        destination: ByteArray,
        offset: Int = 0,
        length: Int = destination.size
    ): Int {
        synchronized(monitor) {
            return readInternal(destination, offset, length)
        }
    }

    private fun readInternal(
        destination: ByteArray,
        offset: Int = 0,
        length: Int = destination.size
    ): Int {
        if (size == 0) {
            Log.w(TAG, "BUFFER EMPTY size=$size capacity=${buffer.size}")
            return 0
        }
        var destOffset = offset
        val bytesToRead = minOf(length, size)
        var remaining = bytesToRead

        while (remaining > 0) {
            val readable = minOf(remaining, buffer.size - readPos)
            System.arraycopy(buffer, readPos, destination, destOffset, readable)
            readPos = (readPos + readable) % buffer.size
            size -= readable
            destOffset += readable
            remaining -= readable
        }

        Log.d(TAG, "read=$bytesToRead remaining=$size")

        return bytesToRead
    }

    fun clear() {
        synchronized(monitor) {
            readPos = 0
            writePos = 0
            size = 0
            monitor.notifyAll()
        }
    }

    fun availableBytes(): Int {
        synchronized(monitor) {
            return size
        }
    }

    fun remainingCapacity(): Int {
        synchronized(monitor) {
            return remainingCapacityInternal()
        }
    }

    private fun remainingCapacityInternal(): Int {
        return buffer.size - size
    }

    fun wakeUp() {
        synchronized(monitor) {
            monitor.notifyAll()
        }
    }

    fun capacity(): Int {
        return buffer.size
    }

    fun isEmpty(): Boolean {
        return availableBytes() == 0
    }

    fun isFull(): Boolean {
        return remainingCapacity() == 0
    }
}