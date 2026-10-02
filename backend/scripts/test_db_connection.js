/**
 * CampusFix — Database Connection Diagnostics
 * Tests connectivity between Node.js and Microsoft SQL Server using db.js config.
 */

const { getPool, closePool, config } = require('../config/db');

async function testConnection() {
  console.log('=======================================================');
  console.log('[CampusFix DB Test] Testing SQL Server connectivity...');
  console.log(`[CampusFix DB Test] Target Server: ${config.server}:${config.port}`);
  console.log(`[CampusFix DB Test] Target Database: ${config.database}`);
  console.log(`[CampusFix DB Test] Target User: ${config.user}`);
  console.log('=======================================================');

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM dbo.Users) AS totalUsers,
        (SELECT COUNT(*) FROM dbo.Departments) AS totalDepartments,
        (SELECT COUNT(*) FROM dbo.Categories) AS totalCategories,
        (SELECT COUNT(*) FROM dbo.Complaints) AS totalComplaints
    `);

    console.log('[CampusFix DB Test] Connection SUCCESS!');
    console.log('[CampusFix DB Test] Database Summary:');
    console.table(result.recordset);

    await closePool();
    return true;
  } catch (err) {
    console.error('[CampusFix DB Test] FAILED to connect:');
    console.error(err.message);
    if (err.message.includes('Login failed for user')) {
      console.log('\n[Action Required] SQL Server is pending a service restart to activate Mixed Mode authentication.');
      console.log('Please run: Restart-Service MSSQLSERVER in PowerShell as Administrator.');
    }
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
