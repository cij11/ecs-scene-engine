A ticket is done when:

- Acceptance criteria satisfied
- Testing scenarios pass
- Build succeeds
- API has error handling
  - 2xx Success
  - 4xx Client/Consumer error
  - 5xx Server/Producer error
- Tests
  - Low level logic has unit tests
  - High level logic has integration tests
  - Gameplay scenarios have "realtime" tests, where the simulation is run to verify correctness
