# GreenSignal: EPA Compliance & Machine Change Evaluation Engine

An explainable, auditable compliance pipeline designed to evaluate proposed operational changes (such as new machinery installations) against site-specific permits and federal EPA baselines (**Title 40 of the eCFR**). 

The system strictly decouples **unstructured data extraction** (powered by Google Gemini) from **compliance decision-making** (handled by a pure, deterministic Python code engine) to ensure full traceability and auditability.

---

## Project Architecture

```text
epa_compliance_engine/
│
├── .env                  # API keys and secret configurations
├── requirements.txt      # Project dependencies
├── models.py             # Pydantic schemas for unified context data
├── extractors.py         # Gemini LLM-based structured data extraction
├── retriever.py          # eCFR API client for federal regulatory baselines
├── comparator.py         # Deterministic rule engine (Allow, Hold, Escalate, Block)
└── main.py               # Orchestration script tying the pipeline together