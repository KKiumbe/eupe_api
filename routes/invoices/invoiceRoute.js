const express = require('express');
const { verifyToken } = require('../../middleware/verifyToken.js');
const { getAllInvoices, generateInvoices, cancelInvoiceById, createInvoice, getInvoiceDetails, generateInvoicesByDay } = require('../../controller/bill/billGenerator.js');
const { SearchInvoices } = require('../../controller/bill/searchInvoice.js');
const { addSmsJob } = require('../../controller/bulkSMS/sendSMSJob.js');
const { cancelSystemGenInvoices } = require('../../controller/bill/cancelJob.js');
const checkAccess = require('../../middleware/roleVerify.js');

const router = express.Router();




router.get('/invoices/all', getAllInvoices );

router.get('/invoices/search',verifyToken,checkAccess('Invoice','read'), SearchInvoices)
router.get('/invoices/:id/',verifyToken,checkAccess('Invoice','read'), getInvoiceDetails)
router.put('/invoices/cancel/:invoiceId/', verifyToken, checkAccess('Invoice','update'), cancelInvoiceById);

// Route to create a manual invoice
router.post('/invoices', verifyToken, checkAccess('Invoice','create'),createInvoice);

router.post('/send-bulk-sms', addSmsJob);


// Route to generate invoices for all active customers for a specified month
router.post('/invoices/generate', verifyToken,checkAccess('Invoice','create'), generateInvoices);

router.post('/invoices-generate-day',checkAccess('Invoice','create'), generateInvoicesByDay)



// Route to cancel system-generated invoices for a specific customer and month
router.patch('/invoices/cancel',checkAccess('Invoice','update'), cancelSystemGenInvoices);


module.exports = router;
