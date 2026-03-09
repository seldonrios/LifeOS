# Voice and Media

## Purpose

Describe the Phase 1 architecture for room awareness, voice interaction, receptionist flows, follow-me media, and smart displays.

## Room Awareness

The reference design uses BLE tracking nodes in rooms to infer who is where.

- room nodes: ESP32 devices
- software: ESPHome, Bermuda BLE tracking, Home Assistant
- inputs: phones, watches, BLE tags
- output example: `person_location(person=seldon, room=office, confidence=0.97)`

## Voice Pipeline

```text
microphone
-> speech-to-text
-> reasoning layer
-> text-to-speech
-> room speaker
```

Reference technologies include Whisper-class speech-to-text, local text-to-speech, DIY microphone arrays, and SIP or networked speakers.

## AI Receptionist

```text
VoIP provider
-> SIP trunk
-> Asterisk PBX
-> AI phone agent
```

Phase 1 receptionist capabilities can include:

- answering calls
- screening callers
- taking messages
- scheduling callbacks
- routing urgent calls

## Follow-Me Media

Media routing can follow the user's room context by moving or re-targeting streams when presence changes. This should be treated as a local automation and media-control problem, not a separate product.

## Smart Displays

Displays can present calendar context, production dashboards, alerts, or lightweight AI-rendered interfaces over TVs and room screens.
