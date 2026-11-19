# Foodora Java Marketplace Platform

This is the isolated Java foundation for the full-scale Foodora marketplace. It does not replace the existing Node.js production application.

## Requirements
- JDK 21
- Maven 3.9+
- PostgreSQL will be introduced behind reviewed Flyway migrations in a later phase.

## Run
```bash
mvn test
mvn spring-boot:run
```

Health endpoint: `http://localhost:8081/actuator/health`

## Current scope
- Spring Boot application bootstrap
- Actuator health endpoint for deployment probes
- Java 21 build and CI test foundation

No production database credentials, payment credentials, or customer data belong in this module. Domain persistence and authentication are intentionally withheld until the legacy schema and identity flows have been mapped.
