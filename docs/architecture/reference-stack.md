# Reference Stack

## Purpose

Describe a practical open-source software stack for a buildable Phase 1 LifeOS server without treating every tool choice as permanently locked.

## Deployment Approach

- Docker Compose by default
- Kubernetes only if the system grows beyond what a technically skilled individual can manage comfortably

## Core Service Categories

- reasoning engine
- event bus
- life graph database
- automation controller
- simulation service
- voice pipeline
- media routing
- dashboard and control surfaces

## Reference Technology Options

- reasoning: Ollama, vLLM, or LM Studio
- local models: Llama, Mistral, Qwen, Mixtral
- event bus: NATS, MQTT, RabbitMQ, or Kafka
- life graph database: Neo4j, ArangoDB, or TypeDB
- simulation: Python services using Monte Carlo or agent-based models
- automation and presence: Home Assistant, ESPHome, Bermuda BLE tracking
- telephony: VoIP provider, SIP trunk, Asterisk PBX

## Selection Rule

These are candidate tools for a realistic build path. The repository should stay specific enough to prototype, but flexible enough that contributors can compare options without rewriting the project vision.
