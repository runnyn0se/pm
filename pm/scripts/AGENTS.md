# Scripts

Start and stop scripts for running Kanban Studio locally via Docker.

## Usage

Run from any directory — the scripts `cd` to the project root (`pm/`) automatically.

| Script        | Platform      | Action                                      |
|---------------|---------------|---------------------------------------------|
| `start.ps1`   | Windows (PS)  | Build image, run container on port 8000     |
| `start.bat`   | Windows (cmd) | Same                                        |
| `start.sh`    | Mac / Linux   | Same                                        |
| `stop.ps1`    | Windows (PS)  | Stop and remove the container               |
| `stop.bat`    | Windows (cmd) | Same                                        |
| `stop.sh`     | Mac / Linux   | Same                                        |

## Environment Variables

If a `.env` file exists in the project root (`pm/`), it is passed to the container via `--env-file .env`. Required variables (as of Part 8): `ANTHROPIC_API_KEY`.

## Container Details

- Image name: `kanban-studio`
- Container name: `kanban-studio`
- Port: `8000` (host) → `8000` (container)
