Set-Location (Join-Path $PSScriptRoot "..")

docker build -t kanban-studio .

$runArgs = @("-d", "--name", "kanban-studio", "-p", "8000:8000")
if (Test-Path ".env") { $runArgs += "--env-file", ".env" }
$runArgs += "kanban-studio"

docker run @runArgs
Write-Host "Kanban Studio running at http://localhost:8000"
