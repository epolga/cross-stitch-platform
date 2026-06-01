# Pinterest AI Agent — Documentation Index

## Purpose

This document serves as the central navigation/index for the Pinterest AI Agent project documentation.

As the project grows, documentation is being split into specialized thematic documents to improve:

* maintainability

* navigation

* editing safety

* scalability

---

# Current Documents

Modularization is complete. The following thematic documents now exist in `plan/`:

## 1. Pinterest AI Agent — Milestones and Roadmap

Dedicated roadmap and implementation tracking document. Contains the milestone breakdown, timing estimates, implementation phases, completion status, future roadmap, and next planned work.

Status:

```text

Active

```

---

## 2. Pinterest AI Agent — API Integrations

Pinterest APIs, Google APIs, Anthropic API, planned Meta / Reddit / Google Ads integrations, OAuth flows, and token lifecycle management.

---

## 3. Pinterest AI Agent — AI Reasoning

Prompt engineering, recommendation structure, reasoning philosophy, confidence scoring, trend interpretation, and long-term optimization logic.

---

## 4. Pinterest AI Agent — WPF Uploader Integration

Uploader architecture, recommendation API contracts, publishing workflow, approval flow, and metadata generation.

---

## 5. Pinterest AI Agent — Memory and Trend Analysis

Historical memory design, trend calculations, anomaly detection, longitudinal business reasoning, and persistent intelligence concepts.

---

## 6. Pinterest AI Agent — Design-Level Intelligence

The design ↔ pin relationship, Version 1 of per-design analytics (pinmap / perf / ai:design), categorization strategy, the future data model, and the future creative intelligence loop with Stages 1-4.

---

## 7. Pinterest AI Agent — AWS Deployment

Lambda deployment, EventBridge scheduling, Secrets Manager, DynamoDB persistence, SES reporting, and operational automation.

---

## 8. Pinterest AI Agent — Practical Setup Notes

Tools to install on a fresh machine, the originally-suggested repo structure (kept as historical reference), and timeless strategic guardrails salvaged from the retired master doc: what NOT to build first, the "don't optimize for clicks alone" business warning, and the first useful AI prompt template.

---

## Retired

### Pinterest AI Agent — VS Code Technical Implementation Plan

The original 4,500-line master planning document, retired after its content was redistributed across the thematic docs above. Git history preserves the original full content.

Topic-to-doc mapping (where each original section went):

| Original topic | New home |
|---|---|
| High-level architecture, AWS components, IAM, deployment | AWS Deployment |
| DynamoDB schema, env vars, AI memory architecture, insights table, embeddings | Memory and Trend Analysis |
| Milestones 1-7, Phase 2 actions, recommended sequence | Milestones and Roadmap |
| AI agent role, scoring logic, AI memory principles, confidence scoring, learning loop, reasoning philosophy | AI Reasoning |
| Google OAuth, Pinterest API, Anthropic API, OAuth scopes, token strategy | API Integrations |
| WPF uploader, future uploader API contract, recommendation categories | WPF Uploader Integration |
| Design-level intelligence, pin ↔ design relationship, creative loop | Design-Level Intelligence |
| External platform applications (Meta, Reddit, etc.) | Milestones and Roadmap (Milestone 0) |
| Tools to install, original repo layout, "what not to build first", business warning, first AI prompt | Practical Setup Notes |

---

# Planned Future Documents

## Architecture

A dedicated cross-cutting architecture document is still planned. Until it exists, architecture content lives in AWS Deployment.md (target architecture). The original framing is preserved in the git history of the retired master doc.

Planned contents:

* system architecture

* AWS architecture

* Lambda structure

* service boundaries

* deployment strategy

---

# Current Project State

## Current achieved capabilities

```text

Pinterest Ads API

Pinterest per-pin organic analytics API

GA4 API

AdSense API

DynamoDB read access via scoped IAM user

Unified business reporting

Multi-day AI trend analysis (Claude Sonnet)

Design-level intelligence V1 (per-pin metrics merged with DynamoDB design data)

AI design recommendations (themes/styles/albums)

Operational recommendation generation

Persistent recommendation history

Automated daily execution via Windows Task Scheduler

```

---

## Current estimated progress

```text

~70% toward useful persistent intelligent advisor

```

---

## Remaining estimated effort

```text

~5–10 focused development days

```

for:

```text

memory

trend analysis

automation

email reporting

uploader recommendations

```

---

# Strategic Direction

The long-term goal is **AI-assisted multi-platform marketing intelligence with human supervision**, not fully autonomous marketing.

The canonical statement of this stance, with the reasoning behind it, lives in **AI Reasoning.md → Important Strategic Direction**.

