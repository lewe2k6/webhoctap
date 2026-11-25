$previousPreview = $env:VITE_PRIVATE_PREVIEW
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $env:VITE_PRIVATE_PREVIEW = '1'
    node ./node_modules/vite/bin/vite.js --host 127.0.0.1
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    $env:VITE_PRIVATE_PREVIEW = $previousPreview
    Pop-Location
}
