# Clear cache PowerShell script

Write-Host "Clearing NRAI Voice Assistant cache..." -ForegroundColor Yellow

# Clear cache via API endpoint
$response = Invoke-WebRequest -Uri "http://localhost:3001/api/cache/clear" -Method POST

if ($response.StatusCode -eq 200) {
    Write-Host "`nCache cleared successfully!" -ForegroundColor Green
    Write-Host "You can now test with fresh responses." -ForegroundColor Cyan
} else {
    Write-Host "Failed to clear cache" -ForegroundColor Red
}
