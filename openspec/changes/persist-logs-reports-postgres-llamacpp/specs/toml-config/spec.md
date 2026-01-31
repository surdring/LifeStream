## ADDED Requirements

### Requirement: Load configuration from project-root config.toml
The system MUST load runtime configuration from a TOML file located at the project root path `config.toml`.

#### Scenario: Backend starts and config.toml exists
- **WHEN** the backend process starts and `config.toml` exists at the configured path
- **THEN** the backend SHALL load configuration values from the file

### Requirement: Configuration includes PostgreSQL connection settings
The configuration MUST contain sufficient PostgreSQL connection information to connect to the local database.

#### Scenario: Postgres configuration is present
- **WHEN** `config.toml` provides PostgreSQL connection settings
- **THEN** the backend SHALL be able to construct a connection and attempt to connect during startup

### Requirement: Configuration includes llama.cpp server settings
The configuration MUST contain llama.cpp server information required to generate reports.

#### Scenario: Llama configuration is present
- **WHEN** `config.toml` provides llama.cpp server settings (e.g., baseUrl and model)
- **THEN** the backend SHALL be able to call the configured server during report generation

### Requirement: Fail-fast on missing or invalid configuration
The system MUST fail-fast with a clear error message if required configuration is missing or invalid.

#### Scenario: config.toml is missing
- **WHEN** the backend starts and cannot find `config.toml`
- **THEN** it SHALL fail to start and provide an error describing the expected file location

#### Scenario: Required fields are missing
- **WHEN** the backend starts and required fields are missing from `config.toml`
- **THEN** it SHALL fail to start and provide an error listing the missing fields

### Requirement: Do not require environment-based config separation
The system MUST NOT require separate environment-specific configuration files (e.g., dev/prod) for this change.

#### Scenario: Single config.toml is used
- **WHEN** the system is started
- **THEN** it SHALL use the single `config.toml` file as the source of configuration
