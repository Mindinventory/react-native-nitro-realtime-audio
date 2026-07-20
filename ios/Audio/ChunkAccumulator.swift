import Foundation
import NitroModules


final class ChunkAccumulator {

    private var sampleBuffer: [Int16] = []
    private(set) var chunkCount = 0
    private var samplesPerChunk = 0
    var onChunk: ((AudioChunk) -> Void)?

    func configure(samplesPerChunk: Int) {
        self.samplesPerChunk = samplesPerChunk

        sampleBuffer.removeAll(keepingCapacity: true)
        sampleBuffer.reserveCapacity(samplesPerChunk * 4)

        chunkCount = 0
    }

    func reset() {
        sampleBuffer.removeAll()
        samplesPerChunk = 0
        chunkCount = 0
    }

    /// Appends raw Int16 samples and returns any completed chunks.
    func append(samples: [Int16]) {
        guard samplesPerChunk > 0 else { return }

        sampleBuffer.append(contentsOf: samples)


        while sampleBuffer.count >= samplesPerChunk {
            let chunkSamples = Array(sampleBuffer.prefix(samplesPerChunk))
            sampleBuffer.removeFirst(samplesPerChunk)
            let chunk = AudioChunk(samples: chunkSamples)
            chunkCount += 1 
            onChunk?(chunk)
        }
    }
}