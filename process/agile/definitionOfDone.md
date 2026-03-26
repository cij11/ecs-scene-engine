A ticket is done when:

## All tickets

- Acceptance criteria satisfied
- Testing scenarios pass
- Build succeeds
- Tests
  - Low level logic has unit tests
  - High level logic has integration tests
  - Gameplay scenarios have "realtime" tests, where the simulation is run to verify correctness

## Tickets with API surface

- API has error handling
  - 2xx Success
  - 4xx Client/Consumer error
  - 5xx Server/Producer error

## Tickets with visual output

- Visual verification performed — the developer has actually looked at the rendered output
- Screenshot captured and included in the ticket or demo folder
- Visual output matches the acceptance criteria (not just "it renders something")
- Camera, lighting, and scene composition allow the feature to be clearly seen
- If the ticket introduces movement or animation, it has been observed running for at least 10 seconds

## Sprint completion

- A sprint cannot be closed until the demo has been reviewed and accepted by a stakeholder
- Demo must be validated before presentation — the developer runs the demo, verifies it visually, and documents what they see
- If the demo does not adequately demonstrate the sprint's deliverables, the sprint stays open until it does
