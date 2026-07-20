# react-native-nitro-realtime-audio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![React Native](https://img.shields.io/badge/React%20Native-0.76+-61DAFB?logo=react)
![Expo](https://img.shields.io/badge/Expo-Development%20Build-000020?logo=expo)
![Nitro Modules](https://img.shields.io/badge/Nitro-Modules-00C853)

A high-performance real-time audio streaming library for React Native, powered by
[Nitro Modules](https://nitro.margelo.com/).

It captures microphone audio with ultra-low latency and streams raw **16-bit Linear PCM**
audio directly to JavaScript as standard `ArrayBuffer` objects.

Designed for modern real-time audio applications such as:

- 🤖 AI Voice Assistants (OpenAI Realtime, Gemini Live)
- 🗣️ Speech-to-Text
- 🌐 WebRTC & VoIP
- 📈 Audio Visualizers
- 🎛️ Digital Signal Processing (DSP)
- 🎤 Voice Activity Detection (VAD)

Unlike traditional recording libraries that primarily save audio files, this library is built for **real-time audio streaming**, allowing every audio chunk to be processed immediately in JavaScript.

Works with **Expo Development Builds**, **EAS Build**, and **React Native CLI** projects.

---

# Features

- ⚡ Powered by Nitro Modules for extremely low-overhead native-to-JS communication
- 🎙️ Real-time microphone audio streaming
- 📦 Streams raw 16-bit PCM audio as standard `ArrayBuffer`
- 🔄 Automatic native audio resampling
- 🎚️ Configurable sample rate, channels, and chunk duration
- 📱 Native support for Android and iOS
- 🚀 Compatible with Expo Development Builds and React Native CLI
- 🧩 Ideal for AI, WebRTC, DSP, speech processing, and custom audio pipelines

---

# Architecture

```text
Microphone
      │
      ▼
Native Audio Recorder
      │
      ▼
Chunk Accumulator
      │
      ▼
PCM16 AudioChunk
      │
      ▼
ArrayBuffer
      │
      ▼
JavaScript Callback
```

---

# Why ArrayBuffer?

The library streams raw PCM audio as `ArrayBuffer` instead of Base64 strings or temporary audio files.

This provides:

- Lower memory overhead
- Lower latency
- No encoding/decoding overhead
- Standard JavaScript binary format
- Easy interoperability with AI SDKs, WebRTC, DSP libraries, and custom processing pipelines

---

# Installation

## Expo

```bash
npx expo install react-native-nitro-realtime-audio react-native-nitro-modules
```

Generate native projects if required:

```bash
npx expo prebuild
```

Then create an Expo Development Build or build with EAS.

---

## React Native CLI

```bash
npm install react-native-nitro-realtime-audio react-native-nitro-modules
```

or

```bash
yarn add react-native-nitro-realtime-audio react-native-nitro-modules
```

Install iOS dependencies:

```bash
cd ios
pod install
```

> **Note**
>
> `react-native-nitro-modules` is required as a peer dependency.

---

# Expo Support

This library is fully compatible with:

- ✅ Expo Development Build
- ✅ Expo Prebuild
- ✅ Expo Bare Workflow
- ✅ React Native CLI
- ✅ EAS Build

> **Important**
>
> Since this library contains native code, it **cannot run inside Expo Go**.
>
> Use an Expo Development Build or EAS Build instead.

---

# iOS Setup

Add the microphone usage description to your **Info.plist**

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app requires access to the microphone to record audio.</string>
```

---

# Android Setup

Add microphone permission to:

```
android/app/src/main/AndroidManifest.xml
```

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

---

# API Reference

## Permissions & Device Information

### `getPlatformName(): string`

Returns the current platform.

```ts
'iOS';
'Android';
```

---

### `getNativeSampleRate(): number`

Returns the device's native hardware sample rate.

Example:

```
48000
44100
```

---

### `getMicrophonePermissionStatus(): MicrophonePermissionStatus`

Returns one of:

```ts
'granted';
'denied';
'undetermined';
```

---

### `requestMicrophonePermission(): Promise<MicrophonePermissionStatus>`

Requests microphone permission from the user.

---

# Recording

## `startRecording(config: AudioRecordingConfig): void`

Starts recording microphone audio.

```ts
startRecording({
  sampleRate: 24000,
  channels: 1,
  chunkDurationMs: 100,
});
```

| Property        | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| sampleRate      | Target output sample rate. Native audio is automatically resampled if required. |
| channels        | `1` = Mono, `2` = Stereo                                                        |
| chunkDurationMs | Duration of each emitted audio chunk in milliseconds                            |

---

## `stopRecording(): void`

Stops recording and stops streaming audio chunks.

---

## `isRecording(): boolean`

Returns `true` if the native recorder is actively capturing audio.

---

## `getCapturedBufferCount(): number`

Returns the number of audio chunks captured during the current recording session.

Useful for debugging and validating streaming behaviour.

---

## `onAudioChunk(callback)`

Registers a callback that receives every PCM audio chunk.

```ts
onAudioChunk((buffer: ArrayBuffer) => {
  // buffer contains signed 16-bit PCM samples
});
```

The callback is invoked whenever a chunk is completed by the native recorder.

---

# Recommended Configurations

| Use Case          | Sample Rate | Channels | Chunk Duration |
| ----------------- | ----------: | -------: | -------------: |
| Voice AI          |       24000 |     Mono |         100 ms |
| Whisper           |       16000 |     Mono |         100 ms |
| WebRTC            |       48000 |     Mono |          20 ms |
| General Recording |      Native |   Stereo |         100 ms |

---

# Usage Example

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button } from 'react-native';

import {
  getMicrophonePermissionStatus,
  requestMicrophonePermission,
  startRecording,
  stopRecording,
  onAudioChunk,
  isRecording,
} from 'react-native-nitro-realtime-audio';

export default function AudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [chunksReceived, setChunksReceived] = useState(0);

  const recordedPcmChunks = useRef<Uint8Array[]>([]);

  useEffect(() => {
    onAudioChunk((buffer) => {
      recordedPcmChunks.current.push(new Uint8Array(buffer));

      setChunksReceived((count) => count + 1);

      const samples = new Int16Array(buffer);

      // Send to AI
      // websocket.send(buffer);

      // Visualize waveform

      // Apply DSP

      console.log(samples.length);
    });
  }, []);

  const start = async () => {
    let permission = getMicrophonePermissionStatus();

    if (permission !== 'granted') {
      permission = await requestMicrophonePermission();

      if (permission !== 'granted') {
        return;
      }
    }

    recordedPcmChunks.current = [];
    setChunksReceived(0);

    startRecording({
      sampleRate: 24000,
      channels: 1,
      chunkDurationMs: 100,
    });

    setRecording(isRecording());
  };

  const stop = () => {
    stopRecording();
    setRecording(isRecording());

    console.log(`Captured ${recordedPcmChunks.current.length} chunks`);
  };

  return (
    <View>
      <Text>{recording ? 'Recording...' : 'Stopped'}</Text>

      <Text>Chunks Received: {chunksReceived}</Text>

      <Button title="Start" onPress={start} disabled={recording} />

      <Button title="Stop" onPress={stop} disabled={!recording} />
    </View>
  );
}
```

---

# Example Application

The example application included in this repository demonstrates:

- 🎙️ Real-time microphone recording
- 📈 Live waveform visualization
- 📊 Live chunk statistics
- 📦 Raw PCM streaming
- 💾 WAV generation
- ▶️ Audio playback
- 📋 Recording summaries

It serves as both a demo application and a reference implementation for integrating the library.

---

# Notes

- Audio chunks contain **signed 16-bit Linear PCM** samples.
- Samples are stored in **little-endian** format.
- Audio is streamed as standard JavaScript `ArrayBuffer`.
- Recording **does not automatically save audio files**.
- Generate WAV files or encode MP3/AAC yourself using the streamed PCM data.
- Chunk size depends on the configured sample rate, channel count, and chunk duration.

---

# Best Practices

The example application stores every PCM chunk in memory so it can generate a WAV file after recording.

For production applications such as AI assistants, speech recognition, or WebRTC, process each chunk immediately instead of storing them all in memory.

Example:

```ts
onAudioChunk((buffer) => {
  websocket.send(buffer);
});
```

Streaming chunks immediately keeps memory usage low even during long recording sessions.

---

# Roadmap

- ✅ Real-time PCM recording
- ✅ Configurable recording
- ✅ Native audio resampling
- ✅ Real-time PCM streaming
- ⏳ PCM playback
- ⏳ Audio session configuration
- ⏳ Voice Activity Detection (VAD)
- ⏳ Echo cancellation
- ⏳ Noise suppression
- ⏳ Automatic Gain Control (AGC)

---

# Contributing

Contributions, bug reports, and feature requests are welcome.

Please read the [Contributing Guide](CONTRIBUTING.md) before opening a pull request.

---

# License

MIT

---

Built with ❤️ using **React Native Builder Bob (create-react-native-library)**.
