/**
 * Performance Comparison Script
 * Tests the difference between regular and optimized servers
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

const BASE_URL = 'http://localhost:3001';
const TEST_MESSAGES = [
    'Hello',
    'What can you help me with?',
    'Tell me about Nepal constitution',
    'नेपालको संविधान बारे बताउनुहोस्',
    'What are the fundamental rights?'
];

class PerformanceTester {
    constructor() {
        this.results = {
            regular: [],
            optimized: [],
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Test text chat endpoint
     */
    async testTextChat(message, sessionId) {
        const startTime = performance.now();
        
        try {
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId })
            });
            
            const data = await response.json();
            const endTime = performance.now();
            
            return {
                success: response.ok,
                duration: endTime - startTime,
                cached: data.cached || false
            };
        } catch (error) {
            return {
                success: false,
                duration: performance.now() - startTime,
                error: error.message
            };
        }
    }

    /**
     * Test health endpoint
     */
    async testHealth() {
        const startTime = performance.now();
        
        try {
            const response = await fetch(`${BASE_URL}/api/health`);
            const data = await response.json();
            const endTime = performance.now();
            
            return {
                success: response.ok,
                duration: endTime - startTime,
                status: data.status,
                metrics: data.metrics
            };
        } catch (error) {
            return {
                success: false,
                duration: performance.now() - startTime,
                error: error.message
            };
        }
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        try {
            const response = await fetch(`${BASE_URL}/api/cache/stats`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            // Regular server doesn't have cache endpoint
            return null;
        }
    }

    /**
     * Run performance tests
     */
    async runTests(serverType = 'regular') {
        console.log(`\n📊 Testing ${serverType.toUpperCase()} Server...`);
        console.log('=' .repeat(50));
        
        const sessionId = `test_${Date.now()}`;
        const results = [];
        
        // Test 1: Health check
        console.log('\n1️⃣ Health Check Test');
        const healthResult = await this.testHealth();
        console.log(`   Response time: ${healthResult.duration.toFixed(2)}ms`);
        if (healthResult.metrics) {
            console.log(`   Active sessions: ${healthResult.metrics.activeSessions}`);
            console.log(`   Memory usage: ${Math.round(healthResult.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
        }
        
        // Test 2: Cold requests (no cache)
        console.log('\n2️⃣ Cold Request Tests (First Time)');
        for (const message of TEST_MESSAGES) {
            const result = await this.testTextChat(message, sessionId);
            results.push(result);
            console.log(`   "${message.substring(0, 30)}...": ${result.duration.toFixed(2)}ms`);
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Test 3: Warm requests (should hit cache on optimized)
        console.log('\n3️⃣ Warm Request Tests (Repeated)');
        for (const message of TEST_MESSAGES.slice(0, 3)) {
            const result = await this.testTextChat(message, sessionId);
            results.push(result);
            const cacheStatus = result.cached ? '✅ CACHED' : '❌ NOT CACHED';
            console.log(`   "${message.substring(0, 30)}...": ${result.duration.toFixed(2)}ms ${cacheStatus}`);
            
            if (result.cached) {
                this.results.cacheHits++;
            } else {
                this.results.cacheMisses++;
            }
        }
        
        // Test 4: Concurrent requests
        console.log('\n4️⃣ Concurrent Request Test (5 simultaneous)');
        const concurrentPromises = TEST_MESSAGES.slice(0, 5).map(msg => 
            this.testTextChat(msg, `concurrent_${Date.now()}`)
        );
        
        const concurrentStartTime = performance.now();
        const concurrentResults = await Promise.all(concurrentPromises);
        const concurrentEndTime = performance.now();
        
        const avgConcurrentTime = concurrentResults.reduce((sum, r) => sum + r.duration, 0) / concurrentResults.length;
        console.log(`   Total time: ${(concurrentEndTime - concurrentStartTime).toFixed(2)}ms`);
        console.log(`   Average per request: ${avgConcurrentTime.toFixed(2)}ms`);
        
        // Test 5: Cache stats (optimized only)
        if (serverType === 'optimized') {
            console.log('\n5️⃣ Cache Statistics');
            const cacheStats = await this.getCacheStats();
            if (cacheStats) {
                console.log(`   Response cache: ${cacheStats.responseCache.size}/${cacheStats.responseCache.maxSize}`);
                console.log(`   Language cache: ${cacheStats.languageCache.size}/${cacheStats.languageCache.maxSize}`);
                console.log(`   Total cache size: ${cacheStats.totalSize}`);
            }
        }
        
        // Store results
        this.results[serverType] = results;
        
        return results;
    }

    /**
     * Compare results
     */
    compareResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PERFORMANCE COMPARISON RESULTS');
        console.log('='.repeat(60));
        
        // Calculate averages
        const regularAvg = this.calculateAverage(this.results.regular);
        const optimizedAvg = this.calculateAverage(this.results.optimized);
        
        // Calculate improvements
        const improvement = ((regularAvg - optimizedAvg) / regularAvg * 100).toFixed(1);
        const speedup = (regularAvg / optimizedAvg).toFixed(2);
        
        console.log('\n📈 Response Time Comparison:');
        console.log(`   Regular Server:   ${regularAvg.toFixed(2)}ms average`);
        console.log(`   Optimized Server: ${optimizedAvg.toFixed(2)}ms average`);
        console.log(`   Improvement:      ${improvement}% faster`);
        console.log(`   Speedup:          ${speedup}x`);
        
        console.log('\n💾 Cache Performance:');
        const hitRate = this.results.cacheHits + this.results.cacheMisses > 0
            ? (this.results.cacheHits / (this.results.cacheHits + this.results.cacheMisses) * 100).toFixed(1)
            : 0;
        console.log(`   Cache Hits:   ${this.results.cacheHits}`);
        console.log(`   Cache Misses: ${this.results.cacheMisses}`);
        console.log(`   Hit Rate:     ${hitRate}%`);
        
        console.log('\n🎯 Performance Metrics:');
        console.log(`   Requests Tested: ${this.results.regular.length + this.results.optimized.length}`);
        console.log(`   Success Rate:    ${this.calculateSuccessRate()}%`);
        
        // Detailed breakdown
        console.log('\n📊 Detailed Breakdown:');
        console.log('   Request Type         | Regular  | Optimized | Improvement');
        console.log('   ---------------------|----------|-----------|------------');
        
        const categories = {
            'Cold (first 5)': { regular: this.results.regular.slice(0, 5), optimized: this.results.optimized.slice(0, 5) },
            'Warm (repeated)': { regular: this.results.regular.slice(5, 8), optimized: this.results.optimized.slice(5, 8) }
        };
        
        for (const [category, data] of Object.entries(categories)) {
            const regAvg = this.calculateAverage(data.regular);
            const optAvg = this.calculateAverage(data.optimized);
            const catImprovement = ((regAvg - optAvg) / regAvg * 100).toFixed(1);
            
            console.log(`   ${category.padEnd(20)} | ${regAvg.toFixed(0).padStart(7)}ms | ${optAvg.toFixed(0).padStart(9)}ms | ${catImprovement.padStart(9)}%`);
        }
        
        console.log('\n✨ Summary:');
        if (improvement > 30) {
            console.log('   🚀 EXCELLENT: Optimizations are highly effective!');
        } else if (improvement > 15) {
            console.log('   ✅ GOOD: Optimizations are working well.');
        } else if (improvement > 0) {
            console.log('   📈 MODERATE: Some improvement observed.');
        } else {
            console.log('   ⚠️  No significant improvement detected.');
        }
    }

    /**
     * Calculate average duration
     */
    calculateAverage(results) {
        if (results.length === 0) return 0;
        const sum = results.reduce((total, r) => total + (r.duration || 0), 0);
        return sum / results.length;
    }

    /**
     * Calculate success rate
     */
    calculateSuccessRate() {
        const allResults = [...this.results.regular, ...this.results.optimized];
        const successful = allResults.filter(r => r.success).length;
        return ((successful / allResults.length) * 100).toFixed(1);
    }
}

// Main execution
async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║          NRAI Voice Assistant Performance Tester           ║
╚════════════════════════════════════════════════════════════╝
    `);
    
    const tester = new PerformanceTester();
    
    console.log('📋 Test Configuration:');
    console.log(`   Server URL: ${BASE_URL}`);
    console.log(`   Test Messages: ${TEST_MESSAGES.length}`);
    console.log(`   Test Categories: Health, Cold, Warm, Concurrent`);
    
    try {
        // Check if server is running
        console.log('\n🔍 Checking server availability...');
        const healthCheck = await fetch(`${BASE_URL}/api/health`);
        if (!healthCheck.ok) {
            throw new Error('Server is not responding');
        }
        
        // Determine server type
        const metricsCheck = await fetch(`${BASE_URL}/api/metrics`).catch(() => null);
        const isOptimized = metricsCheck && metricsCheck.ok;
        const serverType = isOptimized ? 'optimized' : 'regular';
        
        console.log(`✅ Server detected: ${serverType.toUpperCase()}`);
        
        // Run tests for current server
        await tester.runTests(serverType);
        
        // Ask to test the other server
        console.log('\n' + '='.repeat(60));
        console.log(`⚠️  To compare performance, please:`);
        console.log(`   1. Stop the current server (Ctrl+C)`);
        console.log(`   2. Start the ${isOptimized ? 'REGULAR' : 'OPTIMIZED'} server:`);
        console.log(`      npm run start${isOptimized ? '' : ':optimized'}`);
        console.log(`   3. Run this test again`);
        console.log('='.repeat(60));
        
        // If we have both results (from a previous run), compare them
        if (tester.results.regular.length > 0 && tester.results.optimized.length > 0) {
            tester.compareResults();
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.log('\nPlease make sure the server is running:');
        console.log('   npm run start:optimized');
    }
}

// Run the tests
main().catch(console.error);
