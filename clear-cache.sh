#!/bin/bash
# Clear cache script

echo "Clearing NRAI Voice Assistant cache..."

# Clear cache via API endpoint
curl -X POST http://localhost:3001/api/cache/clear

echo ""
echo "Cache cleared successfully!"
echo "You can now test with fresh responses."
