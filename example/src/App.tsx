import { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  type GestureResponderEvent,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getPlatformName,
  getNativeSampleRate,
  getMicrophonePermissionStatus,
  requestMicrophonePermission,
  type MicrophonePermissionStatus,
  isRecording as getIsRecording,
  startRecording,
  stopRecording,
  onAudioChunk,
  PCMStreamer,
  NitroRealtimeAudio,
  initializePlayer,
} from '@mindinventory/react-native-nitro-realtime-audio';
import {
  type ChunkStats,
  pcmChunksToWav,
  uint8ArrayToBase64,
  calculateChunkStats,
  getWaveformData,
} from './audioUtils';
import { NETWORK_PROFILES } from './simulators/NetworkProfiles';
import { PCMNetworkSimulator } from './simulators/PCMNetworkSimulator';
import type { StreamingOptions } from './simulators/types';

interface RecordingSummary {
  durationSec: number;
  chunksCount: number;
  totalPcmBytes: number;
  avgChunkBytes: number;
  peakDb: number;
  avgRms: number;
}

const RECORDING_SAMPLE_RATE = 24000;
const RECORDING_CHANNELS = 1;
const RECORDING_CHUNK_DURATION = 20;

export default function App() {
  const platformName = getPlatformName();
  const nativeSampleRate = getNativeSampleRate();
  const [permission, setPermission] = useState<MicrophonePermissionStatus>(
    getMicrophonePermissionStatus()
  );
  const [recording, setRecording] = useState(getIsRecording());
  const [bufferCount, setBufferCount] = useState(0);
  const [stats, setStats] = useState<ChunkStats | null>(null);
  const [waveform, setWaveform] = useState<number[]>(new Array(40).fill(0));
  const [summary, setSummary] = useState<RecordingSummary | null>(null);
  const [seekbarWidth, setSeekbarWidth] = useState(0);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Keep track of accumulated chunks and generated audio file URI
  const chunksRef = useRef<Uint8Array[]>([]);
  const [wavUri, setWavUri] = useState<string | null>(null);

  const [pcmPlaying, setPcmPlaying] = useState(false);
  const pcmStreamerRef = useRef<PCMStreamer | null>(null);
  const pcmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for tracking overall recording stats
  const peakSampleRef = useRef(0);
  const accumulatedSumSqRef = useRef(0);
  const accumulatedSamplesRef = useRef(0);

  // Dynamically load the audio player hook when the WAV file URI becomes available
  const player = useAudioPlayer(wavUri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  useEffect(() => {
    return () => {
      if (pcmIntervalRef.current) {
        clearInterval(pcmIntervalRef.current);
      }
      pcmStreamerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    // Register the onAudioChunk callback
    onAudioChunk((arrayBuffer) => {
      // 1. Convert ArrayBuffer and collect it
      chunksRef.current.push(new Uint8Array(arrayBuffer));

      // 2. Perform live statistics check on the chunk
      const computedStats = calculateChunkStats(arrayBuffer);
      setStats(computedStats);

      // 3. Extract waveform data for visualization (oscilloscope style - append new points and slide)
      const newPoints = getWaveformData(arrayBuffer, 4);
      setWaveform((prev) => [...prev.slice(4), ...newPoints]);

      // 4. Update overall statistics trackers
      const pcm16 = new Int16Array(arrayBuffer);
      let chunkSumSq = 0;
      let chunkPeak = 0;
      for (let i = 0; i < pcm16.length; i++) {
        const val = pcm16[i] ?? 0;
        chunkSumSq += val * val;
        const absVal = Math.abs(val);
        if (absVal > chunkPeak) {
          chunkPeak = absVal;
        }
      }
      accumulatedSumSqRef.current += chunkSumSq;
      accumulatedSamplesRef.current += pcm16.length;
      if (chunkPeak > peakSampleRef.current) {
        peakSampleRef.current = chunkPeak;
      }

      setBufferCount((prev) => prev + 1);
    });
  }, []);

  const handleRequestPermission = async () => {
    try {
      const permStatus = await requestMicrophonePermission();
      setPermission(permStatus);
    } catch (error) {
      console.error('Failed to request permission:', error);
    }
  };

  const handleStartRecording = () => {
    try {
      handleStopPCM();
      if (playing) {
        player.pause();
      }

      chunksRef.current = [];
      setWavUri(null);
      setSummary(null);
      setBufferCount(0);
      setStats(null);
      setWaveform(new Array(40).fill(0));

      peakSampleRef.current = 0;
      accumulatedSumSqRef.current = 0;
      accumulatedSamplesRef.current = 0;

      startRecording({
        sampleRate: RECORDING_SAMPLE_RATE,
        channels: RECORDING_CHANNELS,
        chunkDurationMs: RECORDING_CHUNK_DURATION,
      });
      setRecording(getIsRecording());
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      stopRecording();
      setRecording(getIsRecording());

      // Generate the WAV file and write to local file system
      if (chunksRef.current.length > 0) {
        const totalPcmBytes = chunksRef.current.reduce(
          (s, c) => s + c.length,
          0
        );

        const wavBytes = pcmChunksToWav(
          chunksRef.current,
          RECORDING_SAMPLE_RATE,
          RECORDING_CHANNELS
        );

        const wavBase64 = uint8ArrayToBase64(wavBytes);

        const filename = `full_recording_${Date.now()}.wav`;
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, wavBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('WAV URI:', uri);

        const info = await FileSystem.getInfoAsync(uri);
        console.log('File Info:', info);

        // Compute summary metrics
        const durationSec =
          totalPcmBytes / (RECORDING_SAMPLE_RATE * RECORDING_CHANNELS * 2);
        const chunksCount = chunksRef.current.length;
        const avgChunkBytes =
          chunksCount > 0 ? Math.round(totalPcmBytes / chunksCount) : 0;

        const peakDb =
          peakSampleRef.current > 0
            ? 20 * Math.log10(peakSampleRef.current / 32768)
            : -100;

        const avgRms =
          accumulatedSamplesRef.current > 0
            ? Math.sqrt(
                accumulatedSumSqRef.current / accumulatedSamplesRef.current
              ) / 32768
            : 0;

        setSummary({
          durationSec,
          chunksCount,
          totalPcmBytes,
          avgChunkBytes,
          peakDb,
          avgRms,
        });

        setWavUri(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handlePlayPause = async () => {
    if (wavUri) {
      handleStopPCM();
      if (playing) {
        player.pause();
      } else {
        if (
          status.didJustFinish ||
          status.currentTime >= status.duration - 0.1
        ) {
          await player.seekTo(0);
        }
        player.play();
      }
    }
  };

  const handlePlayPCM = () => {
    if (chunksRef.current.length === 0) return;

    if (!pcmStreamerRef.current) {
      pcmStreamerRef.current = new PCMStreamer(NitroRealtimeAudio, {
        sampleRate: RECORDING_SAMPLE_RATE,
        channels: RECORDING_CHANNELS,
        chunkDurationMs: RECORDING_CHUNK_DURATION,
      });
    }

    if (pcmIntervalRef.current) {
      clearInterval(pcmIntervalRef.current);
      pcmIntervalRef.current = null;
    }

    initializePlayer({
      sampleRate: RECORDING_SAMPLE_RATE,
      channels: RECORDING_CHANNELS,
      bufferSize: 4096,
    });

    setPcmPlaying(true);

    // const sine = generateSineWavePCM16();

    // // split to 960-byte chunks

    // const chunks: Uint8Array[] = [];
    // for (let i = 0; i < sine.byteLength; i += 960) {
    //   chunks.push(new Uint8Array(sine.slice(i, i + 960)));
    // }

    // console.log('chunks', chunks.length);

    // for (const chunk of chunks) {
    //   pcmStreamerRef.current.enqueue(chunk.slice().buffer);
    // }
    // pcmStreamerRef.current.finish();

    // console.log('chunks', chunksRef.current.length);

    // let total = 0;

    // for (const chunk of chunksRef.current) {
    //   total += chunk.byteLength;
    // }

    // console.log('total', total);
    let totalBytes = 0;
    console.log('Recorded chunks:', chunksRef.current.length);

    const simulator = new PCMNetworkSimulator(
      NETWORK_PROFILES.jitter as StreamingOptions
    );

    simulator.start(chunksRef.current, (chunk) => {
      pcmStreamerRef.current?.enqueue(chunk.slice().buffer);
    });

    // for (const chunk of chunksRef.current) {
    //   totalBytes += chunk.byteLength;
    //   pcmStreamerRef.current.enqueue(chunk.slice().buffer);
    // }
    // console.log('Total recorded bytes:', totalBytes);
    pcmStreamerRef.current.finish();

    const durationMs =
      (totalBytes / (RECORDING_SAMPLE_RATE * RECORDING_CHANNELS * 2)) * 1000;

    pcmIntervalRef.current = setTimeout(() => {
      handleStopPCM();
    }, durationMs + 300); // 300ms padding to let final buffer finish playing
  };

  const handleStopPCM = () => {
    if (pcmIntervalRef.current) {
      clearTimeout(pcmIntervalRef.current);
      pcmIntervalRef.current = null;
    }
    pcmStreamerRef.current?.stop();
    setPcmPlaying(false);
  };

  const handlePCMPlayPause = () => {
    if (pcmPlaying) {
      handleStopPCM();
    } else {
      if (playing) {
        player.pause();
      }
      handlePlayPCM();
    }
  };

  const handleSeek = (e: GestureResponderEvent) => {
    if (seekbarWidth > 0 && status.duration > 0) {
      const touchX = e.nativeEvent.locationX;
      const percentage = Math.max(0, Math.min(1, touchX / seekbarWidth));
      const seekTarget = percentage * status.duration;
      player.seekTo(seekTarget);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>🎙️ Nitro Audio Realtime</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>System Info</Text>
          <Text style={styles.text}>
            Platform: <Text style={styles.bold}>{platformName}</Text>
          </Text>
          <Text style={styles.text}>
            Native Sample Rate:{' '}
            <Text style={styles.bold}>{nativeSampleRate} Hz</Text>
          </Text>
          <Text style={styles.text}>
            Permission:{' '}
            <Text
              style={[
                styles.bold,
                permission === 'granted' ? styles.success : styles.error,
              ]}
            >
              {permission}
            </Text>
          </Text>
          {permission !== 'granted' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleRequestPermission}
            >
              <Text style={styles.secondaryButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status Panel</Text>
          <View style={styles.statusIndicatorContainer}>
            <View
              style={[
                styles.statusDot,
                recording ? styles.statusDotActive : styles.statusDotInactive,
              ]}
            />
            <Text style={styles.statusText}>
              {recording ? 'Recording...' : 'Stopped'}
            </Text>
          </View>
          <Text style={styles.text}>
            Total Chunks Captured:{' '}
            <Text style={styles.bold}>{bufferCount}</Text>
          </Text>
        </View>

        {recording && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Live Waveform</Text>
            <View style={styles.waveformContainer}>
              {waveform.map((value, index) => {
                let barColor = '#10B981';
                if (value > 0.8) {
                  barColor = '#EF4444';
                } else if (value > 0.5) {
                  barColor = '#F59E0B';
                }
                return (
                  <View
                    key={index}
                    style={[
                      styles.waveformBar,
                      {
                        height: Math.max(4, value * 70),
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        )}

        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Live Chunk Stats</Text>
            <Text style={styles.text}>
              Byte Length:{' '}
              <Text style={styles.bold}>{stats.byteLength} bytes</Text>
            </Text>
            <Text style={styles.text}>
              Samples Count:{' '}
              <Text style={styles.bold}>{stats.samplesCount} samples</Text>
            </Text>
            <Text style={styles.text}>
              Min Sample Val: <Text style={styles.bold}>{stats.minSample}</Text>
            </Text>
            <Text style={styles.text}>
              Max Sample Val: <Text style={styles.bold}>{stats.maxSample}</Text>
            </Text>
            <Text style={styles.text}>
              RMS Amplitude: <Text style={styles.bold}>{stats.rms}</Text>
            </Text>
            <Text style={styles.text}>
              Decibels (dBFS): <Text style={styles.bold}>{stats.db} dB</Text>
            </Text>

            <View style={styles.volumeBarBg}>
              <View
                style={[
                  styles.volumeBarFill,
                  { width: `${Math.max(0, 100 + stats.db)}%` },
                ]}
              />
            </View>
          </View>
        )}

        {summary && wavUri && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Recording Summary</Text>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Duration</Text>
                <Text style={styles.statValue}>
                  {summary.durationSec.toFixed(1)} s
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Chunks</Text>
                <Text style={styles.statValue}>{summary.chunksCount}</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total PCM</Text>
                <Text style={styles.statValue}>
                  {(summary.totalPcmBytes / 1024).toFixed(0)} KB
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Average Chunk</Text>
                <Text style={styles.statValue}>
                  {summary.avgChunkBytes} bytes
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Peak dB</Text>
                <Text style={styles.statValue}>
                  {summary.peakDb.toFixed(1)}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Average RMS</Text>
                <Text style={styles.statValue}>
                  {summary.avgRms.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Seekbar and Countdown Timer */}
            <View style={styles.playerControlsContainer}>
              <TouchableWithoutFeedback onPress={handleSeek}>
                <View
                  style={styles.seekbarBg}
                  onLayout={(e) => setSeekbarWidth(e.nativeEvent.layout.width)}
                >
                  <View
                    style={[
                      styles.seekbarFill,
                      // eslint-disable-next-line react-native/no-inline-styles
                      {
                        width:
                          status.duration > 0
                            ? `${(status.currentTime / status.duration) * 100}%`
                            : '0%',
                      },
                    ]}
                  />
                </View>
              </TouchableWithoutFeedback>
              <View style={styles.timeLabelsContainer}>
                <Text style={styles.timeLabel}>
                  {formatTime(status.currentTime)}
                </Text>
                <Text style={styles.timeLabel}>
                  -
                  {formatTime(
                    Math.max(0, status.duration - status.currentTime)
                  )}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.playButton, playing && styles.playingButton]}
              onPress={handlePlayPause}
            >
              <Text style={styles.buttonText}>
                {playing ? '⏸️ Pause Audio' : '▶️ Play Audio'}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>🔊 PCM Streamer Playback</Text>
            <TouchableOpacity
              style={[styles.playButton, pcmPlaying && styles.playingButton]}
              onPress={handlePCMPlayPause}
            >
              <Text style={styles.buttonText}>
                {pcmPlaying ? '⏹️ Stop PCM Stream' : '▶️ Play PCM Stream'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.startButton,
              (recording || permission !== 'granted') && styles.disabledButton,
            ]}
            disabled={recording || permission !== 'granted'}
            onPress={handleStartRecording}
          >
            <Text style={styles.buttonText}>Start Recording</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.stopButton,
              !recording && styles.disabledButton,
            ]}
            disabled={!recording}
            onPress={handleStopRecording}
          >
            <Text style={styles.buttonText}>Stop Recording</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContainer: {
    padding: 24,
    alignItems: 'stretch',
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 8,
  },
  text: {
    fontSize: 16,
    color: '#CBD5E1',
    marginVertical: 4,
  },
  bold: {
    fontWeight: '600',
    color: '#F1F5F9',
  },
  success: {
    color: '#10B981',
  },
  error: {
    color: '#EF4444',
  },
  statusIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#EF4444',
  },
  statusDotInactive: {
    backgroundColor: '#64748B',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  volumeBarBg: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  button: {
    flex: 0.47,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  playButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  startButton: {
    backgroundColor: '#10B981',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  disabledButton: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    marginTop: 16,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  waveformContainer: {
    flexDirection: 'row',
    height: 80,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  statBox: {
    width: '48%',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  playingButton: {
    backgroundColor: '#D97706',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 12,
  },
  playerControlsContainer: {
    marginVertical: 12,
  },
  seekbarBg: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  seekbarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  timeLabelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
