#!/usr/bin/env node

/**
 * NRAI Voice Assistant - Startup Script
 * Checks environment and starts the optimized server
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if chalk is installed, if not use basic console
const log = {
    info: (msg) => console.log(chalk?.blue?.('ℹ') || 'ℹ', msg),
    success: (msg) => console.log(chalk?.green?.('✓') || '✓', msg),
    warning: (msg) => console.log(chalk?.yellow?.('⚠') || '⚠', msg),
    error: (msg) => console.log(chalk?.red?.('✗') || '✗', msg)
};

console.log(`
╔════════════════════════════════════════════════════════════════╗
║             NRAI Voice Assistant - Startup Script              ║
╚════════════════════════════════════════════════════════════════╝
`);

// Step 1: Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

if (majorVersion < 18) {
    log.error(`Node.js version ${nodeVersion} detected. Version 18+ required.`);
    process.exit(1);
}
log.success(`Node.js ${nodeVersion} detected`);

// Step 2: Check for .env file
const envPath = join(__dirname, '.env');
if (!existsSync(envPath)) {
    log.error('.env file not found!');
    log.info('Creating .env from .env.example...');
    
    const examplePath = join(__dirname, '.env.example');
    if (existsSync(examplePath)) {
        const exampleContent = readFileSync(examplePath, 'utf8');
        require('fs').writeFileSync(envPath, exampleContent);
        log.warning('Please edit .env with your Azure credentials');
        process.exit(1);
    } else {
        log.error('.env.example not found! Cannot create .env');
        process.exit(1);
    }
}
log.success('.env file found');

// Step 3: Load and validate environment variables
import('dotenv').then(({ default: dotenv }) => {
    dotenv.config();
    
    const requiredVars = [
        'AZURE_AGENT_ENDPOINT',
        'AZURE_AGENT_ID',
        'AZURE_API_KEY',
        'AZURE_REGION'
    ];
    
    const missingVars = requiredVars.filter(v => !process.env[v]);
    
    if (missingVars.length > 0) {
        log.error(`Missing required environment variables: ${missingVars.join(', ')}`);
        log.info('Please edit .env file with your Azure credentials');
        process.exit(1);
    }
    log.success('Environment variables validated');
    
    // Step 4: Check dependencies
    const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
    const requiredDeps = Object.keys(packageJson.dependencies);
    
    const nodeModulesPath = join(__dirname, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
        log.error('node_modules not found!');
        log.info('Running npm install...');
        
        const npmInstall = spawn('npm', ['install'], { 
            stdio: 'inherit',
            cwd: __dirname 
        });
        
        npmInstall.on('close', (code) => {
            if (code === 0) {
                log.success('Dependencies installed');
                startServer();
            } else {
                log.error('Failed to install dependencies');
                process.exit(1);
            }
        });
    } else {
        log.success('Dependencies found');
        startServer();
    }
});

function startServer() {
    // Step 5: Determine which server to start
    const useOptimized = process.argv.includes('--optimized') || 
                         process.env.USE_OPTIMIZED === 'true';
    
    const serverFile = useOptimized ? 'server-optimized.js' : 'server.js';
    
    log.info(`Starting ${useOptimized ? 'OPTIMIZED' : 'standard'} server...`);
    
    // Step 6: Start the server
    const serverProcess = spawn('node', [serverFile], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'production'
        }
    });
    
    serverProcess.on('error', (err) => {
        log.error(`Failed to start server: ${err.message}`);
        process.exit(1);
    });
    
    serverProcess.on('close', (code) => {
        if (code !== 0) {
            log.error(`Server exited with code ${code}`);
            
            // Attempt restart after 5 seconds
            log.info('Attempting restart in 5 seconds...');
            setTimeout(() => startServer(), 5000);
        }
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        log.info('\nShutting down gracefully...');
        serverProcess.kill('SIGTERM');
        setTimeout(() => process.exit(0), 1000);
    });
    
    process.on('SIGTERM', () => {
        serverProcess.kill('SIGTERM');
        process.exit(0);
    });
}

// Display help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node start.js [options]

Options:
  --optimized    Start the optimized server with caching and compression
  --help, -h     Show this help message

Environment Variables:
  USE_OPTIMIZED=true    Always use optimized server
  NODE_ENV=development  Set environment mode
  PORT=3001            Set server port

Examples:
  node start.js                # Start standard server
  node start.js --optimized    # Start optimized server
    `);
    process.exit(0);
}
