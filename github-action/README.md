# Visual QA GitHub Action Usage

## Quick Start

Add to `.github/workflows/visual-qa.yml`:

```yaml
name: Visual QA

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        description: Test mode
        options: [test, baseline]
        default: test

jobs:
  visual-qa:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Visual QA
        uses: ./github-action  # or your-org/visual-qa-agent@main
        with:
          mode: ${{ github.event.inputs.mode || 'test' }}
          ai_enabled: 'true'
          comment_on_pr: 'true'
          upload_artifacts: 'true'
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Notify on Failure
        if: failure()
        run: |
          echo "Visual QA failed - check artifacts and PR comments"
```

## Configuration

### Secrets Required
- `DATABASE_URL` (optional) - PostgreSQL connection string for persistence

### Inputs
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | choice | `test` | `test` or `baseline` |
| `pages` | string | `all` | Comma-separated page names |
| `ai_enabled` | boolean | `true` | Enable AI analysis |
| `ollama_model` | string | `llama3.2-vision:11b` | Ollama model |
| `fail_on_regression` | boolean | `true` | Fail workflow on regression |
| `comment_on_pr` | boolean | `true` | Post PR comment |
| `upload_artifacts` | boolean | `true` | Upload baselines, diffs, reports |

## Example: Baseline Update Workflow

```yaml
name: Update Baselines

on:
  workflow_dispatch:
    inputs:
      pages:
        type: string
        description: Pages to update (comma-separated)
        required: false

jobs:
  update-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Update Baselines
        uses: ./github-action
        with:
          mode: baseline
          pages: ${{ github.event.inputs.pages || 'all' }}
          ai_enabled: 'false'
```

## Example: Scheduled Nightly Tests

```yaml
name: Nightly Visual Regression

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC
  workflow_dispatch:

jobs:
  nightly-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Nightly Visual QA
        uses: ./github-action
        with:
          mode: test
          ai_enabled: 'true'
          comment_on_pr: 'false'  # No PR for scheduled runs
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Local Testing

```bash
# Install action toolkit
npm install -g @vercel/ncc

# Build action
cd github-action
ncc build action.yml -o dist

# Test locally with act
act push -s GITHUB_TOKEN=<token>
```