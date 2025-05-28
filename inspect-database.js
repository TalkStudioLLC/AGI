#!/usr/bin/env node

/**
 * Database Inspector
 * 
 * Shows exactly what's in the memory database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function inspectDatabase() {
    console.log('🔍 Database Inspector\n');
    
    const dbPath = path.join(__dirname, 'memory.db');
    console.log(`📁 Database path: ${dbPath}`);
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log('✅ Database connected\n');
            
            // Get all memories
            db.all('SELECT * FROM memories ORDER BY timestamp DESC', (err, rows) => {
                if (err) {
                    console.error('❌ Error querying memories:', err);
                    db.close();
                    reject(err);
                    return;
                }
                
                console.log(`📊 Found ${rows.length} memories in database:\n`);
                
                if (rows.length === 0) {
                    console.log('   🚫 Database is empty!');
                } else {
                    rows.forEach((row, index) => {
                        const date = new Date(row.timestamp).toLocaleString();
                        console.log(`${index + 1}. ID: ${row.id}`);
                        console.log(`   Content: "${row.content}"`);
                        console.log(`   Context: ${row.context}`);
                        console.log(`   Type: ${row.type}`);
                        console.log(`   Timestamp: ${date}`);
                        console.log(`   Emotional Weight: ${row.emotional_weight}`);
                        console.log('');
                    });
                }
                
                // Check for specific coffee memory
                db.all("SELECT * FROM memories WHERE content LIKE '%coffee%'", (err, coffeeRows) => {
                    if (err) {
                        console.error('❌ Error searching for coffee:', err);
                    } else {
                        console.log(`☕ Coffee-related memories: ${coffeeRows.length}`);
                        coffeeRows.forEach(row => {
                            console.log(`   "${row.content}" (${row.context})`);
                        });
                    }
                    
                    // Check database schema
                    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
                        if (err) {
                            console.error('❌ Error getting tables:', err);
                        } else {
                            console.log(`\n📋 Database tables:`);
                            tables.forEach(table => {
                                console.log(`   - ${table.name}`);
                            });
                        }
                        
                        db.close();
                        resolve();
                    });
                });
            });
        });
    });
}

if (require.main === module) {
    inspectDatabase().then(() => {
        console.log('\n✅ Database inspection completed');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Inspection failed:', error);
        process.exit(1);
    });
}

module.exports = { inspectDatabase };
