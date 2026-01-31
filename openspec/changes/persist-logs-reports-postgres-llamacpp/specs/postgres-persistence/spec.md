## ADDED Requirements

### Requirement: Persist logs and reports in PostgreSQL
The system MUST persist logs and reports in a local PostgreSQL database as the authoritative source of truth.

#### Scenario: Backend starts with PostgreSQL configured
- **WHEN** the backend process starts and PostgreSQL configuration is present
- **THEN** it SHALL establish a connection to PostgreSQL and be able to perform read/write operations

### Requirement: Logs schema includes dateKey and required fields
The system MUST store each log entry with at least: `id`, `dateKey (YYYY-MM-DD)`, `timestamp`, `content`, and `tags`.

#### Scenario: Store a log entry with dateKey
- **WHEN** a log entry is created with a `dateKey` value in `YYYY-MM-DD` format
- **THEN** the system SHALL persist the entry with the same `dateKey` value and return it in subsequent queries

### Requirement: Reports schema includes required fields
The system MUST store each report with at least: `id`, `type`, `periodStart`, `periodEnd`, `content`, and `createdAt`.

#### Scenario: Store a generated report
- **WHEN** a report is generated for a period
- **THEN** the system SHALL persist the report with the specified fields and return it in the reports list endpoint

### Requirement: Query logs by inclusive date range
The system MUST support querying log entries by an inclusive date range based on `dateKey`.

#### Scenario: Query logs across multiple days
- **WHEN** the client queries `start=YYYY-MM-DD` and `end=YYYY-MM-DD`
- **THEN** the system SHALL return all logs whose `dateKey` is between `start` and `end` inclusive

### Requirement: Log entries are returned in deterministic order
The system MUST return log entries in deterministic order suitable for prompt construction.

#### Scenario: Return logs ordered by timestamp ascending
- **WHEN** the client queries logs for a period
- **THEN** the system SHALL return logs ordered by `timestamp` ascending

### Requirement: Prevent unintended duplicate reports for same period
The system MUST prevent creating multiple persisted reports for the same `(type, periodStart, periodEnd)` unless an explicit overwrite policy is implemented.

#### Scenario: Generate report for an already-generated period
- **WHEN** a report exists for the given `(type, periodStart, periodEnd)` and the client requests generation again
- **THEN** the system SHALL respond deterministically by either returning the existing report or failing with a clear conflict error

### Requirement: Database initialization is provided
The system MUST provide a database initialization mechanism to ensure required tables exist.

#### Scenario: First run creates missing tables
- **WHEN** the backend starts against an empty database
- **THEN** it SHALL create the required tables (or fail with a clear error that instructs how to initialize)
