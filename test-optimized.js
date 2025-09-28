#!/usr/bin/env node

/**
 * Quick Test for Optimized Server
 * Tests basic functionality after fixes
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function testHealth() {
    console.log('\n📊 Testing Health Endpoint...');
    
    try {
        const response = await fetch(`${BASE_URL}/api/health`);
        const data = await response.json();
        
        console.log('✅ Health Status:', data.status);
        console.log('   Services:');
        console.log('   - Server:', data.services.server ? '✅' : '❌');
        console.log('   - Speech:', data.services.speechService ? '✅' : '❌');
        console.log('   - AI Foundry:', data.services.aiFoundry ? '✅' : '❌');
        
        return data.status === 'healthy';
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        return false;
    }
}

async function testChat() {
    console.log('\n💬 Testing Chat Endpoint...');
    
    const sessionId = `test_${Date.now()}`;
    const message = 'Hello, can you help me understand Nepal constitution?';
    
    try {
        console.log(`   Sending: "${message}"`);
        
        const response = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Chat Response Received');
            console.log(`   Response: "${data.response.substring(0, 100)}..."`);
            console.log(`   Session ID: ${data.sessionId}`);
            
            // Test cache by sending same message
            console.log('\n   Testing cache with same message...');
            const startTime = Date.now();
            
            const response2 = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId })
            });
            
            const data2 = await response2.json();
            const duration = Date.now() - startTime;
            
            if (response2.ok && duration < 500) {
                console.log(`✅ Cache working! Response time: ${duration}ms`);
            } else {
                console.log(`⚠️  Cache might not be working. Response time: ${duration}ms`);
            }
            
            return true;
        } else {
            console.error('❌ Chat failed:', data.error);
            if (data.details) {
                console.error('   Details:', data.details);
            }
            return false;
        }
        
    } catch (error) {
        console.error('❌ Chat test failed:', error.message);
        return false;
    }
}

async function testMetrics() {
    console.log('\n📈 Testing Metrics Endpoint...');
    
    try {
        const response = await fetch(`${BASE_URL}/api/metrics`);
        const data = await response.json();
        
        console.log('✅ Metrics Retrieved');
        console.log(`   Total Requests: ${data.requests.total}`);
        console.log(`   Cache Hits: ${data.cache.hits}`);
        console.log(`   Cache Misses: ${data.cache.misses}`);
        console.log(`   Cache Hit Rate: ${(data.cache.hitRate * 100).toFixed(1)}%`);
        console.log(`   Active Sessions: ${data.sessions.active}`);
        
        return true;
    } catch (error) {
        console.error('❌ Metrics test failed:', error.message);
        return false;
    }
}

async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║            NRAI Voice Assistant - Quick Functionality Test      ║
╚════════════════════════════════════════════════════════════════╝
    `);
    
    console.log('🔍 Testing server at:', BASE_URL);
    
    // Check if server is running
    try {
        await fetch(BASE_URL);
    } catch (error) {
        console.error('\n❌ Server is not running!');
        console.log('   Please start the server with: npm run start:optimized');
        process.exit(1);
    }
    
    const tests = [];
    
    // Run tests
    tests.push(await testHealth());
    tests.push(await testChat());
    tests.push(await testMetrics());
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    
    const passed = tests.filter(t => t).length;
    const failed = tests.length - passed;
    
    console.log(`   ✅ Passed: ${passed}/${tests.length}`);
    if (failed > 0) {
        console.log(`   ❌ Failed: ${failed}/${tests.length}`);
    }
    
    if (passed === tests.length) {
        console.log('\n🎉 All tests passed! The optimized server is working correctly.');
        console.log('\nYou can now:');
        console.log('1. Open http://localhost:3001 to use the voice assistant');
        console.log('2. Open http://localhost:3001/dashboard.html to monitor performance');
        console.log('3. Try voice recording by pressing and holding the mic button');
    } else {
        console.log('\n⚠️  Some tests failed. Please check the errors above.');
    }
}

// Run tests
main().catch(console.error);
