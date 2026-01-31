## ADDED Requirements

### Requirement: Generate report content via local llama.cpp HTTP server
The system MUST generate report content by calling a locally deployed llama.cpp HTTP server.

#### Scenario: Report generation calls llama.cpp
- **WHEN** the client requests report generation for a period
- **THEN** the backend SHALL call the configured llama.cpp server and return generated Markdown content

### Requirement: Prompt is constructed from logs in chronological order
The system MUST construct the prompt input from the selected logs ordered by timestamp ascending.

#### Scenario: Build prompt from ordered logs
- **WHEN** logs are selected for a report period
- **THEN** the backend SHALL format them in chronological order before sending to llama.cpp

### Requirement: Support language parameter for generation
The system MUST accept a language parameter (`en` or `zh`) and generate the report accordingly.

#### Scenario: Generate Chinese report
- **WHEN** the client requests report generation with `language=zh`
- **THEN** the backend SHALL instruct the model to output Simplified Chinese headers and content

#### Scenario: Generate English report
- **WHEN** the client requests report generation with `language=en`
- **THEN** the backend SHALL instruct the model to output English headers and content

### Requirement: Handle llama.cpp failures with diagnosable errors
The system MUST handle llama.cpp communication failures and return diagnosable errors to the client.

#### Scenario: llama.cpp server is unreachable
- **WHEN** the backend cannot reach the configured llama.cpp server
- **THEN** it SHALL return an error response indicating the model service is unavailable

#### Scenario: llama.cpp returns invalid response
- **WHEN** llama.cpp returns a response that cannot be parsed into generated text
- **THEN** the backend SHALL return an error response indicating an invalid model response

### Requirement: Persist generated report after successful generation
The system MUST persist the generated report content to PostgreSQL after successful generation.

#### Scenario: Generated report is saved
- **WHEN** llama.cpp returns generated content successfully
- **THEN** the backend SHALL persist the report and return the persisted report record to the client
