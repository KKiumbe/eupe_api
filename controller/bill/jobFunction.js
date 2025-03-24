

const schedule = require('node-schedule');
const { generateInvoices } = require('./billGenerator.js');

// Function to schedule invoice generation
function scheduleInvoices() {
  schedule.scheduleJob('0 0 1 * *', async () => {
    console.log('Running scheduled job to generate invoices...');
    try {
      await generateInvoices();
      console.log('Invoice generation job completed successfully.');
    } catch (error) {
      console.error('Error during invoice generation job:', error);
    }
  });
  console.log('Invoice generation job scheduled to run on the 1st of each month at midnight.');
}

module.exports = { scheduleInvoices };