## E2E Smoke Tests

Run:

```bash
npm run test:e2e
```

Default assumptions:

- Backend is running at `http://localhost:5000`
- API base is `http://localhost:5000/api`

Optional env vars for authenticated invite lifecycle:

- `E2E_TEACHER_TOKEN`
- `E2E_DEPARTMENT_ID`
- `E2E_YEAR` (default `FY`)
- `E2E_DIVISION` (default `A`)
