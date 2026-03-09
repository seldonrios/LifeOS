# Life Graph

## Purpose

Define the life graph as the central data model concept for personal context inside the Personal AI Node.

The life graph represents the user's life as connected entities and relationships rather than isolated app records.

## Candidate Databases

- Neo4j
- ArangoDB
- TypeDB

## Example Entity Types

- goals
- projects
- tasks
- people
- events
- resources
- skills
- health-related records
- inventory
- habits
- production systems

## Example Relationship Pattern

```text
Goal: Build Herb Business
|-- Skill: Hydroponics
|-- Resource: Grow Rack
|-- Event: Farmers Market
|-- Task: Plant Basil
`-- Task: Harvest
```

## Why It Matters

The life graph gives the reasoning engine and automation framework a shared representation of what matters to the user. It is the basis for planning, progress tracking, retrieval, and module coordination.

It also provides the structured inputs needed for simulation, economic planning, production forecasting, and social coordination.
