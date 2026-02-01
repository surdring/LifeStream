import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createPool } from '../server/db';
import { loadConfig } from '../server/config';

async function main() {
  const yes = process.argv.includes('--yes') || process.argv.includes('-y');
  const quiet = process.argv.includes('--quiet') || process.argv.includes('-q');

  if (!yes) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(
      'This will DELETE ALL rows from Postgres tables "logs" and "reports". Type "DELETE" to continue: '
    );
    rl.close();
    if (answer.trim() !== 'DELETE') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  const config = await loadConfig();
  const pool = createPool(config);

  try {
    await pool.query('BEGIN');
    await pool.query('TRUNCATE TABLE reports');
    await pool.query('TRUNCATE TABLE logs');
    await pool.query('COMMIT');

    if (!quiet) {
      console.log('Cleared Postgres tables: logs, reports');
      console.log('');
      console.log('Daily Cues and Todos are stored in browser localStorage.');
      console.log('To clear them, run the following in the browser DevTools console:');
      console.log('');
      console.log("localStorage.removeItem('ls_cues_by_date');");
      console.log("localStorage.removeItem('ls_todos');");
      console.log('location.reload();');
    }
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
