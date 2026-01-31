## ADDED Requirements

### Requirement: Local backend service exposes HTTP API
The system MUST provide a local backend HTTP service that the browser-based frontend can call to persist and query logs and reports.

#### Scenario: Backend is running and reachable
- **WHEN** the backend process starts successfully
- **THEN** it SHALL listen on a configurable host/port and accept HTTP requests

### Requirement: Health check endpoint
The backend MUST expose a health endpoint for operational verification.

#### Scenario: Health check returns OK
- **WHEN** the client sends `GET /api/health`
- **THEN** the backend SHALL respond with HTTP 200 and a JSON body indicating the service is healthy

### Requirement: Logs range query endpoint
The backend MUST allow querying logs by date range using `dateKey` semantics.

#### Scenario: Query logs for a date range
- **WHEN** the client sends `GET /api/logs?start=YYYY-MM-DD&end=YYYY-MM-DD`
- **THEN** the backend SHALL return HTTP 200 with a JSON array of log entries within the inclusive range

### Requirement: Create log endpoint
The backend MUST allow creating a log entry that includes `dateKey (YYYY-MM-DD)`.

#### Scenario: Create a new log entry
- **WHEN** the client sends `POST /api/logs` with `content`, `timestamp`, `tags`, and `dateKey`
- **THEN** the backend SHALL persist the log and respond HTTP 201 with the created log entry (including its `id`)

### Requirement: Update and delete log endpoints
The backend MUST allow updating and deleting an existing log entry by id.

#### Scenario: Update a log entry
- **WHEN** the client sends `PUT /api/logs/:id` with updated fields
- **THEN** the backend SHALL persist the changes and respond HTTP 200 with the updated log

#### Scenario: Delete a log entry
- **WHEN** the client sends `DELETE /api/logs/:id`
- **THEN** the backend SHALL delete the log and respond HTTP 204

### Requirement: Reports list endpoint
The backend MUST allow listing existing reports, filterable by report type.

#### Scenario: List reports by type
- **WHEN** the client sends `GET /api/reports?type=WEEKLY|MONTHLY|YEARLY`
- **THEN** the backend SHALL respond HTTP 200 with a JSON array of reports matching the filter

### Requirement: Report generation endpoint
The backend MUST provide an endpoint to generate a report for a given period and persist it.

#### Scenario: Generate a report and persist it
- **WHEN** the client sends `POST /api/reports/generate` with `type`, `periodStart`, `periodEnd`, and `language`
- **THEN** the backend SHALL generate the report content via the configured LLM provider, persist it, and respond HTTP 201 with the created report

### Requirement: Error responses are JSON and use HTTP status codes
The backend MUST return JSON error payloads and appropriate HTTP status codes for invalid input and operational failures.

#### Scenario: Invalid request parameters
- **WHEN** the client sends a request with invalid or missing required parameters
- **THEN** the backend SHALL respond with HTTP 400 and a JSON error describing what is invalid
